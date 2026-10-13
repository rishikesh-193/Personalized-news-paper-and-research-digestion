import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosineSimilarity } from "../src/lib/embeddings";
import {
  parseEmbedding,
  renumberAnswer,
  sanitizeCitations,
  topChunks,
  type RetrievedChunk,
} from "../src/lib/ask-core";

test("short text becomes one chunk", () => {
  const chunks = chunkText("A short summary.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, "A short summary.");
});

test("long text splits into overlapping chunks under the cap", () => {
  const sentence = "This is a sentence about research findings. ";
  const chunks = chunkText(sentence.repeat(120), 1_400, 150);
  assert.ok(chunks.length > 3);
  for (const chunk of chunks) assert.ok(chunk.content.length <= 1_500);
  // No chunk is empty and indexes stay ordered.
  chunks.forEach((chunk, index) => {
    assert.ok(chunk.content.length > 0);
    assert.equal(chunk.index, index);
  });
});

test("cosine similarity orders a topical pair above an unrelated one", () => {
  const a = [1, 0, 0];
  const topical = [0.9, 0.1, 0];
  const unrelated = [0, 1, 0];
  assert.ok(cosineSimilarity(a, topical) > cosineSimilarity(a, unrelated));
  assert.equal(cosineSimilarity(a, a), 1);
});

test("parseEmbedding accepts arrays and JSON strings, rejects junk", () => {
  assert.deepEqual(parseEmbedding([0.1, 0.2]), [0.1, 0.2]);
  assert.deepEqual(parseEmbedding("[0.5,0.25]"), [0.5, 0.25]);
  assert.equal(parseEmbedding("not json"), null);
  assert.equal(parseEmbedding({}), null);
  assert.equal(parseEmbedding(["a"]), null);
});

function chunk(id: string, scoreSeed: number[]): RetrievedChunk {
  return {
    id,
    source_type: "article",
    source_id: `src-${id}`,
    content: `content ${id}`,
    embedding: scoreSeed,
    score: 0,
  };
}

test("topChunks keeps only scores above the floor, best first, capped at k", () => {
  const query = [1, 0];
  const results = topChunks(
    query,
    [
      chunk("low", [0.1, 0.9]), // ~0.1 → below floor
      chunk("mid", [0.7, 0.3]),
      chunk("high", [0.95, 0.05]),
      chunk("mid2", [0.6, 0.4]),
    ],
    2,
    0.5,
  );
  assert.deepEqual(
    results.map((entry) => entry.id),
    ["high", "mid"],
  );
});

const threeSources = {
  "article:src-a": { id: "src-a", title: "Paper A", source: "Venue", url: "https://a" },
  "article:src-b": { id: "src-b", title: "Paper B", source: "Venue", url: "https://b" },
  "article:src-c": { id: "src-c", title: "Paper C", source: "Venue", url: "https://c" },
};

test("sanitizeCitations drops unverifiable and duplicate sources", () => {
  const retrieved = [chunk("a", [1, 0]), chunk("b", [0.9, 0.1])];
  const citations = sanitizeCitations(
    [
      { chunk_id: "b" },
      { chunk_id: "made-up" }, // not retrieved → dropped
      { chunk_id: "a" },
      { chunk_id: "a" }, // duplicate source → dropped
    ],
    retrieved,
    threeSources,
  );
  // Rows carry the excerpt numbers the answer references, ordered 1..n.
  assert.deepEqual(citations, [
    { n: 1, title: "Paper A", source: "Venue", url: "https://a" },
    { n: 2, title: "Paper B", source: "Venue", url: "https://b" },
  ]);
});

test("citation numbers follow the excerpts, not the model's output order", () => {
  const retrieved = [
    chunk("a", [1, 0]),
    chunk("b", [0.9, 0.1]),
    chunk("c", [0.8, 0.2]),
  ];
  // The model cites the third excerpt first: the badge must stay 3.
  const citations = sanitizeCitations([{ chunk_id: "c" }], retrieved, threeSources);
  assert.deepEqual(citations, [
    { n: 3, title: "Paper C", source: "Venue", url: "https://c" },
  ]);
  assert.equal(renumberAnswer("Only this claim [3].", citations), "Only this claim [3].");
});

test("markers for dropped excerpts are stripped, kept markers keep their number", () => {
  const retrieved = [
    chunk("a", [1, 0]),
    chunk("b", [0.9, 0.1]),
    chunk("c", [0.8, 0.2]),
  ];
  const citations = sanitizeCitations(
    [{ chunk_id: "a" }, { chunk_id: "ghost" }, { chunk_id: "c" }],
    retrieved,
    threeSources,
  );
  assert.deepEqual(citations.map((citation) => citation.n), [1, 3]);
  assert.equal(
    renumberAnswer("First [1] and third [3], but never second [2].", citations),
    "First [1] and third [3], but never second .",
  );
});

test("renumberAnswer strips markers for dropped citations", () => {
  const answer = "Claim one [1]. Claim two [2]. Claim three [1, 3].";
  const renumbered = renumberAnswer(answer, [{ n: 1, title: "T", source: "S" }]);
  assert.equal(renumbered, "Claim one [1]. Claim two . Claim three [1].");
});
