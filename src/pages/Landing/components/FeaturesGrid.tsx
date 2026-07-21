import { CandlestickChart as ChartCandle, BarChart2, TrendingUp, ArrowRight } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';
import type { User } from '../../../lib/services/types';

interface FeaturesGridProps {
  theme: Theme;
  user: User | null;
}

export function FeaturesGrid({ theme, user }: FeaturesGridProps) {
  return (
    <div className="grid md:grid-cols-3 gap-8 mb-16">
      <div className={`${themes[theme].card} rounded-2xl p-8 shadow-lg border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-200`}>
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6">
          <ChartCandle className="w-6 h-6" />
        </div>
        <h3 className={`text-xl font-bold tracking-tight mb-3 ${themes[theme].text}`}>
          Real-time Analytics
        </h3>
        <p className={`text-sm ${themes[theme].text} opacity-75 leading-relaxed`}>
          Monitor options orderbook depth, underlying price trends, and volatility surfaces in real-time.
        </p>
      </div>

      <div className={`${themes[theme].card} rounded-2xl p-8 shadow-lg border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-200`}>
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6">
          <BarChart2 className="w-6 h-6" />
        </div>
        <h3 className={`text-xl font-bold tracking-tight mb-3 ${themes[theme].text}`}>
          Performance Insights
        </h3>
        <p className={`text-sm ${themes[theme].text} opacity-75 leading-relaxed`}>
          Gain deep visibility into trade executions, win/loss ratios, and risk exposure profiles.
        </p>
      </div>

      <div className={`${themes[theme].card} rounded-2xl p-8 shadow-lg border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-200`}>
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6">
          <TrendingUp className="w-6 h-6" />
        </div>
        <h3 className={`text-xl font-bold tracking-tight mb-3 ${themes[theme].text}`}>
          Trade Journal & Plans
        </h3>
        <p className={`text-sm ${themes[theme].text} opacity-75 leading-relaxed`}>
          Document strategies, set execution rules, and keep detailed journal records per account.
        </p>
        {user && (
          <div className="mt-6 pt-4 border-t border-slate-200/50 dark:border-zinc-800/80">
            <InternalLink
              to="/journal?tab=trades"
              className="inline-flex items-center text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 gap-1 transition-colors"
              title="Create and manage your trading plans"
            >
              <span>Manage Trade Plans</span>
              <ArrowRight className="w-4 h-4" />
            </InternalLink>
          </div>
        )}
      </div>
    </div>
  );
}
