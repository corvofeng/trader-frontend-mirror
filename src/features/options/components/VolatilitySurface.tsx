import React, { useEffect, useRef } from 'react';
import { logger } from '../../../shared/utils/logger';
import * as echarts from 'echarts';
import 'echarts-gl';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { OptionsData } from '../../../lib/services/types';

interface VolatilitySurfaceProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
}

export function VolatilitySurface({ theme, optionsData, selectedSymbol }: VolatilitySurfaceProps) {
  const surfaceChartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const isMountedRef = useRef(true);
  const { getThemedColors } = useCurrency();

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
  if (!surfaceChartRef.current || !isMountedRef.current) {
    logger.debug('[VolatilitySurface] Guard: chart not ready', {
      hasRef: !!surfaceChartRef.current,
      isMounted: !!isMountedRef.current,
    });
    return;
  }

    // Dispose of existing chart if it exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Create new chart instance
    chartInstanceRef.current = echarts.init(surfaceChartRef.current);
    const isDark = theme === 'dark';

    // Prepare data for the 3D surface
  if (!optionsData) {
    logger.debug('[VolatilitySurface] Guard: optionsData missing');
    return;
  }
    
    const strikes = Array.from(new Set(optionsData.surface.map(p => p.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(optionsData.surface.map(p => p.expiry))).sort();
    
    const callData = strikes.map((strike, i) => 
      expiries.map((expiry, j) => {
        const point = optionsData.surface.find(p => p.strike === strike && p.expiry === expiry && p.type === 'call');
        return [i, j, point?.value || 0];
      })
    ).flat();

    const putData = strikes.map((strike, i) => 
      expiries.map((expiry, j) => {
        const point = optionsData.surface.find(p => p.strike === strike && p.expiry === expiry && p.type === 'put');
        return [i, j, point?.value || 0];
      })
    ).flat();

    const option = {
      title: {
        text: 'Option Price Surface',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      tooltip: {},
      backgroundColor: 'transparent',
      xAxis3D: {
        type: 'category',
        name: 'Strike',
        data: strikes.map(s => s.toFixed(2)),
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      yAxis3D: {
        type: 'category',
        name: 'Expiry',
        data: expiries.map(e => format(new Date(e), 'MMM d, yyyy')),
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      zAxis3D: {
        type: 'value',
        name: 'Price',
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      grid3D: {
        boxWidth: 100,
        boxHeight: 80,
        boxDepth: 80,
        viewControl: {
          projection: 'perspective',
          autoRotate: true,
          autoRotateSpeed: 10,
          distance: 200
        },
        light: {
          main: {
            intensity: 1.2
          },
          ambient: {
            intensity: 0.3
          }
        }
      },
      series: [
        {
          type: 'surface',
          name: 'Call Options',
          data: callData,
          shading: 'realistic',
          itemStyle: {
            color: getThemedColors(theme).chart.upColor
          }
        },
        {
          type: 'surface',
          name: 'Put Options',
          data: putData,
          shading: 'realistic',
          itemStyle: {
            color: getThemedColors(theme).chart.downColor
          }
        }
      ]
    };

    // Only set option and update loading state if component is still mounted
    if (isMountedRef.current && chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option);
    }

    // Handle resize
    const handleResize = () => {
      if (isMountedRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [theme, optionsData, selectedSymbol]);

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <h2 className={`text-xl font-bold mb-6 ${themes[theme].text}`}>
          Option Surface Visualization - {selectedSymbol}
        </h2>
        <div ref={surfaceChartRef} style={{ height: '600px' }} />
      </div>
    </div>
  );
}