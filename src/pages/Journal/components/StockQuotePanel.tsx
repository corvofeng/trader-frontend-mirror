import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

import { stockService } from '../../../lib/services';
import { type Theme, themes } from '../../../lib/theme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface StockQuotePanelProps {
  stockCode: string | null;
  stockName?: string | null;
  theme: Theme;
  selectedQuotePrice?: number | null;
  onSelectPrice?: (price: number) => void;
}

interface StockQuotePanelInnerProps extends StockQuotePanelProps {
  stockCode: string;
}

function QuotePanelEmptyState({ theme }: { theme: Theme }) {
  return (
    <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>股票行情与走势</div>
      </div>
      <div className={`px-4 sm:px-6 py-6 text-sm ${themes[theme].text} opacity-75`}>
        在搜索框输入股票代码，或点击下方“当日订单”里的合约名称，即可在这里查看当前股票的最新价和短线走势。
      </div>
    </div>
  );
}

function StockQuotePanelInner({
  stockCode,
  stockName,
  theme,
  selectedQuotePrice,
  onSelectPrice,
}: StockQuotePanelInnerProps) {
  const normalizedCode = stockCode.trim();
  const [history, setHistory] = useState<Array<{ time: string; price: number; _ts: number }>>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoRefreshIntervalMs = 10000;
  const nextRunAtRef = useRef<number>(Date.now() + autoRefreshIntervalMs);
  const [remainingMs, setRemainingMs] = useState(autoRefreshIntervalMs);
  const tickIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const fetchPriceRef = useRef<() => Promise<void>>(async () => {});

  const fetchPrice = useCallback(async () => {
    if (!normalizedCode) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await stockService.getCurrentPrice(normalizedCode);
      if (cancelledRef.current) return;
      if (fetchError) throw fetchError;
      if (data && typeof data.price === 'number' && Number.isFinite(data.price)) {
        setCurrentPrice(data.price);
        const now = Date.now();
        const nowLabel = new Date(now).toLocaleTimeString();
        setLastUpdated(nowLabel);
        setHistory((prev) => {
          const lastItem = prev[prev.length - 1];
          if (lastItem && lastItem.price === data.price && now - lastItem._ts < 2000) {
            return prev;
          }
          const next = [...prev, { time: nowLabel, price: data.price, _ts: now }];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : '获取行情失败');
      }
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, [normalizedCode]);

  useEffect(() => {
    fetchPriceRef.current = fetchPrice;
  }, [fetchPrice]);

  useEffect(() => {
    cancelledRef.current = false;
    setHistory([]);
    setCurrentPrice(null);
    setLastUpdated(null);
    setError(null);
    nextRunAtRef.current = Date.now() + autoRefreshIntervalMs;
    setRemainingMs(autoRefreshIntervalMs);

    void fetchPriceRef.current();

    tickIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, nextRunAtRef.current - now);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        nextRunAtRef.current = now + autoRefreshIntervalMs;
        setRemainingMs(autoRefreshIntervalMs);
        void fetchPriceRef.current();
      }
    }, 500);

    return () => {
      cancelledRef.current = true;
      if (tickIntervalRef.current !== null) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [normalizedCode]);

  const triggerNow = useCallback(() => {
    nextRunAtRef.current = Date.now() + autoRefreshIntervalMs;
    setRemainingMs(autoRefreshIntervalMs);
    void fetchPriceRef.current();
  }, []);

  const progress = useMemo(() => {
    const ratio = 1 - remainingMs / autoRefreshIntervalMs;
    return Math.max(0, Math.min(1, ratio));
  }, [remainingMs]);

  const chartData: ChartData<'line'> = useMemo(
    () => ({
      labels: history.map((item) => item.time),
      datasets: [
        {
          label: normalizedCode,
          data: history.map((item) => item.price),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          tension: 0.2,
          pointRadius: history.length > 1 ? 1.5 : 2,
          borderWidth: 2,
          fill: false,
        },
      ],
    }),
    [history, normalizedCode]
  );

  const chartOptions: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => `${Number(context.parsed.y).toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          position: 'right',
          ticks: {
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            callback: (value) => Number(value).toFixed(4),
          },
          grid: {
            color: theme === 'dark' ? 'rgba(75, 85, 99, 0.24)' : 'rgba(209, 213, 219, 0.35)',
          },
        },
      },
    }),
    [theme]
  );

  const isSelected = (price?: number) => {
    if (typeof price !== 'number' || !Number.isFinite(price)) return false;
    if (typeof selectedQuotePrice !== 'number' || !Number.isFinite(selectedQuotePrice)) return false;
    return Math.abs(selectedQuotePrice - price) < 0.0000001;
  };

  return (
    <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md overflow-hidden`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>股票行情与走势</div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  error
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}
              >
                <Activity className="mr-1 h-3 w-3" />
                {error ? '行情获取异常' : 'REST 轮询'}
              </span>
            </div>
            <div className={`mt-1 text-sm ${themes[theme].text}`}>
              <span className="font-mono font-semibold">{normalizedCode}</span>
              {stockName ? <span className="ml-2 opacity-75">{stockName}</span> : null}
            </div>
            <div className={`mt-1 text-xs ${themes[theme].text} opacity-60`}>
              {lastUpdated ? `最近更新 ${lastUpdated}` : '等待行情返回...'}
              {error ? ` · ${error}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[90px]">
              <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-60`}>最新价</div>
              <div className={`text-2xl font-bold ${themes[theme].text}`}>
                {typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'}
              </div>
            </div>
            <div className="min-w-[160px]">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className={`${themes[theme].text} opacity-60`}>自动刷新</span>
                <span className={`${themes[theme].text} opacity-60`}>
                  {`${Math.ceil(remainingMs / 1000)}s`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
            <button
              type="button"
              onClick={triggerNow}
              disabled={isLoading}
              className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium ${themes[theme].secondary} ${
                isLoading ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              刷新行情
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        <div className={`rounded-lg border ${themes[theme].border} p-3 sm:p-4`}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className={`text-sm font-semibold ${themes[theme].text}`}>价格快捷回填</div>
          </div>
          <div className={`mb-3 text-xs ${themes[theme].text} opacity-70`}>
            点击下方价格可直接回填到交易表单的目标价格。
          </div>
          {typeof currentPrice === 'number' && Number.isFinite(currentPrice) ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectPrice?.(currentPrice)}
                className={`w-full rounded-md border px-4 py-3 text-center transition-colors ${
                  isSelected(currentPrice)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : `${themes[theme].border} hover:bg-gray-50 dark:hover:bg-gray-800/50`
                }`}
              >
                <div className={`text-[11px] ${themes[theme].text} opacity-60`}>最新价回填</div>
                <div className={`mt-1 font-mono text-xl font-semibold ${themes[theme].text}`}>
                  {currentPrice.toFixed(4)}
                </div>
              </button>
              <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${themes[theme].text}`}>
                <div className={`rounded-md border ${themes[theme].border} px-3 py-2`}>
                  <div className="opacity-60">最新价</div>
                  <div className="mt-1 font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {currentPrice.toFixed(4)}
                  </div>
                </div>
                <div className={`rounded-md border ${themes[theme].border} px-3 py-2`}>
                  <div className="opacity-60">采集点数</div>
                  <div className="mt-1 font-mono font-semibold">
                    {history.length}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`rounded-md border border-dashed ${themes[theme].border} px-4 py-6 text-center text-sm ${themes[theme].text} opacity-70`}>
              {isLoading ? '正在获取最新价...' : '暂无价格数据'}
            </div>
          )}
        </div>

        <div className={`rounded-lg border ${themes[theme].border} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div className={`text-sm font-semibold ${themes[theme].text}`}>短线走势</div>
            <div className={`text-xs ${themes[theme].text} opacity-70`}>
              {history.length > 0 ? `最近 ${history.length} 个点` : '暂无数据'}
            </div>
          </div>
          <div className="h-56">
            {history.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className={`flex h-full items-center justify-center rounded border border-dashed ${themes[theme].border} text-sm ${themes[theme].text} opacity-70`}>
                {isLoading ? '已发起请求，等待首个行情点...' : '暂无行情数据，稍后自动刷新...'}
              </div>
            )}
          </div>
          <div className={`mt-3 grid grid-cols-3 gap-3 text-xs ${themes[theme].text}`}>
            <div>
              <div className="opacity-60">最新价</div>
              <div className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                {typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'}
              </div>
            </div>
            <div>
              <div className="opacity-60">最高</div>
              <div className="font-mono font-semibold">
                {history.length > 0 ? Math.max(...history.map((h) => h.price)).toFixed(4) : '-'}
              </div>
            </div>
            <div>
              <div className="opacity-60">最低</div>
              <div className="font-mono font-semibold">
                {history.length > 0 ? Math.min(...history.map((h) => h.price)).toFixed(4) : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockQuotePanel({
  stockCode,
  stockName,
  theme,
  selectedQuotePrice,
  onSelectPrice,
}: StockQuotePanelProps) {
  if (!stockCode) {
    return <QuotePanelEmptyState theme={theme} />;
  }

  return (
    <StockQuotePanelInner
      stockCode={stockCode}
      stockName={stockName}
      theme={theme}
      selectedQuotePrice={selectedQuotePrice}
      onSelectPrice={onSelectPrice}
    />
  );
}
