import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Plus, Calendar, Target, DollarSign, FileText } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/constants/currency';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface OptionsTradePlansProps {
  theme: Theme;
  selectedSymbol: string;
}

interface OptionsTradePlan {
  id: string;
  symbol: string;
  strategy: string;
  type: 'call' | 'put' | 'spread';
  strike: number;
  expiry: string;
  targetPrice: number;
  stopLoss?: number;
  quantity: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  notes: string;
  createdAt: string;
}

// Mock data for demonstration
const MOCK_TRADE_PLANS: OptionsTradePlan[] = [
  {
    id: '1',
    symbol: 'SPY',
    strategy: 'Long Call',
    type: 'call',
    strike: 450,
    expiry: '2024-03-15',
    targetPrice: 8.00,
    stopLoss: 3.00,
    quantity: 5,
    status: 'pending',
    notes: '看好市场短期上涨，买入看涨期权',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    symbol: 'QQQ',
    strategy: 'Protective Put',
    type: 'put',
    strike: 380,
    expiry: '2024-02-16',
    targetPrice: 6.50,
    quantity: 10,
    status: 'active',
    notes: '为现有QQQ持仓购买保护性看跌期权',
    createdAt: '2024-01-10T14:20:00Z'
  },
  {
    id: '3',
    symbol: 'AAPL',
    strategy: 'Bull Call Spread',
    type: 'spread',
    strike: 175,
    expiry: '2024-04-19',
    targetPrice: 2.50,
    stopLoss: 1.00,
    quantity: 8,
    status: 'completed',
    notes: '牛市看涨价差策略，限制风险和收益',
    createdAt: '2024-01-05T09:15:00Z'
  }
];

export function OptionsTradePlans({ theme, selectedSymbol }: OptionsTradePlansProps) {
  const [tradePlans] = useState<OptionsTradePlan[]>(MOCK_TRADE_PLANS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'completed' | 'cancelled'>('all');
  const { currencyConfig } = useCurrency();

  const filteredPlans = tradePlans.filter(plan => 
    filter === 'all' || plan.status === filter
  );

  const getStatusColor = (status: OptionsTradePlan['status']) => {
    switch (status) {
      case 'pending':
        return theme === 'dark' 
          ? 'bg-yellow-900 text-yellow-100' 
          : 'bg-yellow-100 text-yellow-800';
      case 'active':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'completed':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'cancelled':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsTradePlan['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
        return <Target className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-blue-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                Options Trade Plans
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Plan
              </button>
            </div>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="p-6 border-b border-gray-200">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
                Create New Trade Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Symbol
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedSymbol}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="SPY"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Strategy
                  </label>
                  <select className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="long_call">Long Call</option>
                    <option value="long_put">Long Put</option>
                    <option value="covered_call">Covered Call</option>
                    <option value="protective_put">Protective Put</option>
                    <option value="bull_call_spread">Bull Call Spread</option>
                    <option value="bear_put_spread">Bear Put Spread</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Strike Price
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="450"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Target Price
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="8.00"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                    placeholder="5"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>
                  Notes
                </label>
                <textarea
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  rows={3}
                  placeholder="Enter your trading strategy notes..."
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowAddForm(false)}
                  className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
                >
                  Cancel
                </button>
                <button className={`px-4 py-2 rounded-md ${themes[theme].primary}`}>
                  Create Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trade Plans List */}
        <div className="p-6">
          <div className="space-y-4">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    {getTypeIcon(plan.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                          {plan.symbol} {plan.strike} {plan.type.toUpperCase()}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                          {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                        </span>
                      </div>
                      <p className={`text-sm ${themes[theme].text} opacity-75`}>
                        {plan.strategy} • Exp: {new Date(plan.expiry).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm ${themes[theme].text} opacity-75`}>
                      Created: {new Date(plan.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Target Price</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {formatCurrency(plan.targetPrice, currencyConfig)}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Stop Loss</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {plan.stopLoss ? formatCurrency(plan.stopLoss, currencyConfig) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Quantity</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {plan.quantity} contracts
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themes[theme].text} opacity-75`}>Total Value</p>
                    <p className={`text-sm font-medium ${themes[theme].text}`}>
                      {formatCurrency(plan.targetPrice * plan.quantity * 100, currencyConfig)}
                    </p>
                  </div>
                </div>

                {plan.notes && (
                  <div className={`${themes[theme].card} rounded-lg p-3 mt-3`}>
                    <p className={`text-sm ${themes[theme].text}`}>{plan.notes}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-3">
                  {plan.status === 'pending' && (
                    <>
                      <button className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}>
                        Edit
                      </button>
                      <button className={`px-3 py-1 rounded-md text-sm bg-green-600 text-white hover:bg-green-700`}>
                        Execute
                      </button>
                    </>
                  )}
                  {plan.status === 'active' && (
                    <button className={`px-3 py-1 rounded-md text-sm bg-red-600 text-white hover:bg-red-700`}>
                      Close Position
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredPlans.length === 0 && (
              <div className="text-center py-12">
                <FileText className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
                <p className={`text-lg font-medium ${themes[theme].text}`}>No trade plans found</p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  {filter === 'all' 
                    ? 'Create your first options trade plan'
                    : `No ${filter} trade plans found`
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}