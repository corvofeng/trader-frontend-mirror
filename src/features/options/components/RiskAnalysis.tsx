import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import { optionsService } from '../../../lib/services';
import { PayoffSurfaceData, MarginStressData } from '../../../lib/services/types';
import { Theme, themes } from '../../../lib/theme';
import { Loader, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  BarController,
  LineController
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  BarController,
  LineController
);

interface RiskAnalysisProps {
  theme: Theme;
  selectedAccountId: string | null;
  selectedSymbol?: string;
}

export function RiskAnalysis({ theme, selectedAccountId, selectedSymbol }: RiskAnalysisProps) {
  const [surfaceData, setSurfaceData] = useState<PayoffSurfaceData | null>(null);
  const [stressData, setStressData] = useState<MarginStressData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const surfaceChartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!selectedAccountId) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [surfaceRes, stressRes] = await Promise.all([
          optionsService.getPayoffSurface(selectedAccountId, selectedSymbol),
          optionsService.getMarginStress(selectedAccountId, selectedSymbol)
        ]);

        if (surfaceRes.error) throw surfaceRes.error;
        if (stressRes.error) throw stressRes.error;

        setSurfaceData(surfaceRes.data);
        setStressData(stressRes.data);
      } catch (err) {
        console.error('Failed to fetch risk analysis data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load risk analysis data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedAccountId, selectedSymbol]);

  // Initialize and update ECharts instance
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!surfaceChartRef.current || !surfaceData) return;

    // Defensive check for required data arrays
    if (!Array.isArray(surfaceData.S_axis) || !Array.isArray(surfaceData.T_axis) || !Array.isArray(surfaceData.payoff_matrix)) {
      console.warn('Invalid surface data format:', surfaceData);
      return;
    }

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(surfaceChartRef.current);
    }

    const option = {
      tooltip: {},
      backgroundColor: 'transparent',
      visualMap: {
        show: true,
        dimension: 2,
        min: surfaceData.max_loss,
        max: surfaceData.max_profit,
        inRange: {
          color: [
            '#ef4444', // red-500
            '#fca5a5', // red-300
            '#e5e7eb', // gray-200 (neutral)
            '#86efac', // green-300
            '#22c55e'  // green-500
          ]
        }
      },
      xAxis3D: {
        type: 'category',
        name: 'Date',
        data: surfaceData.T_axis,
        axisLabel: {
          textStyle: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' }
        }
      },
      yAxis3D: {
        type: 'value',
        name: 'Price',
        data: surfaceData.S_axis,
        axisLabel: {
          textStyle: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' }
        }
      },
      zAxis3D: {
        type: 'value',
        name: 'PnL',
        axisLabel: {
          textStyle: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' }
        }
      },
      grid3D: {
        viewControl: {
          projection: 'perspective',
          autoRotate: true,
          beta: 40,
          alpha: 20,
        },
        axisLine: {
          lineStyle: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' }
        },
        axisPointer: {
          show: false
        }
      },
      series: [{
        type: 'surface',
        wireframe: {
          show: true
        },
        shading: 'color',
        itemStyle: {
          opacity: 0.8
        },
        data: surfaceData.S_axis.flatMap((s, i) => 
          surfaceData.T_axis.map((t, j) => [j, s, surfaceData.payoff_matrix[i][j]])
        )
      }]
    };

    chartInstance.current.setOption(option);
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [surfaceData, theme]);

  if (!selectedAccountId) {
    return (
      <div className={`text-center py-12 ${themes[theme].text}`}>
        Please select an account to view risk analysis.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-500 mb-4" />
        <p className={`${themes[theme].text} opacity-75`}>Loading risk analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4 flex justify-center">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <p className="text-gray-600 mb-4">{error}</p>
      </div>
    );
  }

  // Prepare Chart.js data for Margin Stress
  const stressChartData = stressData ? {
    labels: stressData.scenarios.map(s => s.shock_label),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Net Margin Requirement',
        data: stressData.scenarios.map(s => s.net_margin),
        backgroundColor: stressData.scenarios.map(s => s.is_forced_close ? 'rgba(239, 68, 68, 0.7)' : 'rgba(59, 130, 246, 0.7)'),
        borderColor: stressData.scenarios.map(s => s.is_forced_close ? 'rgb(239, 68, 68)' : 'rgb(59, 130, 246)'),
        borderWidth: 1,
        yAxisID: 'y',
        order: 2
      },
      {
        type: 'line' as const,
        label: 'Available Cash',
        data: stressData.scenarios.map(() => stressData.available_cash),
        borderColor: 'rgba(34, 197, 94, 1)', // Green
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        yAxisID: 'y',
        order: 1
      }
    ]
  } : { labels: [], datasets: [] };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* 1. Payoff Surface Section */}
      <section className={`${themes[theme].card} rounded-lg p-6 shadow-sm border ${themes[theme].border}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-xl font-bold ${themes[theme].text} flex items-center gap-2`}>
              <TrendingUp className="w-5 h-5 text-blue-500" />
              PnL Surface Analysis
            </h2>
            <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
              Visualizing portfolio profit/loss across different underlying prices and time to expiry.
            </p>
          </div>
          {surfaceData && (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className={themes[theme].text}>Max Profit: {surfaceData.max_profit.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className={themes[theme].text}>Max Loss: {surfaceData.max_loss.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="h-[500px] w-full" ref={surfaceChartRef}></div>
      </section>

      {/* 2. Margin Stress Test Section */}
      <section className={`${themes[theme].card} rounded-lg p-6 shadow-sm border ${themes[theme].border}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-xl font-bold ${themes[theme].text} flex items-center gap-2`}>
              <ShieldCheck className="w-5 h-5 text-purple-500" />
              Margin Stress Test
            </h2>
            <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
              Simulating margin requirements under extreme market moves.
            </p>
          </div>
          {stressData && (
            <div className={`text-sm ${themes[theme].text} bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 rounded flex items-center gap-2`}>
              <Info className="w-4 h-4 text-yellow-600" />
              <span>Current Margin: {stressData.current_margin.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="h-[400px] w-full">
          <Chart 
            type='bar'
            data={stressChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' }
                },
                tooltip: {
                  callbacks: {
                    label: (context) => {
                      const label = context.dataset.label || '';
                      const value = context.parsed.y;
                      return `${label}: ${value.toFixed(2)}`;
                    }
                  }
                }
              },
              scales: {
                x: {
                  title: { display: true, text: 'Underlying Price Shock (%)', color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' },
                  ticks: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' },
                  grid: { color: themes[theme].text === 'text-gray-900' ? '#e5e7eb' : '#374151' }
                },
                y: {
                  title: { display: true, text: 'Margin / Cash', color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' },
                  ticks: { color: themes[theme].text === 'text-gray-900' ? '#374151' : '#d1d5db' },
                  grid: { color: themes[theme].text === 'text-gray-900' ? '#e5e7eb' : '#374151' }
                }
              }
            }}
          />
        </div>
        
        {stressData && stressData.scenarios.some(s => s.is_forced_close) && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-700 dark:text-red-400">Risk Warning</h4>
              <p className="text-sm text-red-600 dark:text-red-300">
                Some scenarios indicate a forced liquidation risk (Margin &gt; Available Cash). 
                Please review your positions or deposit more funds.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
