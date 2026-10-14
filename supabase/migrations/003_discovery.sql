-- Chronicle — Research Discovery, part A (search + brief)
-- Run this whole file in the Supabase SQL editor:
--   SQL Editor → New query → paste this file → Run.
-- It is idempotent — re-running it is safe.
-- Scope: two new tables (research_papers, research_searches) and their RLS.
-- Does NOT touch 001_init.sql or 002_research.sql objects.

-- ---------------------------------------------------------------------------
-- 1. research_papers — a discovered paper (arXiv) or web article (Tavily)
-- ---------------------------------------------------------------------------

create table if not exists public.research_papers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('paper', 'web')),
  source text not null,
  external_id text not null,
  url text not null,
  title text not null,
  authors text[] not null default '{}',
  abstract text,
  published_at date,
  summary_json jsonb,
  summarized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists research_papers_created_at_idx
  on public.research_papers (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. research_searches — one cached search (shared, deduped by query+mode)
-- ---------------------------------------------------------------------------

create table if not exists public.research_searches (
  id uuid primary key default gen_random_uuid(),
  query_norm text not null,
  mode text not null check (mode in ('paper', 'web', 'both')),
  paper_ids uuid[] not null default '{}',
  brief_json jsonb,
  created_at timestamptz not null default now(),
  unique (query_norm, mode)
);

create index if not exists research_searches_created_at_idx
  on public.research_searches (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--    Signed-in users may READ both tables. There are deliberately NO insert /
--    update / delete policies: every write goes through the server with the
--    service-role key (which bypasses RLS), so the browser can never write.
-- ---------------------------------------------------------------------------

alter table public.research_papers enable row level security;
alter table public.research_searches enable row level security;

drop policy if exists "research_papers_read_authenticated" on public.research_papers;
create policy "research_papers_read_authenticated" on public.research_papers
  for select to authenticated
  using (true);

drop policy if exists "research_searches_read_authenticated" on public.research_searches;
create policy "research_searches_read_authenticated" on public.research_searches
  for select to authenticated
  using (true);
