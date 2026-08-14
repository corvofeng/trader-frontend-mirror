import { useEffect, useState } from 'react';
import { TrendingUp, ArrowRight, ShieldCheck, Activity, LineChart, Zap } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { accountService, portfolioService } from '../../../lib/services';
import type { Holding, User, Account, PortfolioKlinePoint } from '../../../lib/services/types';
import { landingTranslations, Language } from '../i18n';
import { getCurrencySymbolFromCode } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';


interface HeroSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onNavigateToJournal: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToAbout: () => void;
  user?: User | null;
  lang?: Language;
}

interface DailyBarItem {
  change: number;
  dateStr: string;
}

const DEFAULT_USER_ID = 'mock-user-id';

// Default realistic 15-day daily PnL change dataset as fallback
const FALLBACK_DAILY_BARS: DailyBarItem[] = [
  { change: 320, dateStr: 'Day 1' },
  { change: -140, dateStr: 'Day 2' },
  { change: 510, dateStr: 'Day 3' },
  { change: 180, dateStr: 'Day 4' },
  { change: -220, dateStr: 'Day 5' },
  { change: 450, dateStr: 'Day 6' },
  { change: -110, dateStr: 'Day 7' },
  { change: 290, dateStr: 'Day 8' },
  { change: 80, dateStr: 'Day 9' },
  { change: -310, dateStr: 'Day 10' },
  { change: 620, dateStr: 'Day 11' },
  { change: 150, dateStr: 'Day 12' },
  { change: -90, dateStr: 'Day 13' },
  { change: 410, dateStr: 'Day 14' },
  { change: 230, dateStr: 'Day 15' },
];

export function HeroSection({ 
  theme, 
  onNavigateToJournal, 
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
  const [dailyBars, setDailyBars] = useState<DailyBarItem[]>(FALLBACK_DAILY_BARS);
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

        // 3. Fetch trend/kline data for 30-day daily PnL bar chart (adjusted for cash flows)
        if (accountKey) {
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const klineResponse = await portfolioService.getKlineData(userId, startDate, endDate, accountKey);
          const candles: PortfolioKlinePoint[] = klineResponse.data || [];

          if (candles.length >= 2 && !cancelled) {
            const calculatedBars: DailyBarItem[] = [];
            for (let i = 1; i < candles.length; i++) {
              const diff = candles[i].close - candles[i - 1].close - (candles[i].cash_flow ?? 0);
              calculatedBars.push({
                change: diff,
                dateStr: candles[i].date,
              });
            }

            if (calculatedBars.length > 0) {
              // Take last 15-20 days for optimal bar chart resolution
              const sampledBars = calculatedBars.slice(-18);
              setDailyBars(featuredBars(sampledBars));
              const netChange = calculatedBars.reduce((sum, bar) => sum + bar.change, 0);
              setThirtyDayNetPnL(netChange);

              // Calculate daily win rate over the last 30 days
              const positiveDaysCount = calculatedBars.filter((bar) => bar.change > 0).length;
              const totalDaysCount = calculatedBars.length;
              const calculatedWinRate = Number(((positiveDaysCount / totalDaysCount) * 100).toFixed(1));
              setWinRate(calculatedWinRate);
              setWinDays(positiveDaysCount);
              setTotalDays(totalDaysCount);

              // Overwrite portfolioSummary using total asset K-line values for perfect consistency
              const lastCandle = candles[candles.length - 1];
              const prevCandle = candles[candles.length - 2];
              const todayPnL = lastCandle.close - prevCandle.close - (lastCandle.cash_flow ?? 0);
              const todayPnLPct = prevCandle.close > 0 ? (todayPnL / prevCandle.close) * 100 : 0;

              setPortfolioSummary({
                totalValue: lastCandle.close,
                dailyChange: todayPnL,
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
  const is30DayPositive = thirtyDayNetPnL >= 0;
  const maxAbsChange = Math.max(...dailyBars.map((b) => Math.abs(b.change)), 1);

  return (
    <div className={`relative overflow-hidden ${themes[theme].background} border-b ${themes[theme].border} transition-colors duration-200`}>
      {/* Background glow accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Clean & Concise Hero Copy */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-4 sm:mb-5">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.badge}</span>
            </div>

            <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight ${themes[theme].text} mb-4 leading-snug sm:leading-tight`}>
              <span className="inline-block">{t.titleLine1}</span>
              <span className="mt-1 sm:mt-0 sm:ml-3 inline-block whitespace-nowrap bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                {t.titleLine2}
              </span>
            </h1>

            <p className={`text-sm sm:text-base lg:text-lg ${themes[theme].text} opacity-80 mb-6 sm:mb-8 max-w-lg leading-relaxed`}>
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
            </div>

            {/* Micro Trust Strip */}
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-5 border-t border-slate-200/60 dark:border-zinc-800/60 flex flex-wrap items-center gap-4 sm:gap-6 text-xs opacity-70 w-full sm:w-auto">
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
              <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-zinc-800/80 pb-3.5 mb-4 sm:mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold tracking-wider uppercase opacity-75">{t.liveMarketMonitor}</span>
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
                      <div className="text-xs opacity-70 mb-1 truncate">{(t as any).dailyPnL}</div>
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
                        {(t as any).dailyPnLSub} ({isPortfolioPositive ? '+' : ''}{portfolioSummary.dailyChangePct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* 30-Day Daily PnL Bar Chart Component */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="font-semibold flex items-center gap-1.5">
                        <LineChart className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{t.unrealizedPnL}</span>
                      </span>
                      <span 
                        className="font-mono font-bold shrink-0 ml-2"
                        style={{ color: is30DayPositive ? regionalColors.upColor : regionalColors.downColor }}
                      >
                        {is30DayPositive ? '+' : ''}{portfolioSummary.currencySymbol}{thirtyDayNetPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Daily PnL Bar Chart Grid */}
                    <div className="h-20 flex items-center justify-between gap-0.5 sm:gap-1 pt-2 relative">
                      {/* Center Baseline (0 Line) */}
                      <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-slate-300 dark:border-zinc-700 opacity-60 z-0 pointer-events-none" />

                      {dailyBars.map((bar, i) => {
                        const isPos = bar.change >= 0;
                        const barHeightPct = bar.change === 0 ? 0 : Math.max(3, Math.min(48, (Math.abs(bar.change) / maxAbsChange) * 48));

                        return (
                          <div
                            key={i}
                            className="flex-1 relative flex items-center justify-center h-full z-10 group/bar cursor-pointer"
                            title={`${bar.dateStr}: ${isPos ? '+' : ''}${portfolioSummary.currencySymbol}${bar.change.toFixed(2)}`}
                          >
                            <div
                              className={`w-full max-w-[6px] sm:max-w-[10px] rounded-xs transition-all duration-300 hover:opacity-100 opacity-80 ${
                                isPos ? 'self-end mb-10' : 'self-start mt-10'
                              }`}
                              style={{ 
                                height: `${barHeightPct}%`,
                                backgroundColor: isPos ? regionalColors.upColor : regionalColors.downColor 
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Helper to filter/sanitize bars
function featuredBars(bars: DailyBarItem[]): DailyBarItem[] {
  if (bars.length === 0) return FALLBACK_DAILY_BARS;
  return bars;
}



