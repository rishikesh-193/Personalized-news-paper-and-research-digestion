"use client";

import * as React from "react";
import { BarChart3, GitBranch, LineChart, ScatterChart, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BriefSource } from "@/lib/discovery/schema";
import {
  CONCEPTUAL_GEOMETRY,
  conceptualLayout,
  niceScale,
  type BarVisualization,
  type ConceptualVisualization,
  type LineVisualization,
  type PlannedVisualization,
  type ScatterVisualization,
  type TableVisualization,
} from "@/lib/discovery/visualization";

/**
 * Research brief figures.
 *
 * The planner has already validated every value and citation, so these
 * renderers are pure presentation: no data fetching, no LLM, no chart library.
 * They draw with plain SVG and CSS so they stay inside Chronicle's editorial
 * palette (one accent colour) and add no dependency or client-bundle weight.
 *
 * Empty, malformed or unsupported data can never crash the brief: each figure
 * renders inside `VizErrorBoundary`, and every renderer tolerates an empty
 * series.
 */

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${numberFormat.format(value / 1_000_000)}M`;
  if (magnitude >= 10_000) return `${numberFormat.format(value / 1_000)}k`;
  return numberFormat.format(value);
}

/** `%`/`°`/`$` hug the number; word units are spaced. */
function formatValue(value: number, unit: string | null): string {
  const formatted = formatNumber(value);
  if (!unit) return formatted;
  return /^[%°$€£]$/.test(unit) ? `${formatted}${unit}` : `${formatted} ${unit}`;
}

function axisTitle(label: string, unit: string | null): string {
  return unit ? `${label} (${unit})` : label;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/*
 * Defensive helpers. Data reaching these renderers has already been validated
 * by the planner, but a figure must never be able to throw: values and arrays
 * are re-checked here, and anything unusable is dropped.
 */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/** Shown in place of a figure whose data cannot be drawn. */
function EmptyFigure({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
      {message}
    </p>
  );
}

/* --------------------------------------------------------------------------
 * Shared chrome
 * ------------------------------------------------------------------------ */

/** Clickable `[n]` citations, linking to the original source. */
function CitationRefs({
  indexes,
  sources,
}: {
  indexes: number[];
  sources: BriefSource[];
}) {
  const resolved = safeArray(indexes)
    .map((index) => ({ index, source: safeArray(sources)[index - 1] }))
    .filter((entry) => entry.source !== undefined && entry.source !== null);
  if (resolved.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">Sources</span>
      {resolved.map(({ index, source }) => (
        <a
          key={index}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          className="text-xs text-brand underline-offset-4 hover:underline"
        >
          [{index}] {truncate(source.title, 46)}
        </a>
      ))}
    </div>
  );
}

const FIGURE_ICON = {
  bar: BarChart3,
  line: LineChart,
  scatter: ScatterChart,
  table: Table2,
  conceptual: GitBranch,
} as const;

/** Keeps a broken figure from taking the rest of the brief down with it. */
class VizErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          This figure could not be displayed. The brief and its sources are
          unaffected — see the citations below.
        </p>
      );
    }
    return this.props.children;
  }
}

/* --------------------------------------------------------------------------
 * Bar — HTML bars, so labels stay crisp at any width
 * ------------------------------------------------------------------------ */

function BarFigure({ viz }: { viz: BarVisualization }) {
  const points = safeArray(viz.points).filter(
    (point) =>
      isFiniteNumber(point?.value) &&
      typeof point?.label === "string" &&
      point.label.trim() !== "",
  );
  if (points.length === 0) {
    return <EmptyFigure message="No comparable values were available for this figure." />;
  }

  const values = points.map((point) => point.value);
  const domainMin = Math.min(0, ...values);
  const domainMax = Math.max(0, ...values);
  const span = domainMax - domainMin || 1;
  const zeroLine = ((0 - domainMin) / span) * 100;

  return (
    <ul className="space-y-2.5">
      {points.map((point, position) => {
        const width = ((point.value - domainMin) / span) * 100;
        return (
          <li key={`${point.label}-${position}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-xs text-foreground">
                {point.label}
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums">
                {formatValue(point.value, viz.yAxis.unit)}
              </span>
            </div>
            <div
              className="relative mt-1 h-2 rounded-full bg-muted"
              title={`${point.label}: ${formatValue(point.value, viz.yAxis.unit)} — [${point.source}]${point.note ? ` · ${point.note}` : ""}`}
            >
              <div
                className="absolute top-0 h-2 rounded-full bg-brand"
                style={{
                  left: `${Math.min(zeroLine, width)}%`,
                  width: `${Math.max(Math.abs(width - zeroLine), 0.75)}%`,
                }}
              />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-muted-foreground">
        Bars are drawn from zero on <span className="text-foreground">{axisTitle(viz.yAxis.label, viz.yAxis.unit)}</span>
        {viz.xAxis.unit ? ` · ${axisTitle(viz.xAxis.label, viz.xAxis.unit)}` : ""}
      </li>
    </ul>
  );
}

/* --------------------------------------------------------------------------
 * Line + scatter — plain SVG, fixed viewBox inside a scroll container
 * ------------------------------------------------------------------------ */

const VIEW_W = 560;
const VIEW_H = 250;
const PAD = { top: 16, right: 18, bottom: 46, left: 58 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const GUTTER = PAD.left / 2;

interface PlotProps {
  xAxis: { label: string; unit: string | null };
  yAxis: { label: string; unit: string | null };
  xLabels: string[];
  xPositions: number[];
  yValues: number[];
  rotateLabels: boolean;
  children: React.ReactNode;
}

function Plot({
  xAxis,
  yAxis,
  xLabels,
  xPositions,
  yValues,
  rotateLabels,
  children,
}: PlotProps) {
  const scale = niceScale(yValues);
  const yFor = (value: number) =>
    PAD.top + PLOT_H - ((value - scale.min) / (scale.max - scale.min || 1)) * PLOT_H;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`${yAxis.label} plotted against ${xAxis.label}`}
        className="mx-auto h-auto w-full min-w-[420px] max-w-3xl"
      >
        <g className="text-muted-foreground">
          {scale.ticks.map((tick) => (
            <line
              key={tick}
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.35 : 0.15}
              strokeWidth={1}
            />
          ))}
          {scale.ticks.map((tick) => (
            <text
              key={`label-${tick}`}
              x={PAD.left - 8}
              y={yFor(tick) + 3.5}
              textAnchor="end"
              fontSize={11}
              fill="currentColor"
            >
              {formatNumber(tick)}
            </text>
          ))}
          <line
            x1={PAD.left}
            x2={PAD.left}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="currentColor"
            strokeOpacity={0.35}
          />
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="currentColor"
            strokeOpacity={0.35}
          />
          {xLabels.map((label, index) => {
            const x = xPositions[index];
            return (
              <text
                key={`${label}-${index}`}
                x={x}
                y={PAD.top + PLOT_H + 14}
                textAnchor={rotateLabels ? "end" : "middle"}
                fontSize={11}
                fill="currentColor"
                transform={
                  rotateLabels ? `rotate(-28 ${x} ${PAD.top + PLOT_H + 14})` : undefined
                }
              >
                {truncate(label, 14)}
              </text>
            );
          })}
          <text
            transform={`rotate(-90 ${GUTTER} ${PAD.top + PLOT_H / 2})`}
            x={GUTTER}
            y={PAD.top + PLOT_H / 2}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
          >
            {truncate(axisTitle(yAxis.label, yAxis.unit), 40)}
          </text>
          <text
            x={PAD.left + PLOT_W / 2}
            y={VIEW_H - 4}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
          >
            {truncate(axisTitle(xAxis.label, xAxis.unit), 60)}
          </text>
        </g>
        {children}
      </svg>
    </div>
  );
}

function LineFigure({ viz }: { viz: LineVisualization }) {
  const points = safeArray(viz.points).filter(
    (point) =>
      isFiniteNumber(point?.value) &&
      typeof point?.label === "string" &&
      point.label.trim() !== "",
  );
  if (points.length < 2) {
    return <EmptyFigure message="Too few ordered values were available to draw a trend." />;
  }

  const xPositions = points.map(
    (_, index) => PAD.left + (PLOT_W * index) / (points.length - 1),
  );
  const yValues = points.map((point) => point.value);
  const scale = niceScale(yValues);
  const yFor = (value: number) =>
    PAD.top + PLOT_H - ((value - scale.min) / (scale.max - scale.min || 1)) * PLOT_H;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xPositions[index]} ${yFor(point.value)}`)
    .join(" ");

  return (
    <Plot
      xAxis={viz.xAxis ?? { label: "Sequence", unit: null }}
      yAxis={viz.yAxis ?? { label: "Value", unit: null }}
      xLabels={points.map((point) => point.label)}
      xPositions={xPositions}
      yValues={yValues}
      rotateLabels={points.some((point) => point.label.length > 7)}
    >
      <g className="text-brand">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            cx={xPositions[index]}
            cy={yFor(point.value)}
            r={3.5}
            fill="currentColor"
          >
            <title>{`${point.label}: ${formatValue(point.value, viz.yAxis.unit)} — [${point.source}]${point.note ? ` · ${point.note}` : ""}`}</title>
          </circle>
        ))}
      </g>
    </Plot>
  );
}

function ScatterFigure({ viz }: { viz: ScatterVisualization }) {
  const points = safeArray(viz.points).filter(
    (point) => isFiniteNumber(point?.x) && isFiniteNumber(point?.y),
  );
  if (points.length === 0) {
    return <EmptyFigure message="No paired values were available for this figure." />;
  }

  const xScale = niceScale(points.map((point) => point.x));
  const xFor = (value: number) =>
    PAD.left + ((value - xScale.min) / (xScale.max - xScale.min || 1)) * PLOT_W;
  const yValues = points.map((point) => point.y);
  const yScale = niceScale(yValues);
  const yFor = (value: number) =>
    PAD.top + PLOT_H - ((value - yScale.min) / (yScale.max - yScale.min || 1)) * PLOT_H;

  return (
    <Plot
      xAxis={viz.xAxis ?? { label: "x", unit: null }}
      yAxis={viz.yAxis ?? { label: "y", unit: null }}
      xLabels={xScale.ticks.map((tick) => formatNumber(tick))}
      xPositions={xScale.ticks.map((tick) => xFor(tick))}
      yValues={yValues}
      rotateLabels={false}
    >
      <g className="text-brand">
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={xFor(point.x)}
            cy={yFor(point.y)}
            r={4}
            fill="currentColor"
            fillOpacity={0.85}
          >
            <title>{`x ${formatNumber(point.x)}, y ${formatValue(point.y, viz.yAxis.unit)} — [${point.source}]${point.note ? ` · ${point.note}` : ""}`}</title>
          </circle>
        ))}
      </g>
    </Plot>
  );
}

/* --------------------------------------------------------------------------
 * Table
 * ------------------------------------------------------------------------ */

function TableFigure({
  viz,
  sources,
}: {
  viz: TableVisualization;
  sources: BriefSource[];
}) {
  const columns = safeArray(viz.columns).filter(
    (column) => typeof column === "string" && column.trim() !== "",
  );
  const rows = safeArray(viz.rows).filter((row) => safeArray(row?.cells).length > 0);
  if (columns.length === 0 || rows.length === 0) {
    return <EmptyFigure message="No comparable rows were available for this table." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-2 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {column}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border align-top last:border-b-0"
            >
              {columns.map((column, cellIndex) => (
                <td
                  key={column}
                  className="px-2 py-2.5 text-sm leading-relaxed text-muted-foreground"
                >
                  {row.cells[cellIndex] ?? ""}
                </td>
              ))}
              <td className="px-2 py-2.5 text-xs">
                {sources[row.source - 1] ? (
                  <a
                    href={sources[row.source - 1].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={sources[row.source - 1].title}
                    className="text-brand underline-offset-4 hover:underline"
                  >
                    [{row.source}]
                  </a>
                ) : (
                  `[${row.source}]`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Conceptual — layered diagram of validated nodes and edges
 * ------------------------------------------------------------------------ */

/** Conceptual geometry, kept in sync with the shared layout in the lib. */
const { nodeWidth: NODE_W, nodeHeight: NODE_H } = CONCEPTUAL_GEOMETRY;

function ConceptualFigure({ viz }: { viz: ConceptualVisualization }) {
  // Unique per figure: the arrow marker is referenced by id from the URL.
  const markerId = `conceptual-arrow-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const nodes = safeArray(viz.nodes).filter(
    (node) => typeof node?.id === "string" && node.id !== "",
  );
  const layout = conceptualLayout(viz);
  if (nodes.length === 0) {
    return <EmptyFigure message="No steps were available for this figure." />;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeLabels = safeArray(viz.edges);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`${viz.title}: workflow diagram`}
        className="h-auto w-full min-w-[420px] max-w-3xl"
      >
        <g className="text-muted-foreground">
          {layout.edges.map((edge) => {
            const span = Math.max(24, (edge.x2 - edge.x1) / 2);
            const label = edgeLabels.find(
              (item) => item.from === edge.from && item.to === edge.to,
            )?.label;
            const midX = (edge.x1 + edge.x2) / 2;
            const midY = (edge.y1 + edge.y2) / 2;
            return (
              <g key={`${edge.from}->${edge.to}`}>
                <path
                  d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + span} ${edge.y1}, ${edge.x2 - span} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  strokeWidth={1.25}
                  markerEnd={`url(#${markerId})`}
                />
                {label && (
                  <text
                    x={midX}
                    y={midY - 5}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="currentColor"
                  >
                    {truncate(label, 22)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {layout.nodes.map((position) => {
          const node = nodeById.get(position.id);
          if (!node) return null;
          return (
            <g key={position.id}>
              <rect
                x={position.x}
                y={position.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                className="fill-card"
                stroke="currentColor"
                strokeOpacity={0.35}
              />
              <text
                x={position.x + 10}
                y={position.y + (node.detail ? 19 : 27)}
                fontSize={12}
                fontWeight={500}
                className="fill-foreground"
              >
                {truncate(node.label, 20)}
              </text>
              {node.detail && (
                <text
                  x={position.x + 10}
                  y={position.y + 34}
                  fontSize={10.5}
                  className="fill-muted-foreground"
                >
                  {truncate(node.detail, 25)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Section
 * ------------------------------------------------------------------------ */

function FigureBody({
  viz,
  sources,
}: {
  viz: PlannedVisualization;
  sources: BriefSource[];
}) {
  switch (viz.type) {
    case "bar":
      return <BarFigure viz={viz} />;
    case "line":
      return <LineFigure viz={viz} />;
    case "scatter":
      return <ScatterFigure viz={viz} />;
    case "table":
      return <TableFigure viz={viz} sources={sources} />;
    case "conceptual":
      return <ConceptualFigure viz={viz} />;
    default:
      return null;
  }
}

const TYPE_LABEL: Record<PlannedVisualization["type"], string> = {
  bar: "Comparison",
  line: "Trend",
  scatter: "Relationship",
  table: "Comparison table",
  conceptual: "Concept map",
};

/**
 * The brief's visual section: figures that the planner validated, each with a
 * short interpretation, any comparability caveat, and clickable citations.
 * Renders nothing at all when the plan is empty — no chart is forced.
 */
export function BriefVisualizations({
  visualizations,
  sources,
}: {
  visualizations: PlannedVisualization[];
  sources: BriefSource[];
}) {
  if (!visualizations || visualizations.length === 0) return null;

  return (
    <section aria-labelledby="brief-visuals-heading" className="space-y-3">
      <h2
        id="brief-visuals-heading"
        className="font-heading text-xl tracking-tight"
      >
        Visual summary
      </h2>

      <div className="space-y-3">
        {visualizations.map((viz, index) => {
          // An unsupported type still renders a card — never an invalid element.
          const Icon = FIGURE_ICON[viz.type] ?? GitBranch;
          const notes = safeArray(viz.notes);
          return (
            <Card key={`${viz.type}-${index}-${viz.title}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">{viz.title}</CardTitle>
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 font-normal"
                  >
                    <Icon className="size-3" aria-hidden="true" />
                    {TYPE_LABEL[viz.type]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <VizErrorBoundary>
                  <FigureBody viz={viz} sources={sources} />
                </VizErrorBoundary>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {viz.explanation}
                </p>

                {viz.caveat && (
                  <p className="mt-2 border-l-2 border-brand/40 pl-2.5 text-xs leading-relaxed text-muted-foreground">
                    {viz.caveat}
                  </p>
                )}

                {notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {notes.map((note) => (
                      <li key={note} className="text-xs text-muted-foreground">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}

                <CitationRefs indexes={viz.sources} sources={sources} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
