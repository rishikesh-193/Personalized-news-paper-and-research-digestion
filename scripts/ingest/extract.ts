import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchWithTimeout, logError } from "./util";

/** Never store or send more than this many characters of article text. */
const MAX_TEXT_CHARS = 6_000;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strips HTML tags from the feed summary fallback. */
function stripTags(html: string): string {
  return collapseWhitespace(html.replace(/<[^>]*>/g, " "));
}

/**
 * Fetches the article page and extracts readable text with Readability.
 * Falls back to the feed summary, then to the title — always truncated to
 * about 6000 characters. Failures never abort the run.
 */
export async function extractReadableText(
  url: string,
  feedSummary: string,
  title: string,
): Promise<string> {
  try {
    const response = await fetchWithTimeout(url, 20_000);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(dom.window.document).parse();
    const text = collapseWhitespace(parsed?.textContent ?? "");
    if (text.length > 200) {
      return text.slice(0, MAX_TEXT_CHARS);
    }
  } catch (error) {
    logError(
      `extraction failed for ${url} — ${
        error instanceof Error ? error.message : String(error)
      } (using feed summary)`,
    );
  }

  const fallback = stripTags(feedSummary);
  return (fallback || title).slice(0, MAX_TEXT_CHARS);
}
