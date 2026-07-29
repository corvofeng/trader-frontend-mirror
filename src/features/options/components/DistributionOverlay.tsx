import React, { useMemo } from 'react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import type { ImpliedDistributionData } from '../utils/impliedPriceDistribution';

interface DistributionOverlayProps {
  theme: Theme;
  distribution: ImpliedDistributionData | null;
  chartWidth: number;
  chartHeight: number;
  priceToY: (price: number) => number | null;
  xForFuture: number;
  isMobile: boolean;
}

export const DistributionOverlay: React.FC<DistributionOverlayProps> = ({
  theme,
  distribution,
  chartWidth,
  chartHeight,
  priceToY,
  xForFuture,
  isMobile,
}) => {
  const render = useMemo(() => {
    if (!distribution || chartWidth <= 0 || chartHeight <= 0) return null;

    const points = distribution.points;
    if (points.length < 2) return null;

    const maxPdf = Math.max(...points.map((p) => p.pdf));
    if (!isFinite(maxPdf) || maxPdf <= 0) return null;

    const yPrices: number[] = [];
    const pdfVals: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const y = priceToY(points[i].price);
      if (y != null && isFinite(y)) {
        yPrices.push(y);
        pdfVals.push(points[i].pdf);
      }
    }
    if (yPrices.length < 2) return null;

    const minY = Math.min(...yPrices);
    const maxY = Math.max(...yPrices);
    const cloudMaxWidthPx = Math.min(
      Math.max(60, chartWidth * (isMobile ? 0.28 : 0.22)),
      isMobile ? 140 : 220
    );

    const scale = cloudMaxWidthPx / maxPdf;

    const minYClamped = Math.max(0, minY);
    const maxYClamped = Math.min(chartHeight, maxY);

    let leftPath = `M ${xForFuture} ${yPrices[0]}`;
    let rightPath = `M ${xForFuture} ${yPrices[0]}`;
    let fillPath = `M ${xForFuture} ${yPrices[0]}`;

    for (let i = 0; i < yPrices.length; i++) {
      const w = pdfVals[i] * scale;
      const y = yPrices[i];
      if (i > 0) {
        leftPath += ` L ${xForFuture} ${y}`;
      }
      rightPath += ` L ${xForFuture + w} ${y}`;
      fillPath += ` L ${xForFuture + w} ${y}`;
    }
    for (let i = yPrices.length - 1; i >= 0; i--) {
      fillPath += ` L ${xForFuture} ${yPrices[i]}`;
    }
    fillPath += ' Z';

    const y1s = priceToY(distribution.oneSigmaLow);
    const y1h = priceToY(distribution.oneSigmaHigh);
    const y2s = priceToY(distribution.twoSigmaLow);
    const y2h = priceToY(distribution.twoSigmaHigh);
    const yExp = priceToY(distribution.expectedPrice);
    const yMaxProb = priceToY(distribution.maxProbabilityPrice);
    const yMedian = priceToY(distribution.percentile50);
    const yCurr = priceToY(distribution.underlyingPrice);

    const isDark = theme === 'dark';
    const isBlue = theme === 'blue';

    const accentFill = isDark
      ? 'rgba(139, 92, 246, 0.14)'
      : isBlue
      ? 'rgba(37, 99, 235, 0.12)'
      : 'rgba(99, 102, 241, 0.12)';
    const accentStroke = isDark
      ? 'rgba(167, 139, 250, 0.55)'
      : isBlue
      ? 'rgba(59, 130, 246, 0.55)'
      : 'rgba(129, 140, 248, 0.6)';
    const sigma1Color = isDark
      ? 'rgba(52, 211, 153, 0.55)'
      : isBlue
      ? 'rgba(16, 185, 129, 0.55)'
      : 'rgba(16, 185, 129, 0.6)';
    const sigma2Color = isDark
      ? 'rgba(251, 191, 36, 0.40)'
      : isBlue
      ? 'rgba(245, 158, 11, 0.40)'
      : 'rgba(245, 158, 11, 0.45)';
    const expectedColor = isDark
      ? 'rgba(96, 165, 250, 0.85)'
      : isBlue
      ? 'rgba(37, 99, 235, 0.85)'
      : 'rgba(79, 70, 229, 0.85)';
    const maxProbColor = isDark
      ? 'rgba(244, 114, 182, 0.85)'
      : isBlue
      ? 'rgba(236, 72, 153, 0.85)'
      : 'rgba(236, 72, 153, 0.9)';

    const cloudGradId = `dist-grad-${theme}`;

    const fmt = (v: number) => {
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) >= 10) return v.toFixed(2);
      return v.toFixed(3);
    };

    const lineEntries: Array<{ label: string; y: number | null; color: string; dashed?: boolean; price: number }> = [
      { label: '2σ', y: y2s, color: sigma2Color, dashed: true, price: distribution.twoSigmaLow },
      { label: '1σ', y: y1s, color: sigma1Color, dashed: true, price: distribution.oneSigmaLow },
      { label: '现价', y: yCurr, color: isDark ? '#e5e7eb' : '#374151', dashed: true, price: distribution.underlyingPrice },
      { label: '期望', y: yExp, color: expectedColor, price: distribution.expectedPrice },
      { label: '众数', y: yMaxProb, color: maxProbColor, dashed: true, price: distribution.maxProbabilityPrice },
      { label: '中位', y: yMedian, color: isDark ? '#fbbf24' : '#d97706', dashed: true, price: distribution.percentile50 },
      { label: '1σ', y: y1h, color: sigma1Color, dashed: true, price: distribution.oneSigmaHigh },
      { label: '2σ', y: y2h, color: sigma2Color, dashed: true, price: distribution.twoSigmaHigh },
    ];

    return (
      <svg
        className="pointer-events-none absolute inset-0 z-[2]"
        width={chartWidth}
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={cloudGradId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={accentFill} stopOpacity="0.0" />
            <stop offset="30%" stopColor={accentFill} stopOpacity="0.9" />
            <stop offset="100%" stopColor={accentFill} stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <path d={fillPath} fill={`url(#${cloudGradId})`} />
        <path d={rightPath} fill="none" stroke={accentStroke} strokeWidth={1.25} strokeLinejoin="round" />

        {lineEntries.map((e, i) => {
          if (e.y == null || !isFinite(e.y)) return null;
          if (e.y < -20 || e.y > chartHeight + 20) return null;
          const x1 = Math.max(0, xForFuture - 8);
          const x2 = xForFuture + cloudMaxWidthPx + 4;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={e.y}
                x2={x2}
                y2={e.y}
                stroke={e.color}
                strokeWidth={e.dashed ? 0.8 : 1.3}
                strokeDasharray={e.dashed ? '3 3' : undefined}
                opacity={0.9}
              />
              {!isMobile && (
                <g transform={`translate(${xForFuture + cloudMaxWidthPx + 6}, ${e.y})`}>
                  <rect
                    x={0}
                    y={-8}
                    width={9 + e.label.length * 5.2 + fmt(e.price).length * 4.6}
                    height={16}
                    rx={4}
                    fill={isDark ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.96)'}
                    stroke={e.color}
                    strokeOpacity={0.35}
                  />
                  <text
                    x={4}
                    y={3}
                    fontSize={10}
                    fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                    fill={e.color}
                    fontWeight={600}
                  >
                    {e.label}
                  </text>
                  <text
                    x={4 + e.label.length * 5.2 + 3}
                    y={3}
                    fontSize={10}
                    fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                    fill={isDark ? '#d4d4d8' : '#374151'}
                  >
                    {fmt(e.price)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {!isMobile && distribution.stdDev > 0 && (
          <g transform={`translate(${xForFuture + 4}, ${Math.max(8, minYClamped + 4)})`}>
            <rect
              width={Math.max(76, cloudMaxWidthPx - 8)}
              height={62}
              rx={8}
              fill={isDark ? 'rgba(24, 24, 27, 0.86)' : 'rgba(255, 255, 255, 0.90)'}
              stroke={isDark ? 'rgba(167, 139, 250, 0.25)' : 'rgba(129, 140, 248, 0.25)'}
            />
            <text x={10} y={15} fontSize={10} fill={isDark ? '#a78bfa' : '#6366f1'} fontWeight={700}>
              期权隐含分布 · {distribution.daysToExpiry}天后到期
            </text>
            <text x={10} y={30} fontSize={9.5} fill={isDark ? '#d4d4d8' : '#374151'}>
              期望 {fmt(distribution.expectedPrice)} · 波动 {fmt(distribution.stdDev)}
            </text>
            <text x={10} y={44} fontSize={9.5} fill={isDark ? '#a1a1aa' : '#6b7280'}>
              偏度 {distribution.skew.toFixed(2)} · 峰度 {distribution.kurtosis.toFixed(2)}
            </text>
            <text x={10} y={57} fontSize={9.5} fill={isDark ? '#a1a1aa' : '#6b7280'}>
              1σ区间 [{fmt(distribution.oneSigmaLow)}, {fmt(distribution.oneSigmaHigh)}]
            </text>
          </g>
        )}

        {isMobile && yExp != null && isFinite(yExp) && (
          <g transform={`translate(${xForFuture + 4}, ${Math.min(yExp + 4, chartHeight - 18)})`}>
            <rect
              width={cloudMaxWidthPx - 8}
              height={16}
              rx={4}
              fill={isDark ? 'rgba(24, 24, 27, 0.86)' : 'rgba(255, 255, 255, 0.92)'}
              stroke={isDark ? 'rgba(167, 139, 250, 0.25)' : 'rgba(129, 140, 248, 0.25)'}
            />
            <text x={5} y={11} fontSize={9} fill={isDark ? '#a78bfa' : '#6366f1'} fontWeight={700}>
              期 {fmt(distribution.expectedPrice)} · ±σ {fmt(distribution.stdDev)}
            </text>
          </g>
        )}

        <rect
          x={xForFuture}
          y={minYClamped}
          width={0.5}
          height={Math.max(1, maxYClamped - minYClamped)}
          fill={accentStroke}
          opacity={0.35}
        />
      </svg>
    );
  }, [distribution, chartWidth, chartHeight, priceToY, xForFuture, isMobile, theme]);

  if (!distribution) return null;
  return render;
};

interface DistributionSummaryChipProps {
  theme: Theme;
  distribution: ImpliedDistributionData | null;
}

export const DistributionSummaryChip: React.FC<DistributionSummaryChipProps> = ({ theme, distribution }) => {
  if (!distribution) return null;
  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(2);
    return v.toFixed(3);
  };
  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';
  const mutedCls = isDark ? 'text-zinc-400' : isBlue ? 'text-slate-500' : 'text-slate-500';
  const accentCls = isDark ? 'text-violet-400' : isBlue ? 'text-blue-600' : 'text-indigo-600';
  const upCls = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const downCls = isDark ? 'text-rose-400' : 'text-rose-600';
  const cardCls =
    theme === 'dark'
      ? 'bg-zinc-900/60 border-zinc-700/40 text-zinc-100'
      : theme === 'blue'
      ? 'bg-white/70 border-blue-100 text-slate-900'
      : 'bg-white/70 border-slate-200/60 text-slate-900';

  const expectPct =
    distribution.underlyingPrice > 0
      ? ((distribution.expectedPrice - distribution.underlyingPrice) / distribution.underlyingPrice) * 100
      : 0;
  const volPct =
    distribution.underlyingPrice > 0 ? (distribution.stdDev / distribution.underlyingPrice) * 100 : 0;

  return (
    <div
      className={`inline-flex items-center gap-x-2 sm:gap-x-2.5 gap-y-1 flex-wrap rounded-xl border px-3 py-1.5 text-[10px] sm:text-[11px] backdrop-blur-sm ${cardCls}`}
    >
      <span className={`font-semibold ${accentCls}`}>期权市场预测</span>
      <span className={mutedCls}>到期 {distribution.daysToExpiry}d</span>
      <span className="opacity-30">|</span>
      <span>
        期望 <span className={`font-semibold ${expectPct >= 0 ? upCls : downCls}`}>{fmt(distribution.expectedPrice)}</span>
        <span className={`ml-1 ${expectPct >= 0 ? upCls : downCls}`}>
          {expectPct >= 0 ? '+' : ''}
          {expectPct.toFixed(1)}%
        </span>
      </span>
      <span>
        1σ <span className="font-semibold text-amber-500">±{fmt(distribution.stdDev)}</span>
        <span className={`ml-1 ${mutedCls}`}>({volPct.toFixed(1)}%)</span>
      </span>
      <span className={mutedCls}>
        [{fmt(distribution.oneSigmaLow)}, {fmt(distribution.oneSigmaHigh)}]
      </span>
    </div>
  );
};

interface ExpiryDistributionPickerProps {
  theme: Theme;
  expiries: string[];
  selected: string | null;
  distributionsByExpiry: Map<string, ImpliedDistributionData>;
  onSelect: (expiry: string) => void;
}

export const ExpiryDistributionPicker: React.FC<ExpiryDistributionPickerProps> = ({
  theme,
  expiries,
  selected,
  distributionsByExpiry,
  onSelect,
}) => {
  if (expiries.length === 0) return null;
  const isDark = theme === 'dark';
  const isBlue = theme === 'blue';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {expiries.map((exp) => {
        const d = distributionsByExpiry.get(exp);
        const isSel = selected === exp;
        const dte = d?.daysToExpiry;
        const mm = exp.slice(5);
        const base =
          theme === 'dark'
            ? 'bg-zinc-800/60 border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100'
            : theme === 'blue'
            ? 'bg-white/60 border-blue-100/70 text-slate-700 hover:bg-blue-50 hover:text-blue-900'
            : 'bg-white/60 border-slate-200/70 text-slate-700 hover:bg-slate-100 hover:text-slate-900';
        const active =
          theme === 'dark'
            ? 'bg-violet-500/20 border-violet-400/50 text-violet-300 shadow-sm'
            : theme === 'blue'
            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
            : 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-xs';
        return (
          <button
            key={exp}
            type="button"
            onClick={() => onSelect(exp)}
            className={`rounded-lg border px-2 py-1 text-[10px] sm:text-[11px] font-semibold transition-all duration-150 cursor-pointer select-none ${
              isSel ? active : base
            }`}
            title={d ? `期望 ${d.expectedPrice.toFixed(2)} · σ ${d.stdDev.toFixed(2)}` : exp}
          >
            <span>{mm}</span>
            {dte != null && <span className={`ml-1 opacity-70 ${isDark || isBlue ? '' : ''}`}>{dte}d</span>}
          </button>
        );
      })}
    </div>
  );
};
