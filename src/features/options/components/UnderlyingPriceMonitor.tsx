import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { AnimatedFlash } from './AnimatedFlash';
import { Theme, themes } from '../../../lib/theme';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface UnderlyingPriceMonitorProps {
  symbol: string;
  theme: Theme;
}

export function UnderlyingPriceMonitor({ symbol, theme }: UnderlyingPriceMonitorProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const [history, setHistory] = useState<{ time: string; price: number }[]>([]);
  const lastPriceRef = useRef<number | null>(null);

  // Poll for price if not connected via other means or just to be sure
  useEffect(() => {
    if (!symbol) return;
    
    // Initial query
    if (isConnected) {
      queryPrice([symbol]);
    }

    const interval = setInterval(() => {
      if (isConnected) {
        queryPrice([symbol]);
      }
    }, 1000); // Poll every second for high frequency updates

    return () => clearInterval(interval);
  }, [symbol, isConnected, queryPrice]);

  const currentPrice = prices[symbol]?.price;

  useEffect(() => {
    if (currentPrice !== undefined && currentPrice !== null) {
      // Only add if price changed or enough time passed? 
      // User wants "recent points", so maybe every update or every X seconds.
      // If we poll every second, we might get same price.
      // Let's just add it if it's new or update the last one if it's the same minute?
      // User wants "recent points", let's just keep last 50 points.
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString();

      setHistory(prev => {
        const newEntry = { time: timeStr, price: currentPrice };
        // Avoid duplicate consecutive entries if needed, but for chart "flow" duplicates are okay to show flat line.
        // But to save memory/rendering, maybe limit to changes or time intervals.
        // Let's limit to max 50 points.
        const newHistory = [...prev, newEntry];
        if (newHistory.length > 50) {
          return newHistory.slice(newHistory.length - 50);
        }
        return newHistory;
      });
    }
  }, [currentPrice]);

  const chartData: ChartData<'line'> = useMemo(() => {
    return {
      labels: history.map(h => h.time),
      datasets: [
        {
          label: symbol,
          data: history.map(h => h.price),
          borderColor: 'rgb(59, 130, 246)', // blue-500
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.1,
          pointRadius: 2,
        },
      ],
    };
  }, [history, symbol]);

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
        }
      },
      scales: {
        x: {
          display: false, // Hide x axis labels to save space
        },
        y: {
          position: 'right',
          ticks: {
             color: theme === 'dark' ? '#9ca3af' : '#4b5563',
             callback: (value) => Number(value).toFixed(3)
          },
          grid: {
             color: theme === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
          }
        }
      },
      animation: {
        duration: 0 // Disable animation for performance
      }
    };
  }, [theme]);

  if (!symbol) return null;

  return (
    <div className={`fixed right-4 top-24 z-50 w-64 ${themes[theme].card} shadow-lg rounded-lg border ${themes[theme].border} overflow-hidden opacity-90 hover:opacity-100 transition-opacity`}>
      <div className={`p-3 border-b ${themes[theme].border} flex justify-between items-center bg-opacity-50 backdrop-blur`}>
        <div className="font-bold text-sm">{symbol}</div>
        <div className="font-mono text-lg font-bold">
           <AnimatedFlash value={currentPrice} type="price" />
        </div>
      </div>
      <div className="h-32 w-full bg-white dark:bg-gray-900 p-2">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
