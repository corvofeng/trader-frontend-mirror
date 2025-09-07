import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { stockService } from '../../../lib/services';
import type { Stock } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface StockSearchProps {
  onSelect: (stock: Stock) => void;
  selectedStockCode?: string;
}

export function StockSearch({ onSelect, selectedStockCode }: StockSearchProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load stocks from localStorage on mount
  useEffect(() => {
    const savedStocks = localStorage.getItem('searchedStocks');
    const initialStocks = savedStocks ? JSON.parse(savedStocks) : [];
    setStocks(initialStocks);
    setFilteredStocks(initialStocks);

    // Then fetch additional stocks
    stockService.getStocks().then(({ data }) => {
      if (data) {
        const combinedStocks = [...initialStocks];
        data.forEach(newStock => {
          if (!combinedStocks.some(s => s.stock_code === newStock.stock_code)) {
            combinedStocks.push(newStock);
          }
        });
        setStocks(combinedStocks);
        setFilteredStocks(combinedStocks);
        localStorage.setItem('searchedStocks', JSON.stringify(combinedStocks));
      }
    });
  }, []);

  useEffect(() => {
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      const filtered = stocks.filter(stock => 
        stock.stock_code.toLowerCase().includes(searchTerm) ||
        stock.stock_name.toLowerCase().includes(searchTerm)
      );
      setFilteredStocks(filtered);
    } else {
      setFilteredStocks(stocks);
    }
  }, [search, stocks]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const saveStockToLocalStorage = (stock: Stock) => {
    const updatedStocks = [...stocks];
    const existingIndex = updatedStocks.findIndex(s => s.stock_code === stock.stock_code);
    
    if (existingIndex >= 0) {
      updatedStocks[existingIndex] = stock;
    } else {
      updatedStocks.push(stock);
    }
    
    setStocks(updatedStocks);
    localStorage.setItem('searchedStocks', JSON.stringify(updatedStocks));
  };

  const handleStockSelect = async (stock: Stock) => {
    setIsLoading(true);
    try {
      const { data: stockPrice, error } = await stockService.getCurrentPrice(stock.stock_code);
      if (error) {
        throw error;
      }
      
      if (stockPrice) {
        const updatedStock: Stock = {
          stock_code: stockPrice.stock_code,
          stock_name: stockPrice.stock_name,
          price: stockPrice.price
        };
        onSelect(updatedStock);
        saveStockToLocalStorage(updatedStock);
        
        toast.success(
          `${updatedStock.stock_code} (${updatedStock.stock_name})\nCurrent price: $${updatedStock.price.toFixed(2)}`,
          { duration: 3000 }
        );
      } else {
        onSelect(stock);
        saveStockToLocalStorage(stock);
      }
    } catch (error) {
      console.error('Error fetching stock price:', error);
      toast.error(`Could not fetch price for ${stock.stock_code} (${stock.stock_name})`);
      onSelect(stock);
      saveStockToLocalStorage(stock);
    } finally {
      setIsLoading(false);
      setSearch('');
      setIsOpen(false);
    }
  };

  const handleManualEntry = async () => {
    if (search.trim().length < 1) return;
    
    setIsLoading(true);
    const stockCode = search.toUpperCase();
    
    try {
      const { data: stockPrice, error } = await stockService.getCurrentPrice(stockCode);
      if (error) {
        throw error;
      }
      
      if (stockPrice) {
        const newStock: Stock = {
          stock_code: stockPrice.stock_code,
          stock_name: stockPrice.stock_name,
          price: stockPrice.price
        };
        
        toast.success(
          `${newStock.stock_code} (${newStock.stock_name})\nCurrent price: $${newStock.price.toFixed(2)}`,
          { duration: 3000 }
        );
        saveStockToLocalStorage(newStock);
        onSelect(newStock);
      } else {
        const newStock: Stock = {
          stock_code: stockCode,
          stock_name: stockCode
        };
        saveStockToLocalStorage(newStock);
        onSelect(newStock);
      }
    } catch (error) {
      console.error('Error fetching stock price:', error);
      toast.error(`Could not fetch price for ${stockCode}`);
      const newStock: Stock = {
        stock_code: stockCode,
        stock_name: stockCode
      };
      saveStockToLocalStorage(newStock);
      onSelect(newStock);
    } finally {
      setIsLoading(false);
      setSearch('');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={searchContainerRef}>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleManualEntry();
            }
          }}
          className="w-full px-4 py-2 pl-10 pr-4 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          placeholder="Search stocks or enter new stock code..."
          style={{
            fontSize: '16px',
            WebkitTextSizeAdjust: '100%',
          }}
          disabled={isLoading}
        />
        {isLoading ? (
          <div className="absolute left-3 top-2.5 h-5 w-5">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        )}
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg">
          <ul className="py-1 overflow-auto max-h-60">
            {filteredStocks.map((stock) => (
              <li
                key={stock.stock_code}
                className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${
                  selectedStockCode === stock.stock_code ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleStockSelect(stock)}
              >
                <div className="font-medium">{stock.stock_code}</div>
                <div className="text-sm text-gray-500">{stock.stock_name}</div>
              </li>
            ))}
            {search.trim().length > 0 && filteredStocks.length === 0 && (
              <li
                className="px-4 py-2 cursor-pointer hover:bg-gray-100"
                onClick={handleManualEntry}
              >
                <div className="font-medium">Add "{search.toUpperCase()}"</div>
                <div className="text-sm text-gray-500">Press Enter to add new stock</div>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}