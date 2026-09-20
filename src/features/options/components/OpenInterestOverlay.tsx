import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Theme } from '../../../lib/theme';

export interface StrikeOpenInterestItem {
  strike: number;
  call: number;
  put: number;
}

interface OpenInterestOverlayProps {
  tableRef: React.RefObject<HTMLTableElement | null>;
  strikeHeaderRef: React.RefObject<HTMLTableCellElement | null>;
  theme: Theme;
  data: StrikeOpenInterestItem[];
  maxOpenInterest: number;
  visible: boolean;
}

interface MeasuredPoint {
  strike: number;
  centerY: number;
  callX: number;
  putX: number;
  callOI: number;
  putOI: number;
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
  visible,
}) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [points, setPoints] = useState<MeasuredPoint[]>([]);
  const [strikeCol, setStrikeCol] = useState<{ left: number; right: number; width: number }>({ left: 0, right: 0, width: 0 });

  const measureTable = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;

    const width = table.offsetWidth;
    const height = table.offsetHeight;

    if (width <= 0 || height <= 0) return;
    setDimensions({ width, height });

    // Measure strike column position
    let left = 0;
    let right = 0;
    const strikeHeader = strikeHeaderRef.current;
    if (strikeHeader) {
      left = strikeHeader.offsetLeft;
      right = left + strikeHeader.offsetWidth;
    } else {
      const firstStrikeCell = table.querySelector<HTMLTableCellElement>('td[data-role="strike"]');
      if (firstStrikeCell) {
        left = firstStrikeCell.offsetLeft;
        right = left + firstStrikeCell.offsetWidth;
      }
    }

    const strikeWidth = Math.max(20, right - left);
    setStrikeCol({ left, right, width: strikeWidth });

    // Max horizontal amplitude: span across 现价 + 时间价值 (~140px)
    const maxAmplitude = Math.min(160, Math.max(90, (left - 100) * 0.45));
    const safeMaxOI = Math.max(1, maxOpenInterest);

    // Map each strike to its vertical position
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

      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      const centerY = rowTop + rowHeight / 2;

      const callRatio = Math.min(1, Math.max(0, item.call / safeMaxOI));
      const putRatio = Math.min(1, Math.max(0, item.put / safeMaxOI));

      // Call extends leftwards from left edge of strike column
      const callX = left - callRatio * maxAmplitude;
      // Put extends rightwards from right edge of strike column
      const putX = right + putRatio * maxAmplitude;

      measured.push({
        strike: item.strike,
        centerY,
        callX,
        putX,
        callOI: item.call,
        putOI: item.put,
      });
    });

    setPoints(measured);
  }, [tableRef, strikeHeaderRef, data, maxOpenInterest]);

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
      return { callLine: '', putLine: '', callArea: '', putArea: '' };
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

    return { callLine, putLine, callArea, putArea };
  }, [visible, points, dimensions, strikeCol]);

  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);

  // Track hovered row across the table
  useEffect(() => {
    const table = tableRef.current;
    if (!table || !visible) return;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const row = target?.closest<HTMLTableRowElement>('tr[data-strike]');
      if (row) {
        const s = Number(row.getAttribute('data-strike'));
        if (Number.isFinite(s)) {
          setHoveredStrike(s);
          return;
        }
      }
      setHoveredStrike(null);
    };

    const handleMouseLeave = () => {
      setHoveredStrike(null);
    };

    table.addEventListener('mousemove', handleMouseMove);
    table.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      table.removeEventListener('mousemove', handleMouseMove);
      table.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [tableRef, visible]);

  if (!visible || dimensions.width <= 0 || dimensions.height <= 0 || points.length === 0) {
    return null;
  }

  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';

  const hoveredPoint = hoveredStrike != null ? points.find(p => p.strike === hoveredStrike) : null;
  const strikeCenterX = (strikeCol.left + strikeCol.right) / 2;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10 overflow-visible transition-opacity duration-300"
      style={{
        width: dimensions.width,
        height: dimensions.height,
      }}
      role="img"
      aria-label="未平仓量分布图层"
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

      {/* Call Smooth Spline Line */}
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

      {/* Put Smooth Spline Line */}
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

      {/* Top Header Direction Indicators (Clean & Unobtrusive) */}
      {points.length > 0 && strikeCol.width > 0 && (
        <g className="pointer-events-none select-none opacity-80">
          <text
            x={strikeCol.left - 8}
            y={Math.max(14, points[0].centerY - 16)}
            textAnchor="end"
            className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-medium tracking-tight"
            style={{
              filter: isDark
                ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                : 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))',
            }}
          >
            ← Call 未平仓量 (OI)
          </text>
          <text
            x={strikeCol.right + 8}
            y={Math.max(14, points[0].centerY - 16)}
            textAnchor="start"
            className="fill-rose-600 dark:fill-rose-400 text-[10px] font-medium tracking-tight"
            style={{
              filter: isDark
                ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                : 'drop-shadow(0 1px 2px rgba(255,255,255,0.8))',
            }}
          >
            Put 未平仓量 (OI) →
          </text>
        </g>
      )}

      {/* Subtle Micro Data Dots (No Static Text to Block Prices/Time Value) */}
      {points.map(p => {
        const hasCall = p.callOI > 0;
        const hasPut = p.putOI > 0;
        const isHovered = hoveredStrike === p.strike;

        return (
          <g key={`oi-pts-${p.strike}`}>
            {/* Call Point */}
            {hasCall && (
              <circle
                cx={p.callX}
                cy={p.centerY}
                r={isHovered ? 4.5 : 2.5}
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
                r={isHovered ? 4.5 : 2.5}
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

      {/* Hovered State: Interactive Crosshair & Floating HUD Card */}
      {hoveredPoint && (
        <g key={`oi-hover-hud-${hoveredPoint.strike}`} className="pointer-events-none">
          {/* Crosshair Guideline across the row */}
          <line
            x1={Math.min(hoveredPoint.callX, strikeCol.left - 40)}
            y1={hoveredPoint.centerY}
            x2={Math.max(hoveredPoint.putX, strikeCol.right + 40)}
            y2={hoveredPoint.centerY}
            className="stroke-indigo-400 dark:stroke-indigo-300 opacity-50"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />

          {/* Pulse Rings on Hovered Nodes */}
          {hoveredPoint.callOI > 0 && (
            <circle
              cx={hoveredPoint.callX}
              cy={hoveredPoint.centerY}
              r="8"
              className="fill-none stroke-emerald-500/50 dark:stroke-emerald-400/50 stroke-1 animate-ping"
            />
          )}
          {hoveredPoint.putOI > 0 && (
            <circle
              cx={hoveredPoint.putX}
              cy={hoveredPoint.centerY}
              r="8"
              className="fill-none stroke-rose-500/50 dark:stroke-rose-400/50 stroke-1 animate-ping"
            />
          )}

          {/* Floating Data HUD Card (Centered above or below the row) */}
          {(() => {
            const cardWidth = 240;
            const cardHeight = 72;
            const cardX = Math.max(10, Math.min(dimensions.width - cardWidth - 10, strikeCenterX - cardWidth / 2));
            const cardY = hoveredPoint.centerY > 90 ? hoveredPoint.centerY - cardHeight - 12 : hoveredPoint.centerY + 14;

            const pcrText = hoveredPoint.callOI > 0
              ? (hoveredPoint.putOI / hoveredPoint.callOI).toFixed(2)
              : hoveredPoint.putOI > 0 ? '∞' : '--';

            return (
              <foreignObject
                x={cardX}
                y={cardY}
                width={cardWidth}
                height={cardHeight}
                className="overflow-visible pointer-events-none"
              >
                <div
                  className="w-full h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/90 dark:border-zinc-700/90 shadow-xl rounded-xl p-2 px-3 text-xs flex flex-col justify-between transition-all duration-150 ring-1 ring-black/5 dark:ring-white/10"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-zinc-800">
                    <span className="font-bold font-mono text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      行权价 {hoveredPoint.strike}
                    </span>
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 font-mono">
                      P/C比: <span className="font-semibold text-slate-700 dark:text-zinc-200">{pcrText}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div className="flex flex-col">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Call: {formatOINumber(hoveredPoint.callOI) || '0'}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                        {hoveredPoint.callOI.toLocaleString()} 张
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                        Put: {formatOINumber(hoveredPoint.putOI) || '0'}
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                        {hoveredPoint.putOI.toLocaleString()} 张
                      </span>
                    </div>
                  </div>
                </div>
              </foreignObject>
            );
          })()}
        </g>
      )}
    </svg>
  );
};
