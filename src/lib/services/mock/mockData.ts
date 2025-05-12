import { format, subDays, addHours, addMinutes } from 'date-fns';
import type { Operation } from '../types';

export const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'demo@example.com',
  name: 'Demo User',
  created_at: '2023-01-01T00:00:00Z'
};

export const MOCK_STOCKS = [
  { stock_code: 'AAPL', stock_name: 'Apple Inc.' },
  { stock_code: 'GOOGL', stock_name: 'Alphabet Inc.' },
  { stock_code: 'MSFT', stock_name: 'Microsoft Corporation' },
  { stock_code: 'AMZN', stock_name: 'Amazon.com Inc.' },
  { stock_code: 'META', stock_name: 'Meta Platforms Inc.' },
  { stock_code: 'TSLA', stock_name: 'Tesla Inc.' },
  { stock_code: 'NVDA', stock_name: 'NVIDIA Corporation' },
  { stock_code: 'JPM', stock_name: 'JPMorgan Chase & Co.' },
  { stock_code: 'V', stock_name: 'Visa Inc.' },
  { stock_code: 'JNJ', stock_name: 'Johnson & Johnson' }
];

export const mockHoldings = [
  {
    stock_code: 'AAPL',
    quantity: 100,
    average_price: 150.00,
    current_price: 175.00,
    total_value: 17500.00,
    profit_loss: 2500.00,
    profit_loss_percentage: 16.67
  },
  {
    stock_code: 'GOOGL',
    quantity: 50,
    average_price: 2800.00,
    current_price: 2900.00,
    total_value: 145000.00,
    profit_loss: 5000.00,
    profit_loss_percentage: 3.57
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