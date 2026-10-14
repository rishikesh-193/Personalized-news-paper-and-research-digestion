"use client";

import * as React from "react";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  FileText,
  MessageSquareText,
  Newspaper,
  ArrowRight,
} from "lucide-react";
import { cn } from "cn";
import { Reveal, useEffectsPreference } from "@/components/motion";

/**
 * The scroll sequence: the newspaper separates into the three product panels.
 *
 * Scroll-linked motion uses `useScroll` on a tall section with a `sticky`
 * inner viewport. Sticky positioning is native — the page never intercepts the
 * wheel — so keyboard scrolling, trackpads and scrollbars all keep working.
 *
 * Under reduced motion or Reduce effects the sequence is replaced by a plain
 * stacked list with a single reveal and no scroll coupling at all.
 */

type Panel = {
  key: string;
  kicker: string;
  headline: string;
  body: string;
  href: string;
  hrefLabel: string;
  icon: typeof Newspaper;
};

const PANELS: Panel[] = [
  {
    key: "today",
    kicker: "01 · Today",
    headline: "A front page, assembled",
    body:
      "Your edition, ranked by the topics you follow: a lead story, three-line summaries, and one line on why each story matters.",
    href: "/today",
    hrefLabel: "Open today's edition",
    icon: Newspaper,
  },
  {
    key: "research",
    kicker: "02 · Research",
    headline: "A paper, in one screen",
    body:
      "Upload a PDF and read its findings, statistics and open questions in one place — then set two or three papers side by side to compare them.",
    href: "/research",
    hrefLabel: "Open the research lab",
    icon: FileText,
  },
  {
    key: "ask",
    kicker: "03 · Ask",
    headline: "Answers from your own shelf",
    body:
      "Question what you have saved. Every sentence cites the source it came from, or says plainly that it isn't in your library.",
    href: "/ask",
    hrefLabel: "Ask your library",
    icon: MessageSquareText,
  },
];

/** Small, obviously-schematic preview of the screen each panel describes. */
function PanelPreview({ which }: { which: string }) {
  if (which === "today") {
    return (
      <div aria-hidden="true" className="space-y-2.5">
        <div className="flex gap-2">
          <div className="h-16 flex-1 rounded-md border border-border bg-paper" />
          <div className="w-20 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-foreground/12" />
            <div className="h-2 w-4/5 rounded-full bg-foreground/12" />
            <div className="h-2 w-full rounded-full bg-foreground/12" />
            <div className="h-2 w-3/5 rounded-full bg-foreground/12" />
          </div>
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-brand" />
            <div className="h-2 flex-1 rounded-full bg-foreground/10" />
            <div className="h-2 w-12 rounded-full bg-foreground/10" />
          </div>
        ))}
      </div>
    );
  }

  if (which === "research") {
    return (
      <div aria-hidden="true" className="space-y-3">
        <div className="flex h-24 items-end gap-2 rounded-md border border-border bg-paper p-3">
          {[38, 62, 46, 80, 54].map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t-sm bg-brand/70"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-semibold text-brand-foreground">
            1
          </span>
          <div className="h-2 flex-1 rounded-full bg-foreground/10" />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-semibold text-brand-foreground">
            2
          </span>
          <div className="h-2 w-2/3 rounded-full bg-foreground/10" />
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-paper px-3 py-2">
        <div className="h-2 w-28 rounded-full bg-foreground/14" />
      </div>
      <div className="max-w-[88%] space-y-2 rounded-2xl rounded-bl-sm bg-brand/10 px-3 py-2">
        <div className="h-2 w-full rounded-full bg-foreground/12" />
        <div className="h-2 w-5/6 rounded-full bg-foreground/12" />
        <div className="flex items-center gap-1.5 pt-1">
          <span className="flex size-3.5 items-center justify-center rounded-full bg-brand text-[8px] font-semibold text-brand-foreground">
            1
          </span>
          <div className="h-1.5 w-20 rounded-full bg-foreground/12" />
        </div>
      </div>
    </div>
  );
}

function StoryCard({ panel, className }: { panel: Panel; className?: string }) {
  const Icon = panel.icon;
  return (
    <article
      className={cn(
        "paper-edge relative rounded-2xl border border-border bg-card p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-paper text-brand">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="font-heading text-sm tracking-[0.2em] text-muted-foreground uppercase">
          {panel.kicker}
        </span>
      </div>
      <h3 className="mt-5 font-heading text-2xl leading-tight tracking-tight sm:text-3xl">
        {panel.headline}
      </h3>
      <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
        {panel.body}
      </p>
      <div className="mt-5 border-t border-border pt-5">
        <PanelPreview which={panel.key} />
      </div>
      <Link
        href={panel.href}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand outline-offset-4 hover:gap-2.5"
      >
        {panel.hrefLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}

function DeckPanel({
  panel,
  index,
  progress,
  total,
}: {
  panel: Panel;
  index: number;
  progress: MotionValue<number>;
  total: number;
}) {
  const start = index / total;
  const end = start + 1 / total;

  const opacity = useTransform(progress, [start, start + 0.08], [0, 1]);
  const y = useTransform(progress, [start, end], [64, 0]);
  const scale = useTransform(progress, [start, end], [0.9, 1]);
  const rotateY = useTransform(progress, [start, end], [11, 0]);
  const rotateX = useTransform(progress, [start, end], [7, 0]);

  return (
    <motion.div
      style={{ opacity, y, scale, rotateY, rotateX, zIndex: index }}
      className="absolute inset-x-0 mx-auto w-full max-w-2xl [transform-style:preserve-3d] [perspective:1200px]"
    >
      <StoryCard panel={panel} />
    </motion.div>
  );
}

function Deck() {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const [active, setActive] = React.useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(PANELS.length - 1, Math.floor(value * PANELS.length));
    setActive((current) => (current === next ? current : next));
  });

  return (
    <div ref={sectionRef} className="relative hidden h-[280vh] lg:block">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <div className="mb-8 flex items-center gap-3" aria-hidden="true">
          {PANELS.map((panel, index) => (
            <span
              key={panel.key}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                index === active ? "w-10 bg-brand" : "w-4 bg-border",
              )}
            />
          ))}
        </div>
        <div className="relative h-[440px] w-full max-w-3xl px-6">
          {PANELS.map((panel, index) => (
            <DeckPanel
              key={panel.key}
              panel={panel}
              index={index}
              progress={scrollYProgress}
              total={PANELS.length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StaticStack() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-16 sm:px-8">
      {PANELS.map((panel) => (
        <Reveal key={panel.key}>
          <StoryCard panel={panel} />
        </Reveal>
      ))}
    </div>
  );
}

export function ScrollStory() {
  const { reduceEffects } = useEffectsPreference();

  return (
    <section aria-labelledby="story-heading" className="border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 pt-16 sm:px-8 sm:pt-20">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          What you get
        </p>
        <h2
          id="story-heading"
          className="mt-4 max-w-2xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl"
        >
          One paper, three rooms.
        </h2>
      </div>

      {reduceEffects ? (
        <StaticStack />
      ) : (
        <>
          <Deck />
          {/* Narrow viewports get the calm stacked version instead of a pinned
              sequence that would fight a phone's scroll. */}
          <div className="lg:hidden">
            <StaticStack />
          </div>
        </>
      )}
    </section>
  );
}
