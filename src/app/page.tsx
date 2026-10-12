import Link from "next/link";
import { FileText, MessageSquareText, Newspaper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GoogleGlyph } from "@/components/google-glyph";

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

const stats = [
  { value: "5–10 min", label: "a day's briefing, start to finish" },
  { value: "3 bullets", label: "per story, plus why it matters" },
  { value: "1 library", label: "news, papers and PDFs you can ask" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
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
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-5xl px-5 pt-14 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
              A personalized newspaper
            </p>
            <h1 className="mt-6 max-w-4xl font-heading text-4xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              The internet,{" "}
              <em className="italic text-brand">edited</em> down to a
              five-minute read.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Chronicle follows the topics you care about — news, research
              papers, saved articles — and turns them into a calm daily
              briefing. Ten minutes replaces an hour of browsing.
            </p>

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
          </div>
        </section>

        <section aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">
            Features
          </h2>
          <div className="mx-auto w-full max-w-5xl divide-y divide-border px-5 sm:px-8">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.number}
                  className="grid gap-4 py-10 sm:py-12 md:grid-cols-12 md:items-start md:gap-8"
                >
                  <div className="flex items-center gap-3 md:col-span-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-brand">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-heading text-sm tracking-[0.2em] text-muted-foreground">
                      {feature.number}
                    </span>
                  </div>
                  <h3 className="font-heading text-2xl leading-tight tracking-tight md:col-span-4 md:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="max-w-xl leading-relaxed text-muted-foreground md:col-span-5">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-heading text-lg tracking-tight">
            Chronicle
            <span aria-hidden="true" className="text-brand">
              .
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            A personalized newspaper and research digest. Sign in with Google to
            get started.
          </p>
        </div>
      </footer>
    </div>
  );
}
