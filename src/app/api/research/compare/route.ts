import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  comparisonSchemas,
  ResearchDigestSchema,
  type DocumentComparison,
  type ResearchDigest,
} from "@/lib/research-schema";
import { GroqClient, InvalidOutputError } from "../../../../../scripts/ingest/groq";

export const maxDuration = 60;

const RequestSchema = z.object({
  document_ids: z.array(z.string().uuid()).min(2).max(3),
});

const COMPARE_SYSTEM = `You are comparing research papers side by side, using ONLY the supplied digests of each paper.
Rules:
- aims, methods, key_findings and best_for: exactly one entry per paper, in the order the papers are supplied.
- differences: bullet points describing how the papers differ from each other.
- Never invent numbers or claims that are not in the digests.`;

/** One Groq call over the SAVED digests — never the original paper text. */
function digestSummaryForPrompt(fileName: string, digest: ResearchDigest) {
  return {
    file_name: fileName,
    title: digest.title,
    executive_summary: digest.executive_summary,
    key_findings: digest.key_findings,
    main_arguments: digest.main_arguments,
    limitations: digest.limitations,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Select 2 or 3 documents." },
      { status: 400 },
    );
  }

  // Sorted for stable storage, so the same set always matches on reuse.
  const documentIds = [...new Set(body.document_ids)].sort();
  if (documentIds.length < 2) {
    return NextResponse.json(
      { error: "Select 2 or 3 documents." },
      { status: 400 },
    );
  }

  // 1. Reuse a saved comparison for the same document set if one exists.
  const { data: savedRows, error: savedError } = await supabase
    .from("document_comparisons")
    .select("document_ids, result_json")
    .eq("user_id", userId);
  if (savedError) {
    return NextResponse.json(
      { error: "Could not read saved comparisons. Run the 002_research.sql migration if this persists." },
      { status: 500 },
    );
  }
  const wanted = documentIds.join(",");
  const saved = (savedRows ?? []).find(
    (row) =>
      Array.isArray(row.document_ids) &&
      [...row.document_ids].sort().join(",") === wanted,
  );
  if (saved?.result_json) {
    return NextResponse.json({
      comparison: saved.result_json,
      document_ids: documentIds,
      cached: true,
    });
  }

  // 2. Load the documents (RLS: own rows only) and require them all ready.
  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("id, file_name, status, digest_json")
    .in("id", documentIds);
  if (docsError || !documents || documents.length !== documentIds.length) {
    return NextResponse.json(
      { error: "Documents not found." },
      { status: 404 },
    );
  }
  const ordered = documentIds.map(
    (id) => documents.find((doc) => String(doc.id) === id)!,
  );
  if (
    ordered.some((doc) => doc.status !== "ready" || !doc.digest_json)
  ) {
    return NextResponse.json(
      { error: "All selected documents must be ready before comparing." },
      { status: 409 },
    );
  }

  let digests: ReturnType<typeof digestSummaryForPrompt>[];
  try {
    digests = ordered.map((doc) =>
      digestSummaryForPrompt(
        String(doc.file_name),
        ResearchDigestSchema.parse(doc.digest_json),
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "A selected document has no valid digest yet — retry its digest first." },
      { status: 409 },
    );
  }

  // 3. One comparison call over the digests.
  try {
    const groq = new GroqClient("GROQ_MODEL_SMART");
    const { zodSchema, jsonSchema } = comparisonSchemas(digests.length);
    const comparison = await groq.complete<DocumentComparison>({
      what: `comparison of ${digests.length} documents`,
      system: COMPARE_SYSTEM,
      user: `Documents (in order):\n${JSON.stringify(digests)}`,
      jsonSchema,
      zodSchema,
    });

    // 4. Save for reuse (RLS: own row; re-check the unique set).
    await supabase.from("document_comparisons").insert({
      user_id: userId,
      document_ids: documentIds,
      result_json: comparison,
    });

    return NextResponse.json({
      comparison,
      document_ids: documentIds,
      cached: false,
    });
  } catch (error) {
    const message =
      error instanceof InvalidOutputError
        ? "The comparison could not be validated — retry."
        : error instanceof Error &&
            (error.name === "TimeoutError" || error.name === "AbortError")
          ? "Comparison took too long — retry."
          : "Comparison failed — retry.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
