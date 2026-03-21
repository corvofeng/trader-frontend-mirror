import React, { useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '../../../shared/utils/logger';
import * as echarts from 'echarts';
import type { CallbackDataParams } from 'echarts';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsData, VerticalSpreadMonthlyPriceItem } from '../../../lib/services/types';

interface VerticalSpreadMonthlyPricesChartProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
}

type SpreadType = 'call' | 'put';

type NormalizedPoint = {
  label: string;
  sortKey: number | null;
  price: number | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

const extractExpiryLabel = (raw: unknown): { label: string; sortKey: number | null } => {
  const text = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
  if (!text) return { label: '-', sortKey: null };
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return { label: format(d, 'yyyy-MM'), sortKey: d.getTime() };
  }
  return { label: text, sortKey: null };
};

const pickPointPrice = (point: Record<string, unknown>): number | null => {
  const candidates = [
    point.price,
    point.value,
    point.mid,
    point.spread_price,
    point.last_price,
    point.close,
    point.mark,
    point.settle
  ];
  for (const c of candidates) {
    const n = toFiniteNumber(c);
    if (n != null) return n;
  }
  return null;
};

const normalizePricesByExpiry = (item: VerticalSpreadMonthlyPriceItem): NormalizedPoint[] => {
  const points: NormalizedPoint[] = [];
  (item.prices_by_expiry || []).forEach((p, idx) => {
    if (typeof p === 'number') {
      points.push({ label: `M${idx + 1}`, sortKey: idx, price: p });
      return;
    }
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      const expiryRaw = obj.expiry ?? obj.expiry_date ?? obj.month ?? obj.date ?? obj.exp;
      const { label, sortKey } = extractExpiryLabel(expiryRaw);
      points.push({ label, sortKey, price: pickPointPrice(obj) });
      return;
    }
    points.push({ label: `M${idx + 1}`, sortKey: idx, price: null });
  });

  const haveSortable = points.some(p => p.sortKey != null && !Number.isNaN(p.sortKey));
  if (haveSortable) {
    return [...points].sort((a, b) => {
      const ak = a.sortKey ?? Number.POSITIVE_INFINITY;
      const bk = b.sortKey ?? Number.POSITIVE_INFINITY;
      return ak - bk;
    });
  }
  return points;
};

const formatSpreadLabel = (item: VerticalSpreadMonthlyPriceItem) => {
  const t = String(item.option_type || '').toUpperCase();
  const w = toFiniteNumber(item.spread_width);
  const widthText = w != null ? ` · W=${w}` : '';
  return `${t} ${item.lower_strike}-${item.upper_strike}${widthText}`;
};

export function VerticalSpreadMonthlyPricesChart({ theme, optionsData, selectedSymbol }: VerticalSpreadMonthlyPricesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const isMountedRef = useRef(true);
  const { currencyConfig } = useCurrency();

  const spreads = useMemo(
    () => (optionsData.vertical_spread_monthly_prices || []).filter(s => s && Array.isArray(s.prices_by_expiry)),
    [optionsData]
  );

  const initialType: SpreadType = useMemo(() => {
    const hasCall = spreads.some(s => String(s.option_type).toLowerCase() === 'call');
    const hasPut = spreads.some(s => String(s.option_type).toLowerCase() === 'put');
    if (hasCall) return 'call';
    if (hasPut) return 'put';
    return 'call';
  }, [spreads]);

  const [spreadType, setSpreadType] = useState<SpreadType>(initialType);
  const filteredSpreads = useMemo(() => {
    const typed = spreads.filter(s => String(s.option_type).toLowerCase() === spreadType);
    return typed.map(s => ({ spread: s, normalized: normalizePricesByExpiry(s) }));
  }, [spreads, spreadType]);

  useEffect(() => {
    setSpreadType(initialType);
  }, [initialType]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !isMountedRef.current) {
      logger.debug('[VerticalSpreadMonthlyPricesChart] Guard: chart not ready', {
        hasRef: !!chartRef.current,
        isMounted: !!isMountedRef.current
      });
      return;
    }

    if (!filteredSpreads.length) {
      return;
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    chartInstanceRef.current = echarts.init(chartRef.current);

    const isDark = theme === 'dark';
    const labelMeta = new Map<string, { sortKey: number | null; firstIndex: number }>();
    filteredSpreads.forEach(({ normalized }) => {
      normalized.forEach((p, idx) => {
        const existing = labelMeta.get(p.label);
        if (!existing) {
          labelMeta.set(p.label, { sortKey: p.sortKey, firstIndex: idx });
          return;
        }
        if (existing.sortKey == null && p.sortKey != null) {
          labelMeta.set(p.label, { sortKey: p.sortKey, firstIndex: existing.firstIndex });
          return;
        }
        if (existing.sortKey != null && p.sortKey != null && p.sortKey < existing.sortKey) {
          labelMeta.set(p.label, { sortKey: p.sortKey, firstIndex: existing.firstIndex });
        }
      });
    });

    const labelEntries = Array.from(labelMeta.entries()).map(([label, meta]) => ({ label, ...meta }));
    const hasSortable = labelEntries.some(e => e.sortKey != null && Number.isFinite(e.sortKey));
    const xLabels = hasSortable
      ? labelEntries.sort((a, b) => (a.sortKey ?? Number.POSITIVE_INFINITY) - (b.sortKey ?? Number.POSITIVE_INFINITY)).map(e => e.label)
      : labelEntries.sort((a, b) => a.firstIndex - b.firstIndex).map(e => e.label);

    const series = filteredSpreads.map(({ spread, normalized }) => {
      const map = new Map<string, number | null>();
      normalized.forEach(p => {
        map.set(p.label, p.price);
      });
      return {
        name: formatSpreadLabel(spread),
        type: 'line',
        data: xLabels.map(l => map.get(l) ?? null),
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 1.5,
          opacity: 0.85
        },
        emphasis: {
          focus: 'series'
        }
      };
    });

    const option = {
      title: {
        text: `${selectedSymbol} 垂直价差跨月价格对比`,
        subtext: `${String(spreadType).toUpperCase()}`,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 16
        },
        subtextStyle: {
          color: isDark ? '#cbd5e1' : '#334155',
          fontSize: 11
        }
      },
      legend: {
        type: 'scroll',
        top: 40,
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        formatter: (params: CallbackDataParams | CallbackDataParams[]) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0];
          const idx = first?.dataIndex ?? 0;
          const label = xLabels[idx] || '';
          const lines = arr
            .filter(p => p.data != null)
            .sort((a, b) => {
              const av = typeof a.data === 'number' ? a.data : Number(a.data || 0);
              const bv = typeof b.data === 'number' ? b.data : Number(b.data || 0);
              return bv - av;
            })
            .map(p => {
              const value = typeof p.data === 'number' ? p.data : Number(p.data || 0);
              return `<div>${p.seriesName}: ${formatCurrency(value, currencyConfig)}</div>`;
            })
            .join('');
          return `
            <div>
              <div style="font-weight:bold;margin-bottom:4px;">${label}</div>
              ${lines || '<div>-</div>'}
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '8%',
        top: '28%',
        bottom: '14%'
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          fontSize: 11,
          formatter: (value: number) => formatCurrency(value, currencyConfig)
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#f3f4f6'
          }
        }
      },
      series
    };

    if (isMountedRef.current && chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option);
    }

    const handleResize = () => {
      if (isMountedRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [currencyConfig, filteredSpreads, selectedSymbol, spreadType, theme]);

  if (!spreads.length) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>垂直价差跨月价格对比 - {selectedSymbol}</h2>
          <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">暂无垂直价差跨月价格数据</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>垂直价差跨月价格对比 - {selectedSymbol}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSpreadType('call')}
                className={`px-3 py-2 text-sm ${
                  spreadType === 'call'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Call
              </button>
              <button
                type="button"
                onClick={() => setSpreadType('put')}
                className={`px-3 py-2 text-sm ${
                  spreadType === 'put'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Put
              </button>
            </div>
          </div>
        </div>
        {!filteredSpreads.length ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">当前类型暂无可展示的价差数据</div>
        ) : null}
        <div ref={chartRef} style={{ height: '380px' }} />
      </div>
    </div>
  );
}
