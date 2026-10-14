import { z } from "zod";
import {
  planVisualizations,
  VISUALIZATIONS_JSON_SCHEMA,
  type EvidenceSource,
  type PlannedVisualization,
} from "./visualization";

/**
 * Research Discovery — API + storage schemas.
 *
 * Three consumers: the search/brief route handlers (validation), the
 * discover UI (rendering types), and the Groq structured-output call.
 */

export const DiscoverModeSchema = z.enum(["paper", "web", "both"]);
export type DiscoverMode = z.infer<typeof DiscoverModeSchema>;

/** A stored research_papers row, as returned to the UI. */
export const DiscoverPaperSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["paper", "web"]),
  source: z.string().min(1),
  external_id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()),
  abstract: z.string().nullable(),
  published_at: z.string().nullable(),
});
export type DiscoverPaper = z.infer<typeof DiscoverPaperSchema>;

/* --------------------------------------------------------------------------
 * Research brief
 * ------------------------------------------------------------------------ */

export const BRIEF_MAX_ITEMS = 5;

/** `[1]`..`[n]` markers only — anything else is an invented citation. */
function citationMarkers(text: string): number[] {
  return [...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
}

/**
 * Brief schema bound to the number of supplied sources, so the model's
 * `index` must map to a real source and the overview may only cite those.
 *
 * Pass `evidence` when generating (not when reading a cached brief): the schema
 * then also requires that any figure the model proposes is actually drawable.
 * A proposal that the planner throws away — a table with no column headers, a
 * value that is not in the cited text — is treated as invalid output, so the
 * client retries the generation instead of quietly returning a brief with no
 * figure at all. Proposing nothing stays valid: some source sets genuinely
 * support no figure.
 */
export function briefSchemaFor(sourceCount: number, evidence?: EvidenceSource[]) {
  const overview = z
    .string()
    .min(60)
    .max(4000)
    .refine((text) => citationMarkers(text).length >= 1, {
      message: "overview must cite at least one source with [n]",
    })
    .refine(
      (text) =>
        citationMarkers(text).every((n) => n >= 1 && n <= sourceCount),
      { message: `overview may only cite [1]..[${sourceCount}]` },
    );

  return z.object({
    overview,
    themes: z.array(z.string().min(1).max(200)).min(3).max(5),
    items: z
      .array(
        z.object({
          index: z.number().int().min(1).max(sourceCount),
          objective: z.string().min(1).max(600),
          finding: z.string().min(1).max(800),
          method: z.string().min(1).max(600).nullable(),
          limitation: z.string().min(1).max(600).nullable(),
          relevance: z.string().min(1).max(600),
        }),
      )
      .min(1)
      .max(Math.min(BRIEF_MAX_ITEMS, sourceCount))
      .refine(
        (items) => new Set(items.map((item) => item.index)).size === items.length,
        { message: "item indexes must be unique" },
      ),
    basis: z.string().min(1).max(500),
    /**
     * Raw visualization proposals, validated and planned separately (see
     * `planVisualizations`). `unknown[]` on purpose: one malformed figure must
     * never fail the whole brief, and briefs cached before this feature have
     * no such key at all — they default to an empty plan.
     */
    visualizations: z.array(z.unknown()).max(6).default([]),
  }).refine(
    (brief) => {
      if (!evidence) return true;
      const proposed = Array.isArray(brief.visualizations)
        ? brief.visualizations.filter(
            (item) =>
              !(
                item !== null &&
                typeof item === "object" &&
                (item as { type?: unknown }).type === "none"
              ),
          )
        : [];
      // Proposing no figure (or declaring `none`) is always allowed.
      if (proposed.length === 0) return true;
      return planVisualizations(proposed, evidence).length > 0;
    },
    {
      message:
        "no proposed figure could be validated against the sources it cites",
      path: ["visualizations"],
    },
  );
}

export type ResearchBrief = z.infer<ReturnType<typeof briefSchemaFor>>;

/** Brief as sent to the UI, with validated figures attached. */
export type BriefWithVisualizations = Omit<ResearchBrief, "visualizations"> & {
  visualizations: PlannedVisualization[];
};

/**
 * Version stamp for a brief stored in `research_searches.brief_json`.
 *
 * A cached brief is reused for the whole 24h TTL, so anything that changes how
 * a brief is built has to invalidate it. Without this stamp, a brief cached
 * before figures existed — or one whose plan came back empty — keeps hiding
 * the figures this version can produce, and re-requesting it changes nothing.
 * Bump this whenever the stored brief shape, the visualization contract or the
 * settings that produce a brief change; an older stamp simply rebuilds the
 * brief once.
 */
export const BRIEF_CACHE_VERSION = 3;

/**
 * True only when a stored brief was written by the current format version.
 * Anything else — an older format, a brief cached before figures existed, or
 * junk — must be regenerated rather than served.
 */
export function isBriefCacheCurrent(stored: unknown): boolean {
  if (!stored || typeof stored !== "object") return false;
  const version = (stored as { format_version?: unknown }).format_version;
  return typeof version === "number" && version === BRIEF_CACHE_VERSION;
}

/** Per-paper summary cached in research_papers.summary_json. */
export const PaperSummarySchema = z.object({
  objective: z.string().min(1).max(600),
  finding: z.string().min(1).max(800),
  method: z.string().min(1).max(600).nullable(),
  limitation: z.string().min(1).max(600).nullable(),
  relevance: z.string().min(1).max(600),
});
export type PaperSummary = z.infer<typeof PaperSummarySchema>;

/** Sent to Groq structured-output mode alongside briefSchemaFor(n). */
export function briefJsonSchema(sourceCount: number) {
  return {
    name: "research_brief",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        overview: { type: "string" },
        themes: { type: "array", items: { type: "string" } },
        items: {
          type: "array",
          maxItems: Math.min(BRIEF_MAX_ITEMS, sourceCount),
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              index: { type: "integer" },
              objective: { type: "string" },
              finding: { type: "string" },
              method: { type: ["string", "null"] },
              limitation: { type: ["string", "null"] },
              relevance: { type: "string" },
            },
            required: [
              "index",
              "objective",
              "finding",
              "method",
              "limitation",
              "relevance",
            ],
          },
        },
        basis: { type: "string" },
        visualizations: VISUALIZATIONS_JSON_SCHEMA,
      },
      required: ["overview", "themes", "items", "basis", "visualizations"],
    },
  } as const;
}

/** Which sources the brief was built from — echoed to the UI. */
export interface BriefSource {
  index: number;
  id: string;
  title: string;
  url: string;
  basis: "abstract" | "snippet";
}
