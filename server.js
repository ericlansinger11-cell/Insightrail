const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const API_KEY = 'HLaWIwqgorCAyVlFSUWY59fGXIX5eDMY';
const POLYGON_URL = 'https://api.polygon.io';

app.use(express.static('public'));
app.use(express.json());

const portfolio = {
  AAPL: { shares: 10, costPerShare: 200 },
  MSFT: { shares: 5, costPerShare: 350 },
  SPY: { shares: 20, costPerShare: 450 }
};

const priceCache = {};
const chartCache = {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateRating(ticker, price, costPerShare, pnlPercent) {
  let score = 0;
  let reasons = [];

  const pnlScore = Math.max(-1, Math.min(1, pnlPercent / 30));
  score += pnlScore * 0.5;

  if (pnlPercent > 25) reasons.push('✅ Excellent gains');
  else if (pnlPercent > 10) reasons.push('📈 Solid performance');
  else if (pnlPercent < -15) reasons.push('❌ Underperforming');

  const priceVsCost = (price - costPerShare) / costPerShare;
  const valueScore = Math.max(-1, Math.min(1, priceVsCost));
  score += valueScore * 0.3;

  if (priceVsCost > 0.25) reasons.push('📈 Strong appreciation');

  const positionValue = price * 10;
  if (positionValue > 4000) {
    score -= 0.2;
    reasons.push('⚠️ Large position');
  }

  let rating;
  let confidence;

  if (score >= 0.45) {
    rating = '🟢 BUY';
    confidence = Math.min(95, 82 + Math.floor(score * 15));
    reasons.push('🎯 High conviction');
  } else if (score >= 0.1) {
    rating = '🟡 HOLD';
    confidence = Math.min(85, 68 + Math.floor(score * 12));
    reasons.push('⚖️ Monitor position');
  } else {
    rating = '🔴 SELL';
    confidence = Math.min(92, 75 + Math.floor(Math.abs(score) * 18));
    reasons.push('🚨 Reduce exposure');
  }

  return {
    rating,
    confidence: `${confidence}%`,
    score: score.toFixed(2),
    reasons,
    stable: true
  };
}

async function fetchPreviousClose(ticker) {
  if (
    priceCache[ticker] &&
    Date.now() - priceCache[ticker].timestamp < 5 * 60 * 1000
  ) {
    return priceCache[ticker].data;
  }

  const response = await fetch(
    `${POLYGON_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${API_KEY}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Polygon stock request failed for ${ticker}: ${response.status} ${errorBody}`
    );
  }

  const data = await response.json();

  if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`No price data for ${ticker}`);
  }

  const latest = data.results[data.results.length - 1];
  const result = {
    ticker,
    price: latest.c
  };

  priceCache[ticker] = {
    data: result,
    timestamp: Date.now()
  };

  return result;
}

async function fetchChartData(ticker) {
  if (
    chartCache[ticker] &&
    Date.now() - chartCache[ticker].timestamp < 15 * 60 * 1000
  ) {
    return chartCache[ticker].data;
  }

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 45);

  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];

  const response = await fetch(
    `${POLYGON_URL}/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=asc&apikey=${API_KEY}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Polygon chart request failed for ${ticker}: ${response.status} ${errorBody}`
    );
  }

  const data = await response.json();

  if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`No chart data for ${ticker}`);
  }

  const filtered = data.results.slice(-8);

  const result = {
    ticker,
    points: filtered.map(bar => ({
      time: new Date(bar.t).toLocaleDateString(),
      price: Number(bar.c)
    }))
  };

  chartCache[ticker] = {
    data: result,
    timestamp: Date.now()
  };

  return result;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/stock/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  try {
    const stock = await fetchPreviousClose(ticker);
    const holding = portfolio[ticker];

    const totalCost = holding ? holding.shares * holding.costPerShare : 0;
    const currentValue = holding ? holding.shares * stock.price : 0;
    const pnlPercent =
      holding && totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0;

    const result = {
      ticker,
      price: stock.price.toFixed(2),
      portfolio: holding
        ? {
            shares: holding.shares,
            costPerShare: holding.costPerShare,
            totalCost: totalCost.toFixed(2),
            currentValue: currentValue.toFixed(2),
            pnlPercent: pnlPercent.toFixed(1)
          }
        : null,
      rating: calculateRating(
        ticker,
        stock.price,
        holding?.costPerShare || stock.price,
        pnlPercent
      )
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'API failed',
      details: error.message
    });
  }
});

app.get('/api/chart/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  try {
    const chart = await fetchChartData(ticker);
    res.json(chart);
  } catch (error) {
    res.status(500).json({
      error: 'Chart API failed',
      details: error.message
    });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const tickers = Object.keys(portfolio);
    const results = {};

    for (const ticker of tickers) {
      try {
        const stock = await fetchPreviousClose(ticker);

        await sleep(400);

        const chart = await fetchChartData(ticker);

        const holding = portfolio[ticker];
        const totalCost = holding.shares * holding.costPerShare;
        const currentValue = holding.shares * stock.price;
        const pnlPercent = ((currentValue - totalCost) / totalCost) * 100;

        results[ticker] = {
          ticker,
          price: stock.price.toFixed(2),
          portfolio: {
            shares: holding.shares,
            costPerShare: holding.costPerShare,
            totalCost: totalCost.toFixed(2),
            currentValue: currentValue.toFixed(2),
            pnlPercent: pnlPercent.toFixed(1)
          },
          rating: calculateRating(
            ticker,
            stock.price,
            holding.costPerShare,
            pnlPercent
          ),
          chart: chart.points
        };

        await sleep(400);
      } catch (error) {
        results[ticker] = {
          ticker,
          error: error.message
        };
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Dashboard API failed',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 InsightRail LIVE on port ${port}`);
});