-- Server xavfsizligi sinovi (supabase/security.sql). Ishga tushirish: scripts/sql-test/run.sh
\set ON_ERROR_STOP 1
-- Yordamchilar (postgres sifatida)
create or replace function pg_temp.as_session(p_sid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'session_id', p_sid, 'role', 'authenticated')::text, false);
end $$;
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok: %', p_msg;
end $$;

-- RFC 4226 test vektori: "12345678901234567890", hisoblagich 1 -> 287082
select pg_temp.check(pos_hotp(pos_base32_decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), 1) = '287082', 'HOTP RFC vektori');
select pg_temp.check(pos_hotp(pos_base32_decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), 0) = '755224', 'HOTP RFC vektori 0');

-- ---------- 1. Tasdiqlanmagan yangi qurilma ----------
select pg_temp.as_session('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select pg_temp.check(pos_device_hello('dev_new', 'Planshet', 'UA') ->> 'status' = 'pending', 'yangi qurilma - pending');
select pg_temp.check((select count(*) from pos_records) = 0, 'pending qurilma hech narsa o''qimaydi');
select pg_temp.check((select count(*) from pos_kv) = 0, 'pending qurilma sozlamalarni o''qimaydi');
do $$ begin
  perform pos_push_records('[{"collection":"pos_orders","id":"x","data":{"id":"x"}}]');
  raise exception 'FAIL: pending push o''tdi';
exception when insufficient_privilege then raise notice 'ok: pending qurilma yoza olmaydi';
end $$;
do $$ begin
  insert into pos_records (collection, id, data) values ('pos_orders', 'y', '{}');
  raise exception 'FAIL: to''g''ridan-to''g''ri insert o''tdi';
exception when insufficient_privilege then raise notice 'ok: jadvalga to''g''ridan-to''g''ri yozib bo''lmaydi';
end $$;
select pg_temp.check(qr_claim_request('q1', 'accepted', 'x') ->> 'ok' = 'false', 'pending qurilma QR so''rovni ololmaydi');
select pg_temp.check(pos_pin_check('2222', null, 'login', 'staff') ->> 'reason' = 'device', 'pending qurilmada login yo''q');
select pg_temp.check(pos_pin_check('2222', null, 'approve') ->> 'reason' = 'wrong', 'ofitsiant PIN bilan tasdiqlab bo''lmaydi');
do $$ begin
  perform 1 from pos_staff_secrets;
  raise exception 'FAIL: sirlar o''qildi';
exception when insufficient_privilege then raise notice 'ok: pos_staff_secrets yopiq';
end $$;
reset role;

-- ---------- 2. Ishonchli qurilma, hech kim kirmagan ----------
select pg_temp.as_session('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.check(pos_device_hello('dev_old', '', 'UA') ->> 'status' = 'trusted', 'eski qurilma - trusted');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_users') = 6, 'xodimlar ko''rinadi');
select pg_temp.check((select count(*) from pos_records where data::text like '%pinHash%' or data::text like '%secret%') = 0, 'xodim yozuvida sir yo''q');
select pg_temp.check((select count(*) from pos_records where collection in ('pos_customers','pos_expenses','pos_audit_logs')) = 0, 'mijoz/xarajat/audit yashirin');
select pg_temp.check((select count(*) from pos_kv) = 2, 'sozlamalar ko''rinadi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_orders","id":"o2","data":{"id":"o2","table":"2-Stol"},"updated_by":"dev_old"}]') -> 'rejected') = 0, 'buyurtma yoziladi');
select pg_temp.check(pos_push_records('[{"collection":"pos_menu","id":"m1","data":{"id":"m1","name":"Osh","price":1,"is_available":true}}]') -> 'rejected' -> 0 ->> 'reason' = 'menu_right', 'narxni o''zgartirib bo''lmaydi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_menu","id":"m1","data":{"id":"m1","name":"Osh","price":30000,"is_available":false}}]') -> 'rejected') = 0, 'stop-list belgisi o''zgaradi');
select pg_temp.check(pos_push_records('[{"collection":"pos_users","id":"3","data":{"id":3,"name":"Ali","role":"admin"}}]') -> 'rejected' -> 0 ->> 'reason' = 'staff_login', 'xodimni o''zgartirib bo''lmaydi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_audit_logs","id":"a2","data":{"id":"a2"}}]') -> 'rejected') = 0, 'auditga qo''shiladi');
select pg_temp.check(pos_push_records('[{"collection":"pos_audit_logs","id":"a1","data":{},"deleted":true}]') -> 'rejected' -> 0 ->> 'reason' = 'audit_append_only', 'auditni o''chirib bo''lmaydi');
select pg_temp.check(pos_push_records('[{"collection":"pos_orders","id":"o1","data":{},"deleted":true}]') -> 'rejected' -> 0 ->> 'reason' = 'orders_delete', 'chekni o''chirib bo''lmaydi');
select pg_temp.check(pos_push_kv('[{"key":"pos_cafe_name","value":"Boshqa"}]') -> 'rejected' -> 0 ->> 'reason' = 'settings_right', 'kafe nomini o''zgartirib bo''lmaydi');
select pg_temp.check(jsonb_array_length(pos_push_kv('[{"key":"pos_table_timers","value":{"1-Stol":1}}]') -> 'rejected') = 0, 'stol taymeri yoziladi');
select pg_temp.check(jsonb_array_length(pos_push_kv('[{"key":"pos_cafe_name","value":"Kafe"}]') -> 'rejected') = 0, 'o''zgarmagan qiymat qabul qilinadi');
select pg_temp.check(not pos_storage_write_ok(), 'rasm yuklash yopiq');

-- ---------- 3. Xodimlar kirishi ----------
select pg_temp.check(pos_pin_check('2222', null, 'login', 'management') ->> 'reason' = 'wrong', 'ofitsiant PIN boshqaruv guruhida emas');
select pg_temp.check((pos_pin_check('2222', null, 'login', 'staff') ->> 'user_id') = '3', 'ofitsiant kirdi');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_customers') = 0, 'ofitsiantga mijozlar yashirin');
select pg_temp.check((pos_pin_check('1111', null, 'login', 'staff') -> 'verifier' ->> 'pinLength') = '4', 'kassir kirdi (ochiq PIN xeshga o''tgan)');
select pg_temp.check((select count(*) from pos_records where collection in ('pos_customers','pos_expenses')) = 2, 'kassirga mijoz va xarajat ko''rinadi');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_audit_logs') = 0, 'kassirga audit yashirin');
select pg_temp.check(pos_staff_logout() ->> 'ok' = 'true', 'chiqish');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_customers') = 0, 'chiqqach yana yashirin');

-- Xato PIN: 5 ta -> blok
select pos_pin_check('9999', null, 'login', 'staff');
select pos_pin_check('9999', null, 'login', 'staff');
select pos_pin_check('9999', null, 'login', 'staff');
select pos_pin_check('9999', null, 'login', 'staff');
select pg_temp.check((pos_pin_check('9999', null, 'login', 'staff') ->> 'wait_s')::int >= 29, '5 xatodan keyin blok');
select pg_temp.check(pos_pin_check('2222', null, 'login', 'staff') ->> 'reason' = 'locked', 'blokda to''g''ri PIN ham kutadi');
reset role;
update pos_devices set locked_until = null, fail_count = 0;
set role authenticated;

-- ---------- 4. Ega (Admin, 123456) ----------
reset role;
select pos_make_pin_hash('246810') as h1, pos_make_pin_hash('2222') as h2 \gset
set role authenticated;
select pg_temp.check((pos_pin_check('123456', null, 'login', 'management') -> 'device' -> 'hidden') = '[]'::jsonb, 'Ega hammasini ko''radi');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_audit_logs') = 2, 'Egaga audit ko''rinadi');
select pg_temp.check(pos_storage_write_ok(), 'Ega rasm yuklaydi');
-- Ofitsiantga yangi PIN (pinSetAt katta)
select pg_temp.check(jsonb_array_length(pos_push_records(format('[{"collection":"pos_users","id":"3","data":{"id":3,"name":"Ali","role":"waiter","canSeeSales":true,"pinHash":"%s","pinLength":6,"pinSetAt":1800000000000}}]',
  :'h1')::jsonb) -> 'rejected') = 0, 'Ega ofitsiantga yangi PIN berdi');
-- Eski keshdagi PIN (pinSetAt 0) qaytib kelmaydi
select pg_temp.check(pos_push_records(format('[{"collection":"pos_users","id":"3","data":{"id":3,"name":"Ali2","role":"waiter","canSeeSales":true,"pinHash":"%s","pinLength":4,"pinSetAt":0}}]',
  :'h2')::jsonb) -> 'changed' -> 0 -> 'data' ->> 'pinLength' = '6', 'eski PIN yozuv bilan qaytmaydi');
select pg_temp.check(pos_pin_check('2222', null, 'verify') ->> 'ok' = 'false', 'eski PIN ishlamaydi');
select pg_temp.check(pos_pin_check('246810', null, 'verify') ->> 'user_id' = '3', 'yangi PIN ishlaydi');
select pg_temp.check((pos_pin_available('246810', '1') ->> 'available') = 'false', 'band PIN aniqlanadi');
select pg_temp.check((pos_pin_available('246811', '1') ->> 'available') = 'true', 'bo''sh PIN');
select pg_temp.check(jsonb_array_length(pos_push_kv('[{"key":"pos_cafe_name","value":"Yangi nom"}]') -> 'rejected') = 0, 'Ega sozlamani o''zgartiradi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_audit_logs","id":"a1","data":{},"deleted":true}]') -> 'rejected') = 0, 'Ega jurnalni tozalaydi');
select pg_temp.check((pos_device_list() -> 'devices' -> 0 ->> 'status') = 'pending', 'qurilmalar ro''yxati (pending birinchi)');
select pg_temp.check(pos_device_update('aaaaaaaa-0000-0000-0000-000000000001', 'revoke') ->> 'reason' = 'self', 'o''zini bloklay olmaydi');

-- ---------- 5. Cheklangan admin (Admin2: staff + addAdmins + stats, settings/menu/logs yo'q) ----------
select pg_temp.check((pos_pin_check('654321', null, 'login', 'management') -> 'device' -> 'hidden') = '["pos_audit_logs"]'::jsonb, 'Admin2: faqat audit yashirin');
select pg_temp.check(pos_push_records('[{"collection":"pos_users","id":"1","data":{"id":1,"name":"X","role":"admin"}}]') -> 'rejected' -> 0 ->> 'reason' = 'owner_locked', 'Egani o''zgartirib bo''lmaydi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_users","id":"2","data":{"id":2,"name":"Sardor K","role":"cashier"}}]') -> 'rejected') = 0, 'Admin2 kassirni tahrirlaydi');
select pg_temp.check(pos_push_records('[{"collection":"pos_users","id":"user_new1","data":{"id":"user_new1","name":"A3","role":"admin","appointedBy":"user_1732000000000_ab","adminRights":{"settings":true}}}]') -> 'rejected' -> 0 ->> 'reason' = 'grant_right', 'o''zida yo''q huquqni bera olmaydi');
select pg_temp.check(jsonb_array_length(pos_push_records('[{"collection":"pos_users","id":"user_new2","data":{"id":"user_new2","name":"A4","role":"admin","appointedBy":"user_1732000000000_ab","adminRights":{"stats":true,"warehouse":false,"waiter":true,"cashier":false,"kitchen":false,"courier":false,"menu":false,"categories":false,"staff":true,"logs":false,"settings":false,"approve":false,"pinRules":false,"addAdmins":false}}}]') -> 'rejected') = 0, 'o''zidagi huquq bilan admin tayinlaydi');
select pg_temp.check(pos_push_records('[{"collection":"pos_users","id":"user_1732000000001_cd","data":{"id":"user_1732000000001_cd","name":"T","role":"admin"}}]') -> 'rejected' -> 0 ->> 'reason' = 'not_appointer', 'boshqa tayinlagan adminni o''zgartira olmaydi');
select pg_temp.check(pos_push_kv('[{"key":"pos_cafe_name","value":"Z"}]') -> 'rejected' -> 0 ->> 'reason' = 'settings_right', 'Admin2 sozlamani o''zgartira olmaydi');
select pg_temp.check(pos_push_kv('[{"key":"pos_owner","value":{"id":"user_1732000000000_ab"}}]') -> 'rejected' -> 0 ->> 'reason' = 'owner_only', 'egalikni o''zi ola olmaydi');
select pg_temp.check(pos_device_list() ->> 'reason' = 'settings_right', 'Admin2 qurilmalarni ko''rmaydi');
select pg_temp.check(not pos_storage_write_ok(), 'Admin2 rasm yuklay olmaydi (menu yo''q)');
-- O'z ismini o'zgartiradi, o'z huquqini emas
select pg_temp.check(jsonb_array_length(pos_push_records((select jsonb_build_array(jsonb_build_object('collection','pos_users','id',id,'data', data || '{"name":"Admin Ikki"}')) from pos_records where collection='pos_users' and id='user_1732000000000_ab')) -> 'rejected') = 0, 'o''z ismini o''zgartiradi');
select pg_temp.check(pos_push_records((select jsonb_build_array(jsonb_build_object('collection','pos_users','id',id,'data', jsonb_set(data, '{adminRights,settings}', 'true'))) from pos_records where collection='pos_users' and id='user_1732000000000_ab')) -> 'rejected' -> 0 ->> 'reason' = 'self_fields', 'o''z huquqini o''zgartira olmaydi');

-- ---------- 6. Ikki bosqichli kirish ----------
reset role;
select pos_hotp(pos_base32_decode('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), floor(extract(epoch from now()) / 30)::bigint) as code \gset
set role authenticated;
select pg_temp.check(pos_pin_check('111222', null, 'login', 'management') ->> 'reason' = 'need_code', 'kod so''raladi');
select pg_temp.check(pos_pin_check('111222', '000000', 'login', 'management') ->> 'reason' = 'bad_code', 'noto''g''ri kod');
select pg_temp.check(pos_pin_check('111222', :'code', 'login', 'management') -> 'verifier' -> 'twoFactor' ->> 'secret' = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'kod bilan kirdi, sir shu qurilmaga berildi');
select pg_temp.check(pos_pin_check('111222', :'code', 'verify', 'management') ->> 'reason' = 'reused', 'bir kod ikki marta ishlamaydi');
select pg_temp.check(pos_pin_check('111222', '12345-67890', 'verify', 'management', 'backup') ->> 'ok' = 'true', 'zaxira kod ishladi');
select pg_temp.check(pos_pin_check('111222', '1234567890', 'verify', 'management', 'backup') ->> 'reason' = 'bad_code', 'zaxira kod bir martalik');
select pg_temp.check((select (data ->> 'backupCodesLeft')::int from pos_records where id = 'user_1732000000001_cd') = 1, 'qolgan zaxira kod soni yozuvda');

-- ---------- 7. Yangi qurilmani tasdiqlash ----------
reset role;
update pos_devices set locked_until = null, fail_count = 0;
select pg_temp.as_session('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select pg_temp.check(pos_pin_check('654321', null, 'approve') ->> 'reason' = 'not_allowed', 'sozlama huquqisiz admin tasdiqlay olmaydi');
select pg_temp.check(pos_pin_check('123456', null, 'approve', null, 'totp', 'Oshxona planshet') -> 'device' ->> 'status' = 'trusted', 'Ega PIN bilan tasdiqladi');
select pg_temp.check((select count(*) from pos_records where collection = 'pos_orders') >= 1, 'tasdiqlangan qurilma o''qiydi');
reset role;

-- ---------- 8. Bekor qilish (Ega boshqa qurilmadan) ----------
select pg_temp.as_session('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select pos_pin_check('123456', null, 'login', 'management');
select pg_temp.check(pos_device_update('bbbbbbbb-0000-0000-0000-000000000002', 'revoke') ->> 'ok' = 'true', 'qurilma bloklandi');
reset role;
select pg_temp.as_session('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select pg_temp.check((select count(*) from pos_records) = 0, 'bloklangan qurilma o''qimaydi');
select pg_temp.check(pos_device_hello('dev_new', '', '') ->> 'status' = 'revoked', 'holati revoked');
reset role;

-- ---------- 9. Anon (mijoz telefoni) ----------
set role anon;
select pg_temp.check((select count(*) from pos_records) = 0, 'anon hech narsa o''qimaydi');
do $$ begin
  perform pos_device_hello('x', '', '');
  raise exception 'FAIL: anon hello';
exception when insufficient_privilege then raise notice 'ok: anon server funksiyasini chaqira olmaydi';
end $$;
reset role;
select 'HAMMASI O''TDI' as natija;
