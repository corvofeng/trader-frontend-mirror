import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  useOptionalOptionPriceWebSocketContext,
} from '../context/OptionPriceWebSocketContext';
import type { PriceUpdate } from '../context/OptionPriceWebSocketContext';

export interface OptionQuoteSubscriptionState {
  prices: Record<string, PriceUpdate>;
  isConnected: boolean;
  reconnect: () => void;
}

interface OptionQuoteSubscriptionProps {
  ordinaryCodes?: readonly (string | null | undefined)[];
  realtimeCodes?: readonly (string | null | undefined)[];
  refreshNonce?: number;
  children?: ReactNode | ((state: OptionQuoteSubscriptionState) => ReactNode);
}

const normalizeCodes = (codes: readonly (string | null | undefined)[]) =>
  Array.from(new Set(codes.map((code) => code?.trim()).filter((code): code is string => !!code)))
    .sort();

/**
 * Declarative bridge between UI code and the shared quote subscription registry.
 * Callers only provide desired codes; registration and cleanup stay centralized here.
 */
export function OptionQuoteSubscription({
  ordinaryCodes = [],
  realtimeCodes = [],
  refreshNonce,
  children = null,
}: OptionQuoteSubscriptionProps) {
  const context = useOptionalOptionPriceWebSocketContext();
  const subscribeCodes = context?.subscribeCodes;
  const unsubscribeCodes = context?.unsubscribeCodes;
  const realtimeSubscribeCodes = context?.realtimeSubscribeCodes;
  const realtimeUnsubscribeCodes = context?.realtimeUnsubscribeCodes;
  const queryPrice = context?.queryPrice;
  const realtimeQueryPrice = context?.realtimeQueryPrice;
  const ordinaryKey = normalizeCodes(ordinaryCodes).join(',');
  const realtimeKey = normalizeCodes(realtimeCodes).join(',');
  const normalizedOrdinaryCodes = useMemo(
    () => ordinaryKey ? ordinaryKey.split(',') : [],
    [ordinaryKey]
  );
  const normalizedRealtimeCodes = useMemo(
    () => realtimeKey ? realtimeKey.split(',') : [],
    [realtimeKey]
  );

  useEffect(() => {
    if (!subscribeCodes || !unsubscribeCodes || normalizedOrdinaryCodes.length === 0) return;
    subscribeCodes(normalizedOrdinaryCodes);
    return () => unsubscribeCodes(normalizedOrdinaryCodes);
  }, [
    subscribeCodes,
    unsubscribeCodes,
    normalizedOrdinaryCodes,
  ]);

  useEffect(() => {
    if (!realtimeSubscribeCodes || !realtimeUnsubscribeCodes || normalizedRealtimeCodes.length === 0) return;
    realtimeSubscribeCodes(normalizedRealtimeCodes);
    return () => realtimeUnsubscribeCodes(normalizedRealtimeCodes);
  }, [
    realtimeSubscribeCodes,
    realtimeUnsubscribeCodes,
    normalizedRealtimeCodes,
  ]);

  useEffect(() => {
    if (refreshNonce === undefined) return;
    if (normalizedOrdinaryCodes.length > 0) queryPrice?.(normalizedOrdinaryCodes);
    if (normalizedRealtimeCodes.length > 0) realtimeQueryPrice?.(normalizedRealtimeCodes);
  }, [
    normalizedOrdinaryCodes,
    normalizedRealtimeCodes,
    queryPrice,
    realtimeQueryPrice,
    refreshNonce,
  ]);

  if (typeof children === 'function') {
    return children({
      prices: context?.prices ?? {},
      isConnected: context?.isConnected ?? false,
      reconnect: context?.reconnect ?? (() => undefined),
    });
  }

  return children;
}
