/**
 * Server-side text embeddings for Ask and indexing.
 *
 * The project plan calls for the gte-small model at 384 dimensions with
 * queries and documents embedded by the SAME model. The Supabase Edge
 * Function deployment path needs CLI/dashboard access we do not have, so
 * the identical model runs here through ONNX runtime instead: same weights
 * (Xenova/gte-small), same 384 dimensions, computed inside our own server
 * code — text never leaves for a third-party embedding API.
 *
 * Import this module from server code only (route handlers, server
 * actions, scripts) — never from client components.
 */

/** Xenova/gte-small outputs 384-dimensional embeddings (the chunks column). */
export const EMBEDDING_DIMENSIONS = 384;

/** Hard ceiling on text embedded in one call (gte-small handles 512 tokens). */
const MAX_CHARS_PER_INPUT = 2_000;

type Pipeline = {
  (
    texts: string[],
    { normalize, pooling }: { normalize: boolean; pooling: string },
  ): Promise<{ data: ArrayLike<number>; dims: number[] }>;
};

let pipelinePromise: Promise<Pipeline> | null = null;

/** Lazy singleton — the model loads once per server process. */
async function getEmbedder(): Promise<Pipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return (await pipeline(
        "feature-extraction",
        "Xenova/gte-small",
      )) as unknown as Pipeline;
    })();
  }
  return pipelinePromise;
}

/**
 * Embeds each input text. Rejects if the model returns an unexpected
 * dimension — a wrong-size embedding must never reach the database.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((text) =>
    text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_INPUT),
  );
  if (cleaned.length === 0) return [];

  const embedder = await getEmbedder();
  const output = await embedder(cleaned, {
    normalize: true,
    pooling: "mean",
  });

  const [rows, columns] = output.dims;
  if (columns !== EMBEDDING_DIMENSIONS || rows !== cleaned.length) {
    throw new Error(
      `embedding model returned ${rows}x${columns}, expected ${cleaned.length}x${EMBEDDING_DIMENSIONS}`,
    );
  }

  const result: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const vector: number[] = [];
    for (let column = 0; column < columns; column++) {
      vector.push(output.data[row * columns + column]);
    }
    result.push(vector);
  }
  return result;
}

/** Convenience wrapper for a single text. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Splits text into overlapping chunks on paragraph/sentence boundaries.
 * Chunks stay well under gte-small's 512-token input limit (~2 chars per
 * token of English prose, so 1,400 chars is comfortably below).
 */
export function chunkText(
  text: string,
  maxChars = 1_400,
  overlapChars = 150,
): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) {
    return [{ content: normalized, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      // Prefer breaking at the last sentence end inside the window.
      const window = normalized.slice(start, end);
      const sentenceEnd = Math.max(
        window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "),
      );
      if (sentenceEnd > maxChars * 0.5) end = start + sentenceEnd + 1;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ content, index: chunks.length });
    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

/** Cosine similarity of two equal-length vectors (normalized inputs → dot). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
