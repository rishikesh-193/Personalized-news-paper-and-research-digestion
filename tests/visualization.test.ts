import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CROSS_SOURCE_CAVEAT,
  MAX_VISUALIZATIONS,
  conceptualLayout,
  hasCycle,
  niceScale,
  numberAppearsInText,
  parsePlannedVisualizations,
  planVisualization,
  planVisualizations,
  resolveCitations,
  type BarVisualization,
  type ConceptualVisualization,
  type EvidenceSource,
  type LineVisualization,
  type PlannedVisualization,
  type ScatterVisualization,
  type TableVisualization,
} from "../src/lib/discovery/visualization";
import {
  BRIEF_CACHE_VERSION,
  briefSchemaFor,
  isBriefCacheCurrent,
} from "../src/lib/discovery/schema";
import { BriefVisualizations } from "../src/components/views/brief-visuals";
import type { BriefSource } from "../src/lib/discovery/schema";

/* --------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

/** The text the model actually saw, per source. */
const SOURCES: EvidenceSource[] = [
  {
    index: 1,
    title: "Paper One",
    url: "https://arxiv.org/abs/2401.00001",
    text: "Our method reaches 84.2% accuracy on the held-out test set.",
  },
  {
    index: 2,
    title: "Paper Two",
    url: "https://arxiv.org/abs/2401.00002",
    text: "The baseline scores 79 accuracy points and trains for 1,024 seconds.",
  },
  {
    index: 3,
    title: "Paper Three",
    url: "https://arxiv.org/abs/2401.00003",
    text: "A qualitative user study; it reports no numerical results.",
  },
];

const BRIEF_SOURCES: BriefSource[] = SOURCES.map((source) => ({
  index: source.index,
  id: `paper-${source.index}`,
  title: source.title,
  url: source.url,
  basis: "abstract",
}));

/** A flat proposal with every field present, as the JSON schema demands. */
function proposal(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "none",
    title: "A figure",
    explanation: "What this figure shows and why it matters.",
    caveat: null,
    sources: [],
    xAxisLabel: null,
    xAxisUnit: null,
    yAxisLabel: null,
    yAxisUnit: null,
    points: null,
    columns: null,
    rows: null,
    nodes: null,
    edges: null,
    ...over,
  };
}

/** Two grounded values, one per source (so the cross-source caveat applies). */
function barProposal(over: Record<string, unknown> = {}): Record<string, unknown> {
  return proposal({
    type: "bar",
    title: "Reported accuracy",
    explanation: "Accuracy as reported in each paper's abstract.",
    sources: [1, 2],
    xAxisLabel: "Paper",
    yAxisLabel: "Accuracy",
    yAxisUnit: "%",
    points: [
      { label: "Paper One", x: null, y: 84.2, source: 1, note: null },
      { label: "Paper Two", x: null, y: 79, source: 2, note: null },
    ],
    ...over,
  });
}

function bar(viz: PlannedVisualization | null): BarVisualization {
  if (!viz || viz.type !== "bar") throw new Error(`expected bar, got ${viz?.type}`);
  return viz;
}
function line(viz: PlannedVisualization | null): LineVisualization {
  if (!viz || viz.type !== "line") throw new Error(`expected line, got ${viz?.type}`);
  return viz;
}
function scatter(viz: PlannedVisualization | null): ScatterVisualization {
  if (!viz || viz.type !== "scatter")
    throw new Error(`expected scatter, got ${viz?.type}`);
  return viz;
}
function table(viz: PlannedVisualization | null): TableVisualization {
  if (!viz || viz.type !== "table") throw new Error(`expected table, got ${viz?.type}`);
  return viz;
}
function conceptual(viz: PlannedVisualization | null): ConceptualVisualization {
  if (!viz || viz.type !== "conceptual")
    throw new Error(`expected conceptual, got ${viz?.type}`);
  return viz;
}

/* ==========================================================================
 * Numerical chart data validation
 * ======================================================================== */

test("a grounded bar figure is planned with its values, axes and citations", () => {
  const viz = bar(planVisualization(barProposal(), SOURCES));

  assert.deepEqual(
    viz.points.map((point) => point.value),
    [84.2, 79],
  );
  assert.deepEqual(
    viz.points.map((point) => point.source),
    [1, 2],
  );
  assert.deepEqual(viz.sources, [1, 2]);
  assert.equal(viz.yAxis.label, "Accuracy");
  assert.equal(viz.yAxis.unit, "%");
  assert.equal(viz.xAxis.label, "Paper");
  assert.deepEqual(viz.notes, []);
});

test("a line figure needs at least three grounded points", () => {
  const three = proposal({
    type: "line",
    title: "Latency trend",
    explanation: "Reported latency across the reported sequence.",
    sources: [1],
    xAxisLabel: "Step",
    yAxisLabel: "Accuracy",
    points: [
      { label: "step 1", x: null, y: 84.2, source: 1, note: null },
      { label: "step 2", x: null, y: 84.2, source: 1, note: null },
      { label: "step 3", x: null, y: 84.2, source: 1, note: null },
    ],
  });
  assert.equal(line(planVisualization(three, SOURCES)).points.length, 3);

  const two = proposal({ ...three, points: (three.points as unknown[]).slice(0, 2) });
  assert.equal(planVisualization(two, SOURCES), null);
});

test("a scatter figure requires paired, grounded, finite coordinates", () => {
  const viz = scatter(
    planVisualization(
      proposal({
        type: "scatter",
        title: "Accuracy vs training time",
        explanation: "Two reported measurements plotted against each other.",
        sources: [2],
        xAxisLabel: "Training seconds",
        yAxisLabel: "Accuracy",
        points: [
          { label: null, x: 1024, y: 79, source: 2, note: null },
          { label: null, x: 1024, y: 79, source: 2, note: null },
          { label: null, x: 1024, y: 79, source: 2, note: null },
        ],
      }),
      SOURCES,
    ),
  );
  assert.equal(viz.points.length, 3);
  assert.equal(viz.caveat, null, "one source needs no comparability caveat");
});

/* ==========================================================================
 * Invalid and non-finite values
 * ======================================================================== */

test("non-finite values never reach a figure", () => {
  // zod itself rejects Infinity inside the array.
  const infinite = planVisualization(
    barProposal({
      points: [
        { label: "A", x: null, y: Number.POSITIVE_INFINITY, source: 1, note: null },
        { label: "B", x: null, y: 84.2, source: 1, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(infinite, null);

  // JSON cannot carry Infinity — it arrives as null, and is dropped.
  const nulled = planVisualization(
    barProposal({
      points: [
        { label: "A", x: null, y: null, source: 1, note: null },
        { label: "B", x: null, y: 84.2, source: 1, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(nulled, null, "one grounded point is below the bar minimum");

  // A single bad value is omitted, and the rest of the figure survives.
  const partial = bar(
    planVisualization(
      barProposal({
        sources: [1],
        points: [
          { label: "A", x: null, y: 84.2, source: 1, note: null },
          { label: "B", x: null, y: null, source: 1, note: null },
          { label: "C", x: null, y: 84.2, source: 1, note: null },
        ],
      }),
      SOURCES,
    ),
  );
  assert.equal(partial.points.length, 2);
  assert.match(partial.notes.join(" "), /could not be found|left out/);
});

test("numberAppearsInText rejects non-finite input and partial matches", () => {
  assert.equal(numberAppearsInText(Number.NaN, "84.2"), false);
  assert.equal(numberAppearsInText(Number.POSITIVE_INFINITY, "84.2"), false);
  assert.equal(numberAppearsInText(84.2, ""), false);
  assert.equal(numberAppearsInText(84.2, "reaches 84.2% accuracy"), true);
  assert.equal(numberAppearsInText(1024, "takes 1,024 seconds"), true);
  assert.equal(
    numberAppearsInText(84.2, "reaches 84.25% accuracy"),
    false,
    "a longer number must not count as a match",
  );
  assert.equal(numberAppearsInText(12, "takes 1200 ms"), false);
});

/* ==========================================================================
 * Citation resolution
 * ======================================================================== */

test("resolveCitations keeps only real, de-duplicated source indexes", () => {
  assert.deepEqual(resolveCitations([3, 3, 1, 0, -2, 9], 3), [3, 1]);
  assert.deepEqual(resolveCitations([], 3), []);
});

test("figures citing a non-existent source drop those citations and points", () => {
  const viz = line(
    planVisualization(
      proposal({
        type: "line",
        title: "Latency trend",
        explanation: "Reported values across the sequence.",
        sources: [1, 9],
        xAxisLabel: "Step",
        yAxisLabel: "Accuracy",
        points: [
          { label: "a", x: null, y: 84.2, source: 1, note: null },
          { label: "b", x: null, y: 84.2, source: 99, note: null },
          { label: "c", x: null, y: 84.2, source: 1, note: null },
          { label: "d", x: null, y: 84.2, source: 1, note: null },
        ],
      }),
      SOURCES,
    ),
  );

  assert.deepEqual(viz.sources, [1], "citation 9 does not resolve");
  assert.equal(
    viz.points.some((point) => point.source === 99),
    false,
  );
  assert.match(viz.notes.join(" "), /left out/);
});

/* ==========================================================================
 * Missing source evidence
 * ======================================================================== */

test("values that the cited source never reports are not plotted", () => {
  const invented = planVisualization(
    barProposal({
      points: [
        { label: "A", x: null, y: 97.5, source: 1, note: null },
        { label: "B", x: null, y: 88.1, source: 2, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(invented, null, "nothing grounded is left to draw");
});

test("a number is only valid for the source that actually reports it", () => {
  // 84.2 lives in source 1's text, so citing source 2 must not be accepted.
  const borrowed = planVisualization(
    barProposal({
      sources: [2],
      points: [
        { label: "A", x: null, y: 84.2, source: 2, note: null },
        { label: "B", x: null, y: 79, source: 2, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(borrowed, null);

  // Same figure, correct citations, renders.
  assert.ok(planVisualization(barProposal(), SOURCES));
});

test("a source with no numbers cannot back a numerical chart", () => {
  const viz = planVisualization(
    barProposal({
      sources: [3],
      points: [
        { label: "A", x: null, y: 84.2, source: 3, note: null },
        { label: "B", x: null, y: 79, source: 3, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(viz, null);
});

test("publication years are not turned into a performance trend", () => {
  const viz = planVisualization(
    proposal({
      type: "line",
      title: "Accuracy over the years",
      explanation: "Reported accuracy by publication year.",
      sources: [1],
      xAxisLabel: "Year",
      yAxisLabel: "Accuracy",
      points: [
        { label: "2019", x: null, y: 84.2, source: 1, note: null },
        { label: "2020", x: null, y: 84.2, source: 1, note: null },
        { label: "2021", x: null, y: 84.2, source: 1, note: null },
      ],
    }),
    SOURCES,
  );
  assert.equal(viz, null);
});

/* ==========================================================================
 * Incomparable benchmark metrics
 * ======================================================================== */

test("a figure mixing sources always carries the comparability caveat", () => {
  const viz = bar(planVisualization(barProposal(), SOURCES));
  assert.match(viz.caveat ?? "", /not directly comparable/);

  const withModelCaveat = bar(
    planVisualization(barProposal({ caveat: "Different test splits." }), SOURCES),
  );
  assert.match(withModelCaveat.caveat ?? "", /Different test splits\./);
  assert.match(withModelCaveat.caveat ?? "", /not directly comparable/);
});

test("a single-source figure keeps the model's caveat and adds nothing", () => {
  const viz = bar(
    planVisualization(
      barProposal({
        sources: [1],
        caveat: "Both values are from the same test set.",
        points: [
          { label: "A", x: null, y: 84.2, source: 1, note: null },
          { label: "B", x: null, y: 84.2, source: 1, note: null },
        ],
      }),
      SOURCES,
    ),
  );
  assert.equal(viz.caveat, "Both values are from the same test set.");
  assert.equal(viz.caveat?.includes(CROSS_SOURCE_CAVEAT), false);
});

test("a comparison table spanning sources is flagged as incomparable", () => {
  const viz = table(
    planVisualization(
      proposal({
        type: "table",
        title: "Methods compared",
        explanation: "How the reported methods differ.",
        sources: [1, 2],
        columns: ["Paper", "Method", "Reported result"],
        rows: [
          { cells: ["Paper One", "Fine-tuning", "84.2% accuracy"], source: 1 },
          { cells: ["Paper Two", "Baseline", "79 points"], source: 2 },
        ],
      }),
      SOURCES,
    ),
  );
  assert.match(viz.caveat ?? "", /not directly comparable/);
});

/* ==========================================================================
 * Table and conceptual validation
 * ======================================================================== */

test("tables are validated: columns, row width and row citations", () => {
  const viz = table(
    planVisualization(
      proposal({
        type: "table",
        title: "Methods compared",
        explanation: "How the reported methods differ.",
        sources: [1],
        columns: ["Paper", "Method"],
        rows: [
          { cells: ["Paper One", "Fine-tuning"], source: 1 },
          { cells: ["Only one cell"], source: 1 },
          { cells: ["Ghost", "Row"], source: 42 },
        ],
      }),
      SOURCES,
    ),
  );

  assert.deepEqual(viz.columns, ["Paper", "Method"]);
  assert.equal(viz.rows.length, 2, "the row citing a missing source is dropped");
  assert.deepEqual(viz.rows[1].cells, ["Only one cell", ""], "rows are padded");

  assert.equal(
    planVisualization(
      proposal({
        type: "table",
        title: "One column",
        explanation: "Not a comparison.",
        sources: [1],
        columns: ["Only"],
        rows: [{ cells: ["x"], source: 1 }],
      }),
      SOURCES,
    ),
    null,
  );
});

test("a conceptual figure keeps only edges between known nodes", () => {
  const viz = conceptual(
    planVisualization(
      proposal({
        type: "conceptual",
        title: "Pipeline",
        explanation: "The stages the paper describes.",
        sources: [1],
        nodes: [
          { id: "a", label: "Retrieve", detail: "Fetch passages" },
          { id: "b", label: "Generate", detail: null },
          { id: "c", label: "Verify", detail: null },
        ],
        edges: [
          { from: "a", to: "b", label: "context" },
          { from: "b", to: "ghost", label: null },
          { from: "b", to: "c", label: "check" },
        ],
      }),
      SOURCES,
    ),
  );

  assert.equal(viz.nodes.length, 3);
  assert.deepEqual(
    viz.edges.map((edge) => `${edge.from}->${edge.to}`),
    ["a->b", "b->c"],
  );
});

test("conceptual figures reject cycles, singletons and missing citations", () => {
  const cyclic = proposal({
    type: "conceptual",
    title: "Loop",
    explanation: "A cycle is not a workflow.",
    sources: [1],
    nodes: [
      { id: "a", label: "A", detail: null },
      { id: "b", label: "B", detail: null },
    ],
    edges: [
      { from: "a", to: "b", label: null },
      { from: "b", to: "a", label: null },
    ],
  });
  assert.equal(planVisualization(cyclic, SOURCES), null);

  assert.equal(
    planVisualization(
      proposal({ ...cyclic, nodes: [{ id: "a", label: "A", detail: null }], edges: [] }),
      SOURCES,
    ),
    null,
  );

  assert.equal(
    planVisualization(
      proposal({
        type: "conceptual",
        title: "No citation",
        explanation: "Nothing to cite.",
        sources: [7],
        nodes: [
          { id: "a", label: "A", detail: null },
          { id: "b", label: "B", detail: null },
        ],
        edges: [{ from: "a", to: "b", label: null }],
      }),
      SOURCES,
    ),
    null,
  );
});

test("hasCycle detects cycles and accepts a DAG", () => {
  const ids = ["a", "b", "c"];
  assert.equal(hasCycle(ids, [{ from: "a", to: "b" }, { from: "b", to: "c" }]), false);
  assert.equal(hasCycle(ids, [{ from: "a", to: "b" }, { from: "b", to: "a" }]), true);
  assert.equal(hasCycle(ids, []), false);
});

/* ==========================================================================
 * Empty visualization plans
 * ======================================================================== */

test("an empty plan renders nothing and no figure is forced", () => {
  assert.deepEqual(planVisualizations([], SOURCES), []);
  assert.deepEqual(planVisualizations([proposal({ type: "none" })], SOURCES), []);
  assert.deepEqual(planVisualizations([barProposal()], []), [], "no sources, no figures");
});

test("the plan is capped so a brief never becomes a dashboard", () => {
  const many = [
    barProposal(),
    barProposal({ title: "Second" }),
    barProposal({ title: "Third" }),
    barProposal({ title: "Fourth" }),
  ];
  const planned = planVisualizations(many, SOURCES);
  assert.equal(planned.length, MAX_VISUALIZATIONS);
  assert.ok(MAX_VISUALIZATIONS >= 1 && MAX_VISUALIZATIONS <= 3);
});

/* ==========================================================================
 * Malformed LLM output
 * ======================================================================== */

test("malformed proposals are discarded, never thrown", () => {
  const cases: unknown[] = [
    null,
    undefined,
    42,
    "a chart please",
    {},
    { type: "pie", title: "Pie", explanation: "Unsupported type." },
    { ...proposal({ type: "bar" }), points: "not an array" },
    proposal({ type: "bar", title: "x", explanation: "y" }),
    proposal({ type: "scatter", title: "x", explanation: "y", sources: [1], points: [] }),
  ];

  for (const raw of cases) {
    assert.equal(planVisualization(raw, SOURCES), null);
  }
  assert.deepEqual(planVisualizations(cases, SOURCES), []);
});

/* ==========================================================================
 * Cached briefs without visualization fields
 * ======================================================================== */

const LEGACY_BRIEF = {
  overview:
    "One paper reaches a reported accuracy [1]. Another reports a different baseline [2]. Both describe their own evaluation protocol [3].",
  themes: ["retrieval", "accuracy", "protocol"],
  items: [
    {
      index: 1,
      objective: "o",
      finding: "f",
      method: null,
      limitation: null,
      relevance: "r",
    },
  ],
  basis: "three abstracts",
};

test("a brief cached before this feature still validates, with an empty plan", () => {
  const parsed = briefSchemaFor(3).safeParse(LEGACY_BRIEF);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.deepEqual(parsed.data.visualizations, []);
  assert.deepEqual(parsePlannedVisualizations(parsed.data.visualizations, 3), []);
});

/* ==========================================================================
 * The generation-time figure contract
 * ======================================================================== */

/** The stored brief shape, plus whatever figures the model proposed. */
function briefWith(visualizations: unknown[]) {
  return { ...LEGACY_BRIEF, visualizations };
}

test("proposing no figure stays valid when the sources support none", () => {
  // The generator must never be forced into inventing a figure.
  for (const none of [[], [proposal({ type: "none" })]]) {
    const parsed = briefSchemaFor(3, SOURCES).safeParse(briefWith(none));
    assert.equal(parsed.success, true);
  }
});

test("a drawable figure satisfies the generation-time schema", () => {
  const parsed = briefSchemaFor(3, SOURCES).safeParse(
    briefWith([barProposal()]),
  );
  assert.equal(parsed.success, true);
});

test("a figure the planner cannot draw is invalid output, so it is resampled", () => {
  // This is the failure that produced a figure-less brief in practice: the
  // model proposed a table with no column headers, the planner rejected it,
  // and nothing asked for another sample.
  const undrawable = proposal({
    type: "table",
    title: "Dataset comparison",
    explanation: "How the papers compare.",
    sources: [1, 2],
    columns: null,
    rows: [
      { cells: ["One", "two"], source: 1 },
      { cells: ["Three", "four"], source: 2 },
    ],
  });
  for (const items of [[undrawable], [barProposal({ points: [{ label: "Paper One", x: null, y: 999, source: 1, note: null }] })]]) {
    assert.equal(briefSchemaFor(3, SOURCES).safeParse(briefWith(items)).success, false);
  }
});

test("the drawn-from-evidence check only applies while generating", () => {
  // Reading a cached brief back must not need the sources again: the figures
  // are re-validated separately by parsePlannedVisualizations.
  const undrawable = briefWith([proposal({ type: "table", columns: null })]);
  assert.equal(briefSchemaFor(3).safeParse(undrawable).success, true);
  assert.equal(briefSchemaFor(3, SOURCES).safeParse(undrawable).success, false);
});

test("only a brief stored by the current version may be reused", () => {
  const current = { ...LEGACY_BRIEF, visualizations: [], format_version: BRIEF_CACHE_VERSION };
  assert.equal(isBriefCacheCurrent(current), true);

  for (const stale of [
    undefined,
    null,
    "not a brief",
    {},
    LEGACY_BRIEF, // cached before figures existed
    { ...current, format_version: BRIEF_CACHE_VERSION - 1 },
    { ...current, format_version: String(BRIEF_CACHE_VERSION) },
  ]) {
    assert.equal(isBriefCacheCurrent(stale), false);
  }
});

test("cached figures survive a JSON round-trip and are re-validated", () => {
  const planned = bar(planVisualization(barProposal(), SOURCES));
  const cached = JSON.parse(JSON.stringify(planned)) as unknown;

  const restored = parsePlannedVisualizations([cached], 3);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], planned);

  // A stored figure whose citation no longer resolves is dropped, not rendered.
  assert.deepEqual(parsePlannedVisualizations([cached], 1), []);
  assert.deepEqual(parsePlannedVisualizations(cached, 3), []);
  assert.deepEqual(parsePlannedVisualizations([{ type: "bar", title: "broken" }], 3), []);
});

/* ==========================================================================
 * Rendering — never breaks the brief
 * ======================================================================== */

function renderFigures(visualizations: PlannedVisualization[]): string {
  return renderToStaticMarkup(
    React.createElement(BriefVisualizations, {
      visualizations,
      sources: BRIEF_SOURCES,
    }),
  );
}

test("an empty or missing plan renders no visual section at all", () => {
  assert.equal(renderFigures([]), "");
  assert.equal(
    renderToStaticMarkup(
      React.createElement(BriefVisualizations, {
        visualizations: undefined as unknown as PlannedVisualization[],
        sources: BRIEF_SOURCES,
      }),
    ),
    "",
  );
});

test("a planned bar figure renders values, axes and clickable citations", () => {
  const html = renderFigures([bar(planVisualization(barProposal(), SOURCES))]);

  assert.match(html, /Visual summary/);
  assert.match(html, /Reported accuracy/);
  assert.match(html, /84\.2%/);
  assert.match(html, /not directly comparable/);
  assert.match(html, /https:\/\/arxiv\.org\/abs\/2401\.00001/);
  assert.match(html, /target="_blank"/);
});

test("every figure type renders without throwing", () => {
  const figures: PlannedVisualization[] = [
    bar(planVisualization(barProposal(), SOURCES)),
    line(
      planVisualization(
        proposal({
          type: "line",
          title: "A reported trend",
          explanation: "Values across the reported sequence.",
          sources: [1],
          xAxisLabel: "Step",
          yAxisLabel: "Accuracy",
          points: [
            { label: "s1", x: null, y: 84.2, source: 1, note: null },
            { label: "s2", x: null, y: 84.2, source: 1, note: null },
            { label: "s3", x: null, y: 84.2, source: 1, note: null },
          ],
        }),
        SOURCES,
      ),
    ),
    scatter(
      planVisualization(
        proposal({
          type: "scatter",
          title: "Reported pairing",
          explanation: "Two reported measurements.",
          sources: [2],
          xAxisLabel: "Seconds",
          yAxisLabel: "Accuracy",
          points: [
            { label: null, x: 1024, y: 79, source: 2, note: null },
            { label: null, x: 1024, y: 79, source: 2, note: null },
            { label: null, x: 1024, y: 79, source: 2, note: null },
          ],
        }),
        SOURCES,
      ),
    ),
    table(
      planVisualization(
        proposal({
          type: "table",
          title: "Reported methods",
          explanation: "How the methods differ.",
          sources: [1],
          columns: ["Paper", "Method"],
          rows: [{ cells: ["Paper One", "Fine-tuning"], source: 1 }],
        }),
        SOURCES,
      ),
    ),
    conceptual(
      planVisualization(
        proposal({
          type: "conceptual",
          title: "Reported pipeline",
          explanation: "The stages the paper describes.",
          sources: [1],
          nodes: [
            { id: "a", label: "Retrieve", detail: "Fetch" },
            { id: "b", label: "Generate", detail: null },
          ],
          edges: [{ from: "a", to: "b", label: "context" }],
        }),
        SOURCES,
      ),
    ),
  ];

  assert.equal(figures.length, 5);
  const html = renderFigures(figures);
  for (const title of [
    "Reported accuracy",
    "A reported trend",
    "Reported pairing",
    "Reported methods",
    "Reported pipeline",
  ]) {
    assert.match(html, new RegExp(title));
  }
  assert.match(html, /<svg/, "charts are drawn as inline SVG");
});

test("malformed figures degrade gracefully and the rest of the brief still renders", () => {
  const broken = [
    { type: "line", title: "Broken line", points: null },
    { type: "scatter", title: "Broken scatter", points: [{ x: "nope" }] },
    { type: "table", title: "Broken table", columns: null, rows: null },
    { type: "conceptual", title: "Broken concept", nodes: null, edges: null },
    { type: "sparkline", title: "Unsupported type", points: [] },
    { type: "bar", title: "Missing everything" },
  ] as unknown as PlannedVisualization[];

  const html = renderFigures([
    ...broken,
    bar(planVisualization(barProposal(), SOURCES)),
  ]);

  // The healthy figure still renders alongside the broken ones.
  assert.match(html, /Reported accuracy/);
  assert.match(html, /84\.2%/);
  // Broken figures fall back to a readable placeholder instead of crashing.
  assert.match(html, /No comparable values|Too few ordered values|No paired values|No comparable rows|No steps/);
});

test("no malformed figure can produce a citation link it does not have", () => {
  const noSources = {
    type: "bar",
    title: "No citations",
    explanation: "e",
    sources: undefined,
    caveat: null,
    notes: undefined,
    xAxis: { label: "x", unit: null },
    yAxis: { label: "y", unit: null },
    points: [{ label: "A", value: 1, source: 1, note: null }],
  } as unknown as PlannedVisualization;

  const html = renderFigures([noSources]);
  assert.equal(html.includes("arxiv.org"), false);
  assert.equal(html.includes("Sources"), false);
});

/* ==========================================================================
 * Geometry helpers used by the renderers
 * ======================================================================== */

test("axis scales stay finite for empty, flat and polluted input", () => {
  for (const values of [[], [Number.NaN, Number.POSITIVE_INFINITY], [5, 5], [-3, 9.5]]) {
    const scale = niceScale(values);
    assert.ok(Number.isFinite(scale.min), `min for ${values}`);
    assert.ok(Number.isFinite(scale.max), `max for ${values}`);
    assert.ok(scale.ticks.length >= 2);
    assert.ok(scale.ticks.every((tick) => Number.isFinite(tick)));
    assert.ok(scale.max > scale.min);
  }
});

test("conceptual layout is deterministic and safe for unusable input", () => {
  const viz = conceptual(
    planVisualization(
      proposal({
        type: "conceptual",
        title: "Pipeline",
        explanation: "The stages the paper describes.",
        sources: [1],
        nodes: [
          { id: "a", label: "Retrieve", detail: null },
          { id: "b", label: "Generate", detail: null },
          { id: "c", label: "Verify", detail: null },
        ],
        edges: [
          { from: "a", to: "b", label: null },
          { from: "b", to: "c", label: null },
        ],
      }),
      SOURCES,
    ),
  );

  const first = conceptualLayout(viz);
  const second = conceptualLayout(viz);
  assert.deepEqual(first, second, "layout is deterministic");
  assert.deepEqual(
    first.nodes.map((node) => node.depth),
    [0, 1, 2],
  );
  assert.ok(first.width > 0 && first.height > 0);
  assert.ok(first.edges.every((edge) => Number.isFinite(edge.x1 + edge.y1 + edge.x2 + edge.y2)));

  const empty = conceptualLayout({ nodes: [], edges: [] } as unknown as ConceptualVisualization);
  assert.deepEqual(empty.nodes, []);
  assert.ok(Number.isFinite(empty.width) && Number.isFinite(empty.height));
});
