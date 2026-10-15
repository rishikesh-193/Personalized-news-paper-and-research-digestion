"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Search,
  SkipForward,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { Reveal, TiltCard } from "@/components/motion";
import { completeOnboardingAction } from "@/lib/interests-actions";
import {
  ALL_TOPICS,
  TOPIC_GROUPS,
  subtopicSuggestionsFor,
  type TopicTile,
} from "@/lib/topic-groups";

const MIN_TOPICS = 3;

function TileButton({
  tile,
  active,
  onClick,
}: {
  tile: TopicTile;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tile.icon;
  return (
    <TiltCard
      as="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      max={4}
      className={cn(
        "group relative flex h-24 w-full flex-col justify-between rounded-xl border p-3.5 text-left select-none transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
        active
          ? "border-brand bg-brand/[0.08] ring-1 ring-brand/40 shadow-xs dark:bg-brand/15"
          : "border-border/80 bg-card hover:border-brand/40 hover:bg-accent/30 hover:shadow-xs",
      )}
    >
      <div className="flex w-full items-start justify-between">
        <Icon
          className={cn(
            "size-5 transition-transform duration-200 ease-out",
            active ? "scale-105 text-brand" : "text-muted-foreground group-hover:text-foreground",
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full transition-all duration-200",
            active
              ? "scale-100 bg-brand text-brand-foreground opacity-100 shadow-xs"
              : "scale-75 opacity-0 pointer-events-none",
          )}
          aria-hidden="true"
        >
          <Check className="size-3 stroke-[2.5]" />
        </span>
      </div>
      <span
        className={cn(
          "line-clamp-2 text-sm leading-snug tracking-tight transition-colors",
          active ? "font-semibold text-foreground" : "font-medium text-foreground/90",
        )}
      >
        {tile.label}
      </span>
    </TiltCard>
  );
}

export function OnboardingView({ next }: { next: string | null }) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [customTopics, setCustomTopics] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [subTopics, setSubTopics] = React.useState<string[]>([]);
  const [keywords, setKeywords] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Catalog + custom picks: used so a typed topic never duplicates a tile.
  const allTopics = [...ALL_TOPICS, ...customTopics];
  const normalizedQuery = query.trim().toLowerCase();

  function toggleTopic(topic: string) {
    setSelected((prev) =>
      prev.includes(topic)
        ? prev.filter((item) => item !== topic)
        : [...prev, topic],
    );
  }

  function toggleSubTopic(subTopic: string) {
    setSubTopics((prev) =>
      prev.includes(subTopic)
        ? prev.filter((item) => item !== subTopic)
        : [...prev, subTopic],
    );
  }

  function addCustomTopic(event: React.FormEvent) {
    event.preventDefault();
    const topic = draft.trim();
    if (!topic) return;

    const exists = allTopics.some(
      (item) => item.toLowerCase() === topic.toLowerCase(),
    );
    if (!exists) {
      setCustomTopics((prev) => [...prev, topic]);
      setSelected((prev) => [...prev, topic]);
    } else if (!selected.includes(topic)) {
      setSelected((prev) => [...prev, topic]);
    }
    setDraft("");
    setShowCustomInput(false);
  }

  function finish(interests: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction(interests);
        if (!result.ok) {
          setError(result.error ?? "Could not save your interests. Try again.");
          return;
        }
        router.push(next ?? "/today");
        router.refresh();
      } catch {
        setError("Could not save right now. Try again.");
      }
    });
  }

  const customTiles: TopicTile[] = customTopics.map((label) => ({
    label,
    icon: Check,
  }));

  const visibleGroups = TOPIC_GROUPS.map((group) => ({
    ...group,
    tiles: group.tiles.filter((tile) =>
      tile.label.toLowerCase().includes(normalizedQuery),
    ),
  })).filter((group) => group.tiles.length > 0);

  const visibleCustomTiles = customTiles.filter((tile) =>
    tile.label.toLowerCase().includes(normalizedQuery),
  );

  const counterText =
    selected.length < MIN_TOPICS
      ? `${selected.length} of ${MIN_TOPICS} minimum chosen`
      : `${selected.length} chosen`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Editorial Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-heading text-xl tracking-tight text-foreground transition-opacity hover:opacity-80"
              aria-label="Chronicle home"
            >
              Chronicle
              <span aria-hidden="true" className="text-brand">
                .
              </span>
            </Link>
            <span className="hidden text-xs text-muted-foreground/60 sm:inline-block">/</span>
            <span className="hidden text-xs font-medium tracking-wide text-muted-foreground uppercase sm:inline-block">
              {step === 1 ? "Edition Setup" : "Personalization"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  step >= 1
                    ? "bg-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                1
              </span>
              <span className="hidden sm:inline">Topics</span>
              <span className="mx-1 h-px w-3 bg-border" />
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  step >= 2
                    ? "bg-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                2
              </span>
              <span className="hidden sm:inline">Fine-tune</span>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Refined two-segment progress bar */}
        <div className="mx-auto flex w-full max-w-4xl gap-2 px-4 pb-2 sm:px-6">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300 ease-out",
                step >= 1 ? "w-full bg-brand" : "w-0 bg-transparent",
              )}
            />
          </div>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300 ease-out",
                step >= 2 ? "w-full bg-brand" : "w-0 bg-transparent",
              )}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-8 pb-32 sm:px-6 sm:pt-10 sm:pb-36">
        {step === 1 ? (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                Step 1 of 2 · Set up your edition
              </p>
              <h1 className="font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
                What do you want to read?
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Pick at least {MIN_TOPICS} topics to build your Today edition. You can fine-tune
                or change any of these later in Settings.
              </p>
            </div>

            {/* Search and Selection Toolbar */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <label htmlFor="topic-search" className="sr-only">
                  Search topics
                </label>
                <Input
                  id="topic-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search topics (e.g. AI, Climate, Markets)…"
                  className="h-10 rounded-lg border-border/80 bg-card/60 pl-9 pr-14 transition-colors focus:bg-card"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div
                className={cn(
                  "inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium transition-colors sm:self-auto",
                  selected.length >= MIN_TOPICS
                    ? "bg-brand/10 text-brand dark:bg-brand/20"
                    : "bg-muted text-muted-foreground",
                )}
                role="status"
                aria-live="polite"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    selected.length >= MIN_TOPICS ? "bg-brand" : "bg-muted-foreground/50",
                  )}
                />
                {counterText}
              </div>
            </div>

            {/* Topic Groups */}
            <div className="mt-8 space-y-8">
              {visibleGroups.map((group) => (
                <section
                  key={group.label}
                  aria-labelledby={`group-${group.label}`}
                  className="space-y-3"
                >
                  <div className="flex items-baseline justify-between border-b border-border/50 pb-2">
                    <h2
                      id={`group-${group.label}`}
                      className="font-heading text-lg font-normal tracking-tight text-foreground sm:text-xl"
                    >
                      {group.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {group.tiles.length} {group.tiles.length === 1 ? "topic" : "topics"}
                    </span>
                  </div>
                  <Reveal
                    stagger={0.02}
                    distance={12}
                    childClassName="h-full w-full"
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                  >
                    {group.tiles.map((tile) => (
                      <TileButton
                        key={tile.label}
                        tile={tile}
                        active={selected.includes(tile.label)}
                        onClick={() => toggleTopic(tile.label)}
                      />
                    ))}
                  </Reveal>
                </section>
              ))}

              {visibleCustomTiles.length > 0 ? (
                <section aria-labelledby="group-yours" className="space-y-3">
                  <div className="flex items-baseline justify-between border-b border-border/50 pb-2">
                    <h2
                      id="group-yours"
                      className="font-heading text-lg font-normal tracking-tight text-foreground sm:text-xl"
                    >
                      Your topics
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {visibleCustomTiles.length}{" "}
                      {visibleCustomTiles.length === 1 ? "topic" : "topics"}
                    </span>
                  </div>
                  <Reveal
                    stagger={0.02}
                    distance={12}
                    childClassName="h-full w-full"
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                  >
                    {visibleCustomTiles.map((tile) => (
                      <TileButton
                        key={tile.label}
                        tile={tile}
                        active={selected.includes(tile.label)}
                        onClick={() => toggleTopic(tile.label)}
                      />
                    ))}
                  </Reveal>
                </section>
              ) : null}

              {/* Add Custom Topic Section */}
              <section aria-labelledby="group-add" className="pt-2">
                <h2 id="group-add" className="sr-only">
                  Add your own topic
                </h2>
                {showCustomInput ? (
                  <form
                    onSubmit={addCustomTopic}
                    className="flex max-w-md items-center gap-2 rounded-xl border border-border/80 bg-card p-2 shadow-xs"
                  >
                    <label htmlFor="custom-topic" className="sr-only">
                      Add your own topic
                    </label>
                    <Input
                      id="custom-topic"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="e.g. Architecture, Urbanism…"
                      className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={!draft.trim()}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add topic
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCustomInput(false);
                        setDraft("");
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(true)}
                      className="group flex h-24 w-full flex-col justify-between rounded-xl border border-dashed border-border/80 bg-card/40 p-3.5 text-left transition-all duration-200 hover:border-brand/60 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none"
                    >
                      <div className="flex size-6 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors group-hover:border-brand/40 group-hover:text-brand">
                        <Plus className="size-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                        + Add custom topic…
                      </span>
                    </button>
                  </div>
                )}
              </section>

              {/* Empty Search State */}
              {visibleGroups.length === 0 &&
              visibleCustomTiles.length === 0 &&
              normalizedQuery ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
                  <Search className="mb-2 size-6 text-muted-foreground/60" aria-hidden="true" />
                  <p className="font-heading text-base text-foreground">
                    No topics match “{query}”
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    You can add and track “{query}” as a custom topic in your edition.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft(query);
                      setShowCustomInput(true);
                    }}
                    className="mt-3 gap-1.5"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add “{query}” as custom topic
                  </Button>
                </div>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                Step 2 of 2 · Make it yours
              </p>
              <h1 className="font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
                Fine-tune your interests.
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Optional — pick sub-topics you care about most, or add specific keywords.
                Your picks shape which stories lead your daily edition.
              </p>
            </div>

            <div className="mt-8 space-y-5">
              {selected.map((topic) => (
                <section
                  key={topic}
                  aria-labelledby={`subtopics-${topic}`}
                  className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h2
                      id={`subtopics-${topic}`}
                      className="font-heading text-lg font-medium tracking-tight"
                    >
                      {topic}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {
                        subTopics.filter((st) =>
                          subtopicSuggestionsFor(topic).includes(st),
                        ).length
                      }{" "}
                      selected
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subtopicSuggestionsFor(topic).map((subTopic) => {
                      const active = subTopics.includes(subTopic);
                      return (
                        <button
                          key={subTopic}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleSubTopic(subTopic)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
                            active
                              ? "border-brand bg-brand text-brand-foreground shadow-xs"
                              : "border-border/80 bg-background text-muted-foreground hover:border-brand/40 hover:text-foreground",
                          )}
                        >
                          {active ? (
                            <Check className="size-3 stroke-[2.5]" aria-hidden="true" />
                          ) : null}
                          {subTopic}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section
                aria-labelledby="keywords-heading"
                className="rounded-xl border border-border/80 bg-card p-5 shadow-xs"
              >
                <h2
                  id="keywords-heading"
                  className="font-heading text-lg font-medium tracking-tight"
                >
                  Keywords
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional — comma-separated topics or entities the tiles missed.
                </p>
                <label htmlFor="keywords" className="sr-only">
                  Keywords
                </label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="e.g. electric vehicles, urban design, semiconductor fabrication"
                  className="mt-3 h-10 border-border/80 bg-background"
                />
              </section>
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </>
        )}
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="sticky bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            <p
              className="text-xs font-medium text-muted-foreground sm:text-sm"
              role="status"
              aria-live="polite"
            >
              {step === 1 ? (
                <>
                  <span className="font-semibold text-foreground">{selected.length}</span> of{" "}
                  <span>{MIN_TOPICS} minimum chosen</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{selected.length}</span> topics ·{" "}
                  <span className="font-semibold text-foreground">{subTopics.length}</span> sub-topics
                </>
              )}
            </p>
            {step === 1 && selected.length < MIN_TOPICS ? (
              <span className="hidden text-xs text-muted-foreground/80 md:inline">
                ({MIN_TOPICS - selected.length} more needed to continue)
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {step === 2 ? (
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={pending}
                className="gap-1.5 text-xs sm:text-sm"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => finish(selected)}
                disabled={pending}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:text-sm"
              >
                <SkipForward className="size-4" aria-hidden="true" />
                Skip for now
              </Button>
            )}

            {step === 1 ? (
              <Button
                onClick={() => setStep(2)}
                disabled={selected.length < MIN_TOPICS}
                className={cn(
                  "gap-1.5 transition-all",
                  selected.length >= MIN_TOPICS
                    ? "bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
                    : "",
                )}
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={() =>
                  finish([
                    ...selected,
                    ...subTopics,
                    ...keywords
                      .split(",")
                      .map((keyword) => keyword.trim())
                      .filter(Boolean),
                  ])
                }
                disabled={pending}
                className="gap-2 bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {pending ? "Saving edition…" : "Complete Setup"}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
