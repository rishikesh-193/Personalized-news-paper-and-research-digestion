import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverPaper } from "./schema";

/** Maps a research_papers row to the shape the UI consumes. */
export function toDiscoverPaper(row: {
  id: unknown;
  kind: unknown;
  source: unknown;
  external_id: unknown;
  url: unknown;
  title: unknown;
  authors: unknown;
  abstract: unknown;
  published_at: unknown;
}): DiscoverPaper {
  return {
    id: String(row.id),
    kind: row.kind === "web" ? "web" : "paper",
    source: String(row.source),
    external_id: String(row.external_id),
    url: String(row.url),
    title: String(row.title),
    authors: Array.isArray(row.authors) ? row.authors.map(String) : [],
    abstract: row.abstract ? String(row.abstract) : null,
    published_at: row.published_at ? String(row.published_at) : null,
  };
}

/**
 * Loads papers by id and returns them in the ORDER OF `ids` (dropping any
 * that no longer exist), so a cached search renders exactly as first stored.
 */
export async function loadPapersInOrder(
  client: SupabaseClient,
  ids: string[],
): Promise<DiscoverPaper[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("research_papers")
    .select(
      "id, kind, source, external_id, url, title, authors, abstract, published_at",
    )
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map<string, DiscoverPaper>();
  for (const row of data ?? []) {
    const paper = toDiscoverPaper(row);
    byId.set(paper.id, paper);
  }

  return ids.map((id) => byId.get(id)).filter((paper) => paper !== undefined);
}

/** Papers that carry usable text for a brief (abstract or snippet). */
export function papersWithText(
  papers: DiscoverPaper[],
  minChars = 80,
): DiscoverPaper[] {
  return papers.filter(
    (paper) => (paper.abstract ?? "").trim().length >= minChars,
  );
}
