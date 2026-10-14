"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GoogleGlyph } from "@/components/google-glyph";
import { Reveal, Scene } from "@/components/motion";
import { HeroFallback } from "./hero-fallback";

/**
 * The WebGL scene is a separate client chunk, loaded only in the browser. The
 * import lives here — in a client module — because `ssr: false` only has an
 * effect at a client boundary.
 */
const NewspaperScene = dynamic(
  () => import("@/components/three/newspaper-scene").then((m) => m.NewspaperScene),
  { ssr: false },
);

const stats = [
  { value: "5–10 min", label: "a day's briefing, start to finish" },
  { value: "3 bullets", label: "per story, plus why it matters" },
  { value: "1 library", label: "news, papers and PDFs you can ask" },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* A very low-contrast warm wash so the sheets sit in a room, not a void. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_75%_20%,color-mix(in_oklab,var(--caramel)_26%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 pt-12 pb-14 sm:px-8 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-6 lg:pt-20 lg:pb-20">
        <div className="lg:pr-6">
          <Reveal as="p" className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
            A personalized newspaper
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-6 max-w-2xl font-heading text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The internet,{" "}
              <em className="italic text-brand">edited</em> down to a
              five-minute read.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Chronicle follows the topics you care about — news, research
              papers, saved articles — and turns them into a calm daily
              briefing. Ten minutes replaces an hour of browsing.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className={buttonVariants({ className: "h-10 gap-2 px-5" })}
              >
                <GoogleGlyph />
                Continue with Google
              </Link>
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "ghost",
                  className: "h-10 text-muted-foreground hover:text-foreground",
                })}
              >
                Sign in with email
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <dl className="mt-12 grid grid-cols-1 gap-6 border-t border-border pt-7 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.value}>
                  <dt className="font-heading text-2xl tracking-tight">
                    {stat.value}
                  </dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Scene
          className="h-[300px] w-full sm:h-[400px] lg:h-[560px]"
          label="An animated stack of newspaper pages"
          fallback={<HeroFallback className="h-full w-full" />}
        >
          <NewspaperScene />
        </Scene>
      </div>
    </section>
  );
}
