const STOCK_METADATA = {
  AAPL: {
    companyName: "Apple",
    aliases: ["Apple Inc", "AAPL", "Tim Cook", "Apple earnings"],
    negativeTerms: [
      "apple fruit",
      "apple recipe",
      "tv shows",
      "oscars",
      "madonna",
      "season 2",
      "streaming",
      "movie",
      "watch"
    ]
  },
  TSLA: {
    companyName: "Tesla",
    aliases: ["Tesla Inc", "TSLA", "Elon Musk", "Tesla earnings"],
    negativeTerms: ["nikola tesla"]
  },
  MSFT: {
    companyName: "Microsoft",
    aliases: ["Microsoft Corp", "MSFT", "Satya Nadella", "Microsoft earnings"],
    negativeTerms: []
  },
  NVDA: {
    companyName: "NVIDIA",
    aliases: ["Nvidia Corp", "NVDA", "Jensen Huang", "Nvidia earnings"],
    negativeTerms: []
  },
  AMZN: {
    companyName: "Amazon",
    aliases: ["Amazon.com", "AMZN", "AWS", "Andy Jassy", "Amazon earnings"],
    negativeTerms: ["rainforest", "river"]
  },
  META: {
    companyName: "Meta",
    aliases: ["Meta Platforms", "META", "Facebook parent", "Mark Zuckerberg"],
    negativeTerms: []
  },
  GOOGL: {
    companyName: "Google",
    aliases: ["Alphabet", "GOOGL", "GOOG", "Sundar Pichai", "Alphabet earnings"],
    negativeTerms: []
  },
  SPY: {
    companyName: "S&P 500",
    aliases: ["SPY", "SPDR S&P 500 ETF", "S&P 500 ETF"],
    negativeTerms: []
  }
};

module.exports = STOCK_METADATA;