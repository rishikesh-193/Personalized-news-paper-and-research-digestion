export interface Article {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO date, YYYY-MM-DD
  topic: string;
  readTime: number; // minutes
  summaryBullets: string[];
  whyItMatters: string;
}

export interface LibraryItem {
  id: string;
  type: "article" | "document";
  title: string;
  source: string;
  savedOn: string; // ISO date
  excerpt: string;
}

export interface Citation {
  n: number;
  title: string;
  source: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export const topics = [
  "AI",
  "Technology",
  "Business",
  "Science",
  "World",
  "Climate",
  "Health",
];

export const defaultInterests = ["AI", "Science", "Climate", "Business"];

export const articles: Article[] = [
  {
    id: "a1",
    title: "Small models are closing the gap on everyday reasoning",
    source: "Signal Desk",
    publishedAt: "2026-10-06",
    topic: "AI",
    readTime: 6,
    summaryBullets: [
      "Distilled 7B models now match last year's flagship scores on common reasoning benchmarks.",
      "Teams report running whole pipelines on a single workstation instead of renting GPU time.",
      "Researchers caution that gains still shrink on long, multi-step tasks.",
    ],
    whyItMatters:
      "Cheaper inference puts capable models on more devices — and changes what an AI feature costs to run.",
  },
  {
    id: "a2",
    title: "Open leaderboards are quietly reshaping release-day decisions",
    source: "The Current",
    publishedAt: "2026-10-05",
    topic: "AI",
    readTime: 5,
    summaryBullets: [
      "Labs are delaying launches to climb public rankings instead of shipping on fixed calendars.",
      "Three of last quarter's biggest releases landed within 48 hours of a new benchmark appearing.",
      "Critics say chasing ranks rewards narrow tuning over broad usefulness.",
    ],
    whyItMatters:
      "Release timing will feel less predictable, and leaderboard scores will keep showing up in marketing.",
  },
  {
    id: "a3",
    title: "Repair rules push a major maker to publish spare-part schematics",
    source: "Circuit Review",
    publishedAt: "2026-10-05",
    topic: "Technology",
    readTime: 4,
    summaryBullets: [
      "Board schematics for last year's laptops are now open to any repair shop.",
      "Independent shops estimate fixes will cost about a third less once parts become ordinary stock.",
      "Batteries and displays stay under a separate licensing program.",
    ],
    whyItMatters:
      "Repairability stops being a slogan and starts being a supply chain.",
  },
  {
    id: "a4",
    title: "Rate-cut bets lift mid-cap stocks into October",
    source: "Market Ledger",
    publishedAt: "2026-10-06",
    topic: "Business",
    readTime: 3,
    summaryBullets: [
      "Mid-caps posted their best weekly inflow since spring as traders priced in another cut.",
      "Retail brokers saw new account sign-ups climb for a second straight week.",
      "Strategists warn the rally assumes a soft landing that isn't guaranteed.",
    ],
    whyItMatters:
      "If the cut lands as expected, borrowing costs for smaller firms ease first.",
  },
  {
    id: "a5",
    title: "A quieter way to watch a sleeping brain",
    source: "Science Desk",
    publishedAt: "2026-10-04",
    topic: "Science",
    readTime: 7,
    summaryBullets: [
      "A flexible ear-shaped sensor records neural activity without electrodes on the scalp.",
      "In early trials it scored sleep stages as accurately as a full lab hookup.",
      "The team is testing whether the same patch can follow recovery after seizures.",
    ],
    whyItMatters:
      "Sleep studies could move from the clinic to the bedroom — with data doctors can actually use.",
  },
  {
    id: "a6",
    title: "Small states push a rulebook for the deep sea",
    source: "World Review",
    publishedAt: "2026-10-05",
    topic: "World",
    readTime: 5,
    summaryBullets: [
      "A coalition of island states called for a pause on mining licenses until shared rules exist.",
      "Two companies hold exploratory rights covering an area the size of Europe.",
      "Negotiators meet next month with a draft that includes revenue sharing.",
    ],
    whyItMatters:
      "The outcome sets the template for resources no country can claim alone.",
  },
  {
    id: "a7",
    title: "Grid batteries outgrow gas peakers in three major markets",
    source: "Gridline Report",
    publishedAt: "2026-10-04",
    topic: "Climate",
    readTime: 4,
    summaryBullets: [
      "Storage additions beat new peaking plants in California, Texas and South Australia.",
      "Batteries now cover the evening ramp in all three regions for under half the fuel cost.",
      "Permitting queues, not prices, are the bottleneck builders cite most.",
    ],
    whyItMatters:
      "Peak power is becoming an infrastructure story, not a fuel story.",
  },
  {
    id: "a8",
    title: "A ten-minute home test is shrinking the apnea waitlist",
    source: "Vital Signs",
    publishedAt: "2026-10-03",
    topic: "Health",
    readTime: 5,
    summaryBullets: [
      "A home sensor flagged sleep apnea in nine of ten patients later confirmed in the lab.",
      "Clinics report triage times falling from months to under two weeks.",
      "The device is not intended for people with heart or lung conditions.",
    ],
    whyItMatters:
      "Faster screening starts treatment before the condition strains the heart.",
  },
];

export const dailyBriefing = {
  date: "Monday, October 6, 2026",
  paragraphs: [
    "Your edition leans technical today: how cheaper models change what gets built, plus the quarter storage overtook gas peakers in three markets.",
    "Also worth your time: the deep-sea mining coalition meets next month, and a home sleep sensor is already cutting clinic queues.",
  ],
};

export const threeThingsToKnow = [
  "Small models now match last year's flagships on everyday reasoning — and run on a single machine.",
  "Grid batteries beat new gas peakers in California, Texas and South Australia.",
  "Island states want a pause on deep-sea mining licenses until shared rules exist.",
];

export const sampleDigest = {
  fileName: "rag-evaluation-survey.pdf",
  title:
    "Evaluating Retrieval-Augmented Generation: A Survey of Factuality Benchmarks",
  authors: "M. Okafor, L. Chen, S. Ramírez",
  meta: "Preprint · 24 pages · submitted 28 Sep 2026",
  executiveSummary:
    "The paper sorts 17 factuality benchmarks used to evaluate retrieval-augmented generation into four families — citation accuracy, attribute consistency, faithfulness to retrieved passages, and end-to-end answer quality. It finds that most benchmarks grade an answer against a single retrieved document, while real assistants assemble answers from several sources at once, leaving multi-document disagreement largely unmeasured. The authors propose a shared reporting format so results become comparable across papers.",
  keyFindings: [
    "Only 4 of the 17 benchmarks test answers assembled from more than one retrieved document.",
    "Human graders and model graders agree on about 80% of borderline cases; disagreements cluster on hedged claims.",
    "Scores drift with chunking: shifting chunk boundaries by half can move faithfulness by several points.",
    "Nine datasets were refreshed in the past year; the rest risk leaking into training corpora.",
  ],
  statistics: [
    { value: "17", label: "benchmarks reviewed" },
    { value: "61%", label: "grade a single retrieved document only" },
    { value: "4", label: "suit multi-document answers" },
  ],
  limitations: [
    "English-language benchmarks only.",
    "Grader agreement measured on a single 500-item sample.",
    "Commercial suites were read from documentation, not executed.",
  ],
  openQuestions: [
    "How should a system cite when retrieved passages contradict each other?",
    "Can faithfulness scores be made stable across chunking strategies?",
    "What is the right granularity for a claim-level citation?",
  ],
};

export const libraryItems: LibraryItem[] = [
  {
    id: "l1",
    type: "document",
    title:
      "Evaluating Retrieval-Augmented Generation: A Survey of Factuality Benchmarks",
    source: "Preprint · Okafor et al.",
    savedOn: "2026-10-04",
    excerpt:
      "Survey of 17 factuality benchmarks; proposes a shared reporting format for retrieval-augmented evaluations.",
  },
  {
    id: "l2",
    type: "article",
    title: "Small models are closing the gap on everyday reasoning",
    source: "Signal Desk",
    savedOn: "2026-10-06",
    excerpt:
      "Distilled 7B models match last year's flagship scores on common reasoning benchmarks.",
  },
  {
    id: "l3",
    type: "article",
    title: "Grid batteries outgrow gas peakers in three major markets",
    source: "Gridline Report",
    savedOn: "2026-10-04",
    excerpt:
      "Storage additions beat new peaking plants in California, Texas and South Australia this quarter.",
  },
  {
    id: "l4",
    type: "document",
    title: "Scaling laws for small retrieval models: an empirical study",
    source: "Preprint · A. Petrov et al.",
    savedOn: "2026-09-21",
    excerpt:
      "Recall on long documents plateaus earlier for small retrievers; chunk size interacts with the plateau.",
  },
  {
    id: "l5",
    type: "article",
    title: "Open leaderboards are quietly reshaping release-day decisions",
    source: "The Current",
    savedOn: "2026-10-05",
    excerpt:
      "Labs delay launches to climb public rankings rather than shipping on fixed calendars.",
  },
  {
    id: "l6",
    type: "article",
    title: "A quieter way to watch a sleeping brain",
    source: "Science Desk",
    savedOn: "2026-10-04",
    excerpt:
      "A flexible ear-shaped sensor records neural activity without electrodes on the scalp.",
  },
];

export const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "What do my saved papers say about chunk size and evaluation?",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "Both sources agree the numbers move with setup choices as much as with the model. The survey reports that shifting chunk boundaries by half can change faithfulness scores by several points, and the Petrov study found the same pattern for retrieval recall on long documents. Neither recommends a single fixed size — they suggest reporting chunk size alongside any faithfulness metric.",
    citations: [
      {
        n: 1,
        title:
          "Evaluating Retrieval-Augmented Generation: A Survey of Factuality Benchmarks",
        source: "Preprint · Okafor et al.",
      },
      {
        n: 2,
        title: "Scaling laws for small retrieval models: an empirical study",
        source: "Preprint · A. Petrov et al.",
      },
    ],
  },
];

export const cannedReplies: ChatMessage[] = [
  {
    id: "r1",
    role: "assistant",
    content:
      "Across your library the recurring theme is that evaluation numbers depend on the harness as much as the model. The survey recommends publishing chunk size, retrieval depth and grader type next to every faithfulness score so results can be compared.",
    citations: [
      {
        n: 1,
        title:
          "Evaluating Retrieval-Augmented Generation: A Survey of Factuality Benchmarks",
        source: "Preprint · Okafor et al.",
      },
    ],
  },
  {
    id: "r2",
    role: "assistant",
    content:
      "From what you've saved, storage beating gas peakers comes down to the evening ramp: batteries cover it in all three markets for under half the fuel cost, and permitting — not price — is the bottleneck builders name most often.",
    citations: [
      {
        n: 1,
        title: "Grid batteries outgrow gas peakers in three major markets",
        source: "Gridline Report",
      },
    ],
  },
  {
    id: "r3",
    role: "assistant",
    content:
      "Your saved reading points the same way: distilled models handle everyday tasks at a fraction of the inference cost, but gains still narrow on long, multi-step work — so the honest claim is 'cheaper', not 'equivalent'.",
    citations: [
      {
        n: 1,
        title: "Small models are closing the gap on everyday reasoning",
        source: "Signal Desk",
      },
      {
        n: 2,
        title: "Open leaderboards are quietly reshaping release-day decisions",
        source: "The Current",
      },
    ],
  },
];

export const askSuggestions = [
  "Summarize my paper on RAG evaluation",
  "What changed in small models this week?",
  "Which of my sources cover batteries?",
];

export const currentUser = {
  name: "Alex Rivera",
  email: "alex.rivera@example.com",
  initials: "AR",
};

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
