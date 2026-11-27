-- Cafe POS: mijoz telefonidan QR-buyurtma (kirishsiz).
-- schema.sql dan KEYIN, SQL Editor'da ishga tushiring. Qayta ishga tushirish xavfsiz.
-- Dastur yangilanganda shu faylni yana bir marta TO'LIQ ishga tushiring (funksiyalar yangilanadi,
-- ma'lumot o'chmaydi).
--
-- Xavfsizlik:
--  * Mijoz jadvallarni to'g'ridan-to'g'ri o'qiy olmaydi (RLS). Faqat shu funksiyalar ochiq.
--  * qr_menu faqat sotuvdagi taomlarning nomi, toifasi, narxi, qisqacha ma'lumoti va rasmlarini
--    qaytaradi (xodimlar, PIN, tannarx, texnologik karta, mijozlar, buyurtmalar ko'rinmaydi).
--  * Narx SERVERDA menyudan olinadi: telefondan kelgan narxga ishonilmaydi.
--  * Buyurtma darhol oshxonaga tushmaydi: ofitsiant/kassir "Qabul qilish" ni bosadi.
--  * Cheklov: bitta stoldan daqiqasiga 3 ta so'rov, umumiy daqiqasiga 60 ta,
--    bitta stolda tasdiqlanmagan so'rovlar ko'pi bilan 3 ta.
--  * Band stolga (to'lanmagan cheki bor) faqat stoldagi QR stikerni skaner qilgan mijoz
--    buyurtma beradi: havolada stol kaliti bor (?table=3-Stol&k=..., src/qr/tableKey.js).
--    Kalitsiz (havolani qo'lda yozgan) faqat bo'sh stolga buyurtma bera oladi.
--  * "Faqat kafe ichidan" yoqilgan bo'lsa (Admin -> Tizim Sozlamalari, pos_qr_geofence),
--    buyurtma va ofitsiant chaqiruvi telefon joylashuvi kafe radiusida bo'lsagina qabul qilinadi.

-- Eski versiyadagi funksiyalar: parametrlari o'zgardi (bir xil nomli ikki funksiya qolmasin)
drop function if exists public.qr_menu(text);
drop function if exists public.qr_submit_order(text, jsonb, text);
drop function if exists public.qr_call_waiter(text);

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

-- Stol band: to'lanmagan cheki bor. "Olib ketish" band bo'lmaydi (har buyurtma alohida chek).
-- 'Bekor qilindi' (oshxona hamma taomni rad etgan yoki xodim bekor qilgan chek) ham yopiq
create or replace function public.qr_table_busy(p_table text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_table <> 'Olib ketish' and exists (
    select 1 from pos_records o
     where o.collection = 'pos_orders' and not o.deleted
       and o.data ->> 'table' = p_table
       and coalesce(o.data ->> 'status', '') not in ('To''langan', 'Qarz', 'Arxiv', 'Bekor qilindi')
  );
$$;

-- Mijoz shu stolga buyurtma bera oladimi / ofitsiant chaqira oladimi.
--  p_ctx: { k: stol kaliti (QR havoladan), r: [shu telefonning oldingi so'rov id lari],
--           lat, lng, acc: telefon joylashuvi (metr) }
--  Natija: { busy, key_ok, owner, geo_required } va rad etilsa { error, hint: busy|geo|far }
create or replace function public.qr_access(p_table text, p_ctx jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ctx    jsonb := case when jsonb_typeof(p_ctx) = 'object' then p_ctx else '{}'::jsonb end;
  v_secret text;
  v_key_ok boolean := false;
  v_busy   boolean;
  v_owner  boolean := false;
  v_ids    text[];
  v_geo    jsonb;
  v_geo_on boolean := false;
  v_clat   double precision;
  v_clng   double precision;
  v_radius double precision := 200;
  v_lat    double precision;
  v_lng    double precision;
  v_acc    double precision := 0;
  v_dist   double precision;
  v_res    jsonb;
begin
  -- 1) Stol kaliti: sha256(sir || '|' || stol) ning boshidagi 12 belgi
  select value #>> '{}' into v_secret
    from pos_kv where key = 'pos_qr_secret' and jsonb_typeof(value) = 'string';
  if coalesce(length(v_secret), 0) >= 16 and coalesce(v_ctx ->> 'k', '') <> '' then
    v_key_ok := (v_ctx ->> 'k') = left(encode(sha256(convert_to(v_secret || '|' || p_table, 'UTF8')), 'hex'), 12);
  end if;

  -- 2) Band stol: ochiq chekni aynan shu telefon ochgan bo'lsa ham ruxsat (uning QR-buyurtmasi qabul qilingan)
  v_busy := qr_table_busy(p_table);
  if v_busy and not v_key_ok and coalesce(jsonb_typeof(v_ctx -> 'r'), '') = 'array' then
    select array_agg(x) into v_ids
      from (select jsonb_array_elements_text(v_ctx -> 'r') as x limit 20) s;
    v_owner := coalesce(array_length(v_ids, 1), 0) > 0 and exists (
      select 1
        from pos_records q
        join pos_records o
          on o.collection = 'pos_orders' and o.id = q.data ->> 'orderId' and not o.deleted
       where q.collection = 'pos_qr_requests' and q.id = any (v_ids)
         and q.data ->> 'table' = p_table and q.data ->> 'status' = 'accepted'
         and o.data ->> 'table' = p_table
         and coalesce(o.data ->> 'status', '') not in ('To''langan', 'Qarz', 'Arxiv', 'Bekor qilindi')
    );
  end if;

  -- 3) "Faqat kafe ichidan" sozlamasi
  select value into v_geo from pos_kv where key = 'pos_qr_geofence';
  if coalesce(jsonb_typeof(v_geo), '') = 'object' and coalesce(v_geo ->> 'enabled', '') = 'true'
     and coalesce(jsonb_typeof(v_geo -> 'lat'), '') = 'number'
     and coalesce(jsonb_typeof(v_geo -> 'lng'), '') = 'number' then
    v_geo_on := true;
    v_clat := (v_geo ->> 'lat')::double precision;
    v_clng := (v_geo ->> 'lng')::double precision;
    if coalesce(jsonb_typeof(v_geo -> 'radius'), '') = 'number' then
      v_radius := least(greatest((v_geo ->> 'radius')::double precision, 50), 2000);
    end if;
  end if;

  v_res := jsonb_build_object('busy', v_busy, 'key_ok', v_key_ok, 'owner', v_owner, 'geo_required', v_geo_on);

  if v_busy and not v_key_ok and not v_owner then
    return v_res || jsonb_build_object('hint', 'busy', 'error',
      'Bu stol band. Shu stolda o''tirgan bo''lsangiz, stoldagi QR kodni telefon kamerasi bilan qayta skaner qiling yoki ofitsiantni chaqiring.');
  end if;

  if v_geo_on then
    if coalesce(jsonb_typeof(v_ctx -> 'lat'), '') <> 'number' or coalesce(jsonb_typeof(v_ctx -> 'lng'), '') <> 'number' then
      return v_res || jsonb_build_object('hint', 'geo', 'error',
        'Buyurtma va chaqiruv faqat kafe ichidan qabul qilinadi. Telefon joylashuviga (GPS) ruxsat bering.');
    end if;
    v_lat := (v_ctx ->> 'lat')::double precision;
    v_lng := (v_ctx ->> 'lng')::double precision;
    if coalesce(jsonb_typeof(v_ctx -> 'acc'), '') = 'number' then
      v_acc := least(greatest((v_ctx ->> 'acc')::double precision, 0), 150);
    end if;
    -- Ikki nuqta orasidagi masofa (metr, haversine)
    v_dist := 2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians(v_lat - v_clat) / 2), 2) +
      cos(radians(v_clat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - v_clng) / 2), 2)
    )));
    if coalesce(v_dist - v_acc > v_radius, true) then
      return v_res || jsonb_build_object('hint', 'far', 'error', format(
        'Siz kafedan taxminan %s uzoqdasiz. Buyurtma va chaqiruv faqat kafe ichidan qabul qilinadi.',
        case when v_dist >= 1000 then round((v_dist / 1000)::numeric, 1)::text || ' km'
             else round(v_dist::numeric)::text || ' m' end));
    end if;
  end if;

  return v_res;
end;
$$;

-- 1) Menyu: faqat sotuvdagi taomlar va kerakli maydonlar
create or replace function public.qr_menu(p_table text, p_ctx jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_menu   jsonb;
  v_access jsonb;
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
           -- Taom rasmlari (supabase/storage.sql): faqat havola, ombordagi yo'l berilmaydi
           'images', coalesce((
             select jsonb_agg(jsonb_build_object('id', e -> 'id', 'src', e -> 'src'))
               from jsonb_array_elements(
                      case when jsonb_typeof(r.data -> 'images') = 'array' then r.data -> 'images' else '[]'::jsonb end
                    ) e
              where jsonb_typeof(e) = 'object'
           ), '[]'::jsonb),
           'thumb', r.data -> 'thumb',
           'is_available', true
         ) order by r.created_at), '[]'::jsonb)
    into v_menu
    from pos_records r
   where r.collection = 'pos_menu'
     and not r.deleted
     and coalesce(r.data ->> 'is_available', 'true') <> 'false';

  -- Telefon oldindan bilsin: band stolmi (kalitsiz buyurtma yo'q), joylashuv so'raladimi
  v_access := qr_access(p_table, p_ctx);

  return jsonb_build_object(
    'table', p_table,
    'access', jsonb_build_object(
      'busy', v_access -> 'busy',
      'key_ok', v_access -> 'key_ok',
      'geo_required', v_access -> 'geo_required',
      'blocked', coalesce(v_access ->> 'hint', '') = 'busy',
      'message', case when coalesce(v_access ->> 'hint', '') = 'busy' then v_access -> 'error' end
    ),
    'cafe_name', (select value from pos_kv where key = 'pos_cafe_name'),
    'service_fee', (select value from pos_kv where key = 'pos_service_fee'),
    'categories', (select value from pos_kv where key = 'pos_categories'),
    'menu', v_menu
  );
end;
$$;

-- 2) Buyurtma so'rovi: ofitsiant tasdiqlashini kutadi
create or replace function public.qr_submit_order(p_table text, p_items jsonb, p_note text default '',
                                                  p_ctx jsonb default '{}'::jsonb)
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
  v_access   jsonb;
begin
  if not qr_table_exists(p_table) then
    raise exception 'Stol topilmadi: %', p_table;
  end if;
  v_access := qr_access(p_table, p_ctx);
  if v_access ? 'error' then
    raise exception using message = v_access ->> 'error', hint = v_access ->> 'hint';
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
  select count(*) into v_recent from pos_records
   where collection = 'pos_qr_requests' and not deleted and data ->> 'table' = p_table
     and data ->> 'status' = 'pending' and created_at > now() - interval '3 hours';
  if v_recent >= 3 then
    raise exception 'Oldingi buyurtmalaringiz hali tasdiqlanmadi. Ofitsiant ko''rib chiqishini kuting';
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
    'time', to_char(now() at time zone 'Asia/Tashkent', 'HH24:MI'),
    -- Xodim ekranida: QR stiker skaner qilinganmi (kalit to'g'ri), joylashuv tekshirilganmi
    'keyOk', coalesce((v_access ->> 'key_ok')::boolean, false),
    'geoChecked', coalesce((v_access ->> 'geo_required')::boolean, false)
  ), 'qr');

  return jsonb_build_object('ok', true, 'id', v_id, 'items', v_items, 'subTotal', v_sub);
end;
$$;

-- 3) Ofitsiantni chaqirish (bitta stoldan 30 soniyada bir marta)
create or replace function public.qr_call_waiter(p_table text, p_ctx jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_id     text;
  v_access jsonb;
begin
  if not qr_table_exists(p_table) then
    raise exception 'Stol topilmadi: %', p_table;
  end if;
  v_access := qr_access(p_table, p_ctx);
  if v_access ? 'error' then
    raise exception using message = v_access ->> 'error', hint = v_access ->> 'hint';
  end if;
  -- 15 daqiqadan eski, javobsiz qolgan chaqiruv yangisiga almashadi (eski versiyada xodim
  -- ekrani chaqiruvni ko'rsatmasdi: o'chirilmay qolgan chaqiruv yangisini to'sib qo'yardi)
  update pos_records
     set deleted = true, data = '{}'::jsonb, updated_by = 'qr'
   where collection = 'pos_calls' and not deleted and data ->> 'table' = p_table
     and created_at < now() - interval '15 minutes';
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
    'source', 'qr',
    'keyOk', coalesce((v_access ->> 'key_ok')::boolean, false)
  ), 'qr');
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 4) Mijoz o'z so'rovlarining holatini ko'radi (faqat id bo'yicha, ko'pi bilan 20 ta).
--    Qabul qilingan so'rov uchun chek holati ham: orderStatus (Yangi, Tayyor, ...) va
--    closed = chek to'langan/qarzga yozilgan/bekor qilingan. Telefon yopilgan chekni ro'yxatdan
--    olib tashlaydi (oldin to'langan taom "tayyorlanmoqda" bo'lib qolib ketardi).
--    Taom darajasida (7-bosqich): lineIds - so'rov taomlarining chekdagi qator kalitlari (so'rov tartibida),
--    lines - shu qatorlarning hozirgi porsiyasi, oshxona tayyorlagani va berilgani, rejected - oshxona rad
--    etgan porsiyalar. Rad etish sababi faqat standart ro'yxatdan (oshpazning erkin izohi mijozga chiqmaydi).
create or replace function public.qr_request_status(p_ids text[])
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'status', r.data ->> 'status',
           'orderStatus', o.status,
           'closed', case
             when coalesce(r.data ->> 'status', '') <> 'accepted' then false
             when o.closed is not null then o.closed
             -- chek topilmadi: qabul qilinganiga 1 daqiqadan oshgan bo'lsa yopilgan deb olamiz
             -- (xodim qurilmasi chekni bulutga 1-2 soniyada yozadi)
             else case when jsonb_typeof(r.data -> 'handledAt') = 'number'
                       then (r.data ->> 'handledAt')::numeric else 0 end
                  < floor(extract(epoch from now()) * 1000) - 60000
           end,
           'lineIds', case when jsonb_typeof(r.data -> 'lineIds') = 'array' then r.data -> 'lineIds' else '[]'::jsonb end,
           'lines', coalesce(o.lines, '[]'::jsonb),
           'rejected', coalesce(o.rejected, '[]'::jsonb)
         )), '[]'::jsonb)
    from pos_records r
    left join lateral (
      -- 'Bekor qilindi' bu yerda yopiq hisoblanmaydi: telefonda "❌ Bekor qilindi" bo'lib ko'rinadi
      select x.data ->> 'status' as status,
             (x.deleted or coalesce(x.data ->> 'status', '') in ('To''langan', 'Qarz', 'Arxiv')) as closed,
             (select jsonb_agg(jsonb_build_object(
                       'lineId', it ->> 'cartItemId',
                       'qty', coalesce(it -> 'quantity', it -> 'qty'),
                       'done', it -> 'kitchenDoneQty',
                       'served', it -> 'servedQty'))
                from jsonb_array_elements(case when jsonb_typeof(x.data -> 'items') = 'array'
                                               then x.data -> 'items' else '[]'::jsonb end) it
               where jsonb_typeof(it) = 'object'
                 and (it ->> 'cartItemId') in (
                   select jsonb_array_elements_text(case when jsonb_typeof(r.data -> 'lineIds') = 'array'
                                                         then r.data -> 'lineIds' else '[]'::jsonb end))
             ) as lines,
             (select jsonb_agg(jsonb_build_object(
                       'lineId', rj ->> 'lineId',
                       'qty', rj -> 'qty',
                       'reason', substring(rj ->> 'reason'
                                           from '^(Masalliq tugadi|Taom qolmadi|Uskuna ishlamayapti|Juda uzoq kutiladi|Noto''g''ri buyurtma)')))
                from jsonb_array_elements(case when jsonb_typeof(x.data -> 'kitchenRejections') = 'array'
                                               then x.data -> 'kitchenRejections' else '[]'::jsonb end) rj
               where jsonb_typeof(rj) = 'object'
                 and (rj ->> 'lineId') in (
                   select jsonb_array_elements_text(case when jsonb_typeof(r.data -> 'lineIds') = 'array'
                                                         then r.data -> 'lineIds' else '[]'::jsonb end))
             ) as rejected
        from pos_records x
       where coalesce(r.data ->> 'status', '') = 'accepted'
         and x.collection = 'pos_orders'
         and case when coalesce(r.data ->> 'orderId', '') <> ''
                  then x.id = r.data ->> 'orderId'
                  else x.data ->> 'table' = r.data ->> 'table' and not x.deleted
                       and coalesce(x.data ->> 'status', '') not in ('To''langan', 'Qarz', 'Arxiv', 'Bekor qilindi')
             end
       order by x.updated_at desc
       limit 1
    ) o on true
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

-- Ruxsatlar: faqat shu funksiyalar mijozga (anon) ochiq.
-- Yordamchi funksiyalar (stol kaliti, bandlik) to'g'ridan-to'g'ri chaqirilmaydi: Supabase yangi
-- funksiyaga anon ruxsatini o'zi beradi, shuning uchun anon va authenticated dan ham olinadi.
revoke all on function public.qr_table_exists(text) from public, anon, authenticated;
revoke all on function public.qr_table_busy(text) from public, anon, authenticated;
revoke all on function public.qr_access(text, jsonb) from public, anon, authenticated;
revoke all on function public.qr_menu(text, jsonb) from public;
revoke all on function public.qr_submit_order(text, jsonb, text, jsonb) from public;
revoke all on function public.qr_call_waiter(text, jsonb) from public;
revoke all on function public.qr_request_status(text[]) from public;
revoke all on function public.qr_claim_request(text, text, text) from public, anon;

grant execute on function public.qr_menu(text, jsonb) to anon, authenticated;
grant execute on function public.qr_submit_order(text, jsonb, text, jsonb) to anon, authenticated;
grant execute on function public.qr_call_waiter(text, jsonb) to anon, authenticated;
grant execute on function public.qr_request_status(text[]) to anon, authenticated;
grant execute on function public.qr_claim_request(text, text, text) to authenticated;

-- Supabase API (PostgREST) yangi funksiyalarni darhol ko'rsin
notify pgrst, 'reload schema';
