import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Zap, TrendingUp, TrendingDown, HelpCircle, X, Layers, Wallet, Landmark } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
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
 * 精密物理质感 SVG 电池组件 (绝对不坍塌、不失真)
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

function SvgBatteryGauge({ ratio, config }: SvgBatteryGaugeProps) {
  const gradId = useId();
  const clampedRatio = Math.min(100, Math.max(0, ratio));
  // 电池内部电量最大可用绘制宽度为 30px (x=4.5 到 34.5)
  const maxFillWidth = 30;
  const fillWidth = (clampedRatio / 100) * maxFillWidth;

  return (
    <svg
      width="40"
      height="20"
      viewBox="0 0 44 22"
      className="shrink-0 overflow-visible drop-shadow-2xs"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={config.startColor} />
          <stop offset="100%" stopColor={config.stopColor} />
        </linearGradient>
      </defs>

      {/* 电池主体外壳 */}
      <rect
        x="1.5"
        y="1.5"
        width="36"
        height="19"
        rx="5"
        ry="5"
        fill="none"
        stroke={config.strokeColor}
        strokeWidth="2"
      />

      {/* 电池正极帽 (凸起端子) */}
      <path
        d="M 38.5 7.5 C 40.5 7.5, 41.5 8.5, 41.5 10 L 41.5 12 C 41.5 13.5, 40.5 14.5, 38.5 14.5 Z"
        fill={config.strokeColor}
      />

      {/* 内部电量填充 */}
      {fillWidth > 0 && (
        <rect
          x="4.5"
          y="4.5"
          width={Math.max(2, fillWidth)}
          height="13"
          rx="3"
          ry="3"
          fill={`url(#${gradId})`}
          className="transition-all duration-500 ease-out"
        />
      )}

      {/* 硬件刻度微细虚线 */}
      <line x1="12" y1="4.5" x2="12" y2="17.5" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 1" />
      <line x1="19.5" y1="4.5" x2="19.5" y2="17.5" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 1" />
      <line x1="27" y1="4.5" x2="27" y2="17.5" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 1" />
    </svg>
  );
}

/**
 * 仓位电量指示器与详情浮层
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

  // 监听移动端视口
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

  // 根据仓位高低匹配电源色彩、标签与渐变
  const getBatteryTheme = (ratio: number) => {
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
  };

  const batteryConfig = getBatteryTheme(clampedRatio);

  // 精准计算桌面端浮层在视口中的绝对定位
  const updateCoords = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.offsetWidth || 340;
    const popoverHeight = popoverRef.current?.offsetHeight || 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right - popoverWidth;
    if (left < 12) {
      left = Math.max(12, rect.left);
    }
    if (left + popoverWidth > vw - 12) {
      left = vw - popoverWidth - 12;
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
      {/* 电源样式交互胶囊按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-expanded={isOpen}
        aria-label={`当前仓位比例: ${positionRatio.toFixed(2)}%，点击或悬停查看详情`}
        className={`group flex items-center gap-2.5 sm:gap-3 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl border transition-all duration-200 text-left select-none cursor-pointer active:scale-95 ${
          theme === 'dark'
            ? 'bg-gray-800/60 hover:bg-gray-800/90 border-gray-700/80 hover:border-gray-600'
            : theme === 'blue'
            ? 'bg-blue-900/40 hover:bg-blue-900/60 border-blue-800/70 hover:border-blue-700'
            : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 hover:border-slate-300'
        } ${isOpen ? 'ring-2 ring-blue-500/30 border-blue-400/50 shadow-md' : 'shadow-2xs'}`}
      >
        {/* 左侧：精工 SVG 电池组件 */}
        <SvgBatteryGauge
          ratio={clampedRatio}
          theme={theme}
          config={{
            startColor: batteryConfig.startColor,
            stopColor: batteryConfig.stopColor,
            strokeColor: batteryConfig.strokeColor,
          }}
        />

        {/* 右侧：仓位百分比数值与状态 */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 leading-none">
            <span className={`text-[10px] sm:text-xs font-medium opacity-65 ${themes[theme].text}`}>
              仓位
            </span>
            <span
              className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded-full font-medium border leading-none ${batteryConfig.badgeBg}`}
            >
              {batteryConfig.label}
            </span>
          </div>
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5">
            <span
              className={`text-base sm:text-xl font-extrabold tracking-tight font-mono tabular-nums ${themes[theme].text}`}
            >
              {positionRatio.toFixed(1)}%
            </span>
            <Zap className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${batteryConfig.boltColor} shrink-0 opacity-80 group-hover:scale-110 transition-transform`} />
          </div>
        </div>
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
              {/* 移动端顶部把手小横线 */}
              {isMobile && (
                <div className="w-10 h-1 bg-slate-300 dark:bg-gray-600 rounded-full mx-auto mb-3 opacity-60" />
              )}

              {/* 浮层顶部：标题与仓位状态 */}
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

              {/* 资产分布条 (双色分段对比) */}
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
                {/* 持仓证券市值 */}
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

                {/* 剩余可用现金 */}
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

                {/* 账户总资产合计 */}
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
 * 重新设计的资产概览总成组件 (全端自适应响应式)
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

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 md:p-6 transition-all duration-200 ${
        theme === 'dark'
          ? 'bg-gray-900/60 border-gray-800/80 shadow-xs'
          : theme === 'blue'
          ? 'bg-blue-950/40 border-blue-900/70 shadow-xs'
          : 'bg-gradient-to-br from-white to-slate-50/80 border-slate-200/80 shadow-2xs'
      }`}
    >
      {/* 顶层主行：左侧核心金额与盈亏 + 右侧电池电量指示器并排 */}
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {/* 左侧区域：现有账户金额 (Hero) 与 持仓盈亏 */}
        <div className="flex flex-col min-w-0 flex-1">
          {/* 标签栏 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs sm:text-sm font-medium tracking-wide uppercase ${themes[theme].text} opacity-70`}
            >
              现有账户金额
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium border ${
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

          {/* 核心金额数字 */}
          <div className="mt-1">
            <h1
              className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight font-mono tabular-nums leading-none ${themes[theme].text} truncate`}
              title={formatCurrency(latestTrendValue, currencyConfig)}
            >
              {formatCurrency(latestTrendValue, currencyConfig)}
            </h1>
          </div>

          {/* 持仓盈亏胶囊 Badge */}
          <div className="flex items-center gap-2 mt-2">
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-semibold border ${
                isProfit
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
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
                <span className="opacity-75 text-[11px] sm:text-xs">
                  ({isProfit ? '+' : ''}
                  {pnlPercentage.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          {/* 辅助说明（在桌面端展示，手机端隐藏以保持精简） */}
          <p className={`hidden sm:block text-xs ${themes[theme].text} opacity-50 mt-1.5`}>
            {hasTrendData
              ? '基于账户最新资产趋势与市场实时数据核算'
              : '当前根据持仓市值进行估算汇总'}
          </p>
        </div>

        {/* 右侧区域：精密电源电池样式的仓位指示器 */}
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
    </div>
  );
}
