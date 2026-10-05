import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Theme } from '../../../lib/theme';

export interface StrikeOpenInterestItem {
  strike: number;
  call: number;
  put: number;
  callTimeValue?: number;
  putTimeValue?: number;
}

interface OpenInterestOverlayProps {
  tableRef: React.RefObject<HTMLTableElement | null>;
  strikeHeaderRef: React.RefObject<HTMLTableCellElement | null>;
  theme: Theme;
  data: StrikeOpenInterestItem[];
  maxOpenInterest: number;
  maxTimeValue?: number;
  visible: boolean;
  /** Whether to show the time value dashed curve. Defaults to true. */
  showTimeValue?: boolean;
  /** CSS zoom factor applied to the table (e.g. mobileTBoardScale). Defaults to 1. */
  scale?: number;
}

interface MeasuredPoint {
  strike: number;
  centerY: number;
  rowHeight: number;
  callX: number;
  putX: number;
  callOI: number;
  putOI: number;
  callTVX: number;
  putTVX: number;
  callTimeValue: number;
  putTimeValue: number;
}

export const formatOINumber = (val: number): string => {
  if (!Number.isFinite(val) || val <= 0) return '';
  const rounded = Math.round(val);
  if (rounded >= 100_000_000) return `${Number((rounded / 100_000_000).toFixed(1))}亿`;
  if (rounded >= 10_000) return `${Number((rounded / 10_000).toFixed(1))}万`;
  return rounded.toLocaleString('zh-CN');
};

/**
 * Builds a smooth cubic Hermite / Catmull-Rom spline through a set of points (x, y).
 */
export const buildSmoothSplinePath = (points: Array<{ x: number; y: number }>): string => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  // Pre-calculate slopes (dx/dy)
  const slopes: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      const dy = points[1].y - points[0].y;
      slopes.push(dy > 0 ? (points[1].x - points[0].x) / dy : 0);
    } else if (i === n - 1) {
      const dy = points[n - 1].y - points[n - 2].y;
      slopes.push(dy > 0 ? (points[n - 1].x - points[n - 2].x) / dy : 0);
    } else {
      const dy = points[i + 1].y - points[i - 1].y;
      slopes.push(dy > 0 ? (points[i + 1].x - points[i - 1].x) / dy : 0);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dy = p1.y - p0.y;
    const factor = dy / 3;

    const c1x = p0.x + slopes[i] * factor;
    const c1y = p0.y + factor;
    const c2x = p1.x - slopes[i + 1] * factor;
    const c2y = p1.y - factor;

    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  return path;
};

export const OpenInterestOverlay: React.FC<OpenInterestOverlayProps> = ({
  tableRef,
  strikeHeaderRef,
  theme,
  data,
  maxOpenInterest,
  maxTimeValue,
  visible,
  showTimeValue = true,
  scale = 1,
}) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [points, setPoints] = useState<MeasuredPoint[]>([]);
  const [strikeCol, setStrikeCol] = useState<{ left: number; right: number; width: number }>({ left: 0, right: 0, width: 0 });
  const [headerBottom, setHeaderBottom] = useState<number>(65);

  const measureTable = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;

    // CSS `zoom` affects the visual layout but NOT offsetWidth/offsetHeight/offsetTop.
    // We must multiply all offset* values by `scale` so that the SVG coordinate
    // system matches the zoomed visual rendering on mobile.
    const width = table.offsetWidth * scale;
    const height = table.offsetHeight * scale;

    if (width <= 0 || height <= 0) return;
    setDimensions({ width, height });

    // Measure table header bottom boundary to prevent tooltip overlapping/clipping
    const thead = table.querySelector('thead');
    const hBottom = thead ? (thead.offsetTop + thead.offsetHeight) * scale : 65 * scale;
    setHeaderBottom(hBottom);

    // Measure strike column position, accounting for scale
    let left = 0;
    let right = 0;
    const strikeHeader = strikeHeaderRef.current;
    if (strikeHeader) {
      left = strikeHeader.offsetLeft * scale;
      right = left + strikeHeader.offsetWidth * scale;
    } else {
      const firstStrikeCell = table.querySelector<HTMLTableCellElement>('td[data-role="strike"]');
      if (firstStrikeCell) {
        left = firstStrikeCell.offsetLeft * scale;
        right = left + firstStrikeCell.offsetWidth * scale;
      }
    }

    const strikeWidth = Math.max(20, right - left);
    setStrikeCol({ left, right, width: strikeWidth });

    // Max horizontal amplitude: span across 现价 + 时间价值 (~140px)
    const maxAmplitude = Math.min(160, Math.max(90, (left - 100) * 0.45));
    const safeMaxOI = Math.max(1, maxOpenInterest);
    const safeMaxTV = Math.max(
      0.0001,
      maxTimeValue ?? Math.max(0.0001, ...data.flatMap(d => [d.callTimeValue ?? 0, d.putTimeValue ?? 0]))
    );

    // Map each strike to its vertical position, accounting for scale
    const measured: MeasuredPoint[] = [];
    const rows = table.querySelectorAll<HTMLTableRowElement>('tr[data-strike]');
    const rowMap = new Map<number, HTMLTableRowElement>();
    rows.forEach(r => {
      const s = Number(r.getAttribute('data-strike'));
      if (Number.isFinite(s)) rowMap.set(s, r);
    });

    data.forEach(item => {
      const row = rowMap.get(item.strike);
      if (!row) return;

      const rowTop = row.offsetTop * scale;
      const rowHeight = row.offsetHeight * scale;
      const centerY = rowTop + rowHeight / 2;

      const callRatio = Math.min(1, Math.max(0, item.call / safeMaxOI));
      const putRatio = Math.min(1, Math.max(0, item.put / safeMaxOI));

      const callTV = item.callTimeValue ?? 0;
      const putTV = item.putTimeValue ?? 0;
      const callTVRatio = Math.min(1, Math.max(0, callTV / safeMaxTV));
      const putTVRatio = Math.min(1, Math.max(0, putTV / safeMaxTV));

      // Call extends leftwards from left edge of strike column
      const callX = left - callRatio * maxAmplitude;
      const callTVX = left - callTVRatio * maxAmplitude;
      // Put extends rightwards from right edge of strike column
      const putX = right + putRatio * maxAmplitude;
      const putTVX = right + putTVRatio * maxAmplitude;

      measured.push({
        strike: item.strike,
        centerY,
        rowHeight,
        callX,
        putX,
        callOI: item.call,
        putOI: item.put,
        callTVX,
        putTVX,
        callTimeValue: callTV,
        putTimeValue: putTV,
      });
    });

    setPoints(measured);
  }, [tableRef, strikeHeaderRef, data, maxOpenInterest, maxTimeValue, scale]);

  // Re-measure on mount, resize, or data change
  useEffect(() => {
    if (!visible) return;

    measureTable();

    const table = tableRef.current;
    if (!table) return;

    const ro = new ResizeObserver(() => {
      measureTable();
    });
    ro.observe(table);

    return () => ro.disconnect();
  }, [visible, measureTable, tableRef]);

  // Compute smooth curve and area paths
  const paths = useMemo(() => {
    if (!visible || points.length < 2 || dimensions.width <= 0) {
      return {
        callLine: '',
        putLine: '',
        callArea: '',
        putArea: '',
        callTVLine: '',
        putTVLine: '',
      };
    }

    const callPoints = points.map(p => ({ x: p.callX, y: p.centerY }));
    const putPoints = points.map(p => ({ x: p.putX, y: p.centerY }));

    const callLine = buildSmoothSplinePath(callPoints);
    const putLine = buildSmoothSplinePath(putPoints);

    // Area paths closed against the strike column baseline
    const firstY = points[0].centerY;
    const lastY = points[points.length - 1].centerY;
    const baselineCallX = strikeCol.left;
    const baselinePutX = strikeCol.right;

    const callArea = callLine
      ? `${callLine} L ${baselineCallX} ${lastY.toFixed(1)} L ${baselineCallX} ${firstY.toFixed(1)} Z`
      : '';

    const putArea = putLine
      ? `${putLine} L ${baselinePutX} ${lastY.toFixed(1)} L ${baselinePutX} ${firstY.toFixed(1)} Z`
      : '';

    // Time value smooth spline paths (dashed curves)
    let callTVLine = '';
    let putTVLine = '';
    if (showTimeValue) {
      const callTVPoints = points.map(p => ({ x: p.callTVX, y: p.centerY }));
      const putTVPoints = points.map(p => ({ x: p.putTVX, y: p.centerY }));
      callTVLine = buildSmoothSplinePath(callTVPoints);
      putTVLine = buildSmoothSplinePath(putTVPoints);
    }

    return { callLine, putLine, callArea, putArea, callTVLine, putTVLine };
  }, [visible, points, dimensions, strikeCol, showTimeValue]);

  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const pointsRef = React.useRef(points);
  pointsRef.current = points;

  // Track mouse coordinates over the table to detect when hovering over a strike level (points or strike cell)
  useEffect(() => {
    if (!visible) {
      setHoveredStrike(null);
      return;
    }

    const table = tableRef.current;
    if (!table) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPoints = pointsRef.current;
      if (!currentPoints || currentPoints.length === 0) return;

      const rect = table.getBoundingClientRect();
      const scaleX = table.offsetWidth / (rect.width || 1);
      const scaleY = table.offsetHeight / (rect.height || 1);
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const HIT_RADIUS = 20;
      const HIT_RADIUS_SQ = HIT_RADIUS * HIT_RADIUS;

      let found: number | null = null;
      let minDistanceSq = HIT_RADIUS_SQ;

      for (const p of currentPoints) {
        if (Math.abs(mouseY - p.centerY) > HIT_RADIUS) continue;

        // Check Call Point (OI)
        if (p.callOI > 0) {
          const dx = mouseX - p.callX;
          const dy = mouseY - p.centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }

        // Check Call Time Value Point
        if (showTimeValue && p.callTimeValue > 0) {
          const dx = mouseX - p.callTVX;
          const dy = mouseY - p.centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }

        // Check Put Point (OI)
        if (p.putOI > 0) {
          const dx = mouseX - p.putX;
          const dy = mouseY - p.centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }

        // Check Put Time Value Point
        if (showTimeValue && p.putTimeValue > 0) {
          const dx = mouseX - p.putTVX;
          const dy = mouseY - p.centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }

        // Check Strike Cell (between strikeCol.left and strikeCol.right)
        if (mouseX >= strikeCol.left - 6 && mouseX <= strikeCol.right + 6) {
          const dy = mouseY - p.centerY;
          const d2 = dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }
      }

      setHoveredStrike(found);
    };

    const handleMouseLeave = () => {
      setHoveredStrike(null);
    };

    table.addEventListener('mousemove', handleMouseMove);
    table.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      table.removeEventListener('mousemove', handleMouseMove);
      table.removeEventListener('mouseleave', handleMouseLeave);
      table.style.cursor = '';
    };
  }, [tableRef, visible, strikeCol, showTimeValue]);

  // Synchronize pointer cursor on table when hovering over a strike level
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    if (hoveredStrike != null) {
      table.style.cursor = 'pointer';
    } else {
      table.style.cursor = '';
    }
  }, [tableRef, hoveredStrike]);

  if (!visible || dimensions.width <= 0 || dimensions.height <= 0 || points.length === 0) {
    return null;
  }

  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';

  const hoveredPoint = hoveredStrike != null ? points.find(p => p.strike === hoveredStrike) : null;
  const strikeCenterX = (strikeCol.left + strikeCol.right) / 2;

  return (
    <>
      <svg
        className="absolute inset-0 pointer-events-none z-10 overflow-visible transition-opacity duration-300"
      style={{
        width: dimensions.width,
        height: dimensions.height,
      }}
      role="img"
      aria-label="未平仓量与时间价值分布图层"
    >
      <defs>
        {/* Soft Call Area Gradient (Emerald) */}
        <linearGradient id="tboard-call-oi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity={isDark ? 0.16 : isBlue ? 0.14 : 0.10} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
        </linearGradient>

        {/* Soft Put Area Gradient (Rose) */}
        <linearGradient id="tboard-put-oi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.01} />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity={isDark ? 0.16 : isBlue ? 0.14 : 0.10} />
        </linearGradient>

        {/* Glow Filters */}
        <filter id="glow-call" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#10b981" floodOpacity="0.4" />
        </filter>
        <filter id="glow-put" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#f43f5e" floodOpacity="0.4" />
        </filter>
        <filter id="glow-tv" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#f59e0b" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Call Area Fill */}
      {paths.callArea && (
        <path
          d={paths.callArea}
          fill="url(#tboard-call-oi-gradient)"
          className="transition-all duration-300"
        />
      )}

      {/* Put Area Fill */}
      {paths.putArea && (
        <path
          d={paths.putArea}
          fill="url(#tboard-put-oi-gradient)"
          className="transition-all duration-300"
        />
      )}

      {/* Call Time Value Dashed Spline Line */}
      {showTimeValue && paths.callTVLine && (
        <path
          d={paths.callTVLine}
          fill="none"
          className="stroke-amber-500 dark:stroke-amber-400"
          strokeWidth="1.8"
          strokeDasharray="5 3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow-tv)"
          opacity={0.92}
        />
      )}

      {/* Put Time Value Dashed Spline Line */}
      {showTimeValue && paths.putTVLine && (
        <path
          d={paths.putTVLine}
          fill="none"
          className="stroke-amber-500 dark:stroke-amber-400"
          strokeWidth="1.8"
          strokeDasharray="5 3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow-tv)"
          opacity={0.92}
        />
      )}

      {/* Call Smooth Spline Line (OI) */}
      {paths.callLine && (
        <path
          d={paths.callLine}
          fill="none"
          className="stroke-emerald-500 dark:stroke-emerald-400"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow-call)"
        />
      )}

      {/* Put Smooth Spline Line (OI) */}
      {paths.putLine && (
        <path
          d={paths.putLine}
          fill="none"
          className="stroke-rose-500 dark:stroke-rose-400"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow-put)"
        />
      )}

      {/* Subtle Micro Data Dots */}
      {points.map(p => {
        const hasCall = p.callOI > 0;
        const hasPut = p.putOI > 0;
        const isHovered = hoveredStrike === p.strike;

        return (
          <g key={`oi-pts-${p.strike}`} className="pointer-events-none">
            {/* Call Point */}
            {hasCall && (
              <circle
                cx={p.callX}
                cy={p.centerY}
                r={isHovered ? 5.5 : 2.5}
                className={`transition-all duration-150 ${
                  isHovered
                    ? 'fill-emerald-400 stroke-2 stroke-white dark:stroke-zinc-950'
                    : 'fill-emerald-500/80 dark:fill-emerald-400/80'
                }`}
              />
            )}

            {/* Put Point */}
            {hasPut && (
              <circle
                cx={p.putX}
                cy={p.centerY}
                r={isHovered ? 5.5 : 2.5}
                className={`transition-all duration-150 ${
                  isHovered
                    ? 'fill-rose-400 stroke-2 stroke-white dark:stroke-zinc-950'
                    : 'fill-rose-500/80 dark:fill-rose-400/80'
                }`}
              />
            )}
          </g>
        );
      })}

        {/* Hovered State: Separate Call and Put HUD indicators on the curve */}
        {hoveredPoint && (
          <g key={`oi-hover-hud-${hoveredPoint.strike}`} className="pointer-events-none">
            {/* Crosshair Guideline across the row */}
            <line
              x1={Math.min(
                hoveredPoint.callX,
                showTimeValue && hoveredPoint.callTimeValue > 0 ? hoveredPoint.callTVX : hoveredPoint.callX,
                strikeCol.left - 40
              )}
              y1={hoveredPoint.centerY}
              x2={Math.max(
                hoveredPoint.putX,
                showTimeValue && hoveredPoint.putTimeValue > 0 ? hoveredPoint.putTVX : hoveredPoint.putX,
                strikeCol.right + 40
              )}
              y2={hoveredPoint.centerY}
              className="stroke-indigo-400/50 dark:stroke-indigo-300/50"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />

            {/* Time Value Indicator Nodes on the Dashed Line */}
            {showTimeValue && hoveredPoint.callTimeValue > 0 && (
              <circle
                cx={hoveredPoint.callTVX}
                cy={hoveredPoint.centerY}
                r="4.5"
                className="fill-amber-400 stroke-2 stroke-white dark:stroke-zinc-950"
              />
            )}
            {showTimeValue && hoveredPoint.putTimeValue > 0 && (
              <circle
                cx={hoveredPoint.putTVX}
                cy={hoveredPoint.centerY}
                r="4.5"
                className="fill-amber-400 stroke-2 stroke-white dark:stroke-zinc-950"
              />
            )}

            {/* Pulse Rings on active Nodes (centered in-place ripple animation) */}
            {hoveredPoint.callOI > 0 && (
              <circle
                cx={hoveredPoint.callX}
                cy={hoveredPoint.centerY}
                r="6"
                className="fill-none stroke-emerald-500/80 dark:stroke-emerald-400/80 stroke-1 pointer-events-none"
              >
                <animate
                  attributeName="r"
                  values="6;16"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.8;0"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {hoveredPoint.putOI > 0 && (
              <circle
                cx={hoveredPoint.putX}
                cy={hoveredPoint.centerY}
                r="6"
                className="fill-none stroke-rose-500/80 dark:stroke-rose-400/80 stroke-1 pointer-events-none"
              >
                <animate
                  attributeName="r"
                  values="6;16"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.8;0"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        )}
      </svg>

      {/* Unified HUD Floating Popover Card (HTML at z-30: never clipped by sticky thead) */}
      {hoveredPoint && (() => {
        const cardWidth = 310;
        const cardHeight = showTimeValue ? 96 : 74;

        // Smart vertical placement: If placing above would collide with or slide under thead, place below!
        const spaceAbove = hoveredPoint.centerY - hoveredPoint.rowHeight / 2 - headerBottom;
        const isAbove = spaceAbove >= cardHeight + 14;

        const tooltipY = isAbove
          ? hoveredPoint.centerY - hoveredPoint.rowHeight / 2 - cardHeight - 8
          : hoveredPoint.centerY + hoveredPoint.rowHeight / 2 + 8;

        const tooltipX = Math.max(
          cardWidth / 2 + 8,
          Math.min(dimensions.width - cardWidth / 2 - 8, strikeCenterX)
        );

        const placement = isAbove ? 'top' : 'bottom';
        // Compute arrow left position relative to card container so it always aims at strikeCenterX
        const arrowLeft = Math.max(18, Math.min(cardWidth - 18, strikeCenterX - (tooltipX - cardWidth / 2)));

        const pcrText = hoveredPoint.callOI > 0
          ? (hoveredPoint.putOI / hoveredPoint.callOI).toFixed(2)
          : hoveredPoint.putOI > 0 ? '∞' : '--';

        return (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: tooltipX,
              top: tooltipY,
              transform: 'translate(-50%, 0)',
            }}
          >
            <div className="w-[310px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-zinc-700/80 shadow-2xl rounded-2xl p-2.5 px-3 flex flex-col gap-2 ring-1 ring-black/5 dark:ring-white/10 select-none">
              {/* Header: Strike & PCR */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1.5 font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wider">行权价</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-zinc-50">@{hoveredPoint.strike}</span>
                </div>
                <div className="flex items-center gap-2 text-[10.5px]">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/60">
                    P/C: {pcrText}
                  </span>
                </div>
              </div>

              {/* Comparison Grid: Call (Left) vs Put (Right) */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-zinc-800 gap-x-2.5">
                {/* Call Side (Emerald) */}
                <div className="space-y-1 pr-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Call 认购
                    </span>
                    {hoveredPoint.callOI >= 10000 && (
                      <span className="text-[9.5px] font-mono text-emerald-700 dark:text-emerald-300 font-normal">
                        {formatOINumber(hoveredPoint.callOI)}
                      </span>
                    )}
                  </div>

                  {/* Call OI Row */}
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">未平仓</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {hoveredPoint.callOI > 0 ? hoveredPoint.callOI.toLocaleString() : '-'}
                      {hoveredPoint.callOI > 0 && <span className="text-[9.5px] font-normal text-slate-400 dark:text-zinc-500 ml-0.5">张</span>}
                    </span>
                  </div>

                  {/* Call TV Row */}
                  {showTimeValue && (
                    <div className="flex items-baseline justify-between font-mono text-xs">
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <span className="w-2 border-t border-dashed border-amber-500 inline-block" />
                        时间价值
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {hoveredPoint.callTimeValue > 0 ? hoveredPoint.callTimeValue.toFixed(4) : '-'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Put Side (Rose) */}
                <div className="space-y-1 pl-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Put 认沽
                    </span>
                    {hoveredPoint.putOI >= 10000 && (
                      <span className="text-[9.5px] font-mono text-rose-700 dark:text-rose-300 font-normal">
                        {formatOINumber(hoveredPoint.putOI)}
                      </span>
                    )}
                  </div>

                  {/* Put OI Row */}
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">未平仓</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {hoveredPoint.putOI > 0 ? hoveredPoint.putOI.toLocaleString() : '-'}
                      {hoveredPoint.putOI > 0 && <span className="text-[9.5px] font-normal text-slate-400 dark:text-zinc-500 ml-0.5">张</span>}
                    </span>
                  </div>

                  {/* Put TV Row */}
                  {showTimeValue && (
                    <div className="flex items-baseline justify-between font-mono text-xs">
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <span className="w-2 border-t border-dashed border-amber-500 inline-block" />
                        时间价值
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {hoveredPoint.putTimeValue > 0 ? hoveredPoint.putTimeValue.toFixed(4) : '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Popover Arrow pointing at strike */}
              <div
                className={`absolute w-2.5 h-2.5 bg-white dark:bg-zinc-900 border-slate-200/90 dark:border-zinc-700/80 rotate-45 ${
                  placement === 'top'
                    ? '-bottom-1.5 border-b border-r'
                    : '-top-1.5 border-t border-l'
                }`}
                style={{ left: arrowLeft, transform: 'translateX(-50%) rotate(45deg)' }}
              />
            </div>
          </div>
        );
      })()}
    </>
  );
};
