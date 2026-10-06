import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Zap, TrendingUp, TrendingDown, HelpCircle, X, Layers, Wallet, Landmark } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { InfoTooltip } from '../../../shared/components';
import type { CurrencyConfig } from '../../../shared/types';
import { formatCurrency } from '../../../shared/utils/format';

interface StatsGridProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  latestTrendValue: number;
  totalHoldingsValue: number;
  positionRatio: number;
  totalProfitLoss: number;
  remainingCash: number;
  hasTrendData?: boolean;
}

/**
 * 极简精工 SVG 电池指示条 (小巧灵动，绝不坍塌)
 */
interface SvgBatteryGaugeProps {
  ratio: number;
  theme: Theme;
  config: {
    startColor: string;
    stopColor: string;
    strokeColor: string;
  };
}

export function SvgBatteryGauge({ ratio, config }: SvgBatteryGaugeProps) {
  const gradId = useId();
  const clampedRatio = Math.min(100, Math.max(0, ratio));
  const maxFillWidth = 24;
  const fillWidth = (clampedRatio / 100) * maxFillWidth;

  return (
    <svg
      width="30"
      height="15"
      viewBox="0 0 36 18"
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={config.startColor} />
          <stop offset="100%" stopColor={config.stopColor} />
        </linearGradient>
      </defs>

      {/* 电池主体边框 */}
      <rect
        x="1.2"
        y="1.2"
        width="30"
        height="15.6"
        rx="4"
        ry="4"
        fill="none"
        stroke={config.strokeColor}
        strokeWidth="1.6"
      />

      {/* 正极凸起帽 */}
      <path
        d="M 32.2 6 C 33.6 6, 34.2 6.8, 34.2 8 L 34.2 10 C 34.2 11.2, 33.6 12, 32.2 12 Z"
        fill={config.strokeColor}
      />

      {/* 电量填充 */}
      {fillWidth > 0 && (
        <rect
          x="3.2"
          y="3.2"
          width={Math.max(2, fillWidth)}
          height="11.6"
          rx="2.5"
          ry="2.5"
          fill={`url(#${gradId})`}
          className="transition-all duration-500 ease-out"
        />
      )}

      {/* 硬件刻度微线 */}
      <line x1="10.5" y1="3.2" x2="10.5" y2="14.8" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="1 1" />
      <line x1="17" y1="3.2" x2="17" y2="14.8" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="1 1" />
      <line x1="23.5" y1="3.2" x2="23.5" y2="14.8" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="1 1" />
    </svg>
  );
}

export function getBatteryTheme(ratio: number, theme: Theme) {
  const isDark = theme === 'dark' || theme === 'blue';
  const stroke = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.45)';

  if (ratio >= 85) {
    return {
      label: '重仓',
      startColor: '#10b981',
      stopColor: '#14b8a6',
      strokeColor: stroke,
      textClass: 'text-emerald-500 dark:text-emerald-400',
      badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      boltColor: 'text-emerald-500',
      barGradient: 'from-emerald-500 via-teal-400 to-emerald-400',
    };
  }
  if (ratio >= 50) {
    return {
      label: '中高仓',
      startColor: '#3b82f6',
      stopColor: '#06b6d4',
      strokeColor: stroke,
      textClass: 'text-blue-500 dark:text-blue-400',
      badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      boltColor: 'text-blue-500',
      barGradient: 'from-blue-500 via-cyan-400 to-emerald-400',
    };
  }
  if (ratio >= 20) {
    return {
      label: '轻仓',
      startColor: '#0ea5e9',
      stopColor: '#3b82f6',
      strokeColor: stroke,
      textClass: 'text-sky-500 dark:text-sky-400',
      badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
      boltColor: 'text-sky-500',
      barGradient: 'from-sky-500 to-blue-400',
    };
  }
  return {
    label: '防守',
    startColor: '#f59e0b',
    stopColor: '#eab308',
    strokeColor: stroke,
    textClass: 'text-amber-500 dark:text-amber-400',
    badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    boltColor: 'text-amber-500',
    barGradient: 'from-amber-400 to-yellow-500',
  };
}

/**
 * 紧凑型仓位电量胶囊微组件 (右上角对齐，填补右侧空白)
 */
interface PositionPowerGaugeProps {
  theme: Theme;
  currencyConfig: CurrencyConfig;
  positionRatio: number;
  totalHoldingsValue: number;
  remainingCash: number;
  latestTrendValue: number;
  hasTrendData: boolean;
}

function PositionPowerGauge({
  theme,
  currencyConfig,
  positionRatio,
  totalHoldingsValue,
  remainingCash,
  latestTrendValue,
  hasTrendData,
}: PositionPowerGaugeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const clampedRatio = Math.min(100, Math.max(0, positionRatio));
  const cashRatio = Math.max(0, 100 - positionRatio);
  const batteryConfig = getBatteryTheme(clampedRatio, theme);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.offsetWidth || 340;
    const popoverHeight = popoverRef.current?.offsetHeight || 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right - popoverWidth;
    if (left + popoverWidth > vw - 12) {
      left = vw - popoverWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const placeAbove = spaceBelow < popoverHeight + 16 && spaceAbove > spaceBelow;

    const top = placeAbove
      ? Math.max(12, rect.top - popoverHeight - 8)
      : rect.bottom + 8;

    setCoords({ top, left, placeAbove });
  }, []);

  const handleMouseEnter = () => {
    if (isMobile) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    if (isOpen && !isMobile) {
      updateCoords();
      const handleScrollOrResize = () => updateCoords();
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
      return () => {
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen, isMobile, updateCoords]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const popoverBg =
    theme === 'dark'
      ? 'bg-gray-900/98 border-gray-700 text-gray-100 shadow-2xl shadow-black/80'
      : theme === 'blue'
      ? 'bg-[#0f1d38]/98 border-blue-800 text-blue-50 shadow-2xl shadow-blue-950/80'
      : 'bg-white/98 border-slate-200 text-slate-800 shadow-2xl shadow-slate-400/30';

  const cardInnerBg =
    theme === 'dark'
      ? 'bg-gray-800/70 border-gray-700/70'
      : theme === 'blue'
      ? 'bg-blue-900/40 border-blue-800/70'
      : 'bg-slate-50 border-slate-200/70';

  const popoverHeaderBorder =
    theme === 'dark'
      ? 'border-gray-800'
      : theme === 'blue'
      ? 'border-blue-900/80'
      : 'border-slate-100';

  return (
    <div className="relative inline-block shrink-0">
      {/* 极简一体化仓位胶囊 (Pill Badge) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-expanded={isOpen}
        aria-label={`当前仓位比例: ${positionRatio.toFixed(2)}%，点击或悬停查看详情`}
        className={`group inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl border transition-all duration-150 select-none cursor-pointer whitespace-nowrap active:scale-95 ${
          theme === 'dark'
            ? 'bg-gray-800/80 hover:bg-gray-800 border-gray-700 hover:border-gray-600'
            : theme === 'blue'
            ? 'bg-blue-900/40 hover:bg-blue-900/60 border-blue-800/80 hover:border-blue-700'
            : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 hover:border-slate-300'
        } ${isOpen ? 'ring-2 ring-blue-500/30 border-blue-400/60 shadow-xs' : 'shadow-2xs'}`}
      >
        {/* SVG 精工电池 */}
        <SvgBatteryGauge
          ratio={clampedRatio}
          theme={theme}
          config={{
            startColor: batteryConfig.startColor,
            stopColor: batteryConfig.stopColor,
            strokeColor: batteryConfig.strokeColor,
          }}
        />

        {/* 仓位数值与微徽章 */}
        <div className="flex items-center gap-1 font-mono">
          <span className={`text-xs font-bold ${themes[theme].text}`}>
            {positionRatio.toFixed(1)}%
          </span>
          <span
            className={`text-[9px] px-1 py-0.2 rounded-md font-medium border leading-none ${batteryConfig.badgeBg}`}
          >
            {batteryConfig.label}
          </span>
        </div>

        <Zap className={`w-3 h-3 ${batteryConfig.boltColor} opacity-75 group-hover:scale-110 transition-transform`} />
      </button>

      {/* 详情浮层：移动端采用底部抽屉 (Bottom Sheet)，桌面端采用定位气泡 (Popover) */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* 移动端全屏半透明遮罩 */}
            {isMobile && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[9998] animate-in fade-in-0 duration-150"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
              />
            )}

            {/* 浮层主体 */}
            <div
              ref={popoverRef}
              role="tooltip"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={
                isMobile
                  ? { zIndex: 9999 }
                  : {
                      position: 'fixed',
                      top: coords ? `${coords.top}px` : undefined,
                      left: coords ? `${coords.left}px` : undefined,
                      visibility: coords ? 'visible' : 'hidden',
                      zIndex: 9999,
                    }
              }
              className={
                isMobile
                  ? `fixed inset-x-3 bottom-5 z-[9999] max-h-[85vh] rounded-2xl border p-4 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-4 duration-200 overflow-y-auto ${popoverBg}`
                  : `w-80 sm:w-88 rounded-2xl border p-4 backdrop-blur-md transition-all duration-150 animate-in fade-in-0 zoom-in-95 ${popoverBg}`
              }
            >
              {/* 移动端顶部把手横线 */}
              {isMobile && (
                <div className="w-10 h-1 bg-slate-300 dark:bg-gray-600 rounded-full mx-auto mb-3 opacity-60" />
              )}

              {/* 浮层顶部 */}
              <div className={`flex items-center justify-between pb-3 border-b ${popoverHeaderBorder}`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${batteryConfig.badgeBg}`}>
                    <Zap className={`w-4 h-4 ${batteryConfig.boltColor}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold leading-tight">仓位与资产拆解</h4>
                    <p className="text-[11px] opacity-60">资产利用与流动性分布</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 资产分布条 */}
              <div className="mt-3.5">
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    持仓证券 ({positionRatio.toFixed(1)}%)
                  </span>
                  <span className="flex items-center gap-1.5 opacity-70">
                    <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
                    剩余现金 ({cashRatio.toFixed(1)}%)
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-gray-800 overflow-hidden flex">
                  <div
                    className={`h-full bg-gradient-to-r ${batteryConfig.barGradient} transition-all duration-300`}
                    style={{ width: `${clampedRatio}%` }}
                    title={`持仓占比: ${positionRatio.toFixed(2)}%`}
                  />
                  <div
                    className="h-full bg-slate-400/40 dark:bg-gray-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, cashRatio))}%` }}
                    title={`现金占比: ${cashRatio.toFixed(2)}%`}
                  />
                </div>
              </div>

              {/* 详细指标清单 */}
              <div className="mt-3.5 space-y-2">
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${cardInnerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium opacity-80">持仓证券市值</div>
                      <div className="text-[10px] opacity-50">所有证券当前市场估值合计</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono">
                      {formatCurrency(totalHoldingsValue, currencyConfig)}
                    </div>
                    <div className="text-[10px] font-medium text-emerald-500">
                      {positionRatio.toFixed(2)}% 仓位
                    </div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${cardInnerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-blue-500/10 text-blue-500">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium opacity-80">剩余可用现金</div>
                      <div className="text-[10px] opacity-50">总资产扣除证券后的流动资金</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono">
                      {formatCurrency(remainingCash, currencyConfig)}
                    </div>
                    <div className="text-[10px] font-medium opacity-60">
                      {cashRatio.toFixed(2)}% 现金
                    </div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${cardInnerBg}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-indigo-500/10 text-indigo-500">
                      <Landmark className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium opacity-80">当前账户总资产</div>
                      <div className="text-[10px] opacity-50">持仓市值 + 剩余现金</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono">
                      {formatCurrency(latestTrendValue, currencyConfig)}
                    </div>
                    <div className="text-[10px] font-medium opacity-60">
                      100.00%
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部说明 */}
              <div className="mt-3 pt-2.5 border-t border-slate-200/50 dark:border-gray-800/60 text-[11px] opacity-55 flex items-start gap-1.5 leading-relaxed">
                <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {hasTrendData
                    ? '总资产基于最新趋势数据计算，持仓比例 = 证券市值 ÷ 总资产。'
                    : '当前基于持仓总值进行资产核算，现金部分为估算值。'}
                </span>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

/**
 * 资产总成组件 (自适应金融面板：桌面端 4 列精工 KPI 矩阵，移动端紧凑英雄胶囊)
 */
export function StatsGrid({
  theme,
  currencyConfig,
  latestTrendValue,
  totalHoldingsValue,
  positionRatio,
  totalProfitLoss,
  remainingCash,
  hasTrendData = false,
}: StatsGridProps) {
  const isProfit = totalProfitLoss >= 0;

  // 估算持仓盈亏比例（基于持仓总成本）
  const estimatedCost = totalHoldingsValue - totalProfitLoss;
  const pnlPercentage =
    estimatedCost > 0 ? (totalProfitLoss / estimatedCost) * 100 : null;

  const clampedRatio = Math.min(100, Math.max(0, positionRatio));
  const cashRatio = Math.max(0, 100 - positionRatio);
  const batteryConfig = getBatteryTheme(clampedRatio, theme);

  return (
    <div>
      {/* 桌面端高阶金融看板：4 列精工 KPI 矩阵 (解决 PC 端过往大面积留白与数据隐蔽问题) */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 pt-1">
        {/* 卡片 1: 现有总资产 */}
        <div
          className={`${themes[theme].background} rounded-2xl p-4 border ${themes[theme].border} card-subtle-ring flex flex-col justify-between transition-all duration-150 hover:border-blue-500/30 shadow-2xs`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs font-semibold uppercase tracking-wider opacity-70 ${themes[theme].text}`}>
                现有总资产
              </span>
              <InfoTooltip
                theme={theme}
                content="优先使用最新一条总资产趋势数据，表示组合在当前时点的总资产估值。"
                align="left"
              />
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-medium border leading-none ${
                theme === 'dark'
                  ? 'bg-gray-800 text-gray-300 border-gray-700'
                  : theme === 'blue'
                  ? 'bg-blue-900/50 text-blue-200 border-blue-800'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {hasTrendData ? '最新估值' : '持仓估值'}
            </span>
          </div>

          <div className="my-2.5">
            <div
              className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums truncate ${themes[theme].text}`}
              title={formatCurrency(latestTrendValue, currencyConfig)}
            >
              {formatCurrency(latestTrendValue, currencyConfig)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border whitespace-nowrap shadow-2xs ${
                isProfit
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25'
              }`}
              title="持仓累计浮动盈亏"
            >
              {isProfit ? (
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {isProfit ? '+' : '-'}
                {formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
              </span>
              {pnlPercentage !== null && (
                <span className="opacity-80 text-[11px]">
                  ({isProfit ? '+' : ''}
                  {pnlPercentage.toFixed(2)}%)
                </span>
              )}
            </div>
            <span className={`text-[11px] opacity-50 truncate ${themes[theme].text}`}>
              浮动盈亏
            </span>
          </div>
        </div>

        {/* 卡片 2: 持仓证券市值 */}
        <div
          className={`${themes[theme].background} rounded-2xl p-4 border ${themes[theme].border} card-subtle-ring flex flex-col justify-between transition-all duration-150 hover:border-emerald-500/30 shadow-2xs`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs font-semibold uppercase tracking-wider opacity-70 ${themes[theme].text}`}>
                持仓证券市值
              </span>
              <InfoTooltip
                theme={theme}
                content="所有持仓证券当前市场估值合计，不含现金部分。"
                align="left"
              />
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-medium border leading-none ${batteryConfig.badgeBg}`}>
              {positionRatio.toFixed(1)}% 仓位
            </span>
          </div>

          <div className="my-2.5">
            <div
              className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums truncate ${themes[theme].text}`}
              title={formatCurrency(totalHoldingsValue, currencyConfig)}
            >
              {formatCurrency(totalHoldingsValue, currencyConfig)}
            </div>
          </div>

          <div className={`text-xs opacity-60 flex items-center justify-between ${themes[theme].text}`}>
            <span>证券资产配置</span>
            <span className="font-mono font-medium">{positionRatio.toFixed(1)}%</span>
          </div>
        </div>

        {/* 卡片 3: 剩余可用现金 */}
        <div
          className={`${themes[theme].background} rounded-2xl p-4 border ${themes[theme].border} card-subtle-ring flex flex-col justify-between transition-all duration-150 hover:border-blue-500/30 shadow-2xs`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs font-semibold uppercase tracking-wider opacity-70 ${themes[theme].text}`}>
                剩余可用现金
              </span>
              <InfoTooltip
                theme={theme}
                content="总资产扣除持仓市值后的流动现金储备。"
                align="left"
              />
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-medium border leading-none ${
                theme === 'dark'
                  ? 'bg-blue-950/40 text-blue-300 border-blue-800'
                  : theme === 'blue'
                  ? 'bg-blue-900/50 text-blue-200 border-blue-800'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}
            >
              {cashRatio.toFixed(1)}% 现金
            </span>
          </div>

          <div className="my-2.5">
            <div
              className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums truncate ${themes[theme].text}`}
              title={formatCurrency(remainingCash, currencyConfig)}
            >
              {formatCurrency(remainingCash, currencyConfig)}
            </div>
          </div>

          <div className={`text-xs opacity-60 flex items-center justify-between ${themes[theme].text}`}>
            <span>流动性现金储备</span>
            <span className="font-mono font-medium">{cashRatio.toFixed(1)}%</span>
          </div>
        </div>

        {/* 卡片 4: 仓位配置水平 */}
        <div
          className={`${themes[theme].background} rounded-2xl p-4 border ${themes[theme].border} card-subtle-ring flex flex-col justify-between transition-all duration-150 hover:border-purple-500/30 shadow-2xs`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs font-semibold uppercase tracking-wider opacity-70 ${themes[theme].text}`}>
                仓位配置水平
              </span>
              <InfoTooltip
                theme={theme}
                content="持仓市值占总资产的比重，直观体现资金利用率与敞口风险。"
                align="left"
              />
            </div>
            <div className="flex items-center gap-1">
              <SvgBatteryGauge
                ratio={clampedRatio}
                theme={theme}
                config={{
                  startColor: batteryConfig.startColor,
                  stopColor: batteryConfig.stopColor,
                  strokeColor: batteryConfig.strokeColor,
                }}
              />
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border leading-none ${batteryConfig.badgeBg}`}>
                {batteryConfig.label}
              </span>
            </div>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums ${themes[theme].text}`}>
              {positionRatio.toFixed(1)}%
            </div>
            <div className={`text-xs font-mono opacity-60 ${themes[theme].text}`}>
              现金 {cashRatio.toFixed(1)}%
            </div>
          </div>

          {/* 双色资产分布条 */}
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-gray-800 overflow-hidden flex">
              <div
                className={`h-full bg-gradient-to-r ${batteryConfig.barGradient} transition-all duration-500`}
                style={{ width: `${clampedRatio}%` }}
                title={`持仓: ${positionRatio.toFixed(1)}%`}
              />
              <div
                className="h-full bg-slate-400/40 dark:bg-gray-600 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, cashRatio))}%` }}
                title={`现金: ${cashRatio.toFixed(1)}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 移动端紧凑布局 (< sm，保留极佳的单手操作与高屏占比) */}
      <div className="sm:hidden pt-0.5 pb-1">
        {/* 顶栏：左侧标签 + 右侧仓位电池胶囊 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-medium uppercase tracking-wider opacity-65 ${themes[theme].text}`}
            >
              现有账户金额
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-medium border ${
                theme === 'dark'
                  ? 'bg-gray-800/80 text-gray-300 border-gray-700'
                  : theme === 'blue'
                  ? 'bg-blue-900/40 text-blue-200 border-blue-800'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {hasTrendData ? '最新估值' : '持仓估值'}
            </span>
          </div>

          <PositionPowerGauge
            theme={theme}
            currencyConfig={currencyConfig}
            positionRatio={positionRatio}
            totalHoldingsValue={totalHoldingsValue}
            remainingCash={remainingCash}
            latestTrendValue={latestTrendValue}
            hasTrendData={hasTrendData}
          />
        </div>

        {/* 主金额行：核心金额数字 + 盈亏徽标并排 */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 mt-1">
          <h1
            className={`text-2xl font-extrabold tracking-tight font-mono tabular-nums leading-none ${themes[theme].text}`}
            title={formatCurrency(latestTrendValue, currencyConfig)}
          >
            {formatCurrency(latestTrendValue, currencyConfig)}
          </h1>

          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border whitespace-nowrap shadow-2xs ${
              isProfit
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25'
            }`}
            title="持仓累计浮动盈亏"
          >
            {isProfit ? (
              <TrendingUp className="w-3 h-3 shrink-0" />
            ) : (
              <TrendingDown className="w-3 h-3 shrink-0" />
            )}
            <span>
              {isProfit ? '+' : '-'}
              {formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
            </span>
            {pnlPercentage !== null && (
              <span className="opacity-80 text-[10px]">
                ({isProfit ? '+' : ''}
                {pnlPercentage.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
