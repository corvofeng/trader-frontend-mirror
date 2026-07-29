import React, { useMemo } from 'react';
import type { Theme } from '../../../lib/theme';
import type { ConePoint, ConeDeltaLevel } from '../utils/impliedPriceDistribution';

interface ImpliedConeOverlayProps {
  theme: Theme;
  cone: ConePoint[];
  underlyingPrice: number;
  chartWidth: number;
  chartHeight: number;
  priceToY: (price: number) => number | null;
  timeToX: (ts: number) => number | null;
  nowPriceAnchorX: number;
  nowTs: number;
  deltaLevel: ConeDeltaLevel;
  isMobile: boolean;
}

const fmtPrice = (v: number): string => {
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
};

const fmtExpiryMMDD = (expiry: string): string => expiry.slice(5);

export const ImpliedConeOverlay: React.FC<ImpliedConeOverlayProps> = ({
  theme,
  cone,
  underlyingPrice,
  chartWidth,
  chartHeight,
  priceToY,
  timeToX,
  nowPriceAnchorX,
  nowTs,
  deltaLevel,
  isMobile,
}) => {
  const render = useMemo(() => {
    if (!cone.length || chartWidth <= 0 || chartHeight <= 0 || nowPriceAnchorX <= 0) return null;

    const lastExp = cone[cone.length - 1];
    const horizon = Math.max(1, lastExp.expiryTs - nowTs);
    const anchorX = nowPriceAnchorX;
    const futureSpanPx = Math.max(80, Math.min(chartWidth * (isMobile ? 0.38 : 0.30), isMobile ? 220 : 320));
    const tsToX = (ts: number): number => {
      const w = Math.max(0, Math.min(1, (ts - nowTs) / horizon));
      return anchorX + w * futureSpanPx;
    };

    const yOf = (p: number): number | null => priceToY(p);

    const lowerPairs: Array<{ x: number; y: number; ts: number }> = [];
    const midPairs: Array<{ x: number; y: number; ts: number }> = [];
    const upperPairs: Array<{ x: number; y: number; ts: number }> = [];

    const yNow = yOf(underlyingPrice);
    if (yNow == null) return null;

    lowerPairs.push({ x: anchorX, y: yNow, ts: nowTs });
    midPairs.push({ x: anchorX, y: yNow, ts: nowTs });
    upperPairs.push({ x: anchorX, y: yNow, ts: nowTs });

    for (const p of cone) {
      const x = tsToX(p.expiryTs);
      const yl = yOf(p.lower);
      const ym = yOf(p.mid);
      const yu = yOf(p.upper);
      if (yl != null && isFinite(yl)) lowerPairs.push({ x, y: yl, ts: p.expiryTs });
      if (ym != null && isFinite(ym)) midPairs.push({ x, y: ym, ts: p.expiryTs });
      if (yu != null && isFinite(yu)) upperPairs.push({ x, y: yu, ts: p.expiryTs });
    }

    if (lowerPairs.length < 2 || upperPairs.length < 2) return null;

    const pathOf = (pairs: Array<{ x: number; y: number }>): string => {
      if (!pairs.length) return '';
      let d = `M ${pairs[0].x.toFixed(2)} ${pairs[0].y.toFixed(2)}`;
      for (let i = 1; i < pairs.length; i++) {
        const x0 = pairs[i - 1].x;
        const y0 = pairs[i - 1].y;
        const x1 = pairs[i].x;
        const y1 = pairs[i].y;
        const cx = (x0 + x1) * 0.5;
        d += ` C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      }
      return d;
    };

    const bandPath = (() => {
      let d = pathOf(lowerPairs);
      if (!d) return '';
      d += ' L ';
      for (let i = upperPairs.length - 1; i >= 0; i--) {
        d += `${upperPairs[i].x.toFixed(2)} ${upperPairs[i].y.toFixed(2)}${i === 0 ? '' : ', '}`;
      }
      d += ' Z';
      return d;
    })();

    const isDark = theme === 'dark';
    const isBlue = theme === 'blue';
    const bandFill = isDark
      ? 'rgba(139, 92, 246, 0.10)'
      : isBlue
      ? 'rgba(59, 130, 246, 0.10)'
      : 'rgba(99, 102, 241, 0.10)';
    const lowerColor = isDark ? '#34d399' : isBlue ? '#059669' : '#059669';
    const upperColor = isDark ? '#fb7185' : isBlue ? '#e11d48' : '#e11d48';
    const midColor = isDark ? '#93c5fd' : isBlue ? '#2563eb' : '#6366f1';
    const gridColor = isDark ? 'rgba(63, 63, 70, 0.45)' : isBlue ? 'rgba(191, 219, 254, 0.75)' : 'rgba(226, 232, 240, 0.85)';
    const textMuted = isDark ? '#a1a1aa' : isBlue ? '#64748b' : '#6b7280';
    const cardBg = isDark ? 'rgba(24, 24, 27, 0.90)' : 'rgba(255, 255, 255, 0.94)';
    const cardBorder = isDark ? 'rgba(167, 139, 250, 0.25)' : 'rgba(129, 140, 248, 0.28)';

    const endX = tsToX(lastExp.expiryTs);

    const expTicks = cone.map((c) => {
      const x = tsToX(c.expiryTs);
      return { c, x };
    });

    return (
      <svg
        className="pointer-events-none absolute inset-0 z-[2]"
        width={chartWidth}
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="cone-band-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={bandFill} stopOpacity="0.1" />
            <stop offset="100%" stopColor={bandFill} stopOpacity="1.0" />
          </linearGradient>
        </defs>

        {/* 未来区虚线分隔 */}
        <line
          x1={anchorX}
          y1={4}
          x2={anchorX}
          y2={chartHeight - 4}
          stroke={gridColor}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={anchorX + 3}
          y={12}
          fontSize={9}
          fill={textMuted}
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          今
        </text>

        {/* 到期日垂直线 */}
        {expTicks.map((t, i) => {
          if (t.x <= anchorX + 2) return null;
          return (
            <g key={`tick-${i}`}>
              <line
                x1={t.x}
                y1={0}
                x2={t.x}
                y2={chartHeight}
                stroke={gridColor}
                strokeWidth={0.7}
                strokeDasharray="2 4"
                opacity={0.7}
              />
              <text
                x={t.x}
                y={chartHeight - 2}
                fontSize={isMobile ? 8.5 : 9.5}
                fill={textMuted}
                fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                textAnchor="middle"
              >
                {fmtExpiryMMDD(t.c.expiry)}
              </text>
            </g>
          );
        })}

        {/* 锥形阴影带 */}
        <path d={bandPath} fill="url(#cone-band-grad)" />

        {/* 下轨（支撑 Call Δ=X） */}
        <path
          d={pathOf(lowerPairs)}
          fill="none"
          stroke={lowerColor}
          strokeWidth={1.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 上轨（阻力 Put Δ=-X） */}
        <path
          d={pathOf(upperPairs)}
          fill="none"
          stroke={upperColor}
          strokeWidth={1.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 中轨（远期线） */}
        <path
          d={pathOf(midPairs)}
          fill="none"
          stroke={midColor}
          strokeWidth={1.3}
          strokeDasharray="5 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 每个到期日的节点圆点 + 价位标签 */}
        {cone.map((c, i) => {
          const x = tsToX(c.expiryTs);
          const yl = priceToY(c.lower);
          const ym = priceToY(c.mid);
          const yu = priceToY(c.upper);
          return (
            <g key={`pt-${i}`}>
              {yl != null && isFinite(yl) && (
                <>
                  <circle cx={x} cy={yl} r={2.6} fill={lowerColor} stroke="#fff" strokeWidth={0.7} />
                  {!isMobile && (
                    <g transform={`translate(${Math.min(chartWidth - 72, x + 4)}, ${yl - 1})`}>
                      <rect x={0} y={-8} width={64} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                      <text x={4} y={2} fontSize={9} fill={lowerColor} fontWeight={700}>
                        Δ{deltaLevel}支 {fmtPrice(c.lower)}
                      </text>
                    </g>
                  )}
                </>
              )}
              {ym != null && isFinite(ym) && (
                <>
                  <circle cx={x} cy={ym} r={2} fill={midColor} />
                  {!isMobile && (
                    <g transform={`translate(${Math.min(chartWidth - 72, x + 4)}, ${ym + 9})`}>
                      <rect x={0} y={-8} width={64} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                      <text x={4} y={2} fontSize={9} fill={midColor} fontWeight={700}>
                        远期 {fmtPrice(c.mid)}
                      </text>
                    </g>
                  )}
                </>
              )}
              {yu != null && isFinite(yu) && (
                <>
                  <circle cx={x} cy={yu} r={2.6} fill={upperColor} stroke="#fff" strokeWidth={0.7} />
                  {!isMobile && (
                    <g transform={`translate(${Math.min(chartWidth - 72, x + 4)}, ${yu - 1})`}>
                      <rect x={0} y={-8} width={64} height={14} rx={3} fill={cardBg} stroke={cardBorder} />
                      <text x={4} y={2} fontSize={9} fill={upperColor} fontWeight={700}>
                        Δ-{deltaLevel}阻 {fmtPrice(c.upper)}
                      </text>
                    </g>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* 图例小卡 */}
        <g transform={`translate(${anchorX + 4}, 6)`}>
          <rect
            width={isMobile ? 136 : 168}
            height={isMobile ? 48 : 58}
            rx={8}
            fill={cardBg}
            stroke={cardBorder}
          />
          <text
            x={8}
            y={14}
            fontSize={isMobile ? 9 : 10}
            fill={isDark ? '#a78bfa' : isBlue ? '#2563eb' : '#6366f1'}
            fontWeight={700}
          >
            期权预期通道 · Δ {deltaLevel}
          </text>
          <g transform={`translate(8, 22)`}>
            <line x1={0} y1={0} x2={16} y2={0} stroke={lowerColor} strokeWidth={2} />
            <text x={22} y={3} fontSize={isMobile ? 8.5 : 9.5} fill={textMuted}>
              支撑 Call Δ={deltaLevel}
            </text>
          </g>
          <g transform={`translate(8, 35)`}>
            <line x1={0} y1={0} x2={16} y2={0} stroke={midColor} strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={22} y={3} fontSize={isMobile ? 8.5 : 9.5} fill={textMuted}>
              远期线
            </text>
          </g>
          {!isMobile && (
            <g transform={`translate(8, 48)`}>
              <line x1={0} y1={0} x2={16} y2={0} stroke={upperColor} strokeWidth={2} />
              <text x={22} y={3} fontSize={9.5} fill={textMuted}>
                阻力 Put Δ=-{deltaLevel}
              </text>
            </g>
          )}
        </g>

        {/* 终点虚线提示 */}
        {endX > anchorX + 10 && (
          <line
            x1={endX}
            y1={4}
            x2={endX}
            y2={chartHeight - 16}
            stroke={gridColor}
            strokeWidth={0.7}
            opacity={0.5}
          />
        )}
      </svg>
    );
  }, [
    cone,
    chartWidth,
    chartHeight,
    priceToY,
    timeToX,
    nowPriceAnchorX,
    nowTs,
    deltaLevel,
    isMobile,
    theme,
    underlyingPrice,
  ]);

  if (!cone.length) return null;
  return render;
};

interface ConeSummaryChipProps {
  theme: Theme;
  cone: ConePoint[];
  deltaLevel: ConeDeltaLevel;
  underlyingPrice: number;
}

export const ConeSummaryChip: React.FC<ConeSummaryChipProps> = ({
  theme,
  cone,
  deltaLevel,
  underlyingPrice,
}) => {
  if (!cone.length || !underlyingPrice) return null;

  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';
  const accent = isDark ? 'text-violet-300' : isBlue ? 'text-blue-600' : 'text-indigo-600';
  const sup = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const res = isDark ? 'text-rose-400' : 'text-rose-600';
  const muted = isDark ? 'text-zinc-400' : isBlue ? 'text-slate-500' : 'text-slate-500';
  const card =
    theme === 'dark'
      ? 'bg-zinc-900/60 border-zinc-700/40 text-zinc-100'
      : theme === 'blue'
      ? 'bg-white/70 border-blue-100 text-slate-900'
      : 'bg-white/70 border-slate-200/60 text-slate-900';

  const nearest = cone[0];
  const pctLo = underlyingPrice > 0 ? ((nearest.lower - underlyingPrice) / underlyingPrice) * 100 : 0;
  const pctHi = underlyingPrice > 0 ? ((nearest.upper - underlyingPrice) / underlyingPrice) * 100 : 0;

  return (
    <div
      className={`inline-flex items-center gap-x-2 sm:gap-x-2.5 flex-wrap rounded-xl border px-3 py-1.5 text-[10px] sm:text-[11px] backdrop-blur-sm ${card}`}
    >
      <span className={`font-semibold ${accent}`}>
        期权预期通道 · {Math.round(Number(deltaLevel) * 100)}% 概率带
      </span>
      <span className={muted}>近月 {nearest.daysToExpiry}d</span>
      <span className="opacity-30">|</span>
      <span>
        支 <span className={`font-semibold ${sup}`}>{fmtPrice(nearest.lower)}</span>
        <span className={`ml-1 ${pctLo >= 0 ? sup : res}`}>
          {pctLo >= 0 ? '+' : ''}
          {pctLo.toFixed(1)}%
        </span>
      </span>
      <span>
        阻 <span className={`font-semibold ${res}`}>{fmtPrice(nearest.upper)}</span>
        <span className={`ml-1 ${pctHi >= 0 ? sup : res}`}>
          {pctHi >= 0 ? '+' : ''}
          {pctHi.toFixed(1)}%
        </span>
      </span>
    </div>
  );
};

interface DeltaLevelPickerProps {
  theme: Theme;
  value: ConeDeltaLevel;
  onChange: (v: ConeDeltaLevel) => void;
}

const DELTA_LEVELS: ConeDeltaLevel[] = [0.6, 0.7, 0.8, 0.9, 0.95];

export const DeltaLevelPicker: React.FC<DeltaLevelPickerProps> = ({ theme, value, onChange }) => {
  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';
  return (
    <div className="inline-flex rounded-lg overflow-hidden">
      {DELTA_LEVELS.map((lv) => {
        const active = lv === value;
        const cls = active
          ? isDark
            ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
            : isBlue
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-indigo-50 border-indigo-200 text-indigo-700'
          : isDark
          ? 'bg-zinc-800/50 border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60'
          : isBlue
          ? 'bg-white/60 border-blue-100/60 text-slate-600 hover:bg-blue-50'
          : 'bg-white/60 border-slate-200/60 text-slate-600 hover:bg-slate-100';
        const first = lv === DELTA_LEVELS[0];
        const last = lv === DELTA_LEVELS[DELTA_LEVELS.length - 1];
        const roundness = first
          ? 'rounded-r-none border-r-0'
          : last
          ? 'rounded-l-none'
          : 'rounded-none border-x-0';
        const pct = Math.round(Number(lv) * 100);
        return (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(lv)}
            title={`期权隐含 ${pct}% 概率带`}
            className={`px-2 py-1 text-[10.5px] sm:text-[11px] font-semibold border transition-all duration-150 cursor-pointer select-none ${roundness} ${cls}`}
          >
            {pct}%
          </button>
        );
      })}
    </div>
  );
};
