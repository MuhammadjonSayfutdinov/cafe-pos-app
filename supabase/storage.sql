-- Cafe POS: taom rasmlari ombori (Supabase Storage).
-- schema.sql dan KEYIN, SQL Editor'da ishga tushiring. Qayta ishga tushirish xavfsiz.
--
-- Admin -> Taomlar -> taom oynasida qo'shilgan rasmlar shu omborga yuklanadi
-- (src/utils/menuImages.ts, src/sync/supabaseTransport.js -> uploadPublicFile).
--
-- Xavfsizlik:
--  * O'qish ochiq: rasmlar mijoz menyusida (QR) kirishsiz ko'rinishi kerak. Omborda faqat
--    taom rasmlari turadi, boshqa hech narsa yo'q.
--  * Yuklash, almashtirish va o'chirish faqat kafe hisobi bilan ulangan qurilmadan (authenticated).
--    security.sql ishga tushirilgan bo'lsa: faqat ishonchli qurilmada kirgan "Taomlar" huquqli admin
--    (pos_storage_write_ok). Tartib muhim emas: ikkala fayl ham shu qoidani qo'yadi.
--  * Faqat rasm (webp, jpeg, png) va 2 MB gacha. Dastur rasmni yuklashdan oldin o'zi
--    kichraytiradi (taxminan 50-150 KB) va qayta chizadi: EXIF va rasm ichiga yashirilgan
--    boshqa ma'lumot o'chadi.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if to_regprocedure('public.pos_storage_write_ok()') is null then
    create function public.pos_storage_write_ok() returns boolean language sql stable as 'select true';
  end if;
end;
$$;

drop policy if exists "menu_images_select" on storage.objects;
create policy "menu_images_select" on storage.objects
  for select to authenticated using (bucket_id = 'menu-images');

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
