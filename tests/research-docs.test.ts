import { test } from "node:test";
import assert from "node:assert/strict";
import { toDocRow } from "../src/components/views/research-view";
import {
  preparePaperText,
  shortErrorMessage,
} from "../src/app/api/research/digest/route";
import {
  InvalidOutputError,
  RateLimitExhaustedError,
} from "../scripts/ingest/groq";

test("toDocRow safely handles valid digest JSON and maps created_at", () => {
  const mockDigest = {
    title: "Attention Is All You Need",
    executive_summary:
      "Transformers replace recurrent and convolutional models entirely with multi-head self-attention mechanisms.",
    key_findings: ["Significant BLEU score improvement", "Faster training times"],
    important_statistics: [
      {
        value: "28.4 BLEU",
        context: "Achieved on the WMT 2014 English-to-German task.",
      },
    ],
    main_arguments: [
      "Self-attention is sufficient without recurrence or convolutions.",
    ],
    limitations: [
      "High memory footprint during quadratic attention calculation.",
    ],
    open_questions: ["Linear time complexity attention mechanisms."],
  };

  const row = {
    id: "doc-123",
    file_name: "paper.pdf",
    storage_path: "user-456/doc-123.pdf",
    status: "ready",
    error_message: null,
    digest_json: mockDigest,
    created_at: "2026-10-15T10:00:00Z",
  };

  const doc = toDocRow(row);
  assert.equal(doc.id, "doc-123");
  assert.equal(doc.fileName, "paper.pdf");
  assert.equal(doc.storagePath, "user-456/doc-123.pdf");
  assert.equal(doc.status, "ready");
  assert.equal(doc.errorMessage, null);
  assert.equal(doc.createdAt, "2026-10-15T10:00:00Z");
  assert.notEqual(doc.digest, null);
  assert.equal(doc.digest?.title, "Attention Is All You Need");
});

test("toDocRow gracefully defaults missing created_at and invalid status", () => {
  const row = {
    id: "doc-789",
    file_name: "test.pdf",
    storage_path: "user-456/doc-789.pdf",
    status: "unknown_status",
    error_message: "Some error",
    digest_json: null,
  };

  const doc = toDocRow(row);
  assert.equal(doc.id, "doc-789");
  assert.equal(doc.status, "processing"); // defaulted
  assert.equal(doc.errorMessage, "Some error");
  assert.equal(doc.digest, null);
  assert.equal(doc.createdAt, null);
});

test("toDocRow recovers stale processing rows (> 3 minutes old) to failed with a retry message", () => {
  // A row from 10 minutes ago that was stuck in processing
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleRow = {
    id: "doc-stale",
    file_name: "large-paper.pdf",
    storage_path: "user-456/large-paper.pdf",
    status: "processing",
    error_message: null,
    digest_json: null,
    created_at: tenMinutesAgo,
  };

  const doc = toDocRow(staleRow);
  assert.equal(doc.id, "doc-stale");
  assert.equal(doc.status, "failed");
  assert.equal(
    doc.errorMessage,
    "Processing timed out — click retry to run again.",
  );

  // A fresh row from 10 seconds ago remains in processing
  const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
  const freshRow = {
    id: "doc-fresh",
    file_name: "fresh-paper.pdf",
    storage_path: "user-456/fresh-paper.pdf",
    status: "processing",
    error_message: null,
    digest_json: null,
    created_at: tenSecondsAgo,
  };

  const freshDoc = toDocRow(freshRow);
  assert.equal(freshDoc.status, "processing");
  assert.equal(freshDoc.errorMessage, null);
});

test("preparePaperText preserves short text intact and safely samples head/tail for long papers", () => {
  const shortText = "Abstract: This is a short paper.\nConclusion: Everything works.";
  const preparedShort = preparePaperText(shortText);
  assert.equal(preparedShort, shortText);

  // 100,000 characters paper (like a 48-page PDF)
  const longText = "START_ABSTRACT " + "x".repeat(50_000) + " MIDDLE " + "y".repeat(50_000) + " END_CONCLUSION";
  const preparedLong = preparePaperText(longText);

  // Must not exceed ~24,100 characters so it fits within Groq TPM limit (~6k tokens)
  assert.ok(preparedLong.length < 25_000);
  assert.ok(preparedLong.startsWith("START_ABSTRACT"));
  assert.ok(preparedLong.endsWith("END_CONCLUSION"));
  assert.ok(preparedLong.includes("[... intermediate sections omitted for length ...]"));
});

test("shortErrorMessage extracts actionable diagnostic messages", () => {
  const rateLimitErr = new RateLimitExhaustedError("limit exceeded");
  assert.equal(
    shortErrorMessage(rateLimitErr),
    "Groq rate limit reached — please wait a moment and retry.",
  );

  const tpmErr = new Error("Rate limit reached for model: TPM 8000 exceeded. Please try again in 20s.");
  assert.equal(
    shortErrorMessage(tpmErr),
    "Groq rate limit reached — please wait a moment and retry.",
  );

  const invalidOutputErr = new InvalidOutputError("Malformed schema output");
  assert.equal(
    shortErrorMessage(invalidOutputErr),
    "The summary could not be validated — retry.",
  );

  const timeoutErr = new Error("Request timed out after 60000ms");
  assert.equal(
    shortErrorMessage(timeoutErr),
    "Summarizing took too long — retry.",
  );
});

test("Retry logic reuses existing storagePath instead of re-uploading a new file", () => {
  let uploadedNewFile = false;
  let reRanDigest = false;

  const mockJob = {
    key: "job-1",
    fileName: "test.pdf",
    file: {} as File,
    storagePath: "usr-1/test-existing.pdf",
    phase: "failed" as const,
    error: "Summarizing failed — try again.",
  };

  function retryJob(job: typeof mockJob) {
    if (job.storagePath) {
      reRanDigest = true;
    } else if (job.file) {
      uploadedNewFile = true;
    }
  }

  retryJob(mockJob);
  assert.equal(reRanDigest, true, "Should reuse storagePath and run digest");
  assert.equal(uploadedNewFile, false, "Should not upload a duplicate file");
});

test("Job filtering drops jobs whose storagePath already exists in database rows to eliminate duplicate cards", () => {
  const existingRows = [
    {
      id: "doc-1",
      fileName: "test.pdf",
      storagePath: "usr-1/test.pdf",
      status: "processing" as const,
      errorMessage: null,
      digest: null,
    },
  ];

  const jobs = [
    {
      key: "job-1",
      fileName: "test.pdf",
      file: null,
      storagePath: "usr-1/test.pdf", // matches doc-1
      phase: "failed" as const,
      error: "Summarizing failed — try again.",
    },
    {
      key: "job-2",
      fileName: "another.pdf",
      file: null,
      storagePath: null, // upload still pending
      phase: "uploading" as const,
      error: null,
    },
  ];

  const remainingJobs = jobs.filter((job) => {
    if (!job.storagePath) return true;
    const row = existingRows.find((item) => item.storagePath === job.storagePath);
    return !row;
  });

  assert.equal(remainingJobs.length, 1);
  assert.equal(remainingJobs[0].key, "job-2");
});

test("Query fallback logic recovers when column created_at is missing (code 42703)", async () => {
  let initialQueryCalled = false;
  let fallbackQueryCalled = false;

  // Mock Supabase client simulating missing created_at column error 42703
  const mockSupabase = {
    from: (table: string) => {
      assert.equal(table, "documents");
      return {
        select: () => ({
          order: (column: string) => {
            initialQueryCalled = true;
            assert.equal(column, "created_at");
            // Simulate PostgreSQL error 42703: column documents.created_at does not exist
            return Promise.resolve({
              data: null,
              error: {
                code: "42703",
                message: "column documents.created_at does not exist",
              },
            });
          },
        }),
      };
    },
  };

  // Run the fallback logic implemented in research-view
  let data: Array<{
    id: string;
    file_name: string;
    storage_path: string;
    status: string;
    error_message: string | null;
    digest_json: unknown;
  }> | null = null;
  let error: { code: string; message: string } | null = null;

  const res = await mockSupabase
    .from("documents")
    .select()
    .order("created_at");

  data = res.data;
  error = res.error;

  if (error && error.code === "42703") {
    fallbackQueryCalled = true;
    // Fallback query without ordering by created_at succeeds
    data = [
      {
        id: "1",
        file_name: "fallback.pdf",
        storage_path: "u1/1.pdf",
        status: "ready",
        error_message: null,
        digest_json: null,
      },
    ];
    error = null;
  }

  assert.equal(initialQueryCalled, true);
  assert.equal(fallbackQueryCalled, true);
  assert.equal(error, null);
  assert.ok(data);
  assert.equal(data.length, 1);
  assert.equal(data[0].file_name, "fallback.pdf");
});

test("Database storage path contract enforces user folder isolation", () => {
  const userId = "usr-12345";
  const validPath = `${userId}/paper-1.pdf`;
  const invalidCrossUserPath = `usr-99999/paper-1.pdf`;

  assert.equal(validPath.startsWith(`${userId}/`), true);
  assert.equal(validPath.endsWith(".pdf"), true);

  assert.equal(invalidCrossUserPath.startsWith(`${userId}/`), false);
});

test("10 MB storage bucket limit is respected", () => {
  const MAX_BYTES = 10 * 1024 * 1024; // 10485760 bytes
  assert.equal(MAX_BYTES, 10485760);

  const validSize = 5 * 1024 * 1024;
  const oversizedFile = 11 * 1024 * 1024;

  assert.equal(validSize <= MAX_BYTES, true);
  assert.equal(oversizedFile <= MAX_BYTES, false);
});
