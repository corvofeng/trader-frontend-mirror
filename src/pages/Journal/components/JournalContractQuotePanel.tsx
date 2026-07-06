import { useEffect, useMemo, useRef, useState } from 'react';
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

import { OptionPriceWebSocketProvider } from '../../../features/options/context/OptionPriceWebSocketContext';
import { useAutoRefresh, useOptionPriceWebSocket } from '../../../features/options/hooks/useOptionPriceWebSocket';
import { type Theme, themes } from '../../../lib/theme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface JournalContractQuotePanelProps {
  contractCode: string | null;
  contractName?: string | null;
  theme: Theme;
  selectedQuotePrice?: number | null;
  selectedQuoteSide?: 'bid' | 'ask' | null;
  selectedQuoteLevel?: number | null;
  onSelectPrice?: (price: number, side?: 'bid' | 'ask', level?: number) => void;
}

interface JournalContractQuotePanelInnerProps extends JournalContractQuotePanelProps {
  contractCode: string;
}

function QuotePanelEmptyState({ theme }: { theme: Theme }) {
  return (
    <div className={`${themes[theme].card} rounded-lg border ${themes[theme].border} shadow-md`}>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className={`text-lg font-semibold ${themes[theme].text}`}>合约盘口与走势</div>
      </div>
      <div className={`px-4 sm:px-6 py-6 text-sm ${themes[theme].text} opacity-75`}>
        在搜索框输入合约代码，或点击下方“当日订单”里的合约名称，即可在这里直接查看当前合约的 5 档价格和短线走势。
      </div>
    </div>
  );
}

function JournalContractQuotePanelInner({
  contractCode,
  contractName,
  theme,
  selectedQuotePrice,
  selectedQuoteSide,
  selectedQuoteLevel,
  onSelectPrice,
}: JournalContractQuotePanelInnerProps) {
  const { prices, isConnected, queryPrice } = useOptionPriceWebSocket();
  const normalizedCode = contractCode.trim();
  const [history, setHistory] = useState<Array<{ time: string; price: number }>>([]);
  const lastPushedAtRef = useRef<number>(0);

  const autoRefreshIntervalMs = 5000;
  const { remainingMs, progress, triggerNow } = useAutoRefresh(
    () => {
      if (!normalizedCode) return;
      queryPrice([normalizedCode]);
    },
    {
      enabled: isConnected && normalizedCode.length > 0,
      intervalMs: autoRefreshIntervalMs,
      immediate: true,
      tickMs: 500,
    }
  );

  useEffect(() => {
    setHistory([]);
    lastPushedAtRef.current = 0;
  }, [normalizedCode]);

  useEffect(() => {
    if (!isConnected || !normalizedCode) return;
    queryPrice([normalizedCode]);
  }, [isConnected, normalizedCode, queryPrice]);

  const priceData = prices[normalizedCode];
  const currentPrice = priceData?.price;
  const lastUpdated = priceData?.timestamp ? new Date(priceData.timestamp).toLocaleTimeString() : null;

  useEffect(() => {
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) return;
    const now = Date.now();
    const nowLabel = new Date(now).toLocaleTimeString();

    setHistory((prev) => {
      const lastItem = prev[prev.length - 1];
      if (lastItem && lastItem.price === currentPrice && now - lastPushedAtRef.current < 1500) {
        return prev;
      }
      lastPushedAtRef.current = now;
      const next = [...prev, { time: nowLabel, price: currentPrice }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [currentPrice]);

  const depth = 5;
  const bidRows = useMemo(
    () =>
      Array.from({ length: depth }).map((_, index) => ({
        level: index + 1,
        price: priceData?.bid_price?.[index] ?? (index === 0 ? priceData?.bid : undefined),
        volume: priceData?.bid_vol?.[index],
      })),
    [priceData]
  );

  const askRows = useMemo(
    () =>
      Array.from({ length: depth }).map((_, index) => ({
        level: index + 1,
        price: priceData?.ask_price?.[index] ?? (index === 0 ? priceData?.ask : undefined),
        volume: priceData?.ask_vol?.[index],
      })),
    [priceData]
  );

  const bestBid = bidRows[0]?.price;
  const bestAsk = askRows[0]?.price;
  const spread = typeof bestAsk === 'number' && typeof bestBid === 'number' ? bestAsk - bestBid : null;
  const maxVolume = useMemo(() => {
    const values = [...bidRows, ...askRows]
      .map((row) => (typeof row.volume === 'number' && Number.isFinite(row.volume) ? row.volume : 0));
    return Math.max(0, ...values);
  }, [askRows, bidRows]);

  const getVolumeRatio = (volume?: number) => {
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0 || maxVolume <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, volume / maxVolume));
  };

  const isSelectedPrice = (price?: number, side?: 'bid' | 'ask', level?: number) => {
    if (typeof price !== 'number' || !Number.isFinite(price)) return false;
    if (typeof selectedQuotePrice !== 'number' || !Number.isFinite(selectedQuotePrice)) return false;
    return (
      Math.abs(selectedQuotePrice - price) < 0.0000001 &&
      selectedQuoteSide === (side ?? null) &&
      selectedQuoteLevel === (level ?? null)
    );
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
              <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>合约盘口与走势</div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                <Activity className="mr-1 h-3 w-3" />
                {isConnected ? 'WS 已连接' : 'WS 连接中'}
              </span>
            </div>
            <div className={`mt-1 text-sm ${themes[theme].text}`}>
              <span className="font-mono font-semibold">{normalizedCode}</span>
              {contractName ? <span className="ml-2 opacity-75">{contractName}</span> : null}
            </div>
            <div className={`mt-1 text-xs ${themes[theme].text} opacity-60`}>
              {lastUpdated ? `最近更新 ${lastUpdated}` : '等待行情返回...'}
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
                  {isConnected ? `${Math.ceil(remainingMs / 1000)}s` : '--'}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
            <button
              type="button"
              onClick={triggerNow}
              disabled={!isConnected || !normalizedCode}
              className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium ${themes[theme].secondary} ${
                !isConnected ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
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
              点差 {spread != null ? spread.toFixed(4) : '-'}
            </div>
          </div>
          <div className={`mb-3 text-xs ${themes[theme].text} opacity-70`}>
            点击任意买卖档价格，可直接回填到上方表单的目标价格。
          </div>
          <div className={`mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs ${themes[theme].text} opacity-70`}>
            <span>{`买一 ${typeof bestBid === 'number' ? bestBid.toFixed(4) : '-'}`}</span>
            <span>{`卖一 ${typeof bestAsk === 'number' ? bestAsk.toFixed(4) : '-'}`}</span>
            <span>{`差 ${spread != null ? spread.toFixed(4) : '-'}`}</span>
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
                      isSelectedPrice(row.price, 'bid', row.level) ? 'bg-rose-50 dark:bg-rose-900/15' : ''
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
                    <div className={`text-right font-mono text-[10px] sm:text-xs ${themes[theme].text}`}>{row.volume ?? '-'}</div>
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
                      isSelectedPrice(row.price, 'ask', row.level) ? 'bg-emerald-50 dark:bg-emerald-900/15' : ''
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
                    <div className={`text-right font-mono text-[10px] sm:text-xs ${themes[theme].text}`}>{row.volume ?? '-'}</div>
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
                {isConnected ? '已发起订阅，等待首个行情点...' : '正在建立行情连接...'}
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
              <div className="font-mono font-semibold">{spread != null ? spread.toFixed(4) : '-'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JournalContractQuotePanel({
  contractCode,
  contractName,
  theme,
  selectedQuotePrice,
  selectedQuoteSide,
  selectedQuoteLevel,
  onSelectPrice,
}: JournalContractQuotePanelProps) {
  if (!contractCode) {
    return <QuotePanelEmptyState theme={theme} />;
  }

  return (
    <OptionPriceWebSocketProvider>
      <JournalContractQuotePanelInner
        contractCode={contractCode}
        contractName={contractName}
        theme={theme}
        selectedQuotePrice={selectedQuotePrice}
        selectedQuoteSide={selectedQuoteSide}
        selectedQuoteLevel={selectedQuoteLevel}
        onSelectPrice={onSelectPrice}
      />
    </OptionPriceWebSocketProvider>
  );
}
