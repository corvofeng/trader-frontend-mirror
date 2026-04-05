import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, RefreshCw, Info, X } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { OptionOrder, SequentialTradeTask } from '../../../lib/services/types';
import { logger } from '../../../shared/utils/logger';

interface TodayOrderFlowPanelProps {
  theme: Theme;
  viewMode: 'expiry' | 'strategy' | 'grouped';
  selectedAccountId: string | null;
  userId?: string | null;
  refreshKey?: number;
}

export function TodayOrderFlowPanel({ theme, viewMode, selectedAccountId, userId = null, refreshKey = 0 }: TodayOrderFlowPanelProps) {
  const [tasks, setTasks] = useState<SequentialTradeTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailById, setDetailById] = useState<Record<number, SequentialTradeTask>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [ordersScope, setOrdersScope] = useState<'today' | 'task'>('today');
  const [orders, setOrders] = useState<OptionOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem('options_portfolio_today_combo_open') === '1';
    } catch {
      return false;
    }
  });

  const panelMotionMs = 240;
  const [renderBody, setRenderBody] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setRenderBody(true);
      return;
    }
    const t = window.setTimeout(() => setRenderBody(false), panelMotionMs);
    return () => window.clearTimeout(t);
  }, [isOpen, panelMotionMs]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>(() => {
    try {
      const saved = localStorage.getItem('options_portfolio_today_combo_pos');
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj?.top === 'number' && typeof obj?.left === 'number') {
          return { top: obj.top, left: obj.left };
        }
      }
    } catch {
      void 0;
    }
    return { top: 120, left: window.innerWidth - 16 - 860 };
  });

  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>(() => {
    try {
      const saved = localStorage.getItem('options_portfolio_today_combo_size');
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj?.width === 'number' && typeof obj?.height === 'number') {
          return { width: obj.width, height: obj.height };
        }
      }
    } catch {
      void 0;
    }
    return { width: 860, height: 360 };
  });

  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 860,
    height: 360
  });

  const fetchTodayComboTrades = useCallback(async () => {
    if (!selectedAccountId) {
      setTasks([]);
      setLoading(false);
      setError(null);
      setSelectedTaskId(null);
      setDetailById({});
      setDetailLoadingId(null);
      setDetailError(null);
      setDetailOpen(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await optionsService.getSequentialTrades(selectedAccountId, { today_only: true, limit: 200, offset: 0 });
      if (error) throw error;
      const list = data || [];
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTasks(list);
    } catch (error) {
      setTasks([]);
      setError(error instanceof Error ? error.message : '加载今日组合交易任务失败');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  const fetchTodayOrders = useCallback(async () => {
    if (!selectedAccountId) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(null);
      return;
    }
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const { data, error: serviceError } = await optionsService.getOptionOrders(selectedAccountId, userId, { only_today: true });
      if (serviceError) throw serviceError;
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setOrders([]);
      setOrdersError(e instanceof Error ? e.message : '加载当日订单失败');
    } finally {
      setOrdersLoading(false);
    }
  }, [selectedAccountId, userId]);

  const normalizeIso = useCallback((value?: string | null) => {
    if (!value) return null;
    const cleaned = value.replace(/(\.\d{3})\d+/, '$1');
    const dt = new Date(cleaned);
    if (!Number.isFinite(dt.getTime())) {
      const dtZ = new Date(`${cleaned}Z`);
      return Number.isFinite(dtZ.getTime()) ? dtZ : null;
    }
    return dt;
  }, []);

  const getStatusBadgeConfig = useCallback((status?: string | null) => {
    const raw = (status || '').trim();
    const s = raw.toLowerCase();
    if (!raw) {
      return {
        label: '-',
        className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
        raw: ''
      };
    }
    if (s === 'completed') {
      return {
        label: '已完成',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100',
        raw
      };
    }
    if (s === 'failed') {
      return {
        label: '失败',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100',
        raw
      };
    }
    if (s === 'cancelled') {
      return {
        label: '已终止',
        className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
        raw
      };
    }
    return {
      label: raw,
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
      raw
    };
  }, []);

  const fetchDetail = useCallback(
    async (taskId: number) => {
      const base = detailById[taskId] || tasks.find(t => t.id === taskId) || null;
      const accountAlias = base?.account_alias || base?.account_id || selectedAccountId || '';
      if (!accountAlias) {
        setDetailError('缺少 account_alias，无法加载详情');
        return;
      }
      try {
        setDetailLoadingId(taskId);
        setDetailError(null);
        const { data, error: serviceError } = await optionsService.getSequentialTradeDetail(accountAlias, taskId);
        if (serviceError) throw serviceError;
        if (data) {
          setDetailById(prev => ({ ...prev, [taskId]: data }));
        }
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : '加载详情失败');
      } finally {
        setDetailLoadingId(null);
      }
    },
    [detailById, selectedAccountId, tasks]
  );

  const getTaskBase = useCallback(
    (taskId: number) => {
      return detailById[taskId] || tasks.find(t => t.id === taskId) || null;
    },
    [detailById, tasks]
  );

  const fetchOrdersForTask = useCallback(
    async (taskId: number) => {
      const base = getTaskBase(taskId);
      const accountAlias = base?.account_alias || base?.account_id || selectedAccountId || '';
      if (!accountAlias) {
        setOrders([]);
        setOrdersError('缺少 account_alias，无法加载当日订单');
        setOrdersLoading(false);
        return;
      }

      const dt = normalizeIso(base?.created_at) || new Date();
      const date = format(dt, 'yyyy-MM-dd');

      try {
        setOrdersLoading(true);
        setOrdersError(null);
        const { data, error: serviceError } = await optionsService.getOptionOrders(accountAlias, userId, { date });
        if (serviceError) throw serviceError;
        setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        setOrders([]);
        setOrdersError(e instanceof Error ? e.message : '加载当日订单失败');
      } finally {
        setOrdersLoading(false);
      }
    },
    [getTaskBase, normalizeIso, selectedAccountId, userId]
  );

  const refreshOrders = useCallback(() => {
    if (ordersScope === 'task' && selectedTaskId != null) {
      fetchOrdersForTask(selectedTaskId);
      return;
    }
    fetchTodayOrders();
  }, [fetchOrdersForTask, fetchTodayOrders, ordersScope, selectedTaskId]);

  const refreshAll = useCallback(() => {
    fetchTodayComboTrades();
    refreshOrders();
  }, [fetchTodayComboTrades, refreshOrders]);

  const openDetail = useCallback(
    (taskId: number) => {
      setSelectedTaskId(taskId);
      setOrdersScope('task');
      setDetailOpen(true);
      const cached = detailById[taskId];
      if (!cached || !cached.steps || cached.steps.length === 0) {
        fetchDetail(taskId);
      } else {
        setDetailError(null);
      }
      fetchOrdersForTask(taskId);
    },
    [detailById, fetchDetail, fetchOrdersForTask]
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailError(null);
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('options_portfolio_today_combo_open', next ? '1' : '0');
      } catch {
        logger.debug('[TodayComboPanel] Failed to persist options_portfolio_today_combo_open');
      }
      return next;
    });
  }, []);

  const getDims = useCallback(() => {
    const headerHeight = 52;
    const collapsedWidth = 56;
    const maxWidth = Math.max(320, window.innerWidth - 16);
    const minWidth = Math.min(640, maxWidth);
    const width = isOpen ? Math.max(minWidth, Math.min(panelSize.width, maxWidth)) : collapsedWidth;

    const maxHeight = Math.max(160, window.innerHeight - 16);
    const minHeight = Math.min(180, maxHeight);
    const height = isOpen ? Math.max(minHeight, Math.min(panelSize.height, maxHeight)) : headerHeight;
    return { width, height, headerHeight };
  }, [isOpen, panelSize.height, panelSize.width]);

  const clampPos = useCallback((pos: { top: number; left: number }, dims: { width: number; height: number }) => {
    const top = Math.max(8, Math.min(pos.top, window.innerHeight - dims.height - 8));
    const left = Math.max(8, Math.min(pos.left, window.innerWidth - dims.width - 8));
    return { top, left };
  }, []);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      setDragging(true);
      const rect = panelRef.current?.getBoundingClientRect();
      const offsetX = e.clientX - (rect?.left ?? 0);
      const offsetY = e.clientY - (rect?.top ?? 0);
      dragOffsetRef.current = { x: offsetX, y: offsetY };
      const openLeft = panelPos.left;

      const onDrag = (ev: MouseEvent) => {
        const dims = getDims();
        const top = ev.clientY - dragOffsetRef.current.y;
        if (!isOpen) {
          const clampedTop = Math.max(8, Math.min(top, window.innerHeight - dims.height - 8));
          const next = { top: clampedTop, left: openLeft };
          setPanelPos(next);
          try {
            localStorage.setItem('options_portfolio_today_combo_pos', JSON.stringify(next));
          } catch {
            void 0;
          }
          return;
        }

        const left = ev.clientX - dragOffsetRef.current.x;
        const clamped = clampPos({ top, left }, { width: dims.width, height: dims.height });
        setPanelPos(clamped);
        try {
          localStorage.setItem('options_portfolio_today_combo_pos', JSON.stringify(clamped));
        } catch {
          void 0;
        }
      };

      const endDrag = () => {
        setDragging(false);
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', endDrag);
      };

      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', endDrag);
    },
    [clampPos, getDims, isOpen, panelPos.left]
  );

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isOpen) return;
      setResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: panelSize.width,
        height: panelSize.height
      };

      const onResize = (ev: MouseEvent) => {
        const dx = ev.clientX - resizeStartRef.current.x;
        const dy = ev.clientY - resizeStartRef.current.y;
        const nextWidth = resizeStartRef.current.width + dx;
        const nextHeight = resizeStartRef.current.height + dy;
        const maxWidth = Math.max(320, window.innerWidth - 16);
        const minWidth = Math.min(640, maxWidth);
        const width = Math.max(minWidth, Math.min(nextWidth, maxWidth));

        const maxHeight = Math.max(160, window.innerHeight - 16);
        const minHeight = Math.min(180, maxHeight);
        const height = Math.max(minHeight, Math.min(nextHeight, maxHeight));
        setPanelSize({ width, height });
        try {
          localStorage.setItem('options_portfolio_today_combo_size', JSON.stringify({ width, height }));
        } catch {
          void 0;
        }
        const clamped = clampPos(panelPos, { width, height });
        setPanelPos(clamped);
      };

      const endResize = () => {
        setResizing(false);
        window.removeEventListener('mousemove', onResize);
        window.removeEventListener('mouseup', endResize);
      };

      window.addEventListener('mousemove', onResize);
      window.addEventListener('mouseup', endResize);
    },
    [clampPos, isOpen, panelPos, panelSize.height, panelSize.width]
  );

  useEffect(() => {
    const onResize = () => {
      const dims = getDims();
      const clamped = clampPos(panelPos, { width: dims.width, height: dims.height });
      setPanelPos(clamped);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [clampPos, getDims, panelPos]);

  useEffect(() => {
    if (viewMode !== 'expiry') return;
    if (!isOpen) return;
    fetchTodayComboTrades();
  }, [fetchTodayComboTrades, isOpen, refreshKey, viewMode]);

  useEffect(() => {
    if (viewMode !== 'expiry') return;
    fetchTodayOrders();
  }, [fetchTodayOrders, refreshKey, viewMode]);

  useEffect(() => {
    setSelectedTaskId(null);
    setDetailById({});
    setDetailLoadingId(null);
    setDetailError(null);
    setDetailOpen(false);
    setOrdersScope('today');
    setOrders([]);
    setOrdersLoading(false);
    setOrdersError(null);
  }, [selectedAccountId]);

  if (viewMode !== 'expiry') return null;

  const dims = getDims();
  const basePos = isOpen ? panelPos : { top: panelPos.top, left: window.innerWidth - dims.width - 8 };
  const clamped = clampPos(basePos, { width: dims.width, height: dims.height });

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 49,
    top: clamped.top,
    left: clamped.left,
    width: dims.width,
    height: dims.height,
    willChange: 'left, width, height',
    transition: `left ${panelMotionMs}ms cubic-bezier(0.22, 1, 0.36, 1), width ${panelMotionMs}ms cubic-bezier(0.22, 1, 0.36, 1), height ${panelMotionMs}ms ease`
  };

  const selectedDetail = selectedTaskId != null ? (detailById[selectedTaskId] || tasks.find(t => t.id === selectedTaskId) || null) : null;
  const selectedSteps = selectedDetail?.steps || [];
  const selectedIsLoading = selectedTaskId != null && detailLoadingId === selectedTaskId;
  const comboOrders = orders.filter(o => o.is_combination);
  const realOrders = orders.filter(o => !o.is_combination);
  const normalizeOrderStatus = (value?: string | null) => {
    const raw = (value || '').trim();
    if (!raw) return 'UNKNOWN';
    return raw.toUpperCase();
  };
  const getOrderStatusBadgeConfig = (status?: string | null) => {
    const raw = (status || '').trim();
    const s = normalizeOrderStatus(raw);
    if (s === 'SUCCEEDED' || s === 'FILLED' || s === 'DONE') {
      return { label: raw || 'SUCCEEDED', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100', raw: raw || s };
    }
    if (s === 'PART_SUCCEEDED' || s === 'PARTIAL' || s === 'PARTIALLY_FILLED') {
      return { label: raw || 'PARTIAL', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-100', raw: raw || s };
    }
    if (s === 'FAILED' || s === 'REJECTED' || s === 'ERROR') {
      return { label: raw || 'FAILED', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100', raw: raw || s };
    }
    if (s === 'CANCELED' || s === 'CANCELLED' || s === 'CANCEL') {
      return { label: raw || 'CANCELED', className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100', raw: raw || s };
    }
    if (s === 'JUNK') {
      return { label: raw || 'JUNK', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-100', raw: raw || s };
    }
    if (s === 'PENDING' || s === 'SUBMITTED' || s === 'ACCEPTED' || s === 'QUEUED') {
      return { label: raw || s, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100', raw: raw || s };
    }
    if (s === 'UNKNOWN') {
      return { label: '-', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100', raw: '' };
    }
    return { label: raw || s, className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100', raw: raw || s };
  };
  const orderStatusSummary = orders.reduce(
    (acc, o) => {
      const s = normalizeOrderStatus(o.order_status_name);
      const entry = acc[s] || { status: s, raw: (o.order_status_name || '').trim(), count: 0, traded: 0, total: 0 };
      entry.count += 1;
      entry.traded += Number.isFinite(o.volume_traded) ? o.volume_traded : 0;
      entry.total += Number.isFinite(o.volume_total_original) ? o.volume_total_original : 0;
      acc[s] = entry;
      return acc;
    },
    {} as Record<string, { status: string; raw: string; count: number; traded: number; total: number }>
  );
  const orderStatusSummaryList = Object.values(orderStatusSummary).sort((a, b) => b.count - a.count);
  const taskStatusCounts = tasks.reduce(
    (acc, t) => {
      const s = (t.status || '').trim().toLowerCase();
      if (!s) {
        acc.unknown += 1;
      } else if (s === 'completed') {
        acc.completed += 1;
      } else if (s === 'failed') {
        acc.failed += 1;
      } else if (s === 'cancelled') {
        acc.cancelled += 1;
      } else {
        acc.other += 1;
      }
      return acc;
    },
    { completed: 0, failed: 0, cancelled: 0, other: 0, unknown: 0 }
  );

  return (
    <>
      <div
        ref={panelRef}
        className={`${themes[theme].card} shadow-lg rounded-lg border ${themes[theme].border} overflow-hidden opacity-95 hover:opacity-100 transition-opacity relative ${resizing ? 'ring-2 ring-blue-500' : ''}`}
        style={style}
      >
        <div
          className={`${isOpen ? 'px-3 py-2' : 'p-0'} border-b ${themes[theme].border} flex items-center ${isOpen ? 'justify-between' : 'justify-center'} select-none ${dragging ? 'cursor-grabbing' : resizing ? 'cursor-se-resize' : 'cursor-grab'}`}
          onMouseDown={startDrag}
          title={isOpen ? '拖动移动位置' : '展开后可拖动移动位置'}
        >
          {isOpen ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div className={`font-bold text-sm ${themes[theme].text} truncate`}>今日组合交易任务</div>
                <div className={`text-xs ${themes[theme].text} opacity-60 shrink-0`}>
                  ({tasks.length}{selectedAccountId ? ` • 订单 ${orders.length}` : ''})
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`p-1 rounded ${themes[theme].secondary}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    refreshAll();
                  }}
                  title="刷新"
                  disabled={!selectedAccountId || loading || ordersLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${themes[theme].text}`} />
                </button>
                <button
                  type="button"
                  className={`p-1 rounded ${themes[theme].secondary}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpen();
                  }}
                  title="折叠到右侧"
                >
                  <ChevronRight className={`w-4 h-4 ${themes[theme].text}`} />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className={`w-full h-full px-1.5 py-1 flex items-center justify-center gap-1.5 rounded ${themes[theme].secondary}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleOpen();
              }}
              title="点击展开：今日组合交易任务"
              aria-label="展开：今日组合交易任务"
            >
              <ChevronLeft className={`w-5 h-5 ${themes[theme].text}`} />
              <div
                className={`text-[12px] font-semibold ${themes[theme].text} opacity-80 leading-none select-none`}
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                今日组合
              </div>
            </button>
          )}
        </div>

        {renderBody && (
          <>
            <div
              className={`px-3 py-3 bg-white dark:bg-gray-900 transition-opacity duration-200 ease-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{ height: `calc(100% - ${dims.headerHeight}px)`, overflow: 'hidden' }}
            >
              {!selectedAccountId && <div className={`text-sm ${themes[theme].text} opacity-75`}>请选择账户后再查看今日组合交易任务。</div>}
              {!!selectedAccountId && (
                <>
                  <div className="flex flex-col gap-3 h-full">
                    <div className={`flex-1 min-h-0 min-w-0 md:min-w-[340px] border ${themes[theme].border} rounded-lg overflow-hidden`}>
                      <div className={`px-3 py-2 border-b ${themes[theme].border} flex items-center justify-between`}>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold ${themes[theme].text}`}>任务</div>
                          <div className={`text-xs ${themes[theme].text} opacity-60`}>点击任务即可下方查看订单</div>
                        </div>
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {taskStatusCounts.completed > 0 && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeConfig('completed').className}`}>
                              {getStatusBadgeConfig('completed').label} {taskStatusCounts.completed}
                            </span>
                          )}
                          {taskStatusCounts.failed > 0 && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeConfig('failed').className}`}>
                              {getStatusBadgeConfig('failed').label} {taskStatusCounts.failed}
                            </span>
                          )}
                          {taskStatusCounts.cancelled > 0 && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeConfig('cancelled').className}`}>
                              {getStatusBadgeConfig('cancelled').label} {taskStatusCounts.cancelled}
                            </span>
                          )}
                          {taskStatusCounts.other > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                              进行中 {taskStatusCounts.other}
                            </span>
                          )}
                          {taskStatusCounts.unknown > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                              未知 {taskStatusCounts.unknown}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-full overflow-auto">
                        {loading && <div className="py-6 text-center text-sm text-gray-500">正在加载今日组合交易任务...</div>}
                        {!loading && !!error && <div className="py-6 text-center text-sm text-red-500">{error}</div>}
                        {!loading && !error && tasks.length === 0 && <div className="py-6 text-center text-sm text-gray-500">今日暂无组合交易任务。</div>}
                        {!loading && !error && tasks.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">任务</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">组合</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">到期</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">详情</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {tasks.map((task) => {
                                  const isSelected = ordersScope === 'task' && selectedTaskId === task.id;
                                  return (
                                    <tr
                                      key={`today-combo-task-${task.id}`}
                                      className={isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                                      onClick={() => {
                                        setSelectedTaskId(task.id);
                                        setOrdersScope('task');
                                        fetchOrdersForTask(task.id);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          setSelectedTaskId(task.id);
                                          setOrdersScope('task');
                                          fetchOrdersForTask(task.id);
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                                        {task.created_at?.includes('T') ? task.created_at.split('T')[1]?.slice(0, 8) : (task.created_at?.split(' ')[1] || task.created_at || '-')}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{task.id}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{task.action_type}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                                        {(() => {
                                          const cfg = getStatusBadgeConfig(task.status);
                                          return (
                                            <span
                                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
                                              title={cfg.raw || undefined}
                                            >
                                              {cfg.label}
                                            </span>
                                          );
                                        })()}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{task.combo_id ?? '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                                        {task.expiry_date ? format(new Date(task.expiry_date), 'yyyy-MM-dd') : '-'}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                                        <button
                                          type="button"
                                          className={`inline-flex items-center gap-1 px-2 py-1 rounded ${themes[theme].secondary}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openDetail(task.id);
                                          }}
                                          title="查看详情"
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                          查看
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
                    </div>

                    <div
                      className={`flex-1 min-h-0 w-full border ${themes[theme].border} rounded-lg overflow-hidden flex flex-col`}
                    >
                      <div className={`px-3 py-2 border-b ${themes[theme].border} flex items-center justify-between`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`text-sm font-semibold ${themes[theme].text} truncate`}>
                              {ordersScope === 'task' && selectedTaskId != null ? `任务 #${selectedTaskId} 当日订单` : '当日订单'}
                            </div>
                          </div>
                          <div className={`text-xs ${themes[theme].text} opacity-60`}>
                            {selectedAccountId ? `合计 ${orders.length}（组合 ${comboOrders.length} • 实际 ${realOrders.length}）` : ''}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            {ordersScope === 'task' && (
                              <button
                                type="button"
                                className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                onClick={() => {
                                  setOrdersScope('today');
                                  fetchTodayOrders();
                                }}
                                disabled={ordersLoading}
                                title="切回账户当日全部订单"
                              >
                                全部
                              </button>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {ordersScope === 'task' && selectedTaskId != null && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeConfig(selectedDetail?.status).className}`}
                                title={getStatusBadgeConfig(selectedDetail?.status).raw || undefined}
                              >
                                {getStatusBadgeConfig(selectedDetail?.status).label}
                              </span>
                            )}
                            {orders.length > 0 &&
                              orderStatusSummaryList.map((s) => {
                                const cfg = getOrderStatusBadgeConfig(s.raw || s.status);
                                return (
                                  <span
                                    key={`order-status-summary-${s.status}`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
                                    title={`成交 ${s.traded}/${s.total}`}
                                  >
                                    {cfg.label} {s.count}
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto p-3 bg-white dark:bg-gray-900">
                        {ordersLoading && (
                          <div className={`text-sm ${themes[theme].text} opacity-75`}>正在加载当日订单…</div>
                        )}
                        {!ordersLoading && !!ordersError && (
                          <div className="text-sm text-red-500">{ordersError}</div>
                        )}
                        {!ordersLoading && !ordersError && orders.length === 0 && (
                          <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无订单。</div>
                        )}
                        {!ordersLoading && !ordersError && orders.length > 0 && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className={`text-sm font-medium ${themes[theme].text}`}>组合交易（{comboOrders.length}）</div>
                              {comboOrders.length === 0 ? (
                                <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无组合交易订单。</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">组合</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">协议号</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                      {comboOrders.map((order, idx) => (
                                        <tr key={`today-combo-orders-side-comb-${order.compact_no || order.order_time || 'na'}-${idx}`}>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {order.order_time?.includes(' ') ? order.order_time.split(' ')[1]?.slice(0, 8) : (order.order_time || '-')}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.instrument_name || '-'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.op_type_name_zh || order.op_type_name || '-'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {(() => {
                                              const cfg = getOrderStatusBadgeConfig(order.order_status_name);
                                              return (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`} title={cfg.raw || undefined}>
                                                  {cfg.label}
                                                </span>
                                              );
                                            })()}
                                            {normalizeOrderStatus(order.order_status_name) === 'JUNK' && order.cancel_info && (
                                              <div className="text-[10px] text-red-500 mt-1 whitespace-normal break-all max-w-[320px]">
                                                {order.cancel_info}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {order.volume_traded}/{order.volume_total_original}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{order.compact_no || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className={`text-sm font-medium ${themes[theme].text}`}>实际订单（{realOrders.length}）</div>
                              {realOrders.length === 0 ? (
                                <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无实际订单。</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合约</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                      {realOrders.map((order, idx) => (
                                        <tr key={`today-combo-orders-side-real-${order.contract_code_full || order.instrument_id || order.order_time || 'na'}-${idx}`}>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {order.order_time?.includes(' ') ? order.order_time.split(' ')[1]?.slice(0, 8) : (order.order_time || '-')}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {order.contract_code_full || order.instrument_id || '-'}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.instrument_name || '-'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.op_type_name_zh || order.op_type_name || '-'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {(() => {
                                              const cfg = getOrderStatusBadgeConfig(order.order_status_name);
                                              return (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`} title={cfg.raw || undefined}>
                                                  {cfg.label}
                                                </span>
                                              );
                                            })()}
                                            {normalizeOrderStatus(order.order_status_name) === 'JUNK' && order.cancel_info && (
                                              <div className="text-[10px] text-red-500 mt-1 whitespace-normal break-all max-w-[320px]">
                                                {order.cancel_info}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {(() => {
                                              const traded = Number.isFinite(order.traded_price) ? order.traded_price : null;
                                              const limit = Number.isFinite(order.limit_price) ? order.limit_price : null;
                                              const t = traded != null ? traded.toFixed(6) : '-';
                                              const l = limit != null ? limit.toFixed(6) : '-';
                                              return `${t} / ${l}`;
                                            })()}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                            {order.volume_traded}/{order.volume_total_original}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div
              className="absolute right-1 bottom-1 w-3 h-3 cursor-se-resize bg-gray-400/40 hover:bg-gray-400/70 rounded-sm"
              onMouseDown={startResize}
              title="拖动调整大小"
            />
          </>
        )}
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeDetail}
          />
          <div className={`relative w-full max-w-5xl max-h-[90vh] ${themes[theme].card} rounded-lg shadow-xl overflow-hidden`}>
            <div className={`flex items-center justify-between p-4 border-b ${themes[theme].border}`}>
              <div className="flex items-center gap-2 min-w-0">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <h3 className={`text-lg font-semibold ${themes[theme].text} truncate`}>组合交易任务详情</h3>
                {selectedTaskId != null && (
                  <span className={`text-xs ${themes[theme].text} opacity-70 font-mono`}>#{selectedTaskId}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedTaskId != null && (
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded text-xs ${themes[theme].secondary}`}
                    onClick={() => {
                      fetchDetail(selectedTaskId);
                      fetchOrdersForTask(selectedTaskId);
                    }}
                    disabled={selectedIsLoading}
                    title="刷新详情"
                  >
                    {selectedIsLoading ? '加载中…' : '刷新'}
                  </button>
                )}
                <button
                  onClick={closeDetail}
                  className={`p-2 rounded-md ${themes[theme].secondary}`}
                  title="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(90vh - 64px)' }}>
              {!selectedDetail && (
                <div className={`text-sm ${themes[theme].text} opacity-75`}>未选择任务或任务不存在。</div>
              )}

              {!!selectedDetail && (
                <div className="space-y-4">
                  {selectedIsLoading && (
                    <div className={`text-sm ${themes[theme].text} opacity-75`}>正在加载详情…</div>
                  )}

                  {!selectedIsLoading && !!detailError && (
                    <div className="text-sm text-red-500">{detailError}</div>
                  )}

                  <div className={`border ${themes[theme].border} rounded-lg p-3`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>动作</span>
                        <span className={`${themes[theme].text} font-mono`}>{selectedDetail.action_type || '-'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>状态</span>
                          {(() => {
                            const cfg = getStatusBadgeConfig(selectedDetail.status);
                            return (
                              <span className="inline-flex items-center gap-2 min-w-0">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`} title={cfg.raw || undefined}>
                                  {cfg.label}
                                </span>
                                {!!cfg.raw && (
                                  <span className={`${themes[theme].text} opacity-60 font-mono truncate`} title={cfg.raw}>
                                    {cfg.raw}
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>组合</span>
                        <span className={`${themes[theme].text} font-mono`}>{selectedDetail.combo_id ?? '-'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>账户</span>
                        <span className={`${themes[theme].text} font-mono`}>{selectedDetail.account_alias || selectedDetail.account_id || '-'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>创建</span>
                        <span className={`${themes[theme].text} font-mono`}>
                          {(() => {
                            const dt = normalizeIso(selectedDetail.created_at);
                            return dt ? format(dt, 'yyyy-MM-dd HH:mm:ss') : (selectedDetail.created_at || '-');
                          })()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>完成</span>
                        <span className={`${themes[theme].text} font-mono`}>
                          {(() => {
                            const dt = normalizeIso(selectedDetail.completed_at || null);
                            return dt ? format(dt, 'yyyy-MM-dd HH:mm:ss') : (selectedDetail.completed_at || '-');
                          })()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>当前阶段</span>
                        <span className={`${themes[theme].text} font-mono`}>
                          {selectedDetail.current_step_index != null ? String(selectedDetail.current_step_index) : '-'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>超时(s)</span>
                        <span className={`${themes[theme].text} font-mono`}>
                          {selectedDetail.timeout_seconds != null ? String(selectedDetail.timeout_seconds) : '-'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className={`${themes[theme].text} opacity-70`}>UUID</span>
                        <span className={`${themes[theme].text} font-mono truncate`} title={selectedDetail.trade_uuid || ''}>
                          {selectedDetail.trade_uuid || '-'}
                        </span>
                      </div>
                    </div>

                    {!!selectedDetail.error_msg && (
                      <div className="mt-3 text-sm text-red-500 break-words">{selectedDetail.error_msg}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className={`text-sm font-semibold ${themes[theme].text}`}>当日订单</div>
                    {orders.length > 0 && (
                      <div className="flex items-center justify-start gap-1 flex-wrap">
                        {orderStatusSummaryList.map((s) => {
                          const cfg = getOrderStatusBadgeConfig(s.raw || s.status);
                          return (
                            <span
                              key={`order-status-summary-modal-${s.status}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
                              title={`成交 ${s.traded}/${s.total}`}
                            >
                              {cfg.label} {s.count}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {ordersLoading && (
                      <div className={`text-sm ${themes[theme].text} opacity-75`}>正在加载当日订单…</div>
                    )}
                    {!ordersLoading && !!ordersError && (
                      <div className="text-sm text-red-500">{ordersError}</div>
                    )}
                    {!ordersLoading && !ordersError && orders.length === 0 && (
                      <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无订单。</div>
                    )}
                    {!ordersLoading && !ordersError && orders.length > 0 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className={`text-sm font-medium ${themes[theme].text}`}>组合交易（{comboOrders.length}）</div>
                          {comboOrders.length === 0 ? (
                            <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无组合交易订单。</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">组合</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">协议号</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">腿</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                  {comboOrders.map((order, idx) => (
                                    <tr key={`today-combo-orders-comb-${order.compact_no || order.order_time || 'na'}-${idx}`}>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {order.order_time?.includes(' ') ? order.order_time.split(' ')[1]?.slice(0, 8) : (order.order_time || '-')}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.instrument_name || '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.op_type_name_zh || order.op_type_name || '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {(() => {
                                          const cfg = getOrderStatusBadgeConfig(order.order_status_name);
                                          return (
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`} title={cfg.raw || undefined}>
                                              {cfg.label}
                                            </span>
                                          );
                                        })()}
                                        {normalizeOrderStatus(order.order_status_name) === 'JUNK' && order.cancel_info && (
                                          <div className="text-[10px] text-red-500 mt-1 whitespace-normal break-all max-w-[320px]">
                                            {order.cancel_info}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {order.volume_traded}/{order.volume_total_original}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{order.compact_no || '-'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {Array.isArray(order.contract_ids) && order.contract_ids.length > 0 ? order.contract_ids.join(', ') : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className={`text-sm font-medium ${themes[theme].text}`}>实际订单（{realOrders.length}）</div>
                          {realOrders.length === 0 ? (
                            <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无实际订单。</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合约</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">价格</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注/原因</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                  {realOrders.map((order, idx) => (
                                    <tr key={`today-combo-orders-real-${order.contract_code_full || order.instrument_id || order.order_time || 'na'}-${idx}`}>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {order.order_time?.includes(' ') ? order.order_time.split(' ')[1]?.slice(0, 8) : (order.order_time || '-')}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {order.contract_code_full || order.instrument_id || '-'}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.instrument_name || '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{order.op_type_name_zh || order.op_type_name || '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{order.order_status_name || '-'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {(() => {
                                          const traded = Number.isFinite(order.traded_price) ? order.traded_price : null;
                                          const limit = Number.isFinite(order.limit_price) ? order.limit_price : null;
                                          const t = traded != null ? traded.toFixed(6) : '-';
                                          const l = limit != null ? limit.toFixed(6) : '-';
                                          return `${t} / ${l}`;
                                        })()}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                        {order.volume_traded}/{order.volume_total_original}
                                      </td>
                                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200">
                                        {order.cancel_info || order.remark || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className={`text-sm font-semibold ${themes[theme].text}`}>阶段步骤</div>
                    {selectedSteps.length === 0 && (
                      <div className={`text-sm ${themes[theme].text} opacity-75`}>暂无 steps 信息（可点击右上角“刷新”再次拉取）。</div>
                    )}
                    {selectedSteps.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">动作</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标的</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开始</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">结束</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">耗时</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">参数</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {selectedSteps.map((step, idx) => {
                              const startDt = normalizeIso(step.start_time || null);
                              const endDt = normalizeIso(step.end_time || null);
                              const ms = startDt && endDt ? endDt.getTime() - startDt.getTime() : null;
                              const durationText = ms != null && Number.isFinite(ms) ? `${Math.max(0, Math.round(ms / 1000))}s` : '-';
                              const paramsObj = step.params && typeof step.params === 'object' ? step.params : null;
                              const generalObj = (step as unknown as { general?: unknown }).general;
                              const extra = {
                                method_name: (step as unknown as { method_name?: unknown }).method_name,
                                general: generalObj,
                                params: paramsObj
                              };
                              const hasAnyExtra = Object.values(extra).some(v => v != null);

                              return (
                                <tr key={`today-combo-task-step-${selectedTaskId || 'na'}-${idx}`}>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{idx + 1}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{step.name || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{step.action || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{step.status || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{step.symbol || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                    {startDt ? format(startDt, 'HH:mm:ss') : (step.start_time || '-')}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">
                                    {endDt ? format(endDt, 'HH:mm:ss') : (step.end_time || '-')}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{durationText}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono" title={step.user_order_id || ''}>
                                    {step.user_order_id ? String(step.user_order_id).slice(0, 18) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200">
                                    {hasAnyExtra ? (
                                      <details className="select-text">
                                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400">展开</summary>
                                        <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-200 dark:border-gray-700">
                                          {JSON.stringify(extra, null, 2)}
                                        </pre>
                                      </details>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className={`text-sm font-semibold ${themes[theme].text}`}>原始数据</div>
                    <details className="select-text">
                      <summary className="cursor-pointer text-blue-600 dark:text-blue-400 text-sm">展开 JSON</summary>
                      <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50 p-3 rounded border border-gray-200 dark:border-gray-700">
                        {JSON.stringify(selectedDetail, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
