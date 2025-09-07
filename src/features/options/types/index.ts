// Options-specific types
export interface OptionsCalculatorPosition {
  id: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

export interface OptionsFilters {
  status: 'all' | 'open' | 'closed' | 'expired';
  expiry: string;
  strategy?: string;
}

export type OptionsViewMode = 'expiry' | 'strategy';