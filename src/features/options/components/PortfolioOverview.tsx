import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Dot,
  Coins,
  PieChart,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsPortfolioData } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types/ui';

export interface PortfolioOverviewProps {
  theme: Theme;
  portfolioData: OptionsPortfolioData;
  currencyConfig: CurrencyConfig;
  activityLogsCount: number;
  onOpenLog: () => void;
  currentUnderlyingPrice?: number | null;
  showHeader?: boolean;
}

export function PortfolioOverview({
  theme,
  portfolioData,
  currencyConfig,
  activityLogsCount,
  onOpenLog,
  currentUnderlyingPrice,
  showHeader = true,
}: PortfolioOverviewProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
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

  const cardShadow = useMemo(() => {
    if (theme === 'dark') return 'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_12px_28px_-16px_rgba(0,0,0,0.45)]';
    if (theme === 'blue') return 'shadow-[0_1px_2px_rgba(30,64,175,0.04),0_10px_28px_-16px_rgba(37,99,235,0.10)]';
    return 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.08)]';
  }, [theme]);

  const tileDivider = useMemo(() => {
    if (theme === 'dark') return 'border-zinc-800/80';
    if (theme === 'blue') return 'border-blue-100/80';
    return 'border-slate-200/70';
  }, [theme]);

  const bgHighlight = useMemo(() => {
    if (theme === 'dark') return 'from-zinc-800/60 via-zinc-900/20 to-transparent';
    if (theme === 'blue') return 'from-blue-50/90 via-blue-50/40 to-transparent';
    return 'from-slate-50/90 via-slate-50/40 to-transparent';
  }, [theme]);

  // 基础资产数值
  const balance = portfolioData.balance ?? 0;
  const available = portfolioData.available ?? 0;
  const realUsedMargin = portfolioData.real_used_margin ?? 0;
  const positionProfit = portfolioData.position_profit ?? 0;

  // 标的物总市值
  const subjectTotalValue = useMemo(() => {
    return (portfolioData.subject_positions || []).reduce((acc, p) => acc + (p.total_stock_price || 0), 0);
  }, [portfolioData.subject_positions]);

  const subjectPositionsCount = portfolioData.subject_positions?.length || 0;
  const optionsValue = portfolioData.totalValue ?? 0;
  const advisedComboCount = portfolioData.advised_combinations?.length || 0;

  // 保证金利用率与安全垫计算
  const marginUtilization = balance > 0 ? (realUsedMargin / balance) * 100 : 0;
  const availableRatio = balance > 0 ? (available / balance) * 100 : 0;

  // 资产配置比例
  const totalTrackedAssets = Math.max(1, balance + subjectTotalValue);
  const cashPct = Math.max(0, Math.min(100, (available / totalTrackedAssets) * 100));
  const marginPct = Math.max(0, Math.min(100, (realUsedMargin / totalTrackedAssets) * 100));
  const stockPct = Math.max(0, Math.min(100, (subjectTotalValue / totalTrackedAssets) * 100));

  // 风控健康状态判断
  const marginHealth = useMemo(() => {
    if (marginUtilization > 85) {
      return {
        label: '高杠杆预警',
        subText: '保证金占用较高，需密切关注标的剧烈波动风险',
        badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        barColor: 'bg-rose-500',
        icon: ShieldAlert,
      };
    }
    if (marginUtilization > 60) {
      return {
        label: '适度占用',
        subText: '仓位与备兑较为平衡，留存合理缓冲资金',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        barColor: 'bg-amber-500',
        icon: ShieldCheck,
      };
    }
    return {
      label: '安全垫充裕',
      subText: '可用资金充足，具备极强的抗波动与灵活调仓弹性',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      barColor: 'bg-emerald-500',
      icon: ShieldCheck,
    };
  }, [marginUtilization]);

  const HealthIcon = marginHealth.icon;

  const stats = useMemo(() => {
    return [
      {
        label: '总金额',
        subLabel: 'balance',
        value: formatCurrency(balance, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
      {
        label: '可用金额',
        subLabel: 'available',
        value: formatCurrency(available, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
      {
        label: '当前仓位盈亏',
        subLabel: 'position_profit',
        value: `${positionProfit >= 0 ? '+' : ''}${formatCurrency(Math.abs(positionProfit), currencyConfig, 4)}`,
        valueClassName: positionProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        mono: true,
      },
      {
        label: '使用保证金',
        subLabel: 'real_used_margin',
        value: formatCurrency(realUsedMargin, currencyConfig, 4),
        valueClassName: themes[theme].text,
        mono: true,
      },
    ];
  }, [currencyConfig, available, balance, positionProfit, realUsedMargin, theme]);

  // 完整概览内容（4 格核心磁贴 + 2 块专业风控与资产深度卡片）
  const renderOverviewContent = () => (
    <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
      {/* 4 核心资产磁贴 */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 ${tileDivider} rounded-xl overflow-hidden border ${tileDivider}`}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`px-3 py-2.5 sm:px-4 sm:py-3 ${
              theme === 'dark'
                ? 'bg-zinc-900/30 hover:bg-zinc-800/40'
                : theme === 'blue'
                  ? 'bg-white/60 hover:bg-blue-50/60'
                  : 'bg-white/60 hover:bg-slate-50/80'
            } transition-colors duration-150`}
          >
            <div className="flex items-center justify-between gap-1">
              <h3 className={`text-[11px] sm:text-xs font-medium ${themes[theme].text} opacity-70 tracking-wide`}>
                {stat.label}
              </h3>
              {stat.subLabel && (
                <span className="text-[10px] font-mono opacity-35 hidden sm:inline">
                  {stat.subLabel}
                </span>
              )}
            </div>
            <p className={`text-[15px] sm:text-[20px] font-semibold mt-1 tracking-tight break-all ${stat.valueClassName} ${stat.mono ? 'font-mono tabular-nums' : ''}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* 2 深度概览卡片 (资金健康度 + 资产配置分布) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* 卡片 1: 资金效率与风险监控 */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border ${tileDivider} ${
            theme === 'dark'
              ? 'bg-zinc-900/25'
              : theme === 'blue'
                ? 'bg-blue-50/40'
                : 'bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-blue-500" strokeWidth={2} />
              <span className={`text-xs sm:text-sm font-semibold ${themes[theme].text}`}>
                资金效率与风控安全垫
              </span>
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${marginHealth.badgeClass}`}>
              <HealthIcon className="w-3 h-3" />
              <span>{marginHealth.label}</span>
            </span>
          </div>

          {/* 保证金利用率进度条 */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className={`${themes[theme].text} opacity-70`}>保证金占用率</span>
              <span className={`font-mono font-bold ${themes[theme].text}`}>
                {marginUtilization.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${marginHealth.barColor}`}
                style={{ width: `${Math.min(100, Math.max(0, marginUtilization))}%` }}
              />
            </div>
          </div>

          {/* 细分指标 */}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-black/5 dark:border-white/5 text-xs">
            <div>
              <div className={`text-[10.5px] ${themes[theme].text} opacity-60`}>可用安全垫比例</div>
              <div className="font-semibold font-mono tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                {availableRatio.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className={`text-[10.5px] ${themes[theme].text} opacity-60`}>可用资金缓冲</div>
              <div className={`font-semibold font-mono tabular-nums mt-0.5 ${themes[theme].text}`}>
                {formatCurrency(available, currencyConfig, 2)}
              </div>
            </div>
          </div>

          <p className={`text-[11px] ${themes[theme].text} opacity-60 mt-2.5 leading-relaxed`}>
            {marginHealth.subText}
          </p>
        </div>

        {/* 卡片 2: 资产构成与配置分布 */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border ${tileDivider} ${
            theme === 'dark'
              ? 'bg-zinc-900/25'
              : theme === 'blue'
                ? 'bg-blue-50/40'
                : 'bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-500" strokeWidth={2} />
              <span className={`text-xs sm:text-sm font-semibold ${themes[theme].text}`}>
                资产构成与配置分布
              </span>
            </div>
            {subjectPositionsCount > 0 && (
              <span className="text-[11px] font-mono opacity-65 text-indigo-600 dark:text-indigo-400">
                {subjectPositionsCount} 标的在持
              </span>
            )}
          </div>

          {/* 多段资金配置比例条 */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className={`${themes[theme].text} opacity-70`}>资产配置分布</span>
              <span className={`font-mono text-[11px] opacity-70 ${themes[theme].text}`}>
                现金 {cashPct.toFixed(0)}% · 保证金 {marginPct.toFixed(0)}%
                {stockPct > 0 ? ` · 标的 ${stockPct.toFixed(0)}%` : ''}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${cashPct}%` }}
                title={`可用现金: ${cashPct.toFixed(1)}%`}
              />
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${marginPct}%` }}
                title={`占用保证金: ${marginPct.toFixed(1)}%`}
              />
              {stockPct > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${stockPct}%` }}
                  title={`标的市值: ${stockPct.toFixed(1)}%`}
                />
              )}
            </div>
          </div>

          {/* 细分指标 */}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-black/5 dark:border-white/5 text-xs">
            <div>
              <div className={`text-[10.5px] ${themes[theme].text} opacity-60`}>标的正股市值</div>
              <div className={`font-semibold font-mono tabular-nums mt-0.5 ${themes[theme].text}`}>
                {subjectTotalValue > 0 ? formatCurrency(subjectTotalValue, currencyConfig, 2) : '暂无持股'}
              </div>
            </div>
            <div>
              <div className={`text-[10.5px] ${themes[theme].text} opacity-60`}>期权持仓现值</div>
              <div className={`font-semibold font-mono tabular-nums mt-0.5 ${themes[theme].text}`}>
                {optionsValue !== 0 ? formatCurrency(optionsValue, currencyConfig, 2) : '-'}
              </div>
            </div>
          </div>

          {/* 组合建议或标的联动提示 */}
          {advisedComboCount > 0 ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>智能优化：发现 {advisedComboCount} 组可释放保证金策略组合</span>
            </div>
          ) : (
            <p className={`text-[11px] ${themes[theme].text} opacity-60 mt-2.5 leading-relaxed truncate`}>
              {portfolioData.strategies?.length
                ? `已建仓 ${portfolioData.strategies.length} 个策略组 · 包含 ${portfolioData.singleLegPositions?.length ?? 0} 个单腿合约`
                : '期权衍生品与正股现货联动监控'}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (!showHeader) {
    return renderOverviewContent();
  }

  return (
    <div className={`${themes[theme].card} rounded-xl ${cardShadow} overflow-hidden relative isolate border ${themes[theme].border}`}>
      <div className={`absolute inset-x-0 top-0 h-px z-10 bg-gradient-to-r ${bgHighlight}`} aria-hidden="true" />
      <div className={`px-3 py-3 sm:px-5 sm:py-4 border-b ${tileDivider}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className={`text-[15px] sm:text-[17px] font-semibold tracking-tight ${themes[theme].text}`}>期权投资组合概览</h2>
            <button
              onClick={onOpenLog}
              className={`p-1.5 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-zinc-800/80 text-zinc-300'
                  : theme === 'blue'
                    ? 'hover:bg-blue-50 text-slate-700'
                    : 'hover:bg-slate-100 text-slate-700'
              } relative shrink-0`}
              title="查看持仓变动日志"
            >
              <Activity className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={1.75} />
              {activityLogsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400/80 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 ring-1 ring-white/40 dark:ring-zinc-900/40"></span>
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {currentUnderlyingPrice != null && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
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
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsMobileExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium sm:hidden ${themes[theme].secondary}`}
              aria-expanded={isMobileExpanded}
              aria-label={isMobileExpanded ? '收起概览' : '展开概览'}
            >
              {isMobileExpanded ? '收起' : '展开'}
              {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />}
            </button>
          </div>
        </div>
        <div className={`mt-2.5 grid grid-cols-2 gap-2 sm:hidden ${tileDivider}`}>
          <div className={`rounded-lg px-2.5 py-2 ${
            theme === 'dark'
              ? 'bg-zinc-800/40'
              : theme === 'blue'
                ? 'bg-blue-50/70'
                : 'bg-slate-50'
          }`}>
            <p className={`text-[10.5px] font-medium ${themes[theme].text} opacity-65`}>总金额</p>
            <p className={`text-sm font-semibold font-mono tabular-nums ${themes[theme].text} truncate`}>{stats[0].value}</p>
          </div>
          <div className={`rounded-lg px-2.5 py-2 ${
            theme === 'dark'
              ? 'bg-zinc-800/40'
              : theme === 'blue'
                ? 'bg-blue-50/70'
                : 'bg-slate-50'
          }`}>
            <p className={`text-[10.5px] font-medium ${themes[theme].text} opacity-65`}>仓位盈亏</p>
            <p className={`text-sm font-semibold font-mono tabular-nums truncate ${stats[2].valueClassName}`}>{stats[2].value}</p>
          </div>
        </div>
      </div>
      <div className={`${isMobileExpanded ? 'block' : 'hidden'} sm:block`}>
        {renderOverviewContent()}
      </div>
    </div>
  );
}
