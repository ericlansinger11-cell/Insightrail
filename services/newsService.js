const STOCK_METADATA = require("../data/stockMetadata");

const NEWS_API_KEY = process.env.NEWS_API_KEY;

const BLOCKED_DOMAINS = [
  "screenrant.com",
  "billboard.com",
  "thebiglead.com",
  "twit.tv"
];

function getMeta(ticker) {
  const upper = ticker.toUpperCase();

  return STOCK_METADATA[upper] || {
    companyName: upper,
    aliases: [upper],
    negativeTerms: []
  };
}

function buildQuery(ticker) {
  const upper = ticker.toUpperCase();
  const meta = getMeta(upper);

  const strongTerms = [
    `"${meta.companyName}"`,
    `"${upper}"`,
    ...meta.aliases.map(alias => `"${alias}"`)
  ];

  const negatives = meta.negativeTerms.map(term => `NOT "${term}"`);

  return `(${strongTerms.join(" OR ")}) AND (stock OR shares OR earnings OR revenue OR analyst OR market OR nasdaq OR nyse OR investors) ${negatives.join(" ")}`.trim();
}

function scoreArticle(article, ticker, meta) {
  const upper = ticker.toUpperCase();
  const title = (article.title || "").toLowerCase();
  const desc = (article.description || "").toLowerCase();
  const source = (article.source?.name || "").toLowerCase();
  const full = `${title} ${desc}`;

  let score = 0;

  if (title.includes(meta.companyName.toLowerCase())) score += 10;
  if (desc.includes(meta.companyName.toLowerCase())) score += 6;

  if (title.includes(upper.toLowerCase())) score += 12;
  if (desc.includes(upper.toLowerCase())) score += 7;

  for (const alias of meta.aliases) {
    const a = alias.toLowerCase();
    if (title.includes(a)) score += 5;
    if (desc.includes(a)) score += 3;
  }

  const financeWords = [
    "stock",
    "shares",
    "earnings",
    "revenue",
    "analyst",
    "investor",
    "market",
    "guidance",
    "nasdaq",
    "wall street",
    "price target",
    "quarter",
    "etf"
  ];

  for (const word of financeWords) {
    if (full.includes(word)) score += 2;
  }

  for (const badTerm of meta.negativeTerms) {
    if (full.includes(badTerm.toLowerCase())) score -= 20;
  }

  if (
    source.includes("screen rant") ||
    source.includes("billboard") ||
    source.includes("the big lead") ||
    source.includes("twit")
  ) {
    score -= 25;
  }

  return score;
}

function isRelevantArticle(article, ticker, meta) {
  const upper = ticker.toUpperCase();
  const title = (article.title || "").toLowerCase();
  const desc = (article.description || "").toLowerCase();
  const full = `${title} ${desc}`;

  const hasCoreMatch =
    title.includes(meta.companyName.toLowerCase()) ||
    desc.includes(meta.companyName.toLowerCase()) ||
    title.includes(upper.toLowerCase()) ||
    desc.includes(upper.toLowerCase()) ||
    meta.aliases.some(alias => title.includes(alias.toLowerCase()) || desc.includes(alias.toLowerCase()));

  const hasFinanceContext =
    full.includes("stock") ||
    full.includes("shares") ||
    full.includes("earnings") ||
    full.includes("revenue") ||
    full.includes("analyst") ||
    full.includes("investor") ||
    full.includes("market") ||
    full.includes("nasdaq") ||
    full.includes("price target") ||
    full.includes("quarter");

  return hasCoreMatch && hasFinanceContext;
}

async function fetchRelevantNews(ticker) {
  if (!NEWS_API_KEY) {
    throw new Error("NEWS_API_KEY is missing from .env");
  }

  const upper = ticker.toUpperCase();
  const meta = getMeta(upper);
  const query = buildQuery(upper);

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&searchIn=title,description&language=en&sortBy=relevancy&pageSize=30`;

  const response = await fetch(url, {
    headers: {
      "X-Api-Key": NEWS_API_KEY
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "NewsAPI request failed");
  }

  if (!data.articles || !Array.isArray(data.articles)) {
    return [];
  }

  const filtered = data.articles
    .filter(article => {
      const articleUrl = (article.url || "").toLowerCase();
      return !BLOCKED_DOMAINS.some(domain => articleUrl.includes(domain));
    })
    .filter(article => isRelevantArticle(article, upper, meta))
    .map(article => ({
      ...article,
      relevance: scoreArticle(article, upper, meta)
    }))
    .filter(article => article.relevance >= 12)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5)
    .map(article => ({
      title: article.title,
      source: article.source?.name || "Unknown",
      url: article.url,
      publishedAt: article.publishedAt,
      description: article.description,
      relevance: article.relevance
    }));

  return filtered;
}

module.exports = { fetchRelevantNews };