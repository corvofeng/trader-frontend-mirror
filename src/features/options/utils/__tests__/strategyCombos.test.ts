import { describe, it, expect } from 'vitest';
import type { OptionsStrategy, OptionsPosition } from '../../../../lib/services/types';
import { computeCombosForPositions } from '../strategyCombos';

const makeLeg = (over: Partial<OptionsPosition>): OptionsPosition => ({
  id: 'leg', symbol: 'SYM', strategy: 'S', type: 'call', position_type: 'buy', strike: 100, expiry: '2025-01-01', quantity: 1, premium: 1, currentValue: 1, profitLoss: 0, profitLossPercentage: 0, impliedVolatility: 0, delta: 0, gamma: 0, theta: 0, vega: 0, status: 'open', openDate: '2024-01-01', ...over,
});

describe('computeCombosForPositions', () => {
  it('uses strategy.strike when available', () => {
    const strategy: OptionsStrategy = {
      id: 's1', name: '认购牛市价差策略', description: '', category: 'neutral', riskLevel: 'low', positions: [
        makeLeg({ type: 'call', contract_strike_price: 120, position_type: 'buy', leg_quantity: 2 }),
        makeLeg({ type: 'call', contract_strike_price: 125, position_type: 'sell', leg_quantity: 2 })
      ], totalCost: 0, currentValue: 0, profitLoss: 0, profitLossPercentage: 0, maxRisk: 0, maxReward: 0,
      // @ts-expect-error runtime extra field
      strike: 120,
    };
    const map = computeCombosForPositions(strategy, 'call');
    expect(map.get(120)).toBe(2);
  });

  it('falls back to legs strike aggregation when no strategy.strike', () => {
    const strategy: OptionsStrategy = {
      id: 's2', name: '认沽熊市价差策略', description: '', category: 'neutral', riskLevel: 'low', positions: [
        makeLeg({ type: 'put', position_type: 'buy', leg_quantity: 3, strike: 90 }),
        makeLeg({ type: 'put', position_type: 'sell', leg_quantity: 3, strike: 95 }),
      ], totalCost: 0, currentValue: 0, profitLoss: 0, profitLossPercentage: 0, maxRisk: 0, maxReward: 0,
    };
    const map = computeCombosForPositions(strategy, 'put');
    expect(map.get(90)).toBe(3);
    // expect(map.get(95)).toBe(3);
  });

  it('supports contract_type_zh and contract_strike_price fields', () => {
    const strategy: OptionsStrategy = {
      id: 's3', name: '认购牛市价差策略', description: '', category: 'neutral', riskLevel: 'low', positions: [
        makeLeg({ contract_type_zh: 'call', position_type: 'buy', leg_quantity: 2, contract_strike_price: 150 }),
        makeLeg({ contract_type_zh: 'call', position_type: 'sell', leg_quantity: 2, contract_strike_price: 150 }),
      ], totalCost: 0, currentValue: 0, profitLoss: 0, profitLossPercentage: 0, maxRisk: 0, maxReward: 0,
      // @ts-expect-error runtime extra field
      strike: 150,
    };
    const map = computeCombosForPositions(strategy, 'call');
    expect(map.get(150)).toBe(2);
  });
});