import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BRIEF_CACHE_VERSION,
  briefJsonSchema,
  briefSchemaFor,
  isBriefCacheCurrent,
  type BriefSource,
  type BriefWithVisualizations,
  type ResearchBrief,
} from "@/lib/discovery/schema";
import {
  parsePlannedVisualizations,
  planVisualizations,
  type EvidenceSource,
  type PlannedVisualization,
} from "@/lib/discovery/visualization";
import { basisFor } from "@/lib/discovery/util";
import {
  BRIEF_SYSTEM,
  buildBriefUserPrompt,
} from "@/lib/discovery/brief-prompt";
import { loadPapersInOrder, papersWithText } from "@/lib/discovery/rows";
import {
  GroqClient,
  InvalidOutputError,
  RateLimitExhaustedError,
} from "../../../../../../scripts/ingest/groq";

export const maxDuration = 60;

/** A reliable overview needs at least this many usable sources. */
const MIN_SOURCES = 3;
const MAX_SOURCES = 5;

const RequestSchema = z.object({ search_id: z.string().uuid() });

const nowIso = () => new Date().toISOString();

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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // 1. Load the cached search (RLS read-only) and its papers IN ORDER.
  const { data: search, error: searchError } = await supabase
    .from("research_searches")
    .select("id, query_norm, mode, paper_ids, brief_json")
    .eq("id", body.search_id)
    .maybeSingle();
  if (searchError || !search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const paperIds = Array.isArray(search.paper_ids)
    ? search.paper_ids.map(String)
    : [];
  const papers = await loadPapersInOrder(supabase, paperIds);
  const usable = papersWithText(papers).slice(0, MAX_SOURCES);
  const used: BriefSource[] = usable.map((paper, index) => ({
    index: index + 1,
    id: paper.id,
    title: paper.title,
    url: paper.url,
    basis: basisFor(paper.kind),
  }));

  // 2. Reuse a cached brief when it still matches the usable source count AND
  //    was stored by the current format version. A brief cached by an older
  //    version (or before this feature existed) is rebuilt once below instead
  //    of being served: reusing it would hide every figure this version can
  //    produce for the rest of the 24h TTL, with no way for the reader to
  //    refresh.
  const storedBrief = search.brief_json as { format_version?: unknown } | null;
  if (isBriefCacheCurrent(storedBrief)) {
    const parsed = briefSchemaFor(used.length).safeParse(storedBrief);
    if (parsed.success) {
      // Re-validate the stored figures deterministically (no LLM call): a
      // brief cached before this feature has no `visualizations` key at all
      // (empty plan), and a corrupt entry is dropped instead of breaking the
      // page.
      const cachedBrief: BriefWithVisualizations = {
        ...parsed.data,
        visualizations: parsePlannedVisualizations(
          parsed.data.visualizations,
          used.length,
        ),
      };
      return NextResponse.json({
        brief: cachedBrief,
        used,
        cached: true,
        insufficient: false,
      });
    }
  }

  // 3. Honesty gate: too few usable sources for a reliable overview.
  if (used.length < MIN_SOURCES) {
    return NextResponse.json({
      brief: null,
      used,
      cached: false,
      insufficient: true,
      error: `Not enough sources for a reliable overview (found ${used.length} of ${MIN_SOURCES}).`,
    });
  }

  const user = buildBriefUserPrompt({
    query: String(search.query_norm),
    sources: used.map((source, position) => ({
      source,
      text: usable[position].abstract ?? "",
    })),
  });

  // 4. ONE Groq call. Indexes and citations are validated by the bound schema,
  //    and so is the figure plan: the schema is handed the very sources the
  //    planner will validate against, so a proposal that could never be drawn
  //    counts as invalid output and the client retries rather than returning a
  //    brief with its figures silently missing.
  const evidence: EvidenceSource[] = used.map((source, position) => ({
    index: source.index,
    title: source.title,
    url: source.url,
    text: usable[position].abstract ?? "",
  }));
  let brief: ResearchBrief;
  try {
    const groq = new GroqClient("GROQ_MODEL_SMART");
    const request = {
      what: `research brief for "${String(search.query_norm)}"`,
      system: BRIEF_SYSTEM,
      user,
      jsonSchema: briefJsonSchema(used.length),
      // Deciding whether the sources support a figure is a judgement, and at
      // the client's default `low` effort the model made it inconsistently:
      // the same sources produced a grounded figure on one call and an empty
      // plan on the next (measured 0/6 to 3/6 across identical runs), and the
      // strict schema was often rejected outright and silently demoted. At
      // `medium` the decision is stable. `high` exceeds the free tier's 8k TPM
      // limit (HTTP 413), so it is not usable here.
      reasoningEffort: "medium" as const,
    };
    try {
      brief = await groq.complete<ResearchBrief>({
        ...request,
        zodSchema: briefSchemaFor(used.length, evidence),
      });
    } catch (error) {
      // The model proposed a figure the planner cannot draw. That is worth one
      // more sample, but it must never cost the reader their brief: ask again
      // and accept a plan-free brief if the figures still don't validate.
      if (!(error instanceof InvalidOutputError)) throw error;
      brief = await groq.complete<ResearchBrief>({
        ...request,
        zodSchema: briefSchemaFor(used.length),
      });
    }
  } catch (error) {
    const message =
      error instanceof InvalidOutputError
        ? "The brief could not be validated — retry."
        : error instanceof RateLimitExhaustedError
          ? "The brief service is rate limited — try again in a minute."
          : error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError")
            ? "The brief took too long — retry."
            : "Could not build the brief — retry.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 4b. Validate the proposed figures deterministically. This never throws and
  //     never returns a half-built figure, so a bad plan just means no figures
  //     and the brief still renders. Numbers are only plotted when the cited
  //     source's own text reports them.
  let visualizations: PlannedVisualization[] = [];
  try {
    visualizations = planVisualizations(brief.visualizations, evidence);
  } catch {
    visualizations = [];
  }
  const responseBrief: BriefWithVisualizations = { ...brief, visualizations };

  // 5. Cache it: the search keeps the brief (with its validated figures),
  //    each paper keeps its summary.
  const admin = createAdminClient();
  if (admin) {
    await admin
      .from("research_searches")
      .update({
        brief_json: {
          ...responseBrief,
          format_version: BRIEF_CACHE_VERSION,
        },
      })
      .eq("id", String(search.id));

    const summarizedAt = nowIso();
    for (const item of brief.items) {
      const source = used[item.index - 1];
      if (!source) continue;
      await admin
        .from("research_papers")
        .update({
          summary_json: {
            objective: item.objective,
            finding: item.finding,
            method: item.method,
            limitation: item.limitation,
            relevance: item.relevance,
          },
          summarized_at: summarizedAt,
        })
        .eq("id", source.id);
    }
  }

  return NextResponse.json({
    brief: responseBrief,
    used,
    cached: false,
    insufficient: false,
  });
}
