import { z } from "zod";

/** Allowed topic values — must match src/lib/topic-groups.ts labels. */
export const TOPIC_LABELS = [
  "AI",
  "Technology",
  "Gadgets",
  "Programming",
  "Startups",
  "Cybersecurity",
  "Apps",
  "Science",
  "Space",
  "Physics",
  "Biology",
  "Medicine",
  "Health",
  "Psychology",
  "Fitness",
  "Business",
  "Markets",
  "Finance",
  "Economy",
  "Crypto",
  "Real Estate",
  "Personal Finance",
  "Jobs",
  "India",
  "World",
  "Politics",
  "Education",
  "Law",
  "Environment",
  "Society",
  "Media",
  "Culture",
  "Film",
  "Music",
  "Books",
  "Fashion",
  "Food",
  "Travel",
  "Art",
  "Gaming",
  "Sports",
  "Cricket",
  "Football",
  "Motorsport",
  "Cycling",
  "Esports",
  "Outdoors",
] as const;

/**
 * Summary shape returned by the model.
 *
 * Deliberately has NO `topic` field: the stored topic comes from the feed
 * config (scripts/ingest/feeds.ts) via classify.resolveTopic, because the
 * per-run allocator balances by feed topic — letting the model reassign it
 * afterwards would undo that balancing and reintroduce silent
 * misclassification. Subtopics come from classify.classifySubtopic.
 */
export const ArticleSummarySchema = z.object({
  summary_bullets: z.array(z.string().min(1)).length(3),
  why_it_matters: z.string().min(1),
});

export type ArticleSummary = z.infer<typeof ArticleSummarySchema>;

export const BriefingSchema = z.object({
  text: z.string().min(40).max(800),
});

/** JSON schema sent to Groq structured-output mode. */
export const ARTICLE_JSON_SCHEMA = {
  name: "article_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary_bullets: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3,
      },
      why_it_matters: { type: "string" },
    },
    required: ["summary_bullets", "why_it_matters"],
  },
} as const;

export const BRIEFING_JSON_SCHEMA = {
  name: "daily_briefing",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
  },
} as const;
