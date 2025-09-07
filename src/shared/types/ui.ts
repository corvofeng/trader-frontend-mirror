// UI and Theme Types
export type Theme = 'light' | 'dark' | 'blue';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  card: string;
  cardHover: string;
  input: string;
  border: string;
  chart: {
    upColor: string;
    downColor: string;
    gridColor: string;
    crosshairColor: string;
  };
}

// Currency Types
export interface CurrencyConfig {
  symbol: string;
  position: 'before' | 'after';
  separator: string;
  region: 'US' | 'CN' | 'EU' | 'JP' | 'GB';
}

export interface RegionalColorConfig {
  upColor: string;
  downColor: string;
}