import { ArrowUpCircle, ArrowDownCircle, DollarSign, ArrowUpRight } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';

interface PortfolioPreviewProps {
  theme: Theme;
}

const DEMO_HOLDINGS = [
  {
    stock_code: 'AAPL',
    stock_name: 'Apple Inc.',
    current_price: 175.50,
    profit_loss_percentage: 3.08,
  },
  {
    stock_code: 'MSFT',
    stock_name: 'Microsoft Corporation',
    current_price: 338.20,
    profit_loss_percentage: 8.83,
  },
  {
    stock_code: 'NVDA',
    stock_name: 'NVIDIA Corporation',
    current_price: 445.75,
    profit_loss_percentage: 6.06,
  }
];

export function PortfolioPreview({ theme }: PortfolioPreviewProps) {
  return (
    <div className="mb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${themes[theme].text}`}>
            Portfolio Snapshot
          </h2>
          <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70 mt-1`}>
            Track position performance and unrealized PnL across assets
          </p>
        </div>
        <InternalLink
          to="/journal?tab=portfolio"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
          title="Access detailed portfolio analytics and performance metrics"
        >
          <span>View Full Portfolio</span>
          <ArrowUpRight className="w-4 h-4" />
        </InternalLink>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DEMO_HOLDINGS.map((holding) => (
          <div
            key={holding.stock_code}
            className={`${themes[theme].card} rounded-2xl p-6 border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-200 shadow-md hover:shadow-lg`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className={`text-xl font-bold font-mono tracking-wide ${themes[theme].text}`}>
                  {holding.stock_code}
                </h3>
                <p className={`text-xs ${themes[theme].text} opacity-70 mt-0.5`}>
                  {holding.stock_name}
                </p>
              </div>
              <div className={`p-2 rounded-xl ${holding.profit_loss_percentage >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                {holding.profit_loss_percentage >= 0 ? (
                  <ArrowUpCircle className="w-5 h-5" />
                ) : (
                  <ArrowDownCircle className="w-5 h-5" />
                )}
              </div>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200/50 dark:border-zinc-800/80">
              <div className={`text-sm font-mono ${themes[theme].text} opacity-80 flex items-center`}>
                <DollarSign className="w-3.5 h-3.5 mr-0.5 opacity-60" />
                {holding.current_price.toFixed(2)}
              </div>
              <div className={`text-base font-bold font-mono ${
                holding.profit_loss_percentage >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}