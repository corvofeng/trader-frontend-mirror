import { useEffect, useRef, useState, useCallback } from 'react';

// Use environment variable or default to localhost
const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8000/ws/option-prices';

export interface PriceUpdate {
  contract_code: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export function useOptionPriceWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});

  useEffect(() => {
    // Initialize WebSocket connection
    try {
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
          console.log('Option Price WebSocket Connected');
          setIsConnected(true);
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
            // Assuming the server returns { contract_code: "...", price: ... } or a list
            if (Array.isArray(data)) {
                const updates: Record<string, PriceUpdate> = {};
                data.forEach(item => {
                    if (item.contract_code) {
                        updates[item.contract_code] = item;
                    }
                });
                setPrices(prev => ({ ...prev, ...updates }));
            } else if (data.contract_code) {
              setPrices(prev => ({
                ...prev,
                [data.contract_code]: data
              }));
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };
    } catch (e) {
        console.error('Failed to initialize WebSocket:', e);
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const queryPrice = useCallback((contractCodes: string[]) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        action: 'query_price',
        contract_codes: contractCodes
      }));
    } else {
        // Retry once after a short delay if not connected (optional, but good for UX)
        console.warn('WebSocket is not connected. Cannot query prices.');
    }
  }, []);

  return { isConnected, prices, queryPrice };
}
