import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../lib/types';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { Position } from './PositionManager';

interface CalculatorSummaryProps {
  theme: Theme;
  positions: Position[];
  currentPrice: number;
}

export function CalculatorSummary({ theme, positions, currentPrice }: CalculatorSummaryProps) {
  const { currencyConfig } = useCurrency();

  // 计算单个期权在特定股价下的盈亏
  const calculateOptionProfit = (position: Position, stockPrice: number): number => {
    const { type, action, strike, premium, quantity } = position;
    let intrinsicValue = 0;

    if (type === 'call') {
      intrinsicValue = Math.max(0, stockPrice - strike);
    } else {
      intrinsicValue = Math.max(0, strike - stockPrice);
    }

    const optionValue = intrinsicValue;
    const costBasis = premium;

    if (action === 'buy') {
      return (optionValue - costBasis) * quantity * 100;
    } else {
      return (costBasis - optionValue) * quantity * 100;
    }
  };

  // 计算组合总盈亏
  const calculateTotalProfit = (stockPrice: number): number => {
    return positions.reduce((total, position) => {
      return total + calculateOptionProfit(position, stockPrice);
    }, 0);
  };

  // 计算总成本
  const totalCost = positions.reduce((total, position) => {
    const cost = position.premium * position.quantity * 100;
    return total + (position.action === 'buy' ? cost : -cost);
  }, 0);

  // 计算当前盈亏
  const currentProfit = currentPrice > 0 ? calculateTotalProfit(currentPrice) : 0;

  // 计算最大风险和最大收益
  const calculateRiskReward = () => {
    if (positions.length === 0) return { maxRisk: 0, maxReward: 0 };

    const strikes = positions.map(p => p.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const priceRange = maxStrike - minStrike;
    const minPrice = Math.max(0, minStrike - priceRange * 0.5);
    const maxPrice = maxStrike + priceRange * 0.5;

    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    // 检查关键价格点
    const checkPrices = [
      0,
      minPrice,
      maxPrice,
      currentPrice,
      ...strikes,
      ...strikes.map(s => s * 0.8),
      ...strikes.map(s => s * 1.2)
    ].filter(p => p >= 0);

    checkPrices.forEach(price => {
      const profit = calculateTotalProfit(price);
      maxProfit = Math.max(maxProfit, profit);
      maxLoss = Math.min(maxLoss, profit);
    });

    return {
      maxRisk: maxLoss === Infinity ? 0 : Math.abs(maxLoss),
      maxReward: maxProfit === -Infinity ? 0 : maxProfit
    };
  };

  const { maxRisk, maxReward } = calculateRiskReward();

  if (positions.length === 0) {
    return (
      <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
        <p className={`${themes[theme].text} opacity-75`}>
          添加期权仓位后查看策略摘要
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
        策略摘要
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${themes[theme].background} rounded-lg p-4`}>
          <h4 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
            总成本
          </h4>
          <p className={`text-lg font-bold ${themes[theme].text} ${
            totalCost >= 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {formatCurrency(Math.abs(totalCost), currencyConfig)}
            <span className="text-sm font-normal ml-1">
              ({totalCost >= 0 ? '净支出' : '净收入'})
            </span>
          </p>
        </div>

        <div className={`${themes[theme].background} rounded-lg p-4`}>
          <h4 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
            当前盈亏
          </h4>
          <p className={`text-lg font-bold ${
            currentProfit >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {currentProfit >= 0 ? '+' : ''}{formatCurrency(currentProfit, currencyConfig)}
          </p>
          <p className={`text-xs ${themes[theme].text} opacity-60`}>
            基于当前股价 {formatCurrency(currentPrice, currencyConfig)}
          </p>
        </div>

        <div className={`${themes[theme].background} rounded-lg p-4`}>
          <h4 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
            最大风险
          </h4>
          <p className={`text-lg font-bold text-red-600`}>
            {formatCurrency(maxRisk, currencyConfig)}
          </p>
        </div>

        <div className={`${themes[theme].background} rounded-lg p-4`}>
          <h4 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
            最大收益
          </h4>
          <p className={`text-lg font-bold text-green-600`}>
            {maxReward === Infinity ? '无限' : formatCurrency(maxReward, currencyConfig)}
          </p>
        </div>
      </div>

      <div className={`${themes[theme].background} rounded-lg p-4`}>
        <h4 className={`text-sm font-medium ${themes[theme].text} opacity-75 mb-3`}>
          仓位详情
        </h4>
        <div className="space-y-2">
          {positions.map((position, index) => (
            <div key={position.id} className="flex justify-between items-center text-sm">
              <span className={themes[theme].text}>
                {position.action === 'buy' ? '买入' : '卖出'} {position.quantity} 手 {position.type.toUpperCase()} {position.strike}
              </span>
              <span className={`font-medium ${
                position.action === 'buy' ? 'text-red-600' : 'text-green-600'
              }`}>
                {position.action === 'buy' ? '-' : '+'}{formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}