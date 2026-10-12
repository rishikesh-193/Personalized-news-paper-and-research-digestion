"use client";

import { useMemo, useState } from "react";
import { Newspaper, RotateCcw } from "lucide-react";
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
  const [activeTopics, setActiveTopics] = useState<string[]>(topics);

  const filtered = useMemo(
    () => articles.filter((article) => activeTopics.includes(article.topic)),
    [activeTopics],
  );

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  function toggleTopic(topic: string) {
    setActiveTopics((prev) =>
      prev.includes(topic)
        ? prev.filter((t) => t !== topic)
        : [...prev, topic],
    );
  }

  function resetTopics() {
    setActiveTopics(topics);
  }

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

      <div className="grid gap-6 lg:grid-cols-12">
        <aside
          className="order-2 space-y-4 lg:order-1 lg:col-span-3"
          aria-label="Topics and filters"
        >
          <Card>
            <CardHeader>
              <CardTitle>Topics</CardTitle>
              <CardDescription>Choose what belongs in your edition.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {topics.map((topic) => {
                const active = activeTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTopic(topic)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                      active
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {topic}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sourceCounts.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between gap-2">
                  <span className="truncate">{source}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={resetTopics}>
            <RotateCcw aria-hidden="true" />
            Reset topics
          </Button>
        </aside>

        <section className="order-1 space-y-4 lg:order-2 lg:col-span-6" aria-label="Stories">
          <h2 className="sr-only">Stories</h2>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title="Nothing matches these topics"
              description="No stories in your edition right now. Re-enable a topic or reset the filter to see everything again."
              action={<Button onClick={resetTopics}>Show all topics</Button>}
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
