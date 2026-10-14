import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscoverModeSchema,
  type DiscoverMode,
  type DiscoverPaper,
} from "@/lib/discovery/schema";
import {
  dedupePapers,
  normalizeQuery,
  type DiscoveredPaper,
} from "@/lib/discovery/util";
import { ArxivBusyError, searchArxiv } from "@/lib/discovery/arxiv";
import { isTavilyConfigured, searchTavily } from "@/lib/discovery/tavily";
import { loadPapersInOrder, toDiscoverPaper } from "@/lib/discovery/rows";

export const maxDuration = 60;

/** Cached search rows are reused for a day, then re-fetched. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const PAPER_RESULTS = 10;
const WEB_RESULTS = 5;

const RequestSchema = z.object({
  query: z.string().trim().min(3).max(200),
  mode: DiscoverModeSchema,
});

type ProviderState = "ok" | "unavailable" | "off";

interface ProviderOutcome {
  papers: DiscoveredPaper[];
  state: ProviderState;
  /** User-facing reason when the provider failed or is off. */
  note: string | null;
}

function failedProvider(name: string, error: unknown): ProviderOutcome {
  const note =
    error instanceof ArxivBusyError
      ? `${name} needs a few seconds between requests — try again shortly.`
      : `${name} is unavailable right now — try again.`;
  return { papers: [], state: "unavailable", note };
}

/** Assembles the JSON sent to the UI (shared by the cache and fresh paths). */
function searchResponse(args: {
  searchId: string;
  query: string;
  mode: DiscoverMode;
  papers: DiscoverPaper[];
  brief: unknown;
  cached: boolean;
  providers: Record<string, ProviderState>;
  warnings: string[];
}) {
  return NextResponse.json({
    search_id: args.searchId,
    query: args.query,
    mode: args.mode,
    cached: args.cached,
    papers: args.papers,
    brief: args.brief ?? null,
    providers: args.providers,
    warnings: args.warnings,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Enter a search of 3 to 200 characters and pick a mode." },
      { status: 400 },
    );
  }

  const queryNorm = normalizeQuery(body.query);
  if (queryNorm.length < 3) {
    return NextResponse.json(
      { error: "Enter a search of 3 to 200 characters." },
      { status: 400 },
    );
  }
  const { mode } = body;

  // 1. Reuse a search from the last 24 hours (shared cache, RLS read-only).
  const { data: cachedRow } = await supabase
    .from("research_searches")
    .select("id, paper_ids, brief_json, created_at")
    .eq("query_norm", queryNorm)
    .eq("mode", mode)
    .maybeSingle();

  if (cachedRow) {
    const age = Date.now() - Date.parse(String(cachedRow.created_at));
    if (Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) {
      const ids = Array.isArray(cachedRow.paper_ids)
        ? cachedRow.paper_ids.map(String)
        : [];
      const papers = await loadPapersInOrder(supabase, ids);
      return searchResponse({
        searchId: String(cachedRow.id),
        query: body.query,
        mode,
        papers,
        brief: cachedRow.brief_json,
        cached: true,
        providers: { paper: "ok", web: isTavilyConfigured() ? "ok" : "off" },
        warnings: [],
      });
    }
  }

  // 2. Fetch from the providers named by the mode. One failing provider
  //    must never hide the other's results.
  const wantsPapers = mode === "paper" || mode === "both";
  const wantsWeb = mode === "web" || mode === "both";
  const webConfigured = isTavilyConfigured();

  const [arxivOutcome, webOutcome] = await Promise.all([
    wantsPapers
      ? searchArxiv(body.query, PAPER_RESULTS).then(
          (papers): ProviderOutcome => ({ papers, state: "ok", note: null }),
          (error): ProviderOutcome => failedProvider("arXiv", error),
        )
      : Promise.resolve<ProviderOutcome>({
          papers: [],
          state: "off",
          note: null,
        }),
    wantsWeb && webConfigured
      ? searchTavily(body.query, WEB_RESULTS).then(
          (papers): ProviderOutcome => ({ papers, state: "ok", note: null }),
          (error): ProviderOutcome => failedProvider("Tavily", error),
        )
      : Promise.resolve<ProviderOutcome>({
          papers: [],
          state: "off",
          note: wantsWeb
            ? "Web search is off — TAVILY_API_KEY is not configured."
            : null,
        }),
  ]);

  const warnings: string[] = [];
  if (arxivOutcome.note) warnings.push(arxivOutcome.note);
  if (webOutcome.note) warnings.push(webOutcome.note);

  const providers: Record<string, ProviderState> = {
    paper: arxivOutcome.state,
    web: webOutcome.state,
  };

  const items = dedupePapers([...arxivOutcome.papers, ...webOutcome.papers]);

  // 3. Nothing to show and a provider was actually expected to answer: that
  //    is an error the caller can retry, not an empty result set.
  const anyRequested = wantsPapers || (wantsWeb && webConfigured);
  if (items.length === 0) {
    if (anyRequested && Object.values(providers).every((s) => s !== "ok")) {
      return NextResponse.json(
        {
          error: warnings[0] ?? "No sources answered — try again.",
          warnings,
          providers,
        },
        { status: 502 },
      );
    }
    return searchResponse({
      searchId: "",
      query: body.query,
      mode,
      papers: [],
      brief: null,
      cached: false,
      providers,
      warnings: [...warnings, "No results for this search."],
    });
  }

  // 4. Persist papers (service role — the browser cannot write these tables).
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Server is missing SUPABASE_SECRET_KEY — discovery cannot save results.",
      },
      { status: 500 },
    );
  }

  const { data: savedRows, error: papersError } = await admin
    .from("research_papers")
    .upsert(
      items.map((item) => ({
        kind: item.kind,
        source: item.source,
        external_id: item.externalId,
        url: item.url,
        title: item.title,
        authors: item.authors,
        abstract: item.abstract,
        published_at: item.publishedAt,
      })),
      { onConflict: "source,external_id" },
    )
    .select(
      "id, kind, source, external_id, url, title, authors, abstract, published_at",
    );

  if (papersError || !savedRows) {
    return NextResponse.json(
      {
        error:
          "Could not save the results. If this keeps happening, run the 003_discovery.sql migration.",
      },
      { status: 500 },
    );
  }

  // Upsert returns rows unordered — restore the provider/dedupe order by
  // matching each item back on (source, external_id).
  const byKey = new Map(
    savedRows.map((row) => [
      `${String(row.source)}:${String(row.external_id)}`,
      row,
    ]),
  );
  const papers: DiscoverPaper[] = [];
  for (const item of items) {
    const row = byKey.get(`${item.source}:${item.externalId}`);
    if (row) papers.push(toDiscoverPaper(row));
  }

  // 5. Store the search row (fresh results, so any old brief is cleared).
  const { data: savedSearch, error: searchError } = await admin
    .from("research_searches")
    .upsert(
      {
        query_norm: queryNorm,
        mode,
        paper_ids: papers.map((paper) => paper.id),
        brief_json: null,
      },
      { onConflict: "query_norm,mode" },
    )
    .select("id")
    .single();

  if (searchError || !savedSearch) {
    return NextResponse.json(
      {
        error:
          "Could not save this search. If this keeps happening, run the 003_discovery.sql migration.",
      },
      { status: 500 },
    );
  }

  return searchResponse({
    searchId: String(savedSearch.id),
    query: body.query,
    mode,
    papers,
    brief: null,
    cached: false,
    providers,
    warnings,
  });
}
