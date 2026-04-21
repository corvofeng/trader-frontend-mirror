import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionPriceWebSocketContext } from '../context/OptionPriceWebSocketContext';

export type { PriceUpdate } from '../context/OptionPriceWebSocketContext';

export function useOptionPriceWebSocket() {
  return useOptionPriceWebSocketContext();
}

type AutoRefreshOptions = {
  enabled: boolean;
  intervalMs: number;
  immediate?: boolean;
  tickMs?: number;
};

export function useAutoRefresh(action: () => void, options: AutoRefreshOptions) {
  const { enabled, intervalMs, immediate = true, tickMs = 500 } = options;

  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const nextRunAtRef = useRef<number>(Date.now() + Math.max(0, intervalMs));
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, intervalMs));

  const triggerNow = useCallback(() => {
    if (!enabled || intervalMs <= 0) return;
    nextRunAtRef.current = Date.now() + intervalMs;
    setRemainingMs(intervalMs);
    actionRef.current();
  }, [enabled, intervalMs]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      setRemainingMs(Math.max(0, intervalMs));
      return;
    }

    nextRunAtRef.current = Date.now() + intervalMs;
    setRemainingMs(intervalMs);
    if (immediate) {
      actionRef.current();
    }

    const id = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, nextRunAtRef.current - now);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        nextRunAtRef.current = now + intervalMs;
        setRemainingMs(intervalMs);
        actionRef.current();
      }
    }, Math.max(100, tickMs));

    return () => window.clearInterval(id);
  }, [enabled, intervalMs, immediate, tickMs]);

  const progress = useMemo(() => {
    if (!enabled || intervalMs <= 0) return 0;
    const ratio = 1 - remainingMs / intervalMs;
    return Math.max(0, Math.min(1, ratio));
  }, [enabled, intervalMs, remainingMs]);

  return { remainingMs, progress, triggerNow };
}
