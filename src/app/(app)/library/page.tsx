import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  LibraryView,
  type LibraryArticle,
  type LibraryDocument,
} from "@/components/views/library-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Library" };

interface SavedRow {
  created_at: string | null;
  article: {
    id: string;
    url: string;
    title: string;
    source_name: string | null;
    published_at: string | null;
    topic_tag: string | null;
    summary_bullets: unknown;
    why_it_matters: string | null;
  } | null;
}

interface DocumentRow {
  id: string;
  file_name: string;
  storage_path: string;
}

/**
 * The user's library: articles they saved (per-user `save` events under
 * RLS) and research PDFs they uploaded (own `documents` rows). No LLM
 * calls, no mock data.
 */
export default async function LibraryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const [savedResult, documentsResult] = await Promise.all([
    supabase
      .from("article_events")
      .select(
        "created_at, article:articles(id, url, title, source_name, published_at, topic_tag, summary_bullets, why_it_matters)",
      )
      .eq("user_id", userId)
      .eq("event", "save")
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, file_name, storage_path")
      .eq("user_id", userId)
      .order("file_name", { ascending: true }),
  ]);

  if (savedResult.error || documentsResult.error) {
    throw new Error("Could not load your library");
  }

  const savedRows = (savedResult.data ?? []) as unknown as SavedRow[];
  const articles: LibraryArticle[] = savedRows
    .filter((row) => row.article)
    .map((row) => {
      const article = row.article!;
      const bullets = Array.isArray(article.summary_bullets)
        ? article.summary_bullets.filter(
            (bullet: unknown): bullet is string => typeof bullet === "string",
          )
        : [];
      return {
        id: String(article.id),
        url: String(article.url),
        title: String(article.title),
        source: article.source_name ? String(article.source_name) : "Unknown source",
        publishedAt: article.published_at ? String(article.published_at) : null,
        topic: article.topic_tag ? String(article.topic_tag) : "General",
        summaryBullets: bullets,
        whyItMatters: article.why_it_matters ? String(article.why_it_matters) : "",
        savedOn: row.created_at ? String(row.created_at) : null,
      };
    });

  const documents: LibraryDocument[] = (documentsResult.data ?? []).map(
    (row: DocumentRow) => ({
      id: String(row.id),
      fileName: String(row.file_name),
    }),
  );

  return <LibraryView articles={articles} documents={documents} />;
}
