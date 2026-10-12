# Freebuff Prompt Sequence

Paste these one at a time. Test each phase before starting the next. Commit to Git after every phase that works.

**Footer for every prompt** (already included below as "Finish by"): run lint/typecheck/build, fix errors, list changed files, do not touch unrelated files.

**MVP finish line = end of Phase 7.** Phases 8 and 9 make it smarter and prettier.

---

## Phase 0: Manual setup (you do this, not Freebuff)

1. Create a GitHub repo and put `PROJECT.md` in the root.
2. Create a Supabase project. In the API Keys settings, create the new **publishable** and **secret** keys (they replace the legacy anon and service_role keys). Copy the project URL, publishable key and secret key.
3. Google Cloud Console: create a project → Google Auth Platform → External → scopes `openid`, `email`, `profile` → create an OAuth **Web** client.
   - Authorized JavaScript origins: `http://localhost:3000` and your deployed URL
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google: paste the Client ID and Secret, enable.
5. Supabase → Authentication → URL Configuration: add `http://localhost:3000` and your deployed URL as redirect URLs.
6. Create a Groq account at console.groq.com and make an API key. Open the **Limits** page and note the per-model limits. Pick one small fast model (summaries) and one larger model (research and Ask), preferably ones that support structured outputs.
   - Embeddings need no extra account: they run in a Supabase Edge Function (Phase 7). Install the Supabase CLI now and log in (`supabase login`).
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
signInWithOAuth, the OAuth callback route, sign-out, and the Supabase session-refresh
proxy that protects every route except / and /login. Check the installed Next.js version:
in newer versions the file is proxy.ts, in older ones middleware.ts. Use the publishable key
(NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) and verify users on the server with getClaims(),
not getSession(). After first login, redirect to /onboarding where the user
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

## Phase 4B: Email + password login and split-screen auth pages

First copy `auth-newspaper.svg` into your project's `public/` folder.

```
Read PROJECT.md (sections 2, 5 and 9). Implement ONLY Phase 4B.
Add email + password authentication alongside the existing Google sign-in, using Supabase
Auth only (no custom password handling).
1. Pages: /login, /signup, /forgot-password, /reset-password, all in the split-screen
   layout from section 9: form on the left, public/auth-newspaper.svg full height on the
   right (<img> with object-fit: cover, hidden below the md breakpoint). The left column is
   centered, max width about 400px: logo mark, heading, subtitle, labeled Email and
   Password fields (password has a show/hide toggle), a primary "Sign in" button, a
   secondary "Sign in with Google" button with the Google logo, and a "Don't have an
   account? Sign up" / "Already have an account? Sign in" link. /login also has a
   "Forgot password?" link. /signup adds a Full name field, a confirm-password check and a
   minimum password length of 8.
2. Use Chronicle's own palette (cream, ink, rust accent, serif headings), not purple. Do
   NOT add a "Remember for 30 days" checkbox.
3. Wiring: signUp (full_name in options.data, plus emailRedirectTo), signInWithPassword,
   resetPasswordForEmail, and updateUser for setting the new password. Handle email
   confirmation and recovery links with a /auth/confirm route that uses verifyOtp with
   token_hash and type, following the current Supabase Next.js SSR docs. After any
   successful sign-in (password, Google or confirmed email) route by profiles.onboarded:
   false -> /onboarding, true -> /today. Add /signup, /forgot-password, /reset-password and
   /auth/confirm to the public routes in the proxy/middleware.
4. Friendly inline errors (wrong password, account exists, weak password, unconfirmed
   email), loading states, no double submit, proper labels, autocomplete attributes, and
   keyboard-friendly tab order.
5. Tell me exactly which Supabase email templates and URL settings I must change.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

**Your manual steps in Supabase after this phase**

- Authentication → Providers: confirm **Email** is enabled and set the minimum password length to 8.
- Authentication → URL Configuration: add `http://localhost:3000/**` (and your deployed URL later) to the redirect URLs.
- Authentication → Email Templates: update "Confirm signup" and "Reset password" the way Freebuff tells you (they must link to `/auth/confirm` with the token hash).
- While developing locally, you can switch off "Confirm email" so you don't depend on Supabase's built-in email sender, which is meant for testing and heavily rate-limited. Switch it back on, with your own SMTP provider, before real users arrive.
- Test all four paths: new email signup, email login, Google login, forgot password.

## Phase 4C: Spotify-style onboarding and a simpler Today

```
Read PROJECT.md (sections 5 and 9). Implement ONLY Phase 4C. No new tables or migrations.
Rebuild /onboarding as a Spotify-style interest picker and simplify the topics area on
/today.
1. /onboarding step 1, "What do you want to read?": a full-width page with a big heading,
   a search box, and a responsive grid of large selectable topic tiles grouped under
   headings (Technology, Science & Health, Business & Money, World & Society, Culture &
   Lifestyle, Sports; 6 to 12 tiles per group). Each tile has an icon, a label and a clear
   selected state (check mark, ring, tint). Add an "Add your own topic" tile that opens an
   inline input. Show a live counter ("2 of 3 minimum chosen") and a sticky bottom bar with
   "Continue" (disabled until at least 3 are chosen) and "Skip for now".
2. Step 2, "Make it yours" (optional): for each chosen topic show 4 to 6 suggested
   sub-topics as pill toggles (for example AI -> LLMs, Robotics, Research papers) plus an
   optional free-text keywords input. "Finish" saves everything. Include a progress
   indicator and a Back button, and keep selections when going back.
3. Save through the existing completeOnboardingAction (interests rows plus
   profiles.onboarded). Store sub-topics and keywords as plain topic strings. Mobile first:
   2 columns on phones, up to 5 on desktop. Tiles are toggle buttons with aria-pressed.
4. Users who are not onboarded are redirected to /onboarding from every protected route;
   onboarded users who open /onboarding go to /today (they edit interests in /settings).
5. On /today, replace the large "Topics" card with a compact horizontally scrollable tab
   row: "For you" first, then only the user's chosen topics, plus a small "Edit interests"
   link to /settings. Remove the "Reset topics" button. Keep "Sources today" but collapsed
   by default.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 5: Ingestion pipeline and live Today page

```
Read PROJECT.md. Implement ONLY Phase 5.
Create scripts/ingest.ts, run by a GitHub Actions scheduled workflow
(.github/workflows/ingest.yml, also manually triggerable). It must: fetch from pluggable source
adapters behind one interface (start with an RSS adapter; keep the feed list in a config file
mapping each topic to feeds, covering tech, AI, business, world, science; so a news-API
adapter can be added later as one new file), skip URLs already in the articles table, extract article text, call Groq
(model from GROQ_MODEL_FAST, using JSON-schema structured output if supported) ONCE per new
article to return JSON with 3 summary bullets, a one-line why-it-matters, and a topic tag,
validate it with zod, and insert into articles.
Cap new articles per run, batch calls, and retry with backoff on rate limits. Also
generate one daily_briefings row per topic. Use SUPABASE_SECRET_KEY from env/secrets.
Then change /today to read from the articles table, filtered by the user's interests,
with NO LLM call on page load.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 6: Research Lab

```
Read PROJECT.md. Implement ONLY Phase 6.
Build /research: drag-and-drop PDF upload to Supabase Storage (private bucket, per-user
path), server-side text extraction, a structured Groq call (GROQ_MODEL_SMART) that returns an
executive summary, key findings, important statistics, main arguments, limitations and open
questions as JSON (validated with zod), saved into documents.digest_json. For long papers,
summarize section by section and then combine, so each request stays under the model's
per-minute token limit; retry with backoff on 429 errors. Show the digest in a clean reading
view. Add a compare view where the user selects 2 to 3 documents and gets a comparison
table (aims, methods, findings, differences). Handle large PDFs, scanned PDFs with no
text, and errors with clear messages.
Finish by: run lint/typecheck/build, fix errors, list changed files.
```

## Phase 7: Library, embeddings and Ask (MVP complete)

```
Read PROJECT.md. Implement ONLY Phase 7.
Add a Save button on articles and documents, and build /library listing saved items.
First create a Supabase Edge Function `embed` (supabase/functions/embed) that accepts an
array of texts and returns 384-dimension embeddings using the built-in
Supabase.ai.Session('gte-small') model; require a valid JWT. Explain how I deploy it with
the Supabase CLI. Then: when an item is saved or a document is uploaded, split its text
into chunks (about 350 tokens, 50 overlap), embed through the `embed` function, and store
in chunks (vector(384)). Add a Postgres function match_chunks that filters by auth.uid()
and returns the top matches by cosine similarity. Build /ask: embed the question with the
same function, retrieve top 5 to 8 chunks, call Groq (GROQ_MODEL_SMART) to answer ONLY from those chunks, and show numbered citations that
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