import React, { useState, useEffect } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { RefreshCw, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { stockService } from '../../../lib/services';

interface DataFreshnessStatusProps {
  theme: Theme;
}

const DATA_FRESHNESS_CHECK_STOCK = '588000.SH';
const HISTORY_DATA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/history`;
const TICKS_DATA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/ticks`;
const AKSHARE_SINA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/akshare/sina`;
const GTIMG_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/gtimg`;
const YFINANCE_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/yfinance`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const safeParseDateLike = (value: unknown): Date | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s === '-') return null;
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
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

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const formatPrice = (value: unknown): string => {
  const n = toNumberOrNull(value);
  if (n === null) return '-';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
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
  const [ticksStatus, setTicksStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [akshareSinaStatus, setAkshareSinaStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [gtimgStatus, setGtimgStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [yfinanceStatus, setYfinanceStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });

  const fetchHistoryData = async () => {
    setHistoryStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const { data, error } = await stockService.getStockHistoryRaw(DATA_FRESHNESS_CHECK_STOCK, { signal: controller.signal });
      clearTimeout(timeout);
      if (error) throw error;
      const list = (data || []).filter(isRecord);
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
    fetchTicksData();
    fetchGtimgData();
    fetchYfinanceData();
    fetchAkshareSinaData();
  }, []);

  const fetchTicksData = async () => {
    setTicksStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const { data, error } = await stockService.getStockTicksRaw(DATA_FRESHNESS_CHECK_STOCK, { signal: controller.signal });
      clearTimeout(timeout);
      if (error) throw error;
      const list = (data || []).filter(isRecord);
      if (list.length === 0) {
        throw new Error('未获取到数据或数据为空');
      }

      const lastItem = list[list.length - 1];
      const timetag = typeof lastItem.timetag === 'string' ? lastItem.timetag : '';
      const timeMs =
        typeof lastItem.time === 'number' && Number.isFinite(lastItem.time)
          ? lastItem.time
          : null;
      const lastDateStr = timetag || (timeMs !== null ? new Date(timeMs).toISOString() : '');
      if (!lastDateStr) {
        throw new Error('数据中未找到日期字段 (timetag/time)');
      }

      const d = timeMs !== null ? new Date(timeMs) : new Date(lastDateStr.replace(' ', 'T'));
      if (!Number.isFinite(d.getTime())) {
        throw new Error('日期解析失败');
      }

      const diff = differenceInCalendarDays(new Date(), d);
      setTicksStatus({
        loading: false,
        error: null,
        lastDate: lastDateStr,
        diffDays: diff,
        details: lastItem
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        setTicksStatus(prev => ({
          ...prev,
          loading: false,
          error: '请求超时'
        }));
        return;
      }
      setTicksStatus(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '请求失败'
      }));
    }
  };

  const fetchGtimgData = async () => {
    setGtimgStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const { data, error } = await stockService.getStockGtimgRaw(DATA_FRESHNESS_CHECK_STOCK, { signal: controller.signal });
      clearTimeout(timeout);
      if (error) throw error;

      const list = (data || []).filter(isRecord);
      if (list.length === 0) {
        throw new Error('未获取到数据或数据为空');
      }

      const lastItem = list[list.length - 1];
      const candidate =
        (typeof lastItem.date === 'string' && lastItem.date) ||
        (typeof lastItem.datetime === 'string' && lastItem.datetime) ||
        (typeof lastItem.time === 'string' && lastItem.time) ||
        (typeof lastItem.timetag === 'string' && lastItem.timetag) ||
        (typeof lastItem.timestamp === 'number' && Number.isFinite(lastItem.timestamp) ? lastItem.timestamp : null) ||
        (typeof lastItem.time === 'number' && Number.isFinite(lastItem.time) ? lastItem.time : null) ||
        null;

      const d = safeParseDateLike(candidate);
      if (!d) {
        throw new Error('日期解析失败');
      }

      const diff = differenceInCalendarDays(new Date(), d);
      const lastDateStr = typeof candidate === 'string' ? candidate : d.toISOString();
      setGtimgStatus({
        loading: false,
        error: null,
        lastDate: lastDateStr,
        diffDays: diff,
        details: lastItem
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        setGtimgStatus(prev => ({
          ...prev,
          loading: false,
          error: '请求超时'
        }));
        return;
      }
      setGtimgStatus(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '请求失败'
      }));
    }
  };

  const fetchYfinanceData = async () => {
    setYfinanceStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const { data, error } = await stockService.getStockYfinanceRaw(DATA_FRESHNESS_CHECK_STOCK, { signal: controller.signal });
      clearTimeout(timeout);
      if (error) throw error;

      const list = (data || []).filter(isRecord);
      if (list.length === 0) {
        throw new Error('未获取到数据或数据为空');
      }

      const lastItem = list[list.length - 1];
      const candidate =
        (typeof lastItem.date === 'string' && lastItem.date) ||
        (typeof lastItem.datetime === 'string' && lastItem.datetime) ||
        (typeof lastItem.time === 'string' && lastItem.time) ||
        (typeof lastItem.timetag === 'string' && lastItem.timetag) ||
        (typeof lastItem.timestamp === 'number' && Number.isFinite(lastItem.timestamp) ? lastItem.timestamp : null) ||
        (typeof lastItem.time === 'number' && Number.isFinite(lastItem.time) ? lastItem.time : null) ||
        null;

      const d = safeParseDateLike(candidate);
      if (!d) {
        throw new Error('日期解析失败');
      }

      const diff = differenceInCalendarDays(new Date(), d);
      const lastDateStr = typeof candidate === 'string' ? candidate : d.toISOString();
      setYfinanceStatus({
        loading: false,
        error: null,
        lastDate: lastDateStr,
        diffDays: diff,
        details: lastItem
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        setYfinanceStatus(prev => ({
          ...prev,
          loading: false,
          error: '请求超时'
        }));
        return;
      }
      setYfinanceStatus(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '请求失败'
      }));
    }
  };

  const fetchAkshareSinaData = async () => {
    setAkshareSinaStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(AKSHARE_SINA_API, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      const list = (() => {
        if (Array.isArray(payload)) return payload.filter(isRecord);
        if (!isRecord(payload)) return [];
        const nested = payload.data;
        if (Array.isArray(nested)) return nested.filter(isRecord);
        if (isRecord(nested) && Array.isArray(nested.data)) return nested.data.filter(isRecord);
        if (Array.isArray(payload.list)) return payload.list.filter(isRecord);
        if (Array.isArray(payload.items)) return payload.items.filter(isRecord);
        return [];
      })();

      if (list.length === 0) {
        throw new Error('未获取到数据或数据为空');
      }

      const lastItem = list[list.length - 1];
      const candidate =
        (typeof lastItem.date === 'string' && lastItem.date) ||
        (typeof lastItem.datetime === 'string' && lastItem.datetime) ||
        (typeof lastItem.time === 'string' && lastItem.time) ||
        (typeof lastItem.timetag === 'string' && lastItem.timetag) ||
        (typeof lastItem.timestamp === 'number' && Number.isFinite(lastItem.timestamp) ? lastItem.timestamp : null) ||
        (typeof lastItem.time === 'number' && Number.isFinite(lastItem.time) ? lastItem.time : null) ||
        null;

      const d = safeParseDateLike(candidate);
      if (!d) {
        throw new Error('日期解析失败');
      }

      const diff = differenceInCalendarDays(new Date(), d);
      const lastDateStr = typeof candidate === 'string' ? candidate : d.toISOString();
      setAkshareSinaStatus({
        loading: false,
        error: null,
        lastDate: lastDateStr,
        diffDays: diff,
        details: lastItem
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        setAkshareSinaStatus(prev => ({
          ...prev,
          loading: false,
          error: '请求超时'
        }));
        return;
      }
      setAkshareSinaStatus(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '请求失败'
      }));
    }
  };

  const refreshAll = () => {
    fetchHistoryData();
    fetchTicksData();
    fetchGtimgData();
    fetchYfinanceData();
    fetchAkshareSinaData();
  };

  const anyLoading =
    historyStatus.loading ||
    ticksStatus.loading ||
    gtimgStatus.loading ||
    yfinanceStatus.loading ||
    akshareSinaStatus.loading;

  const getStatusLevel = (status: DataCheckResult): 'ok' | 'warn' | 'bad' => {
    if (status.error) return 'bad';
    if (status.diffDays === null) return 'warn';
    if (status.diffDays === 0) return 'ok';
    if (status.diffDays <= 3) return 'warn';
    return 'bad';
  };

  const StatusIcon = ({ status }: { status: DataCheckResult }) => {
    const level = getStatusLevel(status);
    if (level === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (level === 'warn') return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <AlertCircle className="w-4 h-4 text-red-500" />;
  };

  type CheckConfig = {
    key: string;
    title: string;
    apiPath: string;
    status: DataCheckResult;
    refresh: () => void;
    lastLabel: string;
    primary: Array<{ label: string; value: unknown }>;
    excludeDetailKeys: string[];
  };

  const checks: CheckConfig[] = [
    {
      key: 'history',
      title: '历史行情',
      apiPath: HISTORY_DATA_API,
      status: historyStatus,
      refresh: fetchHistoryData,
      lastLabel: '最新日期',
      primary: [
        { label: '收盘', value: historyStatus.details?.close },
        { label: '开盘', value: historyStatus.details?.open },
      ],
      excludeDetailKeys: ['date'],
    },
    {
      key: 'ticks',
      title: 'Tick',
      apiPath: TICKS_DATA_API,
      status: ticksStatus,
      refresh: fetchTicksData,
      lastLabel: '最新时间',
      primary: [
        { label: '收盘', value: ticksStatus.details?.lastPrice },
        { label: '开盘', value: ticksStatus.details?.open },
      ],
      excludeDetailKeys: ['timetag'],
    },
    {
      key: 'gtimg',
      title: 'GTIMG',
      apiPath: GTIMG_API,
      status: gtimgStatus,
      refresh: fetchGtimgData,
      lastLabel: '最新时间',
      primary: [
        { label: '最新', value: gtimgStatus.details?.lastPrice ?? gtimgStatus.details?.price ?? gtimgStatus.details?.close },
        { label: '开盘', value: gtimgStatus.details?.open },
      ],
      excludeDetailKeys: ['date', 'datetime', 'timetag', 'time', 'timestamp'],
    },
    {
      key: 'yfinance',
      title: 'yfinance',
      apiPath: YFINANCE_API,
      status: yfinanceStatus,
      refresh: fetchYfinanceData,
      lastLabel: '最新时间',
      primary: [
        { label: '最新', value: yfinanceStatus.details?.close ?? yfinanceStatus.details?.lastPrice ?? yfinanceStatus.details?.price },
        { label: '开盘', value: yfinanceStatus.details?.open },
      ],
      excludeDetailKeys: ['date', 'datetime', 'timetag', 'time', 'timestamp'],
    },
    {
      key: 'akshare_sina',
      title: 'AkShare / 新浪',
      apiPath: AKSHARE_SINA_API,
      status: akshareSinaStatus,
      refresh: fetchAkshareSinaData,
      lastLabel: '最新时间',
      primary: [
        { label: '收盘', value: akshareSinaStatus.details?.close ?? akshareSinaStatus.details?.lastPrice },
        { label: '开盘', value: akshareSinaStatus.details?.open },
      ],
      excludeDetailKeys: ['date', 'datetime', 'timetag', 'time', 'timestamp'],
    },
  ];

  const renderStatusRow = (c: CheckConfig) => {
    return (
      <div key={c.key} className="py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            <StatusIcon status={c.status} />
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${themes[theme].text} leading-5`}>{c.title}</div>
              <div className="text-[11px] text-gray-500 truncate" title={c.apiPath}>
                {c.apiPath}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={c.refresh}
              disabled={c.status.loading}
              className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${themes[theme].text} transition-colors disabled:opacity-50`}
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${c.status.loading ? 'animate-spin' : ''}`} />
            </button>
            {c.status.details && (
              <details className="group">
                <summary
                  className={`list-none cursor-pointer select-none inline-flex items-center gap-1 text-xs ${themes[theme].text} opacity-75 hover:opacity-100`}
                >
                  详情
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                  {Object.entries(c.status.details)
                    .filter(([k]) => !c.excludeDetailKeys.includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded">
                        <span className="text-gray-500 dark:text-gray-400 truncate mr-2" title={k}>{k}</span>
                        <span className={`${themes[theme].text} truncate`} title={formatValue(v)}>
                          {formatValue(v)}
                        </span>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          {c.status.error ? (
            <div className="col-span-2 md:col-span-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-all">{c.status.error}</span>
            </div>
          ) : c.status.loading && !c.status.lastDate ? (
            <div className="col-span-2 md:col-span-4 flex items-center gap-2 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`${themes[theme].text} opacity-70`}>{c.lastLabel}</span>
                <span className={`${themes[theme].text} font-medium truncate`} title={c.status.lastDate ?? ''}>
                  {c.status.lastDate ?? '-'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`${themes[theme].text} opacity-70`}>距今日</span>
                <span className={`${themes[theme].text} font-medium`}>
                  {c.status.diffDays ?? '-'} 天
                </span>
              </div>
              {c.primary.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-2">
                  <span className={`${themes[theme].text} opacity-70`}>{p.label}</span>
                  <span className={`${themes[theme].text} font-semibold`}>{formatPrice(p.value)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`${themes[theme].card} rounded-lg p-4 mt-6`}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>数据同步状态</h2>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
          检查底层行情数据是否已更新到最新交易日（取任意一只股票作为探针）
          </p>
          <div className="text-xs text-gray-500 mt-2">
            探针股票: {DATA_FRESHNESS_CHECK_STOCK}
          </div>
        </div>
        <button
          onClick={refreshAll}
          disabled={anyLoading}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary} disabled:opacity-50`}
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {checks.map(renderStatusRow)}
      </div>
    </div>
  );
}
