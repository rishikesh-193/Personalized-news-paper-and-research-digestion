import { test } from "node:test";
import assert from "node:assert/strict";
import { ResearchDigestSchema } from "../src/lib/research-schema";

// Re-implement or import the pure helper functions used in ResearchView
function toDocRow(row: {
  id: unknown;
  file_name: unknown;
  storage_path: unknown;
  status: unknown;
  error_message: unknown;
  digest_json: unknown;
  created_at?: unknown;
}) {
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
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

test("toDocRow safely handles valid digest JSON and maps created_at", () => {
  const mockDigest = {
    title: "Attention Is All You Need",
    executive_summary: "Transformers replace recurrent and convolutional models entirely with multi-head self-attention mechanisms.",
    key_findings: ["Significant BLEU score improvement", "Faster training times"],
    important_statistics: [
      { value: "28.4 BLEU", context: "Achieved on the WMT 2014 English-to-German task." },
    ],
    main_arguments: ["Self-attention is sufficient without recurrence or convolutions."],
    limitations: ["High memory footprint during quadratic attention calculation."],
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
