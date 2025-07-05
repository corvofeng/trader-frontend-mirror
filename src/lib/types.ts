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

export const regionalColorConfigs: Record<string, RegionalColorConfig> = {
  US: { upColor: '#26a69a', downColor: '#ef5350' }, // 美国：绿涨红跌
  CN: { upColor: '#ef5350', downColor: '#26a69a' }, // 中国：红涨绿跌
  EU: { upColor: '#26a69a', downColor: '#ef5350' }, // 欧洲：绿涨红跌
  JP: { upColor: '#ef5350', downColor: '#26a69a' }, // 日本：红涨绿跌
  GB: { upColor: '#26a69a', downColor: '#ef5350' }  // 英国：绿涨红跌
};

export function formatCurrency(amount: number, config: CurrencyConfig): string {
  const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  });

  return config.position === 'before'
    ? `${config.symbol}${formattedNumber}`
    : `${formattedNumber}${config.symbol}`;
}