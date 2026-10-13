/**
 * Smoke test for the embedding module: model loads, outputs 384
 * dimensions, and orders a topical pair above an unrelated pair.
 *
 *   npx tsx scripts/embed-smoke.ts
 */
import {
  embedTexts,
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
} from "../src/lib/embeddings";

async function main(): Promise<void> {
  const started = Date.now();
  const [blackhole, telescope, banana] = await embedTexts([
    "Astronomers observed matter spiraling into a black hole.",
    "The space telescope returned new images of a distant galaxy.",
    "A banana is a yellow fruit rich in potassium.",
  ]);
  console.log(`loaded+embedded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("dimension:", blackhole.length, blackhole.length === EMBEDDING_DIMENSIONS ? "OK" : "WRONG");
  const related = cosineSimilarity(blackhole, telescope);
  const unrelated = cosineSimilarity(blackhole, banana);
  console.log(`sim(blackhole, telescope)=${related.toFixed(3)} sim(blackhole, banana)=${unrelated.toFixed(3)}`);
  if (blackhole.length !== EMBEDDING_DIMENSIONS || related <= unrelated) {
    console.error("SMOKE FAILED");
    process.exit(1);
  }
  console.log("SMOKE PASSED");
  process.exit(0);
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
