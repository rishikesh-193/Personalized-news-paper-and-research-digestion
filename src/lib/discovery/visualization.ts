import { z } from "zod";

/**
 * Research Brief visual intelligence.
 *
 * Two-stage design, deliberately:
 *
 * 1. The LLM PROPOSES a plan as one flat, permissive object per
 *    visualization (`llmVisualizationSchema`). A flat shape (every field
 *    required, unused ones null) is what strict JSON-schema structured output
 *    can express reliably — discriminated unions across many `anyOf` branches
 *    are not.
 *
 * 2. Deterministic application code VALIDATES and plans it
 *    (`planVisualizations`). This is where the honesty rules live: numbers
 *    must be traceable to the cited source's own text, citations must resolve,
 *    publication years are not performance trends, and figures that cannot be
 *    grounded are dropped rather than drawn. The planner never throws and
 *    never returns a half-built figure, so a bad plan can never break the
 *    existing brief.
 *
 * The model never supplies chart code, HTML or JavaScript — only data.
 */

export const VIZ_TYPES = [
  "bar",
  "line",
  "scatter",
  "table",
  "conceptual",
  "none",
] as const;
export type VizType = (typeof VIZ_TYPES)[number];

/**
 * At most this many figures are rendered for one brief. A tight cap keeps the
 * brief editorial: a chart, a table and a step diagram at most, never a wall
 * of dashboards.
 */
export const MAX_VISUALIZATIONS = 3;

/** Minimum data points before a figure is worth drawing. */
const MIN_BAR_POINTS = 2;
const MIN_LINE_POINTS = 3;
const MIN_SCATTER_POINTS = 3;
const MAX_POINTS = 8;
const MAX_TABLE_COLUMNS = 5;
const MAX_TABLE_ROWS = 8;
const MAX_NODES = 8;
const MAX_EDGES = 12;
const MAX_SOURCES_PER_FIGURE = 5;

/**
 * Appended whenever a figure mixes values from more than one source: scores
 * from different datasets or evaluation protocols are not directly comparable.
 */
export const CROSS_SOURCE_CAVEAT =
  "Values come from different sources and evaluation setups, so they are not directly comparable.";

/* --------------------------------------------------------------------------
 * Stage 1 — what the model proposes
 * ------------------------------------------------------------------------ */

export const llmPointSchema = z.object({
  /** Category / x-tick label for bar and line figures. */
  label: z.string().max(80).nullable(),
  /** Numeric x for scatter figures. */
  x: z.number().nullable(),
  y: z.number().nullable(),
  /** 1-based citation index into the supplied sources. */
  source: z.number().int(),
  note: z.string().max(300).nullable(),
});

export const llmVisualizationSchema = z.object({
  type: z.enum(VIZ_TYPES),
  title: z.string().min(3).max(160),
  explanation: z.string().min(10).max(600),
  caveat: z.string().min(1).max(400).nullable(),
  sources: z.array(z.number().int()).max(MAX_SOURCES_PER_FIGURE),
  xAxisLabel: z.string().min(1).max(80).nullable(),
  xAxisUnit: z.string().min(1).max(40).nullable(),
  yAxisLabel: z.string().min(1).max(80).nullable(),
  yAxisUnit: z.string().min(1).max(40).nullable(),
  points: z.array(llmPointSchema).max(MAX_POINTS).nullable(),
  columns: z.array(z.string().min(1).max(60)).max(MAX_TABLE_COLUMNS).nullable(),
  rows: z
    .array(
      z.object({
        cells: z.array(z.string().max(300)).max(MAX_TABLE_COLUMNS),
        source: z.number().int(),
      }),
    )
    .max(MAX_TABLE_ROWS)
    .nullable(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(80),
        detail: z.string().max(300).nullable(),
      }),
    )
    .max(MAX_NODES)
    .nullable(),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(40),
        to: z.string().min(1).max(40),
        label: z.string().max(80).nullable(),
      }),
    )
    .max(MAX_EDGES)
    .nullable(),
});
export type LlmVisualization = z.infer<typeof llmVisualizationSchema>;

/**
 * Sent to Groq's structured-output mode. `visualizations` is capped at
 * `MAX_VISUALIZATIONS`; the model may return an empty array (or a single
 * `none` entry) when no figure would materially help.
 */
export const VISUALIZATIONS_JSON_SCHEMA = {
  type: "array",
  maxItems: MAX_VISUALIZATIONS,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: [...VIZ_TYPES] },
      title: { type: "string" },
      explanation: { type: "string" },
      caveat: { type: ["string", "null"] },
      sources: { type: "array", items: { type: "integer" } },
      xAxisLabel: { type: ["string", "null"] },
      xAxisUnit: { type: ["string", "null"] },
      yAxisLabel: { type: ["string", "null"] },
      yAxisUnit: { type: ["string", "null"] },
      points: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: ["string", "null"] },
            x: { type: ["number", "null"] },
            y: { type: ["number", "null"] },
            source: { type: "integer" },
            note: { type: ["string", "null"] },
          },
          required: ["label", "x", "y", "source", "note"],
        },
      },
      columns: {
        type: ["array", "null"],
        items: { type: "string" },
      },
      rows: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cells: { type: "array", items: { type: "string" } },
            source: { type: "integer" },
          },
          required: ["cells", "source"],
        },
      },
      nodes: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            detail: { type: ["string", "null"] },
          },
          required: ["id", "label", "detail"],
        },
      },
      edges: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            label: { type: ["string", "null"] },
          },
          required: ["from", "to", "label"],
        },
      },
    },
    required: [
      "type",
      "title",
      "explanation",
      "caveat",
      "sources",
      "xAxisLabel",
      "xAxisUnit",
      "yAxisLabel",
      "yAxisUnit",
      "points",
      "columns",
      "rows",
      "nodes",
      "edges",
    ],
  },
} as const;

/* --------------------------------------------------------------------------
 * Stage 2 — what the app renders (validated)
 * ------------------------------------------------------------------------ */

export const axisSchema = z.object({
  label: z.string().min(1).max(80),
  unit: z.string().min(1).max(40).nullable(),
});
export type Axis = z.infer<typeof axisSchema>;

export const evidencePointSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.number().finite(),
  source: z.number().int().min(1),
  note: z.string().max(300).nullable(),
});

export const scatterPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  source: z.number().int().min(1),
  note: z.string().max(300).nullable(),
});

function baseVizFields(sourceCount: number) {
  return {
    title: z.string().min(1).max(160),
    explanation: z.string().min(1).max(600),
    /** Cited source indexes — every one resolves to a real source. */
    sources: z
      .array(z.number().int().min(1).max(sourceCount))
      .min(1)
      .max(MAX_SOURCES_PER_FIGURE),
    caveat: z.string().max(CAVEAT_MAX).nullable(),
    /** Deterministic notes, e.g. values omitted because they were ungrounded. */
    notes: z.array(z.string().max(300)),
  };
}

export function plannedVisualizationSchemaFor(sourceCount: number) {
  const base = baseVizFields(sourceCount);

  return z.discriminatedUnion("type", [
    z.object({
      ...base,
      type: z.literal("bar"),
      xAxis: axisSchema,
      yAxis: axisSchema,
      points: z.array(evidencePointSchema).min(MIN_BAR_POINTS),
    }),
    z.object({
      ...base,
      type: z.literal("line"),
      xAxis: axisSchema,
      yAxis: axisSchema,
      points: z.array(evidencePointSchema).min(MIN_LINE_POINTS),
    }),
    z.object({
      ...base,
      type: z.literal("scatter"),
      xAxis: axisSchema,
      yAxis: axisSchema,
      points: z.array(scatterPointSchema).min(MIN_SCATTER_POINTS),
    }),
    z.object({
      ...base,
      type: z.literal("table"),
      columns: z.array(z.string().min(1)).min(2).max(MAX_TABLE_COLUMNS),
      rows: z
        .array(
          z.object({
            cells: z.array(z.string()),
            source: z.number().int().min(1).max(sourceCount),
          }),
        )
        .min(1)
        .max(MAX_TABLE_ROWS),
    }),
    z.object({
      ...base,
      type: z.literal("conceptual"),
      nodes: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            detail: z.string().nullable(),
          }),
        )
        .min(2),
      edges: z.array(
        z.object({
          from: z.string().min(1),
          to: z.string().min(1),
          label: z.string().nullable(),
        }),
      ),
    }),
  ]);
}

type PlannedUnion = z.infer<ReturnType<typeof plannedVisualizationSchemaFor>>;
export type PlannedVisualization = PlannedUnion;
export type BarVisualization = Extract<PlannedUnion, { type: "bar" }>;
export type LineVisualization = Extract<PlannedUnion, { type: "line" }>;
export type ScatterVisualization = Extract<PlannedUnion, { type: "scatter" }>;
export type TableVisualization = Extract<PlannedUnion, { type: "table" }>;
export type ConceptualVisualization = Extract<PlannedUnion, {
  type: "conceptual";
}>;

/** A source the brief was built from, with the text the model actually saw. */
export interface EvidenceSource {
  /** 1-based, matching the `[n]` citation markers. */
  index: number;
  title: string;
  url: string;
  text: string;
}

/* --------------------------------------------------------------------------
 * Grounding helpers (pure, exported for tests)
 * ------------------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when a reported value appears verbatim in the source text. Guards
 * against fabricated, estimated or inferred numbers and against borrowing a
 * number from an unrelated sentence: the value must be written in the text of
 * the source that the data point cites. Accepts thousands separators
 * ("1,024") and trailing-zero forms ("12.40" for 12.4).
 */
export function numberAppearsInText(value: number, text: string): boolean {
  if (!Number.isFinite(value) || !text) return false;

  const candidates = new Set<string>([
    String(value),
    String(Number(value.toFixed(6))),
  ]);
  if (Number.isInteger(value)) {
    candidates.add(value.toLocaleString("en-US"));
  }

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `(^|[^0-9.])${escapeRegExp(candidate)}([^0-9]|$)`,
    );
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * A line whose x labels are all publication-style years is a publication
 * timeline, not a performance trend — explicitly not allowed.
 */
export function looksLikePublicationYears(labels: string[]): boolean {
  if (labels.length === 0) return false;
  return labels.every((label) => {
    const match = label.trim().match(/^(19|20)\d{2}$/);
    return match !== null;
  });
}

/** Keeps only citations that resolve to a supplied source, de-duplicated. */
export function resolveCitations(
  indexes: number[],
  sourceCount: number,
): number[] {
  const seen = new Set<number>();
  const resolved: number[] = [];
  for (const index of indexes) {
    if (!Number.isInteger(index)) continue;
    if (index < 1 || index > sourceCount) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    resolved.push(index);
  }
  return resolved;
}

/** Finite number or null — JSON cannot carry NaN/Infinity, so be explicit. */
function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* --------------------------------------------------------------------------
 * Stage 2 — the planner
 * ------------------------------------------------------------------------ */

interface PlannedBase {
  title: string;
  explanation: string;
  sources: number[];
  caveat: string | null;
  notes: string[];
}

/** Must match the `caveat` cap in `baseVizFields` (round-trips through cache). */
const CAVEAT_MAX = 600;

/** Adds the cross-source comparability caveat when a figure mixes sources. */
function withCaveats(
  base: Omit<PlannedBase, "caveat">,
  usedSources: number[],
  modelCaveat: string | null,
): PlannedBase {
  const distinct = new Set(usedSources);
  if (distinct.size <= 1) {
    return { ...base, caveat: modelCaveat?.slice(0, CAVEAT_MAX) ?? null };
  }

  // Scores from different datasets/evaluation protocols are not comparable.
  const combined = modelCaveat
    ? `${modelCaveat} ${CROSS_SOURCE_CAVEAT}`
    : CROSS_SOURCE_CAVEAT;
  return { ...base, caveat: combined.slice(0, CAVEAT_MAX) };
}

function planPointFigure(
  raw: LlmVisualization,
  type: "bar" | "line",
  sources: EvidenceSource[],
): BarVisualization | LineVisualization | null {
  const minimum = type === "bar" ? MIN_BAR_POINTS : MIN_LINE_POINTS;
  if (!raw.yAxisLabel) return null;
  if (type === "line" && !raw.xAxisLabel) return null;

  const rawPoints = raw.points ?? [];
  if (rawPoints.length < minimum) return null;

  const labels = rawPoints.map((point) => (point.label ?? "").trim());
  if (type === "line" && looksLikePublicationYears(labels)) return null;

  const textByIndex = new Map(sources.map((s) => [s.index, s.text]));
  const points: z.infer<typeof evidencePointSchema>[] = [];
  let dropped = 0;

  for (const [position, point] of rawPoints.entries()) {
    const label = labels[position];
    const value = finiteOrNull(point.y);
    if (!label || value === null) {
      dropped += 1;
      continue;
    }
    const text = textByIndex.get(point.source);
    if (text === undefined) {
      dropped += 1;
      continue;
    }
    // Never plot a number the cited source does not actually report.
    if (!numberAppearsInText(value, text)) {
      dropped += 1;
      continue;
    }
    points.push({
      label,
      value,
      source: point.source,
      note: point.note,
    });
  }

  if (points.length < minimum) return null;

  const notes: string[] = [];
  if (dropped > 0) {
    notes.push(
      `${dropped} value${dropped === 1 ? "" : "s"} could not be found in the cited source text and ${dropped === 1 ? "was" : "were"} left out.`,
    );
  }

  const cited = resolveCitations(
    raw.sources.length > 0 ? raw.sources : points.map((p) => p.source),
    sources.length,
  );
  if (cited.length === 0) return null;

  const base = withCaveats(
    {
      title: raw.title,
      explanation: raw.explanation,
      sources: cited,
      notes,
    },
    points.map((p) => p.source),
    raw.caveat,
  );
  const axes = {
    xAxis: {
      label: raw.xAxisLabel ?? (type === "bar" ? "Category" : "Sequence"),
      unit: raw.xAxisUnit,
    },
    yAxis: { label: raw.yAxisLabel, unit: raw.yAxisUnit },
  };

  return type === "bar"
    ? { ...base, type: "bar", ...axes, points }
    : { ...base, type: "line", ...axes, points };
}

function planScatter(
  raw: LlmVisualization,
  sources: EvidenceSource[],
): ScatterVisualization | null {
  if (!raw.xAxisLabel || !raw.yAxisLabel) return null;

  const rawPoints = raw.points ?? [];
  if (rawPoints.length < MIN_SCATTER_POINTS) return null;

  const textByIndex = new Map(sources.map((s) => [s.index, s.text]));
  const points: z.infer<typeof scatterPointSchema>[] = [];
  let dropped = 0;

  for (const point of rawPoints) {
    const x = finiteOrNull(point.x);
    const y = finiteOrNull(point.y);
    if (x === null || y === null) {
      dropped += 1;
      continue;
    }
    const text = textByIndex.get(point.source);
    if (text === undefined) {
      dropped += 1;
      continue;
    }
    // Both coordinates must be reported by the citing source.
    if (!numberAppearsInText(x, text) || !numberAppearsInText(y, text)) {
      dropped += 1;
      continue;
    }
    points.push({ x, y, source: point.source, note: point.note });
  }

  if (points.length < MIN_SCATTER_POINTS) return null;

  const notes: string[] = [];
  if (dropped > 0) {
    notes.push(
      `${dropped} point${dropped === 1 ? "" : "s"} could not be traced to the cited source text and ${dropped === 1 ? "was" : "were"} left out.`,
    );
  }

  const cited = resolveCitations(
    raw.sources.length > 0 ? raw.sources : points.map((p) => p.source),
    sources.length,
  );
  if (cited.length === 0) return null;

  return {
    ...withCaveats(
      {
        title: raw.title,
        explanation: raw.explanation,
        sources: cited,
        notes,
      },
      points.map((p) => p.source),
      raw.caveat,
    ),
    type: "scatter",
    xAxis: { label: raw.xAxisLabel, unit: raw.xAxisUnit },
    yAxis: { label: raw.yAxisLabel, unit: raw.yAxisUnit },
    points,
  };
}

function planTable(
  raw: LlmVisualization,
  sources: EvidenceSource[],
): TableVisualization | null {
  const columns = (raw.columns ?? []).map((column) => column.trim());
  if (columns.length < 2) return null;

  const rows: TableVisualization["rows"] = [];
  for (const row of raw.rows ?? []) {
    if (row.source < 1 || row.source > sources.length) continue;
    const cells = [...row.cells].slice(0, columns.length);
    while (cells.length < columns.length) cells.push("");
    rows.push({ cells, source: row.source });
  }
  if (rows.length === 0) return null;

  const cited = resolveCitations(
    raw.sources.length > 0 ? raw.sources : rows.map((row) => row.source),
    sources.length,
  );
  if (cited.length === 0) return null;

  return {
    ...withCaveats(
      {
        title: raw.title,
        explanation: raw.explanation,
        sources: cited,
        notes: [],
      },
      rows.map((row) => row.source),
      raw.caveat,
    ),
    type: "table",
    columns,
    rows: rows.slice(0, MAX_TABLE_ROWS),
  };
}

function planConceptual(
  raw: LlmVisualization,
  sources: EvidenceSource[],
): ConceptualVisualization | null {
  const nodes: ConceptualVisualization["nodes"] = [];
  const ids = new Set<string>();
  for (const node of raw.nodes ?? []) {
    const id = node.id.trim();
    if (!id || ids.has(id) || nodes.length >= MAX_NODES) continue;
    ids.add(id);
    nodes.push({ id, label: node.label.trim(), detail: node.detail });
  }
  if (nodes.length < 2) return null;

  // Only edges between known nodes are kept — dangling references are dropped
  // rather than drawn, and cycles are excluded so the layout stays deterministic.
  const edges: ConceptualVisualization["edges"] = [];
  const seenEdges = new Set<string>();
  for (const edge of raw.edges ?? []) {
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    const key = `${from}->${to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ from, to, label: edge.label });
  }
  if (hasCycle(nodes.map((node) => node.id), edges)) return null;

  // A conceptual figure has no per-datum sources, so it must cite one of the
  // sources it is explaining — never a default or invented index.
  const cited = resolveCitations(raw.sources, sources.length);
  if (cited.length === 0) return null;

  return {
    ...withCaveats(
      {
        title: raw.title,
        explanation: raw.explanation,
        sources: cited,
        notes: [],
      },
      cited,
      raw.caveat,
    ),
    type: "conceptual",
    nodes,
    edges: edges.slice(0, MAX_EDGES),
  };
}

/** Depth-first cycle detection — a DAG keeps the layered layout deterministic. */
export function hasCycle(
  nodeIds: string[],
  edges: Array<{ from: string; to: string }>,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === "visiting") return true;
    if (current === "done") return false;
    state.set(id, "visiting");
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    state.set(id, "done");
    return false;
  };

  return nodeIds.some((id) => visit(id));
}

/** Validates ONE proposed figure into the renderable shape, or null. */
export function planVisualization(
  raw: unknown,
  sources: EvidenceSource[],
): PlannedVisualization | null {
  const parsed = llmVisualizationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  if (item.type === "none") return null;

  try {
    if (item.type === "bar" || item.type === "line") {
      return planPointFigure(item, item.type, sources);
    }
    if (item.type === "scatter") return planScatter(item, sources);
    if (item.type === "table") return planTable(item, sources);
    return planConceptual(item, sources);
  } catch {
    // Any unexpected shape fails closed: the brief still renders.
    return null;
  }
}

/**
 * Validates a whole proposed plan. Always returns an array (possibly empty) —
 * a bad plan never breaks the brief, and `none` entries contribute nothing.
 */
export function planVisualizations(
  rawItems: unknown[],
  sources: EvidenceSource[],
): PlannedVisualization[] {
  if (sources.length === 0) return [];

  const planned: PlannedVisualization[] = [];
  for (const raw of rawItems ?? []) {
    if (planned.length >= MAX_VISUALIZATIONS) break;
    const plannedItem = planVisualization(raw, sources);
    if (plannedItem) planned.push(plannedItem);
  }
  return planned;
}

/* --------------------------------------------------------------------------
 * Render geometry (pure and defensive — the renderers must never throw)
 * ------------------------------------------------------------------------ */

/** Conceptual diagram geometry, shared by the layout and its renderer. */
export const CONCEPTUAL_GEOMETRY = {
  nodeWidth: 148,
  nodeHeight: 46,
  hGap: 54,
  vGap: 16,
  pad: 8,
} as const;

/**
 * Nice round axis ticks covering the data. Tolerates empty, NaN and
 * Infinity-bearing input, and a flat series, by returning a usable domain.
 */
export function niceScale(
  values: number[],
  tickCount = 4,
): { min: number; max: number; ticks: number[] } {
  const finite = (Array.isArray(values) ? values : []).filter((value) =>
    Number.isFinite(value),
  );
  if (finite.length === 0) return { min: 0, max: 1, ticks: [0, 1] };

  let low = Math.min(...finite);
  let high = Math.max(...finite);
  if (low === high) {
    const pad = Math.abs(low) > 0 ? Math.abs(low) * 0.1 : 1;
    low -= pad;
    high += pad;
  }

  const rawStep = (high - low) / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    magnitude *
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10);

  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(10)));
  }
  return { min, max, ticks };
}

export interface ConceptualLayout {
  width: number;
  height: number;
  nodes: Array<{ id: string; x: number; y: number; depth: number }>;
  edges: Array<{
    from: string;
    to: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
}

/**
 * Deterministic layered layout for a validated DAG (longest-path depth, one
 * column per layer). Malformed input yields an empty layout rather than a
 * throw.
 */
export function conceptualLayout(
  viz: ConceptualVisualization,
): ConceptualLayout {
  const { nodeWidth, nodeHeight, hGap, vGap, pad } = CONCEPTUAL_GEOMETRY;
  const sourceNodes = Array.isArray(viz?.nodes) ? viz.nodes : [];
  const sourceEdges = Array.isArray(viz?.edges) ? viz.edges : [];
  if (sourceNodes.length === 0) {
    return { width: 1, height: 1, nodes: [], edges: [] };
  }

  const ids = sourceNodes.map((node) => node.id);
  const incoming = new Map<string, string[]>(
    ids.map((id) => [id, [] as string[]]),
  );
  for (const edge of sourceEdges) {
    incoming.get(edge.to)?.push(edge.from);
  }

  const depthCache = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    // Already-planned figures are acyclic, but never recurse forever.
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const depth =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parent) => depthOf(parent, seen) + 1));
    depthCache.set(id, depth);
    return depth;
  };

  const placed = sourceNodes.map((node) => ({
    id: node.id,
    depth: depthOf(node.id, new Set()),
  }));

  const layers = new Map<number, string[]>();
  for (const node of placed) {
    const layer = layers.get(node.depth) ?? [];
    layer.push(node.id);
    layers.set(node.depth, layer);
  }

  const depthCount = Math.max(...placed.map((node) => node.depth)) + 1;
  const maxRows = Math.max(...[...layers.values()].map((layer) => layer.length));

  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, layerIds] of layers) {
    const layerHeight =
      layerIds.length * nodeHeight + (layerIds.length - 1) * vGap;
    const offset = (maxRows * nodeHeight + (maxRows - 1) * vGap - layerHeight) / 2;
    layerIds.forEach((id, row) => {
      positions.set(id, {
        x: pad + depth * (nodeWidth + hGap),
        y: pad + offset + row * (nodeHeight + vGap),
      });
    });
  }

  const nodes = placed.map((entry) => ({
    id: entry.id,
    x: positions.get(entry.id)?.x ?? pad,
    y: positions.get(entry.id)?.y ?? pad,
    depth: entry.depth,
  }));

  const edges = sourceEdges.flatMap((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return [];
    return [
      {
        from: edge.from,
        to: edge.to,
        x1: from.x + nodeWidth,
        y1: from.y + nodeHeight / 2,
        x2: to.x,
        y2: to.y + nodeHeight / 2,
      },
    ];
  });

  return {
    width: pad * 2 + depthCount * nodeWidth + (depthCount - 1) * hGap,
    height: pad * 2 + maxRows * nodeHeight + (maxRows - 1) * vGap,
    nodes,
    edges,
  };
}

/** Re-validates stored (already planned) figures — used for cached briefs. */
export function parsePlannedVisualizations(
  items: unknown,
  sourceCount: number,
): PlannedVisualization[] {
  if (!Array.isArray(items) || sourceCount === 0) return [];

  const schema = plannedVisualizationSchemaFor(sourceCount);
  const planned: PlannedVisualization[] = [];
  for (const item of items) {
    if (planned.length >= MAX_VISUALIZATIONS) break;
    const parsed = schema.safeParse(item);
    if (parsed.success) planned.push(parsed.data);
  }
  return planned;
}
