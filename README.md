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
| `GROQ_MODEL_SMART` | research digests, comparisons, Ask |
| `INGEST_MAX_NEW` | optional ingestion cap (default 25) |

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

## Ingestion

```bash
npm run ingest                # full run
npm run ingest -- --limit 10  # at most 10 new articles
npm run ingest -- --dry-run   # no DB writes, prints a preview
```

- Feeds are configured in `scripts/ingest/feeds.ts` (topic-tagged RSS).
- Items are deduplicated by canonical URL and normalized title, must be
  within a 3-day freshness window, and are capped per run with round-robin
  fairness across feeds.
- Summaries are generated once with structured output, validated with zod,
  then checked by a **source-text guard**: every capitalized multi-word name
  and every number must occur in the article text (one retry, then skip).
- 429 responses honor `retry-after`, back off exponentially, and stop the
  run cleanly; briefings fall back to the smart model if needed.
- Scheduled twice daily by `.github/workflows/ingest.yml`
  (secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GROQ_API_KEY`, `GROQ_MODEL_FAST`; optional var `INGEST_MAX_NEW`).

## Tests and checks

```bash
npm test             # unit tests: ranking, retrieval, citations, guard, chunking
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
