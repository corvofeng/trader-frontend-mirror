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
import type { StockPrice } from '../../../lib/services/types';
import { type Theme, themes } from '../../../lib/theme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface StockQuotePanelProps {
  stockCode: string | null;
  stockName?: string | null;
  theme: Theme;
  selectedQuotePrice?: number | null;
  selectedQuoteSide?: 'bid' | 'ask' | null;
  selectedQuoteLevel?: number | null;
  onSelectPrice?: (price: number, side?: 'bid' | 'ask', level?: number) => void;
}

interface StockQuotePanelInnerProps extends StockQuotePanelProps {
  stockCode: string;
}

interface HistoryPoint {
  time: string;
  price: number;
  _ts: number;
}

function QuotePanelEmptyState({ theme }: { theme: Theme }) {
  return (
    <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>股票盘口与走势</div>
      </div>
      <div className={`px-4 sm:px-6 py-6 text-sm ${themes[theme].text} opacity-75`}>
        在搜索框输入股票代码，或点击下方「当日订单」里的合约名称，即可在这里直接查看当前股票的 5 档价格和短线走势。
      </div>
    </div>
  );
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const pickFirstNumber = (candidates: (unknown | undefined)[]): number | null => {
  for (const c of candidates) {
    const v = toFiniteNumber(c);
    if (v !== null) return v;
  }
  return null;
};

const pickNumberArray = <T,>(arr: T | undefined, len: number): Array<number | null> => {
  if (!Array.isArray(arr)) return Array.from({ length: len }, () => null);
  const out: Array<number | null> = [];
  for (let i = 0; i < len; i += 1) {
    out.push(toFiniteNumber(arr[i]));
  }
  return out;
};

const inferTickSize = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0.01;
  if (price < 10) return 0.01;
  if (price < 100) return 0.01;
  return 0.01;
};

const roundToTick = (value: number, tick: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return value;
  return Math.round(value / tick) * tick;
};

function StockQuotePanelInner({
  stockCode,
  stockName,
  theme,
  selectedQuotePrice,
  selectedQuoteSide,
  selectedQuoteLevel,
  onSelectPrice,
}: StockQuotePanelInnerProps) {
  const normalizedCode = stockCode.trim();
  const [quote, setQuote] = useState<StockPrice | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
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
        setQuote(data as StockPrice);
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
    setQuote(null);
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

  const currentPrice = quote?.price ?? null;
  const lastPrice = pickFirstNumber([quote?.last_price, quote?.price]);

  const depth = 5;
  const rawBidPrices = useMemo(
    () => pickNumberArray(quote?.bid_price ?? quote?.bid_prices, depth),
    [quote]
  );
  const rawBidVols = useMemo(
    () => pickNumberArray(quote?.bid_vol ?? quote?.bid_volume, depth),
    [quote]
  );
  const rawAskPrices = useMemo(
    () => pickNumberArray(quote?.ask_price ?? quote?.ask_prices, depth),
    [quote]
  );
  const rawAskVols = useMemo(
    () => pickNumberArray(quote?.ask_vol ?? quote?.ask_volume, depth),
    [quote]
  );

  const { bidRows, askRows, bestBid, bestAsk, spread } = useMemo(() => {
    const center =
      lastPrice ?? (typeof currentPrice === 'number' ? currentPrice : null);
    const tick = typeof center === 'number' ? inferTickSize(center) : 0.01;

    const b0 =
      pickFirstNumber([rawBidPrices[0], quote?.bid]) ??
      (typeof center === 'number' ? roundToTick(center - tick, tick) : null);
    const a0 =
      pickFirstNumber([rawAskPrices[0], quote?.ask]) ??
      (typeof center === 'number' ? roundToTick(center + tick, tick) : null);

    const builtBid: Array<{ level: number; price: number | null; volume: number | null }> = [];
    const builtAsk: Array<{ level: number; price: number | null; volume: number | null }> = [];

    for (let i = 0; i < depth; i += 1) {
      const bp =
        pickFirstNumber([rawBidPrices[i]]) ??
        (typeof b0 === 'number' ? roundToTick(b0 - tick * i, tick) : null);
      const bv = pickFirstNumber([rawBidVols[i]]) ?? null;
      builtBid.push({ level: i + 1, price: bp, volume: bv });

      const ap =
        pickFirstNumber([rawAskPrices[i]]) ??
        (typeof a0 === 'number' ? roundToTick(a0 + tick * i, tick) : null);
      const av = pickFirstNumber([rawAskVols[i]]) ?? null;
      builtAsk.push({ level: i + 1, price: ap, volume: av });
    }

    const bb = builtBid[0]?.price ?? null;
    const ba = builtAsk[0]?.price ?? null;
    const sp =
      typeof bb === 'number' && typeof ba === 'number' && Number.isFinite(bb) && Number.isFinite(ba)
        ? ba - bb
        : null;

    return { bidRows: builtBid, askRows: builtAsk, bestBid: bb, bestAsk: ba, spread: sp };
  }, [currentPrice, lastPrice, quote, rawBidPrices, rawBidVols, rawAskPrices, rawAskVols]);

  const maxVolume = useMemo(() => {
    const values = [...bidRows, ...askRows].map((row) =>
      typeof row.volume === 'number' && Number.isFinite(row.volume) ? row.volume : 0
    );
    return Math.max(0, ...values);
  }, [askRows, bidRows]);

  const getVolumeRatio = (volume?: number | null) => {
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0 || maxVolume <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, volume / maxVolume));
  };

  const isSelectedPrice = (price?: number | null, side?: 'bid' | 'ask', level?: number) => {
    if (typeof price !== 'number' || !Number.isFinite(price)) return false;
    if (typeof selectedQuotePrice !== 'number' || !Number.isFinite(selectedQuotePrice)) return false;
    const sideMatch =
      selectedQuoteSide === undefined || selectedQuoteSide === null || selectedQuoteSide === (side ?? null);
    const levelMatch =
      selectedQuoteLevel === undefined || selectedQuoteLevel === null || selectedQuoteLevel === (level ?? null);
    return Math.abs(selectedQuotePrice - price) < 0.0000001 && sideMatch && levelMatch;
  };

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

  return (
    <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md overflow-hidden`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>股票盘口与走势</div>
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
              {quote?.stock_name && quote.stock_name !== stockName ? (
                <span className="ml-2 opacity-75">{quote.stock_name}</span>
              ) : null}
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
              disabled={isLoading || !normalizedCode}
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
            <div className={`text-sm font-semibold ${themes[theme].text}`}>盘口 5 档</div>
            <div className={`text-xs ${themes[theme].text} opacity-70`}>
              点差 {spread != null && Number.isFinite(spread) ? spread.toFixed(4) : '-'}
            </div>
          </div>
          <div className={`mb-3 text-xs ${themes[theme].text} opacity-70`}>
            点击任意买卖档价格，可直接回填到上方表单的目标价格。
          </div>
          <div className={`mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs ${themes[theme].text} opacity-70`}>
            <span>{`买一 ${typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}`}</span>
            <span>{`卖一 ${typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}`}</span>
            <span>{`差 ${spread != null && Number.isFinite(spread) ? spread.toFixed(4) : '-'}`}</span>
          </div>
          <div className={`grid grid-cols-2 gap-2 sm:gap-3`}>
            <div className="min-w-0">
              <div className="mb-2 text-center text-xs font-semibold text-rose-500 sm:text-xs">买盘</div>
              <div className={`mb-1 grid grid-cols-[30px_minmax(0,1fr)_44px] gap-1 px-0.5 text-[10px] sm:grid-cols-[42px_1fr_70px] sm:gap-2 sm:px-1 sm:text-[11px] ${themes[theme].text} opacity-60`}>
                <div>档位</div>
                <div>价格</div>
                <div className="text-right">量</div>
              </div>
              <div className="space-y-1">
                {bidRows.map((row) => (
                  <div
                    key={`bid-${row.level}`}
                    className={`grid grid-cols-[30px_minmax(0,1fr)_44px] gap-1 rounded px-0.5 py-1 text-[10px] sm:grid-cols-[42px_1fr_70px] sm:gap-2 sm:px-1 sm:text-xs ${
                      isSelectedPrice(row.price, 'bid', row.level)
                        ? 'bg-rose-50 dark:bg-rose-900/15'
                        : ''
                    }`}
                  >
                    <div className={`${themes[theme].text} opacity-75`}>买{row.level}</div>
                    <div className="min-w-0">
                      {typeof row.price === 'number' ? (
                        <button
                          type="button"
                          onClick={() => onSelectPrice?.(row.price as number, 'bid', row.level)}
                          className="w-full text-right font-mono text-[12px] text-rose-500 hover:underline sm:text-[13px]"
                          title={`使用买${row.level} ${row.price.toFixed(4)} 回填`}
                        >
                          {row.price.toFixed(4)}
                        </button>
                      ) : (
                        <div className="text-right font-mono text-rose-500">-</div>
                      )}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/40">
                        <div
                          className="h-full rounded-full bg-rose-500/80 transition-[width] duration-300"
                          style={{ width: `${Math.round(getVolumeRatio(row.volume) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className={`text-right font-mono text-[10px] sm:text-xs ${themes[theme].text}`}>
                      {row.volume ?? '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-2 text-center text-xs font-semibold text-emerald-500 sm:text-xs">卖盘</div>
              <div className={`mb-1 grid grid-cols-[30px_minmax(0,1fr)_44px] gap-1 px-0.5 text-[10px] sm:grid-cols-[42px_1fr_70px] sm:gap-2 sm:px-1 sm:text-[11px] ${themes[theme].text} opacity-60`}>
                <div>档位</div>
                <div>价格</div>
                <div className="text-right">量</div>
              </div>
              <div className="space-y-1">
                {askRows.map((row) => (
                  <div
                    key={`ask-${row.level}`}
                    className={`grid grid-cols-[30px_minmax(0,1fr)_44px] gap-1 rounded px-0.5 py-1 text-[10px] sm:grid-cols-[42px_1fr_70px] sm:gap-2 sm:px-1 sm:text-xs ${
                      isSelectedPrice(row.price, 'ask', row.level)
                        ? 'bg-emerald-50 dark:bg-emerald-900/15'
                        : ''
                    }`}
                  >
                    <div className={`${themes[theme].text} opacity-75`}>卖{row.level}</div>
                    <div className="min-w-0">
                      {typeof row.price === 'number' ? (
                        <button
                          type="button"
                          onClick={() => onSelectPrice?.(row.price as number, 'ask', row.level)}
                          className="w-full text-right font-mono text-[12px] text-emerald-500 hover:underline sm:text-[13px]"
                          title={`使用卖${row.level} ${row.price.toFixed(4)} 回填`}
                        >
                          {row.price.toFixed(4)}
                        </button>
                      ) : (
                        <div className="text-right font-mono text-emerald-500">-</div>
                      )}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                        <div
                          className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-300"
                          style={{ width: `${Math.round(getVolumeRatio(row.volume) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className={`text-right font-mono text-[10px] sm:text-xs ${themes[theme].text}`}>
                      {row.volume ?? '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              <div className="opacity-60">买一</div>
              <div className="font-mono font-semibold text-rose-500">
                {typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}
              </div>
            </div>
            <div>
              <div className="opacity-60">卖一</div>
              <div className="font-mono font-semibold text-emerald-500">
                {typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}
              </div>
            </div>
            <div>
              <div className="opacity-60">点差</div>
              <div className="font-mono font-semibold">
                {spread != null && Number.isFinite(spread) ? spread.toFixed(4) : '-'}
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
  selectedQuoteSide,
  selectedQuoteLevel,
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
      selectedQuoteSide={selectedQuoteSide}
      selectedQuoteLevel={selectedQuoteLevel}
      onSelectPrice={onSelectPrice}
    />
  );
}
