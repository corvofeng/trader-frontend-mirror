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

        // Check Call Point
        if (p.callOI > 0) {
          const dx = mouseX - p.callX;
          const dy = mouseY - p.centerY;
          const d2 = dx * dx + dy * dy;
          if (d2 <= minDistanceSq) {
            minDistanceSq = d2;
            found = p.strike;
          }
        }

        // Check Put Point
        if (p.putOI > 0) {
          const dx = mouseX - p.putX;
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
  }, [tableRef, visible, strikeCol]);

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

      {/* Hovered State: Separate Call and Put HUD cards and Strike/PCR center pill */}
      {hoveredPoint && (
        <g key={`oi-hover-hud-${hoveredPoint.strike}`} className="pointer-events-none">
          {/* Crosshair Guideline across the row */}
          <line
            x1={Math.min(hoveredPoint.callX, strikeCol.left - 40)}
            y1={hoveredPoint.centerY}
            x2={Math.max(hoveredPoint.putX, strikeCol.right + 40)}
            y2={hoveredPoint.centerY}
            className="stroke-indigo-400/50 dark:stroke-indigo-300/50"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />

          {/* Pulse Rings on active Nodes */}
          {hoveredPoint.callOI > 0 && (
            <circle
              cx={hoveredPoint.callX}
              cy={hoveredPoint.centerY}
              r="8"
              className="fill-none stroke-emerald-500/60 dark:stroke-emerald-400/60 stroke-1 animate-ping"
            />
          )}
          {hoveredPoint.putOI > 0 && (
            <circle
              cx={hoveredPoint.putX}
              cy={hoveredPoint.centerY}
              r="8"
              className="fill-none stroke-rose-500/60 dark:stroke-rose-400/60 stroke-1 animate-ping"
            />
          )}

          {(() => {
            const isAbove = hoveredPoint.centerY > 65;
            const cardHeight = 48;
            const cardY = isAbove ? hoveredPoint.centerY - cardHeight - 10 : hoveredPoint.centerY + 12;

            const cardWidth = 142;

            // Call Card on the Left side, anchored over callX
            const callCardX = Math.max(10, Math.min(strikeCol.left - cardWidth - 6, hoveredPoint.callX - cardWidth / 2));
            const callArrowX = Math.max(callCardX + 12, Math.min(callCardX + cardWidth - 12, hoveredPoint.callX));

            // Put Card on the Right side, anchored over putX
            const putCardX = Math.min(dimensions.width - cardWidth - 10, Math.max(strikeCol.right + 6, hoveredPoint.putX - cardWidth / 2));
            const putArrowX = Math.max(putCardX + 12, Math.min(putCardX + cardWidth - 12, hoveredPoint.putX));

            // Center Strike & PCR Pill
            const pcrWidth = 88;
            const pcrHeight = 36;
            const pcrX = strikeCenterX - pcrWidth / 2;
            const pcrY = isAbove ? hoveredPoint.centerY - pcrHeight - 10 : hoveredPoint.centerY + 12;

            const pcrText = hoveredPoint.callOI > 0
              ? (hoveredPoint.putOI / hoveredPoint.callOI).toFixed(2)
              : hoveredPoint.putOI > 0 ? '∞' : '--';

            return (
              <g className="pointer-events-none">
                {/* 1. Left Call Card */}
                {hoveredPoint.callOI > 0 && (
                  <g>
                    {isAbove ? (
                      <polygon
                        points={`${callArrowX - 5},${cardY + cardHeight - 1} ${callArrowX + 5},${cardY + cardHeight - 1} ${callArrowX},${cardY + cardHeight + 5}`}
                        className="fill-white dark:fill-zinc-900 text-emerald-500/40 dark:text-emerald-500/50"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <polygon
                        points={`${callArrowX - 5},${cardY + 1} ${callArrowX + 5},${cardY + 1} ${callArrowX},${cardY - 5}`}
                        className="fill-white dark:fill-zinc-900 text-emerald-500/40 dark:text-emerald-500/50"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    )}
                    <foreignObject
                      x={callCardX}
                      y={cardY}
                      width={cardWidth}
                      height={cardHeight}
                      className="overflow-visible pointer-events-none"
                    >
                      <div className="w-full h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 dark:border-emerald-500/50 shadow-lg rounded-xl p-1.5 px-2.5 flex flex-col justify-between ring-1 ring-emerald-500/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Call 未平仓
                          </span>
                          {hoveredPoint.callOI >= 10000 && (
                            <span className="text-[9.5px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                              {formatOINumber(hoveredPoint.callOI)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline justify-between font-mono">
                          <span className="text-[12px] font-bold text-slate-900 dark:text-zinc-100">
                            {hoveredPoint.callOI.toLocaleString()}
                          </span>
                          <span className="text-[9.5px] font-normal text-slate-400 dark:text-zinc-500">张</span>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                )}

                {/* 2. Center Strike & PCR Pill */}
                <foreignObject
                  x={pcrX}
                  y={pcrY}
                  width={pcrWidth}
                  height={pcrHeight}
                  className="overflow-visible pointer-events-none"
                >
                  <div className="w-full h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-indigo-200/90 dark:border-indigo-800/80 shadow-md rounded-xl p-1 px-1.5 flex flex-col items-center justify-center font-mono ring-1 ring-indigo-500/20">
                    <span className="text-[9.5px] font-bold text-slate-800 dark:text-zinc-100 leading-tight">
                      @{hoveredPoint.strike}
                    </span>
                    <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 leading-tight">
                      P/C: {pcrText}
                    </span>
                  </div>
                </foreignObject>

                {/* 3. Right Put Card */}
                {hoveredPoint.putOI > 0 && (
                  <g>
                    {isAbove ? (
                      <polygon
                        points={`${putArrowX - 5},${cardY + cardHeight - 1} ${putArrowX + 5},${cardY + cardHeight - 1} ${putArrowX},${cardY + cardHeight + 5}`}
                        className="fill-white dark:fill-zinc-900 text-rose-500/40 dark:text-rose-500/50"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <polygon
                        points={`${putArrowX - 5},${cardY + 1} ${putArrowX + 5},${cardY + 1} ${putArrowX},${cardY - 5}`}
                        className="fill-white dark:fill-zinc-900 text-rose-500/40 dark:text-rose-500/50"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    )}
                    <foreignObject
                      x={putCardX}
                      y={cardY}
                      width={cardWidth}
                      height={cardHeight}
                      className="overflow-visible pointer-events-none"
                    >
                      <div className="w-full h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-rose-500/40 dark:border-rose-500/50 shadow-lg rounded-xl p-1.5 px-2.5 flex flex-col justify-between ring-1 ring-rose-500/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Put 未平仓
                          </span>
                          {hoveredPoint.putOI >= 10000 && (
                            <span className="text-[9.5px] font-mono font-semibold text-rose-700 dark:text-rose-300">
                              {formatOINumber(hoveredPoint.putOI)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline justify-between font-mono">
                          <span className="text-[12px] font-bold text-slate-900 dark:text-zinc-100">
                            {hoveredPoint.putOI.toLocaleString()}
                          </span>
                          <span className="text-[9.5px] font-normal text-slate-400 dark:text-zinc-500">张</span>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
};
