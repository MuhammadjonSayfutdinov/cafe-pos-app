-- Cafe POS: mijoz telefonidan QR-buyurtma (kirishsiz).
-- schema.sql dan KEYIN, SQL Editor'da bir marta ishga tushiring. Qayta ishga tushirish xavfsiz.
--
-- Xavfsizlik:
--  * Mijoz jadvallarni to'g'ridan-to'g'ri o'qiy olmaydi (RLS). Faqat shu funksiyalar ochiq.
--  * qr_menu faqat sotuvdagi taomlarning nomi, toifasi va narxini qaytaradi
--    (xodimlar, PIN, mijozlar, buyurtmalar ko'rinmaydi).
--  * Narx SERVERDA menyudan olinadi: telefondan kelgan narxga ishonilmaydi.
--  * Buyurtma darhol oshxonaga tushmaydi: ofitsiant/kassir "Qabul qilish" ni bosadi.
--  * Cheklov: bitta stoldan daqiqasiga 3 ta so'rov, umumiy daqiqasiga 60 ta.

-- Stol mavjudmi (pos_tables: ['1-Stol', ...] yoki [{name: '1-Stol'}, ...])
create or replace function public.qr_table_exists(p_table text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from pos_kv k, jsonb_array_elements(coalesce(k.value, '[]'::jsonb)) t
    where k.key = 'pos_tables'
      and jsonb_typeof(k.value) = 'array'
      and ((jsonb_typeof(t) = 'string' and t #>> '{}' = p_table) or t ->> 'name' = p_table)
  );
$$;

-- 1) Menyu: faqat sotuvdagi taomlar va kerakli maydonlar
create or replace function public.qr_menu(p_table text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_menu jsonb;
begin
  if not qr_table_exists(p_table) then
    raise exception 'Stol topilmadi: %', p_table;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.data -> 'id',
           'name', r.data -> 'name',
           'category', r.data -> 'category',
           'variants', coalesce(r.data -> 'variants', '[]'::jsonb),
           'price', r.data -> 'price',
           'description', r.data -> 'description',
           'is_available', true
         ) order by r.created_at), '[]'::jsonb)
    into v_menu
    from pos_records r
   where r.collection = 'pos_menu'
     and not r.deleted
     and coalesce(r.data ->> 'is_available', 'true') <> 'false';

  return jsonb_build_object(
    'table', p_table,
    'cafe_name', (select value from pos_kv where key = 'pos_cafe_name'),
    'service_fee', (select value from pos_kv where key = 'pos_service_fee'),
    'categories', (select value from pos_kv where key = 'pos_categories'),
    'menu', v_menu
  );
end;
$$;

-- 2) Buyurtma so'rovi: ofitsiant tasdiqlashini kutadi
create or replace function public.qr_submit_order(p_table text, p_items jsonb, p_note text default '')
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_item     jsonb;
  v_menu     jsonb;
  v_variants jsonb;
  v_variant  jsonb;
  v_qty      int;
  v_price    numeric;
  v_name     text;
  v_items    jsonb := '[]'::jsonb;
  v_sub      numeric := 0;
  v_idx      int := 0;
  v_recent   int;
  v_now_ms   bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_id       text;
begin
  if not qr_table_exists(p_table) then
    raise exception 'Stol topilmadi: %', p_table;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Savat noto''g''ri (1 dan 30 tagacha taom)';
  end if;

  select count(*) into v_recent from pos_records
   where collection = 'pos_qr_requests' and data ->> 'table' = p_table
     and created_at > now() - interval '1 minute';
  if v_recent >= 3 then
    raise exception 'Juda ko''p so''rov. Bir daqiqadan keyin qayta urinib ko''ring';
  end if;
  select count(*) into v_recent from pos_records
   where collection = 'pos_qr_requests' and created_at > now() - interval '1 minute';
  if v_recent >= 60 then
    raise exception 'Hozir so''rovlar juda ko''p. Ofitsiantni chaqiring';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    v_qty := case when (v_item ->> 'quantity') ~ '^[0-9]{1,3}$'
                  then least(greatest((v_item ->> 'quantity')::int, 1), 20) else 1 end;

    select r.data into v_menu from pos_records r
     where r.collection = 'pos_menu' and not r.deleted
       and r.id = v_item ->> 'menu_id'
       and coalesce(r.data ->> 'is_available', 'true') <> 'false';
    if v_menu is null then
      raise exception 'Taom topilmadi yoki tugagan. Menyuni yangilang';
    end if;

    v_variants := coalesce(v_menu -> 'variants', '[]'::jsonb);
    v_variant := null;
    if jsonb_typeof(v_variants) = 'array' and jsonb_array_length(v_variants) > 0 then
      if jsonb_array_length(v_variants) = 1 and coalesce(v_item ->> 'variant_name', '') = '' then
        v_variant := v_variants -> 0;
      else
        select v into v_variant from jsonb_array_elements(v_variants) v
         where v ->> 'name' = v_item ->> 'variant_name' limit 1;
      end if;
      if v_variant is null then
        raise exception 'Menyu o''zgargan. Sahifani yangilang';
      end if;
      v_price := coalesce((v_variant ->> 'price')::numeric, 0);
      v_name := case when jsonb_array_length(v_variants) > 1
                     then (v_menu ->> 'name') || ' (' || (v_variant ->> 'name') || ')'
                     else v_menu ->> 'name' end;
    else
      v_price := coalesce((v_menu ->> 'price')::numeric, 0);
      v_name := v_menu ->> 'name';
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'cartItemId', 'qr_' || v_now_ms || '_' || v_idx,
      'id', v_menu -> 'id',
      'name', v_name,
      'baseName', v_menu ->> 'name',
      'variantName', coalesce(v_variant ->> 'name', '1 porsiya'),
      'price', v_price,
      'quantity', v_qty,
      'note', left(coalesce(v_item ->> 'note', ''), 200),
      'category', v_menu ->> 'category'
    ));
    v_sub := v_sub + v_price * v_qty;
  end loop;

  v_id := 'qr_' || v_now_ms || '_' || substr(md5(random()::text), 1, 8);
  insert into pos_records (collection, id, data, updated_by)
  values ('pos_qr_requests', v_id, jsonb_build_object(
    'id', v_id,
    'table', p_table,
    'items', v_items,
    'subTotal', v_sub,
    'note', left(coalesce(p_note, ''), 300),
    'status', 'pending',
    'createdAt', v_now_ms,
    'time', to_char(now() at time zone 'Asia/Tashkent', 'HH24:MI')
  ), 'qr');

  return jsonb_build_object('ok', true, 'id', v_id, 'items', v_items, 'subTotal', v_sub);
end;
$$;

-- 3) Ofitsiantni chaqirish (bitta stoldan 30 soniyada bir marta)
create or replace function public.qr_call_waiter(p_table text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_id     text;
begin
  if not qr_table_exists(p_table) then
    raise exception 'Stol topilmadi: %', p_table;
  end if;
  if exists (select 1 from pos_records
              where collection = 'pos_calls' and not deleted and data ->> 'table' = p_table) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if exists (select 1 from pos_records
              where collection = 'pos_calls' and data ->> 'table' = p_table
                and created_at > now() - interval '30 seconds') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_id := 'call_qr_' || v_now_ms || '_' || substr(md5(random()::text), 1, 6);
  insert into pos_records (collection, id, data, updated_by)
  values ('pos_calls', v_id, jsonb_build_object(
    'id', v_id,
    'table', p_table,
    'time', to_char(now() at time zone 'Asia/Tashkent', 'HH24:MI'),
    'createdAt', v_now_ms,
    'source', 'qr'
  ), 'qr');
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 4) Mijoz o'z so'rovlarining holatini ko'radi (faqat id bo'yicha, ko'pi bilan 20 ta)
create or replace function public.qr_request_status(p_ids text[])
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.data ->> 'status')), '[]'::jsonb)
    from pos_records r
   where r.collection = 'pos_qr_requests'
     and r.id = any (p_ids[1:20]);
$$;

-- 5) Xodim so'rovni qabul qiladi yoki rad etadi (faqat ulangan qurilmalar).
--    Atomik: ikki xodim bir vaqtda bossa, faqat birinchisi oladi (buyurtma ikki marta tushmaydi).
create or replace function public.qr_claim_request(p_id text, p_status text, p_by text default '')
returns jsonb
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_data jsonb;
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Noto''g''ri holat: %', p_status;
  end if;
  update pos_records
     set data = data || jsonb_build_object(
           'status', p_status,
           'handledBy', left(coalesce(p_by, ''), 100),
           'handledAt', floor(extract(epoch from clock_timestamp()) * 1000)),
         updated_by = 'claim'
   where collection = 'pos_qr_requests' and id = p_id and data ->> 'status' = 'pending'
  returning data into v_data;
  if v_data is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'request', v_data);
end;
$$;

-- Ruxsatlar: faqat shu funksiyalar mijozga (anon) ochiq
revoke all on function public.qr_table_exists(text) from public;
revoke all on function public.qr_menu(text) from public;
revoke all on function public.qr_submit_order(text, jsonb, text) from public;
revoke all on function public.qr_call_waiter(text) from public;
revoke all on function public.qr_request_status(text[]) from public;
revoke all on function public.qr_claim_request(text, text, text) from public;

grant execute on function public.qr_menu(text) to anon, authenticated;
grant execute on function public.qr_submit_order(text, jsonb, text) to anon, authenticated;
grant execute on function public.qr_call_waiter(text) to anon, authenticated;
grant execute on function public.qr_request_status(text[]) to anon, authenticated;
grant execute on function public.qr_claim_request(text, text, text) to authenticated;
