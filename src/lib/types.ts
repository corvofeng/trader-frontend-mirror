export interface CurrencyConfig {
  symbol: string;
  position: 'before' | 'after';
  separator: string;
}

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