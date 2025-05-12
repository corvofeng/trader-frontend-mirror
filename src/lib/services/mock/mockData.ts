import { format, subDays, addHours, addMinutes } from 'date-fns';
import { User, Trade, Stock, Holding, StockData } from '../types';

// Define mock user ID as a constant
export const MOCK_USER_ID = 'mock-user-id';

export const MOCK_STOCKS: Stock[] = [
  { stock_code: 'AAPL', stock_name: 'Apple Inc.' },
  { stock_code: 'GOOGL', stock_name: 'Alphabet Inc.' },
  { stock_code: 'MSFT', stock_name: 'Microsoft Corporation' },
  { stock_code: 'AMZN', stock_name: 'Amazon.com Inc.' },
  { stock_code: 'TSLA', stock_name: 'Tesla, Inc.' },
  { stock_code: 'META', stock_name: 'Meta Platforms, Inc.' },
  { stock_code: 'NVDA', stock_name: 'NVIDIA Corporation' },
  { stock_code: 'JPM', stock_name: 'JPMorgan Chase & Co.' },
  { stock_code: 'V', stock_name: 'Visa Inc.' },
  { stock_code: 'JNJ', stock_name: 'Johnson & Johnson' }
];

export const mockUser: User = {
  id: MOCK_USER_ID,
  email: 'demo@example.com',
  avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces',
  name: 'Demo User'
};

function generateTradeNote(operation: 'buy' | 'sell', priceChange: number, strategy: string): string {
  const priceAction = priceChange > 0 ? 'increase' : 'decrease';
  const priceChangeAbs = Math.abs(priceChange).toFixed(2);

  const notes = [
    // Technical Analysis
    `${operation === 'buy' ? 'Accumulated' : 'Reduced'} position based on ${strategy}`,
    `${strategy} signal triggered after ${priceChangeAbs}% price ${priceAction}`,
    `${operation === 'buy' ? 'Bullish' : 'Bearish'} ${strategy} pattern identified`,
    
    // Fundamental Analysis
    'Strong earnings momentum',
    'Positive sector outlook',
    'Market leader in growing segment',
    'Attractive valuation metrics',
    
    // Risk Management
    'Position sizing aligned with portfolio strategy',
    'Risk-reward ratio favorable at current levels',
    'Stop loss placed at key support level',
    
    // Market Context
    'Market conditions favorable for entry',
    'Sector rotation opportunity',
    'Counter-trend opportunity',
    'Momentum-based entry'
  ];

  // Randomly select 2-3 notes and combine them
  const selectedNotes = [];
  const numNotes = Math.floor(Math.random() * 2) + 2; // 2-3 notes
  
  for (let i = 0; i < numNotes; i++) {
    const randomIndex = Math.floor(Math.random() * notes.length);
    selectedNotes.push(notes[randomIndex]);
    notes.splice(randomIndex, 1); // Remove selected note to avoid duplication
  }

  return selectedNotes.join('. ') + '.';
}

// Trading strategies to cycle through
const strategies = [
  'Moving Average Crossover',
  'RSI Divergence',
  'Support/Resistance',
  'Trend Following',
  'Breakout',
  'Mean Reversion',
  'Volume Analysis',
  'Price Action',
  'Chart Pattern'
];

// Function to find potential trade points in stock data
function findTradingPoints(data: StockData[]): { date: string; price: number; operation: 'buy' | 'sell' }[] {
  const tradingPoints: { date: string; price: number; operation: 'buy' | 'sell' }[] = [];
  const lookback = 5; // Number of days to look back for trend

  for (let i = lookback; i < data.length - 1; i++) {
    const currentPrice = data[i].close;
    const previousPrices = data.slice(i - lookback, i).map(d => d.close);
    const nextPrice = data[i + 1].close;
    
    // Calculate average price change
    const priceChanges = previousPrices.map((price, idx) => 
      idx > 0 ? ((price - previousPrices[idx - 1]) / previousPrices[idx - 1]) * 100 : 0
    );
    const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / (lookback - 1);

    // Detect potential trading points based on price movement patterns
    const priceChange = ((currentPrice - previousPrices[0]) / previousPrices[0]) * 100;
    const nextPriceChange = ((nextPrice - currentPrice) / currentPrice) * 100;

    // Buy signals
    if (
      (avgChange < -1 && priceChange < -2 && nextPriceChange > 0) || // Oversold bounce
      (priceChange > 2 && avgChange > 0 && nextPriceChange > 0)      // Momentum continuation
    ) {
      tradingPoints.push({
        date: data[i].date,
        price: currentPrice,
        operation: 'buy'
      });
    }
    // Sell signals
    else if (
      (avgChange > 1 && priceChange > 2 && nextPriceChange < 0) ||   // Overbought reversal
      (priceChange < -2 && avgChange < 0 && nextPriceChange < 0)     // Downtrend continuation
    ) {
      tradingPoints.push({
        date: data[i].date,
        price: currentPrice,
        operation: 'sell'
      });
    }
  }

  return tradingPoints;
}

// Create a mutable object to store the next trade ID
export const tradeIdCounter = {
  value: 1,
  getNextId() {
    return this.value++;
  }
};

export function generateMockTrades(stockData: StockData[]): Trade[] {
  const mockTrades: Trade[] = [];
  
  // Get trading points from demo stock data
  const tradingPoints = findTradingPoints(stockData);

  // Generate trades for each trading point
  tradingPoints.forEach(point => {
    // Select a random stock for variety
    const stock = MOCK_STOCKS[Math.floor(Math.random() * MOCK_STOCKS.length)];
    
    // Calculate price change for note generation
    const priceChange = point.operation === 'buy' ? -2 : 2; // Simplified for note generation
    
    // Select a random strategy
    const strategy = strategies[Math.floor(Math.random() * strategies.length)];

    // Random quantity between 10-50
    const quantity = Math.floor(Math.random() * 40) + 10;

    // Add some time variation within the day
    const baseDate = new Date(point.date);
    const tradeDateTime = addMinutes(
      addHours(baseDate, 9 + Math.floor(Math.random() * 6)), // Random hour between 9 AM and 2 PM
      Math.floor(Math.random() * 60) // Random minute
    );

    mockTrades.push({
      id: tradeIdCounter.getNextId(),
      user_id: mockUser.id,
      stock_code: stock.stock_code,
      stock_name: stock.stock_name,
      operation: point.operation,
      target_price: point.price,
      quantity,
      notes: generateTradeNote(point.operation, priceChange, strategy),
      status: 'completed',
      created_at: format(tradeDateTime, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      updated_at: format(tradeDateTime, "yyyy-MM-dd'T'HH:mm:ss'Z'")
    });
  });

  // Add some pending trades near the current date
  const now = new Date();
  const pendingTrades = [
    {
      id: tradeIdCounter.getNextId(),
      user_id: mockUser.id,
      stock_code: 'AAPL',
      stock_name: 'Apple Inc.',
      operation: 'buy',
      target_price: 175.50,
      quantity: 10,
      notes: 'Waiting for a dip in price. Technical support level identified with increasing volume. RSI showing oversold conditions.',
      status: 'pending',
      created_at: format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      updated_at: format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    },
    {
      id: tradeIdCounter.getNextId(),
      user_id: mockUser.id,
      stock_code: 'NVDA',
      stock_name: 'NVIDIA Corporation',
      operation: 'buy',
      target_price: 880.00,
      quantity: 5,
      notes: 'Strong AI growth potential. Breaking out of consolidation pattern with increasing volume. Sector leadership position strengthening.',
      status: 'pending',
      created_at: format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      updated_at: format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    },
    {
      id: tradeIdCounter.getNextId(),
      user_id: mockUser.id,
      stock_code: 'META',
      stock_name: 'Meta Platforms, Inc.',
      operation: 'sell',
      target_price: 505.00,
      quantity: 12,
      notes: 'Taking profits at resistance level. RSI showing overbought conditions. Volume declining on recent rally.',
      status: 'pending',
      created_at: format(subDays(now, 2), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      updated_at: format(subDays(now, 2), "yyyy-MM-dd'T'HH:mm:ss'Z'")
    }
  ];

  // Add pending trades to the main trades array
  mockTrades.push(...pendingTrades);

  // Sort all trades by date, most recent first
  mockTrades.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return mockTrades;
}

export const mockHoldings: Holding[] = [
  {
    stock_code: 'AAPL',
    stock_name: 'Apple Inc.',
    quantity: 50,
    average_price: 170.25,
    current_price: 175.50,
    total_value: 8775,
    profit_loss: 262.50,
    profit_loss_percentage: 3.08,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'MSFT',
    stock_name: 'Microsoft Corporation',
    quantity: 30,
    average_price: 310.75,
    current_price: 338.20,
    total_value: 10146,
    profit_loss: 823.50,
    profit_loss_percentage: 8.83,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'NVDA',
    stock_name: 'NVIDIA Corporation',
    quantity: 25,
    average_price: 420.30,
    current_price: 445.75,
    total_value: 11143.75,
    profit_loss: 636.25,
    profit_loss_percentage: 6.06,
    last_updated: new Date().toISOString()
  }
];

export interface OptionQuote {
  strike: number;
  expiry: string;
  callPrice: number;
  putPrice: number;
  callVolume: number;
  putVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callImpliedVol: number;
  putImpliedVol: number;
}

export interface OptionSurfacePoint {
  strike: number;
  expiry: string;
  value: number;
  type: 'call' | 'put';
}

function generateOptionData(
  underlyingPrice: number,
  strikes: number[],
  expiryDates: string[]
): { quotes: OptionQuote[], surface: OptionSurfacePoint[] } {
  const quotes: OptionQuote[] = [];
  const surface: OptionSurfacePoint[] = [];
  
  const baseVol = 0.3; // 30% base volatility

  strikes.forEach(strike => {
    expiryDates.forEach(expiry => {
      const daysToExpiry = (new Date(expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      const timeDecay = Math.exp(-0.02 * daysToExpiry / 365);
      const strikeDistance = Math.abs(strike - underlyingPrice) / underlyingPrice;
      
      // Volatility smile effect
      const volSmile = baseVol * (1 + 0.5 * strikeDistance * strikeDistance);
      
      // Time decay and distance effect on option prices
      const callPrice = Math.max(0, (underlyingPrice - strike) * timeDecay + volSmile * underlyingPrice * Math.sqrt(daysToExpiry / 365));
      const putPrice = Math.max(0, (strike - underlyingPrice) * timeDecay + volSmile * underlyingPrice * Math.sqrt(daysToExpiry / 365));

      const volume = Math.floor(1000 * Math.exp(-strikeDistance * 2) * Math.random());
      const openInterest = Math.floor(volume * (2 + Math.random()));

      quotes.push({
        strike,
        expiry,
        callPrice,
        putPrice,
        callVolume: volume,
        putVolume: Math.floor(volume * (0.8 + 0.4 * Math.random())),
        callOpenInterest: openInterest,
        putOpenInterest: Math.floor(openInterest * (0.8 + 0.4 * Math.random())),
        callImpliedVol: volSmile,
        putImpliedVol: volSmile * (0.95 + 0.1 * Math.random())
      });

      surface.push(
        {
          strike,
          expiry,
          value: callPrice,
          type: 'call'
        },
        {
          strike,
          expiry,
          value: putPrice,
          type: 'put'
        }
      );
    });
  });

  return { quotes, surface };
}

// Generate sample option data
const underlyingPrice = 150; // Example price
const strikes = Array.from({ length: 15 }, (_, i) => underlyingPrice * (0.7 + i * 0.04));
const expiryDates = [
  '2024-03-15',
  '2024-04-19',
  '2024-05-17',
  '2024-06-21',
  '2024-07-19',
  '2024-09-20',
  '2024-12-20',
  '2025-01-17'
];

export const MOCK_OPTION_DATA = generateOptionData(underlyingPrice, strikes, expiryDates);