-- Autonym Web: Supabase Schema Setup
-- Run this in your Supabase SQL Editor to create the store table and avatars bucket.

-- 1. Create table for storing Autonym state (acts, characters, lorebooks, etc.)
create table if not exists public.autonym_store (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.autonym_store enable row level security;

-- Policies to allow full access via your anon key (single-user / personal app)
drop policy if exists "Allow anon read autonym_store" on public.autonym_store;
create policy "Allow anon read autonym_store"
  on public.autonym_store for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow anon insert autonym_store" on public.autonym_store;
create policy "Allow anon insert autonym_store"
  on public.autonym_store for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow anon update autonym_store" on public.autonym_store;
create policy "Allow anon update autonym_store"
  on public.autonym_store for update
  to anon, authenticated
  using (true)
  with check (true);

-- 2. Create the avatars storage bucket for character images
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage policies for the avatars bucket
drop policy if exists "Public Access for Avatars" on storage.objects;
create policy "Public Access for Avatars"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Anon Upload for Avatars" on storage.objects;
create policy "Anon Upload for Avatars"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "Anon Update for Avatars" on storage.objects;
create policy "Anon Update for Avatars"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'avatars');

-- 3. Enable Realtime updates (so changes sync immediately across PC and phone)
alter publication supabase_realtime add table public.autonym_store;
