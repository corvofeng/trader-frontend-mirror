import { format, subDays, addHours, addMinutes } from 'date-fns';
import type { Operation, StockConfig } from '../types';

export const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'demo@example.com',
  name: 'Demo User',
  created_at: '2023-01-01T00:00:00Z'
};

// Stock categories/sectors
export const STOCK_CATEGORIES = {
  TECH: 'Technology',
  FINANCE: 'Financial Services',
  HEALTHCARE: 'Healthcare',
  CONSUMER: 'Consumer Goods',
  ENERGY: 'Energy',
  INDUSTRIAL: 'Industrial',
  TELECOM: 'Telecommunications',
  MATERIALS: 'Materials'
};

export const MOCK_STOCKS = [
  { 
    stock_code: 'AAPL', 
    stock_name: 'Apple Inc.',
  },
  { 
    stock_code: 'GOOGL', 
    stock_name: 'Alphabet Inc.',
  },
  { 
    stock_code: 'MSFT', 
    stock_name: 'Microsoft Corporation',
  },
  { 
    stock_code: 'AMZN', 
    stock_name: 'Amazon.com Inc.',
  },
  { 
    stock_code: 'META', 
    stock_name: 'Meta Platforms Inc.',
  },
  { 
    stock_code: 'TSLA', 
    stock_name: 'Tesla Inc.',
  },
  { 
    stock_code: 'NVDA', 
    stock_name: 'NVIDIA Corporation',
  },
  { 
    stock_code: 'JPM', 
    stock_name: 'JPMorgan Chase & Co.',
  },
  { 
    stock_code: 'V', 
    stock_name: 'Visa Inc.',
  },
  { 
    stock_code: 'JNJ', 
    stock_name: 'Johnson & Johnson',
  }
];

export const MOCK_STOCK_CONFIGS: StockConfig[] = [
  { 
    stock_code: 'AAPL',
    category: STOCK_CATEGORIES.TECH,
    tags: ['Consumer Electronics', 'Software', 'Services']
  },
  { 
    stock_code: 'GOOGL',
    category: STOCK_CATEGORIES.TECH,
    tags: ['Internet Services', 'Software', 'AI']
  },
  { 
    stock_code: 'MSFT',
    category: STOCK_CATEGORIES.TECH,
    tags: ['Software', 'Cloud Computing', 'Enterprise']
  },
  { 
    stock_code: 'AMZN',
    category: STOCK_CATEGORIES.CONSUMER,
    tags: ['E-commerce', 'Cloud Computing', 'Streaming']
  },
  { 
    stock_code: 'META',
    category: STOCK_CATEGORIES.TECH,
    tags: ['Social Media', 'VR/AR', 'Advertising']
  },
  { 
    stock_code: 'TSLA',
    category: STOCK_CATEGORIES.CONSUMER,
    tags: ['Electric Vehicles', 'Energy', 'Technology']
  },
  { 
    stock_code: 'NVDA',
    category: STOCK_CATEGORIES.TECH,
    tags: ['Semiconductors', 'AI', 'Gaming']
  },
  { 
    stock_code: 'JPM',
    category: STOCK_CATEGORIES.FINANCE,
    tags: ['Banking', 'Investment Services', 'Financial Technology']
  },
  { 
    stock_code: 'V',
    category: STOCK_CATEGORIES.FINANCE,
    tags: ['Payment Processing', 'Financial Technology']
  },
  { 
    stock_code: 'JNJ',
    category: STOCK_CATEGORIES.HEALTHCARE,
    tags: ['Pharmaceuticals', 'Medical Devices', 'Consumer Health']
  }
];

export const mockHoldings = [
  {
    stock_code: 'AAPL',
    stock_name: 'Apple Inc.',
    quantity: 150,
    average_price: 150.00,
    current_price: 175.00,
    total_value: 26250.00,
    profit_loss: 3750.00,
    profit_loss_percentage: 16.67,
    daily_profit_loss: 450.00,
    daily_profit_loss_percentage: 1.75,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'GOOGL',
    stock_name: 'Alphabet Inc.',
    quantity: 50,
    average_price: 2800.00,
    current_price: 2900.00,
    total_value: 145000.00,
    profit_loss: 5000.00,
    profit_loss_percentage: 3.57,
    daily_profit_loss: -1500.00,
    daily_profit_loss_percentage: -1.02,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'MSFT',
    stock_name: 'Microsoft Corporation',
    quantity: 100,
    average_price: 300.00,
    current_price: 320.00,
    total_value: 32000.00,
    profit_loss: 2000.00,
    profit_loss_percentage: 6.67,
    daily_profit_loss: 800.00,
    daily_profit_loss_percentage: 2.56,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'TSLA',
    stock_name: 'Tesla Inc.',
    quantity: 75,
    average_price: 250.00,
    current_price: 240.00,
    total_value: 18000.00,
    profit_loss: -750.00,
    profit_loss_percentage: -4.00,
    daily_profit_loss: -375.00,
    daily_profit_loss_percentage: -2.04,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'NVDA',
    stock_name: 'NVIDIA Corporation',
    quantity: 80,
    average_price: 400.00,
    current_price: 450.00,
    total_value: 36000.00,
    profit_loss: 4000.00,
    profit_loss_percentage: 12.50,
    daily_profit_loss: 1200.00,
    daily_profit_loss_percentage: 3.45,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'JPM',
    stock_name: 'JPMorgan Chase & Co.',
    quantity: 120,
    average_price: 140.00,
    current_price: 135.00,
    total_value: 16200.00,
    profit_loss: -600.00,
    profit_loss_percentage: -3.57,
    daily_profit_loss: -240.00,
    daily_profit_loss_percentage: -1.46,
    last_updated: new Date().toISOString()
  },
  {
    stock_code: 'JNJ',
    stock_name: 'Johnson & Johnson',
    quantity: 90,
    average_price: 160.00,
    current_price: 165.00,
    total_value: 14850.00,
    profit_loss: 450.00,
    profit_loss_percentage: 3.12,
    daily_profit_loss: 180.00,
    daily_profit_loss_percentage: 1.23,
    last_updated: new Date().toISOString()
  }
];

export const tradeIdCounter = {
  currentId: 1000,
  getNextId: function() {
    return (this.currentId++).toString();
  }
};

export function generateMockOperations(startDate: string, endDate: string): Operation[] {
  const operations: Operation[] = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const numOperations = Math.floor(Math.random() * 5) + 1; // Generate 1-5 operations per day

    for (let i = 0; i < numOperations; i++) {
      const funcNames = ['getStockData', 'getCurrentPrice', 'getTrades', 'createTrade', 'updateTrade'];
      const funcName = funcNames[Math.floor(Math.random() * funcNames.length)];
      const result = Math.random() < 0.9 ? 'success' : 'failed'; // 90% success rate
      const callTime = addMinutes(
        addHours(currentDate, 9 + Math.floor(Math.random() * 7)), // Between 9 AM and 4 PM
        Math.floor(Math.random() * 60)
      );

      operations.push({
        func_name: funcName,
        call_time: callTime.toISOString(),
        result
      });
    }
    currentDate = addHours(currentDate, 24);
  }

  return operations.sort((a, b) => 
    new Date(a.call_time).getTime() - new Date(b.call_time).getTime()
  );
}

export function generateMockTrades(stockData: any[]) {
  const trades = [];
  const numTrades = 20;
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  for (let i = 0; i < numTrades; i++) {
    const tradeDate = new Date(startDate.getTime() + Math.random() * (Date.now() - startDate.getTime()));
    const stockIndex = Math.floor(Math.random() * MOCK_STOCKS.length);
    const stock = MOCK_STOCKS[stockIndex];
    const operation = Math.random() > 0.5 ? 'buy' : 'sell';
    const quantity = Math.floor(Math.random() * 100) + 1;
    const targetPrice = 100 + Math.random() * 900;
    const status = Math.random() > 0.2 ? 'completed' : 'pending';

    trades.push({
      id: tradeIdCounter.getNextId(),
      user_id: mockUser.id,
      stock_code: stock.stock_code,
      operation,
      quantity,
      target_price: targetPrice,
      status,
      notes: `Mock ${operation} trade for ${stock.stock_code}`,
      created_at: tradeDate.toISOString(),
      updated_at: tradeDate.toISOString()
    });
  }

  return trades.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Generate mock option data
export const MOCK_OPTION_DATA = {
  quotes: [
    // Current date plus 30, 60, 90 days for expiries
    ...[30, 60, 90].flatMap(days => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      return [100, 150, 200, 250, 300].map(strike => ({
        expiry: expiry.toISOString(),
        strike,
        callPrice: Math.random() * 10 + 5,
        putPrice: Math.random() * 10 + 5,
        callVolume: Math.floor(Math.random() * 1000),
        putVolume: Math.floor(Math.random() * 1000),
        callOpenInterest: Math.floor(Math.random() * 5000),
        putOpenInterest: Math.floor(Math.random() * 5000),
        callImpliedVol: Math.random() * 0.3 + 0.2,
        putImpliedVol: Math.random() * 0.3 + 0.2
      }));
    })
  ],
  surface: [
    // Generate surface data for visualization
    ...[30, 60, 90].flatMap(days => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      return [100, 150, 200, 250, 300].flatMap(strike => [
        {
          expiry: expiry.toISOString(),
          strike,
          type: 'call',
          value: Math.random() * 10 + 5
        },
        {
          expiry: expiry.toISOString(),
          strike,
          type: 'put',
          value: Math.random() * 10 + 5
        }
      ]);
    })
  ]
};