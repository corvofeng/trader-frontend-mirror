import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, Calendar } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import { OptionsTradePlans } from '../../../features/options/components/OptionsTradePlans';
import { stockService } from '../../../lib/services';
import type { StockOrder } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface TerminalTradeViewProps {
  theme: Theme;
  selectedAccountId: string | null;
  userId?: string | null;
}

type TradeSubTab = 'plans' | 'orders';

const getOrderStatusBadge = (raw?: string | null) => {
  const s = (raw || '').trim().toUpperCase();
  if (s.includes('FILLED') || s === 'ALLTRADED' || s.includes('全部成交')) {
    return { label: raw || '已全部成交', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' };
  }
  if (s.includes('PART') || s.includes('PARTTRADED') || s.includes('部成')) {
    return { label: raw || '部分成交', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' };
  }
  if (s.includes('CANCEL') || s.includes('CANCELED') || s.includes('已撤')) {
    return { label: raw || '已撤销', className: 'bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300' };
  }
  if (s.includes('REJECT') || s.includes('ERROR') || s.includes('FAIL') || s.includes('废单')) {
    return { label: raw || '废单/拒绝', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' };
  }
  return { label: raw || '已申报', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' };
};

export const TerminalTradeView: React.FC<TerminalTradeViewProps> = ({
  theme,
  selectedAccountId,
  userId,
}) => {
  const [subTab, setSubTab] = useState<TradeSubTab>('plans');
  const selectedSymbol = '588000.SH';
  const [todayOrders, setTodayOrders] = useState<StockOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const fetchTodayOrders = useCallback(async () => {
    if (!selectedAccountId) {
      setTodayOrders([]);
      return;
    }
    setIsLoadingOrders(true);
    setOrderError(null);
    try {
      const resp = await stockService.getTodayOrders(selectedAccountId);
      if (resp.error) throw resp.error;
      setTodayOrders(resp.data || []);
    } catch (e) {
      setTodayOrders([]);
      setOrderError(e instanceof Error ? e.message : '加载当日订单失败');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (subTab === 'orders') {
      fetchTodayOrders();
    }
  }, [subTab, fetchTodayOrders]);

  return (
    <div className="space-y-4 pb-20">
      {/* 顶部 M3 Segmented Chips */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80">
          <button
            type="button"
            onClick={() => setSubTab('plans')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium btn-tactile transition-all duration-150 ${
              subTab === 'plans'
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            交易策略计划 (Plans)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('orders')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium btn-tactile transition-all duration-150 ${
              subTab === 'orders'
                ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            当日委托订单 ({todayOrders.length})
          </button>
        </div>

        {subTab === 'orders' && (
          <button
            type="button"
            onClick={() => {
              fetchTodayOrders();
              toast.success('已刷新当日委托');
            }}
            disabled={isLoadingOrders}
            className={`p-1.5 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} btn-tactile text-slate-600 dark:text-zinc-300 hover:text-blue-600`}
            title="刷新订单"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* 视图内容 */}
      {subTab === 'plans' ? (
        <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
          <OptionsTradePlans
            theme={theme}
            selectedSymbol={selectedSymbol}
            selectedAccountId={selectedAccountId}
            userId={userId}
          />
        </div>
      ) : (
        <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>当日委托与挂单跟踪</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              账户: {selectedAccountId || '未指定'}
            </span>
          </div>

          {orderError && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {orderError}
            </div>
          )}

          {isLoadingOrders ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-zinc-400">正在查询当日委托...</p>
            </div>
          ) : todayOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-zinc-500">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">今日暂无委托记录</p>
              <p className="text-xs mt-1 opacity-75">通过交易计划或期权策略下单后将在此处实时更新</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {todayOrders.map((ord, idx) => {
                const opName = ord.op_type_name_zh || ord.op_type_name || '委托';
                const statusName = ord.order_status_name || (ord.order_status !== undefined ? String(ord.order_status) : null);
                const badge = getOrderStatusBadge(statusName);
                const isBuy = opName.includes('买') || opName.toUpperCase().includes('BUY');
                const symbolCode = ord.contract_code_full || ord.instrument_id || '--';
                const symbolName = ord.instrument_name || symbolCode;

                return (
                  <div key={ord.order_sys_id || idx} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          isBuy ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}>
                          {opName}
                        </span>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {symbolName}
                        </span>
                        <span className="text-xs font-mono text-slate-400 dark:text-zinc-500">
                          {symbolCode}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                        <span>委托价: ¥{ord.limit_price?.toFixed(3) ?? '--'}</span>
                        <span>成交价: ¥{ord.traded_price?.toFixed(3) ?? '--'}</span>
                        <span>委托量: {ord.volume_total_original ?? 0}</span>
                        <span>已成: {ord.volume_traded ?? 0}</span>
                        {ord.order_time && <span>时间: {ord.order_time}</span>}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
