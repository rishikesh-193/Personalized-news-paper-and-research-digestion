"use client";

import { FileText, MessageSquareText, Newspaper } from "lucide-react";
import { Reveal, TiltCard } from "@/components/motion";

/** Copy carried over verbatim from the original landing page. */
const features = [
  {
    number: "01",
    icon: Newspaper,
    title: "Today, edited for you",
    description:
      "A front page assembled from your interests: a lead story, a three-line summary for every article, and one sentence on why it matters. No infinite feed — just the day's reading, ranked for you.",
  },
  {
    number: "02",
    icon: FileText,
    title: "Research, digested",
    description:
      "Drop in a PDF and get an executive summary, key findings, the statistics worth remembering, limitations and open questions. Compare two or three papers side by side.",
  },
  {
    number: "03",
    icon: MessageSquareText,
    title: "Ask your library",
    description:
      "Question everything you have saved. Answers come only from your own articles and papers, with citations that link back to the source — or a plain “not in your library” when it isn't.",
  },
];

export function FeatureCards() {
  return (
    <section
      aria-labelledby="features-heading"
      className="border-b border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-5 pt-16 sm:px-8 sm:pt-20">
        <h2
          id="features-heading"
          className="max-w-2xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl"
        >
          Built for five minutes, not five tabs.
        </h2>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.number} delay={index * 0.08}>
              <TiltCard
                as="article"
                max={4.5}
                className="paper-edge group h-full overflow-hidden rounded-2xl border border-border bg-card p-6"
              >
                {/* A second, offset sheet that slides out on hover — the card
                    "unfolds" rather than lifting. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-40 rotate-[-6deg] rounded-lg border border-border bg-paper transition-transform duration-500 ease-out group-hover:-translate-x-2 group-hover:-translate-y-2"
                />
                <div className="relative flex items-center gap-3">
                  <span className="border-border bg-paper text-brand flex size-9 shrink-0 items-center justify-center rounded-lg border">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-heading text-muted-foreground text-sm tracking-[0.2em]">
                    {feature.number}
                  </span>
                </div>
                <h3 className="relative mt-5 font-heading text-xl leading-tight tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground relative mt-3 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
