import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import type {
  StockPrice,
  StockPriceWebSocketClient,
  StockPriceWebSocketHandlers,
} from '../../../lib/services/types';
import { stockService } from '../../../lib/services';

/* =========================================================================
 *  Context 值定义
 * =======================================================================*/

export type StockPrice = StockPrice;

export interface StockPriceWebSocketContextValue {
  isConnected: boolean;
  prices: Record<string, StockPriceWebSocketPriceUpdate>;
  lastErrorMessage: string | null;
  errorCount: number;
  subscribe: (stockCodes: string[]) => void;
  connect: () => void;
  send: (payload: unknown) => void;
}

export interface StockPriceWebSocketPriceUpdate extends StockPrice {
  contract_code?: string;
  stock_code?: string;
  last_price?: number;
  timestamp?: number;
}

const StockPriceWebSocketContext = createContext<StockPriceWebSocketContextValue | null>(null);

/* =========================================================================
 *  Provider Props
 * =======================================================================*/

export interface StockPriceWebSocketProviderProps {
  children: React.ReactNode;
}

/* =========================================================================
 *  工具函数：把消息字段归一化成 StockPriceWebSocketPriceUpdate[]
 * =======================================================================*/

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object';
}

function pickNumberArr(v: unknown, aliases: readonly string[], rec?: Record<string, unknown>): number[] | null {
  const pool = [v];
  if (rec) aliases.forEach((k) => pool.push(rec[k]));
  for (const cand of pool) {
    if (Array.isArray(cand)) {
      const nums = cand
        .map((x) => (typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN))
        .filter((n) => Number.isFinite(n));
      if (nums.length > 0) return nums;
    }
  }
  return null;
}

function pickScalar(v: unknown, aliases: readonly string[], rec?: Record<string, unknown>): number | null {
  const pool = [v];
  if (rec) aliases.forEach((k) => pool.push(rec[k]));
  for (const cand of pool) {
    if (typeof cand === 'number' && Number.isFinite(cand)) return cand;
    if (typeof cand === 'string') {
      const n = Number(cand);
      if (Number.isFinite(n)) return n;
    }
    if (Array.isArray(cand)) {
      const first = cand[0];
      if (typeof first === 'number' && Number.isFinite(first)) return first;
      if (typeof first === 'string') {
        const n = Number(first);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

function pickCode(data: Record<string, unknown>): string | null {
  const raw = data.stock_code ?? data.contract_code ?? data.code ?? data.symbol;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

function pickTs(data: Record<string, unknown>): number {
  const raw = data.timestamp ?? data.ts ?? data.time ?? data.updated_at;
  if (typeof raw === 'number') {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function normalizePriceMessage(data: unknown): StockPriceWebSocketPriceUpdate[] {
  if (!data) return [];

  if (typeof data === 'string') {
    try { return normalizePriceMessage(JSON.parse(data)); } catch { return []; }
  }

  if (Array.isArray(data)) {
    const arr = data as unknown[];
    const result: StockPriceWebSocketPriceUpdate[] = [];
    arr.forEach((item) => {
      if (Array.isArray(item)) {
        result.push(...normalizePriceMessage(item));
        return;
      }
      if (isRecord(item)) {
        result.push(...normalizeRecord(item));
      }
    });
    return result;
  }

  if (isRecord(data)) {
    if (typeof data.action === 'string' && (data.action === 'ping' || data.action === 'pong')) {
      return [];
    }
    const nested = (data.stock_prices ?? data.stocks ?? data.updates ?? data.data ?? data.payload) as unknown;
    if (Array.isArray(nested)) {
      const nestedArr = nested as unknown[];
      const out: StockPriceWebSocketPriceUpdate[] = [];
      nestedArr.forEach((it) => {
        if (Array.isArray(it)) out.push(...normalizePriceMessage(it));
        else if (isRecord(it)) out.push(...normalizeRecord(it));
      });
      return out;
    }
    if (isRecord(nested)) return normalizeRecord(nested);
    return normalizeRecord(data);
  }

  return [];
}

function normalizeRecord(data: Record<string, unknown>): StockPriceWebSocketPriceUpdate[] {
  const code = pickCode(data);
  if (!code) return [];

  const lastPrice = pickScalar(data.last_price ?? data.price ?? data.close, ['lastPrice', 'last', 'price', 'close', 'cur_price'], data);
  const price = lastPrice;
  const timestamp = pickTs(data);

  const bidPriceArr = pickNumberArr(data.bid_prices ?? data.bid_price ?? data.bids, ['bidPrices', 'bid_price', 'bid_prices', 'bid', 'bids', 'buy_price', 'buyPrices'], data);
  const askPriceArr = pickNumberArr(data.ask_prices ?? data.ask_price ?? data.asks, ['askPrices', 'ask_price', 'ask_prices', 'ask', 'asks', 'sell_price', 'sellPrices'], data);
  const bidVolArr = pickNumberArr(data.bid_vol ?? data.bid_vols ?? data.bid_volume ?? data.bid_volumes, ['bidVol', 'bidVolumes', 'bid_volume', 'bid_vol', 'buy_vol', 'buy_vols'], data);
  const askVolArr = pickNumberArr(data.ask_vol ?? data.ask_vols ?? data.ask_volume ?? data.ask_volumes, ['askVol', 'askVolumes', 'ask_volume', 'ask_vol', 'sell_vol', 'sell_vols'], data);

  const bid1 = bidPriceArr?.[0] ?? pickScalar(null, ['bid_price_1', 'bid1', 'buy_price_1', 'buyOnePrice'], data);
  const ask1 = askPriceArr?.[0] ?? pickScalar(null, ['ask_price_1', 'ask1', 'sell_price_1', 'sellOnePrice'], data);

  const result: StockPriceWebSocketPriceUpdate = {
    stock_code: code,
    contract_code: code,
    price: price ?? 0,
    last_price: lastPrice,
    timestamp,
    bid: bid1 ?? null,
    ask: ask1 ?? null,
    bid_price: bidPriceArr ?? [],
    ask_price: askPriceArr ?? [],
    bid_vol: bidVolArr ?? [],
    ask_vol: askVolArr ?? [],
    stock_name: typeof data.stock_name === 'string' ? data.stock_name : undefined,
    prev_close: pickScalar(data.prev_close, ['prevClose', 'pre_close', 'preClose', 'yesterday_close', 'last_close'], data),
    open: pickScalar(data.open, ['open_price', 'today_open'], data),
    high: pickScalar(data.high, ['high_price', 'today_high'], data),
    low: pickScalar(data.low, ['low_price', 'today_low'], data),
    volume: pickScalar(data.volume ?? data.vol ?? data.qty, ['vol', 'volume', 'quantity', 'qty', 'deal_amount'], data),
    amount: pickScalar(data.amount ?? data.turnover, ['turnover', 'amount', 'total_amount'], data),
  };

  return [result];
}

/* =========================================================================
 *  Provider
 * =======================================================================*/

export function StockPriceWebSocketProvider({ children }: StockPriceWebSocketProviderProps) {
  const clientRef = useRef<StockPriceWebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, StockPriceWebSocketPriceUpdate>>({});
  const lastPongTime = useRef<number>(Date.now());
  const autoCloseTimeoutId = useRef<number | null>(null);

  const pendingPricesRef = useRef<Record<string, StockPriceWebSocketPriceUpdate>>({});
  const throttleTimeoutRef = useRef<number | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);

  const queuePriceUpdate = useCallback((updates: Record<string, StockPriceWebSocketPriceUpdate>) => {
    Object.assign(pendingPricesRef.current, updates);

    if (throttleTimeoutRef.current === null) {
      throttleTimeoutRef.current = window.setTimeout(() => {
        throttleTimeoutRef.current = null;
        if (Object.keys(pendingPricesRef.current).length > 0) {
          setPrices((prev) => ({ ...prev, ...pendingPricesRef.current }));
          pendingPricesRef.current = {};
        }
      }, 1000);
    }
  }, []);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimeoutId.current === null) return;
    window.clearTimeout(autoCloseTimeoutId.current);
    autoCloseTimeoutId.current = null;
  }, []);

  const processMessage = useCallback(
    (raw: unknown) => {
      try {
        const items = normalizePriceMessage(raw);
        if (items.length === 0) {
          if (isRecord(raw) && 'action' in raw && (raw as Record<string, unknown>).action === 'pong') {
            lastPongTime.current = Date.now();
          }
          return;
        }
        const updates: Record<string, StockPriceWebSocketPriceUpdate> = {};
        items.forEach((item) => {
          const key = item.stock_code || item.contract_code;
          if (!key) return;
          updates[key] = item;
        });
        if (Object.keys(updates).length > 0) {
          queuePriceUpdate(updates);
        }
      } catch (e) {
        console.error('[StockWS] Failed to process message:', e);
      }
    },
    [queuePriceUpdate],
  );

  const connect = useCallback(() => {
    try {
      clearAutoCloseTimer();
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }

      if (!stockService.createStockPriceWebSocketClient) return;

      const MAX_WS_AGE_MS = 30 * 60 * 1000;

      const handlers: StockPriceWebSocketHandlers = {
        onOpen: () => {
          console.log('[StockWS] Connected');
          setIsConnected(true);
          setLastErrorMessage(null);
          lastPongTime.current = Date.now();
          clearAutoCloseTimer();
          autoCloseTimeoutId.current = window.setTimeout(() => {
            if (clientRef.current !== nextClient) return;
            autoCloseTimeoutId.current = null;
            toast('股票行情 WebSocket 已超过 30 分钟自动断开，刷新页面或重连以继续。', { duration: 5000 });
            window.dispatchEvent(new CustomEvent('stock-ws:max-age'));
            nextClient.close();
          }, MAX_WS_AGE_MS);
        },
        onClose: () => {
          console.log('[StockWS] Disconnected');
          setIsConnected(false);
          clearAutoCloseTimer();
        },
        onError: (event) => {
          console.error('[StockWS] Error:', event);
          const msg =
            (event && typeof event === 'object' && 'message' in event && typeof (event as { message?: unknown }).message === 'string')
              ? (event as { message: string }).message
              : event === undefined
                ? 'WebSocket Error'
                : null;
          if (msg) {
            setLastErrorMessage(msg);
            setErrorCount((n) => n + 1);
          }
        },
        onMessage: (data) => processMessage(data),
      };

      const nextClient = stockService.createStockPriceWebSocketClient(handlers);
      clientRef.current = nextClient;
      nextClient.connect();
    } catch (e) {
      console.error('[StockWS] Failed to initialize:', e);
    }
  }, [clearAutoCloseTimer, processMessage]);

  useEffect(() => {
    connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (clientRef.current) {
          console.log('[StockWS] Page hidden, closing socket to avoid wasting traffic');
          clientRef.current.close();
          clientRef.current = null;
        }
        clearAutoCloseTimer();
        setIsConnected(false);
      } else {
        console.log('[StockWS] Page visible, reconnecting');
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (clientRef.current) clientRef.current.close();
      clearAutoCloseTimer();
      if (throttleTimeoutRef.current !== null) {
        window.clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [connect, clearAutoCloseTimer]);

  useEffect(() => {
    const PING_INTERVAL = 10000;
    const PONG_TIMEOUT = 20000;

    const intervalId = window.setInterval(() => {
      const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
      if (clientRef.current?.getReadyState() === OPEN) {
        try {
          clientRef.current.send({ action: 'ping' });

          if (Date.now() - lastPongTime.current > PONG_TIMEOUT) {
            console.warn('[StockWS] Heartbeat timeout - Reconnecting...');
            connect();
          }
        } catch (e) {
          console.error('[StockWS] Failed to send ping:', e);
        }
      }
    }, PING_INTERVAL);

    return () => window.clearInterval(intervalId);
  }, [connect]);

  const subscribe = useCallback((stockCodes: string[]) => {
    try {
      clientRef.current?.subscribe(stockCodes);
    } catch (e) {
      console.error('[StockWS] subscribe failed:', e);
    }
  }, []);

  const send = useCallback((payload: unknown) => {
    try {
      clientRef.current?.send(payload);
    } catch (e) {
      console.error('[StockWS] send failed:', e);
    }
  }, []);

  return (
    <StockPriceWebSocketContext.Provider
      value={{ isConnected, prices, lastErrorMessage, errorCount, subscribe, connect, send }}
    >
      {children}
    </StockPriceWebSocketContext.Provider>
  );
}

/* =========================================================================
 *  Hook
 * =======================================================================*/

export function useStockPriceWebSocketContext(): StockPriceWebSocketContextValue {
  const ctx = useContext(StockPriceWebSocketContext);
  if (!ctx) {
    throw new Error('useStockPriceWebSocketContext must be used within StockPriceWebSocketProvider');
  }
  return ctx;
}
