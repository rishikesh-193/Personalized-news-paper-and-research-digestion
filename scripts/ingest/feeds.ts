/**
 * Feed list for the RSS adapter — one entry per (topic, source).
 *
 * Topic labels MUST come from src/lib/topic-groups.ts so the stored
 * topic_tag matches what users pick during onboarding. Every URL below was
 * requested on 2026-10-12 and kept only when it returned valid RSS/Atom with
 * items. Dropped during the probe: VentureBeat AI (429), Live Science (404),
 * Space.com (empty feed), Medical News Today (connection failure),
 * Serious Eats (404), Motorsport.com (no items).
 */
export interface FeedConfig {
  /** Must match a topic label in src/lib/topic-groups.ts. */
  topic: string;
  /** Source name stored on each article. */
  source: string;
  url: string;
}

export const FEEDS: FeedConfig[] = [
  // Technology
  { topic: "Technology", source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { topic: "Technology", source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { topic: "Technology", source: "TechCrunch", url: "https://techcrunch.com/feed/" },
  // AI
  { topic: "AI", source: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  // Programming
  { topic: "Programming", source: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { topic: "Programming", source: "DEV Community", url: "https://dev.to/feed" },
  // Startups
  { topic: "Startups", source: "TechCrunch", url: "https://techcrunch.com/category/startups/feed/" },
  // Gadgets
  { topic: "Gadgets", source: "Engadget", url: "https://www.engadget.com/rss.xml" },
  // Science
  { topic: "Science", source: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml" },
  // Space
  { topic: "Space", source: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
  // Markets
  { topic: "Markets", source: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { topic: "Markets", source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  // Crypto
  { topic: "Crypto", source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  // World
  { topic: "World", source: "BBC News", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { topic: "World", source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  // Politics
  { topic: "Politics", source: "NPR Politics", url: "https://feeds.npr.org/1014/rss.xml" },
  // Environment
  { topic: "Environment", source: "The Guardian", url: "https://www.theguardian.com/environment/rss" },
  // Books
  { topic: "Books", source: "The Guardian", url: "https://www.theguardian.com/books/rss" },
  // Film
  { topic: "Film", source: "Variety", url: "https://variety.com/feed/" },
  // Music
  { topic: "Music", source: "NME", url: "https://www.nme.com/feed/" },
  // Gaming
  { topic: "Gaming", source: "Polygon", url: "https://www.polygon.com/rss/index.xml" },
  // Sports
  { topic: "Sports", source: "BBC Sport", url: "http://feeds.bbci.co.uk/sport/rss.xml" },
  { topic: "Sports", source: "The Guardian", url: "https://www.theguardian.com/sport/rss" },
  { topic: "Football", source: "BBC Sport", url: "http://feeds.bbci.co.uk/sport/football/rss.xml" },
  { topic: "Cricket", source: "ESPNcricinfo", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml" },
];
