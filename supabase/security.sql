-- Cafe POS: server xavfsizligi (6-bosqich, 2-qadam).
-- schema.sql, qr.sql va storage.sql dan KEYIN, SQL Editor'da ishga tushiring.
-- Qayta ishga tushirish xavfsiz: ma'lumot o'chmaydi, funksiyalar yangilanadi.
-- Dastur yangilanganda shu faylni yana bir marta TO'LIQ ishga tushiring.
--
-- Nima o'zgaradi:
--  1. Ishonchli qurilmalar. Kafe hisobiga (email + parol) ulangan har bir qurilma (brauzer sessiyasi)
--     alohida yoziladi. Yangi qurilma "tasdiqlanmagan": Ega yoki admin shu qurilmaning o'zida PIN'ini
--     kiritadi yoki boshqa qurilmada "📱 Qurilmalar" ro'yxatida tasdiqlaydi. Tasdiqlanmagan qurilma hech
--     narsa o'qiy olmaydi va yoza olmaydi. Kafe paroli tarqalib ketsa ham ma'lumot himoyalangan.
--     Shu fayl birinchi marta ishga tushganda ulangan barcha qurilmalar avtomatik ishonchli bo'ladi.
--  2. PIN va Authenticator siri serverda. Xodimlar ro'yxatida (pos_users) endi PIN xeshi va ikki
--     bosqichli kirish siri yo'q: ular faqat pos_staff_secrets da, uni hech kim to'g'ridan-to'g'ri
--     o'qiy olmaydi. PIN serverda tekshiriladi (pos_pin_check), 5 xatodan keyin qurilma bloklanadi.
--  3. Kim nimani ko'radi (RLS). Xodim PIN bilan kirganda server qurilmaga uning rolini yozadi.
--     Mijozlar, xarajatlar, smenalar, ombor tarixi va audit jurnali faqat ruxsati borlarga ko'rinadi
--     (ofitsiant, oshpaz, kuryer ko'rmaydi; kassir - mijoz, xarajat, smena; admin - huquqlariga qarab).
--  4. Yozish faqat server funksiyalari orqali (pos_push_records, pos_push_kv): xodimlar, menyu narxi
--     va sozlamalarni faqat huquqi bor admin o'zgartiradi; audit jurnaliga faqat qo'shiladi.
--
-- Diqqat: avval dasturning yangi versiyasi barcha qurilmalarga yetib borsin (sarlavhadagi versiya),
-- keyin shu faylni ishga tushiring. Eski versiyadagi qurilma yangilanmaguncha yoza olmaydi.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 1) Jadvallar (faqat server funksiyalari ishlatadi)
-- ============================================================
create table if not exists public.pos_devices (
  session_id      uuid        primary key,       -- Supabase sessiyasi (JWT dagi session_id)
  auth_uid        uuid,
  device_key      text,                          -- qurilmadagi pos_device_id (faqat ko'rsatish uchun)
  label           text        not null default '',
  status          text        not null default 'pending',  -- pending | trusted | revoked
  user_agent      text,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  approved_by     text,
  last_seen_at    timestamptz not null default now(),
  bootstrap_until timestamptz,                   -- yangi kafe: birinchi qurilma 1 soat to'liq yoza oladi
  full_access     boolean     not null default false,
  staff_id        text,                          -- shu qurilmada PIN bilan (serverda) kirgan xodim
  staff_name      text,
  staff_until     timestamptz,
  fail_count      integer     not null default 0,
  locked_until    timestamptz,
  probe_count     integer     not null default 0,
  probe_window    timestamptz
);

create table if not exists public.pos_staff_secrets (
  user_id        text        primary key,
  pin_hash       text,                           -- s1$<takror>$<tuz>$<xesh> (src/utils/pinHash.ts)
  pin_length     integer,
  pin_set_at     bigint      not null default 0,  -- ms; 0 - shu fayldan oldin o'rnatilgan PIN
  pin_sample     boolean     not null default false,
  two_factor     jsonb,                          -- { type, secret, enabledAt, backupCodes }
  two_factor_at  bigint      not null default 0,
  last_step      bigint      not null default 0,  -- oxirgi qabul qilingan Authenticator qadami
  updated_at     timestamptz not null default now()
);

create table if not exists public.pos_auth_failures (
  id          bigserial   primary key,
  at          timestamptz not null default now(),
  session_id  uuid,
  trusted     boolean     not null default false
);
create index if not exists pos_auth_failures_at_idx on public.pos_auth_failures (at);

create table if not exists public.pos_security_meta (
  key   text primary key,
  value jsonb
);

alter table public.pos_devices enable row level security;
alter table public.pos_staff_secrets enable row level security;
alter table public.pos_auth_failures enable row level security;
alter table public.pos_security_meta enable row level security;
revoke all on public.pos_devices, public.pos_staff_secrets, public.pos_auth_failures, public.pos_security_meta
  from public, anon, authenticated;
revoke all on sequence public.pos_auth_failures_id_seq from public, anon, authenticated;

-- ============================================================
-- 2) Yordamchi funksiyalar
-- ============================================================
-- Joriy so'rovning Supabase sessiyasi (har bir ulangan brauzer - alohida sessiya)
create or replace function public.pos_session_id()
returns uuid
language plpgsql stable
as $$
declare
  v text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- Xodim qachon qo'shilgani (id dan), src/utils/adminRights.ts -> createdOrderOf bilan bir xil
create or replace function public.pos_created_order(p_id text)
returns numeric
language sql immutable
as $$
  select case
    when p_id ~ '^\d+$' then p_id::numeric
    when p_id ~ '\d{10,}' then substring(p_id from '(\d{10,})')::numeric
    else 9007199254740991
  end
$$;

-- Ega: pos_owner dagi admin, bo'lmasa eng birinchi qo'shilgan admin (resolveOwnerId bilan bir xil)
create or replace function public.pos_owner_id()
returns text
language sql stable security definer set search_path = public
as $$
  with admins as (
    select r.id from pos_records r
     where r.collection = 'pos_users' and not r.deleted
       and lower(coalesce(r.data ->> 'role', '')) = 'admin'
  )
  select coalesce(
    (select a.id from admins a
      where a.id = (select k.value ->> 'id' from pos_kv k
                     where k.key = 'pos_owner' and jsonb_typeof(k.value) = 'object')),
    (select a.id from admins a order by pos_created_order(a.id), a.id limit 1)
  )
$$;

-- Admin huquqi (src/utils/adminRights.ts -> hasRight). Ega - hammasi; admin - adminRights dagi,
-- yozilmagani: "PIN himoyasini boshqarish" va "Yangi admin tayinlash" yopiq, qolgani ochiq
create or replace function public.pos_has_right(p_user jsonb, p_user_id text, p_owner text, p_right text)
returns boolean
language plpgsql immutable
as $$
declare
  v jsonb;
begin
  if p_user is null or lower(coalesce(p_user ->> 'role', '')) <> 'admin' then
    return false;
  end if;
  if p_owner is not null and p_user_id = p_owner then
    return true;
  end if;
  v := p_user -> 'adminRights';
  if jsonb_typeof(v) = 'object' and jsonb_typeof(v -> p_right) = 'boolean' then
    return (v ->> p_right)::boolean;
  end if;
  return p_right not in ('pinRules', 'addAdmins');
end;
$$;

-- Shu qurilmada serverda PIN bilan kirgan xodim: { id, name, role, data, owner } yoki null
create or replace function public.pos_actor()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  d      pos_devices;
  v_data jsonb;
  v_own  text;
  v_role text;
begin
  select * into d from pos_devices where session_id = pos_session_id();
  if d.session_id is null or d.status <> 'trusted' or d.staff_id is null
     or d.staff_until is null or d.staff_until < now() then
    return null;
  end if;
  select data into v_data from pos_records
   where collection = 'pos_users' and id = d.staff_id and not deleted;
  if v_data is null then
    return null;
  end if;
  v_own := pos_owner_id();
  v_role := lower(coalesce(v_data ->> 'role', ''));
  return jsonb_build_object(
    'id', d.staff_id,
    'name', coalesce(v_data ->> 'name', ''),
    'role', v_role,
    'data', v_data,
    'owner', v_role = 'admin' and v_own is not null and v_own = d.staff_id
  );
end;
$$;

create or replace function public.pos_actor_right(p_actor jsonb, p_right text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_actor is not null and (
    coalesce((p_actor ->> 'owner')::boolean, false)
    or pos_has_right(p_actor -> 'data', p_actor ->> 'id', pos_owner_id(), p_right)
  )
$$;

-- Qurilma ishonchlimi
create or replace function public.pos_device_ok()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from pos_devices where session_id = pos_session_id() and status = 'trusted')
$$;

-- Shu qurilmaga ko'rinmaydigan to'plamlar. '*' - hech narsa ko'rinmaydi (tasdiqlanmagan qurilma).
-- Mijozlar (telefon raqamlari), xarajatlar, smenalar, ombor tarixi va audit jurnali - faqat ruxsati borlarga
create or replace function public.pos_hidden_collections()
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  d   pos_devices;
  a   jsonb;
  v_role text;
  v_hidden text[] := array['pos_customers', 'pos_expenses', 'pos_shifts', 'pos_inv_logs', 'pos_audit_logs'];
begin
  select * into d from pos_devices where session_id = pos_session_id();
  if d.session_id is null or d.status <> 'trusted' then
    return array['*'];
  end if;
  if d.full_access or coalesce(d.bootstrap_until > now(), false) then
    return '{}';
  end if;
  a := pos_actor();
  if a is null then
    return v_hidden;
  end if;
  v_role := a ->> 'role';
  if v_role = 'cashier' then
    return array['pos_inv_logs', 'pos_audit_logs'];
  elsif v_role = 'warehouse' then
    return array['pos_customers', 'pos_shifts', 'pos_audit_logs'];
  elsif v_role = 'admin' then
    if coalesce((a ->> 'owner')::boolean, false) then
      return '{}';
    end if;
    if pos_actor_right(a, 'logs') then
      v_hidden := array_remove(v_hidden, 'pos_audit_logs');
    end if;
    if pos_actor_right(a, 'cashier') or pos_actor_right(a, 'stats') then
      v_hidden := array_remove(array_remove(array_remove(v_hidden, 'pos_customers'), 'pos_expenses'), 'pos_shifts');
    end if;
    if pos_actor_right(a, 'warehouse') or pos_actor_right(a, 'stats') then
      v_hidden := array_remove(array_remove(v_hidden, 'pos_inv_logs'), 'pos_expenses');
    end if;
    return v_hidden;
  end if;
  return v_hidden;
end;
$$;

-- ---------- PIN xeshi (src/utils/pinHash.ts bilan bir xil) ----------
create or replace function public.pos_pin_digest(p_pin text, p_salt text, p_iter integer)
returns text
language plpgsql immutable strict
as $$
declare
  s bytea := decode(p_salt, 'hex');
  d bytea := sha256(convert_to(p_salt || '|' || p_pin, 'UTF8'));
  i integer;
begin
  for i in 2..p_iter loop
    d := sha256(d || s);
  end loop;
  return encode(d, 'hex');
end;
$$;

create or replace function public.pos_valid_pin_hash(p_hash text)
returns boolean
language sql immutable
as $$
  select coalesce(p_hash ~ '^s1\$[0-9]{1,6}\$([0-9a-f]{2}){1,32}\$[0-9a-f]{64}$'
    and split_part(p_hash, '$', 2)::integer between 1 and 200000, false)
$$;

create or replace function public.pos_pin_matches(p_hash text, p_pin text)
returns boolean
language plpgsql immutable
as $$
begin
  if not pos_valid_pin_hash(p_hash) or coalesce(p_pin, '') = '' then
    return false;
  end if;
  return pos_pin_digest(p_pin, split_part(p_hash, '$', 3), split_part(p_hash, '$', 2)::integer)
         = split_part(p_hash, '$', 4);
end;
$$;

create or replace function public.pos_make_pin_hash(p_pin text)
returns text
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  v_salt text := encode(gen_random_bytes(16), 'hex');
begin
  return 's1$2000$' || v_salt || '$' || pos_pin_digest(p_pin, v_salt, 2000);
end;
$$;

-- README'da ochiq yozilgan namuna PIN'lar (admin ogohlantiriladi)
create or replace function public.pos_is_sample_pin(p_hash text, p_len integer)
returns boolean
language sql immutable
as $$
  select exists (
    select 1 from unnest(array['777777', '1111', '2222', '3333', '444444']) s(pin)
     where length(s.pin) = coalesce(p_len, length(s.pin)) and pos_pin_matches(p_hash, s.pin)
  )
$$;

-- ---------- Authenticator (TOTP, src/utils/totp.ts bilan bir xil) ----------
create or replace function public.pos_base32_decode(p_text text)
returns bytea
language plpgsql immutable
as $$
declare
  v_clean text := upper(regexp_replace(coalesce(p_text, ''), '[\s=-]', '', 'g'));
  v_out   bytea := ''::bytea;
  v_bits  integer := 0;
  v_value integer := 0;
  v_idx   integer;
  i       integer;
begin
  if v_clean = '' then
    return null;
  end if;
  for i in 1..length(v_clean) loop
    v_idx := strpos('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', substr(v_clean, i, 1)) - 1;
    if v_idx < 0 then
      return null;
    end if;
    v_value := ((v_value << 5) | v_idx) & 65535;
    v_bits := v_bits + 5;
    if v_bits >= 8 then
      v_out := v_out || set_byte('\x00'::bytea, 0, (v_value >> (v_bits - 8)) & 255);
      v_bits := v_bits - 8;
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.pos_hotp(p_key bytea, p_counter bigint)
returns text
language plpgsql immutable
set search_path = public, extensions
as $$
declare
  v_msg bytea := '\x0000000000000000'::bytea;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  i     integer;
begin
  for i in 0..7 loop
    v_msg := set_byte(v_msg, 7 - i, ((p_counter >> (8 * i)) & 255)::integer);
  end loop;
  v_mac := hmac(v_msg, p_key, 'sha1');
  v_off := get_byte(v_mac, 19) & 15;
  v_bin := ((get_byte(v_mac, v_off) & 127)::bigint << 24)
         | (get_byte(v_mac, v_off + 1)::bigint << 16)
         | (get_byte(v_mac, v_off + 2)::bigint << 8)
         | get_byte(v_mac, v_off + 3)::bigint;
  return lpad((v_bin % 1000000)::text, 6, '0');
end;
$$;

-- To'g'ri kod qaysi qadamga tegishli (±1 qadam, 30 soniya). Noto'g'ri bo'lsa null
create or replace function public.pos_totp_step(p_secret text, p_code text)
returns bigint
language plpgsql stable
as $$
declare
  v_key  bytea := pos_base32_decode(p_secret);
  v_now  bigint := floor(extract(epoch from clock_timestamp()) / 30)::bigint;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_step bigint;
begin
  if v_key is null or length(v_key) < 10 or length(v_code) <> 6 then
    return null;
  end if;
  for v_step in v_now - 1 .. v_now + 1 loop
    if pos_hotp(v_key, v_step) = v_code then
      return v_step;
    end if;
  end loop;
  return null;
end;
$$;

-- Zaxira kod ro'yxatdagi qaysi o'rinda (0 dan), topilmasa -1. Kod: "b1$<tuz>$<sha256(tuz|kod)>"
create or replace function public.pos_backup_code_index(p_codes jsonb, p_code text)
returns integer
language plpgsql immutable
as $$
declare
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_item text;
  i      integer := 0;
begin
  if length(v_code) <> 10 or jsonb_typeof(p_codes) <> 'array' then
    return -1;
  end if;
  for v_item in select jsonb_array_elements_text(p_codes) loop
    if split_part(v_item, '$', 1) = 'b1' and split_part(v_item, '$', 2) <> ''
       and encode(sha256(convert_to(split_part(v_item, '$', 2) || '|' || v_code, 'UTF8')), 'hex') = split_part(v_item, '$', 3) then
      return i;
    end if;
    i := i + 1;
  end loop;
  return -1;
end;
$$;

-- ---------- Xodim yozuvi: sirlarsiz ko'rinish ----------
-- Qurilmalarga boradigan xodim yozuvi: PIN xeshi va Authenticator siri yo'q, o'rniga belgilar
create or replace function public.pos_public_user(p_id text, p_data jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s pos_staff_secrets;
  v jsonb := coalesce(p_data, '{}'::jsonb) - array['pin', 'password', 'pinHash', 'twoFactor',
    'pinOn', 'pinSample', 'pinSetAt', 'twoFactorOn', 'twoFactorAt', 'backupCodesLeft'];
begin
  select * into s from pos_staff_secrets where user_id = p_id;
  if s.user_id is not null and s.pin_hash is not null then
    v := v || jsonb_build_object('pinOn', true, 'pinLength', s.pin_length, 'pinSetAt', s.pin_set_at,
                                 'pinSample', s.pin_sample);
  else
    v := v - 'pinLength';
  end if;
  if s.user_id is not null and s.two_factor is not null then
    v := v || jsonb_build_object('twoFactorOn', true, 'twoFactorAt', s.two_factor_at,
      'backupCodesLeft', coalesce(jsonb_array_length(s.two_factor -> 'backupCodes'), 0));
  elsif s.user_id is not null and s.two_factor_at > 0 then
    v := v || jsonb_build_object('twoFactorAt', s.two_factor_at);
  end if;
  return v;
end;
$$;

-- Qurilmadan kelgan xodim yozuvidagi PIN/Authenticator sirini serverga olish.
-- PIN faqat yangi bo'lsa qabul qilinadi: pinSetAt serverdagidan katta (yoki serverda PIN yo'q).
-- Qurilmadagi eski nusxa (keshdagi xesh) PIN'ni orqaga qaytara olmaydi.
create or replace function public.pos_absorb_user_secrets(p_id text, p_data jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  s        pos_staff_secrets;
  v_hash   text;
  v_plain  text := coalesce(nullif(p_data ->> 'pin', ''), nullif(p_data ->> 'password', ''));
  v_len    integer;
  v_set    bigint := 0;
  v_tf_at  bigint := 0;
  v_tf     jsonb := p_data -> 'twoFactor';
begin
  select * into s from pos_staff_secrets where user_id = p_id for update;
  if s.user_id is null then
    insert into pos_staff_secrets (user_id) values (p_id) returning * into s;
  end if;

  if coalesce(p_data ->> 'pinSetAt', '') ~ '^\d{1,15}$' then
    v_set := (p_data ->> 'pinSetAt')::bigint;
  end if;
  if pos_valid_pin_hash(p_data ->> 'pinHash') then
    v_hash := p_data ->> 'pinHash';
    v_len := case when coalesce(p_data ->> 'pinLength', '') ~ '^[4-8]$' then (p_data ->> 'pinLength')::integer end;
  elsif v_plain ~ '^\d{4,8}$' then
    v_hash := pos_make_pin_hash(v_plain);
    v_len := length(v_plain);
  end if;
  if v_hash is not null and (s.pin_hash is null or v_set > s.pin_set_at) then
    s.pin_hash := v_hash;
    s.pin_length := coalesce(v_len, s.pin_length, 4);
    s.pin_set_at := case when v_set > 0 then v_set else greatest(s.pin_set_at, 0) end;
    s.pin_sample := pos_is_sample_pin(v_hash, s.pin_length);
  end if;

  if coalesce(p_data ->> 'twoFactorAt', '') ~ '^\d{1,15}$' then
    v_tf_at := (p_data ->> 'twoFactorAt')::bigint;
  end if;
  if p_data ? 'twoFactor' and (v_tf_at > s.two_factor_at or (s.two_factor is null and s.two_factor_at = 0)) then
    if jsonb_typeof(v_tf) = 'object' and coalesce(v_tf ->> 'type', '') = 'totp'
       and pos_base32_decode(v_tf ->> 'secret') is not null then
      s.two_factor := v_tf;
      s.two_factor_at := v_tf_at;   -- 0: shu fayldan oldin yoqilgan
    elsif v_tf_at > s.two_factor_at then
      s.two_factor := null;           -- o'chirildi (twoFactor: null, yangi twoFactorAt)
      s.two_factor_at := v_tf_at;
    end if;
  end if;

  update pos_staff_secrets
     set pin_hash = s.pin_hash, pin_length = s.pin_length, pin_set_at = s.pin_set_at,
         pin_sample = s.pin_sample, two_factor = s.two_factor, two_factor_at = s.two_factor_at,
         updated_at = now()
   where user_id = p_id;
  return pos_public_user(p_id, p_data);
end;
$$;

-- ============================================================
-- 3) Birinchi o'rnatish: sirlarni xodim yozuvlaridan ko'chirish, ulangan qurilmalarni ishonchli qilish
-- ============================================================
do $$
declare
  r record;
begin
  -- Xodimlar: PIN xeshi va Authenticator siri pos_staff_secrets ga, yozuvda faqat belgilar
  for r in
    select id, data from pos_records
     where collection = 'pos_users'
       and (data ? 'pinHash' or data ? 'pin' or data ? 'password' or data ? 'twoFactor')
  loop
    perform pos_absorb_user_secrets(r.id, r.data);
    update pos_records
       set data = pos_public_user(r.id, r.data), updated_by = 'security.sql'
     where collection = 'pos_users' and id = r.id;
  end loop;

  -- Faqat BIRINCHI marta: hozir ulangan qurilmalar (kafe hisobining sessiyalari) ishonchli.
  -- Keyin qayta ishga tushirilsa, tasdiqlanmagan qurilmalar tasdiqlanmagan qoladi
  if not exists (select 1 from pos_security_meta where key = 'installed_at') then
    insert into pos_devices (session_id, auth_uid, label, status, approved_at, approved_by)
    select s.id, s.user_id, '', 'trusted', now(), 'security.sql'
      from auth.sessions s
    on conflict (session_id) do nothing;
    insert into pos_security_meta (key, value) values ('installed_at', to_jsonb(now()::text));
  end if;
  insert into pos_security_meta (key, value) values ('version', '1'::jsonb)
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- ============================================================
-- 4) RLS: o'qish - qurilma va xodim ruxsati bo'yicha; yozish - faqat server funksiyalari orqali
-- ============================================================
drop policy if exists "pos_records_authenticated" on public.pos_records;
drop policy if exists "pos_kv_authenticated" on public.pos_kv;
drop policy if exists "pos_records_read" on public.pos_records;
drop policy if exists "pos_kv_read" on public.pos_kv;

create policy "pos_records_read" on public.pos_records
  for select to authenticated
  using (not ((select public.pos_hidden_collections()) && array['*', collection]));

create policy "pos_kv_read" on public.pos_kv
  for select to authenticated
  using ((select public.pos_device_ok()));

revoke insert, update, delete, truncate on public.pos_records, public.pos_kv from public, anon, authenticated;
grant select on public.pos_records, public.pos_kv to authenticated;

-- ============================================================
-- 5) Yozish qoidalari
-- ============================================================
-- Xodim yozuvini kim o'zgartira oladi (src/utils/adminRights.ts -> canManageUser, clampRights).
-- Natija: null - ruxsat, aks holda sabab
create or replace function public.pos_user_write_reason(
  p_id text, p_old jsonb, p_new jsonb, p_deleted boolean, p_actor jsonb
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_aid      text := p_actor ->> 'id';
  v_owner    text := pos_owner_id();
  v_is_owner boolean := coalesce((p_actor ->> 'owner')::boolean, false);
  v_self_keys text[] := array['name', 'title', 'pin', 'password', 'pinHash', 'pinLength', 'pinSetAt', 'pinOn',
    'pinSample', 'twoFactor', 'twoFactorAt', 'twoFactorOn', 'backupCodesLeft'];
  v_server_keys text[] := array['pinOn', 'pinSample', 'twoFactorOn', 'backupCodesLeft'];
  v_old_admin boolean := p_old is not null and lower(coalesce(p_old ->> 'role', '')) = 'admin';
  v_new_admin boolean := not p_deleted and lower(coalesce(p_new ->> 'role', '')) = 'admin';
  v_key      text;
  v_before   boolean;
  v_after    boolean;
begin
  if p_actor is null then
    return 'staff_login';
  end if;
  -- O'z yozuvi: ism, lavozim, PIN va ikki bosqichli kirish (rol va huquqlar emas)
  if v_aid = p_id then
    if p_deleted then
      return 'self_delete';
    end if;
    if v_is_owner then
      return case when lower(coalesce(p_new ->> 'role', '')) = 'admin' then null else 'owner_role' end;
    end if;
    if p_old is not null and (p_old - v_self_keys) is distinct from (p_new - v_self_keys) then
      return 'self_fields';
    end if;
    return null;
  end if;
  if p_actor ->> 'role' <> 'admin' then
    return 'admin_only';
  end if;
  if p_old is not null and v_owner is not null and p_id = v_owner then
    return 'owner_locked';
  end if;
  if v_is_owner then
    return null;
  end if;
  -- Faqat belgilar o'zgargan (server qo'yadigan maydonlar) - zararsiz
  if p_old is not null and not p_deleted and (p_old - v_server_keys) = (p_new - v_server_keys) then
    return null;
  end if;
  if v_old_admin or v_new_admin then
    if not pos_actor_right(p_actor, 'addAdmins') then
      return 'add_admins';
    end if;
    if v_old_admin and coalesce(p_old ->> 'appointedBy', '') <> v_aid then
      return 'not_appointer';
    end if;
    if v_new_admin then
      if not v_old_admin and coalesce(p_new ->> 'appointedBy', '') <> v_aid then
        return 'appointed_by';
      end if;
      -- Admin o'zida yo'q huquqni bera olmaydi va o'zgartira olmaydi
      foreach v_key in array array['stats', 'warehouse', 'waiter', 'cashier', 'kitchen', 'courier', 'menu',
                                   'categories', 'staff', 'logs', 'settings', 'approve', 'pinRules', 'addAdmins']
      loop
        v_before := v_old_admin and pos_has_right(p_old, p_id, v_owner, v_key);
        v_after := pos_has_right(p_new, p_id, v_owner, v_key);
        if v_before <> v_after and not pos_actor_right(p_actor, v_key) then
          return 'grant_right';
        end if;
      end loop;
    end if;
    return null;
  end if;
  if not pos_actor_right(p_actor, 'staff') then
    return 'staff_right';
  end if;
  return null;
end;
$$;

create or replace function public.pos_record_write_reason(
  p_collection text, p_id text, p_old jsonb, p_old_deleted boolean, p_new jsonb, p_deleted boolean,
  p_actor jsonb
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_old jsonb := case when p_old_deleted then null else p_old end;
begin
  if p_collection = 'pos_users' then
    return pos_user_write_reason(p_id, v_old, p_new, p_deleted, p_actor);
  end if;

  if p_collection = 'pos_menu' then
    -- Narx, tarkib, rasm - admin (Taomlar yoki Ombor huquqi) yoki omborchi.
    -- Boshqalar (oshxona stop-listi) faqat "sotuvda / tugadi" belgisini o'zgartiradi
    if pos_actor_right(p_actor, 'menu') or pos_actor_right(p_actor, 'warehouse')
       or coalesce(p_actor ->> 'role', '') = 'warehouse' then
      return null;
    end if;
    if v_old is not null and not p_deleted
       and (v_old - array['is_available', 'available']) = (p_new - array['is_available', 'available']) then
      return null;
    end if;
    return 'menu_right';
  end if;

  if p_collection = 'pos_audit_logs' then
    -- Jurnalga faqat qo'shiladi: o'zgartirish va o'chirish - faqat Ega ("Tarixni tozalash")
    if p_old is null or coalesce((p_actor ->> 'owner')::boolean, false) then
      return null;
    end if;
    if not p_deleted and not p_old_deleted and p_old = p_new then
      return null; -- takroriy yuborish (internet uzilib, qayta urinish)
    end if;
    return 'audit_append_only';
  end if;

  if p_collection = 'pos_orders' and p_deleted and v_old is not null then
    -- Chek o'chirilmaydi (bekor qilinadi); tarixni tozalash - "Tizim sozlamalari" huquqi bor admin
    return case when pos_actor_right(p_actor, 'settings') then null else 'orders_delete' end;
  end if;

  return null; -- ish jarayoni: buyurtma, chaqiruv, ombor, xarajat, mijoz, smena (oflayn navbat ham)
end;
$$;

create or replace function public.pos_kv_write_reason(p_key text, p_old jsonb, p_exists boolean, p_new jsonb, p_actor jsonb)
returns text
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_exists and p_old is not distinct from p_new then
    return null;
  end if;
  if p_key in ('pos_reservations', 'pos_table_timers', 'pos_kds_stations') then
    return null;
  end if;
  if p_key in ('pos_owner', 'pos_telegram_config') then
    return case when coalesce((p_actor ->> 'owner')::boolean, false) then null else 'owner_only' end;
  end if;
  if p_key in ('pos_pin_rules', 'pos_override_enabled') then
    return case when pos_actor_right(p_actor, 'pinRules') then null else 'pin_rules_right' end;
  end if;
  if p_key = 'pos_categories' then
    return case when pos_actor_right(p_actor, 'categories') or pos_actor_right(p_actor, 'menu') then null else 'categories_right' end;
  end if;
  if p_key in ('pos_revenue_target_limit', 'pos_waiter_payroll_rules') then
    return case when pos_actor_right(p_actor, 'stats') then null else 'stats_right' end;
  end if;
  return case when pos_actor_right(p_actor, 'settings') then null else 'settings_right' end;
end;
$$;

-- Qurilma ishonchli bo'lmasa: xato (dastur yozuvni navbatda saqlaydi)
create or replace function public.pos_require_device()
returns pos_devices
language plpgsql volatile security definer set search_path = public
as $$
declare
  d pos_devices;
begin
  update pos_devices set last_seen_at = now() where session_id = pos_session_id() returning * into d;
  if d.session_id is null or d.status <> 'trusted' then
    raise exception 'pos_device_not_trusted' using errcode = '42501',
      hint = 'Qurilma tasdiqlanmagan: Ega yoki admin tasdiqlashi kerak';
  end if;
  return d;
end;
$$;

-- Yozuvlarni yuborish (dastur: src/sync/supabaseTransport.js). Har bir qator alohida tekshiriladi:
-- ruxsat yo'q qator rad etiladi, qolganlari saqlanadi (bitta qator butun navbatni to'xtatmaydi)
create or replace function public.pos_push_records(p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  d         pos_devices := pos_require_device();
  v_actor   jsonb := pos_actor();
  v_full    boolean := d.full_access or coalesce(d.bootstrap_until > now(), false);
  r         jsonb;
  v_col     text;
  v_id      text;
  v_data    jsonb;
  v_del     boolean;
  v_old     pos_records;
  v_reason  text;
  v_store   jsonb;
  v_ok      integer := 0;
  v_rej     jsonb := '[]'::jsonb;
  v_changed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows massiv bo''lishi kerak';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_col := r ->> 'collection';
    v_id := r ->> 'id';
    v_data := case when jsonb_typeof(r -> 'data') = 'object' then r -> 'data' else '{}'::jsonb end;
    v_del := coalesce((r ->> 'deleted')::boolean, false);
    if v_col is null or v_col !~ '^pos_[a-z_]{1,40}$' or coalesce(v_id, '') = '' or length(v_id) > 200 then
      v_rej := v_rej || jsonb_build_object('collection', v_col, 'id', v_id, 'reason', 'bad_row');
      continue;
    end if;
    select * into v_old from pos_records where collection = v_col and id = v_id for update;
    v_reason := case when v_full then null else
      pos_record_write_reason(v_col, v_id, v_old.data, coalesce(v_old.deleted, false), v_data, v_del, v_actor) end;
    if v_reason is not null then
      v_rej := v_rej || jsonb_build_object('collection', v_col, 'id', v_id, 'reason', v_reason);
      continue;
    end if;
    v_store := v_data;
    if v_col = 'pos_users' and not v_del then
      v_store := pos_absorb_user_secrets(v_id, v_data);
      if v_store is distinct from v_data then
        v_changed := v_changed || jsonb_build_object('collection', v_col, 'id', v_id, 'data', v_store);
      end if;
    end if;
    insert into pos_records (collection, id, data, deleted, updated_by)
    values (v_col, v_id, v_store, v_del, left(r ->> 'updated_by', 100))
    on conflict (collection, id) do update
      set data = excluded.data, deleted = excluded.deleted, updated_by = excluded.updated_by;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('ok', v_ok, 'rejected', v_rej, 'changed', v_changed);
end;
$$;

create or replace function public.pos_push_kv(p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  d        pos_devices := pos_require_device();
  v_actor  jsonb := pos_actor();
  v_full   boolean := d.full_access or coalesce(d.bootstrap_until > now(), false);
  r        jsonb;
  v_key    text;
  v_old    pos_kv;
  v_reason text;
  v_ok     integer := 0;
  v_rej    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows massiv bo''lishi kerak';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_key := r ->> 'key';
    if v_key is null or v_key !~ '^pos_[a-z_]{1,40}$' then
      v_rej := v_rej || jsonb_build_object('key', v_key, 'reason', 'bad_row');
      continue;
    end if;
    select * into v_old from pos_kv where key = v_key for update;
    v_reason := case when v_full then null else
      pos_kv_write_reason(v_key, v_old.value, v_old.key is not null, r -> 'value', v_actor) end;
    if v_reason is not null then
      v_rej := v_rej || jsonb_build_object('key', v_key, 'reason', v_reason);
      continue;
    end if;
    insert into pos_kv (key, value, updated_by)
    values (v_key, r -> 'value', left(r ->> 'updated_by', 100))
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('ok', v_ok, 'rejected', v_rej);
end;
$$;

-- ============================================================
-- 6) Qurilma va xodimning kirishi
-- ============================================================
create or replace function public.pos_device_state(d pos_devices)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'installed', true,
    'version', 1,
    'status', d.status,
    'label', d.label,
    'session', d.session_id,
    'staff', case when d.staff_id is not null and d.staff_until > now()
      then jsonb_build_object('id', d.staff_id, 'name', d.staff_name, 'until', d.staff_until) end,
    'hidden', to_jsonb(pos_hidden_collections()),
    'locked_s', greatest(0, ceil(extract(epoch from (d.locked_until - now()))))::integer
  )
$$;

-- Dastur ochilganda va har bir necha daqiqada: qurilmani yozadi (yangisi - tasdiqlanmagan),
-- holatini va nimani ko'ra olishini qaytaradi
create or replace function public.pos_device_hello(p_device_key text default '', p_label text default '', p_user_agent text default '')
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_sid   uuid := pos_session_id();
  v_sub   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  v_uid   uuid := case when v_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_sub::uuid end;
  v_first boolean;
  d       pos_devices;
begin
  if v_sid is null then
    return jsonb_build_object('installed', true, 'status', 'no_session');
  end if;
  -- Yangi kafe (hali ishonchli qurilma ham, PIN ham yo'q): birinchi qurilma o'zi ishonchli
  v_first := not exists (select 1 from pos_devices where status = 'trusted')
         and not exists (select 1 from pos_staff_secrets where pin_hash is not null);
  insert into pos_devices (session_id, auth_uid, device_key, label, user_agent, status, approved_at, approved_by, bootstrap_until)
  values (v_sid, v_uid,
          left(p_device_key, 80), left(coalesce(p_label, ''), 60), left(p_user_agent, 300),
          case when v_first then 'trusted' else 'pending' end,
          case when v_first then now() end, case when v_first then 'birinchi qurilma' end,
          case when v_first then now() + interval '1 hour' end)
  on conflict (session_id) do update
    set last_seen_at = now(),
        device_key = coalesce(nullif(excluded.device_key, ''), pos_devices.device_key),
        user_agent = coalesce(nullif(excluded.user_agent, ''), pos_devices.user_agent),
        label = case when pos_devices.label = '' then excluded.label else pos_devices.label end,
        staff_until = case when pos_devices.staff_until > now() then now() + interval '12 hours'
                           else pos_devices.staff_until end
  returning * into d;
  return pos_device_state(d);
end;
$$;

-- Xato urinish: 5 tadan keyin qurilma 30 s, keyin har safar 2 baravar (15 daqiqagacha) bloklanadi
create or replace function public.pos_register_failure(p_sid uuid, p_trusted boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  d pos_devices;
begin
  insert into pos_auth_failures (session_id, trusted) values (p_sid, p_trusted);
  delete from pos_auth_failures where at < now() - interval '1 day';
  update pos_devices
     set fail_count = fail_count + 1,
         locked_until = case when fail_count + 1 >= 5
           then now() + make_interval(secs => least(900, 30 * power(2, least(fail_count + 1 - 5, 10))))
           else locked_until end
   where session_id = p_sid
  returning * into d;
  return jsonb_build_object('ok', false, 'reason', 'wrong',
    'attempts_left', greatest(0, 5 - coalesce(d.fail_count, 5)),
    'wait_s', greatest(0, ceil(extract(epoch from (d.locked_until - now()))))::integer);
end;
$$;

-- PIN (va Authenticator kodi) ni serverda tekshirish.
--  p_mode: 'login'   - xodim shu qurilmada kirdi (server unga rol bo'yicha ma'lumot beradi)
--          'verify'  - faqat tekshirish (rahbar tasdig'i, avto-qulf)
--          'approve' - tasdiqlanmagan qurilmani Ega yoki "Tizim sozlamalari" huquqli admin tasdiqlaydi
--  p_group: 'management' (admin, omborchi) | 'staff' | null (hamma)
--  p_code_kind: 'totp' | 'backup'
create or replace function public.pos_pin_check(
  p_pin text, p_code text default null, p_mode text default 'login', p_group text default null,
  p_code_kind text default 'totp', p_label text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_sid   uuid := pos_session_id();
  d       pos_devices;
  v_pin   text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  m       record;
  v_found boolean := false;
  v_uid   text;
  v_data  jsonb;
  v_sec   pos_staff_secrets;
  v_role  text;
  v_step  bigint;
  v_idx   integer;
  v_owner text;
  v_tf    jsonb;
begin
  if p_mode not in ('login', 'verify', 'approve') then
    raise exception 'p_mode noto''g''ri';
  end if;
  select * into d from pos_devices where session_id = v_sid for update;
  if d.session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_device');
  end if;
  if d.status = 'revoked' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if p_mode <> 'approve' and d.status <> 'trusted' then
    return jsonb_build_object('ok', false, 'reason', 'device');
  end if;
  if d.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'wait_s', ceil(extract(epoch from (d.locked_until - now())))::integer);
  end if;
  -- Tasdiqlanmagan qurilmalardan umumiy cheklov: kafe paroli bilan ko'p sessiya ochib PIN terib bo'lmasin
  if d.status <> 'trusted' and (select count(*) from pos_auth_failures
                                  where not trusted and at > now() - interval '15 minutes') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'wait_s', 900);
  end if;
  if length(v_pin) < 4 or length(v_pin) > 8 then
    return pos_register_failure(v_sid, d.status = 'trusted');
  end if;

  for m in
    select s.user_id, r.data
      from pos_staff_secrets s
      join pos_records r on r.collection = 'pos_users' and r.id = s.user_id and not r.deleted
     where s.pin_hash is not null and s.pin_length = length(v_pin)
       and (p_group is null
            or (p_group = 'management') = (lower(coalesce(r.data ->> 'role', '')) in ('admin', 'warehouse', 'omborchi')))
       and (p_mode <> 'approve' or lower(coalesce(r.data ->> 'role', '')) = 'admin')
     order by s.pin_set_at desc
  loop
    select * into v_sec from pos_staff_secrets where user_id = m.user_id;
    if pos_pin_matches(v_sec.pin_hash, v_pin) then
      v_found := true;
      v_uid := m.user_id;
      v_data := m.data;
      exit;
    end if;
  end loop;
  if not v_found then
    return pos_register_failure(v_sid, d.status = 'trusted');
  end if;
  v_role := lower(coalesce(v_data ->> 'role', ''));

  -- Ikkinchi bosqich (Authenticator yoki zaxira kod)
  if v_sec.two_factor is not null then
    if coalesce(p_code, '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'need_code', 'user_id', v_uid,
        'name', coalesce(v_data ->> 'name', ''));
    end if;
    if p_code_kind = 'backup' then
      v_idx := pos_backup_code_index(v_sec.two_factor -> 'backupCodes', p_code);
      if v_idx < 0 then
        return pos_register_failure(v_sid, d.status = 'trusted') || jsonb_build_object('reason', 'bad_code');
      end if;
      update pos_staff_secrets
         set two_factor = jsonb_set(two_factor, '{backupCodes}', (two_factor -> 'backupCodes') - v_idx),
             updated_at = now()
       where user_id = v_uid
      returning * into v_sec;
      -- Qolgan zaxira kodlar soni boshqa qurilmalarda ham ko'rinsin
      update pos_records set data = pos_public_user(v_uid, data), updated_by = 'server'
       where collection = 'pos_users' and id = v_uid;
    else
      v_step := pos_totp_step(v_sec.two_factor ->> 'secret', p_code);
      if v_step is null then
        return pos_register_failure(v_sid, d.status = 'trusted') || jsonb_build_object('reason', 'bad_code');
      end if;
      if v_step <= v_sec.last_step then
        return jsonb_build_object('ok', false, 'reason', 'reused');
      end if;
      update pos_staff_secrets set last_step = v_step where user_id = v_uid;
    end if;
  end if;

  update pos_devices set fail_count = 0, locked_until = null, last_seen_at = now() where session_id = v_sid;

  if p_mode = 'approve' then
    v_owner := pos_owner_id();
    if not (v_owner = v_uid or pos_has_right(v_data, v_uid, v_owner, 'settings')) then
      return jsonb_build_object('ok', false, 'reason', 'not_allowed', 'name', coalesce(v_data ->> 'name', ''));
    end if;
    update pos_devices
       set status = 'trusted', approved_at = now(), approved_by = coalesce(v_data ->> 'name', ''),
           label = coalesce(nullif(left(p_label, 60), ''), label)
     where session_id = v_sid
    returning * into d;
    return jsonb_build_object('ok', true, 'user_id', v_uid, 'name', coalesce(v_data ->> 'name', ''))
           || jsonb_build_object('device', pos_device_state(d));
  end if;

  if p_mode = 'login' then
    update pos_devices
       set staff_id = v_uid, staff_name = coalesce(v_data ->> 'name', ''), staff_until = now() + interval '12 hours'
     where session_id = v_sid
    returning * into d;
  else
    select * into d from pos_devices where session_id = v_sid;
  end if;

  select * into v_sec from pos_staff_secrets where user_id = v_uid;
  v_tf := v_sec.two_factor;
  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'name', coalesce(v_data ->> 'name', ''),
    'role', v_role,
    -- Shu qurilmada internetsiz ham kira olishi uchun (faqat shu xodimniki)
    'verifier', jsonb_build_object(
      'pinHash', v_sec.pin_hash, 'pinLength', v_sec.pin_length, 'pinSetAt', v_sec.pin_set_at,
      'twoFactor', v_tf, 'twoFactorAt', v_sec.two_factor_at),
    'device', pos_device_state(d)
  );
end;
$$;

-- Xodim chiqdi: qurilma yana oddiy (umumiy) ruxsatga qaytadi
create or replace function public.pos_staff_logout()
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  d pos_devices;
begin
  update pos_devices set staff_id = null, staff_name = null, staff_until = null, last_seen_at = now()
   where session_id = pos_session_id()
  returning * into d;
  if d.session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_device');
  end if;
  return jsonb_build_object('ok', true, 'device', pos_device_state(d));
end;
$$;

-- Yangi PIN bo'shmi (boshqa xodimda yo'qmi). Kimniki ekani aytilmaydi, urinish cheklangan (10 ta / 10 daqiqa)
create or replace function public.pos_pin_available(p_pin text, p_user_id text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  d       pos_devices := pos_require_device();
  v_actor jsonb := pos_actor();
  v_pin   text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_taken boolean;
begin
  if v_actor is null or (v_actor ->> 'role' <> 'admin' and v_actor ->> 'id' is distinct from p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'staff_login');
  end if;
  if d.probe_window is null or d.probe_window < now() - interval '10 minutes' then
    update pos_devices set probe_count = 0, probe_window = now() where session_id = d.session_id;
    d.probe_count := 0;
  end if;
  if d.probe_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'wait_s', ceil(extract(epoch from (d.probe_window + interval '10 minutes' - now())))::integer);
  end if;
  update pos_devices set probe_count = probe_count + 1 where session_id = d.session_id;
  select exists (
    select 1 from pos_staff_secrets s
      join pos_records r on r.collection = 'pos_users' and r.id = s.user_id and not r.deleted
     where s.pin_hash is not null and s.pin_length = length(v_pin)
       and s.user_id is distinct from p_user_id
       and pos_pin_matches(s.pin_hash, v_pin)
  ) into v_taken;
  return jsonb_build_object('ok', true, 'available', not v_taken);
end;
$$;

-- "📱 Qurilmalar" ro'yxati: Ega yoki "Tizim sozlamalari" huquqli admin (shu qurilmada kirgan bo'lishi kerak)
create or replace function public.pos_device_list()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_actor jsonb := pos_actor();
begin
  if not pos_device_ok() or not pos_actor_right(v_actor, 'settings') then
    return jsonb_build_object('ok', false, 'reason', 'settings_right');
  end if;
  return jsonb_build_object('ok', true, 'devices', coalesce((
    select jsonb_agg(jsonb_build_object(
      'session', d.session_id, 'label', d.label, 'status', d.status, 'device_key', d.device_key,
      'user_agent', d.user_agent, 'created_at', d.created_at, 'approved_at', d.approved_at,
      'approved_by', d.approved_by, 'last_seen_at', d.last_seen_at,
      'staff', case when d.staff_until > now() then d.staff_name end,
      'locked', d.locked_until > now(),
      'current', d.session_id = pos_session_id()
    ) order by (d.status = 'pending') desc, d.last_seen_at desc)
    from pos_devices d
  ), '[]'::jsonb));
end;
$$;

-- p_action: 'approve' | 'revoke' | 'rename' | 'forget' (bekor qilingan qurilmani ro'yxatdan olib tashlash)
create or replace function public.pos_device_update(p_session uuid, p_action text, p_label text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_actor jsonb := pos_actor();
  d       pos_devices;
begin
  if not pos_device_ok() or not pos_actor_right(v_actor, 'settings') then
    return jsonb_build_object('ok', false, 'reason', 'settings_right');
  end if;
  if p_action in ('revoke', 'forget') and p_session = pos_session_id() then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if p_action = 'approve' then
    update pos_devices set status = 'trusted', approved_at = now(), approved_by = v_actor ->> 'name',
           fail_count = 0, locked_until = null,
           label = coalesce(nullif(left(p_label, 60), ''), label)
     where session_id = p_session returning * into d;
  elsif p_action = 'revoke' then
    update pos_devices set status = 'revoked', staff_id = null, staff_name = null, staff_until = null
     where session_id = p_session returning * into d;
  elsif p_action = 'rename' then
    update pos_devices set label = left(coalesce(p_label, ''), 60)
     where session_id = p_session returning * into d;
  elsif p_action = 'forget' then
    delete from pos_devices where session_id = p_session and status <> 'trusted' returning * into d;
  else
    raise exception 'p_action noto''g''ri';
  end if;
  if d.session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- 7) Rasm ombori va QR so'rovini qabul qilish (storage.sql, qr.sql shu funksiyalarni chaqiradi)
-- ============================================================
-- Taom rasmini yuklash/o'chirish: ishonchli qurilmada "Taomlar" huquqli admin (yoki yangi kafe)
create or replace function public.pos_storage_write_ok()
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  d pos_devices;
begin
  select * into d from pos_devices where session_id = pos_session_id();
  if d.session_id is null or d.status <> 'trusted' then
    return false;
  end if;
  if d.full_access or coalesce(d.bootstrap_until > now(), false) then
    return true;
  end if;
  return pos_actor_right(pos_actor(), 'menu');
end;
$$;

create or replace function public.pos_staff_device_ok()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.pos_device_ok() $$;

-- Rasm ombori qoidalari (storage.sql bilan bir xil): avval storage.sql eski versiyada ishga tushirilgan
-- bo'lsa ham yozish shu yerda yopiladi
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "menu_images_insert" on storage.objects;
    create policy "menu_images_insert" on storage.objects
      for insert to authenticated with check (bucket_id = 'menu-images' and public.pos_storage_write_ok());
    drop policy if exists "menu_images_update" on storage.objects;
    create policy "menu_images_update" on storage.objects
      for update to authenticated using (bucket_id = 'menu-images' and public.pos_storage_write_ok())
      with check (bucket_id = 'menu-images' and public.pos_storage_write_ok());
    drop policy if exists "menu_images_delete" on storage.objects;
    create policy "menu_images_delete" on storage.objects
      for delete to authenticated using (bucket_id = 'menu-images' and public.pos_storage_write_ok());
  end if;
end;
$$;

-- ============================================================
-- 8) Ruxsatlar: jadvallar emas, faqat shu funksiyalar ochiq
-- ============================================================
revoke all on function public.pos_session_id() from public, anon;
revoke all on function public.pos_created_order(text) from public, anon, authenticated;
revoke all on function public.pos_owner_id() from public, anon, authenticated;
revoke all on function public.pos_has_right(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.pos_actor() from public, anon, authenticated;
revoke all on function public.pos_actor_right(jsonb, text) from public, anon, authenticated;
revoke all on function public.pos_device_ok() from public, anon;
revoke all on function public.pos_hidden_collections() from public, anon;
revoke all on function public.pos_pin_digest(text, text, integer) from public, anon, authenticated;
revoke all on function public.pos_valid_pin_hash(text) from public, anon, authenticated;
revoke all on function public.pos_pin_matches(text, text) from public, anon, authenticated;
revoke all on function public.pos_make_pin_hash(text) from public, anon, authenticated;
revoke all on function public.pos_is_sample_pin(text, integer) from public, anon, authenticated;
revoke all on function public.pos_base32_decode(text) from public, anon, authenticated;
revoke all on function public.pos_hotp(bytea, bigint) from public, anon, authenticated;
revoke all on function public.pos_totp_step(text, text) from public, anon, authenticated;
revoke all on function public.pos_backup_code_index(jsonb, text) from public, anon, authenticated;
revoke all on function public.pos_public_user(text, jsonb) from public, anon, authenticated;
revoke all on function public.pos_absorb_user_secrets(text, jsonb) from public, anon, authenticated;
revoke all on function public.pos_user_write_reason(text, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.pos_record_write_reason(text, text, jsonb, boolean, jsonb, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.pos_kv_write_reason(text, jsonb, boolean, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pos_require_device() from public, anon, authenticated;
revoke all on function public.pos_device_state(public.pos_devices) from public, anon, authenticated;
revoke all on function public.pos_register_failure(uuid, boolean) from public, anon, authenticated;
revoke all on function public.pos_storage_write_ok() from public, anon;
revoke all on function public.pos_staff_device_ok() from public, anon;

revoke all on function public.pos_push_records(jsonb) from public, anon;
revoke all on function public.pos_push_kv(jsonb) from public, anon;
revoke all on function public.pos_device_hello(text, text, text) from public, anon;
revoke all on function public.pos_pin_check(text, text, text, text, text, text) from public, anon;
revoke all on function public.pos_staff_logout() from public, anon;
revoke all on function public.pos_pin_available(text, text) from public, anon;
revoke all on function public.pos_device_list() from public, anon;
revoke all on function public.pos_device_update(uuid, text, text) from public, anon;

-- RLS siyosatlari shu funksiyalarni chaqiradi (authenticated rolida)
grant execute on function public.pos_session_id() to authenticated;
grant execute on function public.pos_device_ok() to authenticated;
grant execute on function public.pos_hidden_collections() to authenticated;
grant execute on function public.pos_storage_write_ok() to authenticated;
grant execute on function public.pos_staff_device_ok() to authenticated;

grant execute on function public.pos_push_records(jsonb) to authenticated;
grant execute on function public.pos_push_kv(jsonb) to authenticated;
grant execute on function public.pos_device_hello(text, text, text) to authenticated;
grant execute on function public.pos_pin_check(text, text, text, text, text, text) to authenticated;
grant execute on function public.pos_staff_logout() to authenticated;
grant execute on function public.pos_pin_available(text, text) to authenticated;
grant execute on function public.pos_device_list() to authenticated;
grant execute on function public.pos_device_update(uuid, text, text) to authenticated;

-- Supabase API (PostgREST) yangi funksiyalarni darhol ko'rsin
notify pgrst, 'reload schema';
