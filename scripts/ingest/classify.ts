/**
 * Deterministic topic + subtopic classification.
 *
 * The stored `topic_tag` comes from the FEED CONFIG, never from the model.
 * That is what makes category balancing real: the per-run allocator balances
 * by feed topic, so if the model were allowed to reassign topics afterwards
 * the balancing would be undone. It also removes a whole class of silent
 * misclassification (the model used to pick from all 46 labels).
 *
 * Subtopics are resolved the same deterministic way:
 *   1. a feed that covers exactly one subtopic keeps it (ESPNcricinfo → Cricket)
 *   2. otherwise ordered keyword rules run over the title
 *   3. otherwise the feed's first declared subtopic
 *   4. otherwise "General"
 *
 * Step 3/4 is the "safe fallback rather than silently misclassifying" path.
 */
import { TOPIC_LABELS } from "./schema";

/** Used when a feed declares a topic outside the canonical vocabulary. */
export const FALLBACK_TOPIC = "Society";

const KNOWN_TOPICS = new Set<string>(TOPIC_LABELS);

/**
 * Returns `topic` unchanged when it is canonical, otherwise the documented
 * fallback. Callers log the mismatch so a bad feed config is visible in the
 * run report instead of quietly landing in the wrong category.
 */
export function resolveTopic(topic: string): string {
  return KNOWN_TOPICS.has(topic) ? topic : FALLBACK_TOPIC;
}

/** Subtopic vocabulary per canonical topic (first entry is the default). */
export const SUBTOPIC_LABELS: Record<string, readonly string[]> = {
  AI: ["Models", "Research", "Products", "Policy", "Funding", "General"],
  Technology: ["Industry", "Hardware", "Software", "Policy", "Reviews", "General"],
  Gadgets: ["Hardware", "Phones", "Computers", "Reviews", "Wearables", "General"],
  Programming: ["Developer tools", "Languages", "Web", "Open source", "Practices", "General"],
  Startups: ["Funding", "Founders", "Venture", "Exits", "General"],
  Cybersecurity: ["Breaches", "Vulnerabilities", "Privacy", "Policy", "Research", "General"],
  Apps: ["Android", "iOS", "Updates", "Reviews", "General"],
  Science: ["Research", "Discoveries", "Chemistry", "Breakthroughs", "General"],
  Space: ["Missions", "Astronomy", "Launches", "Satellites", "General"],
  Physics: ["Research", "Particles", "Quantum", "Materials", "General"],
  Biology: ["Genetics", "Ecology", "Evolution", "Research", "General"],
  Medicine: ["Clinical trials", "Pharma", "Public health", "Devices", "General"],
  Health: ["Public health", "Nutrition", "Wellness", "Policy", "General"],
  Psychology: ["Research", "Behaviour", "Mental health", "General"],
  Fitness: ["Training", "Nutrition", "Running", "Cycling", "General"],
  Business: ["Companies", "Strategy", "Workplace", "Economy", "General"],
  Markets: ["Stocks", "Earnings", "Bonds", "Commodities", "General"],
  Finance: ["Banking", "Fintech", "Investing", "Policy", "General"],
  Economy: ["Macro", "Policy", "Trade", "Inflation", "General"],
  Crypto: ["Bitcoin", "Ethereum", "DeFi", "Regulation", "General"],
  "Real Estate": ["Housing", "Commercial", "Property market", "Policy", "General"],
  "Personal Finance": ["Saving", "Investing", "Taxes", "Budgeting", "General"],
  Jobs: ["Hiring", "Careers", "Workplace", "Skills", "General"],
  India: ["National", "Politics", "Business", "Society", "General"],
  World: ["Geopolitics", "Diplomacy", "Conflicts", "Elections", "General"],
  Politics: ["Elections", "Policy", "Courts", "Government", "General"],
  Education: ["Higher education", "Schools", "Policy", "Research", "General"],
  Law: ["Courts", "Regulation", "Rights", "Corporate", "General"],
  Environment: ["Climate", "Energy", "Conservation", "Wildlife", "Policy", "General"],
  Society: ["Communities", "Inequality", "Culture", "Policy", "General"],
  Media: ["Journalism", "Publishing", "Platforms", "Business", "General"],
  Culture: ["Arts", "Heritage", "Ideas", "Events", "General"],
  Film: ["Releases", "Reviews", "Streaming", "Box office", "Industry", "General"],
  Music: ["New releases", "Reviews", "Industry", "Live", "General"],
  Books: ["New releases", "Reviews", "Fiction", "Non-fiction", "Industry", "Ideas", "General"],
  Fashion: ["Runway", "Style", "Industry", "Sustainability", "General"],
  Food: ["Recipes", "Restaurants", "Culture", "Nutrition", "General"],
  Travel: ["Destinations", "Guides", "Airlines", "Culture", "General"],
  Art: ["Exhibitions", "Artists", "Market", "Reviews", "General"],
  Gaming: [
    "PlayStation",
    "Xbox",
    "Nintendo",
    "PC",
    "Mobile",
    "Releases",
    "Reviews",
    "Updates",
    "Esports",
    "Industry",
    "General",
  ],
  Sports: [
    "Cricket",
    "Football",
    "Formula 1",
    "Tennis",
    "Badminton",
    "Chess",
    "Basketball",
    "Athletics",
    "Esports",
    "General",
  ],
  Cricket: ["Matches", "T20", "ODI", "Test", "Players", "General"],
  Football: ["Transfers", "Premier League", "Champions League", "International", "General"],
  Motorsport: ["Formula 1", "MotoGP", "Rally", "Teams", "General"],
  Cycling: ["Racing", "Grand Tours", "Gear", "General"],
  Esports: ["Tournaments", "Teams", "Players", "Industry", "General"],
  Outdoors: ["Hiking", "Climbing", "Camping", "Gear", "General"],
};

interface SubtopicRule {
  subtopic: string;
  pattern: RegExp;
}

/**
 * Ordered rules per topic — the FIRST match wins, so more specific patterns
 * must come first (Cricket before Football before Formula 1).
 */
const RULES: Record<string, SubtopicRule[]> = {
  Sports: [
    { subtopic: "Cricket", pattern: /\b(cricket|test match|one-day|t20|ipl|wicket|ashes|bcci)\b/i },
    { subtopic: "Football", pattern: /\b(football|soccer|premier league|la liga|serie a|bundesliga|uefa|fifa|goalkeeper|striker)\b/i },
    { subtopic: "Formula 1", pattern: /\b(formula 1|f1|grand prix|motogp|nascar|rally|motorsport)\b/i },
    { subtopic: "Tennis", pattern: /\b(tennis|wimbledon|atp|wta|us open|australian open|roland garros|djokovic)\b/i },
    { subtopic: "Badminton", pattern: /\b(badminton|bwf|shuttlecock)\b/i },
    { subtopic: "Chess", pattern: /\b(chess|grandmaster|fide|carlsen|checkmate)\b/i },
    { subtopic: "Basketball", pattern: /\b(basketball|nba|euroleague|wnba)\b/i },
    { subtopic: "Esports", pattern: /\b(esports?|valorant|dota|league of legends|counter-strike|cs2)\b/i },
    { subtopic: "Athletics", pattern: /\b(athletics|marathon|olympic|olympics|sprinter|triathlon)\b/i },
  ],
  Cricket: [
    { subtopic: "T20", pattern: /\b(t20|ipl|big bash|hundred)\b/i },
    { subtopic: "ODI", pattern: /\b(odi|one-day|world cup)\b/i },
    { subtopic: "Test", pattern: /\b(test match|test series|ashes|red ball)\b/i },
    { subtopic: "Players", pattern: /\b(injur|retire|signs|contract|appointed|squad|draft)\b/i },
  ],
  Football: [
    { subtopic: "Transfers", pattern: /\b(transfer|signs|signing|loan|deal|bid|move to)\b/i },
    { subtopic: "Champions League", pattern: /\b(champions league|uefa|europa league)\b/i },
    { subtopic: "Premier League", pattern: /\b(premier league|epl|arsenal|liverpool|manchester|chelsea|tottenham)\b/i },
    { subtopic: "International", pattern: /\b(world cup|euro 20|nations league|friendly|qualifier)\b/i },
  ],
  Motorsport: [
    { subtopic: "Formula 1", pattern: /\b(formula 1|f1|grand prix|verstappen|hamilton|ferrari|red bull racing)\b/i },
    { subtopic: "MotoGP", pattern: /\b(motogp|motorbike|motorcycle racing)\b/i },
    { subtopic: "Rally", pattern: /\b(rally|wrc|dakar)\b/i },
    { subtopic: "Teams", pattern: /\b(team|driver|contract|signed|engine)\b/i },
  ],
  Gaming: [
    { subtopic: "PlayStation", pattern: /\b(playstation|ps5|ps4|sony interactive|dual sense|dualsense)\b/i },
    { subtopic: "Xbox", pattern: /\b(xbox|series x|series s|game pass|microsoft gaming)\b/i },
    { subtopic: "Nintendo", pattern: /\b(nintendo|switch 2|mario|zelda|pokemon|pokémon)\b/i },
    // Plural-tolerant: "mobile games" must not fall through to General.
    { subtopic: "Mobile", pattern: /\b(mobile games?|ios games?|android games?|gacha|app store)\b/i },
    { subtopic: "Reviews", pattern: /\b(review|reviews|hands-on|impressions|verdict|rated)\b/i },
    { subtopic: "Releases", pattern: /\b(release date|launches|launch day|out now|now available|delayed|delay|announced)\b/i },
    { subtopic: "Updates", pattern: /\b(patch|update|hotfix|dlc|expansion|season \d)\b/i },
    { subtopic: "Esports", pattern: /\b(esports?|tournament|championship|worlds|major)\b/i },
    { subtopic: "Industry", pattern: /\b(earnings|layoff|acquisition|studio|publisher|revenue|hiring|union)\b/i },
    { subtopic: "PC", pattern: /\b(pc|steam|epic games store|gog|mod|mods|graphics card)\b/i },
  ],
  Esports: [
    { subtopic: "Tournaments", pattern: /\b(tournament|championship|major|worlds|finals|playoffs)\b/i },
    { subtopic: "Teams", pattern: /\b(team|roster|org|signed|transfer|coach)\b/i },
    { subtopic: "Players", pattern: /\b(player|pro|retire|banned|suspended)\b/i },
    { subtopic: "Industry", pattern: /\b(revenue|sponsor|league|prize|invest)\b/i },
  ],
  AI: [
    { subtopic: "Models", pattern: /\b(model|gpt|claude|gemini|llama|mistral|benchmark|parameters)\b/i },
    { subtopic: "Products", pattern: /\b(launch|releases?|app|assistant|chatbot|api|feature)\b/i },
    { subtopic: "Research", pattern: /\b(research|paper|study|arxiv|scientists|training|dataset)\b/i },
    { subtopic: "Policy", pattern: /\b(regulat|policy|law|eu ai act|copyright|lawsuit|safety|governance)\b/i },
    { subtopic: "Funding", pattern: /\b(raise[sd]?|funding|valuation|series [a-e]|investment)\b/i },
  ],
  Cybersecurity: [
    { subtopic: "Breaches", pattern: /\b(breach|hacked|leak|exposed|stolen|ransomware)\b/i },
    { subtopic: "Vulnerabilities", pattern: /\b(vulnerabilit|cve-|exploit|zero-day|patch|flaw)\b/i },
    { subtopic: "Privacy", pattern: /\b(privacy|surveillance|data protection|gdpr|tracking)\b/i },
    { subtopic: "Policy", pattern: /\b(regulat|law|government|policy|sanction|indict)\b/i },
    { subtopic: "Research", pattern: /\b(research|report|study|malware|campaign|apt)\b/i },
  ],
  Crypto: [
    { subtopic: "Bitcoin", pattern: /\bbitcoin\b|\bbtc\b/i },
    { subtopic: "Ethereum", pattern: /\bethereum\b|\beth\b|solana|defi/i },
    { subtopic: "DeFi", pattern: /\b(defi|stablecoin|dex|liquidity|yield)\b/i },
    { subtopic: "Regulation", pattern: /\b(sec|regulat|law|ban|etf|court|approval)\b/i },
  ],
  Markets: [
    { subtopic: "Stocks", pattern: /\b(stock|shares|index|nasdaq|dow|sensex|nifty|equit)/i },
    { subtopic: "Earnings", pattern: /\b(earnings|quarter|profit|revenue|results|guidance)\b/i },
    { subtopic: "Bonds", pattern: /\b(bond|yield|treasury|debt)\b/i },
    { subtopic: "Commodities", pattern: /\b(oil|gold|copper|commodit|crude)\b/i },
  ],
  Economy: [
    { subtopic: "Inflation", pattern: /\b(inflation|cpi|prices|cost of living)\b/i },
    { subtopic: "Policy", pattern: /\b(central bank|rate|fed|rbi|fiscal|budget|tax)\b/i },
    { subtopic: "Trade", pattern: /\b(trade|tariff|export|import|deal)\b/i },
    { subtopic: "Macro", pattern: /\b(gdp|growth|unemployment|jobs report|recession)\b/i },
  ],
  Space: [
    { subtopic: "Missions", pattern: /\b(mission|rover|crew|astronaut|spacecraft|probe)\b/i },
    { subtopic: "Launches", pattern: /\b(launch|rocket|falcon|starship|lift-off|liftoff|payload)\b/i },
    { subtopic: "Satellites", pattern: /\b(satellite|orbit|constellation|starlink)\b/i },
    { subtopic: "Astronomy", pattern: /\b(telescope|galaxy|exoplanet|nebula|james webb|hubble|black hole)\b/i },
  ],
  Film: [
    { subtopic: "Box office", pattern: /\b(box office|opening weekend|gross|earnings)\b/i },
    { subtopic: "Reviews", pattern: /\b(review|reviews|critics|rating)\b/i },
    { subtopic: "Streaming", pattern: /\b(streaming|netflix|disney\+|prime video|hbo|max|apple tv)\b/i },
    { subtopic: "Releases", pattern: /\b(release|trailer|teaser|premiere|first look|greenlit)\b/i },
    { subtopic: "Industry", pattern: /\b(studio|acquisition|writer|director|casting|award)\b/i },
  ],
  Music: [
    { subtopic: "New releases", pattern: /\b(album|single|release|debut|ep\b)\b/i },
    { subtopic: "Reviews", pattern: /\b(review|reviews|critic)\b/i },
    { subtopic: "Live", pattern: /\b(tour|concert|festival|live|gig)\b/i },
    { subtopic: "Industry", pattern: /\b(label|streaming|royalt|charts|award)\b/i },
  ],
  Books: [
    { subtopic: "Reviews", pattern: /\b(review|reviews|critic)\b/i },
    { subtopic: "Non-fiction", pattern: /\b(memoir|biography|history|essay|non-fiction)\b/i },
    { subtopic: "Fiction", pattern: /\b(novel|fiction|fantasy|thriller|short story)\b/i },
    { subtopic: "New releases", pattern: /\b(publishes|release|new book|debut)\b/i },
  ],
  Politics: [
    { subtopic: "Elections", pattern: /\b(election|vote|ballot|campaign|poll)\b/i },
    { subtopic: "Courts", pattern: /\b(court|judge|ruling|supreme|trial)\b/i },
    { subtopic: "Policy", pattern: /\b(policy|bill|law|reform|budget|legislation)\b/i },
    { subtopic: "Government", pattern: /\b(government|minister|parliament|congress|senate|president)\b/i },
  ],
  Environment: [
    { subtopic: "Climate", pattern: /\b(climate|emission|warming|temperature|carbon)\b/i },
    { subtopic: "Energy", pattern: /\b(energy|solar|wind|renewable|nuclear|grid)\b/i },
    { subtopic: "Wildlife", pattern: /\b(wildlife|species|extinct|animal|bird|marine|ocean)\b/i },
    { subtopic: "Conservation", pattern: /\b(conserv\w*|forest|protected|habitat|pollution|plastic)\b/i },
  ],
  World: [
    { subtopic: "Conflicts", pattern: /\b(war|attack|strike|military|conflict|troops|ceasefire)\b/i },
    { subtopic: "Elections", pattern: /\b(election|vote|referendum)\b/i },
    { subtopic: "Diplomacy", pattern: /\b(summit|talks|treaty|diplomat|minister visit|sanction)\b/i },
    { subtopic: "Geopolitics", pattern: /\b(geopolit|bilateral|border|alliance|nato|brics)\b/i },
  ],
  India: [
    { subtopic: "Politics", pattern: /\b(parliament|minister|lok sabha|rajya sabha|bjp|congress|election|modi)\b/i },
    { subtopic: "Business", pattern: /\b(gst|rbi|rupee|economy|budget|sensex|nifty|startup)\b/i },
    { subtopic: "Society", pattern: /\b(protest|caste|women|education|health|court)\b/i },
    { subtopic: "National", pattern: /\b(state|district|police|scheme|government)\b/i },
  ],
  Health: [
    { subtopic: "Public health", pattern: /\b(outbreak|virus|vaccine|disease|cdc|who|infection|measles)\b/i },
    { subtopic: "Nutrition", pattern: /\b(diet|nutrition|food|vitamin|sugar|calorie)\b/i },
    { subtopic: "Policy", pattern: /\b(policy|insurance|medicare|hospital|cost|coverage)\b/i },
    { subtopic: "Wellness", pattern: /\b(sleep|stress|wellbeing|wellness|mental)\b/i },
  ],
  Medicine: [
    { subtopic: "Clinical trials", pattern: /\b(trial|phase \d|placebo|efficacy|fda approv)\b/i },
    { subtopic: "Pharma", pattern: /\b(drug|pharma|treatment|therapy|dose|vaccine)\b/i },
    { subtopic: "Devices", pattern: /\b(device|implant|scan|screening|diagnos)\b/i },
    { subtopic: "Public health", pattern: /\b(outbreak|public health|epidemic|prevention)\b/i },
  ],
  Fitness: [
    { subtopic: "Running", pattern: /\b(run|marathon|5k|10k|jog|race)\b/i },
    { subtopic: "Cycling", pattern: /\b(cycl|bike|bicycle|peloton)\b/i },
    { subtopic: "Nutrition", pattern: /\b(nutrition|protein|diet|supplement|hydration)\b/i },
    { subtopic: "Training", pattern: /\b(workout|training|strength|exercise|recovery|gym)\b/i },
  ],
  Technology: [
    { subtopic: "Reviews", pattern: /\b(review|hands-on|first look)\b/i },
    { subtopic: "Policy", pattern: /\b(regulat|antitrust|law|court|privacy|policy)\b/i },
    { subtopic: "Hardware", pattern: /\b(chip|semiconductor|processor|hardware|device|silicon)\b/i },
    { subtopic: "Software", pattern: /\b(software|app|platform|update|os\b|browser)\b/i },
    { subtopic: "Industry", pattern: /\b(company|acquisition|layoff|revenue|market|partnership)\b/i },
  ],
  Gadgets: [
    { subtopic: "Reviews", pattern: /\b(review|hands-on|first look|benchmark)\b/i },
    { subtopic: "Phones", pattern: /\b(phone|iphone|pixel|galaxy|smartphone)\b/i },
    { subtopic: "Computers", pattern: /\b(laptop|macbook|pc\b|desktop|processor|gpu)\b/i },
    { subtopic: "Wearables", pattern: /\b(watch|buds|headphone|earbud|ring|wearable)\b/i },
    { subtopic: "Hardware", pattern: /\b(device|camera|monitor|keyboard|chip)\b/i },
  ],
  Programming: [
    { subtopic: "Open source", pattern: /\b(open source|github|license|maintainer|fork)\b/i },
    { subtopic: "Languages", pattern: /\b(rust|python|javascript|typescript|go\b|java|ruby|c\+\+)\b/i },
    { subtopic: "Web", pattern: /\b(css|html|react|next\.js|browser|frontend|api)\b/i },
    { subtopic: "Developer tools", pattern: /\b(compiler|debugger|ide|cli|toolkit|framework)\b/i },
    { subtopic: "Practices", pattern: /\b(test|refactor|code review|performance|architecture)\b/i },
  ],
  Apps: [
    { subtopic: "Android", pattern: /\b(android|play store|pixel|samsung)\b/i },
    { subtopic: "iOS", pattern: /\b(ios|iphone|ipad|app store|apple)\b/i },
    { subtopic: "Updates", pattern: /\b(update|release|version|beta|rollout)\b/i },
    { subtopic: "Reviews", pattern: /\b(review|hands-on|best apps)\b/i },
  ],
  Startups: [
    { subtopic: "Funding", pattern: /\b(raise[sd]?|funding|seed|series [a-e]|valuation|round)\b/i },
    { subtopic: "Exits", pattern: /\b(acqui|ipo|merger|shutdown|wound down)\b/i },
    { subtopic: "Founders", pattern: /\b(founder|ceo|entrepreneur|co-founder)\b/i },
    { subtopic: "Venture", pattern: /\b(venture|vc\b|investor|backer|accelerator)\b/i },
  ],
  Business: [
    { subtopic: "Workplace", pattern: /\b(layoff|hiring|union|return to office|workers)\b/i },
    { subtopic: "Strategy", pattern: /\b(strategy|expansion|partnership|reorgani|merger)\b/i },
    { subtopic: "Companies", pattern: /\b(company|firm|revenue|profit|acquisition|ceo)\b/i },
    { subtopic: "Economy", pattern: /\b(economy|market|demand|inflation)\b/i },
  ],
  Science: [
    { subtopic: "Research", pattern: /\b(study|research|scientists|findings|journal)\b/i },
    { subtopic: "Breakthroughs", pattern: /\b(breakthrough|first-ever|discover|new species|record)\b/i },
    { subtopic: "Chemistry", pattern: /\b(chemistr|molecule|catalyst|material)\b/i },
    { subtopic: "Discoveries", pattern: /\b(fossil|ancient|excavat|archaeolog)\b/i },
  ],
  Physics: [
    { subtopic: "Quantum", pattern: /\b(quantum|qubit|entangle|superposition)\b/i },
    { subtopic: "Particles", pattern: /\b(particle|neutrino|cern|collider|boson|atom)\b/i },
    { subtopic: "Materials", pattern: /\b(material|superconduct|graphene|lattice|semiconductor)\b/i },
    { subtopic: "Research", pattern: /\b(study|research|physics|experiment|theor)\b/i },
  ],
  Biology: [
    { subtopic: "Genetics", pattern: /\b(gene|genom|dna|crispr|mutation|rna)\b/i },
    { subtopic: "Ecology", pattern: /\b(ecosystem|species|habitat|population|marine)\b/i },
    { subtopic: "Evolution", pattern: /\b(evolution|ancestor|fossil|adapted)\b/i },
    { subtopic: "Research", pattern: /\b(study|research|biolog|cell|protein)\b/i },
  ],
  Psychology: [
    { subtopic: "Mental health", pattern: /\b(depress|anxiety|therapy|mental health|adhd|autism)\b/i },
    { subtopic: "Behaviour", pattern: /\b(behaviou?r|decision|bias|habit|motivation)\b/i },
    { subtopic: "Research", pattern: /\b(study|research|psycholog|participants|brain)\b/i },
  ],
  Culture: [
    { subtopic: "Arts", pattern: /\b(art|museum|gallery|exhibit|theatre)\b/i },
    { subtopic: "Heritage", pattern: /\b(heritage|historic|archaeolog|tradition|monument)\b/i },
    { subtopic: "Ideas", pattern: /\b(essay|philosoph|debate|ideas|book)\b/i },
    { subtopic: "Events", pattern: /\b(festival|season|opening|anniversary)\b/i },
  ],
  Art: [
    { subtopic: "Exhibitions", pattern: /\b(exhibit|show|retrospective|biennale|museum)\b/i },
    { subtopic: "Market", pattern: /\b(auction|sale|price|collector|market)\b/i },
    { subtopic: "Artists", pattern: /\b(artist|painter|sculptor|studio|practice)\b/i },
    { subtopic: "Reviews", pattern: /\b(review|critic|profile)\b/i },
  ],
  Media: [
    { subtopic: "Journalism", pattern: /\b(journalis|newsroom|reporter|press|editor)\b/i },
    { subtopic: "Platforms", pattern: /\b(platform|social media|algorithm|google|meta|x\b|tiktok)\b/i },
    { subtopic: "Business", pattern: /\b(revenue|subscri|layoff|merger|deal)\b/i },
    { subtopic: "Publishing", pattern: /\b(publish|magazine|newspaper|broadcast)\b/i },
  ],
  Law: [
    { subtopic: "Courts", pattern: /\b(court|judge|ruling|verdict|lawsuit|appeal)\b/i },
    { subtopic: "Regulation", pattern: /\b(regulat|rule|compliance|enforcement|fine)\b/i },
    { subtopic: "Rights", pattern: /\b(rights|constitution|liberty|discriminat)\b/i },
    { subtopic: "Corporate", pattern: /\b(merger|antitrust|contract|patent|corporate)\b/i },
  ],
  Education: [
    { subtopic: "Higher education", pattern: /\b(university|college|campus|tuition|degree|student loan)\b/i },
    { subtopic: "Schools", pattern: /\b(school|teacher|classroom|pupil|k-12)\b/i },
    { subtopic: "Policy", pattern: /\b(policy|reform|funding|curriculum|minister)\b/i },
    { subtopic: "Research", pattern: /\b(study|research|report|data)\b/i },
  ],
  Society: [
    { subtopic: "Inequality", pattern: /\b(inequalit|poverty|wealth gap|homeless|discriminat)\b/i },
    { subtopic: "Communities", pattern: /\b(community|neighbou?rhood|civic|volunteer|local)\b/i },
    { subtopic: "Policy", pattern: /\b(policy|government|welfare|benefit|reform)\b/i },
    { subtopic: "Culture", pattern: /\b(culture|religion|identity|migration|demograph)\b/i },
  ],
  Fashion: [
    { subtopic: "Runway", pattern: /\b(runway|fashion week|collection|couture|show)\b/i },
    { subtopic: "Style", pattern: /\b(style|trend|outfit|wardrobe|stylist)\b/i },
    { subtopic: "Sustainability", pattern: /\b(sustainab|ethic|resale|circular|material)\b/i },
    { subtopic: "Industry", pattern: /\b(brand|label|retail|designer|revenue)\b/i },
  ],
  Food: [
    { subtopic: "Recipes", pattern: /\b(recipe|how to cook|bake|ingredient|dish)\b/i },
    { subtopic: "Restaurants", pattern: /\b(restaurant|chef|menu|dining|michelin|opening)\b/i },
    { subtopic: "Nutrition", pattern: /\b(nutrition|diet|health|calorie)\b/i },
    { subtopic: "Culture", pattern: /\b(cuisine|tradition|food culture|street food)\b/i },
  ],
  Travel: [
    { subtopic: "Destinations", pattern: /\b(destination|guide|best places|itinerary|where to)\b/i },
    { subtopic: "Airlines", pattern: /\b(airline|flight|airport|route|aviation)\b/i },
    { subtopic: "Guides", pattern: /\b(tips|advice|how to|budget travel|packing)\b/i },
    { subtopic: "Culture", pattern: /\b(culture|local|food|festival|historic)\b/i },
  ],
  "Real Estate": [
    { subtopic: "Housing", pattern: /\b(home|house|housing|rent|mortgage|apartment)\b/i },
    { subtopic: "Property market", pattern: /\b(price|market|demand|sales|inventory)\b/i },
    { subtopic: "Commercial", pattern: /\b(commercial|office|retail space|industrial)\b/i },
    { subtopic: "Policy", pattern: /\b(policy|tax|regulat|zoning|affordable)\b/i },
  ],
  "Personal Finance": [
    { subtopic: "Investing", pattern: /\b(invest|portfolio|mutual fund|sip|equity|retirement)\b/i },
    { subtopic: "Taxes", pattern: /\b(tax|deduction|filing|irs|returns)\b/i },
    { subtopic: "Saving", pattern: /\b(sav|emergency fund|interest rate|deposit)\b/i },
    { subtopic: "Budgeting", pattern: /\b(budget|spend|debt|credit card|loan)\b/i },
  ],
  Finance: [
    { subtopic: "Banking", pattern: /\b(bank|lender|deposit|branch|npa|credit)\b/i },
    { subtopic: "Fintech", pattern: /\b(fintech|payment|upi|wallet|neobank)\b/i },
    { subtopic: "Investing", pattern: /\b(invest|fund|asset|portfolio|capital)\b/i },
    { subtopic: "Policy", pattern: /\b(regulat|rbi|central bank|policy|rate)\b/i },
  ],
  Jobs: [
    { subtopic: "Hiring", pattern: /\b(hiring|recruit|vacanc|job opening|layoff)\b/i },
    { subtopic: "Careers", pattern: /\b(career|promotion|interview|resume|salary)\b/i },
    { subtopic: "Workplace", pattern: /\b(remote|hybrid|office|manager|culture)\b/i },
    { subtopic: "Skills", pattern: /\b(skill|training|upskill|certification|learning)\b/i },
  ],
  Cycling: [
    { subtopic: "Grand Tours", pattern: /\b(tour de france|giro|vuelta|grand tour)\b/i },
    { subtopic: "Racing", pattern: /\b(race|stage|peloton|sprint|classic)\b/i },
    { subtopic: "Gear", pattern: /\b(bike|gear|helmet|groupset|review)\b/i },
  ],
  Outdoors: [
    { subtopic: "Hiking", pattern: /\b(hik|trail|trek|backpack)\b/i },
    { subtopic: "Climbing", pattern: /\b(climb|mountaineer|summit|alpine)\b/i },
    { subtopic: "Camping", pattern: /\b(camp|tent|sleeping bag|park)\b/i },
    { subtopic: "Gear", pattern: /\b(gear|review|jacket|boot|tested)\b/i },
  ],
};

function findRule(topic: string, title: string): string | null {
  const rules = RULES[topic];
  if (!rules) return null;
  for (const rule of rules) {
    if (rule.pattern.test(title)) return rule.subtopic;
  }
  return null;
}

/** True when the topic has a subtopic vocabulary to classify against. */
export function hasSubtopicRules(topic: string): boolean {
  return (RULES[topic]?.length ?? 0) > 0;
}

/**
 * Deterministic subtopic for one article.
 *
 * A feed that declares exactly one subtopic is authoritative for it (that is
 * why ESPNcricinfo is always "Cricket" even for an article whose headline
 * happens to mention football). Everything else goes through the ordered
 * keyword rules, then falls back to the feed's primary subtopic, then
 * "General".
 */
export function classifySubtopic(
  topic: string,
  title: string,
  feedSubtopics: readonly string[] = [],
): string {
  const declared = feedSubtopics.filter(Boolean);
  if (declared.length === 1) return declared[0];

  const matched = findRule(topic, title ?? "");
  if (matched) {
    // Trust a rule only when it is part of this topic's vocabulary, so a rule
    // list that drifts from SUBTOPIC_LABELS cannot invent a new label.
    const vocabulary = SUBTOPIC_LABELS[topic];
    if (!vocabulary || vocabulary.includes(matched)) return matched;
  }

  if (declared.length > 0) return declared[0];
  return "General";
}
