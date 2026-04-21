import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
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
  queryOptionsData: (symbol: string) => void;
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
  const clientRef = useRef<OptionPriceWebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [orders, setOrders] = useState<OptionOrder[]>([]);
  const [optionsDataSnapshots, setOptionsDataSnapshots] = useState<Record<string, OptionsData>>({});
  const lastPongTime = useRef<number>(Date.now());
   const [portfolioSnapshot, setPortfolioSnapshot] = useState<OptionsPortfolioData | null>(null);

  const connect = useCallback(() => {
    try {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }

      clientRef.current = optionsService.createOptionPriceWebSocketClient({
        onOpen: () => {
          console.log('Option Price WebSocket Connected');
          setIsConnected(true);
          lastPongTime.current = Date.now();
        },
        onClose: () => {
          console.log('Option Price WebSocket Disconnected');
          setIsConnected(false);
        },
        onError: (error) => {
          console.error('Option Price WebSocket Error:', error);
        },
        onMessage: (data) => {
          try {
            if (data && typeof data === 'object' && 'action' in (data as Record<string, unknown>)) {
              const record = data as Record<string, unknown>;
              if (record.action === 'pong') {
                lastPongTime.current = Date.now();
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
              setPrices(prev => ({ ...prev, ...updates }));
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

              setPrices(prev => ({
                ...prev,
                [record.contract_code]: processedData
              }));
            }
          } catch (e) {
            console.error('Failed to handle WebSocket message:', e);
          }
        }
      });

      clientRef.current.connect();
    } catch (e) {
      console.error('Failed to initialize WebSocket:', e);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (clientRef.current) clientRef.current.close();
    };
  }, [connect]);

  useEffect(() => {
    const PING_INTERVAL = 10000;
    const PONG_TIMEOUT = 20000;

    const intervalId = setInterval(() => {
      const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
      if (clientRef.current?.getReadyState() === OPEN) {
        try {
          clientRef.current.send({ action: 'ping' });
          
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
    clientRef.current?.subscribe(contractCodes);
  }, []);

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

  return <OptionPriceWebSocketContext.Provider value={{ isConnected, prices, orders, optionsDataSnapshots, queryPrice, queryOptionsData, queryOrders, connect, send, portfolioSnapshot }}>{children}</OptionPriceWebSocketContext.Provider>;
}
