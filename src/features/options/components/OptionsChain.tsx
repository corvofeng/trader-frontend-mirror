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

  // 可配置字段定义（保持左右镜像对称）
  type FieldId = 'lastPrice' | 'timeValue' | 'intrinsicValue' | 'impliedVol' | 'myBuyQty' | 'mySellQty';

  const FIELD_CONFIG: Array<{
    id: FieldId;
    label: string;
    renderCall: (quote: OptionQuote) => React.ReactNode;
    renderPut: (quote: OptionQuote) => React.ReactNode;
    callAlign?: 'left' | 'right';
    putAlign?: 'left' | 'right';
  }> = [
    {
      id: 'mySellQty',
      label: '我的卖出',
      renderCall: (quote) => (quote.myCallSellQty ?? 0),
      renderPut: (quote) => (quote.myPutSellQty ?? 0),
      callAlign: 'right',
      putAlign: 'left',
    },
    {
      id: 'myBuyQty',
      label: '我的买入',
      renderCall: (quote) => (quote.myCallBuyQty ?? 0),
      renderPut: (quote) => (quote.myPutBuyQty ?? 0),
      callAlign: 'right',
      putAlign: 'left',
    },
    {
      id: 'impliedVol',
      label: '隐含波动率',
      renderCall: (quote) => {
        const s = getOptionStatus(quote.strike, true);
        return (
          <div className="flex flex-col items-end">
            <span>{quote.callImpliedVol.toFixed(1)}%</span>
            <span className={`text-xs px-1 py-0.5 rounded ${s.color} mt-1`}>{s.label}</span>
          </div>
        );
      },
      renderPut: (quote) => {
        const s = getOptionStatus(quote.strike, false);
        return (
          <div className="flex flex-col items-start">
            <span>{quote.putImpliedVol.toFixed(1)}%</span>
            <span className={`text-xs px-1 py-0.5 rounded ${s.color} mt-1`}>{s.label}</span>
          </div>
        );
      },
      callAlign: 'right',
      putAlign: 'left',
    },
    {
      id: 'intrinsicValue',
      label: '内在价值',
      renderCall: (quote) => formatCurrency(quote.callIntrinsicValue || 0, currencyConfig),
      renderPut: (quote) => formatCurrency(quote.putIntrinsicValue || 0, currencyConfig),
      callAlign: 'right',
      putAlign: 'left',
    },
    {
      id: 'timeValue',
      label: '时间价值',
      renderCall: (quote) => formatCurrency(quote.callTimeValue || 0, currencyConfig),
      renderPut: (quote) => formatCurrency(quote.putTimeValue || 0, currencyConfig),
      callAlign: 'right',
      putAlign: 'left',
    },
    {
      id: 'lastPrice',
      label: '最新价',
      renderCall: (quote) => (
        quote.callUrl ? (
          <a href={quote.callUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
            {formatCurrency(quote.callPrice, currencyConfig)}
          </a>
        ) : (
          <span className="font-medium">{formatCurrency(quote.callPrice, currencyConfig)}</span>
        )
      ),
      renderPut: (quote) => (
        quote.putUrl ? (
          <a href={quote.putUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
            {formatCurrency(quote.putPrice, currencyConfig)}
          </a>
        ) : (
          <span className="font-medium">{formatCurrency(quote.putPrice, currencyConfig)}</span>
        )
      ),
      callAlign: 'right',
      putAlign: 'left',
    },
  ];

  const [enabledFieldIds, setEnabledFieldIds] = React.useState<FieldId[]>(FIELD_CONFIG.map(f => f.id));
  const enabledFields = FIELD_CONFIG.filter(f => enabledFieldIds.includes(f.id));
  const callColumns = enabledFields; // 从左到中
  const putColumns = [...enabledFields].reverse(); // 从中到右（镜像）

  // 缩放控制：缓解移动端横向滑动压力（初始化时优先从 Cookie 读取）
  const [zoom, setZoom] = React.useState<number>(() => {
    const zStr = typeof document !== 'undefined' ? (document.cookie ? (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('optionsChainZoom='))?.split('=')[1] ?? null) : null) : null;
    if (zStr != null) {
      const v = parseFloat(decodeURIComponent(zStr));
      if (Number.isFinite(v)) return Math.min(1.1, Math.max(0.5, v));
    }
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    if (w < 360) return 0.8;
    if (w < 400) return 0.85;
    return 1;
  });
  // 稳健读取 Cookie 的工具函数
  const getCookie = (name: string): string | null => {
    try {
      const all = document.cookie;
      if (!all) return null;
      const parts = all.split(';');
      for (let i = 0; i < parts.length; i++) {
        const cookie = parts[i].trim();
        if (cookie.startsWith(name + '=')) {
          const value = cookie.substring(name.length + 1);
          try {
            return decodeURIComponent(value);
          } catch {
            return value;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  };
  const setCookie = (name: string, value: string, days: number) => {
    try {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch {}
  };
  // 取消初始读取副作用，以免首次渲染覆盖 Cookie 值
  // 缩放变化时写入 Cookie（180 天）
  React.useEffect(() => {
    try {
      const days = 180;
      setCookie('optionsChainZoom', String(zoom), days);
    } catch {}
  }, [zoom]);
  const colPx = Math.max(56, Math.round(112 * zoom)); // 基础列宽 112px，最小 56px（支持50%缩放）
  const textSizeClass = zoom <= 0.7 ? 'text-xs' : 'text-sm';
  const cellPyClass = zoom <= 0.75 ? 'py-2' : 'py-3';

  // 左右滚动容器与联动逻辑：左滑 -> 右侧反向滑动，右滑 -> 左侧反向滑动
  const leftScrollRef = React.useRef<HTMLDivElement>(null);
  const rightScrollRef = React.useRef<HTMLDivElement>(null);
  const isSyncingRef = React.useRef(false);
  const leftTbodyRef = React.useRef<HTMLTableSectionElement>(null);
  const rightTbodyRef = React.useRef<HTMLTableSectionElement>(null);
  const centerTbodyRef = React.useRef<HTMLTableSectionElement>(null);
  const syncRafIdRef = React.useRef<number | null>(null);

  const onLeftScroll = React.useCallback(() => {
    if (isSyncingRef.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    isSyncingRef.current = true;
    const maxRight = Math.max(0, right.scrollWidth - right.clientWidth);
    const maxLeft = Math.max(0, left.scrollWidth - left.clientWidth);
    const ratio = maxLeft > 0 ? (maxRight / maxLeft) : 1;
    right.scrollLeft = Math.max(0, Math.min(maxRight, maxRight - left.scrollLeft * ratio));
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  }, []);

  const onRightScroll = React.useCallback(() => {
    if (isSyncingRef.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    isSyncingRef.current = true;
    const maxRight = Math.max(0, right.scrollWidth - right.clientWidth);
    const maxLeft = Math.max(0, left.scrollWidth - left.clientWidth);
    const ratio = maxRight > 0 ? (maxLeft / maxRight) : 1;
    left.scrollLeft = Math.max(0, Math.min(maxLeft, maxLeft - right.scrollLeft * ratio));
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  }, []);

  // 初始对齐：左侧默认滚到最右，右侧保持最左，确保靠近行权价的列先可见
  React.useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    // 等待布局完成再设置，避免尺寸未计算
    const id = requestAnimationFrame(() => {
      const maxLeft = Math.max(0, left.scrollWidth - left.clientWidth);
      isSyncingRef.current = true;
      left.scrollLeft = maxLeft;
      right.scrollLeft = 0;
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    });
    return () => cancelAnimationFrame(id);
  }, [enabledFieldIds]);

  // 行高同步：确保中间行权价列与左右每一行高度一致
  const syncRowHeights = React.useCallback(() => {
    const l = leftTbodyRef.current;
    const r = rightTbodyRef.current;
    const c = centerTbodyRef.current;
    if (!l || !r || !c) return;
    const leftRows = Array.from(l.querySelectorAll('tr')) as HTMLTableRowElement[];
    const rightRows = Array.from(r.querySelectorAll('tr')) as HTMLTableRowElement[];
    const centerRows = Array.from(c.querySelectorAll('tr')) as HTMLTableRowElement[];
    const count = Math.min(leftRows.length, rightRows.length, centerRows.length);
    // 先重置高度
    for (let i = 0; i < count; i++) {
      leftRows[i].style.height = 'auto';
      rightRows[i].style.height = 'auto';
      centerRows[i].style.height = 'auto';
    }
    // 再统一为最大高度
    for (let i = 0; i < count; i++) {
      const h = Math.max(leftRows[i].offsetHeight, rightRows[i].offsetHeight, centerRows[i].offsetHeight);
      leftRows[i].style.height = `${h}px`;
      rightRows[i].style.height = `${h}px`;
      centerRows[i].style.height = `${h}px`;
    }
  }, []);

  React.useEffect(() => {
    const id = requestAnimationFrame(syncRowHeights);
    const handle = () => {
      if (syncRafIdRef.current != null) cancelAnimationFrame(syncRafIdRef.current);
      syncRafIdRef.current = requestAnimationFrame(syncRowHeights);
    };
    window.addEventListener('resize', handle);
    const leftObserver = new ResizeObserver(handle);
    const rightObserver = new ResizeObserver(handle);
    const centerObserver = new ResizeObserver(handle);
    if (leftTbodyRef.current) leftObserver.observe(leftTbodyRef.current);
    if (rightTbodyRef.current) rightObserver.observe(rightTbodyRef.current);
    if (centerTbodyRef.current) centerObserver.observe(centerTbodyRef.current);
    return () => {
      window.removeEventListener('resize', handle);
      leftObserver.disconnect();
      rightObserver.disconnect();
      centerObserver.disconnect();
      cancelAnimationFrame(id);
      if (syncRafIdRef.current != null) cancelAnimationFrame(syncRafIdRef.current);
    };
  }, [quotesByExpiry, enabledFieldIds, syncRowHeights, zoom]);

  // 使用原生 passive scroll 事件，提升移动端滚动响应
  React.useEffect(() => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    left.addEventListener('scroll', onLeftScroll, { passive: true });
    right.addEventListener('scroll', onRightScroll, { passive: true });
    return () => {
      left.removeEventListener('scroll', onLeftScroll);
      right.removeEventListener('scroll', onRightScroll);
    };
  }, [onLeftScroll, onRightScroll]);

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

        {/* 三段式布局 + 可配置字段，对齐与对称滚动联动 */}
        <div className="w-full">
          {/* 缩放与字段选择配置 */}
          <div className="mb-4 flex flex-wrap gap-3">
            {/* 缩放控件 */}
            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded ${themes[theme].background} border ${themes[theme].border}`}>
              <span className={`${themes[theme].text} text-sm`}>缩放</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.05) * 100) / 100))}
                className={`px-2 py-1 rounded ${themes[theme].secondary}`}
                aria-label="缩小"
              >
                −
              </button>
              <span className={`${themes[theme].text} text-xs w-10 text-center`}>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(1.1, Math.round((z + 0.05) * 100) / 100))}
                className={`px-2 py-1 rounded ${themes[theme].secondary}`}
                aria-label="放大"
              >
                +
              </button>
            </div>

            {FIELD_CONFIG.map(field => {
              const checked = enabledFieldIds.includes(field.id);
              return (
                <label key={field.id} className={`inline-flex items-center gap-2 text-sm px-2 py-1 rounded ${themes[theme].background} border ${themes[theme].border}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const isOn = e.target.checked;
                      setEnabledFieldIds(prev => {
                        if (isOn) return Array.from(new Set([...prev, field.id]));
                        return prev.filter(id => id !== field.id);
                      });
                    }}
                  />
                  <span className={themes[theme].text}>{field.label}</span>
                </label>
              );
            })}
          </div>
          <div className="flex">
            {/* 左侧：Calls 横向滚动，与右侧反向联动 */}
            <div
              ref={leftScrollRef}
              className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x"
              style={{ WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)', willChange: 'transform', contain: 'content' }}
            >
              <table className="w-full" style={{ minWidth: `${callColumns.length * colPx}px` }}>
                <thead className={`${themes[theme].background}`}>
                  <tr>
                    <th
                      colSpan={callColumns.length}
                      className={`text-center px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} ${textSizeClass} whitespace-nowrap`}
                      style={{ height: '44px', minHeight: '44px' }}
                    >
                      Calls
                    </th>
                  </tr>
                  <tr>
                    {callColumns.map((col, idx) => (
                      <th
                        key={`h-call-${col.id}`}
                        className={`px-3 py-2 ${themes[theme].text} ${textSizeClass} whitespace-nowrap ${col.callAlign === 'right' ? 'text-right' : 'text-left'} ${idx === callColumns.length - 1 ? `border-r ${themes[theme].border}` : ''}`}
                        style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody ref={leftTbodyRef} className={`divide-y ${themes[theme].border}`}>
                  {quotesByExpiry.map((quote: OptionQuote) => (
                    <tr key={`call-${quote.strike}`} className={themes[theme].cardHover}>
                      {callColumns.map((col, idx) => (
                        <td
                          key={`c-${col.id}-${quote.strike}`}
                          className={`px-3 ${cellPyClass} ${themes[theme].text} ${textSizeClass} ${col.callAlign === 'right' ? 'text-right' : 'text-left'} ${idx === callColumns.length - 1 ? `border-r ${themes[theme].border}` : ''}`}
                          style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}
                        >
                          {col.renderCall(quote)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 中间：Strike 固定列始终居中（表头两行以对齐左右） */}
            <div className="shrink-0">
              <table className="w-full">
                <thead className={`${themes[theme].background}`}>
                  {/* 第一行：空白占位，与左右 Calls/Puts 标题对齐 */}
                  <tr>
                    <th
                      className={`px-4 py-2 border-b ${themes[theme].border}`}
                      style={{ width: `${colPx}px`, minWidth: `${colPx}px`, height: '44px', minHeight: '44px' }}
                    >
                      {/* 占位 */}
                    </th>
                  </tr>
                  {/* 第二行：行权价表头，与左右字段表头对齐 */}
                  <tr>
                    <th className={`px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} text-center font-bold ${textSizeClass} whitespace-nowrap`} style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}>
                      标的行权价格
                    </th>
                  </tr>
                </thead>
                <tbody ref={centerTbodyRef} className={`divide-y ${themes[theme].border}`}>
                  {quotesByExpiry.map((quote: OptionQuote) => (
                    <tr key={`strike-${quote.strike}`}>
                      <td className={`px-4 ${cellPyClass} text-center font-bold ${textSizeClass} ${themes[theme].text} bg-opacity-50 ${themes[theme].background}`} style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}>
                        {formatCurrency(quote.strike, currencyConfig)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 右侧：Puts 横向滚动，与左侧反向联动 */}
            <div
              ref={rightScrollRef}
              className="flex-1 overflow-x-auto overscroll-x-contain touch-pan-x"
              style={{ WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)', willChange: 'transform', contain: 'content' }}
            >
              <table className="w-full" style={{ minWidth: `${putColumns.length * colPx}px` }}>
                <thead className={`${themes[theme].background}`}>
                  <tr>
                    <th
                      colSpan={putColumns.length}
                      className={`text-center px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} ${textSizeClass} whitespace-nowrap`}
                      style={{ height: '44px', minHeight: '44px' }}
                    >
                      Puts
                    </th>
                  </tr>
                  <tr>
                    {putColumns.map((col, idx) => (
                      <th
                        key={`h-put-${col.id}`}
                        className={`px-3 py-2 ${themes[theme].text} ${textSizeClass} whitespace-nowrap ${col.putAlign === 'left' ? 'text-left' : 'text-right'} ${idx === 0 ? `border-l ${themes[theme].border}` : ''}`}
                        style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody ref={rightTbodyRef} className={`divide-y ${themes[theme].border}`}>
                  {quotesByExpiry.map((quote: OptionQuote) => (
                    <tr key={`put-${quote.strike}`} className={themes[theme].cardHover}>
                      {putColumns.map((col, idx) => (
                        <td
                          key={`p-${col.id}-${quote.strike}`}
                          className={`px-3 ${cellPyClass} ${themes[theme].text} ${textSizeClass} ${col.putAlign === 'left' ? 'text-left' : 'text-right'} ${idx === 0 ? `border-l ${themes[theme].border}` : ''}`}
                          style={{ width: `${colPx}px`, minWidth: `${colPx}px` }}
                        >
                          {col.renderPut(quote)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}