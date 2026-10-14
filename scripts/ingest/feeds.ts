/**
 * Feed registry for the RSS adapter — one entry per (topic, source).
 *
 * Topic labels MUST come from src/lib/topic-groups.ts so the stored topic_tag
 * matches what users pick during onboarding. Every enabled URL below was
 * requested from the ingestion host and kept only when it returned valid
 * RSS/Atom with at least one usable, recent item.
 *
 * Verification history
 * --------------------
 * 2026-10-12 (initial 24-feed list) — dropped: VentureBeat AI (429),
 *   Live Science (404), Space.com (empty), Medical News Today (connection
 *   failure), Serious Eats (404), Motorsport.com (no items).
 * 2026-10-14 (~270 candidates probed via scripts/ingest/probe-candidates.ts
 *   and probe-round2/3.ts). Re-probe at any time with:
 *
 *     npx tsx scripts/ingest/audit.ts --feeds --all
 *
 * Findings that shaped this file:
 *  - Google News search RSS feeds return plausible items but their <link> is
 *    a news.google.com/rss/articles/... redirect that does NOT resolve to the
 *    publisher (Readability extracts 0 characters). They therefore cannot be
 *    summarized and are deliberately NOT used here.
 *  - Sky Sports RSS returns 20 items with no parseable date on either feed.
 *    rss-parser reports no isoDate, and the pipeline drops undated items, so
 *    both feeds contributed nothing. Parked rather than deleted.
 *  - Several big-name feeds are alive but effectively dead: TouchArcade
 *    (543 days), 90min (380 days), WHO (231 days), Self (138 days),
 *    Nomadic Matt (78 days), CSS-Tricks (44 days). Parked.
 *
 * Feeds marked `enabled: false` are kept as a record so a known-bad URL is
 * not re-added by a future probe; they are skipped by ingestion and by the
 * audit unless it is run with --all.
 */
export interface FeedConfig {
  /** Must match a topic label in src/lib/topic-groups.ts. */
  topic: string;
  /** Source name stored on each article. */
  source: string;
  /**
   * The stable identifier for this source — see sourceId(). Left unset here
   * because the feed URL is already a verified, unique, unchanging endpoint
   * and a derived id cannot drift out of sync with it. Set explicitly only
   * when the derived slug is too ugly to read in a report.
   */
  id?: string;
  url: string;
  /**
   * Subtopics this feed is a good source for, best first.
   * Exactly ONE entry marks the feed as single-subject: the subtopic is then
   * authoritative (Nintendo Life is always "Nintendo", never keyword-guessed).
   */
  subtopics?: string[];
  /** ISO-639-1 language of the feed's own text. Defaults to "en". */
  language?: string;
  /** Primary geographic focus. Defaults to "global". */
  region?: "global" | "india" | "us" | "uk" | "eu";
  /** false parks the feed without deleting it. Defaults to enabled. */
  enabled?: boolean;
  /** Why a feed is parked — the observed failure, not a guess. */
  note?: string;
}

export const FEEDS: FeedConfig[] = [
  // ---------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------
  {
    topic: "AI",
    source: "MIT Technology Review",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    subtopics: ["Research", "Models"],
    region: "us",
  },
  {
    topic: "AI",
    source: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    subtopics: ["Products", "Funding", "Models"],
    region: "us",
  },
  {
    topic: "AI",
    source: "The Verge",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    subtopics: ["Products", "Models", "Policy"],
    region: "us",
  },
  {
    topic: "AI",
    source: "Wired",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    subtopics: ["Models", "Policy", "Research"],
    region: "us",
  },
  {
    topic: "AI",
    source: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    subtopics: ["Research", "Models", "Policy"],
    region: "us",
  },
  {
    topic: "AI",
    source: "VentureBeat",
    url: "https://venturebeat.com/category/ai/feed/",
    subtopics: ["Products", "Models"],
    enabled: false,
    note: "HTTP 429 on both probes (2026-10-12 and 2026-10-14) — blocks non-browser clients.",
  },

  // ---------------------------------------------------------------------
  // Technology
  // ---------------------------------------------------------------------
  {
    topic: "Technology",
    source: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    subtopics: ["Industry", "Software", "Hardware"],
  },
  {
    topic: "Technology",
    source: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    subtopics: ["Industry", "Software", "Reviews"],
  },
  {
    topic: "Technology",
    source: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    subtopics: ["Industry", "Software"],
  },
  {
    topic: "Technology",
    source: "Wired",
    url: "https://www.wired.com/feed/rss",
    subtopics: ["Industry", "Policy", "Software"],
  },
  {
    topic: "Technology",
    source: "The Register",
    url: "https://www.theregister.com/headlines.atom",
    subtopics: ["Industry", "Hardware", "Software"],
    region: "uk",
  },
  {
    topic: "Technology",
    source: "IEEE Spectrum",
    url: "https://spectrum.ieee.org/feeds/feed.rss",
    subtopics: ["Hardware", "Software"],
  },
  {
    topic: "Technology",
    source: "Slashdot",
    url: "https://rss.slashdot.org/Slashdot/slashdotMain",
    subtopics: ["Industry", "Software"],
  },

  // ---------------------------------------------------------------------
  // Gadgets (devices and hardware)
  // ---------------------------------------------------------------------
  {
    topic: "Gadgets",
    source: "Engadget",
    url: "https://www.engadget.com/rss.xml",
    subtopics: ["Hardware", "Reviews", "Phones"],
  },
  {
    topic: "Gadgets",
    source: "GSMArena",
    url: "https://www.gsmarena.com/rss-news-reviews.php3",
    subtopics: ["Phones"],
  },
  {
    topic: "Gadgets",
    source: "Android Authority",
    url: "https://www.androidauthority.com/feed/",
    subtopics: ["Phones", "Reviews", "Hardware"],
  },
  {
    topic: "Gadgets",
    source: "TechRadar",
    url: "https://www.techradar.com/rss",
    subtopics: ["Reviews", "Computers", "Wearables"],
    region: "uk",
  },
  {
    topic: "Gadgets",
    source: "Tom's Hardware",
    url: "https://www.tomshardware.com/feeds/all",
    subtopics: ["Computers"],
  },
  {
    topic: "Gadgets",
    source: "9to5Mac",
    url: "https://9to5mac.com/feed/",
    subtopics: ["Reviews", "Computers", "Wearables"],
  },
  {
    topic: "Gadgets",
    source: "MacRumors",
    url: "https://feeds.macrumors.com/MacRumors-All",
    subtopics: ["Reviews", "Phones", "Computers"],
  },

  // ---------------------------------------------------------------------
  // Programming
  // ---------------------------------------------------------------------
  {
    topic: "Programming",
    source: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    subtopics: ["Open source", "Practices", "Developer tools"],
  },
  {
    topic: "Programming",
    source: "DEV Community",
    url: "https://dev.to/feed",
    subtopics: ["Web", "Practices", "Languages"],
  },
  {
    topic: "Programming",
    source: "InfoQ",
    url: "https://feed.infoq.com/",
    subtopics: ["Practices", "Developer tools", "Languages"],
  },
  {
    topic: "Programming",
    source: "LogRocket",
    url: "https://blog.logrocket.com/feed/",
    subtopics: ["Web", "Developer tools"],
  },
  {
    topic: "Programming",
    source: "Stack Overflow Blog",
    url: "https://stackoverflow.blog/feed/",
    subtopics: ["Practices", "Developer tools"],
  },
  {
    topic: "Programming",
    source: "The New Stack",
    url: "https://thenewstack.io/feed/",
    subtopics: ["Developer tools", "Open source", "Practices"],
  },
  {
    topic: "Programming",
    source: "GitHub Blog",
    url: "https://github.blog/feed/",
    subtopics: ["Open source", "Developer tools"],
  },
  {
    topic: "Programming",
    source: "Smashing Magazine",
    url: "https://www.smashingmagazine.com/feed/",
    subtopics: ["Web", "Practices"],
    enabled: false,
    note: "Alive but publishes slowly (newest item 8.1 days old) — parked to keep the freshness window honest.",
  },
  {
    topic: "Programming",
    source: "CSS-Tricks",
    url: "https://css-tricks.com/feed/",
    subtopics: ["Web"],
    enabled: false,
    note: "Newest item 43.9 days old (2026-10-14).",
  },

  // ---------------------------------------------------------------------
  // Startups
  // ---------------------------------------------------------------------
  {
    topic: "Startups",
    source: "TechCrunch",
    url: "https://techcrunch.com/category/startups/feed/",
    subtopics: ["Funding", "Founders"],
  },
  {
    topic: "Startups",
    source: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
    subtopics: ["Funding", "Venture"],
  },
  {
    topic: "Startups",
    source: "Sifted",
    url: "https://sifted.eu/feed",
    subtopics: ["Funding", "Venture"],
    region: "eu",
  },
  {
    topic: "Startups",
    source: "Tech.eu",
    url: "https://tech.eu/feed/",
    subtopics: ["Funding", "Venture"],
    region: "eu",
  },
  {
    topic: "Startups",
    source: "Inc42",
    url: "https://inc42.com/feed/",
    subtopics: ["Funding", "Founders"],
    region: "india",
  },
  {
    topic: "Startups",
    source: "YourStory",
    url: "https://yourstory.com/feed",
    subtopics: ["Founders", "Funding"],
    region: "india",
  },
  {
    topic: "Startups",
    source: "Entrepreneur",
    url: "https://www.entrepreneur.com/latest.rss",
    subtopics: ["Founders", "Venture"],
  },

  // ---------------------------------------------------------------------
  // Cybersecurity
  // ---------------------------------------------------------------------
  {
    topic: "Cybersecurity",
    source: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    subtopics: ["Vulnerabilities", "Breaches", "Research"],
  },
  {
    topic: "Cybersecurity",
    source: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    subtopics: ["Vulnerabilities", "Breaches"],
  },
  {
    topic: "Cybersecurity",
    source: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    subtopics: ["Breaches", "Research"],
  },
  {
    topic: "Cybersecurity",
    source: "Dark Reading",
    url: "https://www.darkreading.com/rss.xml",
    subtopics: ["Vulnerabilities", "Policy", "Research"],
  },
  {
    topic: "Cybersecurity",
    source: "SecurityWeek",
    url: "https://www.securityweek.com/feed/",
    subtopics: ["Vulnerabilities", "Policy"],
  },
  {
    topic: "Cybersecurity",
    source: "The Record",
    url: "https://therecord.media/feed",
    subtopics: ["Breaches", "Policy"],
  },
  {
    topic: "Cybersecurity",
    source: "CISA",
    url: "https://www.cisa.gov/news.xml",
    subtopics: ["Policy", "Vulnerabilities"],
    note: "Official US agency feed; publishes in bursts (newest item ~6 days old on 2026-10-14).",
  },

  // ---------------------------------------------------------------------
  // Apps
  // ---------------------------------------------------------------------
  {
    topic: "Apps",
    source: "9to5Google",
    url: "https://9to5google.com/feed/",
    subtopics: ["Android"],
  },
  {
    topic: "Apps",
    source: "Android Police",
    url: "https://www.androidpolice.com/feed/",
    subtopics: ["Android"],
  },
  {
    topic: "Apps",
    source: "XDA Developers",
    url: "https://www.xda-developers.com/feed/",
    subtopics: ["Android", "Updates"],
  },
  {
    topic: "Apps",
    source: "Android Central",
    url: "https://www.androidcentral.com/feeds.xml",
    subtopics: ["Android"],
  },
  {
    topic: "Apps",
    source: "MacStories",
    url: "https://www.macstories.net/feed/",
    subtopics: ["iOS"],
  },

  // ---------------------------------------------------------------------
  // Science
  // ---------------------------------------------------------------------
  {
    topic: "Science",
    source: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/all.xml",
    subtopics: ["Research", "Discoveries", "Breakthroughs"],
  },
  {
    topic: "Science",
    source: "Science News",
    url: "https://www.sciencenews.org/feed",
    subtopics: ["Research", "Discoveries"],
  },
  {
    topic: "Science",
    source: "Phys.org",
    url: "https://phys.org/rss-feed/",
    subtopics: ["Research", "Breakthroughs"],
  },
  {
    topic: "Science",
    source: "New Scientist",
    url: "https://www.newscientist.com/feed/home/",
    subtopics: ["Research", "Discoveries"],
    region: "uk",
  },
  {
    topic: "Science",
    source: "Nature",
    url: "https://www.nature.com/nature.rss",
    subtopics: ["Research"],
    region: "uk",
  },
  {
    topic: "Science",
    source: "Live Science",
    url: "https://www.livescience.com/feeds/all",
    subtopics: ["Discoveries", "Chemistry"],
  },

  // ---------------------------------------------------------------------
  // Space
  // ---------------------------------------------------------------------
  {
    topic: "Space",
    source: "NASA",
    url: "https://www.nasa.gov/news-release/feed/",
    subtopics: ["Missions", "Launches"],
    region: "us",
  },
  {
    topic: "Space",
    source: "Spaceflight Now",
    url: "https://spaceflightnow.com/feed/",
    subtopics: ["Launches", "Missions"],
  },
  {
    topic: "Space",
    source: "Universe Today",
    url: "https://www.universetoday.com/feed/",
    subtopics: ["Astronomy", "Missions"],
  },
  {
    topic: "Space",
    source: "ESA",
    url: "https://www.esa.int/rssfeed/Our_Activities/Space_News",
    subtopics: ["Missions", "Satellites"],
    region: "eu",
  },
  {
    topic: "Space",
    source: "Space.com",
    url: "https://www.space.com/feeds/all",
    subtopics: ["Astronomy", "Missions", "Satellites"],
  },

  // ---------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------
  {
    topic: "Physics",
    source: "Phys.org",
    url: "https://phys.org/rss-feed/physics-news/",
    subtopics: ["Research", "Particles", "Quantum"],
  },
  {
    topic: "Physics",
    source: "Physics World",
    url: "https://physicsworld.com/feed/",
    subtopics: ["Research", "Materials"],
    region: "uk",
  },
  {
    topic: "Physics",
    source: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/matter_energy.xml",
    subtopics: ["Research", "Materials", "Quantum"],
  },
  {
    topic: "Physics",
    source: "SciTechDaily",
    url: "https://scitechdaily.com/feed/",
    subtopics: ["Research", "Particles"],
  },
  {
    topic: "Physics",
    source: "Science News",
    url: "https://www.sciencenews.org/topic/physics/feed",
    subtopics: ["Research", "Quantum"],
  },

  // ---------------------------------------------------------------------
  // Biology
  // ---------------------------------------------------------------------
  {
    topic: "Biology",
    source: "Phys.org",
    url: "https://phys.org/rss-feed/biology-news/",
    subtopics: ["Research", "Ecology", "Evolution"],
  },
  {
    topic: "Biology",
    source: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/plants_animals.xml",
    subtopics: ["Ecology", "Evolution"],
  },
  {
    topic: "Biology",
    source: "Genetic Engineering News",
    url: "https://www.genengnews.com/feed/",
    subtopics: ["Genetics", "Research"],
  },
  {
    topic: "Biology",
    source: "Science News",
    url: "https://www.sciencenews.org/topic/life/feed",
    subtopics: ["Research", "Evolution", "Genetics"],
  },

  // ---------------------------------------------------------------------
  // Medicine
  // ---------------------------------------------------------------------
  {
    topic: "Medicine",
    source: "Medical Xpress",
    url: "https://medicalxpress.com/rss-feed/",
    subtopics: ["Clinical trials", "Public health"],
  },
  {
    topic: "Medicine",
    source: "STAT News",
    url: "https://www.statnews.com/feed/",
    subtopics: ["Pharma", "Clinical trials"],
    region: "us",
  },
  {
    topic: "Medicine",
    source: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/health_medicine.xml",
    subtopics: ["Clinical trials", "Devices"],
  },

  // ---------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------
  {
    topic: "Health",
    source: "NPR",
    url: "https://feeds.npr.org/1128/rss.xml",
    subtopics: ["Public health", "Policy"],
    region: "us",
  },
  {
    topic: "Health",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/health/rss.xml",
    subtopics: ["Public health", "Nutrition"],
    region: "uk",
  },
  {
    topic: "Health",
    source: "The Guardian",
    url: "https://www.theguardian.com/society/health/rss",
    subtopics: ["Public health", "Wellness"],
    region: "uk",
  },
  {
    topic: "Health",
    source: "STAT News",
    url: "https://www.statnews.com/category/health/feed/",
    subtopics: ["Policy", "Public health"],
    region: "us",
  },
  {
    topic: "Health",
    source: "KFF Health News",
    url: "https://kffhealthnews.org/feed/",
    subtopics: ["Policy", "Public health"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Psychology
  // ---------------------------------------------------------------------
  {
    topic: "Psychology",
    source: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/mind_brain.xml",
    subtopics: ["Research", "Behaviour"],
  },
  {
    topic: "Psychology",
    source: "Association for Psychological Science",
    url: "https://www.psychologicalscience.org/feed",
    subtopics: ["Mental health", "Behaviour", "Research"],
  },
  {
    topic: "Psychology",
    source: "Spring.org.uk",
    url: "https://www.spring.org.uk/feed",
    subtopics: ["Behaviour", "Mental health"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Fitness
  // ---------------------------------------------------------------------
  {
    topic: "Fitness",
    source: "Runner's World",
    url: "https://www.runnersworld.com/rss/all.xml",
    subtopics: ["Running", "Training"],
  },
  {
    topic: "Fitness",
    source: "Bicycling",
    url: "https://www.bicycling.com/rss/all.xml",
    subtopics: ["Cycling", "Training"],
  },
  {
    topic: "Fitness",
    source: "Men's Health",
    url: "https://www.menshealth.com/rss/all.xml",
    subtopics: ["Training", "Nutrition"],
  },
  {
    topic: "Fitness",
    source: "Women's Health",
    url: "https://www.womenshealthmag.com/rss/all.xml",
    subtopics: ["Training", "Nutrition"],
  },

  // ---------------------------------------------------------------------
  // Business
  // ---------------------------------------------------------------------
  {
    topic: "Business",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    subtopics: ["Companies", "Economy"],
    region: "uk",
  },
  {
    topic: "Business",
    source: "NPR",
    url: "https://feeds.npr.org/1006/rss.xml",
    subtopics: ["Companies", "Economy"],
    region: "us",
  },
  {
    topic: "Business",
    source: "Fortune",
    url: "https://fortune.com/feed/",
    subtopics: ["Strategy", "Workplace", "Companies"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Markets
  // ---------------------------------------------------------------------
  {
    topic: "Markets",
    source: "CNBC",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    subtopics: ["Stocks", "Earnings"],
    region: "us",
  },
  {
    topic: "Markets",
    source: "MarketWatch",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    subtopics: ["Stocks", "Bonds", "Commodities"],
    region: "us",
  },
  {
    topic: "Markets",
    source: "TheStreet",
    url: "https://www.thestreet.com/.rss/full/",
    subtopics: ["Stocks", "Earnings"],
    region: "us",
  },
  {
    topic: "Markets",
    source: "Seeking Alpha",
    url: "https://seekingalpha.com/feed.xml",
    subtopics: ["Stocks", "Earnings"],
    region: "us",
  },
  {
    topic: "Markets",
    source: "Investing.com",
    url: "https://www.investing.com/rss/news_25.rss",
    subtopics: ["Commodities", "Bonds"],
  },

  // ---------------------------------------------------------------------
  // Finance
  // ---------------------------------------------------------------------
  {
    topic: "Finance",
    source: "Economic Times",
    url: "https://economictimes.indiatimes.com/industry/banking/finance/rssfeeds/13358259.cms",
    subtopics: ["Banking", "Fintech", "Policy"],
    region: "india",
  },
  {
    topic: "Finance",
    source: "The Guardian",
    url: "https://www.theguardian.com/money/rss",
    subtopics: ["Investing", "Banking"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Economy
  // ---------------------------------------------------------------------
  {
    topic: "Economy",
    source: "Livemint",
    url: "https://www.livemint.com/rss/economy",
    subtopics: ["Macro", "Policy", "Inflation"],
    region: "india",
  },
  {
    topic: "Economy",
    source: "The Economist",
    url: "https://www.economist.com/finance-and-economics/rss.xml",
    subtopics: ["Macro", "Trade", "Policy"],
    region: "uk",
  },
  {
    topic: "Economy",
    source: "The Guardian",
    url: "https://www.theguardian.com/business/economics/rss",
    subtopics: ["Macro", "Policy", "Inflation"],
    region: "uk",
  },
  {
    topic: "Economy",
    source: "The Guardian",
    url: "https://www.theguardian.com/business/rss",
    subtopics: ["Macro", "Trade"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Crypto
  // ---------------------------------------------------------------------
  {
    topic: "Crypto",
    source: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    subtopics: ["Bitcoin", "Regulation", "DeFi"],
  },
  {
    topic: "Crypto",
    source: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    subtopics: ["Bitcoin", "Regulation", "DeFi"],
  },
  {
    topic: "Crypto",
    source: "The Block",
    url: "https://www.theblock.co/rss.xml",
    subtopics: ["Regulation", "DeFi", "Bitcoin"],
  },
  {
    topic: "Crypto",
    source: "Decrypt",
    url: "https://decrypt.co/feed",
    subtopics: ["Ethereum", "DeFi", "Bitcoin"],
  },
  {
    topic: "Crypto",
    source: "Bitcoin Magazine",
    url: "https://bitcoinmagazine.com/feed",
    subtopics: ["Bitcoin"],
  },

  // ---------------------------------------------------------------------
  // Real Estate
  // ---------------------------------------------------------------------
  {
    topic: "Real Estate",
    source: "Economic Times",
    url: "https://economictimes.indiatimes.com/wealth/real-estate/rssfeeds/13352306.cms",
    subtopics: ["Property market", "Housing", "Policy"],
    region: "india",
  },
  {
    topic: "Real Estate",
    source: "HousingWire",
    url: "https://www.housingwire.com/feed/",
    subtopics: ["Housing", "Property market"],
    region: "us",
  },
  {
    topic: "Real Estate",
    source: "Realtor.com",
    url: "https://www.realtor.com/news/feed/",
    subtopics: ["Housing", "Property market"],
    region: "us",
  },
  {
    topic: "Real Estate",
    source: "Housing.com",
    url: "https://housing.com/news/feed/",
    subtopics: ["Property market", "Policy"],
    region: "india",
    enabled: false,
    note: "Newest item 19.9 days old (2026-10-14).",
  },

  // ---------------------------------------------------------------------
  // Personal Finance
  // ---------------------------------------------------------------------
  {
    topic: "Personal Finance",
    source: "NerdWallet",
    url: "https://www.nerdwallet.com/blog/feed/",
    subtopics: ["Budgeting", "Saving", "Investing"],
    region: "us",
  },
  {
    topic: "Personal Finance",
    source: "Livemint",
    url: "https://www.livemint.com/rss/money",
    subtopics: ["Saving", "Investing", "Taxes"],
    region: "india",
  },

  // ---------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------
  {
    topic: "Jobs",
    source: "HR Dive",
    url: "https://www.hrdive.com/feeds/news/",
    subtopics: ["Hiring", "Workplace"],
    region: "us",
  },
  {
    topic: "Jobs",
    source: "Fast Company",
    url: "https://www.fastcompany.com/section/leadership/rss",
    subtopics: ["Careers", "Workplace", "Skills"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // India
  // ---------------------------------------------------------------------
  {
    topic: "India",
    source: "The Hindu",
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    subtopics: ["National", "Politics"],
    region: "india",
  },
  {
    topic: "India",
    source: "The Indian Express",
    url: "https://indianexpress.com/section/india/feed/",
    subtopics: ["National", "Society"],
    region: "india",
  },
  {
    topic: "India",
    source: "Hindustan Times",
    url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
    subtopics: ["National", "Society"],
    region: "india",
  },
  {
    topic: "India",
    source: "NDTV",
    url: "https://feeds.feedburner.com/ndtvnews-india-news",
    subtopics: ["National", "Politics"],
    region: "india",
  },
  {
    topic: "India",
    source: "Times of India",
    url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
    subtopics: ["National", "Society"],
    region: "india",
  },
  {
    topic: "India",
    source: "Economic Times",
    url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
    subtopics: ["Business", "Politics"],
    region: "india",
  },
  {
    topic: "India",
    source: "Livemint",
    url: "https://www.livemint.com/rss/politics",
    subtopics: ["Politics", "National"],
    region: "india",
  },

  // ---------------------------------------------------------------------
  // World
  // ---------------------------------------------------------------------
  {
    topic: "World",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    subtopics: ["Conflicts", "Diplomacy", "Geopolitics"],
    region: "uk",
  },
  {
    topic: "World",
    source: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
    subtopics: ["Conflicts", "Diplomacy", "Elections"],
    region: "uk",
  },
  {
    topic: "World",
    source: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    subtopics: ["Conflicts", "Geopolitics"],
  },
  {
    topic: "World",
    source: "NPR",
    url: "https://feeds.npr.org/1004/rss.xml",
    subtopics: ["Diplomacy", "Conflicts"],
    region: "us",
  },
  {
    topic: "World",
    source: "DW",
    url: "https://rss.dw.com/rdf/rss-en-all",
    subtopics: ["Geopolitics", "Elections"],
    region: "eu",
  },
  {
    topic: "World",
    source: "France 24",
    url: "https://www.france24.com/en/rss",
    subtopics: ["Geopolitics", "Conflicts"],
    region: "eu",
  },

  // ---------------------------------------------------------------------
  // Politics
  // ---------------------------------------------------------------------
  {
    topic: "Politics",
    source: "NPR",
    url: "https://feeds.npr.org/1014/rss.xml",
    subtopics: ["Elections", "Policy"],
    region: "us",
  },
  {
    topic: "Politics",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/politics/rss.xml",
    subtopics: ["Government", "Policy"],
    region: "uk",
  },
  {
    topic: "Politics",
    source: "The Hill",
    url: "https://thehill.com/feed/",
    subtopics: ["Government", "Elections", "Policy"],
    region: "us",
  },
  {
    topic: "Politics",
    source: "The Guardian",
    url: "https://www.theguardian.com/politics/rss",
    subtopics: ["Government", "Elections", "Policy"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Education
  // ---------------------------------------------------------------------
  {
    topic: "Education",
    source: "EdSurge",
    url: "https://www.edsurge.com/articles_rss",
    subtopics: ["Schools", "Policy"],
    region: "us",
  },
  {
    topic: "Education",
    source: "Inside Higher Ed",
    url: "https://www.insidehighered.com/rss.xml",
    subtopics: ["Higher education", "Policy"],
    region: "us",
  },
  {
    topic: "Education",
    source: "The Hechinger Report",
    url: "https://hechingerreport.org/feed/",
    subtopics: ["Schools", "Research"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Law
  // ---------------------------------------------------------------------
  {
    topic: "Law",
    source: "Above the Law",
    url: "https://abovethelaw.com/feed/",
    subtopics: ["Courts", "Corporate"],
    region: "us",
  },
  {
    topic: "Law",
    source: "SCOTUSblog",
    url: "https://www.scotusblog.com/feed/",
    subtopics: ["Courts", "Rights"],
    region: "us",
  },
  {
    topic: "Law",
    source: "Legal Cheek",
    url: "https://www.legalcheek.com/feed/",
    subtopics: ["Courts", "Corporate"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Environment
  // ---------------------------------------------------------------------
  {
    topic: "Environment",
    source: "The Guardian",
    url: "https://www.theguardian.com/environment/rss",
    subtopics: ["Climate", "Conservation", "Energy"],
    region: "uk",
  },
  {
    topic: "Environment",
    source: "Inside Climate News",
    url: "https://insideclimatenews.org/feed/",
    subtopics: ["Climate", "Policy"],
    region: "us",
  },
  {
    topic: "Environment",
    source: "Carbon Brief",
    url: "https://www.carbonbrief.org/feed",
    subtopics: ["Climate", "Energy"],
    region: "uk",
  },
  {
    topic: "Environment",
    source: "Yale e360",
    url: "https://e360.yale.edu/feed.xml",
    subtopics: ["Climate", "Conservation"],
    region: "us",
  },
  {
    topic: "Environment",
    source: "Mongabay",
    url: "https://news.mongabay.com/feed/",
    subtopics: ["Wildlife", "Conservation", "Climate"],
  },
  {
    topic: "Environment",
    source: "Grist",
    url: "https://grist.org/feed/",
    subtopics: ["Climate", "Energy"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Society
  // ---------------------------------------------------------------------
  {
    topic: "Society",
    source: "The Guardian",
    url: "https://www.theguardian.com/society/rss",
    subtopics: ["Policy", "Communities", "Inequality"],
    region: "uk",
  },
  {
    topic: "Society",
    source: "The Guardian",
    url: "https://www.theguardian.com/uk/rss",
    subtopics: ["Communities", "Policy"],
    region: "uk",
  },
  {
    topic: "Society",
    source: "The Guardian",
    url: "https://www.theguardian.com/inequality/rss",
    subtopics: ["Inequality", "Policy"],
    region: "uk",
  },
  {
    topic: "Society",
    source: "The Conversation",
    url: "https://theconversation.com/articles.atom",
    subtopics: ["Culture", "Policy", "Communities"],
  },
  {
    topic: "Society",
    source: "NPR",
    url: "https://feeds.npr.org/1003/rss.xml",
    subtopics: ["Communities", "Inequality"],
    region: "us",
  },
  {
    topic: "Society",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/uk/rss.xml",
    subtopics: ["Communities", "Policy"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------
  {
    topic: "Media",
    source: "Nieman Lab",
    url: "https://www.niemanlab.org/feed/",
    subtopics: ["Journalism", "Platforms"],
    region: "us",
  },
  {
    topic: "Media",
    source: "Poynter",
    url: "https://www.poynter.org/feed/",
    subtopics: ["Journalism", "Publishing"],
    region: "us",
  },
  {
    topic: "Media",
    source: "Digiday",
    url: "https://digiday.com/feed/",
    subtopics: ["Business", "Platforms"],
    region: "us",
  },
  {
    topic: "Media",
    source: "Press Gazette",
    url: "https://pressgazette.co.uk/feed/",
    subtopics: ["Publishing", "Journalism"],
    region: "uk",
  },
  {
    topic: "Media",
    source: "The Guardian",
    url: "https://www.theguardian.com/media/rss",
    subtopics: ["Publishing", "Platforms"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Culture
  // ---------------------------------------------------------------------
  {
    topic: "Culture",
    source: "The Guardian",
    url: "https://www.theguardian.com/culture/rss",
    subtopics: ["Arts", "Events", "Ideas"],
    region: "uk",
  },
  {
    topic: "Culture",
    source: "The Guardian",
    url: "https://www.theguardian.com/lifeandstyle/rss",
    subtopics: ["Ideas", "Events"],
    region: "uk",
  },
  {
    topic: "Culture",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    subtopics: ["Arts", "Events"],
    region: "uk",
  },
  {
    topic: "Culture",
    source: "Smithsonian Magazine",
    url: "https://www.smithsonianmag.com/rss/latest_articles/",
    subtopics: ["Heritage", "Arts", "Ideas"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Film
  // ---------------------------------------------------------------------
  {
    topic: "Film",
    source: "Variety",
    url: "https://variety.com/feed/",
    subtopics: ["Industry", "Box office", "Releases"],
    region: "us",
  },
  {
    topic: "Film",
    source: "The Hollywood Reporter",
    url: "https://www.hollywoodreporter.com/feed/",
    subtopics: ["Industry", "Box office"],
    region: "us",
  },
  {
    topic: "Film",
    source: "IndieWire",
    url: "https://www.indiewire.com/feed/",
    subtopics: ["Releases", "Reviews", "Industry"],
    region: "us",
  },
  {
    topic: "Film",
    source: "Deadline",
    url: "https://deadline.com/feed/",
    subtopics: ["Industry", "Releases"],
    region: "us",
  },
  {
    topic: "Film",
    source: "Collider",
    url: "https://collider.com/feed/",
    subtopics: ["Releases", "Streaming"],
    region: "us",
  },
  {
    topic: "Film",
    source: "Slashfilm",
    url: "https://www.slashfilm.com/feed/",
    subtopics: ["Releases", "Reviews"],
    region: "us",
  },
  {
    topic: "Film",
    source: "Screen Rant",
    url: "https://screenrant.com/feed/",
    subtopics: ["Releases", "Streaming"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------------
  {
    topic: "Music",
    source: "NME",
    url: "https://www.nme.com/feed/",
    subtopics: ["New releases", "Live", "Reviews"],
    region: "uk",
  },
  {
    topic: "Music",
    source: "Pitchfork",
    url: "https://pitchfork.com/feed/feed-news/rss",
    subtopics: ["New releases", "Reviews"],
    region: "us",
  },
  {
    topic: "Music",
    source: "Rolling Stone",
    url: "https://www.rollingstone.com/feed/",
    subtopics: ["Industry", "New releases", "Reviews"],
    region: "us",
  },
  {
    topic: "Music",
    source: "Billboard",
    url: "https://www.billboard.com/feed/",
    subtopics: ["Industry", "New releases"],
    region: "us",
  },
  {
    topic: "Music",
    source: "Stereogum",
    url: "https://www.stereogum.com/feed/",
    subtopics: ["New releases", "Reviews"],
    region: "us",
  },
  {
    topic: "Music",
    source: "Consequence",
    url: "https://consequence.net/feed/",
    subtopics: ["New releases", "Reviews", "Live"],
    region: "us",
  },
  {
    topic: "Music",
    source: "The Line of Best Fit",
    url: "https://www.thelineofbestfit.com/feed",
    subtopics: ["New releases", "Reviews"],
    region: "uk",
  },

  // ---------------------------------------------------------------------
  // Books
  // ---------------------------------------------------------------------
  {
    topic: "Books",
    source: "The Guardian",
    url: "https://www.theguardian.com/books/rss",
    subtopics: ["Reviews", "Fiction", "Non-fiction"],
    region: "uk",
  },
  {
    topic: "Books",
    source: "Literary Hub",
    url: "https://lithub.com/feed/",
    subtopics: ["Ideas", "Non-fiction", "Fiction"],
    region: "us",
  },
  {
    topic: "Books",
    source: "Publishers Weekly",
    url: "https://www.publishersweekly.com/pw/feeds/recent/index.xml",
    subtopics: ["Industry", "New releases"],
    region: "us",
  },
  {
    topic: "Books",
    source: "The New York Times",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Books.xml",
    subtopics: ["Reviews", "New releases"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Fashion
  // ---------------------------------------------------------------------
  {
    topic: "Fashion",
    source: "Vogue",
    url: "https://www.vogue.com/feed/rss",
    subtopics: ["Runway", "Style"],
    region: "us",
  },
  {
    topic: "Fashion",
    source: "Fashionista",
    url: "https://fashionista.com/.rss/full/",
    subtopics: ["Industry", "Sustainability"],
    region: "us",
  },
  {
    topic: "Fashion",
    source: "Highsnobiety",
    url: "https://www.highsnobiety.com/feed/",
    subtopics: ["Style", "Runway"],
    region: "eu",
  },

  // ---------------------------------------------------------------------
  // Food
  // ---------------------------------------------------------------------
  {
    topic: "Food",
    source: "Bon Appétit",
    url: "https://www.bonappetit.com/feed/rss",
    subtopics: ["Recipes", "Restaurants"],
    region: "us",
  },
  {
    topic: "Food",
    source: "Eater",
    url: "https://www.eater.com/rss/index.xml",
    subtopics: ["Restaurants", "Culture"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Travel
  // ---------------------------------------------------------------------
  {
    topic: "Travel",
    source: "Condé Nast Traveler",
    url: "https://www.cntraveler.com/feed/rss",
    subtopics: ["Destinations", "Guides"],
    region: "us",
  },
  {
    topic: "Travel",
    source: "Skift",
    url: "https://skift.com/feed/",
    subtopics: ["Airlines", "Culture"],
    region: "us",
  },
  {
    topic: "Travel",
    source: "The Guardian",
    url: "https://www.theguardian.com/travel/rss",
    subtopics: ["Destinations", "Guides"],
    region: "uk",
  },
  {
    topic: "Travel",
    source: "Atlas Obscura",
    url: "https://www.atlasobscura.com/feeds/latest",
    subtopics: ["Destinations", "Culture"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Art
  // ---------------------------------------------------------------------
  {
    topic: "Art",
    source: "ARTnews",
    url: "https://www.artnews.com/feed/",
    subtopics: ["Artists", "Market", "Exhibitions"],
    region: "us",
  },
  {
    topic: "Art",
    source: "Hyperallergic",
    url: "https://hyperallergic.com/feed/",
    subtopics: ["Exhibitions", "Reviews"],
    region: "us",
  },
  {
    topic: "Art",
    source: "Artforum",
    url: "https://www.artforum.com/feed",
    subtopics: ["Exhibitions", "Reviews"],
    region: "us",
  },
  {
    topic: "Art",
    source: "Colossal",
    url: "https://www.thisiscolossal.com/feed/",
    subtopics: ["Artists"],
    region: "us",
  },

  // ---------------------------------------------------------------------
  // Gaming (dedicated coverage)
  // ---------------------------------------------------------------------
  {
    topic: "Gaming",
    source: "Polygon",
    url: "https://www.polygon.com/rss/index.xml",
    subtopics: ["Releases", "Reviews", "Industry"],
  },
  {
    topic: "Gaming",
    source: "IGN",
    url: "https://feeds.ign.com/ign/all",
    subtopics: ["Reviews", "Releases", "Esports"],
  },
  {
    topic: "Gaming",
    source: "Eurogamer",
    url: "https://www.eurogamer.net/feed",
    subtopics: ["Reviews", "Releases"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "PC Gamer",
    url: "https://www.pcgamer.com/rss/",
    subtopics: ["PC", "Reviews"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "Rock Paper Shotgun",
    url: "https://www.rockpapershotgun.com/feed",
    subtopics: ["PC", "Reviews"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "GameSpot",
    url: "https://www.gamespot.com/feeds/news/",
    subtopics: ["Releases", "Reviews", "Updates"],
  },
  {
    topic: "Gaming",
    source: "Kotaku",
    url: "https://kotaku.com/rss",
    subtopics: ["Industry", "Releases"],
  },
  {
    topic: "Gaming",
    source: "Video Games Chronicle",
    url: "https://www.videogameschronicle.com/feed/",
    subtopics: ["Releases", "Industry"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "GamesIndustry.biz",
    url: "https://www.gamesindustry.biz/feed",
    subtopics: ["Industry"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "PCGamesN",
    url: "https://www.pcgamesn.com/feed",
    subtopics: ["PC", "Updates"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "Nintendo Life",
    url: "https://www.nintendolife.com/feeds/latest",
    subtopics: ["Nintendo"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "Push Square",
    url: "https://www.pushsquare.com/feeds/latest",
    subtopics: ["PlayStation"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "Pure Xbox",
    url: "https://www.purexbox.com/feeds/latest",
    subtopics: ["Xbox"],
    region: "uk",
  },
  {
    topic: "Gaming",
    source: "TouchArcade",
    url: "https://toucharcade.com/feed/",
    subtopics: ["Mobile"],
    enabled: false,
    note: "Newest item 543.6 days old (2026-10-14) — effectively abandoned.",
  },
  {
    topic: "Gaming",
    source: "Pocket Gamer",
    url: "https://www.pocketgamer.biz/feed/",
    subtopics: ["Industry", "Mobile"],
    enabled: false,
    note: "HTTP 404 on 2026-10-14.",
  },

  // ---------------------------------------------------------------------
  // Sports (general)
  // ---------------------------------------------------------------------
  {
    topic: "Sports",
    source: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    subtopics: ["Football", "Cricket", "Formula 1", "Tennis"],
    region: "uk",
  },
  {
    topic: "Sports",
    source: "The Guardian",
    url: "https://www.theguardian.com/sport/rss",
    subtopics: ["Football", "Cricket", "Formula 1", "Tennis"],
    region: "uk",
  },
  {
    topic: "Sports",
    source: "ESPN",
    url: "https://www.espn.com/espn/rss/news",
    subtopics: ["Basketball", "Football", "Formula 1"],
    region: "us",
  },
  {
    topic: "Sports",
    source: "CBS Sports",
    url: "https://www.cbssports.com/rss/headlines/",
    subtopics: ["Basketball", "Football", "Tennis"],
    region: "us",
  },
  {
    topic: "Sports",
    source: "Sporting News",
    url: "https://www.sportingnews.com/us/rss",
    subtopics: ["Football", "Basketball"],
    region: "us",
  },
  {
    topic: "Sports",
    source: "Yahoo Sports",
    url: "https://sports.yahoo.com/rss/",
    subtopics: ["Basketball", "Football"],
    region: "us",
  },
  {
    topic: "Sports",
    source: "Sky Sports",
    url: "https://www.skysports.com/rss/12040",
    subtopics: ["Football", "Cricket", "Formula 1"],
    enabled: false,
    note: "Returns 20 items but NO parseable date on either feed — rss-parser yields no isoDate and the pipeline drops undated items, so it contributed zero articles. Verified 2026-10-14.",
  },
  {
    topic: "Sports",
    source: "Sports Illustrated",
    url: "https://www.si.com/rss/si_topstories.rss",
    subtopics: ["Football", "Basketball"],
    enabled: false,
    note: "HTTP 404 on 2026-10-14.",
  },

  // ---------------------------------------------------------------------
  // Cricket
  // ---------------------------------------------------------------------
  {
    topic: "Cricket",
    source: "ESPNcricinfo",
    url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
    subtopics: ["Matches", "T20", "ODI", "Test", "Players"],
  },
  {
    topic: "Cricket",
    source: "Wisden",
    url: "https://www.wisden.com/feed",
    subtopics: ["Matches", "Players", "Test"],
    region: "uk",
  },
  {
    topic: "Cricket",
    source: "Times of India",
    url: "https://timesofindia.indiatimes.com/rssfeeds/54829575.cms",
    subtopics: ["Matches", "Players"],
    region: "india",
  },
  {
    topic: "Cricket",
    source: "The Hindu",
    url: "https://www.thehindu.com/sport/cricket/feeder/default.rss",
    subtopics: ["Matches", "Players"],
    region: "india",
    enabled: false,
    note: "No parseable date — rss-parser yields no isoDate (verified 2026-10-14).",
  },
  {
    topic: "Cricket",
    source: "Cricbuzz",
    url: "https://www.cricbuzz.com/cricket-news/rss",
    subtopics: ["Matches", "Players"],
    region: "india",
    enabled: false,
    note: "HTTP 404 on 2026-10-14.",
  },

  // ---------------------------------------------------------------------
  // Football
  // ---------------------------------------------------------------------
  {
    topic: "Football",
    source: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    subtopics: ["Premier League", "Transfers", "International"],
    region: "uk",
  },
  {
    topic: "Football",
    source: "The Guardian",
    url: "https://www.theguardian.com/football/rss",
    subtopics: ["Premier League", "Transfers", "Champions League"],
    region: "uk",
  },
  {
    topic: "Football",
    source: "ESPN",
    url: "https://www.espn.com/espn/rss/soccer/news",
    subtopics: ["Premier League", "Champions League", "Transfers"],
    region: "us",
  },
  {
    topic: "Football",
    source: "Sky Sports",
    url: "https://www.skysports.com/rss/11095",
    subtopics: ["Premier League", "Transfers"],
    enabled: false,
    note: "No parseable date — rss-parser yields no isoDate (verified 2026-10-14).",
  },
  {
    topic: "Football",
    source: "90min",
    url: "https://www.90min.com/posts.rss",
    subtopics: ["Transfers"],
    enabled: false,
    note: "Newest item 380.2 days old (2026-10-14).",
  },
  {
    topic: "Football",
    source: "Goal",
    url: "https://www.goal.com/feeds/en/news",
    subtopics: ["Transfers", "Premier League"],
    enabled: false,
    note: "HTTP 404 on 2026-10-14.",
  },

  // ---------------------------------------------------------------------
  // Motorsport
  // ---------------------------------------------------------------------
  {
    topic: "Motorsport",
    source: "Autosport",
    url: "https://www.autosport.com/rss/feed/all",
    subtopics: ["Formula 1", "Teams"],
    region: "uk",
  },
  {
    topic: "Motorsport",
    source: "The Race",
    url: "https://the-race.com/feed/",
    subtopics: ["Formula 1", "Teams"],
    region: "uk",
  },
  {
    topic: "Motorsport",
    source: "Crash.net",
    url: "https://www.crash.net/rss",
    subtopics: ["Formula 1", "MotoGP"],
    region: "uk",
  },
  {
    topic: "Motorsport",
    source: "Motorsport Week",
    url: "https://www.motorsportweek.com/feed/",
    subtopics: ["Formula 1", "Rally"],
    region: "uk",
  },
  {
    topic: "Motorsport",
    source: "PlanetF1",
    url: "https://www.planetf1.com/feed/",
    subtopics: ["Formula 1"],
    enabled: false,
    note: "HTTP 404 on 2026-10-14.",
  },
  {
    topic: "Motorsport",
    source: "Motorsport.com",
    url: "https://www.motorsport.com/rss/all/news/",
    subtopics: ["Formula 1"],
    enabled: false,
    note: "Feed returns no items.",
  },

  // ---------------------------------------------------------------------
  // Cycling
  // ---------------------------------------------------------------------
  {
    topic: "Cycling",
    source: "Cyclingnews",
    url: "https://www.cyclingnews.com/rss/",
    subtopics: ["Racing", "Grand Tours", "Gear"],
    region: "uk",
  },
  {
    topic: "Cycling",
    source: "Velo",
    url: "https://velo.outsideonline.com/feed/",
    subtopics: ["Racing", "Gear"],
    region: "us",
  },
  {
    topic: "Cycling",
    source: "CyclingTips",
    url: "https://cyclingtips.com/feed/",
    subtopics: ["Racing", "Grand Tours", "Gear"],
  },
  {
    topic: "Cycling",
    source: "Cycling Weekly",
    url: "https://www.cyclingweekly.com/feed",
    subtopics: ["Racing", "Gear"],
    region: "uk",
    enabled: false,
    note: "Returns HTTP 200 but no items.",
  },

  // ---------------------------------------------------------------------
  // Esports
  // ---------------------------------------------------------------------
  {
    topic: "Esports",
    source: "Dexerto",
    url: "https://www.dexerto.com/feed/",
    subtopics: ["Tournaments", "Teams", "Players"],
    region: "uk",
  },
  {
    topic: "Esports",
    source: "Esports Insider",
    url: "https://esportsinsider.com/feed",
    subtopics: ["Industry", "Tournaments"],
    region: "uk",
  },
  {
    topic: "Esports",
    source: "HLTV",
    url: "https://www.hltv.org/rss/news",
    subtopics: ["Tournaments", "Teams"],
  },
  {
    topic: "Esports",
    source: "Esports News UK",
    url: "https://esports-news.co.uk/feed/",
    subtopics: ["Tournaments", "Teams"],
    region: "uk",
  },
  {
    topic: "Esports",
    source: "Dot Esports",
    url: "https://dotesports.com/feed",
    subtopics: ["Tournaments", "Players"],
    enabled: false,
    note: "Returns HTTP 200 but no items.",
  },

  // ---------------------------------------------------------------------
  // Outdoors
  // ---------------------------------------------------------------------
  {
    topic: "Outdoors",
    source: "Outside",
    url: "https://www.outsideonline.com/feed/",
    subtopics: ["Hiking", "Camping", "Climbing"],
    region: "us",
  },
  {
    topic: "Outdoors",
    source: "Alpinist",
    url: "https://www.alpinist.com/feed",
    subtopics: ["Climbing"],
    region: "us",
  },
  {
    topic: "Outdoors",
    source: "Nomadic Matt",
    url: "https://www.nomadicmatt.com/feed/",
    subtopics: ["Hiking"],
    enabled: false,
    note: "Newest item 77.9 days old (2026-10-14).",
  },
];

/**
 * Stable, human-readable identifier for one source.
 *
 * The same publisher appears many times in this registry under different
 * topics (The Guardian has 14 feeds), so a report line that says only
 * "The Guardian" is ambiguous. This derives a deterministic id from the feed
 * URL — which is the one thing here that is verified, unique and does not
 * change between runs — rather than inventing a parallel name to maintain.
 *
 *   https://www.theguardian.com/world/rss      → guardian-world
 *   https://feeds.bbci.co.uk/news/world/rss.xml → bbc-world
 */
export function sourceId(feed: Pick<FeedConfig, "id" | "url">): string {
  if (feed.id) return feed.id;
  try {
    const url = new URL(feed.url);
    const host = url.hostname
      .toLowerCase()
      .replace(/^(?:www|feeds|feed)\./, "")
      .replace(/\.(?:com|org|net|co\.uk|io|co|uk|in|eu|gov)$/, "");
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/\.(?:xml|rss|atom|cms|php3?|html?)$/i, ""))
      .filter((segment) => segment && !/^(rss|feed|atom|index|news)$/i.test(segment))
      .slice(0, 2);
    const slug = [host, ...segments].join("-");
    return slug.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  } catch {
    return feed.url.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  }
}

/** Feeds actually fetched on a run. */
export const ENABLED_FEEDS: FeedConfig[] = FEEDS.filter(
  (feed) => feed.enabled !== false,
);

/** Distinct topics that have at least one enabled feed. */
export function feedsByTopic(feeds: FeedConfig[] = FEEDS): Map<string, FeedConfig[]> {
  const map = new Map<string, FeedConfig[]>();
  for (const feed of feeds) {
    const group = map.get(feed.topic);
    if (group) group.push(feed);
    else map.set(feed.topic, [feed]);
  }
  return map;
}
