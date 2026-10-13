"use client";

import * as React from "react";
import { FileText, Newspaper, Search, SearchX } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { libraryItems, formatDate, type LibraryItem } from "@/lib/mock-data";

type TypeFilter = "all" | "article" | "document";

const filters: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "article", label: "Articles" },
  { value: "document", label: "Papers" },
];

function ItemCard({ item }: { item: LibraryItem }) {
  const isDocument = item.type === "document";
  const Icon = isDocument ? FileText : Newspaper;

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
          <Icon className="size-3" aria-hidden="true" />
          {isDocument ? "Paper" : "Article"}
        </span>
        <span className="truncate">{item.source}</span>
        <span aria-hidden="true">·</span>
        <span>Saved {formatDate(item.savedOn)}</span>
      </div>
      <h2 className="font-heading text-lg leading-snug tracking-tight">
        {item.title}
      </h2>
      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {item.excerpt}
      </p>
    </article>
  );
}

export function LibraryView() {
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return libraryItems.filter((item) => {
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const matchesQuery =
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.source.toLowerCase().includes(needle) ||
        item.excerpt.toLowerCase().includes(needle);
      return matchesType && matchesQuery;
    });
  }, [query, typeFilter]);

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
          <Badge className="mt-2 bg-brand/10 text-brand hover:bg-brand/10">
            Preview: sample data
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {libraryItems.length} items
        </p>
      </div>

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

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing here yet"
          description={
            hasQuery
              ? `No saved items match “${query.trim()}”. Try a different word or clear the filters.`
              : "No saved items of this type. Save an article or paper and it will show up here."
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
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
