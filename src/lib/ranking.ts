/**
 * Explainable Today ranking (V1 from PROJECT.md section 8).
 *
 * Score = interest match + recency + boosts for topics the user liked or
 * saved − penalties for topics they skipped or disliked. Pure and
 * deterministic so it can be unit-tested; no LLM, no hidden state.
 */

export interface RankingArticle {
  id: string;
  topic: string;
  publishedAt: string | null;
}

export interface RankingSignals {
  /** The user's chosen topics (onboarding + settings). */
  interests: string[];
  /** Topic → counts of the user's positive events (like/save). */
  likedTopics: Record<string, number>;
  /** Topic → counts of the user's negative events (dislike/skip). */
  negativeTopics: Record<string, number>;
  /** Article ids the user already reacted to (viewed/saved/liked). */
  seenIds?: Set<string>;
}

export interface RankedArticle<T extends RankingArticle> {
  article: T;
  score: number;
  /** Short human explanation shown on the card, e.g. "Because you follow AI". */
  reason: string | null;
}

const POSITIVE_EVENT_BONUS = 0.5;
const NEGATIVE_EVENT_PENALTY = 1.5;
const ALREADY_READ_PENALTY = 0.75;
/** Articles lose this much score per full day of age. */
const DAILY_DECAY = 0.35;
const MIN_SCORE = 0.05;

function hoursOld(publishedAt: string | null, now: number): number {
  if (!publishedAt) return 72; // unknown date counts as old, not newest
  const time = Date.parse(publishedAt);
  if (!Number.isFinite(time)) return 72;
  return Math.max(0, (now - time) / 3_600_000);
}

/**
 * Ranks articles for one user. Interest match dominates, recency orders
 * within a topic, and the user's own signals nudge — never bury — the
 * feed, so a fresh user with no history still gets a useful newspaper.
 */
export function rankArticles<T extends RankingArticle>(
  articles: T[],
  signals: RankingSignals,
  now: number = Date.now(),
): RankedArticle<T>[] {
  const interests = new Set(
    signals.interests.map((topic) => topic.trim().toLowerCase()),
  );

  const ranked = articles.map((article): RankedArticle<T> => {
    let score = MIN_SCORE;
    let reason: string | null = null;

    const topicKey = article.topic.trim().toLowerCase();
    if (interests.has(topicKey)) {
      score += 2;
      reason = `Because you follow ${article.topic}`;
    }

    const liked = signals.likedTopics[article.topic] ?? 0;
    if (liked > 0) {
      score += Math.min(POSITIVE_EVENT_BONUS * liked, 1);
      reason ??= `Because you engaged with ${article.topic}`;
    }

    const negative = signals.negativeTopics[article.topic] ?? 0;
    if (negative > 0) {
      score -= Math.min(NEGATIVE_EVENT_PENALTY * negative, 2.5);
      reason = null; // do not explain a penalty on the card
    }

    const ageDays = hoursOld(article.publishedAt, now) / 24;
    score += Math.max(0, 1 - ageDays * DAILY_DECAY) * 1.5;

    if (signals.seenIds?.has(article.id)) {
      score -= ALREADY_READ_PENALTY;
    }

    return { article, score, reason };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      hoursOld(a.article.publishedAt, now) - hoursOld(b.article.publishedAt, now),
  );
  return ranked;
}
