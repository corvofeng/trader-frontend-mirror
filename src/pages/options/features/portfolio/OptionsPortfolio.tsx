import React, { useState } from 'react';
import { Briefcase, Plus, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import { formatCurrency } from '../../../../lib/types';
import { useCurrency } from '../../../../lib/context/CurrencyContext';

interface OptionsPortfolioProps {
  theme: Theme;
}

interface OptionsPosition {
  id: string;
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  quantity: number;
  premium: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
}

// Mock data for demonstration
const MOCK_OPTIONS_POSITIONS: OptionsPosition[] = [
  {
    id: '1',
    symbol: 'SPY',
    type: 'call',
    strike: 450,
    expiry: '2024-03-15',
    quantity: 10,
    premium: 5.50,
    currentValue: 7.20,
    profitLoss: 1700,
    profitLossPercentage: 30.91
  },
  {
    id: '2',
    symbol: 'QQQ',
    type: 'put',
    strike: 380,
    expiry: '2024-02-16',
    quantity: 5,
    premium: 8.30,
    currentValue: 6.10,
    profitLoss: -1100,
    profitLossPercentage: -26.51
  },
  {
    id: '3',
    symbol: 'AAPL',
    type: 'call',
    strike: 180,
    expiry: '2024-04-19',
    quantity: 15,
    premium: 3.20,
    currentValue: 4.80,
    profitLoss: 2400,
    profitLossPercentage: 50.00
  }
];

export function OptionsPortfolio({ theme }: OptionsPortfolioProps) {
  const [positions] = useState<OptionsPosition[]>(MOCK_OPTIONS_POSITIONS);
  const { currencyConfig } = useCurrency();

  const totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue * pos.quantity * 100), 0);
  const totalCost = positions.reduce((sum, pos) => sum + (pos.premium * pos.quantity * 100), 0);
  const totalProfitLoss = positions.reduce((sum, pos) => sum + pos.profitLoss, 0);
  const totalProfitLossPercentage = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <Briefcase className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              Options Portfolio Overview
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总持仓价值</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(totalValue, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总成本</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(totalCost, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总盈亏</h3>
              <p className={`text-2xl font-bold mt-1 ${totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalProfitLoss), currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总收益率</h3>
              <p className={`text-2xl font-bold mt-1 ${totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalProfitLossPercentage >= 0 ? '+' : ''}{totalProfitLossPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Positions List */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              Current Positions ({positions.length})
            </h3>
            <button className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}>
              <Plus className="w-4 h-4 mr-2" />
              Add Position
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${themes[theme].background}`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    Contract
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    Quantity
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    Premium
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    Current
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    P/L
                  </th>
                  <th className={`px-6 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>
                    P/L %
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${themes[theme].border}`}>
                {positions.map((position) => (
                  <tr key={position.id} className={themes[theme].cardHover}>
                    <td className="px-6 py-4">
                      <div>
                        <div className={`text-sm font-medium ${themes[theme].text} flex items-center gap-2`}>
                          {position.symbol} {position.strike} {position.type.toUpperCase()}
                          {position.type === 'call' ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        <div className={`text-sm ${themes[theme].text} opacity-75`}>
                          Exp: {new Date(position.expiry).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                      {position.quantity}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                      {formatCurrency(position.premium, currencyConfig)}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${themes[theme].text}`}>
                      {formatCurrency(position.currentValue, currencyConfig)}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm font-medium ${
                      position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm font-medium ${
                      position.profitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {positions.length === 0 && (
            <div className="text-center py-12">
              <Briefcase className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>No options positions</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                Start by adding your first options position
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}