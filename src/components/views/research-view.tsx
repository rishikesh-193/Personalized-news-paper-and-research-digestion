"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckIcon,
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  Scale,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DiscoverView } from "@/components/views/discover-view";
import { createClient } from "@/lib/supabase/client";
import {
  ResearchDigestSchema,
  type DocumentComparison,
  type ResearchDigest,
} from "@/lib/research-schema";

/** Must match the storage bucket cap in 002_research.sql. */
const MAX_BYTES = 10 * 1024 * 1024;

const HONESTY_NOTE =
  "Do not upload confidential documents. The text is sent to Groq for summarization.";

interface DocRow {
  id: string;
  fileName: string;
  storagePath: string;
  status: "processing" | "ready" | "failed";
  errorMessage: string | null;
  digest: ResearchDigest | null;
}

interface UploadJob {
  key: string;
  fileName: string;
  file: File | null;
  storagePath: string | null;
  phase: "uploading" | "reading" | "summarizing" | "failed";
  error: string | null;
}

const PHASE_LABEL: Record<UploadJob["phase"], string> = {
  uploading: "Uploading",
  reading: "Reading",
  summarizing: "Summarizing",
  failed: "Failed",
};

function toDocRow(row: {
  id: unknown;
  file_name: unknown;
  storage_path: unknown;
  status: unknown;
  error_message: unknown;
  digest_json: unknown;
}): DocRow {
  const parsed = row.digest_json
    ? ResearchDigestSchema.safeParse(row.digest_json)
    : null;
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    storagePath: String(row.storage_path),
    status:
      row.status === "ready" || row.status === "failed"
        ? row.status
        : "processing",
    errorMessage: row.error_message ? String(row.error_message) : null,
    digest: parsed && parsed.success ? parsed.data : null,
  };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Nothing stated in this paper.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
          <span
            className="mt-2 size-1 shrink-0 rounded-full bg-brand"
            aria-hidden="true"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ doc }: { doc: DocRow }) {
  if (doc.status === "processing") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Processing…
      </span>
    );
  }
  if (doc.status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-brand">
      <CheckIcon className="size-3.5" aria-hidden="true" />
      Ready
    </span>
  );
}

interface ComparisonResult {
  comparison: DocumentComparison;
  documentIds: string[];
  cached: boolean;
}

/**
 * "My documents" tab — the existing upload / digest / compare experience.
 * Rendered unchanged inside the ResearchView tab shell below.
 */
function DocumentsPanel() {
  const [docs, setDocs] = React.useState<DocRow[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [jobs, setJobs] = React.useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState<
    | { phase: "idle" }
    | { phase: "running" }
    | { phase: "error"; error: string }
    | { phase: "done"; result: ComparisonResult }
  >({ phase: "idle" });
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
    },
    [],
  );

  /** Loads the user's documents (RLS-scoped) and retires finished jobs. */
  const refresh = React.useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, file_name, storage_path, status, error_message, digest_json",
      )
      .order("created_at", { ascending: false });
    if (error || !data) {
      setLoadError(
        "Could not load your documents. If this persists, run the 002_research.sql migration.",
      );
      return;
    }
    setLoadError(null);
    const rows = data.map(toDocRow);
    setDocs(rows);
    // A job is done once its row reaches a terminal state (the list shows it).
    setJobs((prev) =>
      prev.filter((job) => {
        if (!job.storagePath) return true;
        const row = rows.find((item) => item.storagePath === job.storagePath);
        return !(row && row.status !== "processing");
      }),
    );
  }, []);

  React.useEffect(() => {
    // Deferred so the effect body itself performs no state updates.
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Poll while anything is in flight so the UI follows the server status.
  const hasActiveJob = jobs.some((job) => job.phase !== "failed");
  React.useEffect(() => {
    if (!hasActiveJob) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [hasActiveJob, refresh]);

  function ensureJob(job: UploadJob) {
    setJobs((prev) =>
      prev.some((item) => item.key === job.key)
        ? prev.map((item) => (item.key === job.key ? job : item))
        : [job, ...prev],
    );
  }

  const patchJob = React.useCallback((key: string, patch: Partial<UploadJob>) => {
    setJobs((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const failJob = React.useCallback((key: string, error: string) => {
    setJobs((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, phase: "failed", error } : item,
      ),
    );
  }, []);

  /** Extract + digest on the server; the row status is polled meanwhile. */
  const runDigest = React.useCallback(
    async (key: string, path: string, fileName: string) => {
      patchJob(key, { phase: "reading", error: null });
      const timer = window.setTimeout(() => {
        patchJob(key, { phase: "summarizing" });
      }, 4000);
      timersRef.current.push(timer);

      try {
        const response = await fetch("/api/research/digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, file_name: fileName }),
        });
        window.clearTimeout(timer);
        const data = (await response.json().catch(() => ({}))) as {
          id?: string;
          status?: string;
          error?: string;
        };
        if (response.ok && data.status === "ready" && data.id) {
          setJobs((prev) => prev.filter((item) => item.key !== key));
          await refresh();
          setOpenId(String(data.id));
          return;
        }
        if (data.id) {
          // The row exists and shows the failure with its own retry button.
          setJobs((prev) => prev.filter((item) => item.key !== key));
          await refresh();
          return;
        }
        failJob(key, data.error ?? "Summarizing failed — try again.");
      } catch {
        window.clearTimeout(timer);
        // Connection dropped: keep polling for the row; if no row ever
        // appears, surface a retry after 2 minutes.
        patchJob(key, { phase: "summarizing" });
        const cap = window.setTimeout(() => {
          setJobs((prev) =>
            prev.map((item) =>
              item.key === key && item.phase === "summarizing"
                ? {
                    ...item,
                    phase: "failed",
                    error:
                      "Connection problem — if the digest still finishes it will appear in your documents.",
                  }
                : item,
            ),
          );
        }, 120_000);
        timersRef.current.push(cap);
      }
    },
    [refresh, patchJob, failJob],
  );

  /** Validates, uploads straight to Storage, then requests the digest. */
  const processFile = React.useCallback(
    async (file: File, key: string = crypto.randomUUID()) => {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        ensureJob({
          key,
          fileName: file.name,
          file,
          storagePath: null,
          phase: "failed",
          error: "Only PDF files are supported.",
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        ensureJob({
          key,
          fileName: file.name,
          file,
          storagePath: null,
          phase: "failed",
          error: "This file is over the 10 MB limit.",
        });
        return;
      }

      ensureJob({
        key,
        fileName: file.name,
        file,
        storagePath: null,
        phase: "uploading",
        error: null,
      });

      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        failJob(key, "Your session expired — sign in again.");
        return;
      }

      // Direct-to-Storage upload with the user's own session; the route
      // handler only ever receives the path, never the file body.
      const path = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: "application/pdf" });
      if (error) {
        failJob(key, "Upload failed — try again.");
        return;
      }

      patchJob(key, { storagePath: path });
      await runDigest(key, path, file.name);
    },
    [runDigest, patchJob, failJob],
  );

  function retryJob(job: UploadJob) {
    if (job.file) {
      void processFile(job.file, job.key);
    } else if (job.storagePath) {
      void runDigest(job.key, job.storagePath, job.fileName);
    }
  }

  function retryDigest(doc: DocRow) {
    const key = crypto.randomUUID();
    ensureJob({
      key,
      fileName: doc.fileName,
      file: null,
      storagePath: doc.storagePath,
      phase: "reading",
      error: null,
    });
    void runDigest(key, doc.storagePath, doc.fileName);
  }

  async function deleteDoc(doc: DocRow) {
    const confirmed = window.confirm(
      `Delete "${doc.fileName}"? The stored file and its digest are removed permanently.`,
    );
    if (!confirmed) return;
    setDeletingId(doc.id);
    const supabase = createClient();
    await supabase.from("documents").delete().eq("id", doc.id);
    // Best-effort file removal — the row is already gone either way.
    await supabase.storage.from("documents").remove([doc.storagePath]);
    setDeletingId(null);
    if (openId === doc.id) setOpenId(null);
    setSelectedIds((prev) => prev.filter((id) => id !== doc.id));
    await refresh();
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list)) {
      void processFile(file);
    }
  }

  function toggleSelect(id: string) {
    setCompare({ phase: "idle" });
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id],
    );
  }

  const readyDocs = (docs ?? []).filter((doc) => doc.status === "ready");
  const selectedReady = selectedIds.filter((id) =>
    readyDocs.some((doc) => doc.id === id),
  );

  async function runCompare() {
    if (selectedReady.length < 2 || selectedReady.length > 3) return;
    setCompare({ phase: "running" });
    try {
      const response = await fetch("/api/research/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: selectedReady }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        comparison?: DocumentComparison;
        document_ids?: string[];
        cached?: boolean;
        error?: string;
      };
      if (!response.ok || !data.comparison || !data.document_ids) {
        setCompare({
          phase: "error",
          error: data.error ?? "Comparison failed — retry.",
        });
        return;
      }
      setCompare({
        phase: "done",
        result: {
          comparison: data.comparison,
          documentIds: data.document_ids,
          cached: Boolean(data.cached),
        },
      });
    } catch {
      setCompare({ phase: "error", error: "Network error — retry." });
    }
  }

  const openDoc = openId
    ? (docs ?? []).find((doc) => doc.id === openId && doc.digest) ?? null
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-brand"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {HONESTY_NOTE}
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
          PDFs up to 10 MB · private to you
        </p>
        <input
          id="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li
              key={job.key}
              className="rounded-xl border border-border bg-card px-4 py-3 transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText
                    className="size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <p className="truncate text-sm font-medium">{job.fileName}</p>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 text-xs",
                    job.phase === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {job.phase !== "failed" && (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {PHASE_LABEL[job.phase]}
                </span>
              </div>
              {job.phase === "failed" && job.error && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-destructive">{job.error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => retryJob(job)}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      <section aria-labelledby="documents-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="documents-heading" className="font-heading text-xl tracking-tight">
            Your documents
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedReady.length === 0
                ? "Select 2–3 to compare"
                : `${selectedReady.length} selected`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selectedReady.length < 2 || compare.phase === "running"}
              onClick={() => void runCompare()}
            >
              {compare.phase === "running" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Scale className="size-3.5" aria-hidden="true" />
              )}
              Compare
            </Button>
          </div>
        </div>

        {compare.phase === "error" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="text-xs text-destructive">{compare.error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runCompare()}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {docs === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload a PDF above — its digest will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => {
              const selected = selectedIds.includes(doc.id);
              return (
                <li
                  key={doc.id}
                  className="rounded-xl border border-border bg-card px-4 py-3 transition-shadow duration-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {doc.status === "ready" && doc.digest && (
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={`Select ${doc.fileName} for comparison`}
                          onClick={() => toggleSelect(doc.id)}
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            selected
                              ? "border-brand bg-brand text-background"
                              : "border-border hover:border-brand/60",
                          )}
                        >
                          {selected && (
                            <CheckIcon className="size-3" aria-hidden="true" />
                          )}
                        </button>
                      )}
                      <FileText
                        className="size-4 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {doc.fileName}
                        </p>
                        <div className="mt-1">
                          <StatusChip doc={doc} />
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {doc.status === "ready" && doc.digest && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setOpenId((prev) =>
                              prev === doc.id ? null : doc.id,
                            )
                          }
                        >
                          {openId === doc.id ? "Close" : "View digest"}
                        </Button>
                      )}
                      {doc.status === "failed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => retryDigest(doc)}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Retry
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === doc.id}
                        onClick={() => void deleteDoc(doc)}
                      >
                        {deletingId === doc.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          "Delete"
                        )}
                      </Button>
                    </div>
                  </div>
                  {doc.status === "failed" && doc.errorMessage && (
                    <p className="mt-2 text-xs text-destructive">
                      {doc.errorMessage}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {compare.phase === "done" && (
        <section aria-labelledby="comparison-heading" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="comparison-heading"
              className="font-heading text-xl tracking-tight"
            >
              Comparison
            </h2>
            {compare.result.cached && (
              <Badge className="bg-brand/10 text-brand hover:bg-brand/10">
                Saved comparison reused
              </Badge>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium">Aims</th>
                    <th className="px-4 py-3 font-medium">Methods</th>
                    <th className="px-4 py-3 font-medium">Key findings</th>
                    <th className="px-4 py-3 font-medium">Best for</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.result.documentIds.map((id, index) => {
                    const doc = (docs ?? []).find((item) => item.id === id);
                    const { comparison } = compare.result;
                    return (
                      <tr
                        key={id}
                        className="border-b border-border align-top last:border-b-0"
                      >
                        <td className="px-4 py-3 font-medium">
                          {doc?.fileName ?? "Document"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {comparison.aims[index]}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {comparison.methods[index]}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {comparison.key_findings[index]}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {comparison.best_for[index]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <div className="paper-edge rounded-xl border border-border bg-card p-4 transition-shadow duration-200 hover:shadow-md">
            <SectionHeading>How they differ</SectionHeading>
            <BulletList items={compare.result.comparison.differences} />
          </div>
        </section>
      )}

      {openDoc && openDoc.digest && (
        <section
          aria-labelledby="digest-heading"
          className="space-y-4 scroll-mt-28"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {openDoc.fileName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpenId(null)}
            >
              Close
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl" id="digest-heading">
                {openDoc.digest.title}
              </CardTitle>
              <CardDescription>
                Digest generated from the uploaded PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SectionHeading>Executive summary</SectionHeading>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {openDoc.digest.executive_summary}
              </p>
              <div className="border-t border-border pt-4">
                <SectionHeading>Key findings</SectionHeading>
                <BulletList items={openDoc.digest.key_findings} />
              </div>
            </CardContent>
          </Card>

          {openDoc.digest.important_statistics.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              {openDoc.digest.important_statistics.map((stat) => (
                <div
                  key={stat.value + stat.context}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="font-heading text-3xl tracking-tight text-brand">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {stat.context}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Main arguments</CardTitle>
              </CardHeader>
              <CardContent>
                <BulletList items={openDoc.digest.main_arguments} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Limitations</CardTitle>
              </CardHeader>
              <CardContent>
                <BulletList items={openDoc.digest.limitations} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open questions</CardTitle>
            </CardHeader>
            <CardContent>
              <BulletList items={openDoc.digest.open_questions} />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

const TABS = [
  { value: "discover", label: "Discover" },
  { value: "documents", label: "My documents" },
] as const;

type ResearchTab = (typeof TABS)[number]["value"];

/**
 * /research — two tabs. Discover (default) searches papers and articles and
 * builds a brief over them; My documents is the existing PDF workflow.
 * `webEnabled` comes from the server, which alone can see TAVILY_API_KEY.
 */
export function ResearchView({ webEnabled }: { webEnabled: boolean }) {
  const [tab, setTab] = React.useState<ResearchTab>("discover");

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-4">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          Research Lab
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Discover papers and articles, or upload a PDF to get an executive
          summary, key findings, statistics, limitations and open questions.
        </p>
      </div>

      <div role="tablist" aria-label="Research sections" className="flex gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`research-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls={`research-panel-${item.value}`}
            onClick={() => setTab(item.value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              tab === item.value
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted-foreground hover:border-brand/50",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`research-panel-${tab}`}
        aria-labelledby={`research-tab-${tab}`}
      >
        {tab === "discover" ? (
          <DiscoverView webEnabled={webEnabled} />
        ) : (
          <DocumentsPanel />
        )}
      </div>
    </div>
  );
}
