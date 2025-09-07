import React, { useState, useEffect } from 'react';
import { PlusCircle, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService, tradeService } from '../../../../../lib/services';
import { Theme, themes } from '../../../../../lib/theme';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import type { Stock } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../shared/constants/currency';
import { StockChart } from './StockChart';
import { StockConfigEditor } from './StockConfigEditor';

interface TradeFormProps {
  selectedStock: Stock | null;
  theme: Theme;
}

export function TradeForm({ selectedStock, theme }: TradeFormProps) {
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [operation, setOperation] = useState<'buy' | 'sell'>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
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

      const { error } = await tradeService.createTrade({
        user_id: user.id,
        stock_code: stockCode.toUpperCase(),
        stock_name: stockName,
        operation,
        target_price: parseFloat(targetPrice),
        quantity: parseInt(quantity),
        notes,
        status: 'pending'
      });

      if (error) throw error;

      toast.success('Trade plan added successfully!');
      setQuantity('');
      setNotes('');
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
      <StockChart stockCode={selectedStock?.stock_code} theme={theme} />
      
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
          
          <div className="grid gap-4">
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
              <div className="mt-2">
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

            {targetPrice && quantity && (
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text}`}>Total Value</label>
                <p className={`text-lg font-medium ${themes[theme].text}`}>
                  {formatCurrency(totalValue, currencyConfig)}
                </p>
              </div>
            )}

            <div>
              <label className={`block text-sm font-medium ${themes[theme].text}`}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClasses}
                rows={3}
              />
            </div>

            <button
              type="submit"
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].primary} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Add Trade Plan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}