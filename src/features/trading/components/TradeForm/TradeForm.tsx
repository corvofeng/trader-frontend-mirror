import React, { useState, useEffect } from 'react';
import { PlusCircle, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService, tradeService } from '../../../../lib/services';
import { Theme, themes } from '../../../../lib/theme';
import { useCurrency } from '../../../../lib/context/CurrencyContext';
import type { Stock } from '../../../../lib/services/types';
import { formatCurrency } from '../../../../shared/utils/format';
import {
  JOURNAL_ACCOUNT_STORAGE,
  resolveCurrentAccountAlias,
} from '../../../../shared/utils/accountSelection';
import { StockConfigEditor } from '../StockConfigEditor';

interface TradeFormProps {
  selectedStock: Stock | null;
  theme: Theme;
  accountAlias?: string | null;
  preferredTargetPrice?: number | null;
}

export function TradeForm({ selectedStock, theme, accountAlias, preferredTargetPrice }: TradeFormProps) {
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [operation, setOperation] = useState<'buy' | 'sell' | null>(null);
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

  useEffect(() => {
    if (typeof preferredTargetPrice !== 'number' || !Number.isFinite(preferredTargetPrice)) return;
    setTargetPrice(preferredTargetPrice.toFixed(4));
  }, [preferredTargetPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!operation) {
      toast.error('Please choose Buy or Sell');
      return;
    }
    
    try {
      const authResponse = await authService.getUser();
      const user = authResponse.data?.user ?? null;
      
      if (!user) {
        toast.error('Please sign in to add trades');
        return;
      }

      let targetAccountAlias = accountAlias;
      
      if (!targetAccountAlias) {
        targetAccountAlias = resolveCurrentAccountAlias({ storage: JOURNAL_ACCOUNT_STORAGE });
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

  const parsedTargetPrice = Number.parseFloat(targetPrice);
  const parsedQuantity = Number.parseInt(quantity || '0', 10);
  const totalValue = parsedTargetPrice * parsedQuantity;
  const formattedQuantity = Number.isFinite(parsedQuantity)
    ? new Intl.NumberFormat().format(parsedQuantity)
    : '0';
  const displayAccountAlias = accountAlias || resolveCurrentAccountAlias({ storage: JOURNAL_ACCOUNT_STORAGE });
  const stockLabel = stockCode.trim().toUpperCase() || stockName.trim() || 'this stock';
  const shareLabel = parsedQuantity === 1 ? 'share' : 'shares';
  const operationLabel = operation === 'buy' ? 'Buy' : operation === 'sell' ? 'Sell' : null;
  const pricePreview = Number.isFinite(parsedTargetPrice)
    ? formatCurrency(parsedTargetPrice, currencyConfig)
    : '-';
  const inputClasses = `mt-1 block w-full rounded-md shadow-sm text-sm sm:text-base focus:border-blue-500 focus:ring-blue-500 ${themes[theme].input} ${themes[theme].text}`;
  const hasTargetPrice = targetPrice.trim().length > 0;
  const operationButtonBaseClass = 'inline-flex min-h-[42px] w-full items-center justify-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors border';
  const buyButtonClass = operation === 'buy'
    ? 'border-green-600 bg-green-600 text-white'
    : `${themes[theme].border} ${themes[theme].text} hover:border-green-500 hover:text-green-600`;
  const sellButtonClass = operation === 'sell'
    ? 'border-red-600 bg-red-600 text-white'
    : `${themes[theme].border} ${themes[theme].text} hover:border-red-500 hover:text-red-600`;

  return (
    <div className="space-y-6">
      {showConfigEditor && selectedStock ? (
        <StockConfigEditor
          stockCode={selectedStock.stock_code}
          theme={theme}
          onClose={() => setShowConfigEditor(false)}
        />
      ) : (
        <form onSubmit={handleSubmit} className={`${themes[theme].card} rounded-lg p-4 shadow-md transition-colors duration-200 sm:p-6`}>
          <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 className={`text-xl font-bold leading-tight sm:text-2xl ${themes[theme].text}`}>Add New Trade Plan</h2>
            {selectedStock && (
              <button
                type="button"
                onClick={() => setShowConfigEditor(true)}
                className={`inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-sm sm:w-auto ${themes[theme].secondary}`}
              >
                <Settings className="w-5 h-5 mr-2" />
                Configure Stock
              </button>
            )}
          </div>
          
          <div className="grid gap-4 sm:gap-6">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2 xl:col-span-1">
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Operation</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOperation('buy')}
                    disabled={!hasTargetPrice}
                    aria-pressed={operation === 'buy'}
                    className={`${operationButtonBaseClass} ${buyButtonClass} ${!hasTargetPrice ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperation('sell')}
                    disabled={!hasTargetPrice}
                    aria-pressed={operation === 'sell'}
                    className={`${operationButtonBaseClass} ${sellButtonClass} ${!hasTargetPrice ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Sell
                  </button>
                </div>
                <p className={`mt-2 text-xs ${themes[theme].text} opacity-70`}>
                  {hasTargetPrice ? 'Set Buy or Sell manually.' : 'Enter target price first, then choose Buy or Sell.'}
                </p>
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
              <div className={`rounded-md border border-gray-200 p-3 dark:border-gray-700 ${themes[theme].secondary} bg-opacity-50 sm:p-4`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <div className={`text-sm font-medium ${themes[theme].text} opacity-80`}>Estimated Exchange</div>
                    <p className={`mt-1 text-xs ${themes[theme].text} opacity-70`}>
                      {operation
                        ? operation === 'buy'
                          ? 'Spend cash to receive shares.'
                          : 'Spend shares to receive cash.'
                        : 'Choose Buy or Sell to see what you spend and receive.'}
                    </p>
                    {operation && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] sm:text-xs">
                        <span className={`rounded-full px-2 py-1 ${themes[theme].card} ${themes[theme].text} opacity-80`}>
                          {`Acct ${displayAccountAlias || 'Unassigned'}`}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${themes[theme].card} ${themes[theme].text} opacity-80`}>
                          {operationLabel}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${themes[theme].card} ${themes[theme].text} opacity-80`}>
                          {`${formattedQuantity} ${shareLabel}`}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${themes[theme].card} ${themes[theme].text} opacity-80 break-all`}>
                          {stockLabel}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${themes[theme].card} ${themes[theme].text} opacity-80`}>
                          {pricePreview}
                        </span>
                      </div>
                    )}
                  </div>
                  {operation && (
                    <span className={`text-lg font-bold leading-none sm:text-xl ${themes[theme].text}`}>
                      {formatCurrency(totalValue, currencyConfig)}
                    </span>
                  )}
                </div>
                {operation && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:gap-3 sm:grid-cols-2">
                    <div className={`rounded-md border border-gray-200 p-3 dark:border-gray-700 ${themes[theme].card}`}>
                      <div className={`text-xs uppercase tracking-wide ${themes[theme].text} opacity-60`}>Spend</div>
                      <div className={`mt-1 text-base font-semibold ${themes[theme].text}`}>
                        {operation === 'buy'
                          ? formatCurrency(totalValue, currencyConfig)
                          : `${formattedQuantity} shares`}
                      </div>
                    </div>
                    <div className={`rounded-md border border-gray-200 p-3 dark:border-gray-700 ${themes[theme].card}`}>
                      <div className={`text-xs uppercase tracking-wide ${themes[theme].text} opacity-60`}>Receive</div>
                      <div className={`mt-1 text-base font-semibold ${themes[theme].text}`}>
                        {operation === 'buy'
                          ? `${formattedQuantity} shares`
                          : formatCurrency(totalValue, currencyConfig)}
                      </div>
                    </div>
                  </div>
                )}
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

            <div className="flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-center self-start">
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

              <div className="flex w-full items-center gap-3 sm:w-auto">
                <button
                  type="submit"
                  className={`inline-flex w-full items-center justify-center rounded-md border border-transparent bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto`}
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
