-- Cafe POS: Supabase sxemasi (3-bosqich, pilot)
-- Supabase Dashboard -> SQL Editor -> shu faylni to'liq joylab, "Run" bosing.
-- Qayta ishga tushirish xavfsiz: mavjud jadval va ma'lumotlar o'chirilmaydi.

-- 1) Yozuvlar: buyurtmalar, menyu, xodimlar, ombor, mijozlar, xarajatlar, jurnallar.
--    Har bir yozuv alohida qator: ikki qurilma turli buyurtmalarni bir vaqtda o'zgartirsa,
--    biri ikkinchisini o'chirib yubormaydi.
create table if not exists public.pos_records (
  collection  text        not null,               -- masalan: 'pos_orders'
  id          text        not null,               -- yozuvning id si
  data        jsonb       not null default '{}'::jsonb,
  deleted     boolean     not null default false, -- o'chirilgan yozuv (boshqa qurilmalar ham o'chirishi uchun)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text,                               -- qaysi qurilma yozgani
  primary key (collection, id)
);
create index if not exists pos_records_updated_at_idx on public.pos_records (updated_at);

-- 2) Sozlamalar: kafe nomi, xizmat haqi, stollar, kategoriyalar, Telegram va boshqalar.
create table if not exists public.pos_kv (
  key         text        primary key,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists pos_kv_updated_at_idx on public.pos_kv (updated_at);

-- 3) updated_at ni server vaqti bilan yangilash
create or replace function public.pos_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pos_records_touch on public.pos_records;
create trigger pos_records_touch before insert or update on public.pos_records
  for each row execute function public.pos_touch_updated_at();

drop trigger if exists pos_kv_touch on public.pos_kv;
create trigger pos_kv_touch before insert or update on public.pos_kv
  for each row execute function public.pos_touch_updated_at();

-- 4) Xavfsizlik (RLS): faqat tizimga kirgan qurilmalar o'qiy va yoza oladi.
--    Saytdagi "anon" kalit bilan, kirmasdan, hech narsa o'qib bo'lmaydi.
alter table public.pos_records enable row level security;
alter table public.pos_kv enable row level security;

drop policy if exists "pos_records_authenticated" on public.pos_records;
create policy "pos_records_authenticated" on public.pos_records
  for all to authenticated using (true) with check (true);

drop policy if exists "pos_kv_authenticated" on public.pos_kv;
create policy "pos_kv_authenticated" on public.pos_kv
  for all to authenticated using (true) with check (true);

-- 5) Real vaqt (Realtime): o'zgarishlar boshqa qurilmalarga darhol yetib borishi uchun
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_records') then
    alter publication supabase_realtime add table public.pos_records;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_kv') then
    alter publication supabase_realtime add table public.pos_kv;
  end if;
end;
$$;
