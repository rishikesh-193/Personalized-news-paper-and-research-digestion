-- Chronicle — Research Lab (Phase 6)
-- Run this whole file in the Supabase SQL editor:
--   SQL Editor → New query → paste this file → Run (or use the "Run SQL"
--   button). It is idempotent — re-running it is safe.
-- Scope: private "documents" storage bucket (per-user folders, PDF only,
-- 10 MB cap), documents.status / documents.error_message columns, and the
-- document_comparisons table. Does NOT touch 001_init.sql objects.

-- ---------------------------------------------------------------------------
-- 1. Private bucket for uploaded PDFs
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. storage.objects policies: each user only sees/creates/deletes files
--    under their own folder "<user_id>/..."
-- ---------------------------------------------------------------------------

drop policy if exists "documents_objects_select_own" on storage.objects;
create policy "documents_objects_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "documents_objects_insert_own" on storage.objects;
create policy "documents_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "documents_objects_delete_own" on storage.objects;
create policy "documents_objects_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 3. documents: processing state for the async digest pipeline
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists status text not null default 'processing';

alter table public.documents
  add column if not exists error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_status_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_status_check
      check (status in ('processing', 'ready', 'failed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. document_comparisons: one saved comparison over 2–3 documents
-- ---------------------------------------------------------------------------

create table if not exists public.document_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_ids uuid[] not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists document_comparisons_user_id_idx
  on public.document_comparisons (user_id);

create index if not exists document_comparisons_ids_idx
  on public.document_comparisons using gin (document_ids);

-- ---------------------------------------------------------------------------
-- 5. RLS: each user sees and writes only their own comparison rows
-- ---------------------------------------------------------------------------

alter table public.document_comparisons enable row level security;

drop policy if exists "document_comparisons_select_own" on public.document_comparisons;
create policy "document_comparisons_select_own" on public.document_comparisons
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "document_comparisons_insert_own" on public.document_comparisons;
create policy "document_comparisons_insert_own" on public.document_comparisons
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "document_comparisons_update_own" on public.document_comparisons;
create policy "document_comparisons_update_own" on public.document_comparisons
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "document_comparisons_delete_own" on public.document_comparisons;
create policy "document_comparisons_delete_own" on public.document_comparisons
  for delete to authenticated
  using ((select auth.uid()) = user_id);
