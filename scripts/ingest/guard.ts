/**
 * Source-text guard for stored summaries.
 *
 * After zod validation, every capitalized multi-word name and every number in
 * the output must also appear in the article text the summary came from.
 * Anything else is treated as an invented claim: the pipeline retries once,
 * then skips the article.
 *
 * Names are matched case-insensitively on purpose — a sentence-initial "The
 * Federal Reserve" must not trip over a mid-sentence "the Federal Reserve" —
 * but the phrase itself must exist in the source, so a fabricated name is
 * still caught. Single-word proper nouns are intentionally not checked
 * (spec: multi-word names only), because sentence starts make them noisy.
 */

export interface GuardViolation {
  kind: "name" | "number";
  token: string;
}

/** Two or more consecutive capitalized words, e.g. "Spirit Airlines".
 *  Each word must be at least 2 chars; periods are NOT part of a word, so
 *  a sentence end ("…Subscription.") can never merge with the next
 *  sentence's opening word into a fake name. */
const CAPITALIZED_NAME = /\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)+\b/g;

/** Digits with optional thousands separators and decimals, e.g. "1,500" / "149". */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `token` (a name/number extracted from the output) is grounded
 *  in `source`. Exported so the audit/diagnose tools classify locations with
 *  exactly the same logic the pipeline enforces. */
export function tokenOccursIn(
  token: string,
  kind: "name" | "number",
  source: string,
): boolean {
  const src = normalizeForMatch(source);
  if (kind === "name") {
    // A leading "The " is sentence furniture, not part of the name.
    const candidates = [normalizeForMatch(token)];
    if (candidates[0].startsWith("the ")) candidates.push(candidates[0].slice(4));
    const variants = [
      (text: string) => text,
      dashless,
      singularized,
      (text: string) => singularized(dashless(text)),
    ];
    for (const candidate of candidates) {
      for (const variant of variants) {
        const wanted = variant(candidate);
        if (src.includes(wanted)) return true;
        if (variant(src).includes(wanted)) return true;
        // Non-contiguous join: every word of the name occurs in order within
        // one sentence-ish window. A word missing entirely still fails, so
        // fabricated names are NOT excused.
        if (inOrderWithin(variant(src), wanted, MAX_JOIN_GAP_WORDS)) {
          return true;
        }
      }
    }
    return false;
  }
  const normalized = token.replace(/,/g, "");
  const pattern = new RegExp(
    `(?<![\\d.])${escapeRegExp(normalized)}(?![\\d])`,
  );
  return pattern.test(src.replace(/,/g, ""));
}

/** Numeric value of a raw number token ("1,500" → 1500). */
function numberValue(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

/** Scale immediately following the number at `endIndex` (case preserved):
 *  "10 million" / "10B" / "10M" → factor; 1 when none. */
function scaleAfter(text: string, endIndex: number): number {
  const rest = text.slice(endIndex);
  const word = rest.match(/^\s+(trillion|billion|million|thousand)\b/i);
  if (word) return SCALE_WORDS[word[1].toLowerCase()];
  const attached = rest.match(/^([KMB])(?![A-Za-z])/);
  if (attached) {
    return attached[1] === "K" ? 1e3 : attached[1] === "M" ? 1e6 : 1e9;
  }
  return 1;
}

/** Every number value in the source, with its scale word applied — so the
 *  same value written differently can be matched by value, not by digits. */
function sourceNumberValues(source: string): number[] {
  const values: number[] = [];
  for (const match of source.matchAll(NUMBER)) {
    const base = numberValue(match[0]);
    if (base === null || base <= 0) continue;
    values.push(base);
    const scaled = base * scaleAfter(source, (match.index ?? 0) + match[0].length);
    if (scaled !== base) values.push(scaled);
  }
  return values;
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(a, b) * 0.005;
}

/** Longest gap (in words) still counted as "the name appears in the
 *  source": covers possessive joins like "SimpleClosure … Its Asset Hub"
 *  (~one sentence). Every word must still be present, in order. */
const MAX_JOIN_GAP_WORDS = 32;

function inOrderWithin(src: string, name: string, maxGap: number): boolean {
  const words = (text: string): string[] =>
    text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const srcWords = words(src);
  const nameWords = words(name);
  if (nameWords.length < 2) return false;
  // Try every occurrence of the first word: anchoring on the earliest one
  // only would exhaust the gap window before a later anchor could fit
  // (e.g. "apple … [45 words] … homeview" vs "apple@17 … homeview@46").
  // Once an anchor is fixed, taking the earliest later match is optimal.
  for (let start = 0; start < srcWords.length; start++) {
    if (srcWords[start] !== nameWords[0]) continue;
    let previous = start;
    let cursor = start + 1;
    let matched = true;
    for (let w = 1; w < nameWords.length; w++) {
      let found = -1;
      for (let i = cursor; i < srcWords.length; i++) {
        if (srcWords[i] === nameWords[w]) {
          found = i;
          break;
        }
      }
      if (found < 0 || found - previous - 1 > maxGap) {
        matched = false;
        break;
      }
      previous = found;
      cursor = found + 1;
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Canonical form for phrase comparison: possessives dropped ("Apple's
 * HomeView" ≡ "Apple HomeView"), curly and straight apostrophes treated
 * alike, lowercase, whitespace collapsed to single spaces. Applied to BOTH
 * sides, so contractions like "don't" normalize identically everywhere.
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?<=[a-z0-9])[\u2018\u2019']s\b/g, "")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hyphens/dashes ≡ spaces: "high-speed" ≡ "high speed", and a token
 *  ending in a line-wrap hyphen ("Griffin-") matches "Griffin …". */
function dashless(text: string): string {
  return text.replace(/[-\u2010-\u2015\u2212]/g, " ").replace(/\s+/g, " ").trim();
}

/** Plural variant: trailing "s" of each word dropped on BOTH sides
 *  ("their users" ≡ "their user"). Short words are left alone. */
function singularized(text: string): string {
  return text.replace(/\b(\w{4,})s\b/g, "$1");
}

/**
 * Returns every name/number in `output` that does not occur in `source`.
 * An empty array means the output is grounded in the source text.
 */
export function findViolations(output: string, source: string): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const seen = new Set<string>();
  // Names are matched PER LINE (bullet / why-it-matters) so two adjacent
  // lines can never merge into a fake name ("…Startup Battlefield\nAttendees…").
  for (const line of output.split(/\r?\n/)) {
    const collapsed = line.replace(/\s+/g, " ");
    for (const match of collapsed.matchAll(CAPITALIZED_NAME)) {
      const token = match[0];
      const key = `name:${normalizeForMatch(token)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!tokenOccursIn(token, "name", source)) {
        violations.push({ kind: "name", token });
      }
    }
  }

  // Numbers run over the whole output so "10\nmillion" still sees its scale.
  const out = output.replace(/\s+/g, " ");
  let sourceValues: number[] | null = null;
  for (const match of out.matchAll(NUMBER)) {
    const token = match[0];
    const key = `number:${token.replace(/,/g, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tokenOccursIn(token, "number", source)) continue;
    // Same value, different notation: "$10M" ≡ "10 million" ≡ "10,000,000".
    const value = numberValue(token);
    if (value !== null && value > 0) {
      sourceValues ??= sourceNumberValues(source);
      const scaled = value * scaleAfter(out, (match.index ?? 0) + token.length);
      if (sourceValues.some((sourceValue) => sameValue(sourceValue, scaled))) {
        continue;
      }
    }
    violations.push({ kind: "number", token });
  }

  return violations;
}

/** Everything a summary may legitimately draw from: the excerpt the model
 *  was given, the full page (beyond the 6000-char cut), the feed summary
 *  (already stripped of HTML), and the title. A token absent from ALL of
 *  these is a real fabrication. */
export function guardBasis(
  excerpt: string,
  fullPage: string,
  feedSummary: string,
  title: string,
): string {
  return [excerpt, fullPage, feedSummary, title].filter(Boolean).join("\n");
}

/** Bullets + why-it-matters as one string — what the guard inspects. */
export function summaryOutputText(
  summaryBullets: string[],
  whyItMatters: string,
): string {
  return [...summaryBullets, whyItMatters].join("\n");
}
