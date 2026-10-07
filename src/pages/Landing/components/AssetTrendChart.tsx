import React, { useState, useRef, useMemo, useCallback } from 'react';
import { LineChart, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { landingTranslations, Language } from '../i18n';

export interface TrendDataPoint {
  date: string;       // e.g. '2026-09-18'
  dateLabel: string;  // e.g. '09-18'
  assetValue: number; // e.g. 238500.00
  dailyChange: number;// e.g. 1250.00
  dailyChangePct: number; // e.g. 0.53
}

export interface AssetTrendChartProps {
  data: TrendDataPoint[];
  currencySymbol: string;
  upColor: string;
  downColor: string;
  thirtyDayNetPnL: number;
  lang?: Language;
}

type ViewMode = 'combined' | 'asset' | 'pnl';

// Helper to generate smooth cubic Bezier path from coordinate points
function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to Cubic Bezier conversion
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function AssetTrendChart({
  data,
  currencySymbol,
  upColor,
  downColor,
  thirtyDayNetPnL,
  lang = 'zh',
}: AssetTrendChartProps) {
  const t = landingTranslations[lang].hero;
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // SVG dimensions
  const svgWidth = 500;
  const svgHeight = 175;
  const paddingX = 14;
  const chartWidth = svgWidth - paddingX * 2;

  // Layout boundaries based on view mode
  const { assetTop, assetBottom, pnlTop, pnlBottom, pnlBaseline } = useMemo(() => {
    if (viewMode === 'asset') {
      return {
        assetTop: 14,
        assetBottom: 145,
        pnlTop: 0,
        pnlBottom: 0,
        pnlBaseline: 0,
      };
    }
    if (viewMode === 'pnl') {
      return {
        assetTop: 0,
        assetBottom: 0,
        pnlTop: 14,
        pnlBottom: 145,
        pnlBaseline: 80,
      };
    }
    // Combined mode: Upper 60% asset line, Lower 40% PnL bars
    return {
      assetTop: 12,
      assetBottom: 94,
      pnlTop: 104,
      pnlBottom: 148,
      pnlBaseline: 126,
    };
  }, [viewMode]);

  // Compute scale boundaries
  const { minAsset, maxAsset, maxAbsPnL } = useMemo(() => {
    if (data.length === 0) {
      return { minAsset: 0, maxAsset: 100, maxAbsPnL: 100 };
    }
    const assets = data.map((d) => d.assetValue);
    const minVal = Math.min(...assets);
    const maxVal = Math.max(...assets);
    // Add 4% buffer so line doesn't hit the strict edges
    const range = maxVal - minVal || 1;
    const minWithBuffer = minVal - range * 0.05;
    const maxWithBuffer = maxVal + range * 0.05;

    const absPnLs = data.map((d) => Math.abs(d.dailyChange));
    const maxPnL = Math.max(...absPnLs, 1);

    return {
      minAsset: minWithBuffer,
      maxAsset: maxWithBuffer,
      maxAbsPnL: maxPnL,
    };
  }, [data]);

  // Map data to SVG coordinates
  const plottedPoints = useMemo(() => {
    if (data.length === 0) return [];
    const step = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

    return data.map((d, i) => {
      const x = paddingX + i * step;

      // Asset curve Y
      const assetRatio = (d.assetValue - minAsset) / (maxAsset - minAsset || 1);
      const assetY = assetBottom - assetRatio * (assetBottom - assetTop);

      // PnL bar height & Y
      const pnlMaxH = (pnlBottom - pnlTop) * 0.45;
      const barHeight = Math.max(2, (Math.abs(d.dailyChange) / maxAbsPnL) * pnlMaxH);
      const isPos = d.dailyChange >= 0;
      const barY = isPos ? pnlBaseline - barHeight : pnlBaseline;

      return {
        ...d,
        x,
        assetY,
        barY,
        barHeight,
        isPos,
      };
    });
  }, [data, chartWidth, minAsset, maxAsset, maxAbsPnL, assetTop, assetBottom, pnlTop, pnlBottom, pnlBaseline]);

  // Asset spline path and area path
  const { linePath, areaPath } = useMemo(() => {
    if (plottedPoints.length === 0 || viewMode === 'pnl') {
      return { linePath: '', areaPath: '' };
    }
    const points = plottedPoints.map((p) => ({ x: p.x, y: p.assetY }));
    const lPath = getSmoothPath(points);
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const aPath = `${lPath} L ${lastX.toFixed(1)} ${assetBottom} L ${firstX.toFixed(1)} ${assetBottom} Z`;

    return { linePath: lPath, areaPath: aPath };
  }, [plottedPoints, viewMode, assetBottom]);

  // Date labels along the X-axis (4 to 5 key dates)
  const dateTicks = useMemo(() => {
    if (data.length === 0) return [];
    if (data.length <= 4) {
      return plottedPoints.map((p, idx) => ({ ...p, align: idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle' }));
    }
    const indices = [
      0,
      Math.floor(data.length * 0.28),
      Math.floor(data.length * 0.55),
      Math.floor(data.length * 0.82),
      data.length - 1,
    ];
    // deduplicate
    const uniqueIndices = Array.from(new Set(indices));
    return uniqueIndices.map((idx, pos) => {
      const p = plottedPoints[idx];
      const align = pos === 0 ? 'start' : pos === uniqueIndices.length - 1 ? 'end' : 'middle';
      return { ...p, align };
    });
  }, [data.length, plottedPoints]);

  // Handle pointer tracking
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || plottedPoints.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relativeX = (mouseX / rect.width) * svgWidth;

    // Find nearest point
    let closestIndex = 0;
    let minDiff = Infinity;
    for (let i = 0; i < plottedPoints.length; i++) {
      const diff = Math.abs(plottedPoints[i].x - relativeX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    setHoverIndex(closestIndex);
  }, [plottedPoints, svgWidth]);

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const activePoint = hoverIndex !== null ? plottedPoints[hoverIndex] : null;
  const is30DayPositive = thirtyDayNetPnL >= 0;
  const barWidth = useMemo(() => {
    if (data.length === 0) return 6;
    const slot = chartWidth / data.length;
    return Math.max(3, Math.min(8, slot * 0.55));
  }, [data.length, chartWidth]);

  // Dynamic stroke color based on net trend
  const assetStrokeColor = '#3b82f6'; // Clean vibrant financial blue
  const dateRangeDisplay = useMemo(() => {
    if (data.length === 0) return '';
    const start = data[0].dateLabel;
    const end = data[data.length - 1].dateLabel;
    return `${start} ~ ${end}`;
  }, [data]);

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40 select-none">
      {/* Top Header: Title & View Mode Selector */}
      <div className="flex items-center justify-between text-xs mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 mr-2">
          <LineChart className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="font-semibold truncate">
            {t.assetAndPnLTitle || t.unrealizedPnL}
          </span>
        </div>

        {/* View Mode Toggle Pill */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-zinc-700/60 text-[11px] shrink-0 font-medium">
          <button
            type="button"
            onClick={() => setViewMode('combined')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              viewMode === 'combined'
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {t.viewAll || '全部'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('asset')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              viewMode === 'asset'
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {t.viewAsset || '仅资产'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pnl')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              viewMode === 'pnl'
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {t.viewPnL || '仅盈亏'}
          </button>
        </div>
      </div>

      {/* Dynamic Summary Strip: Displays Hovered Point or 30D Net PnL */}
      <div className="h-6 flex items-center justify-between text-xs px-1 mb-1 font-mono">
        {activePoint ? (
          <div className="flex items-center gap-2 sm:gap-3 w-full justify-between animate-fadeIn">
            <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-400 text-[11px]">
              <Calendar className="w-3 h-3 text-blue-500" />
              <span>{activePoint.date}</span>
            </span>
            <div className="flex items-center gap-3">
              {viewMode !== 'pnl' && (
                <span className="text-slate-700 dark:text-zinc-200 text-[11px]">
                  {t.assetLabel || '资产'}:{' '}
                  <strong className="text-slate-900 dark:text-white font-semibold">
                    {currencySymbol}{activePoint.assetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
              )}
              {viewMode !== 'asset' && (
                <span 
                  className="font-bold text-[11px]"
                  style={{ color: activePoint.isPos ? upColor : downColor }}
                >
                  {t.dailyPnLLabel || '当日'}: {activePoint.isPos ? '+' : ''}{currencySymbol}{activePoint.dailyChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({activePoint.isPos ? '+' : ''}{activePoint.dailyChangePct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                {t.netChange30D || '30日累计净收益'}
              </span>
              {dateRangeDisplay && (
                <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 font-normal whitespace-nowrap">
                  ({dateRangeDisplay})
                </span>
              )}
            </div>
            <span 
              className="font-bold whitespace-nowrap ml-2"
              style={{ color: is30DayPositive ? upColor : downColor }}
            >
              {is30DayPositive ? '+' : ''}{currencySymbol}{thirtyDayNetPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Interactive Chart Canvas */}
      <div 
        ref={containerRef}
        className="relative w-full h-44 sm:h-48 cursor-crosshair touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerMove}
      >
        <svg 
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Asset Area Gradient */}
            <linearGradient id="assetAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>

            {/* Subtle Glow Filter for Active Dot */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#3b82f6" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Reference Grid Lines */}
          {viewMode !== 'pnl' && (
            <g className="opacity-30 dark:opacity-20" stroke="currentColor" strokeDasharray="3,3">
              <line x1={paddingX} y1={assetTop} x2={svgWidth - paddingX} y2={assetTop} />
              <line x1={paddingX} y1={(assetTop + assetBottom) / 2} x2={svgWidth - paddingX} y2={(assetTop + assetBottom) / 2} />
              <line x1={paddingX} y1={assetBottom} x2={svgWidth - paddingX} y2={assetBottom} />
            </g>
          )}

          {/* Daily PnL Zero Baseline */}
          {viewMode !== 'asset' && (
            <line 
              x1={paddingX} 
              y1={pnlBaseline} 
              x2={svgWidth - paddingX} 
              y2={pnlBaseline} 
              className="stroke-slate-300 dark:stroke-zinc-700 opacity-60"
              strokeDasharray="2,2"
              strokeWidth="1"
            />
          )}

          {/* Daily PnL Bars (Lower/Background Layer) */}
          {viewMode !== 'asset' && (
            <g>
              {plottedPoints.map((p, i) => {
                const isActive = hoverIndex === i;
                const isDimmed = hoverIndex !== null && !isActive;

                return (
                  <rect
                    key={`bar-${i}`}
                    x={p.x - barWidth / 2}
                    y={p.barY}
                    width={barWidth}
                    height={p.barHeight}
                    rx="1.5"
                    fill={p.isPos ? upColor : downColor}
                    className="transition-opacity duration-150"
                    opacity={isActive ? 1.0 : isDimmed ? 0.35 : 0.75}
                  />
                );
              })}
            </g>
          )}

          {/* Asset Curve Area Gradient (Upper Layer) */}
          {viewMode !== 'pnl' && areaPath && (
            <path
              d={areaPath}
              fill="url(#assetAreaGrad)"
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Asset Curve Line */}
          {viewMode !== 'pnl' && linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={assetStrokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
          )}

          {/* Active Hover Crosshair Line & Glowing Dots */}
          {activePoint && (
            <g className="pointer-events-none">
              {/* Vertical Crosshair Guide */}
              <line
                x1={activePoint.x}
                y1={viewMode === 'pnl' ? pnlTop : assetTop}
                x2={activePoint.x}
                y2={viewMode === 'asset' ? assetBottom : pnlBottom}
                className="stroke-blue-500/60 dark:stroke-blue-400/70"
                strokeWidth="1"
                strokeDasharray="3,3"
              />

              {/* Asset Point Glowing Indicator */}
              {viewMode !== 'pnl' && (
                <g>
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.assetY}
                    r="6.5"
                    fill="#3b82f6"
                    fillOpacity="0.25"
                    className="animate-pulse"
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.assetY}
                    r="3.5"
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1.8"
                    filter="url(#glow)"
                  />
                </g>
              )}
            </g>
          )}

          {/* X-Axis Date Ticks */}
          <g className="text-[10px] font-mono fill-slate-400 dark:fill-zinc-500 select-none">
            {dateTicks.map((tick, i) => (
              <text
                key={`tick-${i}`}
                x={tick.x}
                y={166}
                textAnchor={tick.align as 'start' | 'middle' | 'end'}
                className="transition-colors hover:fill-slate-700 dark:hover:fill-zinc-300"
              >
                {tick.dateLabel}
              </text>
            ))}
          </g>
        </svg>

        {/* Floating Tooltip Pill (Clamped near cursor for tactile feedback) */}
        {activePoint && (
          <div
            className="absolute pointer-events-none z-20 transition-transform duration-75 ease-out"
            style={{
              left: `${(activePoint.x / svgWidth) * 100}%`,
              top: viewMode === 'pnl' ? '25%' : `${Math.max(8, ((activePoint.assetY - 32) / svgHeight) * 100)}%`,
              transform: `translate(${activePoint.x > svgWidth * 0.7 ? '-105%' : activePoint.x < svgWidth * 0.3 ? '5%' : '-50%'}, -100%)`,
            }}
          >
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 dark:bg-zinc-950/90 text-white text-[11px] shadow-lg backdrop-blur-sm border border-slate-700/50 flex flex-col gap-0.5 whitespace-nowrap">
              <div className="text-[10px] text-slate-300 dark:text-zinc-400 font-mono flex items-center gap-1">
                <span>{activePoint.date}</span>
                {activePoint.isPos ? (
                  <TrendingUp className="w-2.5 h-2.5 text-emerald-400 inline" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5 text-rose-400 inline" />
                )}
              </div>
              <div className="font-mono text-xs font-semibold">
                {currencySymbol}{activePoint.assetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div 
                className="font-mono text-[10px] font-medium"
                style={{ color: activePoint.isPos ? upColor : downColor }}
              >
                {activePoint.isPos ? '+' : ''}{currencySymbol}{activePoint.dailyChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({activePoint.isPos ? '+' : ''}{activePoint.dailyChangePct.toFixed(2)}%)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
