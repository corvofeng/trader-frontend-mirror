import { useOptionPriceWebSocketContext } from '../context/OptionPriceWebSocketContext';

export type { PriceUpdate } from '../context/OptionPriceWebSocketContext';

export function useOptionPriceWebSocket() {
  return useOptionPriceWebSocketContext();
}
