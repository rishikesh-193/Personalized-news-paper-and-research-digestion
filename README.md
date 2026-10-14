# Chronicle — Personalized Newspaper and Research Digestion

Chronicle collects news and research based on your interests, summarizes each
source once with AI (validated against the original text), and turns it into a
5–10 minute daily briefing: a personalized **Today** page, a **Research Lab**
for PDFs, a **Library** of saved reading, and **Ask** — a chat that answers
questions over *your* saved content with citations.

## Stack

- **App**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Supabase — Postgres + pgvector, Auth (Google + email/password),
  private Storage, Row Level Security on every user-owned table
- **AI**: Groq (`GROQ_MODEL_FAST` for ingestion, `GROQ_MODEL_SMART` for
  research digests, comparisons and Ask answers), validated with zod
- **Embeddings**: `gte-small` (384 dimensions) run server-side via ONNX
  runtime (`@xenova/transformers`) — same model for documents and queries;
  text never leaves for a third-party embedding API
- **Ingestion**: scheduled Node/TypeScript pipeline run by GitHub Actions

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in values (never commit)
npm run dev
```

### Environment variables (names only)

| Name | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server + ingestion |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | browser + server |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | server + ingestion only |
| `GROQ_API_KEY` | server + ingestion only — never `NEXT_PUBLIC_` |
| `GROQ_MODEL_FAST` | ingestion summaries and briefings |
| `GROQ_MODEL_SMART` | research digests, comparisons, briefs, Ask |
| `TAVILY_API_KEY` | server only — web results in Research → Discover; without it the Discover tab offers papers only |
| `INGEST_MAX_NEW` | optional ingestion cap per run (default 60) |
| `INGEST_MAX_PER_CATEGORY` | optional per-category ceiling per run (default 6) |

## Database migrations

Migrations live in `supabase/migrations/` and are applied **manually in the
Supabase SQL editor** (SQL Editor → New query → paste file → Run). They are
idempotent.

1. `001_init.sql` — profiles, interests, articles, daily_briefings,
   article_events, documents, chunks, chat_sessions, chat_messages; pgvector;
   RLS policies; the profiles-on-signup trigger.
2. `002_research.sql` — private `documents` storage bucket (PDF-only,
   10 MB cap), `documents.status` / `documents.error_message`, and the
   `document_comparisons` table.
3. `003_discovery.sql` — `research_papers` and `research_searches` for
   Research → Discover (search + brief). Read-only for signed-in users;
   writes happen server-side with the secret key.
4. `004_coverage.sql` — `articles.subtopic` (a fine-grained label inside
   `topic_tag`) plus indexes for the Today feed query. Optional for ingestion
   to run: without it the pipeline detects the missing column, logs a warning
   and stores topics without subtopics.

> **Required before the Research Lab works live:** run `002_research.sql`.
> Until then, PDF upload fails with a friendly error naming the migration.

## Authentication

- Providers are configured in the Supabase dashboard
  (Authentication → Providers): **Google** (OAuth client from Google Cloud
  Console, redirect URI `https://<project>.supabase.co/auth/v1/callback`) and
  **Email** (minimum password length 8).
- Add your URLs under Authentication → URL Configuration
  (`http://localhost:3000`, plus the deployed origin).
- The session-refresh proxy (`src/proxy.ts`) protects every route except
  `/`, the auth pages and the auth callbacks; the server verifies users with
  `getClaims()`, never cookie contents.

## Embeddings and Ask

- Saving an article on Today indexes its **summary** (titles, bullets,
  why-it-matters — never republished full text) into `chunks` under your
  `user_id`.
- Uploading a PDF indexes its extracted text (chunked, capped per document).
- Ask embeds your question with the same model, ranks your own chunks by
  cosine similarity (RLS scopes every row to you), and asks
  `GROQ_MODEL_SMART` to answer **only** from those excerpts. Citations are
  audited against the actually-retrieved chunks — an unverifiable citation is
  dropped, never guessed. If nothing relevant is found, it says so.

## Research Discovery (search + brief)

- **Discover** (the default tab on `/research`) searches the **arXiv API**
  (no key, up to 10 relevance-ranked papers) and **Tavily** (web mode, 5
  results, `TAVILY_API_KEY`). Results are de-duplicated by arXiv id or
  canonical URL and stored in `research_papers` under the service-role key.
  A search is cached for 24 hours in `research_searches`.
- arXiv asks for at most one request every 3 seconds over one connection;
  the client serializes every call with ≥3s spacing and reports "try again
  shortly" instead of breaking that limit.
- **Research brief**: one `GROQ_MODEL_SMART` call over the top 5 results that
  have an abstract or snippet, validated with zod (every `[n]` citation and
  every item index must map to a supplied source). Needs at least 3 usable
  sources, otherwise the UI says so instead of guessing. The brief and each
  paper's summary are cached.
- The UI labels every result "Based on the abstract only" / "Based on a
  search snippet" and the brief "AI-generated from the sources listed. Check
  the originals." No page is ever fetched beyond the search snippet.

## Ingestion

```bash
npm run ingest                # full run
npm run ingest -- --limit 10  # at most 10 new articles
npm run ingest -- --dry-run   # no DB writes, prints a preview
```

- Feeds are configured in `scripts/ingest/feeds.ts`: ~220 enabled RSS/Atom
  sources covering **every** onboarding topic, each tagged with a canonical
  topic, its subtopics, a region and a language. Feeds that stopped working
  are parked with `enabled: false` plus the observed failure reason, so a
  known-bad URL is never silently re-added.
- **Check the registry against reality at any time:**
  `npx tsx scripts/ingest/audit.ts --feeds --all` probes every URL and reports
  which feeds return usable, recent items; `--db` reports what is actually
  stored per category. `--json` emits both for scripting.
- **Check that supply reaches a reader:** `npx tsx scripts/ingest/check-today.ts`
  replays the exact Today query (hierarchy expansion, 7-day window, limit 60)
  for sample interest sets, so "the feeds never supplied it" can be told apart
  from "the pipeline could not store it".
- Feeds are fetched with bounded concurrency (12 at a time), a per-feed
  timeout, and bounded retries for transient 429/5xx and network errors. One
  dead feed never fails the run — it is reported and skipped.
- Items are deduplicated by canonical URL (tracking/click parameters and
  fragments stripped) and by normalized title, must be within a 3-day
  freshness window, and are allocated with **fair rotation across categories**
  (`scripts/ingest/allocate.ts`): every category gets a slot before any
  category gets a second, and within a category the sources rotate so one
  prolific publisher cannot fill its category's slice.
- The stored `topic_tag` is **deterministic** — it comes from the feed config,
  never from the model — so the fair allocation actually balances stored
  categories. Subtopics (Cricket, PlayStation, Models, …) are derived by
  ordered keyword rules in `scripts/ingest/classify.ts`, falling back to the
  feed's declared subtopic rather than guessing.
- Summaries are generated once with structured output, validated with zod,
  then checked by a **source-text guard**: every capitalized multi-word name
  and every number must occur in the article text (one retry, then skip).
- Every run ends with a **per-run report**: sources attempted/ok/empty/failed,
  entries fetched vs dated, candidates, stored per category, duplicates,
  unusable text, extraction/invalid-output/guard failures, rate-limit events,
  duration, and the exact list of feeds that failed and why.
- 429 responses honor `retry-after`, back off exponentially, and stop the
  run cleanly; briefings fall back to the smart model if needed.
- Scheduled twice daily by `.github/workflows/ingest.yml`
  (secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` or the legacy
  `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GROQ_MODEL_FAST`; optional vars
  `INGEST_MAX_NEW`, `INGEST_MAX_PER_CATEGORY`).
- **The binding constraint is the Groq rate limit, not feed supply.** Measured
  2026-10-14: 219 feeds expose ~7,500 entries and ~3,990 fresh unique
  candidates per run, but a run is limited by how many summaries Groq will
  accept. `MAX_429_RETRIES` in `scripts/ingest/groq.ts` was raised to 9 so a
  run rides out a per-minute limit window instead of abandoning its queue; a
  run that still gets stopped is reported via `stopped early: N selected
  article(s) were never attempted` and those articles are picked up next run.
- **Google News RSS is deliberately not used as a source.** Its items are
  plausible but their `<link>` is a `news.google.com/rss/articles/…` redirect
  that does not resolve to the publisher, so Readability extracts zero
  characters and nothing can be summarized. Verified 2026-10-14.

## Tests and checks

```bash
npm test             # unit tests: ranking, retrieval, citations, guard, chunking, discovery, coverage
npx tsx scripts/discover-smoke.ts "retrieval augmented generation"   # real arXiv search
npx tsx scripts/ingest/audit.ts                    # real feed probe + stored coverage
npm run lint
npx tsc --noEmit
npm run build
```

## Deployment

- Frontend: Vercel — set the environment variable **names** from the table
  above and add the production URL to Supabase redirect URLs and Google
  OAuth authorized origins.
- Ingestion runs in GitHub Actions, independent of the frontend.
- The server-side embedding model (~90 MB) downloads on first use and is
  cached per instance; the Ask/digest routes declare `maxDuration = 60`.

## Known limitations

- **Research Lab needs `002_research.sql` applied** (see above).
- Google OAuth requires manual dashboard setup; email sign-up requires email
  confirmation unless disabled for development.
- Ask retrieval loads the user's chunks (capped at 500) and scores them in
  the app; a `match_chunks` Postgres function is the intended upgrade for
  large libraries.
- Document indexing embeds at most 30 chunks per PDF (first ~42k characters).
- The summary guard verifies that names and numbers appear in the source —
  it cannot verify that they are *combined* correctly; summaries carry the
  disclosure "AI-generated summary. Check the source."
