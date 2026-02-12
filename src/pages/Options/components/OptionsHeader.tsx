import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import { useOptionPriceWebSocketContext } from '../../../features/options/context/OptionPriceWebSocketContext';

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
  const { isConnected, connect } = useOptionPriceWebSocketContext();
  const [inputValue, setInputValue] = React.useState(selectedSymbol);

  React.useEffect(() => {
    setInputValue(selectedSymbol);
  }, [selectedSymbol]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSymbolChange(inputValue);
    }
  };

  const handleBlur = () => {
    if (inputValue !== selectedSymbol) {
      onSymbolChange(inputValue);
    }
  };

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
        
        <div className="flex items-center gap-4">
          <div 
            onClick={connect}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-colors border ${
              isConnected 
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' 
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
            }`}
            title={isConnected ? '已连接 (点击重连)' : '未连接 (点击连接)'}
          >
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-medium hidden sm:inline">
              {isConnected ? '实时行情' : '连接断开'}
            </span>
          </div>

          {(activeTab === 'data' || activeTab === 'portfolio') && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  Symbol:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="available-symbols"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    disabled={isLoading}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
                      isLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    placeholder="Enter symbol..."
                  />
                  <datalist id="available-symbols">
                    {availableSymbols.map(symbol => (
                      <option key={symbol} value={symbol} />
                    ))}
                  </datalist>
                </div>
              </div>
              {isLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}