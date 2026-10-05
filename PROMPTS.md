# Freebuff Prompt Sequence

Paste these one at a time. Test each phase before starting the next. Commit to Git after every phase that works.

**Footer for every prompt** (already included below as "Finish by"): run lint/typecheck/build, fix errors, list changed files, do not touch unrelated files.

**MVP finish line = end of Phase 7.** Phases 8 and 9 make it smarter and prettier.

---

## Phase 0: Manual setup (you do this, not Freebuff)

1. Create a GitHub repo and put `PROJECT.md` in the root.
2. Create a Supabase project. Copy the project URL, anon key and service role key.
3. Google Cloud Console: create a project → Google Auth Platform → External → scopes `openid`, `email`, `profile` → create an OAuth **Web** client.
   - Authorized JavaScript origins: `http://localhost:3000` and your deployed URL
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google: paste the Client ID and Secret, enable.
5. Supabase → Authentication → URL Configuration: add `http://localhost:3000` and your deployed URL as redirect URLs.
6. Get a Gemini API key from Google AI Studio. Check which Flash model and embedding model are current.
7. Create `.env.local` with the variables listed in `PROJECT.md` section 11. Never commit it.

---

## Phase 1: Foundation and plain landing page

```
Read PROJECT.md. Implement ONLY Phase 1.
Scaffold a Next.js (App Router) + TypeScript + Tailwind + shadcn/ui project. Implement
the design system from section 9: serif headlines, Inter UI text, cream/ink light theme,
dark theme, theme toggle. Build a clean landing page with a header (logo, theme toggle,
"Continue with Google" button that does nothing yet), a hero headline, and three short
feature sections. No scroll animation and no 3D yet. No backend.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 2: App shell and screens with mock data

```
Read PROJECT.md. Implement ONLY Phase 2.
Build the app shell (top nav: Today, Research, Library, Ask, user menu) and the pages
/today, /research, /library, /ask, /settings using realistic MOCK data only.
/today uses the 3-column layout from section 5: topics on the left, lead story plus
article cards in the center (title, source, date, 3 bullets, "why it matters"), daily
briefing and "3 things to know" on the right. /research shows an upload dropzone and a
sample digest. /ask shows a chat UI with sample citations. Include skeletons, empty
states and dark mode. No auth, no database.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 3: Google auth and onboarding

```
Read PROJECT.md. Implement ONLY Phase 3.
Integrate Supabase Auth with @supabase/ssr. Implement "Continue with Google" using
signInWithOAuth, the OAuth callback route, sign-out, and middleware that protects every
route except / and /login. After first login, redirect to /onboarding where the user
picks interests from a topic list and can add custom topics. Keep the interests in
component state for now. Read keys from .env.local. Do not write custom auth.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 4: Database schema and Row Level Security

```
Read PROJECT.md. Implement ONLY Phase 4.
Create a SQL migration file (supabase/migrations/001_init.sql) for every table in
section 6, enable the pgvector extension, enable RLS on all tables with the access rules
listed, and add a trigger that creates a profiles row on signup. Do not create the vector
search function yet. Then wire onboarding to save interests to the interests table and
mark profiles.onboarded, and make /settings read and edit them. Explain how I should run
the migration in the Supabase SQL editor.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

After this phase, test RLS yourself with two different Google accounts.

## Phase 5: Ingestion pipeline and live Today page

```
Read PROJECT.md. Implement ONLY Phase 5.
Create scripts/ingest.ts, run by a GitHub Actions scheduled workflow
(.github/workflows/ingest.yml, also manually triggerable). It must: fetch a configurable
list of RSS feeds (put the list in a config file, include tech, AI, business, world,
science), skip URLs already in the articles table, extract article text, call Gemini
(model from GEMINI_MODEL) ONCE per new article to return JSON with 3 summary bullets, a
one-line why-it-matters, and a topic tag, validate the JSON, and insert into articles.
Cap new articles per run, batch calls, and retry with backoff on rate limits. Also
generate one daily_briefings row per topic. Use the service role key from env/secrets.
Then change /today to read from the articles table, filtered by the user's interests,
with NO LLM call on page load.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 6: Research Lab

```
Read PROJECT.md. Implement ONLY Phase 6.
Build /research: drag-and-drop PDF upload to Supabase Storage (private bucket, per-user
path), server-side text extraction, one structured Gemini call that returns an executive
summary, key findings, important statistics, main arguments, limitations and open
questions as JSON, saved into documents.digest_json. Show the digest in a clean reading
view. Add a compare view where the user selects 2 to 3 documents and gets a comparison
table (aims, methods, findings, differences). Handle large PDFs, scanned PDFs with no
text, and errors with clear messages.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 7: Library, embeddings and Ask (MVP complete)

```
Read PROJECT.md. Implement ONLY Phase 7.
Add a Save button on articles and documents, and build /library listing saved items.
When an item is saved or a document is uploaded, split its text into chunks (about 800
tokens, 100 overlap), embed with GEMINI_EMBED_MODEL at 768 dimensions, and store in
chunks. Add a Postgres function match_chunks that filters by auth.uid() and returns the
top matches by cosine similarity. Build /ask: embed the question, retrieve top 5 to 8
chunks, call Gemini to answer ONLY from those chunks, and show numbered citations that
link to the source article or document. If nothing relevant is retrieved, answer that
it is not in the library. Persist chat sessions and messages.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 8: Personalization

```
Read PROJECT.md. Implement ONLY Phase 8.
Record article_events (view, save, like, dislike, skip). Implement the V1 scoring from
section 8 as a pure, unit-tested function, use it to rank /today, and show a short
reason on each card ("Because you follow AI"). Add like/dislike buttons and a
"not interested in this topic" action.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 9: Polish, landing animation and deploy

```
Read PROJECT.md. Implement ONLY Phase 9.
1. Landing page: add a smooth scroll-triggered Framer Motion hero where a stack of
   newspaper cards scales and rotates into view. Respect prefers-reduced-motion and keep
   it smooth on mobile. No heavy 3D libraries.
2. Audit every page for loading skeletons, empty states, error boundaries, mobile
   layout, and keyboard accessibility.
3. Add a privacy note on /research about not uploading confidential documents.
4. Prepare for Vercel deployment: list the env vars to set and the redirect URLs to add
   in Google Cloud and Supabase.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

---

## If Freebuff drifts

Paste this: `Stop. Re-read PROJECT.md sections 2 and 4. Undo anything outside the current phase and continue with only that phase.`
