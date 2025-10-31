// Simple event bus for cross-component strategy leg selection

export type AddLegEvent = {
  positionId: string;
  quantity?: number; // default 1
};

type Listener = (event: AddLegEvent) => void;

const listeners = new Set<Listener>();

export function onAddLegToStrategy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAddLegToStrategy(event: AddLegEvent) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch (e) {
      // swallow to avoid breaking other listeners
      // eslint-disable-next-line no-console
      console.error('AddLegToStrategy listener error:', e);
    }
  }
}

// --- Unified editor open event ---
export type ExternalLeg = {
  contract_code: string;
  contract_name: string;
  contract_type: 'call' | 'put' | string;
  contract_type_zh?: string;
  contract_strike_price?: number;
  type?: 'buy' | 'sell';
  position_type: 'buy' | 'sell' | string;
  position_type_zh?: string;
  leg_quantity: number;
  cost_price?: number; // 总成本（含多腿合计时需按腿传入）
};

export type OpenEditorEvent = {
  name?: string;
  description?: string;
  strategyCategory?: 'bullish' | 'bearish' | 'neutral' | 'volatility';
  riskLevel?: 'low' | 'medium' | 'high';
  legs: ExternalLeg[];
};

type OpenEditorListener = (event: OpenEditorEvent) => void;
const openEditorListeners = new Set<OpenEditorListener>();

export function onOpenStrategyEditor(listener: OpenEditorListener): () => void {
  openEditorListeners.add(listener);
  return () => {
    openEditorListeners.delete(listener);
  };
}

export function emitOpenStrategyEditor(event: OpenEditorEvent) {
  for (const listener of Array.from(openEditorListeners)) {
    try {
      listener(event);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('OpenStrategyEditor listener error:', e);
    }
  }
}