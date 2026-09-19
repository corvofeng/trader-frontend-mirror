import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import toast from 'react-hot-toast';
import type { OptionsPortfolioData, OptionOrder } from '../../../lib/services/types';
import type { OptionsData } from '../../../lib/services/types';
import type { OptionPriceWebSocketClient } from '../../../lib/services/types';
import { optionsService } from '../../../lib/services';

type PriceFieldSource = number | number[] | undefined;

type ServerPriceMessage = {
  contract_code: string;
  price: number;
  last_price?: number;
  bid?: number;
  bid_prices?: number[];
  bid_price?: number | number[];
  ask?: number;
  ask_prices?: number[];
  ask_price?: number | number[];
  ask_vol?: number[];
  bid_vol?: number[];
  timestamp: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const preferQualifiedCodes = (codes: string[]) => {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  const qualifiedBases = new Set(
    uniqueCodes
      .filter((code) => code.includes('.'))
      .map((code) => code.split('.')[0])
  );
  return uniqueCodes.filter((code) => code.includes('.') || !qualifiedBases.has(code));
};

// Underlying ETF symbols that should always be treated as realtime
const UNDERLYING_SYMBOLS = new Set([
  '510050', '510300', '510500', '588000', '588080',
  '159919', '159922', '159915', '159901'
]);
const REALTIME_REFRESH_INTERVAL_MS = 2000;

export const isUnderlyingCode = (code: string) => {
  if (!code) return false;
  // Handle both raw symbols (e.g. 510300) and full codes (e.g. 510300.SH)
  const parts = code.split('.');
  const base = parts[0];
  
  // 1. Explicitly defined underlyings (China ETF Options)
  if (UNDERLYING_SYMBOLS.has(base)) return true;
  
  // 2. US stocks (usually 1-5 uppercase letters)
  if (/^[A-Z]{1,5}$/.test(base)) return true;
  
  // 3. Heuristic: if it's a 6-digit code with just a suffix (.SH/.SZ), it's likely an underlying ETF/Stock
  // China option contracts are typically 8 digits.
  if (/^\d{6}$/.test(base) && parts.length <= 2) return true;

  return false;
};

// eslint-disable-next-line react-refresh/only-export-components
export const buildRealtimeSubscriptionBatches = (
  codes: string[],
  maxCodesPerMessage = 5
) => {
  const normalizedCodes = preferQualifiedCodes(codes).sort();
  const underlyings = normalizedCodes.filter(isUnderlyingCode);
  const contracts = normalizedCodes.filter((code) => !isUnderlyingCode(code));
  const batches: string[][] = [];

  if (contracts.length === 0) {
    for (let index = 0; index < underlyings.length; index += maxCodesPerMessage) {
      batches.push(underlyings.slice(index, index + maxCodesPerMessage));
    }
    return batches;
  }

  if (underlyings.length >= maxCodesPerMessage) {
    for (let index = 0; index < underlyings.length; index += maxCodesPerMessage) {
      batches.push(underlyings.slice(index, index + maxCodesPerMessage));
    }
    return batches;
  }

  const contractBatchSize = maxCodesPerMessage - underlyings.length;
  for (let index = 0; index < contracts.length; index += contractBatchSize) {
    batches.push([...underlyings, ...contracts.slice(index, index + contractBatchSize)]);
  }
  return batches;
};

const parsePriceField = (
  val: PriceFieldSource
): { scalar: number | undefined; array: number[] | undefined } => {
  if (Array.isArray(val)) {
    return { scalar: val.length > 0 ? val[0] : undefined, array: val };
  }
  if (typeof val === 'number') {
    return { scalar: val, array: [val] };
  }
  return { scalar: undefined, array: undefined };
};

export interface PriceUpdate {
  contract_code: string;
  price: number;
  last_price?: number;
  bid?: number;
  bid_price?: number[];
  ask?: number;
  ask_price?: number[];
  ask_vol?: number[];
  bid_vol?: number[];
  timestamp: number;
}

interface OptionPriceWebSocketContextType {
  isConnected: boolean;
  prices: Record<string, PriceUpdate>;
  orders: OptionOrder[];
  optionsDataSnapshots: Record<string, OptionsData>;
  queryPrice: (contractCodes: string[]) => void;
  realtimeQueryPrice: (contractCodes: string[]) => void;
  subscribeCodes: (contractCodes: string[]) => void;
  unsubscribeCodes: (contractCodes: string[]) => void;
  realtimeSubscribeCodes: (contractCodes: string[]) => void;
  realtimeUnsubscribeCodes: (contractCodes: string[]) => void;
  queryOptionsData: (symbol: string) => void;
  queryOrders: (accountId: string) => void;
  connect: () => void;
  reconnect: () => void;
  send: (payload: unknown) => void;
  portfolioSnapshot: OptionsPortfolioData | null;
}

export const OptionPriceWebSocketContext = createContext<OptionPriceWebSocketContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionPriceWebSocketContext() {
  const context = useContext(OptionPriceWebSocketContext);
  if (!context) {
    throw new Error('useOptionPriceWebSocketContext must be used within a OptionPriceWebSocketProvider');
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalOptionPriceWebSocketContext() {
  return useContext(OptionPriceWebSocketContext);
}

interface OptionPriceWebSocketProviderProps {
  children: ReactNode;
}

export function OptionPriceWebSocketProvider({ children }: OptionPriceWebSocketProviderProps) {
  const clientRef = useRef<OptionPriceWebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [orders, setOrders] = useState<OptionOrder[]>([]);
  const [optionsDataSnapshots, setOptionsDataSnapshots] = useState<Record<string, OptionsData>>({});
  const lastPongTime = useRef<number>(Date.now());
  const [portfolioSnapshot, setPortfolioSnapshot] = useState<OptionsPortfolioData | null>(null);
  const autoCloseTimeoutId = useRef<number | null>(null);

  // High-frequency price update throttling refs
  const pendingPricesRef = useRef<Record<string, PriceUpdate>>({});
  const throttleTimeoutRef = useRef<number | null>(null);
  const ordinaryCodesRef = useRef<Map<string, number>>(new Map());
  const realtimeCodesRef = useRef<Map<string, number>>(new Map());

  const subscriptionFlushTimerRef = useRef<number | null>(null);
  const flushSubscriptionsRef = useRef<() => void>(() => undefined);
  const lastRealtimeRequestAtRef = useRef(0);

  const queuePriceUpdate = useCallback((updates: Record<string, PriceUpdate>) => {
    const realtimeUpdates: Record<string, PriceUpdate> = {};
    const throttledUpdates: Record<string, PriceUpdate> = {};

    Object.entries(updates).forEach(([code, update]) => {
      if (realtimeCodesRef.current.has(code) || isUnderlyingCode(code)) {
        realtimeUpdates[code] = update;
      } else {
        throttledUpdates[code] = update;
      }
    });

    if (Object.keys(realtimeUpdates).length > 0) {
      setPrices((prev) => ({ ...prev, ...realtimeUpdates }));
    }

    if (Object.keys(throttledUpdates).length > 0) {
      Object.assign(pendingPricesRef.current, throttledUpdates);
      if (throttleTimeoutRef.current === null) {
        throttleTimeoutRef.current = window.setTimeout(() => {
          throttleTimeoutRef.current = null;
          if (Object.keys(pendingPricesRef.current).length > 0) {
            setPrices((prev) => ({ ...prev, ...pendingPricesRef.current }));
            pendingPricesRef.current = {};
          }
        }, 1000); // 1000ms batching window (1 tick per second)
      }
    }
  }, []);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimeoutId.current === null) return;
    window.clearTimeout(autoCloseTimeoutId.current);
    autoCloseTimeoutId.current = null;
  }, []);

  const connect = useCallback(() => {
    try {
      clearAutoCloseTimer();
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }

      const MAX_WS_AGE_MS = 30 * 60 * 1000;

      const nextClient = optionsService.createOptionPriceWebSocketClient({
        onOpen: () => {
          console.log('Option Price WebSocket Connected');
          setIsConnected(true);
          lastPongTime.current = Date.now();

          flushSubscriptionsRef.current();

          clearAutoCloseTimer();
          autoCloseTimeoutId.current = window.setTimeout(() => {
            if (clientRef.current !== nextClient) return;
            autoCloseTimeoutId.current = null;
            toast('WebSocket 连接已超过 30 分钟，已自动断开。刷新页面或重建连接以继续。', { duration: 6000 });
            nextClient.close();
          }, MAX_WS_AGE_MS);
        },
        onClose: () => {
          console.log('Option Price WebSocket Disconnected');
          setIsConnected(false);
          clearAutoCloseTimer();
        },
        onError: (error) => {
          console.error('Option Price WebSocket Error:', error);
        },
        onMessage: (data) => {
          lastPongTime.current = Date.now();
          try {
            if (data && typeof data === 'object' && 'action' in (data as Record<string, unknown>)) {
              const record = data as Record<string, unknown>;
              if (record.action === 'pong') {
                return;
              }

              if (record.action === 'options_portfolio' || record.action === 'options_portfolio_snapshot') {
                const payload =
                  (record.portfolio as unknown) ?? (record.data as unknown) ?? (record.payload as unknown);
                if (payload) {
                  setPortfolioSnapshot(payload as OptionsPortfolioData);
                }
                return;
              }

              if (record.action === 'option_orders') {
                const payload = (record.orders as unknown) ?? (record.data as unknown) ?? (record.payload as unknown);
                if (Array.isArray(payload)) {
                  setOrders(payload as OptionOrder[]);
                }
                return;
              }

              if (
                record.action === 'options_data' ||
                record.action === 'options_data_snapshot' ||
                record.action === 'option_chain' ||
                record.action === 'option_chain_snapshot'
              ) {
                const payload = (record.data as unknown) ?? (record.payload as unknown) ?? (record.options as unknown);
                const dataRecord = asRecord(payload);
                const quotes = dataRecord?.quotes;
                if (Array.isArray(quotes)) {
                  const optionsData: OptionsData = {
                    quotes: quotes as OptionsData['quotes'],
                    surface: Array.isArray(dataRecord?.surface) ? (dataRecord.surface as OptionsData['surface']) : [],
                    opt_undl_code_full:
                      typeof dataRecord?.opt_undl_code_full === 'string' ? dataRecord.opt_undl_code_full : undefined,
                    vertical_spread_monthly_prices: Array.isArray(dataRecord?.vertical_spread_monthly_prices)
                      ? (dataRecord.vertical_spread_monthly_prices as OptionsData['vertical_spread_monthly_prices'])
                      : undefined,
                  };
                  const symbol =
                    (typeof record.symbol === 'string' && record.symbol) ||
                    optionsData.opt_undl_code_full ||
                    '__default__';
                  setOptionsDataSnapshots((prev) => ({
                    ...prev,
                    [symbol]: optionsData,
                  }));
                }
                return;
              }
            }

            if (Array.isArray(data)) {
              const updates: Record<string, PriceUpdate> = {};
              (data as ServerPriceMessage[]).forEach((item) => {
                if (item.contract_code) {
                  const bidSource = item.bid_prices ?? item.bid_price ?? item.bid;
                  const askSource = item.ask_prices ?? item.ask_price ?? item.ask;

                  const bidData = parsePriceField(bidSource);
                  const askData = parsePriceField(askSource);

                  updates[item.contract_code] = {
                    ...item,
                    price: item.last_price ?? item.price,
                    bid: bidData.scalar,
                    bid_price: bidData.array ?? [],
                    ask: askData.scalar,
                    ask_price: askData.array ?? [],
                    bid_vol: item.bid_vol ?? [],
                    ask_vol: item.ask_vol ?? []
                  };
                }
              });
              queuePriceUpdate(updates);
              return;
            }

            if (data && typeof data === 'object' && 'contract_code' in (data as Record<string, unknown>)) {
              const record = data as unknown as ServerPriceMessage;
              const bidSource = record.bid_prices ?? record.bid_price ?? record.bid;
              const askSource = record.ask_prices ?? record.ask_price ?? record.ask;

              const bidData = parsePriceField(bidSource);
              const askData = parsePriceField(askSource);

              const processedData: PriceUpdate = {
                ...(record as unknown as PriceUpdate),
                price: record.last_price ?? record.price,
                bid: bidData.scalar,
                bid_price: bidData.array ?? [],
                ask: askData.scalar,
                ask_price: askData.array ?? [],
                bid_vol: record.bid_vol ?? [],
                ask_vol: record.ask_vol ?? []
              };

              queuePriceUpdate({ [record.contract_code]: processedData });
            }
          } catch (e) {
            console.error('Failed to handle WebSocket message:', e);
          }
        }
      });

      clientRef.current = nextClient;
      nextClient.connect();
    } catch (e) {
      console.error('Failed to initialize WebSocket:', e);
    }
  }, [clearAutoCloseTimer, queuePriceUpdate]);

  useEffect(() => {
    connect();

    return () => {
      if (clientRef.current) clientRef.current.close();
      clearAutoCloseTimer();
      if (throttleTimeoutRef.current !== null) {
        window.clearTimeout(throttleTimeoutRef.current);
      }
      if (subscriptionFlushTimerRef.current !== null) {
        window.clearTimeout(subscriptionFlushTimerRef.current);
      }
    };
  }, [connect, clearAutoCloseTimer]);

  useEffect(() => {
    const PING_INTERVAL = 15000;
    const PONG_TIMEOUT = 35000;

    const intervalId = setInterval(() => {
      const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
      if (clientRef.current?.getReadyState() === OPEN) {
        try {
          clientRef.current.send({ action: 'ping' });
          
          if (Date.now() - lastPongTime.current > PONG_TIMEOUT) {
            console.warn('Option WebSocket heartbeat timeout - Reconnecting...');
            lastPongTime.current = Date.now();
            connect();
          }
        } catch (e) {
          console.error('Failed to send ping:', e);
        }
      }
    }, PING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [connect]);

  const sendSubscriptionList = useCallback((kind: 'ordinary' | 'realtime') => {
    const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
    const client = clientRef.current;
    if (!client || client.getReadyState() !== OPEN) return;

    const source = kind === 'ordinary' ? ordinaryCodesRef.current : realtimeCodesRef.current;
    const ownCodes = preferQualifiedCodes(Array.from(source.keys())).sort();
    if (ownCodes.length === 0) return;

    if (kind === 'ordinary') {
      const contracts = ownCodes.filter((code) => !isUnderlyingCode(code));
      for (let index = 0; index < contracts.length; index += 20) {
        const batch = contracts.slice(index, index + 20);
        console.log('[OptionWS] subscribe', { contract_codes: batch });
        client.subscribe(batch);
      }
      return;
    }

    const batches = buildRealtimeSubscriptionBatches(ownCodes);
    batches.forEach((batch) => {
      console.log('[OptionWS] realtime_subscribe', { contract_codes: batch });
      client.realtimeSubscribe(batch);
    });
    if (batches.length > 0) {
      lastRealtimeRequestAtRef.current = Date.now();
    }
  }, []);

  const flushSubscriptions = useCallback(() => {
    if (subscriptionFlushTimerRef.current !== null) {
      window.clearTimeout(subscriptionFlushTimerRef.current);
      subscriptionFlushTimerRef.current = null;
    }
    sendSubscriptionList('realtime');
    sendSubscriptionList('ordinary');
  }, [sendSubscriptionList]);

  flushSubscriptionsRef.current = flushSubscriptions;

  const scheduleSubscriptionFlush = useCallback(() => {
    if (subscriptionFlushTimerRef.current !== null) return;
    subscriptionFlushTimerRef.current = window.setTimeout(() => {
      flushSubscriptionsRef.current();
    }, 200);
  }, []);

  const updateSubscriptionList = useCallback((
    target: Map<string, number>,
    contractCodes: string[],
    delta: 1 | -1
  ) => {
    Array.from(new Set(contractCodes.map((code) => code.trim()).filter(Boolean))).forEach((code) => {
      const nextCount = (target.get(code) || 0) + delta;
      if (nextCount <= 0) target.delete(code);
      else target.set(code, nextCount);
    });
    scheduleSubscriptionFlush();
  }, [scheduleSubscriptionFlush]);

  const subscribeCodes = useCallback(
    (contractCodes: string[]) => {
      updateSubscriptionList(ordinaryCodesRef.current, contractCodes, 1);
    },
    [updateSubscriptionList]
  );

  const unsubscribeCodes = useCallback(
    (contractCodes: string[]) => {
      updateSubscriptionList(ordinaryCodesRef.current, contractCodes, -1);
    },
    [updateSubscriptionList]
  );

  const realtimeSubscribeCodes = useCallback(
    (contractCodes: string[]) => {
      updateSubscriptionList(realtimeCodesRef.current, contractCodes, 1);
    },
    [updateSubscriptionList]
  );

  const realtimeUnsubscribeCodes = useCallback(
    (contractCodes: string[]) => {
      updateSubscriptionList(realtimeCodesRef.current, contractCodes, -1);
    },
    [updateSubscriptionList]
  );

  const queryPrice = useCallback(
    (contractCodes: string[]) => {
      const codes = preferQualifiedCodes(contractCodes);
      if (codes.length === 0) return;
      codes.forEach((_, index) => {
        if (index % 20 === 0) clientRef.current?.subscribe(codes.slice(index, index + 20));
      });
    },
    []
  );

  const realtimeQueryPrice = useCallback(
    (contractCodes: string[]) => {
      const activeCodes = Array.from(realtimeCodesRef.current.keys());
      const batches = buildRealtimeSubscriptionBatches([...activeCodes, ...contractCodes]);
      batches.forEach((batch) => {
        clientRef.current?.realtimeSubscribe(batch);
      });
      if (batches.length > 0) {
        lastRealtimeRequestAtRef.current = Date.now();
      }
    },
    []
  );

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const scheduleNextRefresh = () => {
      if (cancelled) return;

      const elapsed = Date.now() - lastRealtimeRequestAtRef.current;
      const delay = realtimeCodesRef.current.size > 0 && lastRealtimeRequestAtRef.current > 0
        ? Math.max(100, REALTIME_REFRESH_INTERVAL_MS - elapsed)
        : REALTIME_REFRESH_INTERVAL_MS;

      timer = window.setTimeout(() => {
        if (cancelled) return;

        const timeSinceLastRequest = Date.now() - lastRealtimeRequestAtRef.current;
        if (
          realtimeCodesRef.current.size > 0 &&
          timeSinceLastRequest >= REALTIME_REFRESH_INTERVAL_MS
        ) {
          sendSubscriptionList('realtime');
        }
        scheduleNextRefresh();
      }, delay);
    };

    scheduleNextRefresh();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [sendSubscriptionList]);

  useEffect(() => {
    const ordinaryRefreshTimer = window.setInterval(() => {
      sendSubscriptionList('ordinary');
    }, 5000);
    return () => window.clearInterval(ordinaryRefreshTimer);
  }, [sendSubscriptionList]);

  const reconnect = useCallback(() => {
    console.log('Manual WebSocket reconnection triggered');
    connect();
  }, [connect]);

  const queryOptionsData = useCallback((symbol: string) => {
    if (!symbol) return;
    clientRef.current?.queryOptionsData(symbol);
  }, []);

  const queryOrders = useCallback((accountId: string) => {
    clientRef.current?.queryOrders(accountId);
  }, []);

  const send = useCallback((payload: unknown) => {
    try {
      clientRef.current?.send(payload);
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }, []);

  return (
    <OptionPriceWebSocketContext.Provider
      value={{
        isConnected,
        prices,
        orders,
        optionsDataSnapshots,
        queryPrice,
        realtimeQueryPrice,
        subscribeCodes,
        unsubscribeCodes,
        realtimeSubscribeCodes,
        realtimeUnsubscribeCodes,
        queryOptionsData,
        queryOrders,
        connect,
        reconnect,
        send,
        portfolioSnapshot,
      }}
    >
      {children}
    </OptionPriceWebSocketContext.Provider>
  );
}
