import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BarChart2 } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import { OptionsChain } from '../../../features/options/components/OptionsChain';
import { UnderlyingPriceMonitor } from '../../../features/options/components/UnderlyingPriceMonitor';
import { optionsService } from '../../../lib/services';
import type { OptionsData } from '../../../lib/services/types';
import { useOptionPriceWebSocket } from '../../../features/options/hooks/useOptionPriceWebSocket';
import toast from 'react-hot-toast';

interface TerminalOptionsViewProps {
  theme: Theme;
  selectedAccountId: string | null;
  refreshKey: number;
}

const COMMON_SYMBOLS = [
  { code: '588000.SH', name: '科创50ETF' },
  { code: '510050.SH', name: '上证50ETF' },
  { code: '510300.SH', name: '沪深300ETF' },
  { code: '510500.SH', name: '中证500ETF' },
  { code: '159919.SZ', name: '300ETF' },
];

export const TerminalOptionsView: React.FC<TerminalOptionsViewProps> = ({
  theme,
  selectedAccountId,
  refreshKey,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    try {
      return localStorage.getItem('terminal_options_symbol') || '588000.SH';
    } catch {
      return '588000.SH';
    }
  });

  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, queryOptionsData, reconnect } = useOptionPriceWebSocket();

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
    try {
      localStorage.setItem('terminal_options_symbol', symbol);
    } catch {}
  };

  const fetchOptionsData = useCallback(async () => {
    if (!selectedSymbol) return;
    setIsLoading(true);
    setError(null);
    try {
      const resp = await optionsService.getOptionsData(selectedSymbol);
      if (resp.error) {
        setError(resp.error.message || '加载期权行情失败');
      } else if (resp.data) {
        setOptionsData(resp.data);
      }
      if (isConnected) {
        queryOptionsData(selectedSymbol);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载期权数据异常');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSymbol, isConnected, queryOptionsData]);

  useEffect(() => {
    fetchOptionsData();
  }, [fetchOptionsData, refreshKey]);

  return (
    <div className="space-y-4 pb-20">
      {/* 顶部标的快选与控制条 */}
      <div className={`${themes[theme].card} rounded-2xl p-3.5 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
            {COMMON_SYMBOLS.map((item) => {
              const isSelected = selectedSymbol === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelectSymbol(item.code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap btn-tactile transition-all duration-150 ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'bg-slate-100/80 dark:bg-zinc-900/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-200/70 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{item.name}</span>
                  <span className="ml-1 text-[10px] font-mono opacity-80">{item.code.split('.')[0]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {isConnected ? (
                <span className="text-emerald-500 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  WS 实时
                </span>
              ) : (
                '快照模式'
              )}
            </span>

            <button
              type="button"
              onClick={() => {
                reconnect({ silent: true });
                fetchOptionsData();
                toast.success('已刷新期权盘口数据');
              }}
              disabled={isLoading}
              className={`p-1.5 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} btn-tactile text-slate-600 dark:text-zinc-300 hover:text-blue-600`}
              title="刷新期权链"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 标的实时价格卡片 (Underlying Price) */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/60">
          <UnderlyingPriceMonitor
            theme={theme}
            symbol={selectedSymbol}
          />
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* T 型期权链核心看板 */}
      {optionsData ? (
        <div className={`${themes[theme].card} rounded-2xl p-2 sm:p-5 border ${themes[theme].border} shadow-2xs overflow-hidden`}>
          <div className="flex items-center justify-between px-2 py-2 mb-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-500" />
              <span>T 型期权链 (Option Chain)</span>
            </h2>
          </div>
          <OptionsChain
            theme={theme}
            optionsData={optionsData}
            selectedSymbol={selectedSymbol}
            selectedExpiry={selectedExpiry}
            onExpiryChange={setSelectedExpiry}
            selectedAccountId={selectedAccountId}
          />
        </div>
      ) : (
        <div className={`${themes[theme].card} rounded-2xl p-12 text-center border ${themes[theme].border}`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
          <p className="text-xs text-slate-500 dark:text-zinc-400">正在加载 {selectedSymbol} 期权链数据...</p>
        </div>
      )}
    </div>
  );
};
