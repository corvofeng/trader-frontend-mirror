import type { Trade } from '../../lib/services/types';

/**
 * Determines whether an operation string represents a 'buy' action.
 * Handles variations like 'buy', 'stock_buy', 'BUY', 'STOCK_BUY', 'option_buy', '买入', '限价买入', '开多', etc.
 */
export function isBuyOperation(operation: string | undefined | null): boolean {
  if (!operation) return false;
  const op = String(operation).trim().toLowerCase();
  return op.includes('buy') || op.includes('买') || op.includes('开多');
}

/**
 * Determines whether an operation string represents a 'sell' action.
 * Handles variations like 'sell', 'stock_sell', 'SELL', 'STOCK_SELL', 'option_sell', '卖出', '限价卖出', '平多', etc.
 */
export function isSellOperation(operation: string | undefined | null): boolean {
  if (!operation) return false;
  const op = String(operation).trim().toLowerCase();
  return op.includes('sell') || op.includes('卖') || op.includes('平多');
}

/**
 * Normalizes operation string into standard 'buy' | 'sell'.
 * Defaults to 'buy' if unrecognized or buy-like.
 */
export function normalizeTradeOperation(operation: string | undefined | null): 'buy' | 'sell' {
  if (isSellOperation(operation)) {
    return 'sell';
  }
  return 'buy';
}

/**
 * Normalizes a Trade object received from the backend API or other sources:
 * - Standardizes `operation` to 'buy' | 'sell'
 * - Cleans `updated_at` so that null, empty, invalid date, or Unix epoch 1970 becomes null
 */
export function normalizeTrade(raw: any): Trade {
  if (!raw || typeof raw !== 'object') return raw;

  let updatedAt: string | null = null;
  if (typeof raw.updated_at === 'string' && raw.updated_at.trim().length > 0) {
    const d = new Date(raw.updated_at);
    // Ignore invalid dates or epoch timestamp (1970)
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1970) {
      updatedAt = raw.updated_at;
    }
  }

  return {
    ...raw,
    operation: normalizeTradeOperation(raw.operation),
    updated_at: updatedAt,
  };
}
