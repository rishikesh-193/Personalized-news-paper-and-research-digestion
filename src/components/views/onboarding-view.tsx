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
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex h-24 flex-col justify-between rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-brand bg-brand/10 ring-1 ring-brand"
          : "border-border bg-background hover:border-brand/40",
      )}
    >
      <Icon
        className={cn("size-5", active ? "text-brand" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="font-medium text-foreground">{tile.label}</span>
      {active ? (
        <span
          className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground"
          aria-hidden="true"
        >
          <Check className="size-3" />
        </span>
      ) : null}
    </button>
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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-5 sm:px-6">
          <Link
            href="/"
            className="font-heading text-lg tracking-tight"
            aria-label="Chronicle home"
          >
            Chronicle
            <span aria-hidden="true" className="text-brand">
              .
            </span>
          </Link>
          <ThemeToggle />
        </div>
        {/* Two-segment progress indicator */}
        <div className="mx-auto flex w-full max-w-4xl gap-1.5 px-5 pb-2 sm:px-6">
          <span
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step >= 1 ? "bg-brand" : "bg-border",
            )}
          />
          <span
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step >= 2 ? "bg-brand" : "bg-border",
            )}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {step === 1 ? (
          <>
            <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
              Step 1 of 2 · Set up your edition
            </p>
            <h1 className="mt-3 font-heading text-3xl tracking-tight sm:text-4xl">
              What do you want to read?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Pick at least {MIN_TOPICS} topics to build your Today page. Add
              anything that is missing — you can change all of this later in
              Settings.
            </p>

            <div className="relative mt-6">
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
                placeholder="Search topics…"
                className="h-10 pl-9"
                autoComplete="off"
              />
            </div>

            <p
              className="mt-4 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {counterText}
            </p>

            <div className="mt-6 space-y-8">
              {visibleGroups.map((group) => (
                <section
                  key={group.label}
                  aria-labelledby={`group-${group.label}`}
                >
                  <h2
                    id={`group-${group.label}`}
                    className="font-heading text-lg tracking-tight"
                  >
                    {group.label}
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {group.tiles.map((tile) => (
                      <TileButton
                        key={tile.label}
                        tile={tile}
                        active={selected.includes(tile.label)}
                        onClick={() => toggleTopic(tile.label)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {visibleCustomTiles.length > 0 ? (
                <section aria-labelledby="group-yours">
                  <h2
                    id="group-yours"
                    className="font-heading text-lg tracking-tight"
                  >
                    Your topics
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {visibleCustomTiles.map((tile) => (
                      <TileButton
                        key={tile.label}
                        tile={tile}
                        active={selected.includes(tile.label)}
                        onClick={() => toggleTopic(tile.label)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="group-add">
                <h2 id="group-add" className="sr-only">
                  Add your own topic
                </h2>
                {showCustomInput ? (
                  <form
                    onSubmit={addCustomTopic}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <label htmlFor="custom-topic" className="sr-only">
                      Add your own topic
                    </label>
                    <Input
                      id="custom-topic"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Add your own topic…"
                      className="h-10 w-full sm:w-64"
                      autoFocus
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-10 gap-1.5"
                      disabled={!draft.trim()}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Add topic
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(true)}
                    className="flex h-24 w-full flex-col justify-between rounded-xl border border-dashed border-border bg-background p-4 text-left transition-colors hover:border-brand/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:max-w-[18rem]"
                  >
                    <Plus className="size-5 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-foreground">
                      Add your own topic
                    </span>
                  </button>
                )}
              </section>

              {visibleGroups.length === 0 &&
              visibleCustomTiles.length === 0 &&
              normalizedQuery ? (
                <p className="text-sm text-muted-foreground">
                  No topics match “{query}”. Add it as your own topic above.
                </p>
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
            <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
              Step 2 of 2 · Make it yours
            </p>
            <h1 className="mt-3 font-heading text-3xl tracking-tight sm:text-4xl">
              Fine-tune your interests.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Optional — pick sub-topics you care about most, or add your own
              keywords. Your picks shape which stories lead your edition.
            </p>

            <div className="mt-8 space-y-5">
              {selected.map((topic) => (
                <section
                  key={topic}
                  aria-labelledby={`subtopics-${topic}`}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <h2
                    id={`subtopics-${topic}`}
                    className="font-heading text-lg tracking-tight"
                  >
                    {topic}
                  </h2>
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
                            "rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            active
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {subTopic}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section
                aria-labelledby="keywords-heading"
                className="rounded-xl border border-border bg-card p-5"
              >
                <h2
                  id="keywords-heading"
                  className="font-heading text-lg tracking-tight"
                >
                  Keywords
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional — anything the topic tiles miss.
                </p>
                <label htmlFor="keywords" className="sr-only">
                  Keywords
                </label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="e.g. electric vehicles, urban design"
                  className="mt-3 h-10"
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

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <p
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {step === 1
              ? counterText
              : `${selected.length} topics · ${subTopics.length} sub-topics`}
          </p>
          <div className="flex items-center gap-3">
            {step === 2 ? (
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={pending}
                className="gap-1.5"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => finish(selected)}
                disabled={pending}
                className="gap-1.5"
              >
                <SkipForward className="size-4" aria-hidden="true" />
                Skip for now
              </Button>
            )}
            {step === 1 ? (
              <Button
                onClick={() => setStep(2)}
                disabled={selected.length < MIN_TOPICS}
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
                className="gap-2"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {pending ? "Saving…" : "Finish"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
