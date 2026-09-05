import { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import { format } from 'date-fns';
import { PieChart, TrendingUp, Users, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import type { CashFlowItem } from '../../../lib/services/types';

interface CashFlowCounterpartyChartsProps {
  theme: Theme;
  items: CashFlowItem[];
  allCounterparties?: string[];
  isMasked?: boolean;
  onToggleMask?: () => void;
}

type TimeChartMetric = 'cumulative' | 'ratio' | 'discrete';

export const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#e11d48', // rose
];

/**
 * Deterministic mask for counterparty name to protect privacy in screenshots.
 * E.g. "张春秋" -> "对手方 A (7b4f)"
 */
export function getCounterpartyMask(name: string, index?: number): string {
  if (!name || name === '未指定对手方') return '对手方 (未指定)';
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  const hex = Math.abs(h).toString(16).padStart(4, '0').slice(0, 4);
  const letter = index !== undefined ? ` ${String.fromCharCode(65 + (index % 26))}` : '';
  return `对手方${letter} (${hex})`;
}

/**
 * Extract all unique counterparties from items in a stable order:
 * deposits first (sorted), followed by any others.
 */
export function extractAllCounterparties(items: CashFlowItem[]): string[] {
  const depositSet = new Set<string>();
  const otherSet = new Set<string>();

  for (const item of items || []) {
    const name = (item.counterparty || '').trim();
    if (!name) continue;
    if (item.flow_type === 'deposit') {
      depositSet.add(name);
    } else {
      otherSet.add(name);
    }
  }

  const deposits = Array.from(depositSet).sort();
  const others = Array.from(otherSet).filter((n) => !depositSet.has(n)).sort();
  const result = [...deposits, ...others];

  // If there are deposit items without counterparty, include placeholder
  const hasEmptyDeposit = (items || []).some(
    (item) => item.flow_type === 'deposit' && !(item.counterparty || '').trim()
  );
  if (hasEmptyDeposit && !result.includes('未指定对手方')) {
    result.push('未指定对手方');
  }

  return result;
}

export interface CounterpartyMeta {
  rawName: string;
  displayName: string;
  color: string;
  index: number;
}

export function getCounterpartyMeta(
  name: string | null | undefined,
  allCounterparties: string[],
  isMasked: boolean
): CounterpartyMeta | null {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  let idx = allCounterparties.indexOf(trimmed);
  if (idx === -1) {
    // Fallback deterministic index
    let sum = 0;
    for (let i = 0; i < trimmed.length; i++) sum += trimmed.charCodeAt(i);
    idx = Math.abs(sum) % PALETTE.length;
  }
  const color = PALETTE[idx % PALETTE.length];
  const displayName = isMasked ? getCounterpartyMask(trimmed, idx) : trimmed;

  return {
    rawName: trimmed,
    displayName,
    color,
    index: idx,
  };
}

export function CashFlowCounterpartyCharts({
  theme,
  items,
  allCounterparties: propAllCounterparties,
  isMasked: controlledMasked,
  onToggleMask: controlledToggleMask
}: CashFlowCounterpartyChartsProps) {
  const pieRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const pieChartInstance = useRef<echarts.ECharts | null>(null);
  const lineChartInstance = useRef<echarts.ECharts | null>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  // Internal mask state if not controlled externally (default true for screenshot safety)
  const [internalMasked, setInternalMasked] = useState(true);
  const effectiveMasked = controlledMasked !== undefined ? controlledMasked : internalMasked;
  const handleToggleMask = controlledToggleMask || (() => setInternalMasked((prev) => !prev));

  const [timeMetric, setTimeMetric] = useState<TimeChartMetric>('cumulative');

  // Filter only deposit items with valid amount
  const depositItems = useMemo(() => {
    return (items || [])
      .filter((item) => item.flow_type === 'deposit' && Math.abs(parseFloat(String(item.amount)) || 0) > 0)
      .sort((a, b) => (a.flow_date > b.flow_date ? 1 : a.flow_date < b.flow_date ? -1 : 0));
  }, [items]);

  // Fast map grouping deposits by date O(1)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CashFlowItem[]>();
    for (const item of depositItems) {
      if (!item.flow_date) continue;
      const list = map.get(item.flow_date);
      if (list) {
        list.push(item);
      } else {
        map.set(item.flow_date, [item]);
      }
    }
    return map;
  }, [depositItems]);

  // Extract all available counterparties
  const internalCounterparties = useMemo(() => {
    return extractAllCounterparties(items);
  }, [items]);

  const allCounterparties = propAllCounterparties && propAllCounterparties.length > 0
    ? propAllCounterparties
    : internalCounterparties;

  // Selected counterparties for filtering
  const [selectedCounterparties, setSelectedCounterparties] = useState<string[]>([]);

  // Keep selectedCounterparties in sync when allCounterparties change (with identity check to prevent loop)
  useEffect(() => {
    setSelectedCounterparties((prev) => {
      if (prev.length === 0) return allCounterparties;
      const valid = prev.filter((p) => allCounterparties.includes(p));
      if (valid.length === 0) return allCounterparties;
      if (valid.length === prev.length && valid.every((v, i) => v === prev[i])) {
        return prev;
      }
      return valid;
    });
  }, [allCounterparties]);

  const isAllSelected =
    allCounterparties.length > 0 && selectedCounterparties.length === allCounterparties.length;

  // Counterparty color map for visual consistency between pie and line chart
  const counterpartyColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCounterparties.forEach((name, idx) => {
      map[name] = PALETTE[idx % PALETTE.length];
    });
    return map;
  }, [allCounterparties]);

  // Display name mapping (masked vs real)
  const displayNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCounterparties.forEach((name, idx) => {
      map[name] = effectiveMasked ? getCounterpartyMask(name, idx) : name;
    });
    return map;
  }, [allCounterparties, effectiveMasked]);

  // Handle clicking a counterparty chip
  const handleChipClick = (name: string) => {
    if (selectedCounterparties.length === allCounterparties.length) {
      // If currently all are selected, clicking one isolates that one
      setSelectedCounterparties([name]);
    } else if (selectedCounterparties.length === 1 && selectedCounterparties[0] === name) {
      // If currently this one is isolated, clicking it again resets to ALL
      setSelectedCounterparties(allCounterparties);
    } else if (selectedCounterparties.includes(name)) {
      // Deselect this one
      const next = selectedCounterparties.filter((n) => n !== name);
      setSelectedCounterparties(next.length > 0 ? next : allCounterparties);
    } else {
      // Add to selection
      setSelectedCounterparties([...selectedCounterparties, name]);
    }
  };

  // Aggregated data per counterparty
  const counterpartyStats = useMemo(() => {
    const totals: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const item of depositItems) {
      const name = (item.counterparty || '').trim() || '未指定对手方';
      const amt = Math.abs(parseFloat(String(item.amount)) || 0);
      totals[name] = (totals[name] || 0) + amt;
      counts[name] = (counts[name] || 0) + 1;
    }

    const selectedTotal = selectedCounterparties.reduce((acc, name) => acc + (totals[name] || 0), 0);

    return { totals, counts, selectedTotal };
  }, [depositItems, selectedCounterparties]);

  // Theme colors for ECharts
  const isDark = theme === 'dark';
  const textColor = isDark ? '#e4e4e7' : '#18181b';
  const subTextColor = isDark ? '#a1a1aa' : '#71717a';
  const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const tooltipBg = isDark ? '#18181b' : '#ffffff';
  const tooltipBorder = isDark ? '#27272a' : '#e4e4e7';

  // 1. Render Pie Chart with safe instance lifecycle
  useEffect(() => {
    if (!pieRef.current) return;

    // Dispose old instance on this DOM
    const existing = echarts.getInstanceByDom(pieRef.current);
    if (existing) {
      existing.dispose();
    }
    if (pieChartInstance.current && !pieChartInstance.current.isDisposed()) {
      pieChartInstance.current.dispose();
    }

    const chart = echarts.init(pieRef.current);
    pieChartInstance.current = chart;

    if (allCounterparties.length === 0 || selectedCounterparties.length === 0) {
      chart.clear();
      return () => {
        chart.dispose();
        pieChartInstance.current = null;
      };
    }

    const pieData = selectedCounterparties.map((name) => ({
      name: displayNameMap[name] || name,
      value: counterpartyStats.totals[name] || 0,
      itemStyle: {
        color: counterpartyColorMap[name] || PALETTE[0]
      }
    }));

    const totalSelected = counterpartyStats.selectedTotal;

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor, fontSize: 12 },
        formatter: (params: any) => {
          const val = Number(params.value || 0);
          const pct = totalSelected > 0 ? ((val / totalSelected) * 100).toFixed(1) : '0.0';
          return `
            <div style="font-weight:600;margin-bottom:4px;color:${textColor}">${params.name}</div>
            <div style="display:flex;justify-content:space-between;gap:12px;color:${subTextColor}">
              <span>入金金额:</span>
              <strong style="color:${textColor}">¥ ${val.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:12px;color:${subTextColor}">
              <span>所选占比:</span>
              <strong style="color:${params.color}">${pct}%</strong>
            </div>
          `;
        }
      },
      legend: {
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        type: 'scroll',
        textStyle: { color: subTextColor, fontSize: 11 },
        pageIconColor: isDark ? '#a1a1aa' : '#71717a',
        pageTextStyle: { color: subTextColor }
      },
      series: [
        {
          name: '入金对手方占比',
          type: 'pie',
          radius: isMobile ? ['32%', '52%'] : ['44%', '70%'],
          center: isMobile ? ['50%', '42%'] : ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: isDark ? '#18181b' : '#ffffff',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'outside',
            formatter: (params: any) => {
              const pct = totalSelected > 0 ? ((Number(params.value || 0) / totalSelected) * 100).toFixed(1) : '0';
              return `{b|${params.name}}\n{p|${pct}%}`;
            },
            rich: {
              b: {
                color: textColor,
                fontSize: isMobile ? 10 : 11,
                lineHeight: isMobile ? 13 : 14
              },
              p: {
                color: subTextColor,
                fontSize: isMobile ? 9 : 10,
                lineHeight: isMobile ? 11 : 12
              }
            }
          },
          emphasis: {
            label: {
              show: true,
              fontSize: isMobile ? 12 : 13,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          },
          data: pieData
        }
      ]
    };

    chart.setOption(option, true);

    return () => {
      chart.dispose();
      pieChartInstance.current = null;
    };
  }, [
    allCounterparties,
    selectedCounterparties,
    counterpartyStats,
    counterpartyColorMap,
    displayNameMap,
    textColor,
    subTextColor,
    tooltipBg,
    tooltipBorder,
    isDark,
    isMobile
  ]);

  // 2. Render Time Series Chart with safe instance lifecycle
  useEffect(() => {
    if (!lineRef.current) return;

    const existing = echarts.getInstanceByDom(lineRef.current);
    if (existing) {
      existing.dispose();
    }
    if (lineChartInstance.current && !lineChartInstance.current.isDisposed()) {
      lineChartInstance.current.dispose();
    }

    const chart = echarts.init(lineRef.current);
    lineChartInstance.current = chart;

    if (allCounterparties.length === 0 || selectedCounterparties.length === 0) {
      chart.clear();
      return () => {
        chart.dispose();
        lineChartInstance.current = null;
      };
    }

    // Collect all distinct dates and extend up to current date (today)
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const dateSet = new Set<string>();
    depositItems.forEach((item) => {
      if (item.flow_date) dateSet.add(item.flow_date);
    });
    dateSet.add(todayStr);
    const sortedDates = Array.from(dateSet).sort();

    if (sortedDates.length === 0) {
      chart.clear();
      return () => {
        chart.dispose();
        lineChartInstance.current = null;
      };
    }

    // Build series data based on timeMetric
    const seriesList: echarts.SeriesOption[] = [];

    if (timeMetric === 'cumulative') {
      const runningTotals: Record<string, number> = {};
      selectedCounterparties.forEach((name) => {
        runningTotals[name] = 0;
      });

      const seriesData: Record<string, number[]> = {};
      selectedCounterparties.forEach((name) => {
        seriesData[name] = [];
      });

      // Track running sum per date using O(1) map
      sortedDates.forEach((date) => {
        const dateItems = itemsByDate.get(date) || [];
        dateItems.forEach((i) => {
          const name = (i.counterparty || '').trim() || '未指定对手方';
          if (runningTotals[name] !== undefined) {
            runningTotals[name] += Math.abs(parseFloat(String(i.amount)) || 0);
          }
        });
        selectedCounterparties.forEach((name) => {
          seriesData[name].push(runningTotals[name]);
        });
      });

      selectedCounterparties.forEach((name) => {
        const color = counterpartyColorMap[name] || PALETTE[0];
        const displayName = displayNameMap[name] || name;
        seriesList.push({
          name: displayName,
          type: 'line',
          smooth: true,
          showSymbol: sortedDates.length < 20,
          symbolSize: 6,
          itemStyle: { color },
          lineStyle: { width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color + '33' },
              { offset: 1, color: color + '00' }
            ])
          },
          data: seriesData[name]
        });
      });
    } else if (timeMetric === 'ratio') {
      const runningTotals: Record<string, number> = {};
      selectedCounterparties.forEach((name) => {
        runningTotals[name] = 0;
      });

      const seriesData: Record<string, number[]> = {};
      selectedCounterparties.forEach((name) => {
        seriesData[name] = [];
      });

      sortedDates.forEach((date) => {
        const dateItems = itemsByDate.get(date) || [];
        dateItems.forEach((i) => {
          const name = (i.counterparty || '').trim() || '未指定对手方';
          if (runningTotals[name] !== undefined) {
            runningTotals[name] += Math.abs(parseFloat(String(i.amount)) || 0);
          }
        });

        const dateTotal = selectedCounterparties.reduce((sum, n) => sum + runningTotals[n], 0);

        selectedCounterparties.forEach((name) => {
          const pct = dateTotal > 0 ? (runningTotals[name] / dateTotal) * 100 : 0;
          seriesData[name].push(parseFloat(pct.toFixed(2)));
        });
      });

      selectedCounterparties.forEach((name) => {
        const color = counterpartyColorMap[name] || PALETTE[0];
        const displayName = displayNameMap[name] || name;
        seriesList.push({
          name: displayName,
          type: 'line',
          stack: 'ratioStack',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.6, color },
          lineStyle: { width: 1.5, color },
          itemStyle: { color },
          data: seriesData[name]
        });
      });
    } else {
      const seriesData: Record<string, number[]> = {};
      selectedCounterparties.forEach((name) => {
        seriesData[name] = new Array(sortedDates.length).fill(0);
      });

      sortedDates.forEach((date, dIdx) => {
        const dateItems = itemsByDate.get(date) || [];
        dateItems.forEach((i) => {
          const name = (i.counterparty || '').trim() || '未指定对手方';
          if (seriesData[name]) {
            seriesData[name][dIdx] += Math.abs(parseFloat(String(i.amount)) || 0);
          }
        });
      });

      selectedCounterparties.forEach((name) => {
        const color = counterpartyColorMap[name] || PALETTE[0];
        const displayName = displayNameMap[name] || name;
        seriesList.push({
          name: displayName,
          type: 'bar',
          stack: 'discreteStack',
          itemStyle: { color },
          data: seriesData[name]
        });
      });
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor, fontSize: 12 },
        axisPointer: {
          type: timeMetric === 'discrete' ? 'shadow' : 'cross',
          lineStyle: { color: isDark ? '#52525b' : '#d4d4d8' }
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const dateStr = params[0].axisValue;
          let html = `<div style="font-weight:600;margin-bottom:6px;color:${textColor}">${dateStr}</div>`;
          params.forEach((item: any) => {
            const val = Number(item.value || 0);
            const valFormatted =
              timeMetric === 'ratio'
                ? `${val.toFixed(1)}%`
                : `¥ ${val.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
            html += `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:3px 0;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
                  <span style="color:${subTextColor}">${item.seriesName}:</span>
                </div>
                <strong style="color:${textColor}">${valFormatted}</strong>
              </div>
            `;
          });
          return html;
        }
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        textStyle: { color: subTextColor, fontSize: 11 },
        pageIconColor: isDark ? '#a1a1aa' : '#71717a',
        pageTextStyle: { color: subTextColor }
      },
      grid: {
        left: '3%',
        right: '3%',
        top: '12%',
        bottom: isMobile ? '18%' : '14%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: sortedDates,
        axisLine: { lineStyle: { color: isDark ? '#3f3f46' : '#e4e4e7' } },
        axisLabel: {
          color: subTextColor,
          fontSize: isMobile ? 9 : 10,
          rotate: isMobile && sortedDates.length > 5 ? 30 : 0,
          formatter: (val: string) => {
            if (val === todayStr) return isMobile ? `${val.slice(5)}\n今日` : `${val}\n(今日)`;
            if (isMobile && val.length === 10) return val.slice(5);
            return val;
          }
        }
      },
      yAxis: {
        type: 'value',
        max: timeMetric === 'ratio' ? 100 : undefined,
        splitLine: { lineStyle: { color: splitLineColor } },
        axisLabel: {
          color: subTextColor,
          fontSize: 10,
          formatter: (val: number) => {
            if (timeMetric === 'ratio') return `${val}%`;
            if (val >= 10000) return `${(val / 10000).toFixed(0)}万`;
            return `${val}`;
          }
        }
      },
      series: seriesList
    };

    chart.setOption(option, true);

    return () => {
      chart.dispose();
      lineChartInstance.current = null;
    };
  }, [
    depositItems,
    itemsByDate,
    allCounterparties,
    selectedCounterparties,
    timeMetric,
    counterpartyColorMap,
    displayNameMap,
    textColor,
    subTextColor,
    splitLineColor,
    tooltipBg,
    tooltipBorder,
    isDark,
    isMobile
  ]);

  // Window resize handler with isDisposed guard and isMobile update
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
      if (pieChartInstance.current && !pieChartInstance.current.isDisposed()) {
        pieChartInstance.current.resize();
      }
      if (lineChartInstance.current && !lineChartInstance.current.isDisposed()) {
        lineChartInstance.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // If no counterparties, render clean empty placeholder instead of unmounting DOM
  if (allCounterparties.length === 0) {
    return null;
  }

  return (
    <div className={`${themes[theme].card} rounded-xl p-4 sm:p-5 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4`}>
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${themes[theme].text} flex items-center gap-2`}>
              对手方入金比例与时间分布
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-normal">
                {allCounterparties.length} 位对手方
              </span>
            </h3>
            <p className="text-xs text-slate-400 dark:text-zinc-500">
              统计各对手方入金金额占比及时间推进下的注资趋势（已延伸至今日）
            </p>
          </div>
        </div>

        {/* Action Controls: Privacy Mode */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleToggleMask}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              effectiveMasked
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
            title={effectiveMasked ? '已开启隐私脱敏（隐藏真实姓名以防截图泄露），点击显示明文' : '点击隐藏真实姓名以防截图泄露'}
          >
            {effectiveMasked ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{effectiveMasked ? '已开启脱敏 (截图防泄密)' : '明文显示'}</span>
          </button>
        </div>
      </div>

      {/* Dedicated Counterparty Selector Toolbar (wrapping layout, no ugly scrollbar) */}
      <div className="rounded-xl p-3 bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-200/60 dark:border-zinc-800/60 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">筛选对手方:</span>
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            提示：点击单人聚焦，再次点击该人直接恢复全部
          </span>
        </div>

        {/* Chips Row: wrapping naturally, clean and spacious */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {/* All Chip */}
          <button
            type="button"
            onClick={() => setSelectedCounterparties(allCounterparties)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isAllSelected
                ? 'border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>全部对手方</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-mono">
              {allCounterparties.length}
            </span>
          </button>

          <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-0.5" />

          {/* Individual Counterparty Chips */}
          {allCounterparties.map((name) => {
            const isSelected = selectedCounterparties.includes(name);
            const isSolo = selectedCounterparties.length === 1 && isSelected;
            const color = counterpartyColorMap[name];
            const displayName = displayNameMap[name] || name;
            const totalAmt = counterpartyStats.totals[name] || 0;
            const share =
              counterpartyStats.selectedTotal > 0 && isSelected
                ? ((totalAmt / counterpartyStats.selectedTotal) * 100).toFixed(1)
                : null;

            return (
              <button
                key={name}
                type="button"
                onClick={() => handleChipClick(name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  isSelected
                    ? 'border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-2xs text-slate-900 dark:text-zinc-100'
                    : 'border-transparent bg-slate-200/50 dark:bg-zinc-800/40 opacity-50 hover:opacity-80 text-slate-500 dark:text-zinc-400'
                }`}
                title={isSolo ? '当前单选此人，点击恢复全选' : isAllSelected ? '点击仅看此人' : '点击切换选择'}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium">{displayName}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  ¥{(totalAmt / 10000).toFixed(1)}万
                </span>
                {isSelected && share && (
                  <span
                    className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                    style={{ backgroundColor: color + '20', color }}
                  >
                    {share}%
                  </span>
                )}
                {isSolo && (
                  <span className="text-[10px] text-blue-500 underline ml-0.5">
                    {isMobile ? '(已单选)' : '(单选·点此恢复全部)'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
        {/* Pie Chart Card (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-100 dark:border-zinc-800/80 p-4 bg-slate-50/40 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-emerald-500" />
              <h4 className={`text-xs font-bold ${themes[theme].text}`}>对手方入金比例 (Share)</h4>
            </div>
            <span className="text-[11px] text-slate-400">
              已选总计: ¥{counterpartyStats.selectedTotal.toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
            </span>
          </div>

          <div ref={pieRef} className="w-full h-64 sm:h-72" />
        </div>

        {/* Time Series Chart Card (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-100 dark:border-zinc-800/80 p-4 bg-slate-50/40 dark:bg-zinc-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <h4 className={`text-xs font-bold ${themes[theme].text}`}>
                时间趋势 ({timeMetric === 'cumulative' ? '累计入金' : timeMetric === 'ratio' ? '累计占比变化%' : '各期单笔入金'})
              </h4>
            </div>

            {/* Metric Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-zinc-700 p-0.5 bg-white dark:bg-zinc-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTimeMetric('cumulative')}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
                  timeMetric === 'cumulative'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                累计金额
              </button>
              <button
                type="button"
                onClick={() => setTimeMetric('ratio')}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
                  timeMetric === 'ratio'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                累计占比%
              </button>
              <button
                type="button"
                onClick={() => setTimeMetric('discrete')}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
                  timeMetric === 'discrete'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                单笔入金
              </button>
            </div>
          </div>

          <div ref={lineRef} className="w-full h-64 sm:h-72" />
        </div>
      </div>
    </div>
  );
}
