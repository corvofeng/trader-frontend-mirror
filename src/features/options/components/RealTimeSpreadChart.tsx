import { useEffect, useMemo, useRef, useState } from 'react';
import { Theme } from '../../../lib/theme';

interface RealTimeSpreadChartProps {
  theme: Theme;
  data: { time: string; price: number | null }[];
  height?: number;
  title?: string;
}

export function RealTimeSpreadChart({ theme, data, height = 180, title }: RealTimeSpreadChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const read = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      if (ro) ro.disconnect();
    };
  }, []);

  const model = useMemo(() => {
    const times = (data || []).map((d) => String(d.time || ''));
    const raw = (data || []).map((d) => (typeof d.price === 'number' && Number.isFinite(d.price) ? d.price : null));
    const filled: Array<number | null> = [];
    let last: number | null = null;
    raw.forEach((v) => {
      if (v != null) last = v;
      filled.push(v ?? last);
    });
    const finite = filled.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const lastFinite = finite.length > 0 ? finite[finite.length - 1] : null;
    const min = finite.length > 0 ? Math.min(...finite) : 0;
    const max = finite.length > 0 ? Math.max(...finite) : 1;
    const pad = (max - min) * 0.1 || 0.05;
    return {
      times,
      values: filled,
      hasValue: finite.length > 0,
      lastText: lastFinite == null ? '--' : lastFinite.toFixed(4),
      yMin: min - pad,
      yMax: max + pad,
    };
  }, [data]);

  const svg = useMemo(() => {
    const w = size.w || 0;
    const h = size.h || 0;
    if (w <= 0 || h <= 0) return null;

    const isDark = theme === 'dark';
    const textColor = isDark ? '#d1d5db' : '#374151';
    const muted = isDark ? '#9ca3af' : '#6b7280';
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.08)';
    const line = '#6366f1';
    const fillTop = 'rgba(99, 102, 241, 0.28)';
    const fillBottom = 'rgba(99, 102, 241, 0.0)';

    const left = 42;
    const right = 24;
    const top = title ? 26 : 16;
    const bottom = 22;
    const pw = Math.max(1, w - left - right);
    const ph = Math.max(1, h - top - bottom);

    const n = model.times.length;
    const denom = Math.max(1, n - 1);
    const yRange = Math.max(1e-9, model.yMax - model.yMin);

    const pts: Array<{ x: number; y: number; v: number }> = [];
    model.values.forEach((v, i) => {
      if (v == null) return;
      const x = left + (n === 1 ? pw / 2 : (i * pw) / denom);
      const y = top + (1 - (v - model.yMin) / yRange) * ph;
      pts.push({ x, y, v });
    });

    const polylinePoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const areaPoints =
      pts.length > 0
        ? `${pts[0].x.toFixed(2)},${(top + ph).toFixed(2)} ${polylinePoints} ${pts[pts.length - 1].x.toFixed(2)},${(
            top + ph
          ).toFixed(2)}`
        : '';

    const firstLabel = model.times[0]?.split(':').slice(0, 2).join(':') || '';
    const lastLabel = (model.times[model.times.length - 1] || '').split(':').slice(0, 2).join(':');
    const yMinText = Number.isFinite(model.yMin) ? model.yMin.toFixed(4) : '--';
    const yMaxText = Number.isFinite(model.yMax) ? model.yMax.toFixed(4) : '--';

    const gridLines = Array.from({ length: 4 }).map((_, i) => {
      const t = (i + 1) / 5;
      const y = top + t * ph;
      return <line key={i} x1={left} y1={y} x2={left + pw} y2={y} stroke={grid} strokeWidth={1} />;
    });

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title || 'spread-chart'}>
        <defs>
          <linearGradient id="spreadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillTop} />
            <stop offset="100%" stopColor={fillBottom} />
          </linearGradient>
          <style>{`
            .rt-pulse {
              transform-origin: center;
              animation: rtPulse 1.2s ease-in-out infinite;
            }
            @keyframes rtPulse {
              0% { opacity: 0.65; r: 4; }
              50% { opacity: 0.12; r: 10; }
              100% { opacity: 0.65; r: 4; }
            }
          `}</style>
        </defs>

        {title ? (
          <text x={w / 2} y={16} textAnchor="middle" fontSize={12} fill={textColor}>
            {title}
          </text>
        ) : null}

        <text x={8} y={14} fontSize={11} fill={muted}>
          最新: {model.lastText}
        </text>

        {gridLines}
        <line x1={left} y1={top} x2={left} y2={top + ph} stroke={grid} strokeWidth={1} />
        <line x1={left} y1={top + ph} x2={left + pw} y2={top + ph} stroke={grid} strokeWidth={1} />

        <text x={left - 6} y={top + 10} textAnchor="end" fontSize={10} fill={muted}>
          {yMaxText}
        </text>
        <text x={left - 6} y={top + ph} textAnchor="end" fontSize={10} fill={muted}>
          {yMinText}
        </text>

        <text x={left} y={h - 6} textAnchor="start" fontSize={10} fill={muted}>
          {firstLabel}
        </text>
        <text x={left + pw} y={h - 6} textAnchor="end" fontSize={10} fill={muted}>
          {lastLabel}
        </text>

        {pts.length > 1 ? (
          <>
            <polygon points={areaPoints} fill="url(#spreadFill)" />
            <polyline points={polylinePoints} fill="none" stroke={line} strokeWidth={3} />
            <circle
              className="rt-pulse"
              cx={pts[pts.length - 1].x}
              cy={pts[pts.length - 1].y}
              r={7}
              fill={line}
            />
            <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={line} />
            <text
              x={Math.min(left + pw, pts[pts.length - 1].x + 10)}
              y={Math.max(top + 12, pts[pts.length - 1].y - 10)}
              fontSize={11}
              fill={textColor}
            >
              {pts[pts.length - 1].v.toFixed(4)}
            </text>
          </>
        ) : pts.length === 1 ? (
          <>
            <circle className="rt-pulse" cx={pts[0].x} cy={pts[0].y} r={7} fill={line} />
            <circle cx={pts[0].x} cy={pts[0].y} r={5} fill={line} />
            <text
              x={Math.min(left + pw, pts[0].x + 10)}
              y={Math.max(top + 12, pts[0].y - 10)}
              fontSize={11}
              fill={textColor}
            >
              {pts[0].v.toFixed(4)}
            </text>
          </>
        ) : null}

        {!model.hasValue ? (
          <text x={left + pw / 2} y={top + ph / 2} textAnchor="middle" fontSize={12} fill={muted}>
            等待报价…
          </text>
        ) : null}
      </svg>
    );
  }, [model, size.h, size.w, theme, title]);

  return (
    <div 
      className={`rounded-xl border ${theme === 'dark' ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-white/50'} p-2 backdrop-blur-sm shadow-sm transition-all`}
    >
      <div ref={wrapperRef} style={{ width: '100%', height: `${height}px` }}>
        {svg}
      </div>
    </div>
  );
}
