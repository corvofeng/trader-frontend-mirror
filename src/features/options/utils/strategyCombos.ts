import type { OptionsPosition, OptionsStrategy } from '../../../lib/services/types';

export type ComboMap = Map<number, number>;

/**
 * 计算指定策略在给定类型（call/put）下，各行权价的组合数量。
 * 输入：策略对象，类型标识
 * 输出：key 为行权价，value 为组合数（数量之和）
 * 
 *  该统计只计算认购牛市价差策略和认沽熊市价差策略
 * 
 */
export const computeCombosForPositions = (strategy: OptionsStrategy, type: 'call' | 'put'): ComboMap => {
  if (!strategy.name.includes('认购牛市价差策略') && !strategy.name.includes('认沽熊市价差策略')) {
    return new Map();
  }
  if (strategy.positions[0].type !== type) {
    return new Map();
  }

  const combosByStrike: ComboMap = new Map();
  for (const p of strategy.positions) {
    if (p.position_type === 'buy') { // 仅计算权利仓
      combosByStrike.set(Number(p.contract_strike_price ?? p.strike), Number(p.leg_quantity ?? p.selectedQuantity ?? p.quantity));
      break;
    }
  }
  return combosByStrike;
};