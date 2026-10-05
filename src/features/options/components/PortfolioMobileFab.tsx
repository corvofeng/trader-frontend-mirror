import { useState, useEffect } from 'react';
import {
  Layers,
  X,
  RefreshCw,
  TrendingUp,
  Calendar,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

export interface PortfolioMobileFabProps {
  theme: Theme;
  activeSymbol: string;
  currentUnderlyingPrice: number | null;
  isWsConnected: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  months: { key: string; label: string; firstExpiry: string }[];
  activeMonthKey: string | null;
  monthlyStatusCounts: Record<
    string,
    { watch: number; profit: number; auto: number; hold: number; total: number }
  >;
  onSelectMonth: (firstExpiry: string) => void;
  onOpenUnderlyingMonitor: () => void;
  onOpenTodayCombo: () => void;
  todayTasksCount?: number;
}

export function PortfolioMobileFab({
  theme,
  activeSymbol,
  currentUnderlyingPrice,
  isWsConnected,
  isRefreshing,
  onRefresh,
  months,
  activeMonthKey,
  monthlyStatusCounts,
  onSelectMonth,
  onOpenUnderlyingMonitor,
  onOpenTodayCombo,
  todayTasksCount = 0,
}: PortfolioMobileFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMonthSheetOpen, setIsMonthSheetOpen] = useState(false);

  // Close speed dial when ESC is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsMonthSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute total alert counts across all months for notification badge
  const totalAlerts = Object.values(monthlyStatusCounts).reduce(
    (acc, c) => acc + (c.auto || 0) + (c.profit || 0) + (c.watch || 0),
    0
  );

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleOpenMonths = () => {
    setIsOpen(false);
    setIsMonthSheetOpen(true);
  };

  const handleSelectMonthItem = (firstExpiry: string) => {
    setIsMonthSheetOpen(false);
    onSelectMonth(firstExpiry);
  };

  // Heavyweight financial elevation shadow tokens
  const heavyElevation =
    theme === 'dark'
      ? 'shadow-[0_16px_40px_-6px_rgba(0,0,0,0.85),0_6px_16px_-4px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)]'
      : 'shadow-[0_16px_40px_-6px_rgba(15,23,42,0.22),0_6px_16px_-4px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.08)]';

  const pillShadow =
    theme === 'dark'
      ? 'shadow-[0_8px_24px_-2px_rgba(0,0,0,0.7),0_2px_8px_-2px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)]'
      : 'shadow-[0_8px_24px_-2px_rgba(15,23,42,0.16),0_2px_8px_-2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.06)]';

  return (
    <>
      {/* 1. Backdrop Overlay when Speed Dial is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[3px] z-[62] transition-opacity duration-200 animate-fade-in"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 2. Unified Floating Action Center (Speed Dial Container) */}
      <div
        className="fixed z-[63] flex flex-col items-end pointer-events-none select-none"
        style={{
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          right: 'calc(18px + env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Speed Dial Actions List */}
        <div
          className={`flex flex-col items-end gap-3 mb-4 transition-all duration-250 ease-out origin-bottom-right ${
            isOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-90 translate-y-4 pointer-events-none'
          }`}
        >
          {/* Action 1: Refresh Portfolio & Market Quotes */}
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border backdrop-blur-xl ${pillShadow} ${
                theme === 'dark'
                  ? 'bg-zinc-900/95 text-zinc-200 border-zinc-700/80'
                  : 'bg-white/95 text-slate-800 border-slate-200/90'
              }`}
            >
              刷新持仓与实时行情
            </span>
            <button
              type="button"
              onClick={() => {
                onRefresh();
                setIsOpen(false);
              }}
              disabled={isRefreshing}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-150 active:scale-90 ${pillShadow} ${
                theme === 'dark'
                  ? 'bg-zinc-900/95 text-sky-400 border-zinc-700/80 hover:bg-zinc-800'
                  : 'bg-white text-blue-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="刷新持仓与行情"
              aria-label="刷新持仓与行情"
            >
              <RefreshCw
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                strokeWidth={2}
              />
            </button>
          </div>

          {/* Action 2: Underlying Price Monitor */}
          {activeSymbol && (
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1.5 text-xs font-medium rounded-xl border backdrop-blur-xl flex items-center gap-2 ${pillShadow} ${
                  theme === 'dark'
                    ? 'bg-zinc-900/95 text-zinc-200 border-zinc-700/80'
                    : 'bg-white/95 text-slate-800 border-slate-200/90'
                }`}
              >
                <span className="font-semibold tracking-wide">标的行情 ({activeSymbol})</span>
                {typeof currentUnderlyingPrice === 'number' && (
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                    {currentUnderlyingPrice.toFixed(4)}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenUnderlyingMonitor();
                }}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-150 active:scale-90 ${pillShadow} ${
                  theme === 'dark'
                    ? 'bg-zinc-900/95 text-emerald-400 border-zinc-700/80 hover:bg-zinc-800'
                    : 'bg-white text-emerald-600 border-slate-200 hover:bg-slate-50'
                }`}
                title="查看标的实时行情看板"
                aria-label="查看标的实时行情看板"
              >
                <TrendingUp className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Action 3: Today Combo Tasks & Orders */}
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border backdrop-blur-xl flex items-center gap-1.5 ${pillShadow} ${
                theme === 'dark'
                  ? 'bg-zinc-900/95 text-zinc-200 border-zinc-700/80'
                  : 'bg-white/95 text-slate-800 border-slate-200/90'
              }`}
            >
              <span>今日组合交易与订单</span>
              {todayTasksCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {todayTasksCount} 项任务
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenTodayCombo();
              }}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-150 active:scale-90 ${pillShadow} ${
                theme === 'dark'
                  ? 'bg-zinc-900/95 text-indigo-400 border-zinc-700/80 hover:bg-zinc-800'
                  : 'bg-white text-indigo-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="打开今日组合交易任务面板"
              aria-label="打开今日组合交易任务面板"
            >
              <Layers className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          {/* Action 4: Month Navigation */}
          {months.length > 0 && (
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1.5 text-xs font-medium rounded-xl border backdrop-blur-xl flex items-center gap-2 ${pillShadow} ${
                  theme === 'dark'
                    ? 'bg-zinc-900/95 text-zinc-200 border-zinc-700/80'
                    : 'bg-white/95 text-slate-800 border-slate-200/90'
                }`}
              >
                <span>月份持仓快速定位</span>
                {totalAlerts > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {totalAlerts} 条预警
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={handleOpenMonths}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-150 active:scale-90 ${pillShadow} ${
                  theme === 'dark'
                    ? 'bg-zinc-900/95 text-amber-400 border-zinc-700/80 hover:bg-zinc-800'
                    : 'bg-white text-amber-600 border-slate-200 hover:bg-slate-50'
                }`}
                title="选择到期月份快速定位"
                aria-label="选择到期月份快速定位"
              >
                <Calendar className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* 3. Main Heavyweight Financial Floating Action Button */}
        <button
          type="button"
          onClick={handleToggle}
          className={`pointer-events-auto h-14 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 relative overflow-hidden select-none border ${heavyElevation} ${
            isOpen
              ? theme === 'dark'
                ? 'bg-zinc-900 text-zinc-200 border-zinc-700 w-14'
                : 'bg-slate-900 text-white border-slate-800 w-14'
              : theme === 'dark'
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-950 text-white border-zinc-700/90 px-4'
                : 'bg-gradient-to-b from-slate-800 to-slate-950 text-white border-slate-700/80 px-4'
          }`}
          aria-expanded={isOpen}
          aria-label={isOpen ? '收起快捷菜单' : '展开快捷操作'}
          title={isOpen ? '收起快捷菜单' : '展开快捷操作'}
        >
          {/* Subtle top specular highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

          {isOpen ? (
            <X className="w-6 h-6 transition-transform rotate-0 duration-200" strokeWidth={2.2} />
          ) : (
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 shrink-0 text-sky-400" strokeWidth={2} />
              {typeof currentUnderlyingPrice === 'number' ? (
                <div className="flex flex-col text-left leading-none font-mono">
                  <span className="text-[10px] text-zinc-400 font-sans tracking-wide font-medium">
                    标的报价
                  </span>
                  <span className="text-sm font-bold tabular-nums tracking-tight mt-0.5 text-zinc-100">
                    {currentUnderlyingPrice.toFixed(4)}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-semibold tracking-wide">快捷中心</span>
              )}

              {/* Status Indicator Dot with Ambient Glow */}
              <div className="relative flex items-center justify-center w-2.5 h-2.5 ml-0.5">
                {isWsConnected ? (
                  <>
                    <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500/40 animate-ping" />
                    <span className="relative w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="行情实时推送已连接" />
                  </>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" title="等待行情连接" />
                )}
              </div>
            </div>
          )}

          {/* Badge for total alerts when collapsed */}
          {!isOpen && totalAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg ring-2 ring-zinc-900 animate-bounce">
              {totalAlerts > 9 ? '9+' : totalAlerts}
            </span>
          )}
        </button>
      </div>

      {/* 4. Month Navigation Drawer / Dialog (Responsive: Bottom Sheet on Mobile, Floating Panel on Desktop) */}
      {isMonthSheetOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end md:justify-center md:items-end md:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMonthSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet Body */}
          <div
            className={`relative w-full md:w-[420px] md:max-h-[82vh] rounded-t-3xl md:rounded-3xl border ${themes[theme].card} ${themes[theme].border} ${heavyElevation} flex flex-col overflow-hidden animate-slide-up`}
            style={{
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* Top metallic highlight line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            {/* Drag Handle & Header */}
            <div className="pt-3 pb-3 px-5 flex flex-col border-b border-black/5 dark:border-white/5">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700 self-center mb-2.5 md:hidden" />
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 dark:bg-blue-500/20">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className={`text-base font-bold ${themes[theme].text}`}>
                      到期月份快速定位
                    </span>
                    <span className="text-xs text-muted-foreground opacity-60 ml-2">
                      ({months.length} 个月份)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMonthSheetOpen(false)}
                  className="p-1.5 rounded-xl text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Months List */}
            <div className="p-4 overflow-y-auto max-h-[60vh] md:max-h-[65vh] space-y-2.5 scrollbar-thin">
              {months.map((m) => {
                const isActive = activeMonthKey === m.key;
                const counts = monthlyStatusCounts[m.key] || {
                  watch: 0,
                  profit: 0,
                  auto: 0,
                  hold: 0,
                  total: 0,
                };
                const hasAlerts = counts.auto > 0 || counts.profit > 0 || counts.watch > 0;

                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => handleSelectMonthItem(m.firstExpiry)}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between active:scale-[0.98] ${
                      isActive
                        ? theme === 'dark'
                          ? 'bg-blue-600/20 border-blue-500/80 text-blue-300 shadow-md ring-1 ring-blue-500/30'
                          : 'bg-blue-50 border-blue-400 text-blue-900 shadow-md ring-1 ring-blue-400/30'
                        : `${themes[theme].secondary} border-transparent hover:border-black/10 dark:hover:border-white/10 hover:shadow-sm`
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                            : 'bg-black/5 dark:bg-white/10 text-muted-foreground border-transparent'
                        }`}
                      >
                        {m.key.split('-')[1]}月
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${themes[theme].text}`}>
                            {m.label}
                          </span>
                          {isActive && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold border border-blue-300/40">
                              当前视口
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground opacity-65 mt-0.5 font-mono">
                          首个到期: {m.firstExpiry}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasAlerts ? (
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {counts.auto > 0 && (
                            <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-900">
                              {counts.auto} AUTO
                            </span>
                          )}
                          {counts.profit > 0 && (
                            <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-900">
                              {counts.profit} 止盈
                            </span>
                          )}
                          {counts.watch > 0 && (
                            <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-900">
                              {counts.watch} 观察
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground opacity-50 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>正常</span>
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 opacity-40 ml-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { PortfolioMobileFab as PortfolioActionHub };
