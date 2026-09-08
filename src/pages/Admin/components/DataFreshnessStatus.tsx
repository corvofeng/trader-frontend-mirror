import { useState, useEffect } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { stockService } from '../../../lib/services';

interface DataFreshnessStatusProps {
  theme: Theme;
  lastTradingDay?: string | null;
}

const DATA_FRESHNESS_CHECK_STOCK = '588000.SH';
const HISTORY_DATA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/history`;
const TICKS_DATA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/ticks`;
const AKSHARE_SINA_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/akshare/sina`;
const GTIMG_API = `/api/stocks/${encodeURIComponent(DATA_FRESHNESS_CHECK_STOCK)}/gtimg`;

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

const formatDateOnly = (value: unknown): string => {
  const d = safeParseDateLike(value);
  if (d) return format(d, 'yyyy-MM-dd');
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '-';
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  return '-';
};

type DataCheckResult = {
  loading: boolean;
  error: string | null;
  lastDate: string | null;
  diffDays: number | null;
  details: Record<string, unknown> | null;
};

export function DataFreshnessStatus({ theme, lastTradingDay }: DataFreshnessStatusProps) {
  const [historyStatus, setHistoryStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [ticksStatus, setTicksStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [akshareSinaStatus, setAkshareSinaStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [gtimgStatus, setGtimgStatus] = useState<DataCheckResult>({ loading: true, error: null, lastDate: null, diffDays: null, details: null });
  const [activeDetailKey, setActiveDetailKey] = useState<string | null>(null);

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
    fetchAkshareSinaData();
  }, []);

  useEffect(() => {
    if (!activeDetailKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveDetailKey(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeDetailKey]);

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
    fetchAkshareSinaData();
  };

  const anyLoading =
    historyStatus.loading ||
    ticksStatus.loading ||
    gtimgStatus.loading ||
    akshareSinaStatus.loading;

  const computeFreshness = (
    status: DataCheckResult
  ): { diffDays: number | null; level: 'ok' | 'warn' | 'bad' } => {
    if (status.error) return { diffDays: null, level: 'bad' };
    if (!status.lastDate) return { diffDays: null, level: 'warn' };

    const d = safeParseDateLike(status.lastDate);
    if (!d) return { diffDays: null, level: 'warn' };

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const targetDateStr = lastTradingDay || todayStr;
    const targetDate = safeParseDateLike(targetDateStr) || today;

    const diffDays = Math.max(0, differenceInCalendarDays(targetDate, d));

    if (lastTradingDay) {
      if (lastTradingDay === todayStr) {
        // 当天是交易日：盘中或收盘前部分历史数据可能尚未归档，若数据在当天或上一交易日（diffDays <= 1）均为正常
        const level = diffDays <= 1 ? 'ok' : diffDays <= 3 ? 'warn' : 'bad';
        return { diffDays, level };
      }
      // 历史交易日：已同步到最近交易日（diffDays === 0）为正常
      const level = diffDays === 0 ? 'ok' : diffDays <= 3 ? 'warn' : 'bad';
      return { diffDays, level };
    }

    // 兜底（未传入 lastTradingDay）
    const level = diffDays === 0 ? 'ok' : diffDays <= 3 ? 'warn' : 'bad';
    return { diffDays, level };
  };

  const getStatusMeta = (status: DataCheckResult) => {
    const { diffDays, level } = computeFreshness(status);
    return {
      diffDays,
      level,
      badgeClass:
        level === 'ok'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100'
          : level === 'warn'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100'
            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100',
      label:
        status.loading
          ? '加载中'
          : status.error
            ? '异常'
            : level === 'ok'
              ? '正常'
              : level === 'warn'
                ? '延迟'
                : '过期',
    };
  };

  const StatusIcon = ({ status }: { status: DataCheckResult }) => {
    const { level } = computeFreshness(status);
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

  const activeCheck = activeDetailKey ? checks.find((item) => item.key === activeDetailKey) ?? null : null;

  return (
    <>
    <div className={`${themes[theme].card} rounded-lg p-4 mt-6`}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>数据同步状态</h2>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
            检查底层行情数据是否已更新到最新交易日（取任意一只股票作为探针）
            {lastTradingDay ? ` · 基准交易日: ${lastTradingDay}` : ''}
          </p>
          <div className="text-xs text-gray-500 mt-2">
            探针股票: {DATA_FRESHNESS_CHECK_STOCK}
          </div>
        </div>
        <button
          onClick={refreshAll}
          disabled={anyLoading}
          className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary} disabled:opacity-50 sm:self-start`}
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-800 text-xs sm:text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-gray-50/90 dark:bg-gray-900/50">
            <tr>
              <th className="px-2 py-3 text-left text-[11px] font-semibold text-gray-500 sm:px-3">数据源</th>
              <th className="px-2 py-3 text-left text-[11px] font-semibold text-gray-500 sm:px-3">日期</th>
              <th className="px-2 py-3 text-center text-[11px] font-semibold text-gray-500 sm:px-3">滞后</th>
              <th className="px-2 py-3 text-right text-[11px] font-semibold text-gray-500 sm:px-3">最新</th>
              <th className="px-2 py-3 text-right text-[11px] font-semibold text-gray-500 sm:px-3">开盘</th>
              <th className="px-2 py-3 text-right text-[11px] font-semibold text-gray-500 sm:px-3">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {checks.map((c) => {
              const primaryValue = formatPrice(c.primary[0]?.value);
              const secondaryValue = formatPrice(c.primary[1]?.value);
              const statusMeta = getStatusMeta(c.status);

              return (
                <tr key={c.key} className="align-middle hover:bg-gray-50/60 dark:hover:bg-gray-900/20">
                  <td className="px-2 py-3 sm:px-3">
                    <div className={`font-semibold ${themes[theme].text}`}>{c.title}</div>
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.badgeClass}`}>
                        <StatusIcon status={c.status} />
                        {statusMeta.label}
                      </span>
                    </div>
                    {c.status.error && (
                      <div className="mt-1 text-[11px] text-red-500 break-all">{c.status.error}</div>
                    )}
                  </td>
                  <td className={`px-2 py-3 ${themes[theme].text} whitespace-nowrap sm:px-3`}>
                    {formatDateOnly(c.status.lastDate)}
                  </td>
                  <td className={`px-2 py-3 text-center ${themes[theme].text} whitespace-nowrap sm:px-3`}>
                    {statusMeta.diffDays ?? '-'} 天
                  </td>
                  <td className={`px-2 py-3 text-right ${themes[theme].text} whitespace-nowrap sm:px-3`}>
                    {primaryValue}
                  </td>
                  <td className={`px-2 py-3 text-right ${themes[theme].text} whitespace-nowrap sm:px-3`}>
                    {secondaryValue}
                  </td>
                  <td className="px-2 py-3 text-right sm:px-3">
                    <button
                      onClick={() => setActiveDetailKey(c.key)}
                      className={`inline-flex items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-medium ${themes[theme].secondary}`}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {activeCheck && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={() => setActiveDetailKey(null)} />
        <div className={`relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl ${themes[theme].card}`}>
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
            <div className="min-w-0">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>{activeCheck.title} 详情</h3>
              <div className="mt-1 text-xs text-gray-500 break-all">{activeCheck.apiPath}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={activeCheck.refresh}
                disabled={activeCheck.status.loading}
                className={`p-2 rounded-md ${themes[theme].secondary} disabled:opacity-50`}
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${activeCheck.status.loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setActiveDetailKey(null)}
                className={`p-2 rounded-md ${themes[theme].secondary}`}
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-4 space-y-4">
            {activeCheck.status.error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {activeCheck.status.error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                <div className={`${themes[theme].text} opacity-70 text-xs`}>日期</div>
                <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>{formatDateOnly(activeCheck.status.lastDate)}</div>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                <div className={`${themes[theme].text} opacity-70 text-xs`}>{lastTradingDay ? '滞后交易日' : '距今日'}</div>
                <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>{getStatusMeta(activeCheck.status).diffDays ?? '-'} 天</div>
              </div>
              {activeCheck.primary.map((item) => (
                <div key={item.label} className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                  <div className={`${themes[theme].text} opacity-70 text-xs`}>{item.label}</div>
                  <div className={`${themes[theme].text} mt-1 text-sm font-medium break-all`}>{formatPrice(item.value)}</div>
                </div>
              ))}
            </div>

            {activeCheck.status.details && (
              <>
                <div>
                  <div className={`mb-2 text-sm font-medium ${themes[theme].text}`}>摘要字段</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(activeCheck.status.details)
                      .filter(([k]) => !activeCheck.excludeDetailKeys.includes(k))
                      .map(([k, v]) => (
                        <div key={k} className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                          <div className="text-[11px] text-gray-500 break-all">{k}</div>
                          <div className={`mt-1 text-xs ${themes[theme].text} break-all font-mono`}>
                            {formatValue(v)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div className={`mb-2 text-sm font-medium ${themes[theme].text}`}>原始数据</div>
                  <pre className="rounded-md border border-gray-200 bg-gray-50 p-3 text-[11px] leading-5 text-gray-700 overflow-auto dark:border-gray-700 dark:bg-black/20 dark:text-gray-200">
                    {JSON.stringify(activeCheck.status.details, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
