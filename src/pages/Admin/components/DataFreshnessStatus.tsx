import React, { useState, useEffect } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Database, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DataFreshnessStatusProps {
  theme: Theme;
}

const DATA_FRESHNESS_CHECK_STOCK = '588000.SH';
const HISTORY_DATA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/history`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const extractListFromResponse = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data.data)) return (data.data as unknown[]).filter(isRecord);
  return [];
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

type DataCheckResult = {
  loading: boolean;
  error: string | null;
  lastDate: string | null;
  diffDays: number | null;
  details: Record<string, unknown> | null;
};

export function DataFreshnessStatus({ theme }: DataFreshnessStatusProps) {
  const [historyStatus, setHistoryStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });

  const fetchHistoryData = async () => {
    setHistoryStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(HISTORY_DATA_API, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      // 兼容直接返回数组，或者 { data: [...] } 格式
      const list = extractListFromResponse(data as unknown);
      if (list.length === 0) {
        throw new Error('未获取到数据或数据为空');
      }
      
      const lastItem = list[list.length - 1];
      const lastDateStr =
        (typeof lastItem.date === 'string' ? lastItem.date : '') ||
        (typeof lastItem.time === 'string' ? lastItem.time : '') ||
        '';
      if (!lastDateStr) {
        throw new Error('数据中未找到日期字段 (date)');
      }
      
      const diff = differenceInCalendarDays(new Date(), parseISO(lastDateStr));
      setHistoryStatus({
        loading: false,
        error: null,
        lastDate: lastDateStr,
        diffDays: diff,
        details: lastItem
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        setHistoryStatus(prev => ({
          ...prev,
          loading: false,
          error: '请求超时'
        }));
        return;
      }
      setHistoryStatus(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '请求失败'
      }));
    }
  };

  useEffect(() => {
    fetchHistoryData();
  }, []);

  const renderStatusCard = (title: string, apiPath: string, status: DataCheckResult, onRefresh: () => void) => {
    return (
      <div className={`${themes[theme].card} rounded-lg p-4 border border-gray-200 dark:border-gray-800`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className={`w-5 h-5 ${themes[theme].text}`} />
            <h3 className={`font-semibold ${themes[theme].text}`}>{title}</h3>
          </div>
          <button 
            onClick={onRefresh}
            disabled={status.loading}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${themes[theme].text} transition-colors disabled:opacity-50`}
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${status.loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mb-3 truncate" title={apiPath}>
          接口: {apiPath}
        </div>

        {status.loading && !status.lastDate && !status.error ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : status.error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-all">{status.error}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm ${themes[theme].text} opacity-70`}>最新数据日期</span>
              <span className={`text-sm font-medium ${themes[theme].text}`}>{status.lastDate}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className={`text-sm ${themes[theme].text} opacity-70`}>距今日相差</span>
              <div className="flex items-center gap-1.5">
                {status.diffDays === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : status.diffDays && status.diffDays <= 3 ? (
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className={`text-sm font-bold ${
                  status.diffDays === 0 
                    ? 'text-emerald-500' 
                    : status.diffDays && status.diffDays <= 3 
                      ? 'text-yellow-500' 
                      : 'text-red-500'
                }`}>
                  {status.diffDays} 天
                </span>
              </div>
            </div>

            {status.details && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                <div className={`text-xs font-medium mb-2 ${themes[theme].text} opacity-70`}>最后一条数据详情:</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {Object.entries(status.details)
                    .filter(([k]) => !['date', 'time'].includes(k))
                    .slice(0, 6) // 最多展示6个字段避免过长
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded">
                        <span className="text-gray-500 dark:text-gray-400 truncate mr-2" title={k}>{k}</span>
                        <span className={`${themes[theme].text} truncate`} title={formatValue(v)}>
                          {formatValue(v)}
                        </span>
                      </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${themes[theme].card} rounded-lg p-4 mt-6`}>
      <div className="mb-4">
        <h2 className={`text-xl font-bold ${themes[theme].text}`}>数据同步状态</h2>
        <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
          检查底层行情数据是否已更新到最新交易日（取任意一只股票作为探针）
        </p>
        <div className="text-xs text-gray-500 mt-2">
          探针股票: {DATA_FRESHNESS_CHECK_STOCK}
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {renderStatusCard('历史行情数据', HISTORY_DATA_API, historyStatus, fetchHistoryData)}
      </div>
    </div>
  );
}
