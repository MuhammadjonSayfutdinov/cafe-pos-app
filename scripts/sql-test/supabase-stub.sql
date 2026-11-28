-- Supabase muhitining kichik nusxasi: rollar, auth.sessions, auth.jwt(), storage, extensions (faqat sinov uchun)
-- Supabase muhitining kichik nusxasi (faqat sinov uchun)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated to postgres;
create schema auth;
create schema extensions;
create schema storage;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key, user_id uuid, created_at timestamptz default now());
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, extensions, storage to anon, authenticated;
grant all on storage.objects to authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
create publication supabase_realtime;
-- Supabase: public sxemadagi yangi jadval va funksiyalar anon/authenticated ga ochiq (RLS himoya qiladi)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
