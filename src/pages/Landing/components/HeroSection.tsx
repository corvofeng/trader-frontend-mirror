import { useEffect, useState } from 'react';
import { TrendingUp, ArrowRight, ShieldCheck, Activity, Zap, Bot } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { accountService, portfolioService } from '../../../lib/services';
import type { Holding, User, Account, PortfolioKlinePoint } from '../../../lib/services/types';
import { landingTranslations, Language } from '../i18n';
import { getCurrencySymbolFromCode } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { AssetTrendChart, TrendDataPoint } from './AssetTrendChart';
import { getAdjustedCandleClose } from '../../../features/portfolio/components/portfolioUtils';

interface HeroSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onNavigateToJournal: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToAbout: () => void;
  onOpenAiGuide?: () => void;
  user?: User | null;
  lang?: Language;
}

const DEFAULT_USER_ID = 'mock-user-id';

// Generate dynamic realistic 25-day daily asset & PnL change dataset as fallback
function generateRealisticFallbackTrend(count = 25): TrendDataPoint[] {
  const points: TrendDataPoint[] = [];
  const now = new Date();
  let currentAsset = 232150;

  const dailyChangesPct = [
    0.35, -0.22, 0.65, 0.42, -0.58, 0.81, -0.35, 0.45, 0.18, -0.72,
    0.95, 0.32, -0.15, 0.58, 0.41, -0.48, 0.62, 0.28, -0.31, 0.55,
    -0.20, 0.48, 0.36, -0.18, 0.82,
  ];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() - (count - 1 - i) * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    const dateLabel = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const pct = dailyChangesPct[i % dailyChangesPct.length];
    const change = (currentAsset * pct) / 100;
    currentAsset += change;

    points.push({
      date: dateStr,
      dateLabel,
      assetValue: Math.round(currentAsset * 100) / 100,
      dailyChange: Math.round(change * 100) / 100,
      dailyChangePct: Math.round(pct * 100) / 100,
    });
  }

  return points;
}

export function HeroSection({ 
  theme, 
  onNavigateToJournal, 
  onOpenAiGuide,
  user,
  lang = 'zh',
}: HeroSectionProps) {
  const t = landingTranslations[lang].hero;
  const { regionalColors } = useCurrency();

  const [portfolioSummary, setPortfolioSummary] = useState<{
    totalValue: number;
    dailyChange: number;
    dailyChangePct: number;
    currencySymbol: string;
  }>({
    totalValue: 238500.00,
    dailyChange: 2862.00,
    dailyChangePct: 1.20,
    currencySymbol: '$',
  });
  const [winRate, setWinRate] = useState<number>(66.7);
  const [winDays, setWinDays] = useState<number>(10);
  const [totalDays, setTotalDays] = useState<number>(15);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>(() => generateRealisticFallbackTrend());
  const [latestDate, setLatestDate] = useState<string>('');
  const [thirtyDayNetPnL, setThirtyDayNetPnL] = useState<number>(2580.00);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const loadRealData = async () => {
      setIsLoading(true);
      try {
        const userId = user?.id || DEFAULT_USER_ID;

        // 1. Fetch user accounts to locate main account
        const accountsResponse = await accountService.getAccounts(userId);
        const accounts: Account[] = accountsResponse.data || [];
        const mainAccount = accounts.find((acc) => acc.is_default) || accounts[0];
        const accountKey = mainAccount ? (mainAccount.alias || mainAccount.id) : undefined;
        const currency = mainAccount?.currency || 'USD';
        const currencySymbol = getCurrencySymbolFromCode(currency);

        // 2. Fetch holdings for main account
        const holdingsResponse = await portfolioService.getHoldings(userId, accountKey);
        const holdings: Holding[] = holdingsResponse.data || [];

        if (!cancelled) {
          if (holdings.length > 0) {
            const totalValue = holdings.reduce((sum, h) => sum + (h.total_value ?? 0), 0);
            const totalDailyPnL = holdings.reduce((sum, h) => sum + (h.daily_profit_loss ?? 0), 0);
            const previousValue = totalValue - totalDailyPnL;
            const dailyChangePct = previousValue > 0 ? (totalDailyPnL / previousValue) * 100 : 0;

            setPortfolioSummary({
              totalValue,
              dailyChange: totalDailyPnL,
              dailyChangePct,
              currencySymbol,
            });
          } else {
            setPortfolioSummary({
              totalValue: 0,
              dailyChange: 0,
              dailyChangePct: 0,
              currencySymbol,
            });
          }
        }

        // 3. Fetch trend/kline & metrics data using unified portfolio interfaces (forward-adjusted)
        if (accountKey) {
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const [klineResponse] = await Promise.all([
            portfolioService.getKlineData(userId, startDate, endDate, accountKey),
          ]);
          const candles: PortfolioKlinePoint[] = klineResponse.data || [];
          const hasAdjusted = candles.some(
            c => typeof c.adjusted_close === 'number' && Number.isFinite(c.adjusted_close)
          );
          const validCandles = candles.filter(c => {
            const close = getAdjustedCandleClose(c, hasAdjusted);
            return close !== null && close > 0;
          });

          if (validCandles.length >= 2 && !cancelled) {
            const calculatedPoints: TrendDataPoint[] = [];
            for (let i = 1; i < validCandles.length; i++) {
              const prev = validCandles[i - 1];
              const curr = validCandles[i];
              const prevClose = getAdjustedCandleClose(prev, hasAdjusted)!;
              const currClose = getAdjustedCandleClose(curr, hasAdjusted)!;
              // Forward adjustment (前复权) naturally normalizes away cash flow disturbances
              const diff = currClose - prevClose;
              const pct = prevClose > 0 ? (diff / prevClose) * 100 : 0;
              const dateStr = curr.date;
              const dateLabel = dateStr.length >= 10 ? dateStr.slice(5, 10) : dateStr;

              calculatedPoints.push({
                date: dateStr,
                dateLabel,
                assetValue: currClose,
                dailyChange: Math.round(diff * 100) / 100,
                dailyChangePct: Math.round(pct * 100) / 100,
              });
            }

            if (calculatedPoints.length > 0) {
              setTrendData(calculatedPoints);
              const netChange = calculatedPoints.reduce((sum, p) => sum + p.dailyChange, 0);
              setThirtyDayNetPnL(netChange);

              // Calculate daily win rate strictly from the displayed 30-day window
              const positiveDaysCount = calculatedPoints.filter((p) => p.dailyChange > 0).length;
              const totalDaysCount = calculatedPoints.length;
              const calculatedWinRate = totalDaysCount > 0
                ? Number(((positiveDaysCount / totalDaysCount) * 100).toFixed(1))
                : 0;
              setWinRate(calculatedWinRate);
              setWinDays(positiveDaysCount);
              setTotalDays(totalDaysCount);

              // Overwrite portfolioSummary using total asset K-line values for consistency
              const lastCandle = validCandles[validCandles.length - 1];
              const prevCandle = validCandles[validCandles.length - 2];
              const lastClose = getAdjustedCandleClose(lastCandle, hasAdjusted)!;
              const prevClose = getAdjustedCandleClose(prevCandle, hasAdjusted)!;
              const todayPnL = lastClose - prevClose;
              const todayPnLPct = prevClose > 0 ? (todayPnL / prevClose) * 100 : 0;

              const latestTotalValue = candles[candles.length - 1]?.close ?? lastCandle.close;
              setLatestDate(lastCandle.date);

              setPortfolioSummary({
                totalValue: latestTotalValue,
                dailyChange: Math.round(todayPnL * 100) / 100,
                dailyChangePct: todayPnLPct,
                currencySymbol,
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load Live Market Monitor data:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRealData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isPortfolioPositive = portfolioSummary.dailyChangePct >= 0;

  return (
    <div className={`relative overflow-hidden ${themes[theme].background} border-b ${themes[theme].border} transition-colors duration-200`}>
      {/* Background glow accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Clean & Concise Hero Copy */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-3 sm:mb-4">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.badge}</span>
            </div>

            <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight ${themes[theme].text} mb-3 leading-snug sm:leading-tight`}>
              <span className="inline-block">{t.titleLine1}</span>
              <span className="mt-1 sm:mt-0 sm:ml-3 inline-block whitespace-nowrap bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                {t.titleLine2}
              </span>
            </h1>

            <p className={`text-sm sm:text-base lg:text-lg ${themes[theme].text} opacity-80 mb-5 sm:mb-6 max-w-lg leading-relaxed`}>
              {t.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onNavigateToJournal}
                className={`w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${themes[theme].primary} active:scale-[0.98] group shadow-md hover:shadow-blue-500/20`}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                <span>{t.openJournal}</span>
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>

              {onOpenAiGuide && (
                <button
                  type="button"
                  onClick={onOpenAiGuide}
                  className={`w-full sm:w-auto inline-flex items-center justify-center px-5 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${themes[theme].secondary} border ${themes[theme].border} active:scale-[0.98] group hover:border-indigo-500/50`}
                >
                  <Bot className="w-4 h-4 mr-2 text-indigo-500" />
                  <span>{lang === 'zh' ? '用 AI 查看本站' : 'Browse with AI'}</span>
                </button>
              )}
            </div>

            {/* Micro Trust Strip */}
            <div className="mt-5 sm:mt-6 pt-4 border-t border-slate-200/60 dark:border-zinc-800/60 flex flex-wrap items-center gap-4 sm:gap-6 text-xs opacity-70 w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{t.multiAccount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-500 shrink-0" />
                <span>{t.wsLive}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Tactical Financial Dashboard Card */}
          <div className="lg:col-span-5 w-full">
            <div className={`rounded-2xl p-5 sm:p-6 border ${themes[theme].border} ${themes[theme].card} shadow-xl relative overflow-hidden backdrop-blur-sm transition-all`}>
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-zinc-800/80 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500" />
                  <span className="text-xs font-semibold tracking-wider opacity-80">
                    {lang === 'zh' 
                      ? `收盘快照${latestDate ? ` · 截至 ${latestDate}` : ''}`
                      : `Closing Snapshot${latestDate ? ` · As of ${latestDate}` : ''}`}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60 font-mono">
                    {lang === 'zh' ? '盘后更新' : 'Post-Market'}
                  </span>
                </div>
                <span 
                  className="text-xs font-mono px-2.5 py-1 rounded-md font-medium border"
                  style={{
                    backgroundColor: isPortfolioPositive ? `${regionalColors.upColor}1a` : `${regionalColors.downColor}1a`,
                    color: isPortfolioPositive ? regionalColors.upColor : regionalColors.downColor,
                    borderColor: isPortfolioPositive ? `${regionalColors.upColor}33` : `${regionalColors.downColor}33`,
                  }}
                >
                  {portfolioSummary.currencySymbol}{portfolioSummary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({isPortfolioPositive ? '+' : ''}{portfolioSummary.dailyChangePct.toFixed(2)}%)
                </span>
              </div>

              {isLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-slate-200 dark:bg-zinc-800 rounded-xl"></div>
                    <div className="h-20 bg-slate-200 dark:bg-zinc-800 rounded-xl"></div>
                  </div>
                  <div className="h-28 bg-slate-200 dark:bg-zinc-800 rounded-xl"></div>
                </div>
              ) : (
                <>
                  {/* Stat Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
                    <div className="p-3 sm:p-3.5 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                      <div className="text-xs opacity-70 mb-1 truncate">{t.winRateLabel}</div>
                      <div 
                        className="text-lg sm:text-xl font-bold font-mono"
                        style={{ color: regionalColors.upColor }}
                      >
                        {winRate.toFixed(1)}%
                      </div>
                      <div 
                        className="text-[11px] mt-0.5 truncate opacity-70"
                        style={{ color: regionalColors.upColor }}
                      >
                        {lang === 'zh' 
                          ? `${winDays}天盈利 / 共${totalDays}个交易日` 
                          : `${winDays} win days / ${totalDays} trading days`}
                      </div>
                    </div>

                    <div className="p-3 sm:p-3.5 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                      <div className="text-xs opacity-70 mb-1 truncate">
                        {lang === 'zh' ? '最新收盘日盈亏' : 'Latest Close PnL'}
                      </div>
                      <div 
                        className="text-lg sm:text-xl font-bold font-mono"
                        style={{ color: isPortfolioPositive ? regionalColors.upColor : regionalColors.downColor }}
                      >
                        {portfolioSummary.dailyChange >= 0 ? '+' : ''}{portfolioSummary.dailyChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div 
                        className="text-[11px] font-semibold mt-0.5 truncate"
                        style={{ color: isPortfolioPositive ? regionalColors.upColor : regionalColors.downColor }}
                      >
                        {lang === 'zh' ? '较前一交易日' : 'vs Previous Close'} ({isPortfolioPositive ? '+' : ''}{portfolioSummary.dailyChangePct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* 30-Day Asset Trend & Daily PnL Composite Chart */}
                  <AssetTrendChart
                    data={trendData}
                    currencySymbol={portfolioSummary.currencySymbol}
                    upColor={regionalColors.upColor}
                    downColor={regionalColors.downColor}
                    thirtyDayNetPnL={thirtyDayNetPnL}
                    lang={lang}
                  />
                </>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}



