import React, { useState, useEffect } from 'react';
import { PlusCircle, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService, tradeService } from '../../../../lib/services';
import { Theme, themes } from '../../../../lib/theme';
import { useCurrency } from '../../../../lib/context/CurrencyContext';
import type { Stock } from '../../../../lib/services/types';
import { formatCurrency } from '../../../../shared/utils/format';
import { StockConfigEditor } from '../StockConfigEditor';

interface TradeFormProps {
  selectedStock: Stock | null;
  theme: Theme;
  accountAlias?: string | null;
}

export function TradeForm({ selectedStock, theme, accountAlias }: TradeFormProps) {
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [operation, setOperation] = useState<'buy' | 'sell'>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [executeImmediately, setExecuteImmediately] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const { currencyConfig } = useCurrency();

  useEffect(() => {
    if (selectedStock) {
      setStockCode(selectedStock.stock_code);
      setStockName(selectedStock.stock_name || selectedStock.stock_code);
      if (selectedStock.price) {
        setTargetPrice(selectedStock.price.toFixed(2));
      }
    }
  }, [selectedStock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await authService.getUser();
      
      if (!user) {
        toast.error('Please sign in to add trades');
        return;
      }

      let targetAccountAlias = accountAlias;
      
      if (!targetAccountAlias) {
        try {
          targetAccountAlias =
            localStorage.getItem('journalSelectedAccountAlias') ||
            localStorage.getItem('journalAccountId') ||
            localStorage.getItem('selectedAccountAlias');
        } catch {
          targetAccountAlias = null;
        }
      }

      const { error } = await tradeService.createTrade({
        user_id: user.id,
        account_alias: targetAccountAlias || undefined,
        stock_code: stockCode.toUpperCase(),
        stock_name: stockName,
        operation,
        target_price: parseFloat(targetPrice),
        quantity: parseInt(quantity),
        notes,
        status: 'pending',
        execute_immediately: executeImmediately
      });

      if (error) throw error;

      toast.success('Trade plan added successfully!');
      setQuantity('');
      setNotes('');
      setExecuteImmediately(false);
      if (!selectedStock) {
        setStockCode('');
        setStockName('');
        setTargetPrice('');
      }
    } catch (error) {
      toast.error('Failed to add trade plan');
      console.error(error);
    }
  };

  const totalValue = parseFloat(targetPrice) * parseInt(quantity || '0');
  const inputClasses = `mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${themes[theme].input} ${themes[theme].text}`;

  return (
    <div className="space-y-6">
      {showConfigEditor && selectedStock ? (
        <StockConfigEditor
          stockCode={selectedStock.stock_code}
          theme={theme}
          onClose={() => setShowConfigEditor(false)}
        />
      ) : (
        <form onSubmit={handleSubmit} className={`${themes[theme].card} p-6 rounded-lg shadow-md transition-colors duration-200`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${themes[theme].text}`}>Add New Trade Plan</h2>
            {selectedStock && (
              <button
                type="button"
                onClick={() => setShowConfigEditor(true)}
                className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
              >
                <Settings className="w-5 h-5 mr-2" />
                Configure Stock
              </button>
            )}
          </div>
          
          <div className="grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Stock Code</label>
                <input
                  type="text"
                  value={stockCode}
                  onChange={(e) => setStockCode(e.target.value)}
                  className={inputClasses}
                  placeholder="AAPL"
                  required
                  readOnly={!!selectedStock}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Stock Name</label>
                <input
                  type="text"
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  className={inputClasses}
                  placeholder="Enter stock name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Operation</label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as 'buy' | 'sell')}
                  className={inputClasses}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Target Price</label>
                <div className="relative">
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className={`${inputClasses} pl-8`}
                    step="0.01"
                    required
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    {currencyConfig.symbol}
                  </span>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClasses}
                  required
                />
              </div>
            </div>

            {targetPrice && quantity && (
              <div className={`p-4 rounded-md ${themes[theme].secondary} bg-opacity-50 border border-gray-200 dark:border-gray-700`}>
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-medium ${themes[theme].text} opacity-80`}>Estimated Total Value</span>
                  <span className={`text-xl font-bold ${themes[theme].text}`}>
                    {formatCurrency(totalValue, currencyConfig)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className={`block text-sm font-medium ${themes[theme].text}`}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClasses}
                rows={3}
                placeholder="Add any notes about this trade plan..."
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <input
                  id="execute-immediately"
                  type="checkbox"
                  checked={executeImmediately}
                  onChange={(e) => setExecuteImmediately(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="execute-immediately" className={`ml-2 block text-sm ${themes[theme].text}`}>
                  Execute Immediately
                </label>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {accountAlias && (
                  <span className={`text-sm ${themes[theme].text} opacity-70 hidden sm:inline`}>
                    to <span className="font-medium text-blue-500">{accountAlias}</span>
                  </span>
                )}
                <button
                  type="submit"
                  className={`w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-all duration-200`}
                >
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Add Plan
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
