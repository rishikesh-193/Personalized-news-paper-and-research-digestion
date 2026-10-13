import { ZodError, type ZodType } from "zod";
import { log, logError } from "./util";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Per-call retry cap for HTTP 429 before we call the limit persistent. */
const MAX_429_RETRIES = 4;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
/** Total attempts per call: original + one retry on invalid output. */
const MAX_OUTPUT_ATTEMPTS = 2;
const MAX_COMPLETION_TOKENS = 8_192;

/** Output still invalid after the single retry — caller skips the article. */
export class InvalidOutputError extends Error {}

/** Rate limits persisted past the retry cap — caller must stop cleanly. */
export class RateLimitExhaustedError extends Error {}

export interface JsonSchemaSpec {
  name: string;
  strict: boolean;
  schema: unknown;
}

/** "schema" = structured outputs, "object" = JSON mode, "none" = prompt-only.
 * The client starts at "schema" and only ever demotes after a 400. */
type ResponseMode = "schema" | "object" | "none";

export interface CompleteArgs<T> {
  /** Short label for logs, e.g. `summary for "Title"`. */
  what: string;
  system: string;
  user: string;
  jsonSchema: JsonSchemaSpec;
  zodSchema: ZodType<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pulls a readable message out of a Groq error body. Never logs the key. */
async function errorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      return parsed.error?.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return "";
  }
}

/** retry-after (seconds or HTTP-date) honored first, exponential backoff second. */
function rateLimitDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const backoff = BACKOFF_BASE_MS * 2 ** attempt;
  return Math.min(BACKOFF_CAP_MS, backoff);
}

/** Strips optional ```json fences around a model-produced payload. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/** Best-effort JSON extraction: trimmed text, then the outermost {…}. */
function parseModelJson(raw: string): unknown {
  const candidate = extractJson(raw);
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through to the original error
      }
    }
    throw firstError;
  }
}

/** One-line description of why zod rejected a model payload. */
function zodDetail(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

/**
 * Groq 400s whose generation FAILED schema validation (the model produced
 * bad/empty JSON despite constrained decoding). The request itself was
 * accepted, so this is invalid output and consumes one of the two output
 * attempts; the retry runs in JSON mode.
 */
function isGenerationFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not match the expected schema") ||
    m.includes("failed_generation")
  );
}

/**
 * Groq chat-completions client for one bulk model (GROQ_MODEL_FAST).
 *
 * - JSON-schema structured output, demoting to JSON mode (then prompt-only)
 *   if the API rejects the format for this model.
 * - reasoning_effort=low (supported by the gpt-oss models), dropped if 400.
 * - ALWAYS validates with zod; one retry on invalid output, then throws.
 * - 429: honors retry-after, else exponential backoff with a cap; after the
 *   retry cap the limit is treated as persistent and `stopped` flips true so
 *   the pipeline finishes cleanly with what it already saved.
 *
 * `modelEnvVar` selects which model to use (GROQ_MODEL_FAST by default for
 * bulk ingestion; the Research Lab route passes GROQ_MODEL_SMART) so both
 * callers share the exact same retry/validation behavior.
 */
export class GroqClient {
  private readonly apiKey: string;
  private readonly model: string;
  private mode: ResponseMode = "schema";
  private useReasoningEffort = true;
  private useTemperature = true;
  private stoppedFlag = false;

  constructor(modelEnvVar: "GROQ_MODEL_FAST" | "GROQ_MODEL_SMART" = "GROQ_MODEL_FAST") {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env[modelEnvVar];
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in the environment");
    if (!model) throw new Error(`${modelEnvVar} is not set in the environment`);
    this.apiKey = apiKey;
    this.model = model;
  }

  /** True once rate limits persisted — stop pulling new work. */
  get stopped(): boolean {
    return this.stoppedFlag;
  }

  /**
   * One completion, validated against `zodSchema`.
   * Throws InvalidOutputError after the single retry, or
   * RateLimitExhaustedError when 429s persist (also sets `stopped`).
   */
  async complete<T>(args: CompleteArgs<T>): Promise<T> {
    if (this.stoppedFlag) {
      throw new RateLimitExhaustedError("stopping after persistent rate limits");
    }

    let lastInvalid: InvalidOutputError | null = null;
    for (let attempt = 1; attempt <= MAX_OUTPUT_ATTEMPTS; attempt++) {
      let raw: string;
      try {
        raw = await this.post(args);
      } catch (error) {
        // Invalid output from Groq itself — retry once like a zod failure.
        if (!(error instanceof InvalidOutputError)) throw error;
        lastInvalid = error;
        if (attempt < MAX_OUTPUT_ATTEMPTS) {
          logError(`invalid ${args.what} output — retrying once`);
        }
        continue;
      }
      try {
        const json: unknown = parseModelJson(raw);
        return args.zodSchema.parse(json);
      } catch (error) {
        const detail = zodDetail(error);
        lastInvalid = new InvalidOutputError(`${args.what}: ${detail}`);
        if (attempt < MAX_OUTPUT_ATTEMPTS) {
          logError(`invalid ${args.what} output (${detail}) — retrying once`);
        }
      }
    }

    throw lastInvalid ?? new InvalidOutputError(`${args.what}: unknown failure`);
  }

  /** Adapts the request on a 400; returns true when something was dropped. */
  private adapt(message: string): boolean {
    const m = message.toLowerCase();
    let changed = false;

    if (
      this.mode !== "none" &&
      (m.includes("response_format") ||
        m.includes("json_schema") ||
        m.includes("structured output"))
    ) {
      const next: ResponseMode = this.mode === "schema" ? "object" : "none";
      log(
        `response_format unsupported (${next === "object" ? "JSON mode" : "prompt-only JSON"})`,
      );
      this.mode = next;
      changed = true;
    }
    if (this.useReasoningEffort && m.includes("reasoning")) {
      log("reasoning_effort unsupported — dropping it");
      this.useReasoningEffort = false;
      changed = true;
    }
    if (this.useTemperature && m.includes("temperature")) {
      log("temperature unsupported — dropping it");
      this.useTemperature = false;
      changed = true;
    }
    return changed;
  }

  private responseFormat(schema: JsonSchemaSpec): Record<string, unknown> {
    if (this.mode === "schema") {
      return {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schema.name,
            strict: schema.strict,
            schema: schema.schema,
          },
        },
      };
    }
    if (this.mode === "object") {
      return { response_format: { type: "json_object" } };
    }
    return {};
  }

  private async post(args: CompleteArgs<unknown>): Promise<string> {
    for (let retry = 0; ; retry++) {
      const body = {
        model: this.model,
        temperature: this.useTemperature ? 0.2 : undefined,
        reasoning_effort: this.useReasoningEffort ? "low" : undefined,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        ...this.responseFormat(args.jsonSchema),
      };

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (response.status === 429) {
        if (retry >= MAX_429_RETRIES) {
          this.stoppedFlag = true;
          const message = `rate limits persisted after ${MAX_429_RETRIES} retries — stopping the run cleanly`;
          logError(message);
          throw new RateLimitExhaustedError(message);
        }
        const waitMs = rateLimitDelay(response, retry);
        log(
          `429 rate limited — waiting ${Math.ceil(waitMs / 1_000)}s ` +
            `(retry ${retry + 1}/${MAX_429_RETRIES})`,
        );
        await sleep(waitMs);
        continue;
      }

      if (response.status === 400 || response.status === 422) {
        const message = await errorText(response);
        if (isGenerationFailure(message)) {
          // Structured output is flaky for this input (usually empty content).
          // Demote to JSON mode for the single retry; mode flags are one-way.
          if (this.mode === "schema") {
            this.mode = "object";
            log(
              "strict schema output failed validation — retrying once in JSON mode",
            );
          }
          throw new InvalidOutputError(
            `${args.what}: Groq schema validation failed`,
          );
        }
        if (this.adapt(message)) continue; // one-way flags, so this terminates
        throw new Error(`Groq rejected the request: ${message || response.status}`);
      }

      if (!response.ok) {
        throw new Error(
          `Groq HTTP ${response.status}: ${(await errorText(response)).slice(0, 300)}`,
        );
      }

      let data: {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error("Groq returned a non-JSON response");
      }

      let content = data.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        content = content
          .map((part: unknown) =>
            typeof part === "string"
              ? part
              : part && typeof part === "object" && "text" in part
                ? String((part as { text: unknown }).text ?? "")
                : "",
          )
          .join("");
      }
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Groq returned an empty completion");
      }
      return content;
    }
  }
}
