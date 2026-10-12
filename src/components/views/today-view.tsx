"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Newspaper, Settings2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import {
  articles,
  dailyBriefing,
  threeThingsToKnow,
  topics,
  formatDate,
  type Article,
} from "@/lib/mock-data";

function ArticleCard({ article, lead = false }: { article: Article; lead?: boolean }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand/40">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {lead ? (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold tracking-wider text-brand-foreground uppercase">
            Lead story
          </span>
        ) : null}
        <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
          {article.topic}
        </span>
        <span>{article.source}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        <span aria-hidden="true">·</span>
        <span>{article.readTime} min read</span>
      </div>
      <h3
        className={cn(
          "mt-2.5 font-heading tracking-tight",
          lead ? "text-2xl leading-snug sm:text-3xl" : "text-xl leading-snug",
        )}
      >
        {article.title}
      </h3>
      <ul className="mt-3 space-y-1.5">
        {article.summaryBullets.map((bullet) => (
          <li
            key={bullet}
            className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
          >
            <span
              className="mt-2 size-1 shrink-0 rounded-full bg-brand"
              aria-hidden="true"
            />
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-4 border-l-2 border-brand bg-muted/40 py-2 pr-3 pl-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Why it matters
        </p>
        <p className="mt-1 text-sm leading-relaxed">{article.whyItMatters}</p>
      </div>
    </article>
  );
}

export function TodayView() {
  // null = "For you" (everything); otherwise a single topic tab.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const filtered = useMemo(
    () =>
      activeTab === null
        ? articles
        : articles.filter((article) => article.topic === activeTab),
    [activeTab],
  );

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const [lead, ...rest] = filtered;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
            {dailyBriefing.date}
          </p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight sm:text-4xl">
            Today&rsquo;s edition
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {articles.length} stories · {sourceCounts.length}{" "}
          sources
        </p>
      </div>

      {/* Compact, horizontally scrollable topic tabs + settings shortcut */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div
          className="flex min-w-0 gap-2 overflow-x-auto px-1 py-1"
          role="tablist"
          aria-label="Filter stories by topic"
        >
          <button
            key="for-you"
            type="button"
            role="tab"
            aria-selected={activeTab === null}
            onClick={() => setActiveTab(null)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              activeTab === null
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            For you
          </button>
          {topics.map((topic) => {
            const active = activeTab === topic;
            return (
              <button
                key={topic}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(active ? null : topic)}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {topic}
              </button>
            );
          })}
        </div>
        <Link
          href="/settings"
          className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          Edit interests
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="order-2 space-y-4 lg:order-1 lg:col-span-3" aria-label="Filters">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Sources today</CardTitle>
              <button
                type="button"
                onClick={() => setSourcesOpen((open) => !open)}
                aria-expanded={sourcesOpen}
                aria-controls="sources-today"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    sourcesOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">Toggle sources</span>
              </button>
            </CardHeader>
            {sourcesOpen ? (
              <CardContent id="sources-today" className="space-y-2 text-sm">
                {sourceCounts.map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between gap-2">
                    <span className="truncate">{source}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>
        </aside>

        <section className="order-1 space-y-4 lg:order-2 lg:col-span-6" aria-label="Stories">
          <h2 className="sr-only">Stories</h2>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={
                activeTab === null
                  ? "Your edition is empty"
                  : `Nothing new in ${activeTab}`
              }
              description={
                activeTab === null
                  ? "Once ingestion runs, your stories will appear here."
                  : "No stories in this topic right now — back to For you to see everything."
              }
              action={
                activeTab === null ? undefined : (
                  <Button onClick={() => setActiveTab(null)}>For you</Button>
                )
              }
            />
          ) : (
            <>
              <ArticleCard article={lead} lead />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {rest.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="order-3 space-y-4 lg:col-span-3" aria-label="Briefing">
          <Card>
            <CardHeader>
              <CardTitle>Daily briefing</CardTitle>
              <CardDescription>{dailyBriefing.date}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {dailyBriefing.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3 things to know</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {threeThingsToKnow.map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="font-heading text-lg leading-none text-brand">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
