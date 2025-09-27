import React from 'react';
import { ArrowUpCircle, ArrowDownCircle, DollarSign } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme } from '../../../lib/theme';

interface PortfolioPreviewProps {
  theme: Theme;
}

const DEMO_HOLDINGS = [
  {
    stock_code: 'AAPL',
    stock_name: 'Apple Inc.',
    current_price: 175.50,
    profit_loss_percentage: 3.08,
  },
  {
    stock_code: 'MSFT',
    stock_name: 'Microsoft Corporation',
    current_price: 338.20,
    profit_loss_percentage: 8.83,
  },
  {
    stock_code: 'NVDA',
    stock_name: 'NVIDIA Corporation',
    current_price: 445.75,
    profit_loss_percentage: 6.06,
  }
];

export function PortfolioPreview({ theme }: PortfolioPreviewProps) {
  const isDark = theme === 'dark';

  return (
    <div className="mb-16">
      <div className="flex justify-between items-center mb-8">
        <h2 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Track Your Portfolio Performance
        </h2>
        <InternalLink
          to="/journal?tab=portfolio"
          className={`text-blue-500 hover:text-blue-600 flex items-center gap-2 transition-colors`}
          title="Access detailed portfolio analytics and performance metrics"
        >
          <span>View Full Portfolio</span>
          <ArrowUpCircle className="w-5 h-5" />
        </InternalLink>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DEMO_HOLDINGS.map((holding) => (
          <div
            key={holding.stock_code}
            className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-6 border ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            } hover:bg-opacity-100 transition-colors duration-200 shadow-lg`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  {holding.stock_code}
                </h3>
                <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                  {holding.stock_name}
                </p>
              </div>
              {holding.profit_loss_percentage >= 0 ? (
                <ArrowUpCircle className="w-6 h-6 text-green-500" />
              ) : (
                <ArrowDownCircle className="w-6 h-6 text-red-500" />
              )}
            </div>
            <div className="flex justify-between items-baseline">
              <div className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                <DollarSign className="w-4 h-4 inline-block" />
                {holding.current_price.toFixed(2)}
              </div>
              <div className={`text-lg font-semibold ${
                holding.profit_loss_percentage >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}