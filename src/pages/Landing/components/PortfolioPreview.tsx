import { useEffect, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, ArrowUpRight, TrendingUp } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';
import { accountService, portfolioService, isCloudflareEnv } from '../../../lib/services';
import type { Holding, User, Account } from '../../../lib/services/types';
import { landingTranslations, Language } from '../i18n';
import { getCurrencySymbol } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface PortfolioPreviewProps {
  theme: Theme;
  user?: User | null;
  lang?: Language;
}

const DEFAULT_USER_ID = 'mock-user-id';

function getDisplayStockTitle(stock: Holding): { title: string; subtitle: string } {
  const hasName = Boolean(stock.stock_name && stock.stock_name.trim() !== stock.stock_code);
  if (hasName) {
    return {
      title: stock.stock_name,
      subtitle: stock.stock_code,
    };
  }
  return {
    title: stock.stock_code,
    subtitle: '',
  };
}

export function PortfolioPreview({ theme, user, lang = 'zh' }: PortfolioPreviewProps) {
  const t = landingTranslations[lang].portfolioSnapshot;
  const { regionalColors } = useCurrency();
  const [topHoldings, setTopHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const userId = user?.id || DEFAULT_USER_ID;

        // 1. Fetch user accounts to locate the main/default account
        const accountsResponse = await accountService.getAccounts(userId);
        const accounts: Account[] = accountsResponse.data || [];

        const mainAccount = accounts.find((acc) => acc.is_default) || accounts[0];
        const accountKey = mainAccount ? (mainAccount.alias || mainAccount.id) : undefined;

        // 2. Fetch holdings for the main account (or fallback to user ID)
        const holdingsResponse = await portfolioService.getHoldings(userId, accountKey);
        const holdings: Holding[] = holdingsResponse.data || [];

        if (!cancelled) {
          // Sort holdings by market value (total_value = quantity * current_price) descending
          const sorted = [...holdings].sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0));
          // Take top 3 largest positions
          setTopHoldings(sorted.slice(0, 3));
        }
      } catch (err) {
        console.error('Failed to load portfolio snapshot holdings:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="mb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${themes[theme].text}`}>
            {t.title}
          </h2>
          <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70 mt-1`}>
            {t.subtitleDefault}
          </p>
        </div>
        <InternalLink
          to={isCloudflareEnv ? "/journal" : "/journal?tab=portfolio"}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
          title="Access detailed portfolio analytics and performance metrics"
        >
          <span>{t.viewFullPortfolio}</span>
          <ArrowUpRight className="w-4 h-4" />
        </InternalLink>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`${themes[theme].card} rounded-2xl p-6 border ${themes[theme].border} animate-pulse`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-2">
                  <div className="h-6 w-20 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                  <div className="h-3 w-32 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                </div>
                <div className="w-9 h-9 bg-slate-200 dark:bg-zinc-800 rounded-xl"></div>
              </div>
              <div className="pt-4 border-t border-slate-200/50 dark:border-zinc-800/80 flex justify-between items-center">
                <div className="h-4 w-16 bg-slate-200 dark:bg-zinc-800 rounded"></div>
                <div className="h-5 w-16 bg-slate-200 dark:bg-zinc-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : topHoldings.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {topHoldings.map((holding, index) => {
            const pnlPct = holding.profit_loss_percentage ?? 0;
            const isPositive = pnlPct >= 0;
            const currencySymbol = getCurrencySymbol(holding.stock_code);
            const { title, subtitle } = getDisplayStockTitle(holding);

            return (
              <div
                key={holding.stock_code}
                className={`${themes[theme].card} rounded-2xl p-6 border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-200 shadow-md hover:shadow-lg`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-lg font-bold tracking-tight ${themes[theme].text} truncate`} title={title}>
                        {title}
                      </h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                        {t.holdingBadge.replace('{rank}', String(index + 1))}
                      </span>
                    </div>
                    {subtitle && (
                      <p className={`text-xs font-mono ${themes[theme].text} opacity-60 mt-0.5 truncate`}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <div 
                    className="p-2 rounded-xl shrink-0 border"
                    style={{
                      backgroundColor: isPositive ? `${regionalColors.upColor}1a` : `${regionalColors.downColor}1a`,
                      color: isPositive ? regionalColors.upColor : regionalColors.downColor,
                      borderColor: isPositive ? `${regionalColors.upColor}33` : `${regionalColors.downColor}33`,
                    }}
                  >
                    {isPositive ? (
                      <ArrowUpCircle className="w-5 h-5" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5" />
                    )}
                  </div>
                </div>

                {/* Market Value Stat block */}
                <div className="my-3 py-2 px-3 bg-slate-50/50 dark:bg-zinc-800/30 rounded-xl flex items-center justify-between text-xs">
                  <span className={`opacity-60 ${themes[theme].text} font-medium`}>
                    {t.holdingValue}
                  </span>
                  <span className={`font-bold font-mono ${themes[theme].text}`}>
                    {currencySymbol}{typeof holding.total_value === 'number'
                      ? holding.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-slate-200/50 dark:border-zinc-800/80">
                  <div className={`text-xs ${themes[theme].text} opacity-70 flex flex-col`}>
                    <span className="text-[11px] opacity-60">
                      {lang === 'zh' ? '收盘结算价' : 'Close Price'}
                    </span>
                    <span className="text-sm font-mono font-medium">
                      {currencySymbol}{typeof holding.current_price === 'number' ? holding.current_price.toFixed(2) : '--'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] opacity-60">
                      {lang === 'zh' ? '持仓浮动盈亏' : 'Unrealized PnL'}
                    </span>
                    <span 
                      className="text-base font-bold font-mono"
                      style={{ color: isPositive ? regionalColors.upColor : regionalColors.downColor }}
                    >
                      {isPositive ? '+' : ''}{pnlPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`${themes[theme].card} rounded-2xl p-8 border ${themes[theme].border} text-center space-y-3`}>
          <TrendingUp className="w-10 h-10 mx-auto text-slate-400 opacity-60" />
          <p className={`text-sm ${themes[theme].text} opacity-70`}>
            {t.emptyText}
          </p>
          <InternalLink
            to={isCloudflareEnv ? "/journal" : "/journal?tab=portfolio"}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t.emptyCta}
          </InternalLink>
        </div>
      )}
    </div>
  );
}