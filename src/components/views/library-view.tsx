"use client";

import * as React from "react";
import {
  BookmarkX,
  ExternalLink,
  FileText,
  Newspaper,
  Search,
  SearchX,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { toggleSaveArticleAction } from "@/lib/article-actions";

export interface LibraryArticle {
  id: string;
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
  topic: string;
  summaryBullets: string[];
  whyItMatters: string;
  savedOn: string | null;
}

export interface LibraryDocument {
  id: string;
  fileName: string;
}

type TypeFilter = "all" | "article" | "document";

const filters: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "article", label: "Articles" },
  { value: "document", label: "Papers" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LibraryView({
  articles,
  documents,
}: {
  articles: LibraryArticle[];
  documents: LibraryDocument[];
}) {
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [removedIds, setRemovedIds] = React.useState<Set<string>>(new Set());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  async function unsave(articleId: string) {
    setBusyId(articleId);
    setActionError(null);
    const result = await toggleSaveArticleAction(articleId);
    if (result.ok) {
      setRemovedIds((previous) => new Set(previous).add(articleId));
    } else {
      setActionError(result.error ?? "Could not update your library.");
    }
    setBusyId(null);
  }

  const visibleArticles = articles.filter(
    (article) => !removedIds.has(article.id),
  );

  const items = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const articleItems = visibleArticles.map((article) => ({
      kind: "article" as const,
      key: `a-${article.id}`,
      search: `${article.title} ${article.source} ${article.topic} ${article.summaryBullets.join(" ")} ${article.whyItMatters}`,
      article,
    }));
    const documentItems = documents.map((document) => ({
      kind: "document" as const,
      key: `d-${document.id}`,
      search: document.fileName,
      document,
    }));
    return [...articleItems, ...documentItems].filter((item) => {
      const matchesType =
        typeFilter === "all" || item.kind === typeFilter;
      const matchesQuery =
        !needle || item.search.toLowerCase().includes(needle);
      return matchesType && matchesQuery;
    });
  }, [visibleArticles, documents, query, typeFilter]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
            Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you saved — articles and papers, in one place.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {items.length} of {visibleArticles.length + documents.length} items
        </p>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your library…"
            aria-label="Search your library"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Filter by type">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={typeFilter === filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                typeFilter === filter.value
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing here yet"
          description={
            hasQuery
              ? `No saved items match “${query.trim()}”. Try a different word or clear the filters.`
              : "Save an article from Today or upload a paper in Research — everything you keep shows up here."
          }
          action={
            hasQuery ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("all");
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) =>
            item.kind === "article" ? (
              <SavedArticleCard
                key={item.key}
                article={item.article}
                busy={busyId === item.article.id}
                onUnsave={() => unsave(item.article.id)}
              />
            ) : (
              <PaperCard key={item.key} document={item.document} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function SavedArticleCard({
  article,
  busy,
  onUnsave,
}: {
  article: LibraryArticle;
  busy: boolean;
  onUnsave: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const preview = article.summaryBullets[0] ?? article.whyItMatters;

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
          <Newspaper className="size-3" aria-hidden="true" />
          Article
        </span>
        <span className="truncate">{article.source}</span>
        {article.publishedAt ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatDate(article.publishedAt)}</span>
          </>
        ) : null}
      </div>
      <h2 className="font-heading text-lg leading-snug tracking-tight">
        {article.title}
      </h2>
      {preview ? (
        <p className={cn("text-sm leading-relaxed text-muted-foreground", !open && "line-clamp-2")}>
          {preview}
        </p>
      ) : null}
      {open ? (
        <ul className="mt-1 space-y-1 text-sm leading-relaxed text-muted-foreground">
          {article.summaryBullets.slice(1).map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {bullet}
            </li>
          ))}
          {article.whyItMatters ? (
            <li className="pt-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Why it matters: {article.whyItMatters}
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {article.summaryBullets.length + (article.whyItMatters ? 1 : 0) > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-sm font-medium text-brand hover:underline"
          >
            {open ? "Show less" : "Show summary"}
          </button>
        ) : null}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          Read original
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUnsave}
          disabled={busy}
          aria-label={`Remove ${article.title} from your library`}
          className="text-muted-foreground hover:text-destructive"
        >
          <BookmarkX className="size-4" aria-hidden="true" />
          {busy ? "Removing…" : "Remove"}
        </Button>
      </div>
    </article>
  );
}

function PaperCard({ document }: { document: LibraryDocument }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
          <FileText className="size-3" aria-hidden="true" />
          Paper
        </span>
      </div>
      <h2 className="font-heading text-lg leading-snug tracking-tight">
        {document.fileName}
      </h2>
      <div className="mt-1">
        <a
          href="/research"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          Open digest in Research
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <Badge className="mt-1 w-fit bg-brand/10 text-brand hover:bg-brand/10">
        Saved research
      </Badge>
    </article>
  );
}
