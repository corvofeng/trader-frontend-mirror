import React, { useEffect, useRef, useState } from 'react';
import { format, subDays, addMinutes, startOfDay, endOfDay, parseISO } from 'date-fns';
import { formatInTimeZone, utcToZonedTime } from 'date-fns-tz';
import * as echarts from 'echarts';
import { Calendar, ListFilter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import { stockService, authService, portfolioService } from '../../../../../lib/services';
import type { Operation } from '../../../../../lib/services/types';
import { createChart, ColorType, IChartApi, ISeriesApi, CrosshairMode, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { formatCurrency } from '../../../../../lib/types';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut, RefreshCw, Lock, Unlock, Maximize2, Minimize2, Grid, LineChart, CandlestickChart, BarChart } from 'lucide-react';
import type { StockData, Trade, Stock } from '../../../../../lib/services/types';

type MarkerStyle = 'line' | 'bubble' | 'grid';
type ChartType = 'candlestick' | 'line' | 'bar';

interface StockChartProps {
  stockCode?: string;
  theme: Theme;
}

interface CostBasisPoint {
  time: number;
  value: number;
  quantity: number;
  totalCost: number;
}

const isValidDataPoint = (item: StockData) => {
  return (
    typeof item.open === 'number' && !isNaN(item.open) &&
    typeof item.high === 'number' && !isNaN(item.high) &&
    typeof item.low === 'number' && !isNaN(item.low) &&
    typeof item.close === 'number' && !isNaN(item.close) &&
    typeof item.volume === 'number' && !isNaN(item.volume) &&
    item.date != null &&
    item.open !== 0 && item.high !== 0 && item.low !== 0 && item.close !== 0
  );
};

export function StockChart({ stockCode, theme }: StockChartProps) {
  // [Previous code remains exactly the same until line 592]

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Reset the disposed flag when creating a new chart
    isDisposed.current = false;

    // Cancel any ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const isDark = theme === 'dark';
    const chartColors = themes[theme].chart;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#e5e7eb' : '#374151',
        fontSize: 12,
      },
      grid: {
        vertLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted,
          visible: showGrid,
        },
        horzLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted,
          visible: showGrid,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
        horzLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        textColor: isDark ? '#e5e7eb' : '#374151',
        mode: autoScale ? PriceScaleMode.Normal : PriceScaleMode.Logarithmic,
        autoScale: autoScale,
      },
      timeScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return format(date, window.innerWidth < 768 ? 'MM-dd' : 'yyyy-MM-dd');
        },
      },
      handleScroll: {
        mouseWheel: !isLocked,
        pressedMouseMove: !isLocked,
        horzTouchDrag: !isLocked,
        vertTouchDrag: !isLocked,
      },
      handleScale: {
        axisPressedMouseMove: !isLocked,
        mouseWheel: !isLocked,
        pinch: !isLocked,
      },
    });

    chartRef.current = chart;

    // [Rest of the chart setup remains exactly the same until the cleanup function]

    return () => {
      // Set disposed flag first
      isDisposed.current = true;
      
      // Remove event listeners
      window.removeEventListener('resize', handleResize);
      
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Clear all chart references and dispose
      if (chartRef.current) {
        try {
          chartRef.current.unsubscribeCrosshairMove();
          chartRef.current.remove();
        } catch (e) {
          console.warn('Error during chart cleanup:', e);
        }
      }

      // Clear all series references
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      costBasisSeriesRef.current = null;
      chartRef.current = null;

      // Remove any remaining tooltips
      const tooltip = chartContainerRef.current?.querySelector('.chart-tooltip');
      if (tooltip) {
        tooltip.remove();
      }
    };
  }, [stockCode, theme, currencyConfig, markerStyle, showCostBasis, showGrid, showVolume, isLocked, autoScale]);

  // [Rest of the component remains exactly the same]
}