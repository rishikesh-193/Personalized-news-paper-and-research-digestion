import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import {
  ResearchDigestSchema,
  RESEARCH_JSON_SCHEMA,
  type ResearchDigest,
} from "@/lib/research-schema";
import {
  GroqClient,
  InvalidOutputError,
  RateLimitExhaustedError,
} from "../../../../../scripts/ingest/groq";
import { chunkText, embedTexts } from "@/lib/embeddings";

export const maxDuration = 60;

/** Must match the storage bucket cap in 002_research.sql. */
const MAX_BYTES = 10 * 1024 * 1024;
/** ~6k tokens per section — every Groq request stays far under the limits. */
const SECTION_CHAR_LIMIT = 24_000;
/** Scanned/image-only PDFs extract to (almost) nothing. */
const MIN_TEXT_CHARS = 40;

const RequestSchema = z.object({
  path: z.string().min(3).max(512),
  file_name: z.string().min(1).max(255),
});

const DIGEST_SYSTEM = `You are a rigorous research analyst producing a structured digest of ONE paper.
Rules:
- Use ONLY the text supplied. Never invent numbers, findings, citations or claims that are not in the text.
- important_statistics: copy each value exactly as written in the paper. If the paper contains no statistics, return an empty list.
- Return empty lists for sections the paper does not contain (key_findings, main_arguments, limitations, open_questions as applicable).
- executive_summary: 4 to 6 sentences, covering the aim, method and main result.
- key_findings: 4 to 7 items when the paper supports them; fewer if it does not.
- limitations: only limitations the paper itself states or that directly follow from its stated method.
- title: the paper's own title; if none is present, use the supplied file name.`;

/**
 * Ensures paper text sent to Groq stays well within the TPM rate limit budget (~6k tokens)
 * while preserving the essential research sections:
 * - Abstract, Introduction, Problem Formulation (beginning)
 * - Results, Discussion, Limitations, Conclusion (end)
 */
export function preparePaperText(text: string): string {
  if (text.length <= SECTION_CHAR_LIMIT) return text;

  // For long papers (> 24,000 chars), take the most critical parts:
  // First 14,000 chars (Title, Abstract, Background, Method)
  // Last 10,000 chars (Results, Discussion, Limitations, Conclusion)
  const head = text.slice(0, 14_000).trim();
  const tail = text.slice(-10_000).trim();
  return `${head}\n\n[... intermediate sections omitted for length ...]\n\n${tail}`;
}

/** Extracts text from an uploaded PDF. Returns "" for image-only files. */
async function extractPdfText(file: Blob): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Fast, robust single-pass digest that fits within model rate limits and serverless timeouts. */
async function digestPaper(
  groq: GroqClient,
  fileName: string,
  text: string,
): Promise<ResearchDigest> {
  const prepared = preparePaperText(text);
  return groq.complete({
    what: `digest for "${fileName}"`,
    system: DIGEST_SYSTEM,
    user: `File: ${fileName}\n\nPaper text:\n${prepared}`,
    jsonSchema: RESEARCH_JSON_SCHEMA,
    zodSchema: ResearchDigestSchema,
  });
}

/** Meaningful, safe message for documents.error_message and API response. */
export function shortErrorMessage(error: unknown): string {
  if (error instanceof RateLimitExhaustedError) {
    return "Groq rate limit reached — please wait a moment and retry.";
  }
  if (error instanceof InvalidOutputError) {
    return "The summary could not be validated — retry.";
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("tpm") ||
      msg.includes("too large")
    ) {
      return "Groq rate limit reached — please wait a moment and retry.";
    }
    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      msg.includes("timeout") ||
      msg.includes("timed out")
    ) {
      return "Summarizing took too long — retry.";
    }
    return error.message.length < 150
      ? error.message
      : "Summarization failed — retry.";
  }
  return "Summarization failed — retry.";
}

export async function POST(request: NextRequest) {
  // 1. Verify the caller (never trusts the cookie payload).
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 2. Validate the body.
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { path, file_name: fileName } = body;

  // 3. The storage path must live inside the caller's own folder and be a PDF.
  if (!path.startsWith(`${userId}/`) || !path.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files" }, { status: 400 });
  }

  // 4. Download the uploaded file (RLS: own folder only) and check its size.
  const { data: file, error: downloadError } = await supabase.storage
    .from("documents")
    .download(path);
  if (downloadError || !file) {
    return NextResponse.json(
      { error: "Uploaded file not found — upload again." },
      { status: 404 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is over the 10 MB limit." },
      { status: 413 },
    );
  }

  // 5. Find or create the documents row (retry-safe: same path = same row).
  let documentId: string;
  try {
    const { data: existing, error: selectError } = await supabase
      .from("documents")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (selectError) throw selectError;

    if (existing) {
      documentId = String(existing.id);
      const { error: updateError } = await supabase
        .from("documents")
        .update({ status: "processing", error_message: null })
        .eq("id", documentId);
      if (updateError) throw updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          file_name: fileName,
          storage_path: path,
          status: "processing",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      documentId = String(inserted.id);
    }

    // Mark any stale in-flight jobs for this user (> 3m old) as failed so they don't remain stuck indefinitely.
    try {
      const staleCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { error: cleanupErr } = await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message:
            "Previous processing attempt timed out — click retry to run again.",
        })
        .eq("user_id", userId)
        .eq("status", "processing")
        .neq("storage_path", path)
        .lt("created_at", staleCutoff);

      // If created_at column does not exist (error 42703), any other document in 'processing' status
      // for this user when starting a new/retry digest is an orphaned job from a previous run.
      if (cleanupErr && cleanupErr.code === "42703") {
        await supabase
          .from("documents")
          .update({
            status: "failed",
            error_message:
              "Previous processing attempt timed out — click retry to run again.",
          })
          .eq("user_id", userId)
          .eq("status", "processing")
          .neq("storage_path", path);
      }
    } catch {
      // Best-effort cleanup
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not save the document. If this keeps happening, run the 002_research.sql migration.",
      },
      { status: 500 },
    );
  }

  const setStatus = async (
    status: "ready" | "failed",
    digest: ResearchDigest | null = null,
    errorMessage: string | null = null,
  ) => {
    await supabase
      .from("documents")
      .update({
        status,
        digest_json: digest,
        error_message: errorMessage,
      })
      .eq("id", documentId);
  };

  // 6. Extract text server-side (unpdf: pdf.js built for serverless — no
  //    native deps, so it runs in a Next.js route handler unchanged).
  let text: string;
  try {
    text = await extractPdfText(file);
  } catch {
    await setStatus(
      "failed",
      null,
      "Could not read this PDF — it may be corrupted. Retry or re-upload.",
    );
    return NextResponse.json({
      id: documentId,
      status: "failed",
      error: "Could not read this PDF.",
    });
  }

  if (text.trim().length < MIN_TEXT_CHARS) {
    const message =
      "No extractable text found — this PDF appears to be scanned or image-only. Upload a text-based PDF.";
    await setStatus("failed", null, message);
    return NextResponse.json({ id: documentId, status: "failed", error: message });
  }

  // 7. Digest with GROQ_MODEL_SMART (shared ingest Groq client: schema-mode
  //    fallback, one invalid-output retry, retry-after-aware backoff,
  //    120s per-request timeout so nothing hangs).
  try {
    const groq = new GroqClient("GROQ_MODEL_SMART");
    const digest = await digestPaper(groq, fileName, text);
    await setStatus("ready", digest, null);

    // Index the paper for Ask: chunk the extracted text, embed with the
    // same gte-small model, and store under the uploader's own user_id.
    // Idempotent (prior chunks for this document are replaced) and
    // best-effort — a digest must stay usable even if indexing fails.
    try {
      const chunks = chunkText(text, 1_400, 150).slice(0, 30);
      if (chunks.length > 0) {
        const vectors = await embedTexts(chunks.map((chunk) => chunk.content));
        await supabase
          .from("chunks")
          .delete()
          .eq("user_id", userId)
          .eq("source_type", "document")
          .eq("source_id", documentId);
        const { error: chunkError } = await supabase.from("chunks").insert(
          chunks.map((chunk, index) => ({
            user_id: userId,
            source_type: "document",
            source_id: documentId,
            content: chunk.content,
            embedding: vectors[index],
          })),
        );
        if (chunkError) throw new Error(chunkError.message);
      }
    } catch {
      // best-effort: the digest itself is already saved and usable
    }

    return NextResponse.json({ id: documentId, status: "ready" });
  } catch (error) {
    const message = shortErrorMessage(error);
    await setStatus("failed", null, message);
    return NextResponse.json(
      { id: documentId, status: "failed", error: message },
      { status: 502 },
    );
  }
}
