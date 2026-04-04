import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, RefreshCw, Info, X } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { SequentialTradeTask } from '../../../lib/services/types';
import { logger } from '../../../shared/utils/logger';

interface TodayComboPanelProps {
  theme: Theme;
  viewMode: 'expiry' | 'strategy' | 'grouped';
  selectedAccountId: string | null;
  refreshKey?: number;
}

export function TodayComboPanel({ theme, viewMode, selectedAccountId, refreshKey = 0 }: TodayComboPanelProps) {
  const [tasks, setTasks] = useState<SequentialTradeTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailById, setDetailById] = useState<Record<number, SequentialTradeTask>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem('options_portfolio_today_combo_open') === '1';
    } catch {
      return false;
    }
  });

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
    return { top: 120, left: window.innerWidth - 16 - 520 };
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
    return { width: 520, height: 320 };
  });

  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 520,
    height: 320
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

  const openDetail = useCallback(
    (taskId: number) => {
      setSelectedTaskId(taskId);
      setDetailOpen(true);
      const cached = detailById[taskId];
      if (!cached || !cached.steps || cached.steps.length === 0) {
        fetchDetail(taskId);
      } else {
        setDetailError(null);
      }
    },
    [detailById, fetchDetail]
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
    const width = Math.max(360, Math.min(panelSize.width, window.innerWidth - 16));
    const height = isOpen ? Math.max(180, Math.min(panelSize.height, window.innerHeight - 16)) : headerHeight;
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

      const onDrag = (ev: MouseEvent) => {
        const dims = getDims();
        const top = ev.clientY - dragOffsetRef.current.y;
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
    [clampPos, getDims]
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
        const width = Math.max(360, Math.min(nextWidth, window.innerWidth - 16));
        const height = Math.max(180, Math.min(nextHeight, window.innerHeight - 16));
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
    setSelectedTaskId(null);
    setDetailById({});
    setDetailLoadingId(null);
    setDetailError(null);
    setDetailOpen(false);
  }, [selectedAccountId]);

  if (viewMode !== 'expiry') return null;

  const dims = getDims();
  const clamped = clampPos(panelPos, { width: dims.width, height: dims.height });

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 49,
    top: clamped.top,
    left: clamped.left,
    width: dims.width,
    height: dims.height
  };

  const selectedDetail = selectedTaskId != null ? (detailById[selectedTaskId] || tasks.find(t => t.id === selectedTaskId) || null) : null;
  const selectedSteps = selectedDetail?.steps || [];
  const selectedIsLoading = selectedTaskId != null && detailLoadingId === selectedTaskId;

  return (
    <>
      <div
        ref={panelRef}
        className={`${themes[theme].card} shadow-lg rounded-lg border ${themes[theme].border} overflow-hidden opacity-95 hover:opacity-100 transition-opacity relative ${resizing ? 'ring-2 ring-blue-500' : ''}`}
        style={style}
      >
        <div
          className={`px-3 py-2 border-b ${themes[theme].border} flex items-center justify-between select-none ${dragging ? 'cursor-grabbing' : resizing ? 'cursor-se-resize' : 'cursor-grab'}`}
          onMouseDown={startDrag}
          title="拖动移动位置"
        >
          <div className="flex items-center gap-2">
            <div className={`font-bold text-sm ${themes[theme].text}`}>今日组合交易任务</div>
            <div className={`text-xs ${themes[theme].text} opacity-60`}>({tasks.length})</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`p-1 rounded ${themes[theme].secondary}`}
              onClick={(e) => {
                e.stopPropagation();
                fetchTodayComboTrades();
              }}
              title="刷新"
              disabled={!selectedAccountId || loading}
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
              title={isOpen ? '折叠' : '展开'}
            >
              {isOpen ? (
                <ChevronUp className={`w-4 h-4 ${themes[theme].text}`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${themes[theme].text}`} />
              )}
            </button>
          </div>
        </div>

        {isOpen && (
          <>
            <div className="px-3 py-3 bg-white dark:bg-gray-900" style={{ height: dims.height - dims.headerHeight, overflow: 'auto' }}>
              {!selectedAccountId && <div className={`text-sm ${themes[theme].text} opacity-75`}>请选择账户后再查看今日组合交易任务。</div>}
              {!!selectedAccountId && (
                <>
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
                          {tasks.map((task) => (
                            <tr key={`today-combo-task-${task.id}`}>
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
                    onClick={() => fetchDetail(selectedTaskId)}
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
