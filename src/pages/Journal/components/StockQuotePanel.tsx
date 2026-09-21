import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { StockChart } from '../../../features/trading/components/StockChart';
import type { StockPrice } from '../../../lib/services/types';
import { type Theme, themes } from '../../../lib/theme';
import { OptionPriceWebSocketProvider } from '../../../features/options/context/OptionPriceWebSocketContext';
import { OptionQuoteSubscription } from '../../../features/options/components/OptionQuoteSubscription';
import { useOptionPriceWebSocket } from '../../../features/options/hooks/useOptionPriceWebSocket';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface StockQuotePanelProps {
  stockCode: string | null;
  stockName?: string | null;
  theme: Theme;
  selectedQuotePrice?: number | null;
  selectedQuoteSide?: 'bid' | 'ask' | null;
  selectedQuoteLevel?: number | null;
  onSelectPrice?: (price: number, side?: 'bid' | 'ask', level?: number) => void;
  userId?: string;
  accountId?: string | null;
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
    <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} card-subtle-ring`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>股票盘口与走势</div>
      </div>
      <div className={`px-4 sm:px-6 py-6 text-sm ${themes[theme].text} opacity-75`}>
        在搜索框输入股票代码，或点击下方「当日订单」里的合约名称，即可在这里直接查看当前股票的 K 线、5 档价格和短线走势。
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

const formatVolume = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toLocaleString('zh-CN');
};

function KlineBlock({
  stockCode,
  theme,
  userId,
  accountId,
}: {
  stockCode: string;
  theme: Theme;
  userId?: string;
  accountId?: string | null;
}) {
  return (
    <div className={`rounded-lg border ${themes[theme].border} p-3 sm:p-4`}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm font-semibold ${themes[theme].text}`}>
          近 6 个月 K 线与买卖点
        </div>
      </div>
      <div className="h-[420px] sm:h-[600px] w-full">
        <StockChart
          stockCode={stockCode}
          theme={theme}
          userId={userId}
          accountId={accountId}
          fillContainer
          compactMode
          defaultVisibleMonths={6}
        />
      </div>
    </div>
  );
}

function QuoteBlockWithWS({
  stockCode,
  stockName,
  theme,
  selectedQuotePrice,
  selectedQuoteSide,
  selectedQuoteLevel,
  onSelectPrice,
}: StockQuotePanelInnerProps) {
  const normalizedCode = stockCode.trim();
  const { prices, isConnected, reconnect, queryPrice } = useOptionPriceWebSocket();

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [subscribedAt, setSubscribedAt] = useState<number>(0);

  const wsPrice =
    prices[normalizedCode] ??
    (normalizedCode.includes('.')
      ? prices[normalizedCode.split('.')[0]]
      : (prices[`${normalizedCode}.SH`] ?? prices[`${normalizedCode}.SZ`]));
  const hasWsData = Boolean(wsPrice && typeof wsPrice.price === 'number' && Number.isFinite(wsPrice.price));
  const wsWaiting = isConnected && !hasWsData;
  const wsConnecting = !isConnected;

  const quote: StockPrice | null = useMemo(() => {
    if (!wsPrice) return null;
    return {
      stock_code: wsPrice.contract_code ?? normalizedCode,
      stock_name: stockName || wsPrice.contract_code || normalizedCode,
      price: wsPrice.price,
      last_price: wsPrice.last_price,
      bid: wsPrice.bid,
      ask: wsPrice.ask,
      bid_price: wsPrice.bid_price,
      bid_prices: wsPrice.bid_price,
      bid_vol: wsPrice.bid_vol,
      bid_volume: wsPrice.bid_vol,
      ask_price: wsPrice.ask_price,
      ask_prices: wsPrice.ask_price,
      ask_vol: wsPrice.ask_vol,
      ask_volume: wsPrice.ask_vol,
      pre_close: (wsPrice as { pre_close?: number }).pre_close,
      open: (wsPrice as { open?: number }).open,
      high: (wsPrice as { high?: number }).high,
      low: (wsPrice as { low?: number }).low,
      volume: (wsPrice as { volume?: number }).volume,
      amount: (wsPrice as { amount?: number }).amount,
    } satisfies StockPrice;
  }, [wsPrice, stockName, normalizedCode]);

  useEffect(() => {
    if (!normalizedCode) return;
    if (isConnected) {
      setSubscribedAt(Date.now());
    }
  }, [isConnected, normalizedCode]);

  useEffect(() => {
    if (!wsPrice) return;
    const p = wsPrice.price;
    if (typeof p !== 'number' || !Number.isFinite(p)) return;
    const ts = (wsPrice as { timestamp?: number }).timestamp;
    const now = ts && Number.isFinite(ts) ? ts : Date.now();
    const nowLabel = new Date(now).toLocaleTimeString();
    setLastUpdated(nowLabel);
    setHistory((prev) => {
      const lastItem = prev[prev.length - 1];
      if (lastItem && lastItem.price === p && now - lastItem._ts < 800) return prev;
      const next = [...prev, { time: nowLabel, price: p, _ts: now }];
      return next.length > 120 ? next.slice(next.length - 120) : next;
    });
  }, [wsPrice]);

  useEffect(() => {
    setHistory([]);
    setLastUpdated(null);
    setSubscribedAt(0);
  }, [normalizedCode]);

  const triggerNow = useCallback(() => {
    if (!isConnected) {
      reconnect();
    } else {
      queryPrice([normalizedCode]);
      setSubscribedAt(Date.now());
    }
  }, [isConnected, reconnect, normalizedCode, queryPrice]);

  const currentPrice = quote?.price ?? null;
  const lastPrice = pickFirstNumber([quote?.last_price, quote?.pre_close, quote?.price]);

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
    const center = lastPrice ?? (typeof currentPrice === 'number' ? currentPrice : null);
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

  const statusBadge = useMemo(() => {
    if (wsConnecting) {
      return {
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        text: 'WS 连接中',
        pulse: true,
      };
    }
    if (wsWaiting) {
      return {
        className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
        text: 'WS 已连接 · 等待首笔行情',
        pulse: true,
      };
    }
    return {
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      text: 'WS 实时',
      pulse: false,
    };
  }, [wsConnecting, wsWaiting]);

  const waitingElapsedSec = wsWaiting && subscribedAt > 0
    ? Math.max(0, Math.floor((Date.now() - subscribedAt) / 1000))
    : 0;
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!wsWaiting) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [wsWaiting]);

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge.className}`}
            >
              <Activity className={`mr-1 h-3 w-3 ${statusBadge.pulse ? 'animate-pulse' : ''}`} />
              {statusBadge.text}
            </span>
          </div>
          <div className={`mt-1 text-sm ${themes[theme].text}`}>
            <span className="font-mono tabular-nums font-semibold">{normalizedCode}</span>
            {stockName ? <span className="ml-2 opacity-75">{stockName}</span> : null}
            {quote?.stock_name && quote.stock_name !== stockName ? (
              <span className="ml-2 opacity-75">{quote.stock_name}</span>
            ) : null}
          </div>
          <div className={`mt-1 text-xs ${themes[theme].text} opacity-60`}>
            {lastUpdated
              ? `最近更新 ${lastUpdated}`
              : wsConnecting
                ? '正在建立 WebSocket 连接...'
                : wsWaiting
                  ? `等待行情推送${waitingElapsedSec > 0 ? `（已等 ${waitingElapsedSec}s）` : '...'}`
                  : '等待行情返回...'}
            {!isConnected ? (
              <span className="ml-1 text-amber-500 dark:text-amber-400"> · 未连接</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[90px]">
            <div className={`text-[11px] uppercase tracking-wide ${themes[theme].text} opacity-60`}>最新价</div>
            <div className={`text-2xl font-bold font-mono tabular-nums ${themes[theme].text}`}>
              {typeof currentPrice === 'number' ? currentPrice.toFixed(4) : '-'}
            </div>
          </div>
          <div className="min-w-[160px]">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className={`${themes[theme].text} opacity-60`}>数据模式</span>
              <span className={`${themes[theme].text} opacity-60`}>
                {!isConnected ? '连接中' : 'WebSocket 实时'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-colors duration-300 ${
                  hasWsData
                    ? 'bg-emerald-500'
                    : wsConnecting
                      ? 'bg-amber-500 animate-pulse'
                      : wsWaiting
                        ? 'bg-sky-500 animate-pulse'
                        : 'bg-rose-500'
                }`}
                style={{ width: hasWsData ? '100%' : !isConnected ? '20%' : '60%' }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={triggerNow}
            disabled={!normalizedCode}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium ${themes[theme].secondary}`}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {!isConnected ? '重连 WS' : '重新订阅'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
                            className="w-full text-right font-mono tabular-nums text-[12px] text-rose-500 hover:underline sm:text-[13px]"
                            title={`使用买${row.level} ${row.price.toFixed(4)} 回填`}
                          >
                            {row.price.toFixed(4)}
                          </button>
                        ) : (
                          <div className="text-right font-mono tabular-nums text-rose-500">-</div>
                        )}
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/40">
                          <div
                            className="h-full rounded-full bg-rose-500/80 transition-[width] duration-300"
                            style={{ width: `${Math.round(getVolumeRatio(row.volume) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-right font-mono tabular-nums text-[10px] sm:text-xs ${themes[theme].text}`}>
                        {formatVolume(row.volume)}
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
                            className="w-full text-right font-mono tabular-nums text-[12px] text-emerald-500 hover:underline sm:text-[13px]"
                            title={`使用卖${row.level} ${row.price.toFixed(4)} 回填`}
                          >
                            {row.price.toFixed(4)}
                          </button>
                        ) : (
                          <div className="text-right font-mono tabular-nums text-emerald-500">-</div>
                        )}
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                          <div
                            className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-300"
                            style={{ width: `${Math.round(getVolumeRatio(row.volume) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-right font-mono tabular-nums text-[10px] sm:text-xs ${themes[theme].text}`}>
                        {formatVolume(row.volume)}
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
                  {wsConnecting
                    ? '正在建立 WebSocket 连接...'
                    : wsWaiting
                      ? '已订阅，等待服务器推送首个行情点...'
                      : '暂无行情数据'}
                </div>
              )}
            </div>
            <div className={`mt-3 grid grid-cols-3 gap-3 text-xs ${themes[theme].text}`}>
              <div>
                <div className="opacity-60">买一</div>
                <div className="font-mono tabular-nums font-semibold text-rose-500">
                  {typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}
                </div>
              </div>
              <div>
                <div className="opacity-60">卖一</div>
                <div className="font-mono tabular-nums font-semibold text-emerald-500">
                  {typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}
                </div>
              </div>
              <div>
                <div className="opacity-60">点差</div>
                <div className="font-mono tabular-nums font-semibold">
                  {spread != null && Number.isFinite(spread) ? spread.toFixed(4) : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}

export function StockQuotePanel(props: StockQuotePanelProps) {
  const { stockCode, theme } = props;
  if (!stockCode) {
    return <QuotePanelEmptyState theme={props.theme} />;
  }

  return (
    <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} card-subtle-ring overflow-hidden transition-colors duration-150`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className="text-lg sm:text-xl font-semibold" style={{ color: themes[theme].text }}>
          股票盘口与走势
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-6">
        <OptionPriceWebSocketProvider>
          <OptionQuoteSubscription realtimeCodes={[stockCode]}>
            <QuoteBlockQuoteOnly {...props} stockCode={stockCode} />
          </OptionQuoteSubscription>
        </OptionPriceWebSocketProvider>
        <KlineBlock stockCode={stockCode.trim()} theme={theme} userId={props.userId} accountId={props.accountId} />
      </div>
    </div>
  );
}

function QuoteBlockQuoteOnly(props: StockQuotePanelInnerProps) {
  return <QuoteBlockWithWS {...props} />;
}
