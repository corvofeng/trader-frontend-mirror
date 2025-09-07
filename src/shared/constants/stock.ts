// Stock Categories/Sectors
export const STOCK_CATEGORIES = {
  TECH: 'Technology',
  FINANCE: 'Financial Services',
  HEALTHCARE: 'Healthcare',
  CONSUMER: 'Consumer Goods',
  ENERGY: 'Energy',
  INDUSTRIAL: 'Industrial',
  TELECOM: 'Telecommunications',
  MATERIALS: 'Materials'
} as const;

// Mock Stock Data
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
] as const;

// Demo User
export const DEMO_USER_ID = 'mock-user-id';