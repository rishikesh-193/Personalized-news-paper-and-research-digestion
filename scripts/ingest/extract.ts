import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchWithTimeout, logError } from "./util";

/** Never store or send more than this many characters of article text. */
export const MAX_TEXT_CHARS = 6_000;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strips HTML tags from the feed summary fallback. */
export function stripTags(html: string): string {
  return collapseWhitespace(html.replace(/<[^>]*>/g, " "));
}

/**
 * Full readable page text (NOT truncated), "" when extraction fails or the
 * page has too little text. Used by the source-text guard, which must be
 * able to see beyond the 6000-character excerpt the model receives.
 */
export async function fetchFullPageText(url: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(url, 20_000);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(dom.window.document).parse();
    const text = collapseWhitespace(parsed?.textContent ?? "");
    if (text.length > 200) return text;
  } catch (error) {
    logError(
      `extraction failed for ${url} — ${
        error instanceof Error ? error.message : String(error)
      } (using feed summary)`,
    );
  }
  return "";
}

/** What one article was (or will be) summarized from. */
export interface ExtractedText {
  /** The excerpt the model sees: full page truncated to MAX_TEXT_CHARS,
   *  falling back to the feed summary, then the title. */
  text: string;
  /** Full readable page text — "" when the page could not be read. The
   *  source-text guard checks it so facts beyond the 6000-char cut are not
   *  mistaken for fabrications. */
  fullPage: string;
}

/**
 * Fetches the article page ONCE and returns both the excerpt the model is
 * summarized from and the full page text for the guard. Failures never
 * abort the run.
 */
export async function extractArticleText(
  url: string,
  feedSummary: string,
  title: string,
): Promise<ExtractedText> {
  const fullPage = await fetchFullPageText(url);
  if (fullPage) return { text: fullPage.slice(0, MAX_TEXT_CHARS), fullPage };
  const fallback = stripTags(feedSummary);
  return { text: (fallback || title).slice(0, MAX_TEXT_CHARS), fullPage: "" };
}
