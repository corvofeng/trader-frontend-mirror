import React from 'react';
import { Theme, themes } from '../../../lib/theme';

interface OptionsHeaderProps {
  theme: Theme;
  selectedSymbol: string;
  availableSymbols: string[];
  isLoading: boolean;
  onSymbolChange: (symbol: string) => void;
  activeTab: string;
}

export function OptionsHeader({ 
  theme, 
  selectedSymbol, 
  availableSymbols, 
  isLoading, 
  onSymbolChange,
  activeTab
}: OptionsHeaderProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
            Options Trading Analysis
          </h1>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
            Advanced options analysis and trading tools
          </p>
        </div>
        {activeTab === 'data' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>
                Symbol:
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => onSymbolChange(e.target.value)}
                disabled={isLoading}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {availableSymbols.map(symbol => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
            {isLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}