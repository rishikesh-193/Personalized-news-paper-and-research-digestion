import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Atom,
  Bitcoin,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  Car,
  Clapperboard,
  Code,
  Coins,
  Cpu,
  Drama,
  Dna,
  Dumbbell,
  Flag,
  FlaskConical,
  Gamepad2,
  Gavel,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Megaphone,
  MonitorPlay,
  Music,
  Palette,
  Plane,
  Rocket,
  Scale,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Stethoscope,
  Telescope,
  Timer,
  TrendingUp,
  Trophy,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wine,
} from "lucide-react";

export interface TopicTile {
  label: string;
  icon: LucideIcon;
}

export interface TopicGroup {
  label: string;
  tiles: TopicTile[];
}

/** Spotify-style grouped tiles for /onboarding step 1 (6 groups, 6–12 tiles each). */
export const TOPIC_GROUPS: TopicGroup[] = [
  {
    label: "Technology",
    tiles: [
      { label: "AI", icon: Sparkles },
      { label: "Technology", icon: Cpu },
      { label: "Gadgets", icon: Smartphone },
      { label: "Programming", icon: Code },
      { label: "Startups", icon: Rocket },
      { label: "Cybersecurity", icon: ShieldCheck },
      { label: "Apps", icon: MonitorPlay },
    ],
  },
  {
    label: "Science & Health",
    tiles: [
      { label: "Science", icon: FlaskConical },
      { label: "Space", icon: Telescope },
      { label: "Physics", icon: Atom },
      { label: "Biology", icon: Dna },
      { label: "Medicine", icon: Stethoscope },
      { label: "Health", icon: HeartPulse },
      { label: "Psychology", icon: Brain },
      { label: "Fitness", icon: Dumbbell },
    ],
  },
  {
    label: "Business & Money",
    tiles: [
      { label: "Business", icon: Briefcase },
      { label: "Markets", icon: TrendingUp },
      { label: "Finance", icon: Wallet },
      { label: "Economy", icon: Landmark },
      { label: "Crypto", icon: Bitcoin },
      { label: "Real Estate", icon: Building2 },
      { label: "Personal Finance", icon: Coins },
      { label: "Jobs", icon: Activity },
    ],
  },
  {
    label: "World & Society",
    tiles: [
      { label: "World", icon: Globe },
      { label: "Politics", icon: Scale },
      { label: "Education", icon: GraduationCap },
      { label: "Law", icon: Gavel },
      { label: "Environment", icon: Leaf },
      { label: "Society", icon: Flag },
      { label: "Media", icon: Tv },
    ],
  },
  {
    label: "Culture & Lifestyle",
    tiles: [
      { label: "Culture", icon: Drama },
      { label: "Film", icon: Clapperboard },
      { label: "Music", icon: Music },
      { label: "Books", icon: BookOpen },
      { label: "Fashion", icon: Shirt },
      { label: "Food", icon: UtensilsCrossed },
      { label: "Travel", icon: Plane },
      { label: "Art", icon: Palette },
      { label: "Gaming", icon: Gamepad2 },
    ],
  },
  {
    label: "Sports",
    tiles: [
      { label: "Sports", icon: Trophy },
      { label: "Cricket", icon: Timer },
      { label: "Football", icon: Megaphone },
      { label: "Motorsport", icon: Car },
      { label: "Cycling", icon: Wine },
      { label: "Esports", icon: Gamepad2 },
      { label: "Outdoors", icon: Globe },
    ],
  },
];

/**
 * Every topic label the UI offers, flattened from the grouped tiles in
 * display order. This is the canonical topic vocabulary: the onboarding
 * tiles, the /settings interest chips, and the ingestion feed labels in
 * scripts/ingest/feeds.ts must all agree with it (feeds.ts imports these
 * labels), so a topic a reader picks is a topic that has sources.
 */
export const ALL_TOPICS: string[] = TOPIC_GROUPS.flatMap((group) =>
  group.tiles.map((tile) => tile.label),
).filter((label, index, labels) => labels.indexOf(label) === index);

/** Case-insensitive membership test against the canonical topic list. */
export function isKnownTopic(topic: string): boolean {
  const needle = topic.trim().toLowerCase();
  return ALL_TOPICS.some((label) => label.toLowerCase() === needle);
}

/** Suggested sub-topics for step 2, keyed by lowercased topic label. */
const SUBTOPIC_SUGGESTIONS: Record<string, string[]> = {
  ai: ["LLMs", "Robotics", "Research papers", "Agents", "Open source", "Safety"],
  technology: [
    "Hardware",
    "Software",
    "Developer tools",
    "Reviews",
    "Privacy",
    "Industry news",
  ],
  science: [
    "Research papers",
    "Discoveries",
    "Physics",
    "Biology",
    "Chemistry",
    "Breakthroughs",
  ],
  space: ["NASA", "Rockets", "Astronomy", "Missions", "Telescopes", "Satellites"],
  business: [
    "Entrepreneurship",
    "Strategy",
    "Workplace",
    "Small business",
    "Leadership",
    "Marketing",
  ],
  markets: ["Stocks", "Earnings", "Bonds", "Commodities", "Analysis", "IPOs"],
  crypto: ["Bitcoin", "Ethereum", "DeFi", "Regulation", "Mining", "Web3"],
  health: ["Nutrition", "Sleep", "Mental health", "Fitness", "Longevity", "Research"],
  medicine: ["Clinical trials", "Pharma", "Public health", "Devices", "Policy"],
  world: ["Geopolitics", "Diplomacy", "Conflicts", "Elections", "Global economy"],
  politics: ["Elections", "Policy", "Courts", "Local", "Opinion"],
  climate: ["Policy", "Energy", "Weather", "Conservation", "Technology"],
  environment: ["Conservation", "Pollution", "Wildlife", "Sustainability", "Oceans"],
  film: ["Releases", "Reviews", "Streaming", "Box office", "Interviews"],
  music: ["New releases", "Reviews", "Industry", "Live shows", "Genres"],
  books: ["New releases", "Reviews", "Fiction", "Non-fiction", "Authors"],
  gaming: ["Releases", "Esports", "Hardware", "Reviews", "Indie"],
  sports: ["Scores", "Transfers", "Analysis", "Features", "Fixtures"],
  football: ["Transfers", "Premier League", "Champions League", "Fixtures", "Analysis"],
  cricket: ["Test cricket", "ODI", "T20", "IPL", "Fixtures"],
  finance: ["Budgeting", "Investing", "Taxes", "Saving", "Debt"],
  "personal finance": ["Budgeting", "Investing", "Saving", "Taxes", "Money mindset"],
  jobs: ["Hiring trends", "Remote work", "Career growth", "Interviews", "Salaries"],
};

const GENERIC_SUGGESTIONS = [
  "Latest news",
  "Deep dives",
  "Beginners",
  "Analysis",
  "Expert picks",
];

/** 4–6 suggested sub-topics for a chosen topic (falls back to generic pills). */
export function subtopicSuggestionsFor(topic: string): string[] {
  return SUBTOPIC_SUGGESTIONS[topic.trim().toLowerCase()] ?? GENERIC_SUGGESTIONS;
}
