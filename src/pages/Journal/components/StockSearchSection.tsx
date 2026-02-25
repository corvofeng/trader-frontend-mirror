import React, { useEffect, useMemo, useState } from 'react';
import { StockSearch } from '../../../features/trading';
import type { Stock, StockConfig } from '../../../lib/services/types';
import { stockConfigService, stockService } from '../../../lib/services';
import toast from 'react-hot-toast';

interface StockSearchSectionProps {
  portfolioUuid: string | null;
  onStockSelect: (stock: Stock) => void;
  selectedStockCode?: string;
}

export function StockSearchSection({ 
  portfolioUuid, 
  onStockSelect, 
  selectedStockCode 
}: StockSearchSectionProps) {
  const [stockConfigs, setStockConfigs] = useState<StockConfig[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (portfolioUuid) {
      return;
    }

    const fetchConfigs = async () => {
      try {
        const { data, error } = await stockConfigService.getStockConfigs();
        if (error) {
          throw error;
        }
        if (data) {
          setStockConfigs(data);
        }
      } catch (error) {
        console.error('Failed to fetch stock configs:', error);
        toast.error('Failed to load stock categories');
      } finally {
        setIsLoadingConfigs(false);
      }
    };

    fetchConfigs();
  }, [portfolioUuid]);

  const groupedConfigs = useMemo(() => {
    const map = new Map<string, StockConfig[]>();
    stockConfigs.forEach(config => {
      const category = config.category || 'Other';
      if (!map.has(category)) {
        map.set(category, []);
      }
      map.get(category)!.push(config);
    });
    return Array.from(map.entries());
  }, [stockConfigs]);

  const handleCategorySelect = async (stockCode: string) => {
    if (!stockCode) {
      return;
    }

    const normalizedCode = stockCode.toUpperCase();
    setIsSelecting(true);

    try {
      const { data: stockPrice, error } = await stockService.getCurrentPrice(normalizedCode);
      if (error) {
        throw error;
      }

      let selectedStock: Stock;

      if (stockPrice) {
        selectedStock = {
          stock_code: stockPrice.stock_code,
          stock_name: stockPrice.stock_name,
          price: stockPrice.price
        };

        const priceMsg = selectedStock.price != null ? `\nCurrent price: $${selectedStock.price.toFixed(2)}` : '';
        toast.success(
          `${selectedStock.stock_code} (${selectedStock.stock_name})${priceMsg}`,
          { duration: 3000 }
        );
      } else {
        selectedStock = {
          stock_code: normalizedCode,
          stock_name: normalizedCode
        };
      }

      const savedStocks = localStorage.getItem('searchedStocks');
      const existingStocks: Stock[] = savedStocks ? JSON.parse(savedStocks) : [];
      const existingIndex = existingStocks.findIndex(s => s.stock_code === selectedStock.stock_code);

      if (existingIndex >= 0) {
        existingStocks[existingIndex] = selectedStock;
      } else {
        existingStocks.push(selectedStock);
      }

      localStorage.setItem('searchedStocks', JSON.stringify(existingStocks));
      onStockSelect(selectedStock);
    } catch (error) {
      console.error('Error fetching stock price:', error);
      toast.error(`Could not fetch price for ${normalizedCode}`);

      const fallbackStock: Stock = {
        stock_code: normalizedCode,
        stock_name: normalizedCode
      };

      const savedStocks = localStorage.getItem('searchedStocks');
      const existingStocks: Stock[] = savedStocks ? JSON.parse(savedStocks) : [];
      const existingIndex = existingStocks.findIndex(s => s.stock_code === fallbackStock.stock_code);

      if (existingIndex >= 0) {
        existingStocks[existingIndex] = fallbackStock;
      } else {
        existingStocks.push(fallbackStock);
      }

      localStorage.setItem('searchedStocks', JSON.stringify(existingStocks));
      onStockSelect(fallbackStock);
    } finally {
      setIsSelecting(false);
    }
  };

  if (portfolioUuid) {
    return null;
  }

  return (
    <div className="w-full space-y-3">
      <StockSearch
        onSelect={onStockSelect}
        selectedStockCode={selectedStockCode}
      />

      {!isLoadingConfigs && groupedConfigs.length > 0 && (
        <div className="flex flex-col gap-3">
          {groupedConfigs.map(([category, configs]) => (
            <div key={category} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {category}
              </div>
              <div className="flex flex-wrap gap-2">
                {configs.map(config => (
                  <button
                    key={config.stock_code}
                    type="button"
                    onClick={() => handleCategorySelect(config.stock_code)}
                    disabled={isSelecting}
                    className="px-3 py-1 rounded-full border text-xs border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {config.stock_code}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoadingConfigs && (
        <div className="text-xs text-gray-400">
          Loading stock categories...
        </div>
      )}
    </div>
  );
}
