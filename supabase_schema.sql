-- Autonym Web: Supabase Schema Setup
-- Run this in your Supabase SQL Editor to create the store table and avatars bucket.
-- Sync needs email sign-in (Supabase Auth); signed-out visitors can't read or write anything.

-- 1. Create the table for Autonym's data: one row per account, keyed by the user's id.
create table if not exists public.autonym_store (
  id text primary key default (auth.uid())::text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS): only a signed-in owner can see or change their own row.
alter table public.autonym_store enable row level security;

drop policy if exists "Owner reads own store" on public.autonym_store;
create policy "Owner reads own store"
  on public.autonym_store for select
  to authenticated
  using (id = (select auth.uid())::text);

drop policy if exists "Owner inserts own store" on public.autonym_store;
create policy "Owner inserts own store"
  on public.autonym_store for insert
  to authenticated
  with check (id = (select auth.uid())::text);

drop policy if exists "Owner updates own store" on public.autonym_store;
create policy "Owner updates own store"
  on public.autonym_store for update
  to authenticated
  using (id = (select auth.uid())::text)
  with check (id = (select auth.uid())::text);

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

drop policy if exists "Signed-in Upload for Avatars" on storage.objects;
create policy "Signed-in Upload for Avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "Signed-in Update for Avatars" on storage.objects;
create policy "Signed-in Update for Avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');

-- 3. Enable Realtime updates (so changes sync immediately across PC and phone)
alter publication supabase_realtime add table public.autonym_store;
