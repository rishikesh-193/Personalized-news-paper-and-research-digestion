"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { BriefVisualizations } from "@/components/views/brief-visuals";
import { createClient } from "@/lib/supabase/client";
import type {
  BriefSource,
  BriefWithVisualizations,
  DiscoverMode,
  DiscoverPaper,
} from "@/lib/discovery/schema";

const BRIEF_DISCLOSURE =
  "AI-generated from the sources listed. Check the originals.";

/** Honesty label — how each result's text was obtained. */
function basisLabel(kind: DiscoverPaper["kind"]): string {
  return kind === "paper"
    ? "Based on the abstract only"
    : "Based on a search snippet";
}

function authorLine(authors: string[]): string | null {
  if (authors.length === 0) return null;
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

interface SearchResponse {
  search_id: string;
  query: string;
  mode: DiscoverMode;
  cached: boolean;
  papers: DiscoverPaper[];
  brief: Brief | null;
  providers: Record<string, string>;
  warnings: string[];
}

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; error: string }
  | { phase: "done"; data: SearchResponse };

type Brief = BriefWithVisualizations;

type BriefState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; error: string }
  | { phase: "insufficient"; error: string; used: BriefSource[] }
  | {
      phase: "done";
      brief: Brief;
      used: BriefSource[];
      cached: boolean;
    };

const MODES: Array<{ value: DiscoverMode; label: string }> = [
  { value: "paper", label: "Papers" },
  { value: "web", label: "Web articles" },
  { value: "both", label: "Both" },
];

export function DiscoverView({ webEnabled }: { webEnabled: boolean }) {
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<DiscoverMode>("paper");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState<SearchState>({ phase: "idle" });
  const [brief, setBrief] = React.useState<BriefState>({ phase: "idle" });

  // Suggested-search chips come from the reader's own saved interests —
  // no LLM involved.
  React.useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("interests")
        .select("topic")
        .order("topic", { ascending: true });
      if (!active) return;
      setSuggestions(
        [...new Set((data ?? []).map((row) => String(row.topic)))].slice(0, 8),
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const runBrief = React.useCallback(async (searchId: string) => {
    if (!searchId) {
      setBrief({ phase: "idle" });
      return;
    }
    setBrief({ phase: "loading" });
    try {
      const response = await fetch("/api/research/discover/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: searchId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        brief?: Brief;
        used?: BriefSource[];
        cached?: boolean;
        insufficient?: boolean;
        error?: string;
      };
      if (data.insufficient) {
        setBrief({
          phase: "insufficient",
          error:
            data.error ?? "Not enough sources for a reliable overview.",
          used: data.used ?? [],
        });
        return;
      }
      if (!response.ok || !data.brief) {
        setBrief({
          phase: "error",
          error: data.error ?? "Could not build the brief — retry.",
        });
        return;
      }
      setBrief({
        phase: "done",
        brief: data.brief,
        used: data.used ?? [],
        cached: Boolean(data.cached),
      });
    } catch {
      setBrief({ phase: "error", error: "Network error — retry." });
    }
  }, []);

  const runSearch = React.useCallback(
    async (rawQuery: string, searchMode: DiscoverMode) => {
      const trimmed = rawQuery.trim();
      if (trimmed.length < 3) {
        setSearch({
          phase: "error",
          error: "Enter at least 3 characters to search.",
        });
        return;
      }
      setQuery(trimmed);
      setSearch({ phase: "loading" });
      setBrief({ phase: "idle" });
      try {
        const response = await fetch("/api/research/discover/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, mode: searchMode }),
        });
        const data = (await response.json().catch(() => ({}))) as Partial<
          SearchResponse
        > & { error?: string };
        if (!response.ok || !data.papers) {
          setSearch({
            phase: "error",
            error: data.error ?? "Search failed — retry.",
          });
          return;
        }
        const result: SearchResponse = {
          search_id: data.search_id ?? "",
          query: data.query ?? trimmed,
          mode: data.mode ?? searchMode,
          cached: Boolean(data.cached),
          papers: data.papers,
          brief: data.brief ?? null,
          providers: data.providers ?? {},
          warnings: data.warnings ?? [],
        };
        setSearch({ phase: "done", data: result });
        // The brief panel has its own loading state; the route serves a
        // cached brief immediately when one exists for this search.
        void runBrief(result.search_id);
      } catch {
        setSearch({ phase: "error", error: "Network error — retry." });
      }
    },
    [runBrief],
  );

  const searching = search.phase === "loading";
  const results = search.phase === "done" ? search.data.papers : [];
  const activeMode: DiscoverMode = webEnabled ? mode : "paper";

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <Compass
          className="mt-0.5 size-4 shrink-0 text-brand"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Search papers and articles on any topic, then read an AI brief built
          only from the sources shown. Nothing here is generated from a page we
          did not retrieve.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query, activeMode);
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search papers and articles…"
            aria-label="Search papers and articles"
            maxLength={200}
            className="flex-1"
          />
          <Button type="submit" disabled={searching} className="sm:w-auto">
            {searching ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            Search
          </Button>
        </div>

        {webEnabled ? (
          <div
            role="radiogroup"
            aria-label="Search mode"
            className="flex flex-wrap gap-1.5"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  mode === option.value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted-foreground hover:border-brand/50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Papers only — web search is off because{" "}
            <code className="text-foreground">TAVILY_API_KEY</code> is not
            configured on the server.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              From your interests:
            </span>
            {suggestions.map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={searching}
                onClick={() => void runSearch(topic, activeMode)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:opacity-50"
              >
                {topic}
              </button>
            ))}
          </div>
        )}
      </form>

      {search.phase === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{search.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runSearch(query, activeMode)}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {searching && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Searching papers and articles…
          </p>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {search.phase === "done" && (
        <section aria-labelledby="results-heading" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="results-heading"
              className="font-heading text-xl tracking-tight"
            >
              {results.length > 0
                ? `${results.length} result${results.length === 1 ? "" : "s"}`
                : "Results"}
            </h2>
            {search.data.cached && (
              <Badge className="bg-brand/10 text-brand hover:bg-brand/10">
                Cached search reused
              </Badge>
            )}
          </div>

          {search.data.warnings.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-4 py-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-brand"
                aria-hidden="true"
              />
              <ul className="space-y-1 text-xs text-muted-foreground">
                {search.data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {results.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No results"
              description="Try a broader term, or another mode."
            />
          ) : (
            <ul className="space-y-3">
              {results.map((paper) => {
                const authors = authorLine(paper.authors);
                const meta = [authors, paper.published_at, paper.source]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={paper.id}>
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-heading text-lg leading-snug tracking-tight underline-offset-4 hover:underline"
                          >
                            {paper.title}
                          </a>
                          <Badge variant="secondary" className="shrink-0">
                            {paper.source}
                          </Badge>
                        </div>
                        {meta && (
                          <CardDescription className="text-xs">
                            {meta}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {paper.abstract && (
                          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {paper.abstract}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {basisLabel(paper.kind)}
                          </span>
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline"
                          >
                            Open original
                            <ArrowUpRight className="size-3" aria-hidden="true" />
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {search.phase === "done" && search.data.search_id !== "" && (
        <section aria-labelledby="brief-heading" className="space-y-3">
          <h2
            id="brief-heading"
            className="font-heading text-xl tracking-tight"
          >
            Research brief
          </h2>

          {brief.phase === "loading" && (
            <Card>
              <CardContent className="space-y-3 py-6">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Reading the sources and writing the brief…
                </p>
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/5" />
              </CardContent>
            </Card>
          )}

          {brief.phase === "insufficient" && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/50 px-4 py-4">
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle
                  className="size-4 shrink-0 text-brand"
                  aria-hidden="true"
                />
                Not enough sources for a reliable overview
              </p>
              <p className="text-xs text-muted-foreground">
                {brief.used.length} source
                {brief.used.length === 1 ? "" : "s"} with usable text — at least
                3 are needed.
              </p>
              <ul className="space-y-1">
                {brief.used.map((source) => (
                  <li key={source.id} className="text-xs">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand underline-offset-4 hover:underline"
                    >
                      [{source.index}] {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.phase === "error" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{brief.error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void runBrief(search.data.search_id)}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            </div>
          )}

          {brief.phase === "done" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {BRIEF_DISCLOSURE}
                </span>
                {brief.cached && (
                  <Badge className="bg-brand/10 text-brand hover:bg-brand/10">
                    Saved brief reused
                  </Badge>
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {brief.brief.overview}
                  </p>
                  {brief.brief.themes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {brief.brief.themes.map((theme) => (
                        <Badge key={theme} variant="secondary">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Validated figures sit between the overview and the detailed
                  per-source analysis. Renders nothing when the plan is empty. */}
              <BriefVisualizations
                visualizations={brief.brief.visualizations}
                sources={brief.used}
              />

              <ul className="space-y-3">
                {brief.brief.items.map((item) => {
                  const source = brief.used[item.index - 1];
                  return (
                    <li key={item.index}>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            [{item.index}]{" "}
                            {source ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-4 hover:underline"
                              >
                                {source.title}
                              </a>
                            ) : (
                              "Source"
                            )}
                          </CardTitle>
                          {source && (
                            <CardDescription className="text-xs">
                              {source.basis === "abstract"
                                ? "Based on the abstract only"
                                : "Based on a search snippet"}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Objective
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {item.objective}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Finding
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {item.finding}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Method
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {item.method ?? "Not stated in the source."}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Limitation
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {item.limitation ?? "Not stated in the source."}
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Relevance
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {item.relevance}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Basis: </span>
                {brief.brief.basis}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
