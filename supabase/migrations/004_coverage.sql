-- Chronicle — news coverage expansion (Phase 7)
-- Run this whole file in the Supabase SQL editor (SQL Editor → New query →
-- paste → Run). Idempotent, like the other migrations.
--
-- What it changes and why
-- -----------------------
-- 1. articles.subtopic — a fine-grained label INSIDE topic_tag, assigned
--    deterministically at ingestion from the feed config plus ordered keyword
--    rules (scripts/ingest/classify.ts). Examples: "Cricket" and "Tennis"
--    inside Sports, "PlayStation" and "Reviews" inside Gaming, "Models" and
--    "Policy" inside AI.
--
--    topic_tag stays exactly what it always was — one of the onboarding topic
--    labels — so existing `interests` rows keep working unchanged and the
--    Today query keeps filtering on the same column. Nothing is renamed.
--
-- 2. Indexes for the Today feed query, which filters by topic_tag and orders
--    by published_at within a recent window.
--
-- This migration is OPTIONAL for ingestion to run: if it has not been applied,
-- the pipeline detects the missing column, logs a warning, and stores articles
-- without subtopics instead of failing. The UI does not read subtopic yet.

alter table public.articles
  add column if not exists subtopic text;

comment on column public.articles.subtopic is
  'Deterministic sub-label within topic_tag (e.g. Cricket, PlayStation, Models). Null for rows ingested before this column existed.';

-- Today reads "topic_tag in (…user interests…) and published_at >= now() - 7d
-- order by published_at desc limit 60".
create index if not exists articles_topic_published_idx
  on public.articles (topic_tag, published_at desc);

-- Supports "what is actually available in this category" reporting/audits.
create index if not exists articles_subtopic_idx
  on public.articles (subtopic)
  where subtopic is not null;
