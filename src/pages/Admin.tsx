import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Calendar, RefreshCw, BookOpen, History as HistoryIcon, ListChecks, HeartPulse, Bell, Upload, X, Play, Copy, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay, differenceInCalendarDays } from 'date-fns';
import { logger } from '../shared/utils/logger';
import { Theme, themes } from '../lib/theme';
import { AccountSelector } from '../shared/components/AccountSelector';
import { TabNavigation } from './Journal/components/TabNavigation';
import { OperationsView, UploadPage } from './Journal/features';
import { accountService, authService, optionsService, stockService } from '../lib/services';
import type { Account, AdminAccountStatusItem, AdminOrdersDailyStats, OptionOrder } from '../lib/services/types';
import { AnalysisTab } from './Journal/components/AnalysisTab';
import { HistoryTradesChart } from '../features/trading/components/HistoryTradesChart';
import { DailyTradeHistory } from '../features/trading/components/DailyTradeHistory';
import { SequentialTradeTasks } from '../features/options/components/SequentialTradeTasks';
import { DataFreshnessStatus } from './Admin/components/DataFreshnessStatus';
import { CashFlowsView } from './Admin/components/CashFlowsView';
import {
  ADMIN_ACCOUNT_STORAGE,
  getAccountAliasFromSearch,
  persistAccountAlias,
  resolveCurrentAccountAlias,
  withAccountAliasInSearch,
} from '../shared/utils/accountSelection';
import { ADMIN_DEFAULT_TAB, ADMIN_TABS, type AdminTab, normalizeTab } from '../shared/utils/tabRouting';
import { useAdminWebMcp } from './Admin/hooks/useAdminWebMcp';
import { WebMcpBadge } from '../lib/webmcp/components/WebMcpBadge';

interface AdminProps {
  theme: Theme;
}

type AdminNoticeTimeBucket = 'today' | 'recent3days' | 'older' | 'unknown';

const safeParseAdminNoticeDate = (raw: unknown): Date | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s === '-') return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
};

const safeParseBackendDateTime = (raw: unknown): Date | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s === '-') return null;
  const d = s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T'));
  return Number.isFinite(d.getTime()) ? d : null;
};

const formatBackendDateOnly = (raw: unknown): string => {
  const d = safeParseBackendDateTime(raw);
  if (d) return format(d, 'yyyy-MM-dd');
  if (typeof raw !== 'string') return '-';
  const s = raw.trim();
  if (!s || s === '-') return '-';
  return s.length >= 10 ? s.slice(0, 10) : s;
};

const getAdminNoticeTimeBucket = (createdAt: unknown): AdminNoticeTimeBucket => {
  const created = safeParseAdminNoticeDate(createdAt);
  if (!created) return 'unknown';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recent3DaysStart = new Date(todayStart);
  recent3DaysStart.setDate(todayStart.getDate() - 3);
  if (created >= todayStart) return 'today';
  if (created >= recent3DaysStart) return 'recent3days';
  return 'older';
};

const adminNoticeBucketLabel: Record<AdminNoticeTimeBucket, string> = {
  today: '今天',
  recent3days: '最近 3 天',
  older: '超过 3 天',
  unknown: '未知时间'
};

interface NoticeLeg {
  symbol?: string;
  contract_code?: string;
  contractCode?: string;
  side?: string;
  price?: number | string;
  quantity?: number | string;
}

interface NoticeAction {
  account_id_alias?: string;
  action?: string;
  action_id?: string | number | null;
  combo_id?: string;
  comboId?: string;
  expiry_date?: string;
  expiryDate?: string;
  legs?: NoticeLeg[];
}

const actionNames: Record<string, string> = {
  'RELEASE_COMBINATION': '解除组合',
  'CLOSE_STRATEGY': '策略平仓',
  'PLACE_ORDERS': '下单执行',
  'SYNC_POSITIONS': '同步持仓',
};

export function Admin({ theme }: AdminProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedAccountAlias = useMemo(() => getAccountAliasFromSearch(location.search) || '', [location.search]);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const params = new URLSearchParams(location.search);
    return normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, params.get('tab'));
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    return resolveCurrentAccountAlias({
      search: location.search,
      storage: ADMIN_ACCOUNT_STORAGE,
    });
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const effectiveUserId = userId ?? 'demo';
  const [accountAccessError, setAccountAccessError] = useState<string | null>(null);
  const [accessibleAccountKeys, setAccessibleAccountKeys] = useState<string[] | null>(null);
  const [defaultAccountKey, setDefaultAccountKey] = useState<string | null>(null);
  const [historyDateRange] = useState(() => ({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  }));

  const [ordersByDate, setOrdersByDate] = useState<Record<string, OptionOrder[]>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [tradingDaysByYear, setTradingDaysByYear] = useState<Record<number, Set<string>>>({});
  const [tradingCalendarError, setTradingCalendarError] = useState<string | null>(null);
  const [ordersStatsByMonth, setOrdersStatsByMonth] = useState<Record<string, Record<string, AdminOrdersDailyStats>>>({});
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const heartbeatIntervalMs = 5000;
  const [accountsStatus, setAccountsStatus] = useState<AdminAccountStatusItem[]>([]);
  const [accountsLastTradingDay, setAccountsLastTradingDay] = useState<string | null>(null);
  const [accountsHeartbeatError, setAccountsHeartbeatError] = useState<string | null>(null);
  const [accountsHeartbeatLastOkAt, setAccountsHeartbeatLastOkAt] = useState<number | null>(null);
  const [accountsHeartbeatLatencyMs, setAccountsHeartbeatLatencyMs] = useState<number | null>(null);
  const [accountsHeartbeatInFlight, setAccountsHeartbeatInFlight] = useState(false);
  const accountsHeartbeatAbortRef = React.useRef<AbortController | null>(null);
  const [activeAccountDetailKey, setActiveAccountDetailKey] = useState<string | null>(null);

  React.useEffect(() => {
    if (!requestedAccountAlias || requestedAccountAlias === selectedAccountId) return;
    setSelectedAccountId(requestedAccountAlias);
  }, [requestedAccountAlias]);

  React.useEffect(() => {
    const nextQuery = withAccountAliasInSearch(location.search, selectedAccountId);
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(nextQuery ? `/admin?${nextQuery}` : '/admin', { replace: true });
  }, [location.search, navigate, selectedAccountId]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabRaw = params.get('tab');
    const nextTab = normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, tabRaw);

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }

    if (tabRaw !== nextTab) {
      params.set('tab', nextTab);
      const nextQuery = params.toString();
      const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
      if (nextQuery !== currentQuery) {
        navigate(nextQuery ? `/admin?${nextQuery}` : '/admin', { replace: true });
      }
    }
  }, [activeTab, location.search, navigate]);

  const accountsSnapshotMeta = useMemo(() => {
    const snapshotMsByKey = new Map<string, number | null>();
    let maxSnapshotMs: number | null = null;
    let maxSnapshotDateStr: string | null = null;

    for (const item of accountsStatus) {
      const key = item.account_id_alias || item.alias;
      const d = safeParseBackendDateTime(item.last_snapshot_at);
      const ms = d ? d.getTime() : null;
      const dateStr = formatBackendDateOnly(item.last_snapshot_at);
      snapshotMsByKey.set(key, ms);
      if (ms !== null) {
        maxSnapshotMs = maxSnapshotMs === null ? ms : Math.max(maxSnapshotMs, ms);
      }
      if (dateStr !== '-') {
        if (!maxSnapshotDateStr || dateStr > maxSnapshotDateStr) {
          maxSnapshotDateStr = dateStr;
        }
      }
    }

    return { snapshotMsByKey, maxSnapshotMs, maxSnapshotDateStr };
  }, [accountsStatus]);

  const checkSnapshotStale = React.useCallback(
    (snapshotRaw: unknown, itemTradingDay?: string | null): boolean => {
      const snapshotDateStr = formatBackendDateOnly(snapshotRaw);
      if (!snapshotDateStr || snapshotDateStr === '-') return true;

      const tradingDay = (typeof itemTradingDay === 'string' && itemTradingDay.trim())
        ? itemTradingDay.trim()
        : accountsLastTradingDay;

      if (tradingDay) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        // 如果 last_trading_day 是当天，快照可能尚未创建，不判定为偏旧
        if (tradingDay === todayStr) {
          return false;
        }
        // 比较快照日期是否早于最近交易日
        return snapshotDateStr < tradingDay;
      }

      // 兜底：若接口未返回 last_trading_day，按同批账户最新自然日比较
      if (accountsSnapshotMeta.maxSnapshotDateStr) {
        return snapshotDateStr < accountsSnapshotMeta.maxSnapshotDateStr;
      }

      return false;
    },
    [accountsLastTradingDay, accountsSnapshotMeta.maxSnapshotDateStr]
  );

  const activeAccountDetail = useMemo(() => {
    if (!activeAccountDetailKey) return null;
    return accountsStatus.find((item) => (item.account_id_alias || item.alias) === activeAccountDetailKey) ?? null;
  }, [activeAccountDetailKey, accountsStatus]);

  type NoticeUserScope = 'current' | 'all' | 'custom';
  type NoticeResolvedFilter = 'all' | 'resolved' | 'unresolved';
  type NoticeExecStatusFilter = 'all' | 'success' | 'failed' | 'pending';

  const [noticeUserScope, setNoticeUserScope] = useState<NoticeUserScope>(() => {
    const params = new URLSearchParams(location.search);
    const rawScope = params.get('noticeUserScope') || localStorage.getItem('adminNoticeUserScope') || '';
    if (rawScope === 'current' || rawScope === 'all' || rawScope === 'custom') return rawScope;
    const savedUserId = params.get('noticeUserId') || localStorage.getItem('adminNoticeUserId') || '';
    return savedUserId ? 'custom' : 'current';
  });
  const [noticeQueryUserId, setNoticeQueryUserId] = useState<string>(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get('noticeUserId') ||
      localStorage.getItem('adminNoticeUserId') ||
      ''
    );
  });
  const [noticeLookbackDays, setNoticeLookbackDays] = useState<number>(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('noticeDays') || localStorage.getItem('adminNoticeDays') || '7';
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(365, Math.max(1, Math.floor(parsed))) : 7;
  });
  const [noticeResolvedFilter, setNoticeResolvedFilter] = useState<NoticeResolvedFilter>('all');
  const [noticeExecStatusFilter, setNoticeExecStatusFilter] = useState<NoticeExecStatusFilter>('all');
  const [adminNotices, setAdminNotices] = useState<Array<Record<string, unknown>>>([]);
  const [adminNoticesLoading, setAdminNoticesLoading] = useState(false);
  const [adminNoticesError, setAdminNoticesError] = useState<string | null>(null);
  const [adminNoticesLastOkAt, setAdminNoticesLastOkAt] = useState<number | null>(null);
  const [adminNoticesLatencyMs, setAdminNoticesLatencyMs] = useState<number | null>(null);
  const [expandedAdminNoticeKey, setExpandedAdminNoticeKey] = useState<string | null>(null);
  const adminNoticesAbortRef = React.useRef<AbortController | null>(null);

  const handleExecuteNoticeAction = React.useCallback((noticeItem: Record<string, unknown>, actionItem: NoticeAction) => {
    console.log('Execute notice action clicked:', { notice: noticeItem, action: actionItem });
    const comboId = actionItem.combo_id || actionItem.comboId || '-';
    const actionVal = actionItem.action || '';
    toast.success(`已触发动作: ${actionNames[actionVal] || actionVal || '未知'}${comboId !== '-' ? `, 组合ID: ${comboId}` : ''} (等待处理)`);
  }, []);

  const handleTabChange = (newTab: AdminTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/admin?${params.toString()}`, { replace: true });
  };

  React.useEffect(() => {
    authService.getUser().then(res => {
      const u = res?.data?.user;
      setUserId(u?.id || null);
    }).catch(() => setUserId(null));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const mergeAccounts = (lists: Account[][]) => {
      const map = new Map<string, Account>();
      for (const list of lists) {
        for (const account of list) {
          const key = account.alias || account.id;
          if (!key) continue;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, account);
            continue;
          }
          if (!existing.is_default && account.is_default) {
            map.set(key, account);
          }
        }
      }
      return Array.from(map.values());
    };

    const load = async () => {
      setAccessibleAccountKeys(null);
      setDefaultAccountKey(null);
      try {
        const [stocksResponse, optionsResponse] = await Promise.all([
          accountService.getAccounts(effectiveUserId),
          accountService.getOptionsAccounts(effectiveUserId),
        ]);
        const accounts = mergeAccounts([
          ((stocksResponse.data || []) as Account[]),
          ((optionsResponse.data || []) as Account[]),
        ]);
        if (cancelled) return;

        const keys = accounts
          .map((acc) => acc.alias || acc.id)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        const def = accounts.find((acc) => acc.is_default) || accounts[0];
        setAccessibleAccountKeys(keys);
        setDefaultAccountKey((def?.alias || def?.id || null) ?? null);
      } catch (err) {
        if (cancelled) return;
        setAccessibleAccountKeys(null);
        setDefaultAccountKey(null);
        setAccountAccessError(err instanceof Error ? err.message : '账户列表加载失败，无法校验 account_alias');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId]);

  React.useEffect(() => {
    if (!accessibleAccountKeys) return;
    const allowed = new Set(accessibleAccountKeys);
    const requested = requestedAccountAlias;

    if (requested && !allowed.has(requested)) {
      setAccountAccessError(`无权访问账户: ${requested}，已切换到默认账户`);
      const fallbackId = defaultAccountKey || null;
      if (fallbackId !== selectedAccountId) {
        setSelectedAccountId(fallbackId);
      }
      // 从 URL 中删除无权访问的 account_alias 并重定向
      const params = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search);
      params.delete('account_alias');
      const nextQuery = params.toString();
      navigate(nextQuery ? `/admin?${nextQuery}` : '/admin', { replace: true });
      return;
    }

    if (selectedAccountId && !allowed.has(selectedAccountId)) {
      setAccountAccessError(`无权访问账户: ${selectedAccountId}，已切换到默认账户`);
      if (defaultAccountKey && defaultAccountKey !== selectedAccountId) {
        setSelectedAccountId(defaultAccountKey);
      } else if (!defaultAccountKey) {
        setSelectedAccountId(null);
      }
      return;
    }

    setAccountAccessError(null);
  }, [accessibleAccountKeys, defaultAccountKey, requestedAccountAlias, selectedAccountId]);

  React.useEffect(() => {
    if (noticeUserScope !== 'current') return;
    if (!userId) return;
    setNoticeQueryUserId(userId);
  }, [noticeUserScope, userId]);

  React.useEffect(() => {
    if (activeTab === 'calendar') {
      setOrdersByDate({});
      setOrdersStatsByMonth({});
    }
  }, [refreshKey, activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'accounts') return;

    let cancelled = false;
    let intervalId: number | null = null;

    const tick = async () => {
      if (cancelled) return;

      if (accountsHeartbeatAbortRef.current) {
        accountsHeartbeatAbortRef.current.abort();
      }
      const controller = new AbortController();
      accountsHeartbeatAbortRef.current = controller;

      const startedAt = performance.now();
      setAccountsHeartbeatInFlight(true);
      try {
        const { data, error, meta } = await accountService.getAdminAccountsStatus({ signal: controller.signal });
        if (error) throw error;
        const normalized = data || [];
        const extractedTradingDay =
          meta && typeof meta === 'object' && 'last_trading_day' in meta && typeof (meta as { last_trading_day: unknown }).last_trading_day === 'string'
            ? (meta as { last_trading_day: string }).last_trading_day.trim()
            : normalized.find((item) => item.last_trading_day)?.last_trading_day || null;

        if (!cancelled) {
          setAccountsStatus(normalized);
          setAccountsLastTradingDay(extractedTradingDay);
          setAccountsHeartbeatError(null);
          setAccountsHeartbeatLastOkAt(Date.now());
          setAccountsHeartbeatLatencyMs(Math.max(0, Math.round(performance.now() - startedAt)));
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : '请求失败';
        setAccountsHeartbeatError(message);
      } finally {
        if (!cancelled) setAccountsHeartbeatInFlight(false);
      }
    };

    tick();
    intervalId = window.setInterval(tick, heartbeatIntervalMs);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (accountsHeartbeatAbortRef.current) accountsHeartbeatAbortRef.current.abort();
    };
  }, [activeTab, refreshKey]);

  React.useEffect(() => {
    if (!activeAccountDetailKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveAccountDetailKey(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeAccountDetailKey]);

  const normalizeAdminNoticeList = React.useCallback((payload: unknown): Array<Record<string, unknown>> => {
    const unwrap = (v: unknown): unknown => {
      if (!v || typeof v !== 'object') return v;
      const r = v as Record<string, unknown>;
      if (Array.isArray(r.data)) return r.data;
      if (Array.isArray(r.notices)) return r.notices;
      if (r.data && typeof r.data === 'object') {
        const nested = r.data as Record<string, unknown>;
        if (Array.isArray(nested.data)) return nested.data;
        if (Array.isArray(nested.notices)) return nested.notices;
        if (Array.isArray(nested.items)) return nested.items;
        if (Array.isArray(nested.list)) return nested.list;
      }
      if (Array.isArray(r.items)) return r.items;
      if (Array.isArray(r.list)) return r.list;
      return v;
    };

    const unwrapped = unwrap(payload);
    if (Array.isArray(unwrapped)) {
      return unwrapped
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v))
        .map(v => ({ ...v }));
    }
    return [];
  }, []);

  const fetchAdminNotices = React.useCallback(async () => {
    if (!selectedAccountId) {
      setAdminNotices([]);
      setAdminNoticesError('请选择账户后再查询提醒');
      setAdminNoticesLoading(false);
      return;
    }

    if (adminNoticesAbortRef.current) adminNoticesAbortRef.current.abort();
    const controller = new AbortController();
    adminNoticesAbortRef.current = controller;

    const startedAt = performance.now();
    setAdminNoticesLoading(true);
    setAdminNoticesError(null);
    try {
      const params = new URLSearchParams();
      if (noticeUserScope === 'custom') {
        if (noticeQueryUserId.trim()) params.set('userId', noticeQueryUserId.trim());
      } else if (noticeUserScope === 'current') {
        if (effectiveUserId.trim()) params.set('userId', effectiveUserId.trim());
      }
      params.set('days', String(noticeLookbackDays));

      const url = `/api/admin/${encodeURIComponent(selectedAccountId)}/notices${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { signal: controller.signal });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      if (!response.ok) {
        const messageFromJson =
          body && typeof body === 'object'
            ? String((body as Record<string, unknown>).message || (body as Record<string, unknown>).error || response.statusText)
            : '';
        const message = typeof body === 'string' ? body : messageFromJson;
        throw new Error(message || `HTTP ${response.status}`);
      }

      const list = normalizeAdminNoticeList(body);
      setAdminNotices(list);
      setAdminNoticesLastOkAt(Date.now());
      setAdminNoticesLatencyMs(Math.max(0, Math.round(performance.now() - startedAt)));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : '请求失败';
      setAdminNoticesError(message);
    } finally {
      setAdminNoticesLoading(false);
    }
  }, [effectiveUserId, normalizeAdminNoticeList, noticeLookbackDays, noticeQueryUserId, noticeUserScope, selectedAccountId]);

  React.useEffect(() => {
    if (activeTab !== 'notices') return;
    if (selectedAccountId) {
      fetchAdminNotices();
    } else {
      setAdminNotices([]);
      setAdminNoticesError('请选择账户后再查询提醒');
    }
    return () => {
      if (adminNoticesAbortRef.current) adminNoticesAbortRef.current.abort();
    };
  }, [activeTab, fetchAdminNotices, refreshKey, selectedAccountId]);

  React.useEffect(() => {
    try {
      localStorage.setItem('adminNoticeUserScope', noticeUserScope);
      if (noticeUserScope === 'custom') {
        localStorage.setItem('adminNoticeUserId', noticeQueryUserId);
      } else {
        localStorage.removeItem('adminNoticeUserId');
      }
      localStorage.setItem('adminNoticeDays', String(noticeLookbackDays));
    } catch {
      logger.debug('[Pages/Admin] Failed to persist notice query to localStorage');
    }
  }, [noticeQueryUserId, noticeLookbackDays, noticeUserScope]);

  const filteredAdminNotices = useMemo(() => {
    const normResolved = (v: unknown): boolean | null => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(s)) return true;
        if (['false', '0', 'no', 'n'].includes(s)) return false;
      }
      return null;
    };
    const normExecStatus = (v: unknown): 'success' | 'failed' | 'pending' | null => {
      if (typeof v !== 'string') return null;
      const s = v.trim().toLowerCase();
      if (['ok', 'success', 'succeeded', 'done', 'completed', 'complete'].includes(s)) return 'success';
      if (['fail', 'failed', 'error', 'errored', 'exception', 'timeout'].includes(s)) return 'failed';
      if (['pending', 'running', 'queued', 'in_progress', 'processing', 'started'].includes(s)) return 'pending';
      return null;
    };

    const filtered = adminNotices.filter((item) => {
      const resolved =
        normResolved(item.is_resolved) ??
        normResolved(item.resolved) ??
        normResolved(item.isResolved) ??
        normResolved(item.is_executed) ??
        normResolved(item.isExecuted) ??
        normResolved(item.is_resolved_at ? true : null);

      if (noticeResolvedFilter === 'resolved' && resolved !== true) return false;
      if (noticeResolvedFilter === 'unresolved' && resolved !== false) return false;

      const execStatusRaw =
        item.execution_status ??
        item.executionStatus ??
        item.job_status ??
        item.jobStatus ??
        item.run_status ??
        item.runStatus ??
        item.status ??
        (typeof item.is_executed === 'boolean' ? (item.is_executed ? 'success' : 'pending') : null) ??
        null;

      const execStatus = normExecStatus(execStatusRaw);
      if (noticeExecStatusFilter === 'success' && execStatus !== 'success') return false;
      if (noticeExecStatusFilter === 'failed' && execStatus !== 'failed') return false;
      if (noticeExecStatusFilter === 'pending' && execStatus !== 'pending') return false;

      return true;
    });
    const getTimeMs = (item: Record<string, unknown>): number => {
      const raw = item.created_at ?? item.createdAt ?? item.time ?? item.created ?? null;
      return safeParseAdminNoticeDate(raw)?.getTime() ?? -Infinity;
    };
    return filtered.slice().sort((a, b) => getTimeMs(b) - getTimeMs(a));
  }, [adminNotices, noticeExecStatusFilter, noticeResolvedFilter]);

  const parseAdminNoticeText = React.useCallback((raw: string) => {
    const text = String(raw || '');
    const firstLine = text.split('\n')[0] || '';
    const m = firstLine.match(/^准备(买入|卖出):\s*\[([^\]]+)\]\s*(.+?)\s*$/);
    const sideZh = m?.[1] || null;
    const account = m?.[2] || null;
    const stockName = m?.[3] || null;

    const pm = text.match(/价格:\s*([0-9.]+)\s*,\s*数量:\s*([0-9.]+)\s*,\s*预计花费:\s*([0-9.]+)\s*/);
    const price = pm?.[1] || null;
    const quantity = pm?.[2] || null;
    const estCost = pm?.[3] || null;

    const gridLines = text.split('\n');
    const gridIdx = gridLines.findIndex(l => l.trim() === '触发自动操作网格:');
    const gridHint = gridIdx >= 0 ? (gridLines[gridIdx + 1] ? gridLines[gridIdx + 1].trim() : null) : null;

    const originalOrderLine = (text.match(/原订单:\s*(.+)\s*$/m) || [])[1] || null;
    const actionLine = (text.match(/action:\s*([^\n]+)\s*$/m) || [])[1] || null;

    let actionParsed: null | { actionId: string; symbol: string; side: string; price: string; quantity: string } = null;
    if (actionLine) {
      const parts = actionLine.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 5) {
        actionParsed = {
          actionId: parts[0],
          symbol: parts[1],
          side: parts[2],
          price: parts[3],
          quantity: parts[4],
        };
      }
    }

    return {
      sideZh,
      account,
      stockName,
      price,
      quantity,
      estCost,
      gridHint,
      originalOrderLine,
      actionLine,
      actionParsed,
    };
  }, []);

  const loadOrdersForDate = React.useCallback(async (dateStr: string) => {
    if (!selectedAccountId) return;
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const { data, error } = await optionsService.getAdminOrders(selectedAccountId, { date: dateStr });
      if (error) {
        throw error;
      }
      setOrdersByDate(prev => ({
        ...prev,
        [dateStr]: data || []
      }));
    } catch (err) {
      console.error('Failed to load orders', err);
      setOrdersError('加载订单失败');
    } finally {
      setOrdersLoading(false);
    }
  }, [selectedAccountId]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!selectedAccountId) {
      setOrdersByDate({});
      return;
    }
    if (!selectedDate) return;
    if (ordersByDate[selectedDate]) return;
    loadOrdersForDate(selectedDate);
  }, [activeTab, selectedAccountId, selectedDate, ordersByDate, loadOrdersForDate]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!selectedAccountId) return;
    const currentMonthKey = format(currentMonth, 'yyyy-MM');
    const prevMonthKey = format(addMonths(currentMonth, -1), 'yyyy-MM');
    const selectedMonthKey = selectedDate ? selectedDate.slice(0, 7) : currentMonthKey;
    const monthKeys = Array.from(new Set([currentMonthKey, prevMonthKey, selectedMonthKey]));

    let cancelled = false;
    const fetchStats = async () => {
      try {
        await Promise.all(
          monthKeys.map(async (key) => {
            const { data, error } = await optionsService.getAdminOrdersStats(selectedAccountId, key);
            if (cancelled || error || !data) return;
            setOrdersStatsByMonth(prev => ({ ...prev, [key]: data }));
          })
        );
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load orders stats', err);
        }
      }
    };
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentMonth, selectedAccountId, selectedDate]);

  React.useEffect(() => {
    if (activeTab !== 'calendar') return;
    const prevMonth = addMonths(currentMonth, -1);
    const years = Array.from(new Set([currentMonth.getFullYear(), prevMonth.getFullYear()]));
    const missingYears = years.filter(year => !tradingDaysByYear[year]);
    if (missingYears.length === 0) return;

    let cancelled = false;
    const fetchTradingCalendar = async () => {
      try {
        await Promise.all(
          missingYears.map(async (year) => {
            const { data, error } = await stockService.getTradingCalendar(year);
            if (error) throw error;
            const tradingDates = data || [];
            if (!cancelled && tradingDates.length > 0) {
              setTradingDaysByYear(prev => ({
                ...prev,
                [year]: new Set(tradingDates),
              }));
              setTradingCalendarError(null);
            }
          })
        );
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load trading calendar', err);
          setTradingCalendarError('交易日历加载失败');
        }
      }
    };
    fetchTradingCalendar();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentMonth, tradingDaysByYear]);

  const tabs = [
    { id: 'operations' as AdminTab, name: 'Operations', icon: Activity },
    { id: 'cash-flows' as AdminTab, name: 'Cash Flows', icon: Banknote },
    { id: 'calendar' as AdminTab, name: 'Calendar', icon: Calendar },
    { id: 'analysis' as AdminTab, name: 'Analysis', icon: BookOpen },
    { id: 'history' as AdminTab, name: 'History', icon: HistoryIcon },
    { id: 'tasks' as AdminTab, name: 'Tasks', icon: ListChecks },
    { id: 'notices' as AdminTab, name: 'Notices', icon: Bell },
    { id: 'accounts' as AdminTab, name: 'Accounts', icon: HeartPulse },
    { id: 'upload' as AdminTab, name: 'Upload', icon: Upload },
  ];

  const webMcp = useAdminWebMcp({
    userId: effectiveUserId,
    selectedAccountId,
    activeTab,
    isAuthenticated: Boolean(userId),
    onSwitchTab: handleTabChange,
    onSelectAccount: (accountId) => {
      setSelectedAccountId(accountId);
      persistAccountAlias(accountId, { storage: ADMIN_ACCOUNT_STORAGE });
      setRefreshKey((k) => k + 1);
    },
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="space-y-6 mb-6">
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className={`text-2xl font-bold ${themes[theme].text}`}>Admin</h1>
                <WebMcpBadge
                  theme={theme}
                  toolCount={webMcp.registeredToolCount}
                  isSupported={webMcp.isSupported}
                  isReady={webMcp.isReady}
                  pageTitle="Admin 管理中心"
                  customTools={webMcp.tools}
                />
              </div>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                跨账户通用管理与监控
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AccountSelector
                userId={effectiveUserId}
                theme={theme}
                selectedAccountId={selectedAccountId}
                onAccountChange={(accountId) => {
                  setSelectedAccountId(accountId);
                  persistAccountAlias(accountId, { storage: ADMIN_ACCOUNT_STORAGE });
                  setRefreshKey(k => k + 1);
                }}
                mode="all"
                showCreate={false}
                refreshKey={refreshKey}
              />
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>
          </div>
        </div>
        {accountAccessError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {accountAccessError}
          </div>
        )}

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          theme={theme}
          onTabChange={(tab) => handleTabChange(tab as AdminTab)}
        />
      </div>

      {activeTab === 'operations' && (
        <OperationsView theme={theme} accountAlias={selectedAccountId} />
      )}

      {activeTab === 'cash-flows' && (
        <CashFlowsView theme={theme} accountAlias={selectedAccountId} refreshKey={refreshKey} />
      )}

      {activeTab === 'analysis' && (
        <AnalysisTab
          theme={theme}
          portfolioUuid={null}
          userId={effectiveUserId}
          selectedAccountId={selectedAccountId}
          activeTab={activeTab}
        />
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <HistoryTradesChart
            theme={theme}
            startDate={historyDateRange.startDate}
            endDate={historyDateRange.endDate}
            selectedAccountId={selectedAccountId}
          />
          <DailyTradeHistory
            theme={theme}
            startDate={historyDateRange.startDate}
            endDate={historyDateRange.endDate}
            selectedAccountId={selectedAccountId}
          />
        </div>
      )}

      {activeTab === 'tasks' && (
        <SequentialTradeTasks theme={theme} selectedAccountId={selectedAccountId} />
      )}

      {activeTab === 'upload' && (
        <UploadPage theme={theme} />
      )}

      {activeTab === 'notices' && (
        <div className="space-y-6">
          <div className={`${themes[theme].card} rounded-lg p-4`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>提醒（Notices）</h2>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  接口：/api/admin/&lt;account_alias&gt;/notices（按用户拉取最近 N 天提醒，并展示执行状态）
                </p>
              </div>
              <button
                onClick={fetchAdminNotices}
                disabled={!selectedAccountId || adminNoticesLoading}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-70 mb-1`}>用户</label>
                <div className="space-y-2">
                  <select
                    value={noticeUserScope}
                    onChange={(e) => setNoticeUserScope(e.target.value as NoticeUserScope)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  >
                    <option value="current">当前用户（{effectiveUserId}）</option>
                    <option value="all">全部用户</option>
                    <option value="custom">自定义 user_id</option>
                  </select>
                  {noticeUserScope === 'custom' && (
                    <input
                      value={noticeQueryUserId}
                      onChange={(e) => setNoticeQueryUserId(e.target.value)}
                      placeholder="例如: user_123"
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-70 mb-1`}>最近天数</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={noticeLookbackDays}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    setNoticeLookbackDays(Number.isFinite(parsed) && parsed > 0 ? Math.min(365, Math.max(1, Math.floor(parsed))) : 7);
                  }}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-70 mb-1`}>解决状态</label>
                <select
                  value={noticeResolvedFilter}
                  onChange={(e) => setNoticeResolvedFilter(e.target.value as NoticeResolvedFilter)}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="all">全部</option>
                  <option value="unresolved">未解决</option>
                  <option value="resolved">已解决</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium ${themes[theme].text} opacity-70 mb-1`}>执行状态</label>
                <select
                  value={noticeExecStatusFilter}
                  onChange={(e) => setNoticeExecStatusFilter(e.target.value as NoticeExecStatusFilter)}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="all">全部</option>
                  <option value="pending">进行中/待处理</option>
                  <option value="success">成功</option>
                  <option value="failed">失败</option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className={`text-xs ${themes[theme].text} opacity-70`}>
                {adminNoticesLastOkAt ? `上次成功 ${new Date(adminNoticesLastOkAt).toLocaleTimeString()}` : '尚未成功拉取'}
                {adminNoticesLatencyMs !== null ? ` · ${adminNoticesLatencyMs}ms` : ''}
                {selectedAccountId ? ` · account_alias=${selectedAccountId}` : ' · 请先选择账户'}
              </div>
              {adminNoticesLoading && (
                <div className={`text-xs ${themes[theme].text} opacity-60`}>拉取中...</div>
              )}
              {!adminNoticesLoading && adminNoticesError && (
                <div className="text-xs text-red-500 whitespace-pre-wrap break-all">{adminNoticesError}</div>
              )}
            </div>
          </div>

          <div className={`${themes[theme].card} rounded-lg p-4`}>
            {filteredAdminNotices.length === 0 && !adminNoticesLoading && !adminNoticesError && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                暂无数据（接口未返回或筛选条件无匹配）。
              </div>
            )}
            {filteredAdminNotices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">已知</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">账户</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标的</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">网格</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">可执行</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">已执行</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {(() => {
                      let lastBucket: AdminNoticeTimeBucket | null = null;
                      return filteredAdminNotices.flatMap((item, idx) => {
                      const noticeUuid = typeof item.notice_uuid === 'string' ? item.notice_uuid : '';
                      const idRaw = item.id ?? item.notice_id ?? noticeUuid;
                      const id = String(idRaw ?? '');
                      const key = id || `${idx}`;
                      const text = String(item.text ?? item.content ?? item.body ?? '');
                      const parsed = parseAdminNoticeText(text);

                      const createdAtRaw = item.created_at ?? item.createdAt ?? item.time ?? item.created ?? '-';
                      const createdAt = String(createdAtRaw);
                      const bucket = getAdminNoticeTimeBucket(createdAtRaw);

                      const isAckedRaw = item.is_acked ?? item.isAcked ?? item.acked ?? null;
                      const isAcked =
                        typeof isAckedRaw === 'boolean'
                          ? isAckedRaw
                          : typeof isAckedRaw === 'number'
                            ? isAckedRaw !== 0
                            : typeof isAckedRaw === 'string'
                              ? ['true', '1', 'yes', 'y'].includes(isAckedRaw.trim().toLowerCase())
                              : false;
                      const ackedBadgeClass = isAcked
                        ? 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200 ring-1 ring-inset ring-gray-200 dark:ring-gray-700'
                        : 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100 ring-1 ring-inset ring-yellow-200 dark:ring-yellow-800';

                      const actionType = String(item.action_type ?? item.actionType ?? '-');
                      const sideLabel =
                        parsed.sideZh ||
                        (parsed.actionParsed?.side ? (parsed.actionParsed.side === 'BUY' ? '买入' : parsed.actionParsed.side === 'SELL' ? '卖出' : parsed.actionParsed.side) : '-') ||
                        '-';

                      const account =
                        String(item.account_alias ?? item.accountAlias ?? '') ||
                        String(item.account_id ?? item.accountId ?? item.account ?? '') ||
                        String(parsed.account ?? '') ||
                        '-';

                      const symbol = parsed.actionParsed?.symbol || String(item.symbol ?? item.stock_code ?? item.stockCode ?? '-');
                      const stockName = parsed.stockName || String(item.stock_name ?? item.stockName ?? '');
                      const stockDisplay = stockName ? `${stockName}${symbol && symbol !== '-' ? ` (${symbol})` : ''}` : symbol;

                      const price = parsed.price || parsed.actionParsed?.price || (item.price !== undefined ? String(item.price) : '-');
                      const quantity = parsed.quantity || parsed.actionParsed?.quantity || (item.quantity !== undefined ? String(item.quantity) : '-');
                      const gridHint = parsed.gridHint || String(item.grid ?? item.gridHint ?? '-');

                      let actionDataList: NoticeAction[] = [];
                      const rawActionData = item.action_data ?? item.actionData;
                      if (Array.isArray(rawActionData)) {
                        actionDataList = rawActionData as NoticeAction[];
                      } else if (typeof rawActionData === 'string') {
                        try {
                          const parsedJson = JSON.parse(rawActionData) as Record<string, unknown>;
                          if (Array.isArray(parsedJson)) {
                            actionDataList = parsedJson as NoticeAction[];
                          } else if (parsedJson && Array.isArray(parsedJson.notices)) {
                            actionDataList = (parsedJson.notices as Array<Record<string, unknown>>).flatMap(
                              (n) => (n.action_data ?? n.actionData ?? []) as NoticeAction[]
                            );
                          }
                        } catch {
                          // ignore
                        }
                      }

                      const isActionableRaw = item.is_actionable ?? item.isActionable ?? null;
                      const isActionable =
                        typeof isActionableRaw === 'boolean'
                          ? isActionableRaw
                          : typeof isActionableRaw === 'number'
                            ? isActionableRaw !== 0
                            : typeof isActionableRaw === 'string'
                              ? ['true', '1', 'yes', 'y'].includes(isActionableRaw.trim().toLowerCase())
                              : false;

                      const isExecutedRaw = item.is_executed ?? item.isExecuted ?? null;
                      const isExecuted =
                        typeof isExecutedRaw === 'boolean'
                          ? isExecutedRaw
                          : typeof isExecutedRaw === 'number'
                            ? isExecutedRaw !== 0
                            : typeof isExecutedRaw === 'string'
                              ? ['true', '1', 'yes', 'y'].includes(isExecutedRaw.trim().toLowerCase())
                              : false;

                      const actionableBadgeClass = isActionable
                        ? 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100 ring-1 ring-inset ring-sky-200 dark:ring-sky-800'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200 ring-1 ring-inset ring-gray-200 dark:ring-gray-700';
                      const executedBadgeClass = isExecuted
                        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-200 ring-1 ring-inset ring-gray-200 dark:ring-gray-700';

                      const expanded = expandedAdminNoticeKey === key;

                      const rows: React.ReactNode[] = [];
                      if (bucket !== lastBucket) {
                        lastBucket = bucket;
                        rows.push(
                          <tr key={`group-${bucket}-${idx}`} className="bg-gray-50 dark:bg-gray-900/60">
                            <td colSpan={11} className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                              {adminNoticeBucketLabel[bucket]}
                            </td>
                          </tr>
                        );
                      }
                      rows.push(
                        <React.Fragment key={key}>
                          <tr
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
                            onClick={() => setExpandedAdminNoticeKey(expanded ? null : key)}
                          >
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{createdAt && createdAt !== '-' ? createdAt : '-'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${ackedBadgeClass}`}>
                                {isAcked ? '已知' : '未 Ack'}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{actionType}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{sideLabel}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{account}</td>
                            <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-200 max-w-[420px] whitespace-normal break-words">{stockDisplay || '-'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{price}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{quantity}</td>
                            <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-200 max-w-[240px] whitespace-normal break-words">{gridHint}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${actionableBadgeClass}`}>
                                {isActionable ? '可执行' : '不可'}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${executedBadgeClass}`}>
                                {isExecuted ? '已执行' : '未执行'}
                              </span>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-gray-50 dark:bg-gray-900/40">
                              <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200" colSpan={11}>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-2">核心信息</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div><span className="text-gray-500">ID：</span>{id || '-'}</div>
                                      <div><span className="text-gray-500">Message：</span>{String(item.message_id ?? item.messageId ?? '-') || '-'}</div>
                                      <div><span className="text-gray-500">预计花费：</span>{parsed.estCost ?? '-'}</div>
                                      <div><span className="text-gray-500">原订单：</span>{parsed.originalOrderLine ?? '-'}</div>
                                      <div className="sm:col-span-2"><span className="text-gray-500">Action：</span>{parsed.actionLine ?? '-'}</div>
                                    </div>
                                    <div className="mt-3">
                                      <div className="text-xs font-medium text-gray-500 mb-1">原文</div>
                                      <div className="whitespace-pre-wrap break-words">{text || '-'}</div>
                                    </div>

                                    {actionDataList.length > 0 && (
                                      <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-3">
                                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                                          <ListChecks className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                          <span>可执行动作 ({actionDataList.length})</span>
                                        </div>
                                        <div className="space-y-3">
                                          {actionDataList.map((act: NoticeAction, actIdx: number) => {
                                            const actionName = act.action || 'UNKNOWN_ACTION';
                                            const actionLabel = actionNames[actionName] || actionName;
                                            const comboId = act.combo_id || act.comboId || '-';
                                            const expiryDate = act.expiry_date || act.expiryDate || '-';
                                            const legs = Array.isArray(act.legs) ? act.legs : [];

                                            return (
                                              <div key={actIdx} className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-lg p-3 shadow-sm">
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-900">
                                                  <div className="flex items-center gap-2 text-xs">
                                                    <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded font-semibold text-[10px]">
                                                      {actionLabel}
                                                    </span>
                                                    {comboId !== '-' && (
                                                      <span className="text-gray-500 dark:text-gray-400">
                                                        组合: <strong className="text-gray-700 dark:text-gray-300 font-mono">{comboId}</strong>
                                                      </span>
                                                    )}
                                                    {expiryDate !== '-' && (
                                                      <span className="text-gray-500 dark:text-gray-400 ml-2">
                                                        到期日: <span className="text-gray-700 dark:text-gray-300">{expiryDate}</span>
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleExecuteNoticeAction(item, act);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium shadow-sm transition-all active:scale-95"
                                                  >
                                                    <Play className="w-3 h-3" />
                                                    <span>执行该动作</span>
                                                  </button>
                                                </div>

                                                {legs.length > 0 ? (
                                                  <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-900">
                                                      <thead>
                                                        <tr className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                          <th className="px-2 py-1 text-left font-normal">合约/标的</th>
                                                          <th className="px-2 py-1 text-left font-normal">方向</th>
                                                          <th className="px-2 py-1 text-right font-normal">价格</th>
                                                          <th className="px-2 py-1 text-right font-normal">数量</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                                                        {legs.map((leg: NoticeLeg, legIdx: number) => {
                                                          const symbol = leg.symbol || leg.contract_code || leg.contractCode || '-';
                                                          const side = String(leg.side || '').toUpperCase();
                                                          const sideLabel = side === 'BUY' ? '买入' : side === 'SELL' ? '卖出' : side || '-';
                                                          const sideClass = side === 'BUY'
                                                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                                            : side === 'SELL'
                                                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                                              : 'text-gray-600 dark:text-gray-400';
                                                          
                                                          return (
                                                            <tr key={legIdx} className="text-[11px]">
                                                              <td className="px-2 py-1 text-gray-700 dark:text-gray-300 font-mono">{symbol}</td>
                                                              <td className={`px-2 py-1 ${sideClass}`}>{sideLabel}</td>
                                                              <td className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">{leg.price !== undefined ? leg.price : '-'}</td>
                                                              <td className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">{leg.quantity !== undefined ? leg.quantity : '-'}</td>
                                                            </tr>
                                                          );
                                                        })}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                ) : (
                                                  <div className="text-[11px] text-gray-500 italic">无成分腿数据</div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-500">原始数据</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const jsonStr = JSON.stringify(item, null, 2);
                                          navigator.clipboard.writeText(jsonStr)
                                            .then(() => toast.success('JSON 已复制到剪贴板'))
                                            .catch((err) => {
                                              console.error('Failed to copy JSON:', err);
                                              toast.error('复制失败');
                                            });
                                        }}
                                        className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>复制 JSON</span>
                                      </button>
                                    </div>
                                    <pre className="text-[11px] leading-4 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words bg-white/60 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-md p-2 font-mono scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-800">
                                      {JSON.stringify(item, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                      return rows;
                    });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className={`${themes[theme].card} rounded-lg p-4`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>账户状态</h2>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  每 {Math.round(heartbeatIntervalMs / 1000)} 秒请求一次 /api/admin/accounts/status（heartbeat）
                  {accountsLastTradingDay ? ` · 最近交易日: ${accountsLastTradingDay}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {(() => {
                  const alive =
                    accountsHeartbeatLastOkAt !== null &&
                    Date.now() - accountsHeartbeatLastOkAt < heartbeatIntervalMs * 2;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${alive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className={`text-sm font-medium ${themes[theme].text}`}>
                          {alive ? '服务器在线' : '服务器离线'}
                        </span>
                        {accountsHeartbeatInFlight && (
                          <span className={`text-xs ${themes[theme].text} opacity-60`}>
                            拉取中...
                          </span>
                        )}
                      </div>
                      <div className={`text-xs ${themes[theme].text} opacity-70`}>
                        {accountsHeartbeatLastOkAt
                          ? `上次成功 ${new Date(accountsHeartbeatLastOkAt).toLocaleTimeString()}`
                          : '尚未成功拉取'}
                        {accountsHeartbeatLatencyMs !== null ? ` · ${accountsHeartbeatLatencyMs}ms` : ''}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            {accountsHeartbeatError && (
              <div className="mt-3 text-xs text-red-500 whitespace-pre-wrap break-all">
                {accountsHeartbeatError}
              </div>
            )}
          </div>

          <div className={`${themes[theme].card} rounded-lg p-4`}>
            {accountsStatus.length === 0 && !accountsHeartbeatInFlight && !accountsHeartbeatError && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                暂无数据（等待后端返回）。
              </div>
            )}
            {accountsStatus.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed divide-y divide-gray-200 text-xs sm:text-sm dark:divide-gray-700">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[28%]" />
                    <col className="w-[22%]" />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-2 py-3 text-left text-[11px] font-semibold text-gray-500 sm:px-3">账户</th>
                      <th className="px-2 py-3 text-left text-[11px] font-semibold text-gray-500 sm:px-3">标识</th>
                      <th className="px-2 py-3 text-left text-[11px] font-semibold text-gray-500 sm:px-3">快照</th>
                      <th className="px-2 py-3 text-right text-[11px] font-semibold text-gray-500 sm:px-3">详情</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {accountsStatus.map((item) => {
                      const ok = ['connected', 'ok', 'healthy', 'alive'].includes(item.status.toLowerCase());
                      const key = item.account_id_alias || item.alias;
                      const snapshotMs = accountsSnapshotMeta.snapshotMsByKey.get(key) ?? null;
                      const snapshotDate = snapshotMs !== null ? new Date(snapshotMs) : null;
                      const snapshotDiffDays = snapshotDate ? differenceInCalendarDays(new Date(), snapshotDate) : null;
                      const snapshotStale = checkSnapshotStale(item.last_snapshot_at, item.last_trading_day);
                      const badgeClass = !ok
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100'
                        : snapshotStale
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
                      const statusLabel = !ok ? (item.status || '异常') : snapshotStale ? '快照偏旧' : '正常';
                      return (
                        <tr
                          key={item.account_id_alias || item.alias}
                          className="align-middle hover:bg-gray-50/60 dark:hover:bg-gray-900/20"
                        >
                          <td className="px-2 py-3 text-xs text-gray-700 dark:text-gray-200 sm:px-3">
                            <div className="font-medium break-words">{item.alias || '-'}</div>
                            <div className="mt-1">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
                                {statusLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-xs text-gray-700 dark:text-gray-200 sm:px-3">
                            <div className="break-all">{item.account_id_alias || '-'}</div>
                            <div className="mt-1 text-[10px] opacity-70">{item.account_type || '-'}</div>
                          </td>
                          <td className="px-2 py-3 text-xs sm:px-3">
                            <div className={`flex flex-col ${snapshotStale ? 'text-amber-700 dark:text-amber-200 font-medium' : 'text-gray-700 dark:text-gray-200'}`}>
                              <span>{formatBackendDateOnly(item.last_snapshot_at)}</span>
                              <span className={`text-[10px] ${snapshotStale ? 'opacity-90' : 'opacity-70'}`}>
                                {snapshotDiffDays === null ? '-' : `${snapshotDiffDays} 天`}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right sm:px-3">
                            <button
                              onClick={() => setActiveAccountDetailKey(key)}
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
            )}
          </div>
          {activeAccountDetail && (() => {
            const detailKey = activeAccountDetail.account_id_alias || activeAccountDetail.alias;
            const snapshotMs = accountsSnapshotMeta.snapshotMsByKey.get(detailKey) ?? null;
            const snapshotDate = snapshotMs !== null ? new Date(snapshotMs) : null;
            const snapshotDiffDays = snapshotDate ? differenceInCalendarDays(new Date(), snapshotDate) : null;
            const snapshotStale = checkSnapshotStale(
              activeAccountDetail.last_snapshot_at,
              activeAccountDetail.last_trading_day
            );
            const ok = ['connected', 'ok', 'healthy', 'alive'].includes(activeAccountDetail.status.toLowerCase());
            const badgeClass = !ok
              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100'
              : snapshotStale
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => setActiveAccountDetailKey(null)} />
                <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg shadow-xl ${themes[theme].card}`}>
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
                    <div className="min-w-0">
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>账户状态详情</h3>
                      <div className="mt-1 text-sm text-gray-500 break-all">{activeAccountDetail.alias || activeAccountDetail.account_id_alias || '-'}</div>
                    </div>
                    <button
                      onClick={() => setActiveAccountDetailKey(null)}
                      className={`p-2 rounded-md ${themes[theme].secondary}`}
                      title="关闭"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>账户</div>
                        <div className={`${themes[theme].text} mt-1 text-sm font-medium break-words`}>{activeAccountDetail.alias || '-'}</div>
                      </div>
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>状态</div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${badgeClass}`}>
                            {activeAccountDetail.status || '-'}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>标识</div>
                        <div className={`${themes[theme].text} mt-1 text-sm font-medium break-all`}>{activeAccountDetail.account_id_alias || '-'}</div>
                      </div>
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>类型</div>
                        <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>{activeAccountDetail.account_type || '-'}</div>
                      </div>
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>后端日期</div>
                        <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>{formatBackendDateOnly(activeAccountDetail.last_check)}</div>
                      </div>
                      <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                        <div className={`${themes[theme].text} opacity-70 text-xs`}>快照日期</div>
                        <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>
                          {formatBackendDateOnly(activeAccountDetail.last_snapshot_at)}
                          {snapshotDiffDays !== null ? ` · ${snapshotDiffDays} 天` : ''}
                        </div>
                      </div>
                      {(activeAccountDetail.last_trading_day || accountsLastTradingDay) && (
                        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/40">
                          <div className={`${themes[theme].text} opacity-70 text-xs`}>最近交易日</div>
                          <div className={`${themes[theme].text} mt-1 text-sm font-medium`}>
                            {activeAccountDetail.last_trading_day || accountsLastTradingDay}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className={`mb-2 text-sm font-medium ${themes[theme].text}`}>消息</div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 break-words dark:border-gray-700 dark:bg-black/20 dark:text-gray-200">
                        {activeAccountDetail.message || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <DataFreshnessStatus theme={theme} lastTradingDay={accountsLastTradingDay} />
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className={`${themes[theme].card} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>订单日历</h2>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  按日期浏览并筛选订单
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`p-2 rounded ${themes[theme].secondary}`}
                  onClick={() => setCurrentMonth(prev => addMonths(prev, -1))}
                >
                  ‹
                </button>
                <div className={`text-sm font-medium ${themes[theme].text}`}>
                  {format(currentMonth, 'yyyy年MM月')}
                </div>
                <button
                  className={`p-2 rounded ${themes[theme].secondary}`}
                  onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
                >
                  ›
                </button>
              </div>
            </div>

            {!selectedAccountId && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                请先在上方选择账户以加载订单。
              </div>
            )}

            {selectedAccountId && (
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-1 text-xs mb-3">
                  {['日', '一', '二', '三', '四', '五', '六'].map(label => (
                    <div
                      key={label}
                      className={`text-center font-semibold ${themes[theme].text} opacity-80 py-1 rounded-md`}
                    >
                      周{label}
                    </div>
                  ))}
                </div>
                <div key={format(currentMonth, 'yyyy-MM')} className="grid grid-cols-7 gap-1 animate-fade-in-up">
                  {(() => {
                    const monthStart = startOfMonth(currentMonth);
                    const monthEnd = endOfMonth(monthStart);
                    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
                    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
                    const days = eachDayOfInterval({ start, end });
                    return days.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const dayMonthKey = format(day, 'yyyy-MM');
                      const isCurrentMonth = isSameMonth(day, monthStart);
                      const isSelected = selectedDate && isSameDay(day, new Date(selectedDate));
                      const isTradingDay = !!tradingDaysByYear[day.getFullYear()]?.has(dateStr);
                      const stats = ordersStatsByMonth[dayMonthKey]?.[dateStr];
                      let baseClass = 'border rounded-lg p-1 h-20 flex flex-col items-center justify-between cursor-pointer text-xs transition-colors duration-150 ease-out';
                      if (isTradingDay) {
                        baseClass += ' bg-emerald-50/70 dark:bg-emerald-900/25 border-emerald-400 dark:border-emerald-500 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40';
                      } else {
                        baseClass += ` ${themes[theme].border} bg-slate-50/40 dark:bg-slate-900/10 hover:bg-slate-100/60 dark:hover:bg-slate-900/40`;
                      }
                      if (isSelected) {
                        baseClass += ' ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/40';
                      }
                      if (!isCurrentMonth) {
                        baseClass += ' opacity-50';
                      }
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          className={baseClass}
                          onClick={() => {
                            const isSame = selectedDate === dateStr;
                            setSelectedDate(dateStr);
                            if (ordersByDate[dateStr] || isSame) {
                              loadOrdersForDate(dateStr);
                            }
                          }}
                        >
                          <div className="w-full flex items-start justify-between">
                            <div className={`text-xs ${themes[theme].text}`}>
                              {format(day, 'd')}
                            </div>
                            {stats && (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100 px-1.5 py-0.5 text-[10px] font-medium">
                                  共 {stats.total_count}
                                </span>
                                <div className="flex flex-wrap justify-end gap-0.5 max-w-full">
                                  {stats.succeeded_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      成 {stats.succeeded_count}
                                    </span>
                                  )}
                                  {stats.canceled_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-800 dark:bg-slate-800/60 dark:text-slate-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      撤 {stats.canceled_count}
                                    </span>
                                  )}
                                  {stats.failed_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      败 {stats.failed_count}
                                    </span>
                                  )}
                                  {stats.pending_count > 0 && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100 px-1.5 py-0.5 text-[10px] font-medium">
                                      待 {stats.pending_count}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
                {tradingCalendarError && (
                  <div className="text-xs text-red-500">
                    {tradingCalendarError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${themes[theme].card} rounded-lg p-4 animate-fade-in-up animation-delay-200`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  {selectedDate ? `${selectedDate} 的订单` : '订单'}
                </h3>
                <p className={`text-xs ${themes[theme].text} opacity-70`}>
                  按日查看下单、成交和状态
                </p>
              </div>
              {selectedAccountId && selectedDate && (() => {
                const monthKey = selectedDate.slice(0, 7);
                const stats = ordersStatsByMonth[monthKey]?.[selectedDate];
                const total = stats?.total_count ?? 0;
                const succeeded = stats?.succeeded_count ?? 0;
                const canceled = stats?.canceled_count ?? 0;
                const failed = stats?.failed_count ?? 0;
                const pending = stats?.pending_count ?? 0;
                return (
                  <div className="flex flex-wrap justify-end gap-1">
                    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100 px-2 py-1 text-[10px] font-medium">
                      总 {total}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100 px-2 py-1 text-[10px] font-medium">
                      成 {succeeded}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-800 dark:bg-slate-800/60 dark:text-slate-100 px-2 py-1 text-[10px] font-medium">
                      撤 {canceled}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100 px-2 py-1 text-[10px] font-medium">
                      败 {failed}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100 px-2 py-1 text-[10px] font-medium">
                      待 {pending}
                    </span>
                  </div>
                );
              })()}
            </div>

            {!selectedAccountId && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>
                请选择账户后再查看订单明细。
              </div>
            )}

            {selectedAccountId && (
              <>
                {ordersLoading && (
                  <div className="py-6 text-center text-sm text-gray-500">
                    正在加载订单明细...
                  </div>
                )}
                {!ordersLoading && !!ordersError && (
                  <div className="py-6 text-center text-sm text-red-500">
                    {ordersError}
                  </div>
                )}
                {!ordersLoading && !ordersError && selectedDate && (!ordersByDate[selectedDate] || ordersByDate[selectedDate].length === 0) && (
                  <div className="py-6 text-center text-sm text-gray-500">
                    该日暂无订单记录。
                  </div>
                )}
                {!ordersLoading && !ordersError && selectedDate && ordersByDate[selectedDate] && ordersByDate[selectedDate].length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">方向</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量 (成/总)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {ordersByDate[selectedDate].map((order, idx) => (
                          <tr key={`${selectedDate}-${idx}`}>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              {order.order_time ? (order.order_time.split(' ')[1] || order.order_time) : '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <div className="font-medium">{order.instrument_name}</div>
                              {order.is_combination && (
                                <span className="text-[10px] text-purple-500 bg-purple-100 dark:bg-purple-900 px-1 rounded">组合</span>
                              )}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              <span
                                className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                                  ((order.op_type_name || '').includes('OPEN') || (order.op_type_name_zh || '').includes('开'))
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {order.op_type_name_zh || order.op_type_name}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-right text-gray-700 dark:text-gray-200">
                              <div>限价 {order.limit_price?.toFixed ? order.limit_price.toFixed(4) : order.limit_price}</div>
                              {order.traded_price ? (
                                <div className="text-[10px] text-gray-500">
                                  成交 {order.traded_price?.toFixed ? order.traded_price.toFixed(4) : order.traded_price}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-right text-gray-700 dark:text-gray-200">
                              {order.volume_traded}/{order.volume_total_original}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              <div>{order.order_status_name}</div>
                              {order.order_status_name === 'JUNK' && order.cancel_info && (
                                <div className="text-[10px] text-red-500 mt-1 whitespace-normal break-all max-w-[240px]">
                                  {order.cancel_info}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
