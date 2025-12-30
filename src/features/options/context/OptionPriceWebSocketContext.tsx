import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';

// Use environment variable or construct from current host
const getWebSocketUrl = () => {
  if ((import.meta as any).env?.VITE_WS_URL) {
    return (import.meta as any).env.VITE_WS_URL;
  }
  // Check if window is defined (browser environment)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws/option-prices`;
  }
  return 'ws://localhost:8000/api/ws/option-prices'; // Fallback
};

export interface PriceUpdate {
  contract_code: string;
  price: number;
  last_price?: number;
  bid?: number;
  bid_price?: number;
  bid_prices?: number[];
  ask?: number;
  ask_price?: number;
  ask_prices?: number[];
  ask_vol?: number[];
  bid_vol?: number[];
  timestamp: number;
}

interface OptionPriceWebSocketContextType {
  isConnected: boolean;
  prices: Record<string, PriceUpdate>;
  queryPrice: (contractCodes: string[]) => void;
  connect: () => void;
}

const OptionPriceWebSocketContext = createContext<OptionPriceWebSocketContextType | null>(null);

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
  const lastPongTime = useRef<number>(Date.now());

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

          // Assuming the server returns { contract_code: "...", price: ... } or a list
          if (Array.isArray(data)) {
            const updates: Record<string, PriceUpdate> = {};
            data.forEach((item: any) => {
              if (item.contract_code) {
                // Helper to parse price fields which might be scalars or arrays
                const parsePriceField = (val: any): { scalar: number | undefined, array: number[] | undefined } => {
                  if (Array.isArray(val)) {
                    return { scalar: val.length > 0 ? val[0] : undefined, array: val };
                  }
                  if (typeof val === 'number') {
                    return { scalar: val, array: [val] };
                  }
                  return { scalar: undefined, array: undefined };
                };

                const bidSource = item.bid_prices ?? item.bid_price ?? item.bid;
                const askSource = item.ask_prices ?? item.ask_price ?? item.ask;

                const bidData = parsePriceField(bidSource);
                const askData = parsePriceField(askSource);

                updates[item.contract_code] = {
                  ...item,
                  price: item.last_price ?? item.price,
                  bid: bidData.scalar,
                  bid_price: bidData.scalar,
                  ask: askData.scalar,
                  ask_price: askData.scalar,
                  bid_prices: bidData.array ?? [],
                  ask_prices: askData.array ?? []
                };
              }
            });
            setPrices(prev => ({ ...prev, ...updates }));
          } else if (data.contract_code) {
             // Helper to parse price fields which might be scalars or arrays
             const parsePriceField = (val: any): { scalar: number | undefined, array: number[] | undefined } => {
              if (Array.isArray(val)) {
                return { scalar: val.length > 0 ? val[0] : undefined, array: val };
              }
              if (typeof val === 'number') {
                return { scalar: val, array: [val] };
              }
              return { scalar: undefined, array: undefined };
            };

            const bidSource = data.bid_prices ?? data.bid_price ?? data.bid;
            const askSource = data.ask_prices ?? data.ask_price ?? data.ask;

            const bidData = parsePriceField(bidSource);
            const askData = parsePriceField(askSource);

            const processedData = {
              ...data,
              price: data.last_price ?? data.price,
              bid: bidData.scalar,
              bid_price: bidData.scalar,
              ask: askData.scalar,
              ask_price: askData.scalar,
              bid_prices: bidData.array ?? [],
              ask_prices: askData.array ?? []
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
    const PING_INTERVAL = 3000;
    const PONG_TIMEOUT = 5000;

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
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'query_price', contract_codes: contractCodes }));
    }
  }, []);

  return <OptionPriceWebSocketContext.Provider value={{ isConnected, prices, queryPrice, connect }}>{children}</OptionPriceWebSocketContext.Provider>;
}
