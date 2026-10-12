"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { completeOnboardingAction } from "@/lib/interests-actions";
import { topics } from "@/lib/mock-data";

export function OnboardingView({ next }: { next: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [customTopics, setCustomTopics] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const allTopics = [...topics, ...customTopics];

  function toggleTopic(topic: string) {
    setSelected((prev) =>
      prev.includes(topic)
        ? prev.filter((item) => item !== topic)
        : [...prev, topic],
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

  function saveInterests() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction(selected);
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-6">
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
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Step 1 of 1 · Set up your edition
        </p>
        <h1 className="mt-3 font-heading text-3xl tracking-tight sm:text-4xl">
          What should your edition follow?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pick the topics you want leading your Today page. Add anything that is
          missing — you can change all of this later in Settings.
        </p>

        <section
          aria-labelledby="topics-heading"
          className="mt-8 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="topics-heading" className="font-heading text-lg">
              Topics
            </h2>
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {selected.length} selected
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {allTopics.map((topic) => {
              const active = selected.includes(topic);
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
          </div>

          <form
            onSubmit={addCustomTopic}
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <label htmlFor="custom-topic" className="sr-only">
              Add your own topic
            </label>
            <Input
              id="custom-topic"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add your own topic…"
              className="h-9 w-full sm:w-64"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-9 gap-1.5"
              disabled={!draft.trim()}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add topic
            </Button>
          </form>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            onClick={saveInterests}
            disabled={pending || selected.length === 0}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {pending ? "Saving…" : "Save and continue"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {selected.length === 0
              ? "Choose at least one topic to continue."
              : "Interests and your profile are saved in Supabase."}
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
