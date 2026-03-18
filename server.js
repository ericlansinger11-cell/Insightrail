const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

// ROOT ROUTE
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/public.html'));
});

const API_KEY = 'HLaWIwqgorCAyVlFSUWY59fGXIX5eDMY';
const POLYGON_URL = 'https://api.polygon.io';

// PRICE CACHE (Fixes "no price data")
const priceCache = {};

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
  
  let rating, confidence;
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
  
  return { rating, confidence: `${confidence}%`, score: score.toFixed(2), reasons, stable: true };
}

const portfolio = {
  AAPL: { shares: 10, costPerShare: 200 },
  MSFT: { shares: 5, costPerShare: 350 },
  SPY: { shares: 20, costPerShare: 450 }
};

// SINGLE STOCK (With cache)
app.get('/api/stocks/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  
  if (priceCache[ticker] && Date.now() - priceCache[ticker].timestamp < 60000) {
    return res.json(priceCache[ticker].data);
  }
  
  try {
    const response = await fetch(`${POLYGON_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${API_KEY}`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const latest = data.results[data.results.length - 1];
      const price = latest.c;
      
      const holding = portfolio[ticker];
      const totalCost = holding ? holding.shares * holding.costPerShare : 0;
      const currentValue = holding ? holding.shares * price : 0;
      const pnlPercent = holding ? ((currentValue - totalCost) / totalCost * 100) : 0;
      
      const rating = calculateRating(ticker, price, holding?.costPerShare || price, pnlPercent);
      
      const result = {
        ticker, price: price.toFixed(2), change: 0,
        portfolio: holding ? {
          shares: holding.shares, costPerShare: holding.costPerShare,
          totalCost: totalCost.toFixed(2), currentValue: currentValue.toFixed(2),
          pnlPercent: pnlPercent.toFixed(1)
        } : null,
        rating
      };
      
      priceCache[ticker] = { data: result, timestamp: Date.now() };
      res.json(result);
    } else {
      res.json({ error: 'No price data' });
    }
  } catch (error) {
    res.status(500).json({ error: 'API failed' });
  }
});

// FULL PORTFOLIO
app.get('/api/portfolio', async (req, res) => {
  const results = {};
  for (const ticker of Object.keys(portfolio)) {
    try {
      const response = await fetch(`${POLYGON_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${API_KEY}`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const latest = data.results[data.results.length - 1];
        const price = latest.c;
        const holding = portfolio[ticker];
        const totalCost = holding.shares * holding.costPerShare;
        const currentValue = holding.shares * price;
        const pnlPercent = ((currentValue - totalCost) / totalCost * 100);
        
        results[ticker] = {
          price: price.toFixed(2),
          shares: holding.shares,
          pnlPercent: pnlPercent.toFixed(1),
          ...calculateRating(ticker, price, holding.costPerShare, pnlPercent)
        };
      }
    } catch (error) {
      results[ticker] = { error: error.message };
    }
  }
  res.json(results);
});

app.listen(port, () => {
  console.log(`🚀 InsightRail LIVE: http://localhost:${port}`);
});