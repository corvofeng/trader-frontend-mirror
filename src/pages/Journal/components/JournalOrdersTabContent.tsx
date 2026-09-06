import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { RefreshCw, Calendar, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { themes, type Theme } from '../../../lib/theme';
import type { OptionOrder } from '../../../lib/services/types';

interface JournalOrdersTabContentProps {
  theme: Theme;
  selectedAccountId: string | null;
  orders: OptionOrder[];
  ordersLoading: boolean;
  ordersError: string | null;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onRefreshOrders: () => void;
}

const getOrderStatusBadge = (raw?: string | null) => {
  const s = (raw || '').trim().toUpperCase();
  if (s.includes('FILLED') || s === 'ALLTRADED') {
    return {
      label: raw || '已成交',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
    };
  }
  if (s.includes('PART') || s.includes('PARTTRADED')) {
    return {
      label: raw || '部分成交',
      className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
    };
  }
  if (s.includes('CANCEL') || s.includes('CANCELED') || s.includes('CANCELLED')) {
    return {
      label: raw || '已撤销',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600',
    };
  }
  if (s.includes('REJECT') || s.includes('ERROR') || s.includes('FAIL') || s === 'JUNK') {
    return {
      label: raw || '已废弃/失败',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 border border-red-300 dark:border-red-700',
    };
  }
  if (s.includes('REPORT') || s.includes('SUBMIT') || s.includes('PENDING')) {
    return {
      label: raw || '已申报/待处理',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-300 dark:border-blue-700',
    };
  }
  return {
    label: raw || '-',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700',
  };
};

export function JournalOrdersTabContent({
  theme,
  selectedAccountId,
  orders,
  ordersLoading,
  ordersError,
  selectedDate,
  onSelectDate,
  onRefreshOrders,
}: JournalOrdersTabContentProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'filled' | 'canceled' | 'other'>('all');

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const yesterdayStr = useMemo(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'), []);
  const twoDaysAgoStr = useMemo(() => format(subDays(new Date(), 2), 'yyyy-MM-dd'), []);

  const stats = useMemo(() => {
    let filled = 0;
    let canceled = 0;
    let failed = 0;
    let pending = 0;

    for (const order of orders) {
      const s = (order.order_status_name || '').toUpperCase();
      if (s.includes('FILLED') || s === 'ALLTRADED' || s.includes('PART')) {
        filled++;
      } else if (s.includes('CANCEL')) {
        canceled++;
      } else if (s.includes('REJECT') || s.includes('ERROR') || s.includes('FAIL') || s === 'JUNK') {
        failed++;
      } else {
        pending++;
      }
    }

    return {
      total: orders.length,
      filled,
      canceled,
      failed,
      pending,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((order) => {
      const s = (order.order_status_name || '').toUpperCase();
      if (statusFilter === 'filled') {
        return s.includes('FILLED') || s === 'ALLTRADED' || s.includes('PART');
      }
      if (statusFilter === 'canceled') {
        return s.includes('CANCEL');
      }
      if (statusFilter === 'other') {
        return !s.includes('FILLED') && !s.includes('CANCEL') && !s.includes('TRADED');
      }
      return true;
    });
  }, [orders, statusFilter]);

  if (!selectedAccountId) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40 text-blue-500" />
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>请选择账户</h3>
        <p className={`text-sm ${themes[theme].text} opacity-70 mt-1`}>
          请在上方账户选择器中选择一个交易账户以查看其成交订单记录。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Controls & Statistics Card */}
      <div className={`${themes[theme].card} rounded-lg shadow-sm p-4 sm:p-5 transition-colors duration-200`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={`text-xs font-medium ${themes[theme].text} opacity-75`}>日期快捷选择:</span>
            <button
              type="button"
              onClick={() => onSelectDate(todayStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedDate === todayStr
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `${themes[theme].secondary} opacity-80 hover:opacity-100`
              }`}
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(yesterdayStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedDate === yesterdayStr
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `${themes[theme].secondary} opacity-80 hover:opacity-100`
              }`}
            >
              昨天
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(twoDaysAgoStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedDate === twoDaysAgoStr
                  ? 'bg-blue-600 text-white shadow-sm'
                  : `${themes[theme].secondary} opacity-80 hover:opacity-100`
              }`}
            >
              前天
            </button>
            <div className="flex items-center gap-1.5 ml-1">
              <Calendar className="w-4 h-4 opacity-50" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onSelectDate(e.target.value);
                  }
                }}
                className={`text-xs px-2.5 py-1.5 rounded-md border ${themes[theme].border} bg-transparent ${themes[theme].text} focus:outline-none focus:ring-1 focus:ring-blue-500`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              type="button"
              onClick={onRefreshOrders}
              disabled={ordersLoading}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md ${themes[theme].secondary} ${
                ordersLoading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-100'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${ordersLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {/* Stats and filter bar */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              <Clock className="w-3.5 h-3.5" />
              总委托: {stats.total}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已成交: {stats.filled}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              <XCircle className="w-3.5 h-3.5" />
              已撤销: {stats.canceled}
            </span>
            {stats.failed > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                <AlertCircle className="w-3.5 h-3.5" />
                失败/废单: {stats.failed}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 self-start md:self-auto">
            <span className={`text-xs ${themes[theme].text} opacity-60 mr-1`}>筛选:</span>
            {(['all', 'filled', 'canceled', 'other'] as const).map((filter) => {
              const labels = {
                all: '全部',
                filled: '已成交',
                canceled: '已撤单',
                other: '其他',
              };
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    statusFilter === filter
                      ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900 font-medium'
                      : `${themes[theme].secondary} opacity-70 hover:opacity-100`
                  }`}
                >
                  {labels[filter]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Orders Table Card */}
      <div className={`${themes[theme].card} rounded-lg shadow-sm overflow-hidden transition-colors duration-200`}>
        <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border} flex items-center justify-between`}>
          <div>
            <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
              {selectedDate} 成交与委托明细
            </h3>
            <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5`}>
              账户: <span className="font-mono font-medium">{selectedAccountId}</span>
            </p>
          </div>
          <span className={`text-xs ${themes[theme].text} opacity-60`}>
            显示 {filteredOrders.length} / {orders.length} 条记录
          </span>
        </div>

        <div className="p-0">
          {ordersLoading && (
            <div className="py-12 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
              <p className={`text-sm ${themes[theme].text} opacity-75`}>正在加载订单数据...</p>
            </div>
          )}

          {!ordersLoading && ordersError && (
            <div className="py-12 px-4 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm text-red-500">{ordersError}</p>
              <button
                type="button"
                onClick={onRefreshOrders}
                className="mt-3 text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
              >
                重试加载
              </button>
            </div>
          )}

          {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
            <div className="py-12 px-4 text-center">
              <Clock className="w-8 h-8 opacity-30 mx-auto mb-2" />
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                {orders.length === 0 ? `${selectedDate} 该账户暂无订单记录。` : '当前筛选条件下暂无订单。'}
              </p>
            </div>
          )}

          {!ordersLoading && !ordersError && filteredOrders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50/75 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      标的 / 合约
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      方向
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      成交价 / 限价
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      数量 (成交/委托)
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      系统号
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      备注 / 撤单原因
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {filteredOrders.map((order, idx) => {
                    const status = getOrderStatusBadge(order.order_status_name);
                    const isBuy =
                      (order.op_type_name_zh || order.op_type_name || '').toUpperCase().includes('BUY') ||
                      (order.op_type_name_zh || '').includes('买') ||
                      (order.op_type_name_zh || '').includes('开多');
                    const isSell =
                      (order.op_type_name_zh || order.op_type_name || '').toUpperCase().includes('SELL') ||
                      (order.op_type_name_zh || '').includes('卖') ||
                      (order.op_type_name_zh || '').includes('平多');

                    const timeStr = order.order_time?.includes(' ')
                      ? order.order_time.split(' ')[1]
                      : order.order_time || '-';

                    const symbol = order.contract_code_full || order.instrument_id || '-';
                    const name = order.instrument_name || '';

                    const isFilled =
                      (order.volume_traded != null && order.volume_traded > 0) ||
                      (order.order_status_name || '').toUpperCase().includes('FILLED') ||
                      (order.order_status_name || '').toUpperCase().includes('TRADED');

                    return (
                      <tr
                        key={`${order.order_sys_id || symbol || idx}-${idx}`}
                        className={`transition-colors ${
                          isFilled ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                        } hover:bg-gray-50/80 dark:hover:bg-gray-800/40`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                          {timeStr}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">
                          <div className="font-mono font-medium">{symbol}</div>
                          {name && <div className="text-[11px] opacity-70 mt-0.5">{name}</div>}
                          {order.is_combination && (
                            <span className="inline-block mt-0.5 text-[10px] text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-1 py-0.2 rounded">
                              组合
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              isBuy
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : isSell
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                            }`}
                          >
                            {order.op_type_name_zh || order.op_type_name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-mono">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {order.traded_price != null && Number.isFinite(order.traded_price)
                              ? order.traded_price.toFixed(4)
                              : '-'}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                            限: {order.limit_price != null && Number.isFinite(order.limit_price)
                              ? order.limit_price.toFixed(4)
                              : '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-mono">
                          <span className={`font-semibold ${isFilled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'}`}>
                            {order.volume_traded ?? 0}
                          </span>
                          <span className="text-gray-400 mx-0.5">/</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {order.volume_total_original ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-xs">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${status.className}`}
                            title={order.order_status_name || undefined}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 font-mono">
                          {order.order_sys_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 max-w-[220px] break-words">
                          {order.error_msg || order.cancel_info || order.remark || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
