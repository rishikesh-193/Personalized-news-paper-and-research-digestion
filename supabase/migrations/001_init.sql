-- Chronicle — initial schema (Phase 4)
-- Run this whole file in the Supabase SQL editor (see the phase notes for steps).
-- Scope: tables from PROJECT.md section 6, pgvector, RLS from the access
-- column, and the profiles-on-signup trigger. The vector search function
-- arrives in Phase 7 — do not add it here.

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Tables (PROJECT.md section 6)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  onboarded boolean not null default false
);

create table if not exists public.interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  primary key (user_id, topic)
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  source_name text,
  summary_bullets jsonb not null default '[]'::jsonb,
  why_it_matters text,
  topic_tag text,
  published_at timestamptz
);

create table if not exists public.daily_briefings (
  date date not null,
  topic text not null,
  text text not null,
  primary key (date, topic)
);

create table if not exists public.article_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  event text not null check (event in ('view', 'save', 'like', 'dislike', 'skip')),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  digest_json jsonb
);

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('article', 'document')),
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(384)
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for the queries every request makes (own rows, day's articles).
create index if not exists interests_user_id_idx on public.interests (user_id);
create index if not exists article_events_user_id_idx on public.article_events (user_id);
create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists chunks_user_id_idx on public.chunks (user_id);
create index if not exists chat_sessions_user_id_idx on public.chat_sessions (user_id);
create index if not exists chat_messages_session_id_idx on public.chat_messages (session_id);
create index if not exists articles_topic_tag_idx on public.articles (topic_tag);
create index if not exists articles_published_at_idx on public.articles (published_at desc);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security (access rules from PROJECT.md section 6)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.articles enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.article_events enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- profiles: own row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- interests: own rows.
create policy "interests_select_own" on public.interests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "interests_insert_own" on public.interests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "interests_update_own" on public.interests
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "interests_delete_own" on public.interests
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- articles: any signed-in user may read; writes have NO policy, so only the
-- service role (RLS bypass) can insert/update — per the access column.
create policy "articles_read_authenticated" on public.articles
  for select to authenticated
  using (true);

-- daily_briefings: read signed-in; writes service role only.
create policy "daily_briefings_read_authenticated" on public.daily_briefings
  for select to authenticated
  using (true);

-- article_events: own rows.
create policy "article_events_select_own" on public.article_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "article_events_insert_own" on public.article_events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "article_events_update_own" on public.article_events
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "article_events_delete_own" on public.article_events
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- documents: own rows.
create policy "documents_select_own" on public.documents
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- chunks: own rows (this is what keeps one user's embeddings private).
create policy "chunks_select_own" on public.chunks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "chunks_insert_own" on public.chunks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "chunks_update_own" on public.chunks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chunks_delete_own" on public.chunks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- chat_sessions: own rows.
create policy "chat_sessions_select_own" on public.chat_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_sessions_insert_own" on public.chat_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "chat_sessions_update_own" on public.chat_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chat_sessions_delete_own" on public.chat_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- chat_messages: own rows.
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "chat_messages_update_own" on public.chat_messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chat_messages_delete_own" on public.chat_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. Create a profiles row on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon;
grant execute on function public.handle_new_user() to authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
