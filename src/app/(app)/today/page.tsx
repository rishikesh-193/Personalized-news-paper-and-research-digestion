import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  TodayView,
  type ArticleUserState,
  type TodayArticle,
  type TodayBriefing,
} from "@/components/views/today-view";
import { createClient } from "@/lib/supabase/server";
import { rankArticles } from "@/lib/ranking";

export const metadata: Metadata = { title: "Today" };

function toArticle(row: {
  id: unknown;
  url: unknown;
  title: unknown;
  source_name: unknown;
  published_at: unknown;
  summary_bullets: unknown;
  why_it_matters: unknown;
  topic_tag: unknown;
}): TodayArticle {
  const bullets = Array.isArray(row.summary_bullets)
    ? row.summary_bullets.filter((bullet): bullet is string => typeof bullet === "string")
    : [];
  return {
    id: String(row.id),
    url: String(row.url),
    title: String(row.title),
    source: row.source_name ? String(row.source_name) : "Unknown source",
    publishedAt: row.published_at ? String(row.published_at) : null,
    topic: row.topic_tag ? String(row.topic_tag) : "General",
    summaryBullets: bullets,
    whyItMatters: row.why_it_matters ? String(row.why_it_matters) : "",
  };
}

/**
 * Live Today page — reads articles, interests and briefings through the
 * caller's own Supabase session (RLS applies). No LLM call, no mock data.
 */
export default async function TodayPage() {
  const supabase = await createClient();
  // Verified server-side by the proxy and getClaims() — never trusts the cookie.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  let loadFailed = false;
  let interests: string[] = [];
  let articles: TodayArticle[] = [];
  let briefings: TodayBriefing[] = [];
  let userState: Record<string, ArticleUserState> = {};

  // The user's own interaction signals (own rows under RLS). Non-fatal: an
  // events read failure just means a default ranking.
  const eventTopics = async (
    client: Awaited<ReturnType<typeof createClient>>,
  ) => {
    const { data, error } = await client
      .from("article_events")
      .select("article_id, event");
    if (error || !data) return null;
    return data as { article_id: string; event: string }[];
  };

  // Interests — own rows under RLS; they drive both tabs and filtering.
  const { data: interestRows, error: interestError } = await supabase
    .from("interests")
    .select("topic")
    .eq("user_id", userId)
    .order("topic", { ascending: true });

  if (interestError) {
    loadFailed = true;
  } else {
    interests = (interestRows ?? []).map((row) => String(row.topic));
  }

  if (interests.length > 0) {
    // "For you" covers the last 7 days of stored articles.
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 7);
    const since = sinceDate.toISOString();

    // Articles — read allowed for any signed-in user (RLS); newest first.
    const { data: articleRows, error: articleError } = await supabase
      .from("articles")
      .select(
        "id, url, title, source_name, published_at, summary_bullets, why_it_matters, topic_tag",
      )
      .in("topic_tag", interests)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(60);

    if (articleError) {
      loadFailed = true;
    } else {
      articles = (articleRows ?? []).map(toArticle);

      // Rank with the user's real signals; reasons ride on each card.
      const events = await eventTopics(supabase);
      if (events) {
        const topicOf = new Map(articles.map((a) => [a.id, a.topic]));
        const likedTopics: Record<string, number> = {};
        const negativeTopics: Record<string, number> = {};
        const seenIds = new Set<string>();
        const saved = new Set<string>();
        const reactions = new Map<string, ArticleUserState["reaction"]>();
        for (const row of events) {
          const topic = topicOf.get(row.article_id);
          if (row.event === "save") {
            saved.add(row.article_id);
            if (topic) likedTopics[topic] = (likedTopics[topic] ?? 0) + 1;
          } else if (row.event === "like") {
            if (topic) likedTopics[topic] = (likedTopics[topic] ?? 0) + 1;
            reactions.set(row.article_id, "like");
          } else if (row.event === "dislike" || row.event === "skip") {
            if (topic) negativeTopics[topic] = (negativeTopics[topic] ?? 0) + 1;
            reactions.set(row.article_id, row.event);
          }
          seenIds.add(row.article_id);
        }

        const ranked = rankArticles(articles, {
          interests,
          likedTopics,
          negativeTopics,
          seenIds,
        });
        articles = ranked.map(({ article, reason }) => ({
          ...article,
          reason,
        }));

        userState = Object.fromEntries(
          articles.map((article) => [
            article.id,
            {
              saved: saved.has(article.id),
              reaction: reactions.get(article.id) ?? null,
            },
          ]),
        );
      }
    }

    // Saved briefings — signed-in read (RLS); newest dates first.
    const { data: briefingRows, error: briefingError } = await supabase
      .from("daily_briefings")
      .select("date, topic, text")
      .in("topic", interests)
      .order("date", { ascending: false })
      .order("topic", { ascending: true })
      .limit(6);

    if (briefingError) {
      loadFailed = true;
    } else {
      briefings = (briefingRows ?? []).map((row) => ({
        date: String(row.date),
        topic: String(row.topic),
        text: String(row.text),
      }));
    }
  }

  // Surfaces (app)/error.tsx — the page's error state.
  if (loadFailed) throw new Error("Could not load your edition");

  return (
    <TodayView
      articles={articles}
      interests={interests}
      briefings={briefings}
      userState={userState}
    />
  );
}
