require("dotenv").config();
const express = require("express");
const path = require("path");
const { fetchRelevantNews } = require("./services/newsService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const portfolio = {
  AAPL: { shares: 10, costPerShare: 200 },
  MSFT: { shares: 5, costPerShare: 350 },
  SPY: { shares: 20, costPerShare: 450 }
};

const chartCache = new Map();
const stockCache = new Map();

const STOCK_TTL = 60 * 1000;
const CHART_TTL = 5 * 60 * 1000;

function getCached(map, key, ttl) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(map, key, data) {
  map.set(key, {
    data,
    timestamp: Date.now()
  });
}

function calculateRating(ticker, price, costPerShare, pnlPercent) {
  let score = 0;
  let reasons = [];

  const pnlScore = Math.max(-1, Math.min(1, pnlPercent / 30));
  score += pnlScore * 0.5;

  if (pnlPercent > 25) reasons.push("✅ Excellent gains");
  else if (pnlPercent > 10) reasons.push("📈 Solid performance");
  else if (pnlPercent < -15) reasons.push("❌ Underperforming");

  const priceVsCost = (price - costPerShare) / costPerShare;
  const valueScore = Math.max(-1, Math.min(1, priceVsCost));
  score += valueScore * 0.3;

  if (priceVsCost > 0.25) reasons.push("📈 Strong appreciation");

  const positionValue = price * 10;
  if (positionValue > 4000) {
    score -= 0.2;
    reasons.push("⚠️ Large position");
  }

  let rating, confidence;

  if (score >= 0.45) {
    rating = "🟢 BUY";
    confidence = Math.min(95, 82 + Math.floor(score * 15));
    reasons.push("🎯 High conviction");
  } else if (score >= 0.1) {
    rating = "🟡 HOLD";
    confidence = Math.min(85, 68 + Math.floor(score * 12));
    reasons.push("⚖️ Monitor position");
  } else {
    rating = "🔴 SELL";
    confidence = Math.min(92, 75 + Math.floor(Math.abs(score) * 18));
    reasons.push("🚨 Reduce exposure");
  }

  return {
    rating,
    confidence: `${confidence}%`,
    score: score.toFixed(2),
    reasons,
    stable: true
  };
}

async function fetchPrevStock(ticker) {
  const cached = getCached(stockCache, ticker, STOCK_TTL);
  if (cached) return cached;

  const response = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || "Failed to fetch stock data");
  }

  setCached(stockCache, ticker, data);
  return data;
}

async function fetchChartData(ticker, range) {
  // Map range to {multiplier, timespan, from, to, limit}
  const now = new Date();
  let from, multiplier = 1, timespan = 'day', limit = 7, fetchDays = 14;
  if (range === '7d') {
    fetchDays = 14; // fetch 2x to cover weekends/holidays
    limit = 7;
  } else if (range === '1m') {
    fetchDays = 45;
    limit = 30;
  } else if (range === '3m') {
    fetchDays = 120;
    limit = 90;
  } else {
    fetchDays = 14;
    limit = 7;
  }
  from = new Date(now.getTime() - fetchDays * 24 * 60 * 60 * 1000);
  const to = now;
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  // Cache key includes range
  const cacheKey = `${ticker}_${range}`;
  const cached = getCached(chartCache, cacheKey, CHART_TTL);
  if (cached) return cached;

  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=120&apiKey=${process.env.POLYGON_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "Failed to fetch chart data");
  }
  // Only keep the last N trading days
  if (data.results && Array.isArray(data.results)) {
    data.results = data.results.slice(-limit);
  }
  setCached(chartCache, cacheKey, data);
  return data;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const data = await fetchPrevStock(ticker);
    res.json(data);
  } catch (error) {
    console.error("Stock route error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/chart/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const range = req.query.range || '7d';
    const data = await fetchChartData(ticker, range);
    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ error: 'No chart data' });
    }
    const points = data.results.map(bar => ({
      time: new Date(bar.t).toLocaleDateString(),
      price: bar.c
    }));
    res.json({ points });
  } catch (error) {
    console.error("Chart route error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/news/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    let articles = await fetchRelevantNews(ticker);
    // Add default neutral sentiment if missing
    articles = articles.map(article => ({
      ...article,
      sentiment: { label: "Neutral" }
    }));
    res.json({
      articles,
      summary: articles.length > 0 ? `Top news for ${ticker}` : "No news found."
    });
  } catch (error) {
    console.error("News route error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dashboard", async (req, res) => {
  const { ticker } = req.query;
  const results = {};
  const tickers = ticker ? [ticker.toUpperCase()] : Object.keys(portfolio);
  for (const t of tickers) {
    try {
      const stockData = await fetchPrevStock(t);
      if (stockData.results && stockData.results.length > 0) {
        const latest = stockData.results[0];
        const price = latest.c;
        const holding = portfolio[t];
        const totalCost = holding.shares * holding.costPerShare;
        const currentValue = holding.shares * price;
        const pnlPercent = ((currentValue - totalCost) / totalCost) * 100;
        results[t] = {
          ticker: t,
          price: price.toFixed(2),
          portfolio: {
            shares: holding.shares,
            costPerShare: holding.costPerShare,
            totalCost: totalCost.toFixed(2),
            currentValue: currentValue.toFixed(2),
            pnlPercent: pnlPercent.toFixed(1)
          },
          rating: calculateRating(t, price, holding.costPerShare, pnlPercent)
        };
      } else {
        results[t] = { error: "No price data" };
      }
    } catch (error) {
      console.error(`Dashboard error for ${t}:`, error.message);
      results[t] = { error: error.message };
    }
  }
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`🚀 InsightRail running at http://localhost:${PORT}`);
});