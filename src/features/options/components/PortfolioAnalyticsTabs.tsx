import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronDown,
  FileSpreadsheet,
  ExternalLink,
  Wallet,
  Activity,
  Dot,
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { CurrencyConfig } from '../../../shared/types/ui';
import type { PortfolioHistoryItem, OptionsPortfolioData } from '../../../lib/services/types';
import { getAccountAliasFromSearch } from '../../../shared/utils/accountSelection';
import {
  OptionPortfolioHistoryChart,
  GOOGLE_SHEET_URL,
  MAIN_ACCOUNT_ALIAS,
} from './OptionPortfolioHistoryChart';
import {
  SubjectPositionsPanel,
  calculateSubjectPositionsSummary,
  type SubjectPosition,
} from './SubjectPositionsPanel';
import { PortfolioOverview } from './PortfolioOverview';

export type AnalyticsTab = 'overview' | 'history' | 'subject';

export const PORTFOLIO_ANALYTICS_COLLAPSED_KEY = 'options_portfolio_analytics_tabs_collapsed';
export const PORTFOLIO_ANALYTICS_ACTIVE_TAB_KEY = 'options_portfolio_analytics_active_tab';

export interface PortfolioAnalyticsTabsProps {
  theme: Theme;
  accountAlias?: string;
  portfolioData?: OptionsPortfolioData | null;
  activityLogsCount?: number;
  onOpenLog?: () => void;
  currentUnderlyingPrice?: number | null;
  subjectPositions?: SubjectPosition[];
  currencyConfig: CurrencyConfig;
  className?: string;
  defaultTab?: AnalyticsTab;
  defaultExpanded?: boolean;
}

export function PortfolioAnalyticsTabs({
  theme,
  accountAlias: propAccountAlias,
  portfolioData,
  activityLogsCount = 0,
  onOpenLog,
  currentUnderlyingPrice,
  subjectPositions = [],
  currencyConfig,
  className = '',
  defaultTab,
  defaultExpanded,
}: PortfolioAnalyticsTabsProps) {
  const location = useLocation();

  // 解析当前有效账户别名
  const effectiveAccountAlias = useMemo(() => {
    return propAccountAlias || getAccountAliasFromSearch(location.search) || 'gjzq_option';
  }, [propAccountAlias, location.search]);

  const isMainAccount = effectiveAccountAlias === MAIN_ACCOUNT_ALIAS;

  // 标的物持仓有效数据
  const effectiveSubjectPositions = useMemo(() => {
    if (subjectPositions && subjectPositions.length > 0) return subjectPositions;
    return portfolioData?.subject_positions || [];
  }, [subjectPositions, portfolioData?.subject_positions]);

  const hasSubjectPositions = effectiveSubjectPositions.length > 0;
  const hasOverview = Boolean(portfolioData);

  // 标的物持仓汇总数据
  const subjectSummary = useMemo(() => {
    return calculateSubjectPositionsSummary(effectiveSubjectPositions);
  }, [effectiveSubjectPositions]);

  // Tab 状态解析
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => {
    if (defaultTab) {
      if (defaultTab === 'subject' && hasSubjectPositions) return 'subject';
      if (defaultTab === 'overview' && hasOverview) return 'overview';
      if (defaultTab === 'history') return 'history';
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PORTFOLIO_ANALYTICS_ACTIVE_TAB_KEY);
      if (saved === 'overview' && hasOverview) return 'overview';
      if (saved === 'history') return 'history';
      if (saved === 'subject' && hasSubjectPositions) return 'subject';
    }
    if (hasOverview) return 'overview';
    return 'history';
  });

  // 如果持仓数据变空或无概览数据时回退
  useEffect(() => {
    if (!hasSubjectPositions && activeTab === 'subject') {
      setActiveTab(hasOverview ? 'overview' : 'history');
    } else if (!hasOverview && activeTab === 'overview') {
      setActiveTab('history');
    }
  }, [hasSubjectPositions, hasOverview, activeTab]);

  // 折叠状态（默认展开）
  const [isExpanded, setIsExpanded] = useState(() => {
    if (defaultExpanded !== undefined) return defaultExpanded;
    if (typeof window === 'undefined') return true;

    const saved = localStorage.getItem(PORTFOLIO_ANALYTICS_COLLAPSED_KEY);
    if (saved === '1') return false;
    if (saved === '0') return true;
    return true;
  });

  // 记忆折叠状态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PORTFOLIO_ANALYTICS_COLLAPSED_KEY, isExpanded ? '0' : '1');
  }, [isExpanded]);

  // 现价跳动效果
  const [pricePulse, setPricePulse] = useState(false);
  const prevPriceRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (currentUnderlyingPrice != null && currentUnderlyingPrice !== prevPriceRef.current) {
      setPricePulse(true);
      const t = setTimeout(() => setPricePulse(false), 1200);
      prevPriceRef.current = currentUnderlyingPrice;
      return () => clearTimeout(t);
    }
  }, [currentUnderlyingPrice]);

  // 接收从历史走势组件传出的最新点
  const [latestHistoryPoint, setLatestHistoryPoint] = useState<PortfolioHistoryItem | null>(null);

  const cardShadow = useMemo(() => {
    if (theme === 'dark') return 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]';
    if (theme === 'blue') return 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]';
    return 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]';
  }, [theme]);

  // Tab 切换处理
  const handleTabClick = useCallback(
    (tab: AnalyticsTab, e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeTab === tab) {
        setIsExpanded((prev) => !prev);
      } else {
        setActiveTab(tab);
        setIsExpanded(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem(PORTFOLIO_ANALYTICS_ACTIVE_TAB_KEY, tab);
        }
      }
    },
    [activeTab]
  );

  const isProfitPositive = (latestHistoryPoint?.calculated_profit ?? 0) >= 0;
  const positionProfit = portfolioData?.position_profit ?? 0;
  const isPosProfitPositive = positionProfit >= 0;

  return (
    <div
      className={`${themes[theme].card} ${themes[theme].border} border rounded-xl sm:rounded-2xl ${cardShadow} transition-all duration-300 overflow-hidden ${className}`}
    >
      {/* 聚合头部：完整保留标题、账户徽章、描述与 Tab 切换器 */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between cursor-pointer select-none hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        {/* 左侧：图标 + 标题/描述/徽章 + Tab分段切换 */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          {/* 主题动态图标 */}
          <div
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              activeTab === 'overview'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : activeTab === 'history'
                  ? isProfitPositive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {activeTab === 'overview' ? (
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            ) : activeTab === 'history' ? (
              isProfitPositive ? (
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
              ) : (
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
              )
            ) : (
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            )}
          </div>

          <div className="min-w-0">
            {/* 顶部标题行与 Tab 药丸切换器 */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div
                className="inline-flex items-center p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-black/[0.05] dark:bg-white/[0.08] backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 组合概览 Tab */}
                {hasOverview && (
                  <button
                    type="button"
                    onClick={(e) => handleTabClick('overview', e)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md sm:rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'overview'
                        ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-xs font-semibold'
                        : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5 text-blue-500 shrink-0" strokeWidth={2.2} />
                    <span>组合概览</span>
                  </button>
                )}

                {/* 历史走势 Tab */}
                <button
                  type="button"
                  onClick={(e) => handleTabClick('history', e)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md sm:rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'history'
                      ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-xs font-semibold'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2.2} />
                  <span>
                    <span className="sm:hidden">历史走势</span>
                    <span className="hidden sm:inline">历史盈亏走势</span>
                  </span>
                  <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/5 dark:bg-white/10 opacity-75">
                    TV
                  </span>
                </button>

                {/* 标的物持仓 Tab */}
                {hasSubjectPositions && (
                  <button
                    type="button"
                    onClick={(e) => handleTabClick('subject', e)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md sm:rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'subject'
                        ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-xs font-semibold'
                        : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" strokeWidth={2.2} />
                    <span>
                      <span className="sm:hidden">标的持仓</span>
                      <span className="hidden sm:inline">标的物持仓</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 font-semibold">
                      {effectiveSubjectPositions.length}
                    </span>
                  </button>
                )}
              </div>

              {/* 账户别名徽章 */}
              {effectiveAccountAlias && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                  {effectiveAccountAlias}
                </span>
              )}

              {/* 标的现价实时徽章 */}
              {currentUnderlyingPrice != null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                    theme === 'dark'
                      ? 'bg-zinc-800/60 text-zinc-200'
                      : theme === 'blue'
                        ? 'bg-blue-50/90 text-blue-900'
                        : 'bg-slate-50 text-slate-800'
                  } ${pricePulse ? 'ring-1 ring-blue-400/40 scale-[1.02]' : ''}`}
                >
                  <Dot
                    className={`w-3 h-3 -ml-0.5 ${
                      theme === 'dark' ? 'text-emerald-400' : 'text-emerald-500'
                    } ${pricePulse ? 'animate-pulse' : ''}`}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <span className="font-mono tabular-nums">
                    现价 {currentUnderlyingPrice.toFixed(4)}
                  </span>
                </span>
              )}

              {/* 查看持仓变动日志按钮 */}
              {onOpenLog && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLog();
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-zinc-800/80 text-zinc-300'
                      : theme === 'blue'
                        ? 'hover:bg-blue-50 text-slate-700'
                        : 'hover:bg-slate-100 text-slate-700'
                  } relative shrink-0`}
                  title="查看持仓变动日志"
                >
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.75} />
                  {activityLogsCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400/80 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 ring-1 ring-white/40 dark:ring-zinc-900/40"></span>
                    </span>
                  )}
                </button>
              )}

              {/* Google Sheet 数据源外链 (仅在历史走势为主账户时呈现) */}
              {activeTab === 'history' && isMainAccount && (
                <a
                  href={GOOGLE_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-xs"
                  title="数据同步来源: Google Sheet (点击打开原表格)"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Google Sheet 数据源</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}
            </div>

            {/* 描述信息（小字） */}
            <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5 truncate hidden sm:block`}>
              {activeTab === 'overview'
                ? portfolioData
                  ? `总金额 ${formatCurrency(portfolioData.balance ?? 0, currencyConfig, 2)} · 可用资金 ${formatCurrency(portfolioData.available ?? 0, currencyConfig, 2)} · 保证金占用 ${formatCurrency(portfolioData.real_used_margin ?? 0, currencyConfig, 2)}`
                  : '期权投资组合核心资产与风险概览'
                : activeTab === 'history'
                  ? '平滑连接资金占用与期权收益快照流水 (calculated_profit)'
                  : `总持仓 ${subjectSummary.totalVolume.toLocaleString()} · 备兑 ${subjectSummary.totalCovered.toLocaleString()} · 锁定 ${subjectSummary.totalLocked.toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* 右侧：关键指标与折叠箭头 */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-2">
          {/* 组合概览状态下的当前仓位盈亏 */}
          {activeTab === 'overview' && portfolioData && (
            <div className="text-right">
              <div className="text-[9px] uppercase font-bold tracking-wider opacity-40 hidden sm:block">
                当前仓位盈亏
              </div>
              <div
                className={`text-xs sm:text-sm font-bold font-mono ${
                  isPosProfitPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <span className="sm:hidden font-normal text-[10px] opacity-65 mr-1 text-gray-500 dark:text-zinc-400">
                  盈亏:
                </span>
                {isPosProfitPositive ? '+' : ''}
                {formatCurrency(positionProfit, currencyConfig, 2)}
              </div>
            </div>
          )}

          {/* 历史走势状态下的最新累计利润 */}
          {activeTab === 'history' && latestHistoryPoint && (
            <div className="text-right">
              <div className="text-[9px] uppercase font-bold tracking-wider opacity-40 hidden sm:block">
                最新累计利润
              </div>
              <div
                className={`text-xs sm:text-sm font-bold font-mono ${
                  isProfitPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <span className="sm:hidden font-normal text-[10px] opacity-65 mr-1 text-gray-500 dark:text-zinc-400">
                  利润:
                </span>
                {isProfitPositive ? '+' : ''}
                {formatCurrency(latestHistoryPoint.calculated_profit ?? 0, currencyConfig, 2)}
              </div>
            </div>
          )}

          {/* 标的物状态下的标的总市值 */}
          {activeTab === 'subject' && hasSubjectPositions && (
            <div className="text-right">
              <div className="text-[9px] uppercase font-bold tracking-wider opacity-40 hidden sm:block">
                标的总市值
              </div>
              <div className="text-xs sm:text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                <span className="sm:hidden font-normal text-[10px] opacity-65 mr-1 text-gray-500 dark:text-zinc-400">
                  市值:
                </span>
                {formatCurrency(subjectSummary.totalMarketValue, currencyConfig, 2)}
              </div>
            </div>
          )}

          {/* 折叠/展开箭头图标 */}
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
              isExpanded ? 'rotate-180 bg-black/5 dark:bg-white/10' : 'bg-transparent'
            } ${themes[theme].text}`}
          >
            <ChevronDown className="w-4 h-4 sm:w-4.5 sm:h-4.5 opacity-70" />
          </div>
        </div>
      </div>

      {/* 展开内容区：子面板常驻 DOM 保持 TradingView 图表与状态不被销毁，统一基准高度消除跳变 */}
      <div className={`${isExpanded ? 'block' : 'hidden'} border-t ${themes[theme].border} min-h-[320px] sm:min-h-[350px] transition-all duration-300 ease-out`}>
        {/* 组合概览子面板 */}
        {hasOverview && portfolioData && (
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <PortfolioOverview
              theme={theme}
              portfolioData={portfolioData}
              currencyConfig={currencyConfig}
              activityLogsCount={activityLogsCount}
              onOpenLog={onOpenLog ?? (() => {})}
              currentUnderlyingPrice={currentUnderlyingPrice}
              showHeader={false}
            />
          </div>
        )}

        {/* 历史走势子面板 */}
        <div className={activeTab === 'history' ? 'block' : 'hidden'}>
          <OptionPortfolioHistoryChart
            theme={theme}
            accountAlias={effectiveAccountAlias}
            showHeader={false}
            defaultRange="6m"
            onLatestPointChange={setLatestHistoryPoint}
          />
        </div>

        {/* 标的物持仓子面板 */}
        {hasSubjectPositions && (
          <div className={activeTab === 'subject' ? 'block' : 'hidden'}>
            <SubjectPositionsPanel
              theme={theme}
              positions={effectiveSubjectPositions}
              currencyConfig={currencyConfig}
              showHeader={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
