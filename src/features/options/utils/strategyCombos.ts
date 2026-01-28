import type { OptionsStrategy } from '../../../lib/services/types';

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
  
  // 扩展支持的策略名称列表
  const supportedStrategies = [
    '认购牛市价差策略', 
    '认沽熊市价差策略',
    '牛市看涨价差',
    '熊市看涨价差',
    '牛市看跌价差',
    '熊市看跌价差',
    '认沽熊市价差',
    '认购牛市价差',
  ];

  const isSupported = supportedStrategies.some(s => strategy.name.includes(s));

  if (!isSupported) {
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
