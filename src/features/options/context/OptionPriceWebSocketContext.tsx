import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import type { OptionsPortfolioData, OptionOrder } from '../../../lib/services/types';

// Use environment variable or construct from current host
const getWebSocketUrl = () => {
  const meta = import.meta as unknown as { env?: { VITE_WS_URL?: string } };
  if (meta.env?.VITE_WS_URL) {
    return meta.env.VITE_WS_URL;
  }
  // Check if window is defined (browser environment)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws/option`;
  }
  return 'ws://localhost:8000/api/ws/option'; // Fallback
};

type PriceFieldSource = number | number[] | undefined;

interface ServerPriceMessage extends PriceUpdate {
  bid_prices?: number[];
  bid_price?: number | number[];
  ask_prices?: number[];
  ask_price?: number | number[];
}

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
  queryPrice: (contractCodes: string[]) => void;
  queryOrders: (accountId: string) => void;
  connect: () => void;
  send: (payload: unknown) => void;
  portfolioSnapshot: OptionsPortfolioData | null;
}

const OptionPriceWebSocketContext = createContext<OptionPriceWebSocketContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionPriceWebSocketContext() {
  const context = useContext(OptionPriceWebSocketContext);
  if (!context) {
    throw new Error('useOptionPriceWebSocketContext must be used within a OptionPriceWebSocketProvider');
  }
  return context;
}

interface OptionPriceWebSocketProviderProps {
  children: ReactNode;
}

export function OptionPriceWebSocketProvider({ children }: OptionPriceWebSocketProviderProps) {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [orders, setOrders] = useState<OptionOrder[]>([]);
  const lastPongTime = useRef<number>(Date.now());
   const [portfolioSnapshot, setPortfolioSnapshot] = useState<OptionsPortfolioData | null>(null);

  const connect = useCallback(() => {
    // If a connection exists, close it first
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    try {
      ws.current = new WebSocket(getWebSocketUrl());

      ws.current.onopen = () => {
        console.log('Option Price WebSocket Connected');
        setIsConnected(true);
        lastPongTime.current = Date.now();
      };

      ws.current.onclose = () => {
        console.log('Option Price WebSocket Disconnected');
        setIsConnected(false);
      };

      ws.current.onerror = (error) => {
        console.error('Option Price WebSocket Error:', error);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.action === 'pong') {
            lastPongTime.current = Date.now();
            return;
          }

          if (data.action === 'options_portfolio' || data.action === 'options_portfolio_snapshot') {
            const payload = data.portfolio ?? data.data ?? data.payload;
            if (payload) {
              setPortfolioSnapshot(payload as OptionsPortfolioData);
            }
            return;
          }

          if (data.action === 'option_orders') {
            const payload = data.orders ?? data.data ?? data.payload;
            if (Array.isArray(payload)) {
              setOrders(payload as OptionOrder[]);
            }
            return;
          }

          // Assuming the server returns { contract_code: "...", price: ... } or a list
          if (Array.isArray(data)) {
            const updates: Record<string, PriceUpdate> = {};
            data.forEach((item: ServerPriceMessage) => {
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
            setPrices(prev => ({ ...prev, ...updates }));
          } else if (data.contract_code) {
            const bidSource = data.bid_prices ?? data.bid_price ?? data.bid;
            const askSource = data.ask_prices ?? data.ask_price ?? data.ask;

            const bidData = parsePriceField(bidSource);
            const askData = parsePriceField(askSource);

            const processedData = {
              ...data,
              price: data.last_price ?? data.price,
              bid: bidData.scalar,
              bid_price: bidData.array ?? [],
              ask: askData.scalar,
              ask_price: askData.array ?? [],
              bid_vol: data.bid_vol ?? [],
              ask_vol: data.ask_vol ?? []
            };

            setPrices(prev => ({
              ...prev,
              [data.contract_code]: processedData
            }));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    } catch (e) {
      console.error('Failed to initialize WebSocket:', e);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  useEffect(() => {
    const PING_INTERVAL = 10000;
    const PONG_TIMEOUT = 20000;

    const intervalId = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify({ action: 'ping' }));
          
          if (Date.now() - lastPongTime.current > PONG_TIMEOUT) {
            console.warn('WebSocket heartbeat timeout - Reconnecting...');
            connect();
          }
        } catch (e) {
          console.error('Failed to send ping:', e);
        }
      }
    }, PING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [connect]);

  const queryPrice = useCallback((contractCodes: string[]) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        action: 'subscribe',
        contract_codes: contractCodes
      }));
    }
  }, []);

  const queryOrders = useCallback((accountId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        action: 'query_option_orders',
        account_id: accountId,
        only_today: true
      }));
    }
  }, []);

  const send = useCallback((payload: unknown) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        if (typeof payload === 'string') {
          ws.current.send(payload);
        } else {
          ws.current.send(JSON.stringify(payload));
        }
      } catch (e) {
        console.error('Failed to send message:', e);
      }
    }
  }, []);

  return <OptionPriceWebSocketContext.Provider value={{ isConnected, prices, orders, queryPrice, queryOrders, connect, send, portfolioSnapshot }}>{children}</OptionPriceWebSocketContext.Provider>;
}
