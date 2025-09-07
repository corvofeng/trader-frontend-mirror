import React from 'react';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionsData, OptionQuote } from '../../../lib/services/types';

interface OptionsChainProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
  selectedExpiry: string;
  onExpiryChange: (expiry: string) => void;
}

export function OptionsChain({ 
  theme, 
  optionsData, 
  selectedSymbol, 
  selectedExpiry, 
  onExpiryChange 
}: OptionsChainProps) {
  const { currencyConfig } = useCurrency();

  const uniqueExpiryDates = Array.from(new Set(optionsData.quotes.map(q => q.expiry)))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const quotesByExpiry = optionsData.quotes
    .filter(q => q.expiry === selectedExpiry)
    .sort((a, b) => a.strike - b.strike);

  // 找到时间价值最大的期权合约作为平值合约
  const getAtTheMoneyStrike = (quotes: OptionQuote[]): number => {
    if (quotes.length === 0) return 0;
    
    let maxTimeValue = 0;
    let atmStrike = quotes[0].strike;
    
    quotes.forEach(quote => {
      const callTimeValue = quote.callTimeValue || 0;
      const putTimeValue = quote.putTimeValue || 0;
      const totalTimeValue = callTimeValue + putTimeValue;
      
      if (totalTimeValue > maxTimeValue) {
        maxTimeValue = totalTimeValue;
        atmStrike = quote.strike;
      }
    });
    
    return atmStrike;
  };

  const atmStrike = getAtTheMoneyStrike(quotesByExpiry);

  // 获取期权状态标识
  const getOptionStatus = (strike: number, isCall: boolean) => {
    if (strike === atmStrike) {
      return { label: 'ATM', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900' };
    } else if (isCall) {
      // Call期权：执行价格低于平值为价内(ITM)，高于平值为价外(OTM)
      return strike < atmStrike 
        ? { label: 'ITM', color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900' }
        : { label: 'OTM', color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700' };
    } else {
      // Put期权：执行价格高于平值为价内(ITM)，低于平值为价外(OTM)
      return strike > atmStrike 
        ? { label: 'ITM', color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900' }
        : { label: 'OTM', color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700' };
    }
  };

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>
            Option Chain - {selectedSymbol}
          </h2>
          <select
            value={selectedExpiry}
            onChange={(e) => onExpiryChange(e.target.value)}
            className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
          >
            {uniqueExpiryDates.map(date => (
              <option key={date} value={date}>
                {format(new Date(date), 'MMM d, yyyy')}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${themes[theme].background}`}>
              <tr>
                <th colSpan={4} className={`text-center px-4 py-2 border-b border-r ${themes[theme].border} ${themes[theme].text}`}>
                  Calls
                </th>
                <th className={`px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} text-center font-bold`}>
                  标的行权价格
                </th>
                <th colSpan={4} className={`text-center px-4 py-2 border-b border-l ${themes[theme].border} ${themes[theme].text}`}>
                  Puts
                </th>
              </tr>
              <tr>
                <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>隐含波动率</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>内在价值</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm`}>时间价值</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-right text-sm border-r ${themes[theme].border}`}>最新价</th>
                <th className={`px-4 py-2 ${themes[theme].text} text-center font-bold`}>行权价</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm border-l ${themes[theme].border}`}>最新价</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>时间价值</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>内在价值</th>
                <th className={`px-3 py-2 ${themes[theme].text} text-left text-sm`}>隐含波动率</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${themes[theme].border}`}>
              {quotesByExpiry.map((quote: OptionQuote) => {
                const callStatus = getOptionStatus(quote.strike, true);
                const putStatus = getOptionStatus(quote.strike, false);
                
                return (
                  <tr key={quote.strike} className={themes[theme].cardHover}>
                    {/* Call Options - 从右到左排列 */}
                    <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                      <div className="flex flex-col items-end">
                        <span>{quote.callImpliedVol.toFixed(1)}%</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${callStatus.color} mt-1`}>
                          {callStatus.label}
                        </span>
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                      {formatCurrency(quote.callIntrinsicValue || 0, currencyConfig)}
                    </td>
                    <td className={`px-3 py-3 text-right ${themes[theme].text} text-sm`}>
                      {formatCurrency(quote.callTimeValue || 0, currencyConfig)}
                    </td>
                    <td className={`px-3 py-3 text-right ${themes[theme].text} border-r ${themes[theme].border}`}>
                      {quote.callUrl ? (
                        <a 
                          href={quote.callUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {formatCurrency(quote.callPrice, currencyConfig)}
                        </a>
                      ) : (
                        <span className="font-medium">
                          {formatCurrency(quote.callPrice, currencyConfig)}
                        </span>
                      )}
                    </td>
                    
                    {/* Strike Price - 中心位置 */}
                    <td className={`px-4 py-3 text-center font-bold ${themes[theme].text} bg-opacity-50 ${themes[theme].background}`}>
                      {formatCurrency(quote.strike, currencyConfig)}
                    </td>
                    
                    {/* Put Options - 从左到右排列 */}
                    <td className={`px-3 py-3 text-left ${themes[theme].text} border-l ${themes[theme].border}`}>
                      {quote.putUrl ? (
                        <a 
                          href={quote.putUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {formatCurrency(quote.putPrice, currencyConfig)}
                        </a>
                      ) : (
                        <span className="font-medium">
                          {formatCurrency(quote.putPrice, currencyConfig)}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                      {formatCurrency(quote.putTimeValue || 0, currencyConfig)}
                    </td>
                    <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                      {formatCurrency(quote.putIntrinsicValue || 0, currencyConfig)}
                    </td>
                    <td className={`px-3 py-3 text-left ${themes[theme].text} text-sm`}>
                      <div className="flex flex-col items-start">
                        <span>{quote.putImpliedVol.toFixed(1)}%</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${putStatus.color} mt-1`}>
                          {putStatus.label}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}