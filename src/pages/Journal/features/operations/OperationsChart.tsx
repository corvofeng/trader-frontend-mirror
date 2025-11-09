import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { format } from 'date-fns';
import { Theme, themes } from '../../../../lib/theme';
import type { Operation } from '../../../../lib/services/types';

interface OperationsChartProps {
  theme: Theme;
  operations: Operation[];
  dateRange: { startDate: string; endDate: string };
}

function generateDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  const oneDay = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += oneDay) {
    const d = new Date(t);
    const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
    dates.push(iso.split('T')[0]);
  }
  return dates;
}

export function OperationsChart({ theme, operations, dateRange }: OperationsChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
    }

    chartInstanceRef.current = echarts.init(chartRef.current);

    const isDark = theme === 'dark';
    const textColor = isDark ? '#e5e7eb' : '#111827';
    const axisColor = isDark ? '#4b5563' : '#d1d5db';

    // 聚合：operation 按天计数
    const dateKeys = generateDateRange(dateRange.startDate, dateRange.endDate);
    const opNames = Array.from(new Set(operations.map(op => op.func_name))).sort();

    const countsByOp: Record<string, number[]> = {};
    for (const name of opNames) {
      countsByOp[name] = new Array(dateKeys.length).fill(0);
    }
    for (const op of operations) {
      const dayKey = format(new Date(op.call_time), 'yyyy-MM-dd');
      const idx = dateKeys.indexOf(dayKey);
      if (idx >= 0) {
        countsByOp[op.func_name][idx]++;
      }
    }

    // 配色（最多支持 10 个分类，超出循环使用）
    const palette = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#f97316', '#22c55e', '#e11d48', '#64748b'
    ];

    const series = opNames.map((name, i) => ({
      name,
      type: 'bar' as const,
      stack: 'total',
      emphasis: { focus: 'series' as const },
      itemStyle: { color: palette[i % palette.length] },
      data: countsByOp[name]
    }));

    const option: echarts.EChartsOption = {
      title: {
        text: '系统操作每日执行次数（按操作分组）',
        left: 'center',
        textStyle: { color: textColor, fontSize: 14 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 8,
        top: 32,
        bottom: 16,
        textStyle: { color: textColor },
        itemWidth: 12,
        itemHeight: 8,
        pageIconColor: isDark ? '#9ca3af' : '#374151',
        pageTextStyle: { color: textColor },
      },
      grid: { left: '12%', right: '22%', bottom: 64, top: 56, containLabel: true },
      xAxis: {
        type: 'category',
        data: dateKeys.map(d => format(new Date(d), 'MM-dd')),
        axisLabel: { color: textColor, hideOverlap: true },
        axisLine: { lineStyle: { color: axisColor } },
      },
      yAxis: {
        type: 'value',
        name: '次数',
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, margin: 12 },
        axisLine: { lineStyle: { color: axisColor } },
        splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
        minInterval: 1,
      },
      series: series.map(s => ({ ...s, barMaxWidth: 32 })),
    };

    chartInstanceRef.current.setOption(option);

    const handleResize = () => chartInstanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [operations, dateRange, theme]);

  // 无数据时返回占位
  if (operations.length === 0) {
    return (
      <div className="text-center py-8">
        <p className={`text-sm ${themes[theme].text} opacity-70`}>暂无可展示的操作数据</p>
      </div>
    );
  }

  return <div ref={chartRef} style={{ width: '100%', height: 360 }} />;
}