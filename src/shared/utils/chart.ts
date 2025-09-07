import type { StockData } from '../types';

export function isValidDataPoint(item: StockData): boolean {
  return (
    typeof item.open === 'number' && !isNaN(item.open) &&
    typeof item.high === 'number' && !isNaN(item.high) &&
    typeof item.low === 'number' && !isNaN(item.low) &&
    typeof item.close === 'number' && !isNaN(item.close) &&
    typeof item.volume === 'number' && !isNaN(item.volume) &&
    item.date != null &&
    item.open !== 0 && item.high !== 0 && item.low !== 0 && item.close !== 0
  );
}

export function generateMockStockData(symbol: string, days: number = 252): StockData[] {
  const data: StockData[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let currentPrice = 100 + Math.random() * 400;
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    
    const dailyChange = (Math.random() - 0.5) * 0.04;
    const open = currentPrice;
    const close = open * (1 + dailyChange);
    
    const minPrice = Math.min(open, close);
    const maxPrice = Math.max(open, close);
    const high = maxPrice + Math.random() * (maxPrice * 0.02);
    const low = minPrice - Math.random() * (minPrice * 0.02);
    
    data.push({
      date: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 10000000) + 1000000
    });
    
    currentPrice = close;
  }
  
  return data;
}