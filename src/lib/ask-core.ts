/**
 * Pure retrieval + citation helpers for Ask. No I/O — unit-testable.
 */

import { cosineSimilarity } from "@/lib/embeddings";

export interface RetrievalChunk {
  id: string;
  source_type: "article" | "document";
  source_id: string;
  content: string;
  /** Parsed embedding vector (PostgREST returns pgvector as number[] or a JSON string). */
  embedding: number[];
}

export interface RetrievedChunk extends RetrievalChunk {
  score: number;
}

/** PostgREST may return pgvector columns as a JSON string — normalize. */
export function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.every((value) => typeof value === "number")) {
    return raw as number[];
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.every((value) => typeof value === "number")
      ) {
        return parsed as number[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Top-k chunks by cosine similarity, dropping anything at or below the
 * floor — an empty result is honest ("not in your library"), a weak match
 * is not evidence.
 */
export function topChunks(
  queryVector: number[],
  chunks: RetrievalChunk[],
  k = 6,
  minScore = 0.5,
): RetrievedChunk[] {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, chunk.embedding),
    }))
    .filter((chunk) => chunk.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export interface CitationRecord {
  n: number;
  title: string;
  source: string;
  url?: string;
}

export interface ResolvedSource {
  id: string;
  title: string;
  source: string;
  url?: string;
}

/**
 * Validates model-produced citations against the chunks that were
 * actually retrieved. Each surviving citation keeps the excerpt number the
 * answer text references ([n] = the n-th excerpt passed to the model), so
 * markers in the prose and numbered rows in the Sources list can never
 * disagree. Unresolvable citations are dropped, never guessed, duplicates
 * collapse to one row per source, and rows are ordered by excerpt number.
 */
export function sanitizeCitations(
  requested: unknown,
  retrieved: RetrievedChunk[],
  sources: Record<string, ResolvedSource>,
): CitationRecord[] {
  // Excerpt number → chunk id, matching how the prompt numbers evidence.
  const excerptNumber = new Map(
    retrieved.map((chunk, index) => [chunk.id, index + 1]),
  );
  const byChunk = new Map(retrieved.map((chunk) => [chunk.id, chunk]));
  const list = Array.isArray(requested) ? requested : [];

  const records: CitationRecord[] = [];
  const usedSources = new Set<string>();
  for (const item of list) {
    const chunkId =
      item && typeof item === "object" && "chunk_id" in item
        ? String((item as { chunk_id: unknown }).chunk_id)
        : "";
    if (!chunkId) continue;
    const n = excerptNumber.get(chunkId);
    if (n === undefined) continue; // unverifiable → drop
    const chunk = byChunk.get(chunkId)!;
    const sourceKey = `${chunk.source_type}:${chunk.source_id}`;
    if (usedSources.has(sourceKey)) continue;
    const source = sources[sourceKey];
    if (!source) continue;
    usedSources.add(sourceKey);
    records.push({
      n,
      title: source.title,
      source: source.source,
      url: source.url,
    });
  }

  return records.sort((a, b) => a.n - b.n);
}

/** Rewrites the answer's citation markers to the surviving numbering. */
export function renumberAnswer(answer: string, citations: CitationRecord[]): string {
  const kept = new Set(citations.map((citation) => citation.n));
  return answer
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, group: string) => {
      const numbers = group
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((number) => Number.isInteger(number) && kept.has(number));
      return numbers.length > 0 ? `[${numbers.join(", ")}]` : "";
    })
    .replace(/\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
