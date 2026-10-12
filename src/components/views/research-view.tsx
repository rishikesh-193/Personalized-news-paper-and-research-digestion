"use client";

import * as React from "react";
import { FileText, FileUp } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { sampleDigest } from "@/lib/mock-data";

interface DraftDoc {
  id: string;
  name: string;
  status: "processing" | "ready";
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

export function ResearchView() {
  const [docs, setDocs] = React.useState<DraftDoc[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
    },
    [],
  );

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const names = Array.from(list)
      .slice(0, 3)
      .map((file) => file.name);
    const newDocs: DraftDoc[] = names.map((name, index) => ({
      id: `${Date.now()}-${index}`,
      name,
      status: "processing",
    }));
    setDocs((prev) => [...newDocs, ...prev]);
    for (const doc of newDocs) {
      const timer = window.setTimeout(() => {
        setDocs((prev) =>
          prev.map((item) =>
            item.id === doc.id ? { ...item, status: "ready" } : item,
          ),
        );
      }, 1600);
      timersRef.current.push(timer);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-4">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          Research Lab
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Drop in a paper to get an executive summary, key findings, statistics,
          limitations and open questions.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            document.getElementById("pdf-input")?.click();
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card/50 px-6 py-12 text-center transition-colors",
          dragOver
            ? "border-brand bg-brand/5"
            : "border-border hover:border-brand/50",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted text-brand">
          <FileUp className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm">
          Drop a PDF here, or{" "}
          <label
            htmlFor="pdf-input"
            className="cursor-pointer font-medium text-brand underline underline-offset-2"
          >
            browse
          </label>
        </p>
        <p className="text-xs text-muted-foreground">
          PDFs up to 20 MB · private to you
        </p>
        <input
          id="pdf-input"
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <section aria-labelledby="documents-heading" className="space-y-3">
        <h2 id="documents-heading" className="sr-only">
          Your documents
        </h2>
        {docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Uploads appear here with their digest. Until you add one, a sample digest is shown below."
          />
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText
                    className="size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    {doc.status === "processing" ? (
                      <Skeleton className="mt-1.5 h-3 w-32" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Text extracted · digest ready
                      </p>
                    )}
                  </div>
                </div>
                {doc.status === "processing" ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Analyzing…
                  </span>
                ) : (
                  <a
                    href="#sample-digest"
                    className="shrink-0 text-xs font-medium text-brand hover:underline"
                  >
                    View digest
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="sample-digest"
        aria-labelledby="digest-heading"
        className="space-y-4 scroll-mt-28"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-brand/10 text-brand hover:bg-brand/10">
            Sample digest
          </Badge>
          <span className="text-xs text-muted-foreground">
            {sampleDigest.fileName}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl" id="digest-heading">
              {sampleDigest.title}
            </CardTitle>
            <CardDescription>
              {sampleDigest.authors} · {sampleDigest.meta}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SectionHeading>Executive summary</SectionHeading>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {sampleDigest.executiveSummary}
            </p>
            <div className="border-t border-border pt-4">
              <SectionHeading>Key findings</SectionHeading>
              <ul className="mt-3 space-y-2">
                {sampleDigest.keyFindings.map((finding) => (
                  <li
                    key={finding}
                    className="flex gap-2.5 text-sm leading-relaxed"
                  >
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-brand"
                      aria-hidden="true"
                    />
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {sampleDigest.statistics.map((stat) => (
            <div
              key={stat.value + stat.label}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="font-heading text-3xl tracking-tight text-brand">
                {stat.value}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Limitations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {sampleDigest.limitations.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open questions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {sampleDigest.openQuestions.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-brand"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
