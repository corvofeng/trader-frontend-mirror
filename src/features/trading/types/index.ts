// Trading-specific types
export interface TradeFormData {
  stockCode: string;
  stockName: string;
  operation: 'buy' | 'sell';
  targetPrice: string;
  quantity: string;
  notes: string;
}

export interface TradeListFilters {
  status: 'all' | 'pending' | 'completed' | 'cancelled';
  stockCode?: string;
}

export type ChartType = 'candlestick' | 'line' | 'bar';