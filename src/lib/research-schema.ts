import { z } from "zod";

/**
 * Research Lab output schemas (Phase 6).
 *
 * Two consumers: the digest/compare route handlers (validation) and the
 * research UI (rendering types). Every JSON schema is strict
 * (additionalProperties: false, all fields required) so it can be sent to
 * Groq structured-output mode; lists are allowed to be empty — a paper with
 * no statistics must return [] rather than inventing numbers.
 */

export const ResearchDigestSchema = z.object({
  title: z.string().min(1).max(300),
  executive_summary: z.string().min(40).max(2500),
  key_findings: z.array(z.string().min(1).max(500)),
  important_statistics: z.array(
    z.object({
      value: z.string().min(1).max(120),
      context: z.string().min(1).max(500),
    }),
  ),
  main_arguments: z.array(z.string().min(1).max(500)),
  limitations: z.array(z.string().min(1).max(500)),
  open_questions: z.array(z.string().min(1).max(500)),
});

export type ResearchDigest = z.infer<typeof ResearchDigestSchema>;

/** Sent to Groq structured-output mode alongside ResearchDigestSchema. */
export const RESEARCH_JSON_SCHEMA = {
  name: "research_digest",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      executive_summary: { type: "string" },
      key_findings: { type: "array", items: { type: "string" } },
      important_statistics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string" },
            context: { type: "string" },
          },
          required: ["value", "context"],
        },
      },
      main_arguments: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
      open_questions: { type: "array", items: { type: "string" } },
    },
    required: [
      "title",
      "executive_summary",
      "key_findings",
      "important_statistics",
      "main_arguments",
      "limitations",
      "open_questions",
    ],
  },
} as const;

/** Intermediate output of the map step (one per section of a long paper). */
export const SectionDigestSchema = z.object({
  key_findings: z.array(z.string().min(1).max(500)),
  important_statistics: z.array(
    z.object({
      value: z.string().min(1).max(120),
      context: z.string().min(1).max(500),
    }),
  ),
  main_arguments: z.array(z.string().min(1).max(500)),
  limitations: z.array(z.string().min(1).max(500)),
  open_questions: z.array(z.string().min(1).max(500)),
});

export type SectionDigest = z.infer<typeof SectionDigestSchema>;

export const SECTION_JSON_SCHEMA = {
  name: "section_digest",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      key_findings: { type: "array", items: { type: "string" } },
      important_statistics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string" },
            context: { type: "string" },
          },
          required: ["value", "context"],
        },
      },
      main_arguments: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
      open_questions: { type: "array", items: { type: "string" } },
    },
    required: [
      "key_findings",
      "important_statistics",
      "main_arguments",
      "limitations",
      "open_questions",
    ],
  },
} as const;

/**
 * Comparison output. aims / methods / key_findings / best_for hold exactly
 * one entry per document, in the order the documents were supplied;
 * differences holds cross-document bullet points.
 */
export function comparisonSchemas(documentCount: number) {
  const perDoc = z.array(z.string().min(1).max(500)).length(documentCount);

  const zodSchema = z.object({
    aims: perDoc,
    methods: perDoc,
    key_findings: perDoc,
    differences: z.array(z.string().min(1).max(500)).min(1),
    best_for: perDoc,
  });

  const jsonSchema = {
    name: "document_comparison",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        aims: { type: "array", items: { type: "string" } },
        methods: { type: "array", items: { type: "string" } },
        key_findings: { type: "array", items: { type: "string" } },
        differences: { type: "array", items: { type: "string" } },
        best_for: { type: "array", items: { type: "string" } },
      },
      required: ["aims", "methods", "key_findings", "differences", "best_for"],
    },
  } as const;

  return { zodSchema, jsonSchema };
}

export type DocumentComparison = z.infer<
  ReturnType<typeof comparisonSchemas>["zodSchema"]
>;
