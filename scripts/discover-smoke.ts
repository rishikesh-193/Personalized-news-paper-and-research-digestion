/**
 * Smoke test for Research Discovery: runs real arXiv searches through the
 * same client + parser + relevance logic the route uses, and prints the top
 * five titles and URLs so relevance can be reviewed by eye.
 *
 *   npx tsx scripts/discover-smoke.ts "retrieval augmented generation" "federated learning"
 */
import { searchArxiv } from "../src/lib/discovery/arxiv";
import { dedupePapers } from "../src/lib/discovery/util";
import { isTavilyConfigured } from "../src/lib/discovery/tavily";

const DEFAULT_QUERIES = ["retrieval augmented generation", "federated learning"];

async function main(): Promise<void> {
  const queries =
    process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_QUERIES;

  let failures = 0;
  for (const query of queries) {
    const started = Date.now();
    const papers = dedupePapers(await searchArxiv(query, 10));
    console.log(
      `\n=== "${query}" — ${papers.length} results in ${((Date.now() - started) / 1000).toFixed(1)}s ===`,
    );

    if (papers.length === 0) failures += 1;
    for (const [index, paper] of papers.slice(0, 5).entries()) {
      console.log(`${index + 1}. ${paper.title}`);
      console.log(`   ${paper.url}`);
    }
  }

  console.log(
    `\nTavily (web mode): ${isTavilyConfigured() ? "configured" : "off — TAVILY_API_KEY not set"}`,
  );
  console.log(failures === 0 ? "SMOKE PASSED" : `SMOKE FAILED: ${failures} empty search(es)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
