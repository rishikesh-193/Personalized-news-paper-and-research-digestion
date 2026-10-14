import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GoogleGlyph } from "@/components/google-glyph";
import { SmoothScroll } from "@/components/motion";
import { LandingHero } from "@/components/landing/hero";
import { ScrollStory } from "@/components/landing/scroll-story";
import { FeatureCards } from "@/components/landing/feature-cards";

export default function Home() {
  return (
    <SmoothScroll>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
            <Link
              href="/"
              className="font-heading text-xl tracking-tight text-foreground"
            >
              Chronicle
              <span aria-hidden="true" className="text-brand">
                .
              </span>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle />
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-9 gap-2 px-2.5 text-xs sm:px-4 sm:text-sm",
                })}
              >
                <GoogleGlyph />
                Continue with Google
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <LandingHero />
          <ScrollStory />
          <FeatureCards />

          <section className="border-b border-border">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="max-w-xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
                  Your first edition is five minutes away.
                </h2>
                <p className="mt-3 max-w-lg text-muted-foreground">
                  Pick a few interests and Chronicle assembles today&apos;s
                  reading — no feed to scroll, nothing to keep up with.
                </p>
              </div>
              <Link
                href="/login"
                className={buttonVariants({
                  className: "h-11 shrink-0 gap-2 px-6",
                })}
              >
                <GoogleGlyph />
                Continue with Google
              </Link>
            </div>
          </section>
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="font-heading text-lg tracking-tight">
              Chronicle
              <span aria-hidden="true" className="text-brand">
                .
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              A personalized newspaper and research digest. Sign in with Google
              to get started.
            </p>
          </div>
        </footer>
      </div>
    </SmoothScroll>
  );
}
