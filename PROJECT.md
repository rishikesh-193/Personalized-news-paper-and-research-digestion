# Chronicle: Personalized News Paper and Research Digestion

> Working name. Rename freely. This file is the single source of truth. Read it before every task.

## 1. What this is

A personalized AI information platform. It collects news, articles, research papers, PDFs and URLs based on a user's interests, then turns them into short, readable digests. Users keep a personal knowledge base and can ask questions about everything they have read or saved.

Goal: replace 1 to 2 hours of browsing with a 5 to 10 minute personalized briefing.

## 2. Rules for the AI coding agent

1. Implement ONLY the phase named in the current prompt. Do not build ahead.
2. Do not modify files unrelated to the current task.
3. Never hard-code secrets or API keys. Read them from environment variables.
4. Never write custom password hashing, session or token handling. Use Supabase Auth for BOTH email/password and Google sign-in.
5. Do not add dependencies outside the stack below without saying why.
6. After each task: run lint, typecheck and build, fix errors, then list the files you changed.
7. Never call an LLM from a page load or a user-facing request for shared content. LLM work happens in background jobs or on explicit user actions (upload, ask).
8. Use mock data until a phase explicitly says to wire real data.

## 3. Stack

- Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, lucide-react
- Motion: `motion` (the Framer Motion successor) for React-level motion. Real WebGL via `three`, `@react-three/fiber` (React 19 compatible) and `@react-three/drei`, used only for the landing hero and the auth illustration.
- Supabase: Postgres, Auth (Google provider), Storage, pgvector
- Groq API (OpenAI-compatible) for summarization, classification, research digests and Ask answers
- Embeddings: Supabase Edge Function `embed` using the built-in `gte-small` model (384 dimensions). Groq does not provide embeddings, and Hugging Face's hosted API has only tiny free credits, so embeddings run inside Supabase instead.
- Ingestion: a scheduled Node/TypeScript script run by GitHub Actions (no serverless timeout)
- PDF text extraction: pdf-parse or pdfjs-dist. Article text extraction: @mozilla/readability + jsdom
- Hosting: Vercel (frontend), Supabase (backend)

### Model configuration

Model names change often. Never hard-code them. Use env vars:

- `GROQ_MODEL_FAST`: a small, fast model for bulk work (article summaries, daily briefings)
- `GROQ_MODEL_SMART`: a larger model for research digests and Ask answers
- Groq rate limits apply per model, so splitting bulk work and interactive work across two models stretches the free tier. Check the Limits page in the Groq console for current numbers.
- Ask Groq for JSON-schema structured output where the chosen model supports it, and ALSO validate every response with zod. Never trust raw model JSON.
- Embeddings: one model for everything. Documents and queries MUST be embedded with the same model. The `vector` column is `vector(384)`. Changing the embedding model later means re-embedding all data.
- All embedding calls go through the single Supabase Edge Function `embed`: ingestion and the web app call the same function (user session token from the app, the Supabase secret key from the ingestion job).
- `gte-small` accepts about 512 tokens, so chunks must stay well below that.

## 4. V1 scope

**In scope (MVP)**

- Sign-in with email + password AND Google, then a Spotify-style onboarding where the user picks interests (big selectable topic tiles) before seeing any news
- Scheduled ingestion of RSS feeds, summarized once and stored
- Today page: a newspaper-style feed filtered by the user's interests, with a daily briefing panel
- Research Lab: upload a PDF, get an executive summary, key findings, statistics, limitations and open questions; compare 2 to 3 papers
- Library: save articles and research
- Ask: RAG chat over the user's own library, with citations

**Out of scope for V1 (V2 ideas, do NOT build)**

- Gmail access (Google login does NOT mean Gmail access; request only `openid email profile`)
- Source-disagreement detection, "what changed since last month", trend detection
- Push/email notifications, voice briefings, payments, team features

## 5. Screens and routes

| Route | Purpose |
|---|---|
| `/` | Landing page (cinematic, editorial) |
| `/login` | Email + password, or Continue with Google (split-screen) |
| `/signup` | Create account with name, email, password, or Google |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/onboarding` | Spotify-style interest picker: step 1 topic tiles, step 2 optional sub-topics and keywords |
| `/today` | Personalized newspaper (3-column layout) |
| `/research` | Upload PDFs, view digests, compare |
| `/library` | Saved articles and documents |
| `/ask` | Chat over the personal library |
| `/settings` | Interests, theme, account |

Protected routes: everything except `/` and `/login`.

**Today layout:** left = compact filters (a tab row "For you" + the user's chosen topics, with an "Edit interests" link; no big topic card, no reset button); center = lead story plus article cards (title, source, date, 3-bullet summary, "why it matters"); right = daily briefing and "3 things to know".

## 6. Data model

All user-owned tables carry `user_id uuid references auth.users` and have Row Level Security enabled.

| Table | Key columns | Access |
|---|---|---|
| `profiles` | id (= auth uid), full_name, avatar_url, onboarded | own row |
| `interests` | user_id, topic | own rows |
| `articles` | id, url (unique), title, source_name, summary_bullets, why_it_matters, topic_tag, published_at | read: any signed-in user; write: service role only |
| `daily_briefings` | date, topic, text | read: signed-in; write: service role only |
| `article_events` | user_id, article_id, event (view / save / like / dislike / skip), created_at | own rows |
| `documents` | id, user_id, file_name, storage_path, digest_json | own rows |
| `chunks` | id, user_id, source_type (article / document), source_id, content, embedding vector(384) | own rows |
| `chat_sessions`, `chat_messages` | user_id, session_id, role, content, citations | own rows |

Vector search must be a Postgres function that filters by `auth.uid()`, so one user can never retrieve another user's chunks.

## 7. Pipelines

**Ingestion (scheduled, once or twice daily)**
fetch from source adapters (V1: curated RSS feeds per topic, plus arXiv and Hacker News; a news-API adapter can be added later without changing the rest) → skip URLs already stored → extract text → summarize ONCE (3 bullets, one-line why it matters, topic tag) → save to `articles`.
Cap new articles per run, batch the LLM calls, and retry with backoff on rate-limit errors.

**Reading**
User opens Today → read stored articles from Supabase → filter and rank for the user → render. No LLM call.

**Research digestion**
Upload PDF → store file → extract text → Groq structured digest (for long papers: summarize section by section, then combine, to stay under per-minute token limits) → save `digest_json` → chunk and embed into `chunks` via the `embed` function.

**Ask (RAG)**
Embed question → vector search over the user's `chunks` (top 5 to 8) → answer ONLY from retrieved text → return citations. If nothing relevant is found, say so rather than guessing.
Chunk size about 350 tokens with 50 overlap (must fit the embedding model's input limit). Embedding is done by the `embed` Edge Function; answers are generated by `GROQ_MODEL_SMART`.

## 8. Personalization (V1, keep it simple and explainable)

Score = interest match + recency + boost for topics the user liked or saved − penalty for topics they skip or dislike − penalty for already-read items. Show a short reason ("Because you follow AI").

## 9. Design system

- Headlines: serif (Newsreader or Fraunces). UI and body: Inter.
- Light: cream paper `#F9F8F6`, ink text `#111111`. Dark: `#0D0D0E`.
- One accent color. 1px neutral borders, generous whitespace, grid of cards.
- Auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`): split screen. Left: centered form, max width about 400px (logo mark, heading, subtitle, labeled fields, show/hide password, primary button, "Sign in with Google" button, switch link). Right: full-height `public/auth-newspaper.svg` (object-fit: cover), hidden on small screens. Use Chronicle's palette, not purple. No "Remember me" checkbox (sessions already persist).
- Onboarding: big tiles with icon, clear selected state, search, live counter, sticky Continue bar. Must feel like picking favorites, not filling a form.
- Landing page may be cinematic with scroll-driven motion.
- Chronicle uses an immersive, editorial, 3D-flavored visual language. Real WebGL scenes are reserved primarily for the landing page and selected authentication/onboarding illustrations. Authenticated application screens use restrained CSS 3D, perspective, depth, and motion. Article text, Ask messages, citations, and PDF reading views remain flat, high-contrast, and readable.
- Extended depth palette (layered surfaces over the existing cream/ink tokens): warm cream `#F4EEE6`, muted caramel accent `#DB9F75`, muted border `#E1E8E2`. Rust `#B33A1E` stays the light-mode brand accent and `#E8674A` the dark-mode one. Do not introduce a purple-dominant theme.

### 3D and Motion Rules

1. No more than one shared WebGL Canvas per page.
2. WebGL scenes are dynamically loaded with SSR disabled only at an appropriate client-component boundary.
3. Device pixel ratio is capped at 1.5.
4. Use `frameloop="demand"` for static scenes where possible.
5. Pause or substantially reduce rendering when the document is hidden or the scene is off-screen.
6. Respect `prefers-reduced-motion`.
7. Provide static fallbacks when WebGL is unsupported or disabled.
8. On viewports narrower than 768px, simplify scenes, reduce particles, and disable expensive postprocessing.
9. Keep text over visual backgrounds on readable surfaces with sufficient contrast.
10. Do not add purple-heavy visual themes.
11. Do not make LLM calls or change authentication, data fetching, ingestion, database schemas, or Supabase business logic for visual effects.
12. Keep all existing application workflows functional.

All nonessential motion is also gated by the persistent **Reduce effects** setting in `/settings` (client-side, hydration-safe). When it is on, WebGL scenes, pointer tilt/parallax and scroll-linked animation are disabled.
- Every screen needs loading skeletons, empty states, and error states.

## 10. Security and legal

- RLS on every user table. Test it with two accounts.
- The Supabase secret key (formerly service_role) only in the ingestion job and server code, never in the browser and never behind a `NEXT_PUBLIC_` prefix.
- On the server, verify the user with `supabase.auth.getClaims()` (or `getUser()`), never trust `getSession()` alone.
- Store summaries and links, not republished full articles. Respect source terms.
- Uploaded documents are private to the uploader.
- Uploaded text is sent to Groq for summarization. Check Groq's current data and retention terms, and warn users not to upload confidential documents.
- Embeddings are generated inside Supabase and do not go to a third party.

## 11. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_... (replaces the legacy anon key)
SUPABASE_SECRET_KEY=                    # sb_secret_... server and ingestion only (replaces service_role)
GROQ_API_KEY=                   # server and ingestion only, never NEXT_PUBLIC
GROQ_MODEL_FAST=
GROQ_MODEL_SMART=
```

## 12. Definition of done (per phase)

Builds without errors, runs locally, matches the design system, and does not break earlier phases.