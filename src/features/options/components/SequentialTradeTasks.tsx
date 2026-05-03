import React, { useEffect, useState } from 'react';
import { ListChecks, Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { OptionOrder, SequentialTradeTask, SequentialTradeStep } from '../../../lib/services/types';

function normalizeToken(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function getDateKey(iso?: string | null): string | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (!raw) return null;
  if (raw.includes('T') && raw.length >= 10) return raw.slice(0, 10);
  if (raw.includes(' ') && raw.split(' ')[0]?.length === 10) return raw.split(' ')[0] || null;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function filterOrdersForTask(allOrders: OptionOrder[], task: SequentialTradeTask | null): OptionOrder[] {
  if (!task) return [];

  const comboId = normalizeToken(task.combo_id);
  const tradeUuid = normalizeToken(task.trade_uuid);
  const taskId = normalizeToken(task.id);
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const userOrderIds = steps.map(s => normalizeToken(s.user_order_id)).filter(Boolean);
  const taskOrderIds = (Array.isArray(task.order_ids) ? task.order_ids : []).map(normalizeToken).filter(Boolean);

  const hasStrongKeys = Boolean(comboId || tradeUuid || taskOrderIds.length > 0 || userOrderIds.length > 0);
  const tradeUuidLower = tradeUuid.toLowerCase();
  const taskIdLower = taskId.toLowerCase();
  const userOrderIdsLower = userOrderIds.map(v => v.toLowerCase());
  const taskOrderIdsLower = taskOrderIds.map(v => v.toLowerCase());

  const strongMatches = (order: OptionOrder) => {
    const compactNo = normalizeToken(order.compact_no);
    if (comboId && compactNo && compactNo === comboId) return true;

    const remarkLower = normalizeToken(order.remark).toLowerCase();
    if (tradeUuidLower && remarkLower.includes(tradeUuidLower)) return true;
    if (
      taskIdLower &&
      (remarkLower.includes(`task_id=${taskIdLower}`) ||
        remarkLower.includes(`taskid=${taskIdLower}`) ||
        remarkLower.includes(`task:${taskIdLower}`) ||
        remarkLower.includes(`task#${taskIdLower}`))
    ) {
      return true;
    }
    if (taskOrderIdsLower.length > 0 && remarkLower) {
      for (const id of taskOrderIdsLower) {
        if (id && remarkLower.includes(id)) return true;
      }
    }
    if (userOrderIdsLower.length > 0 && remarkLower) {
      for (const id of userOrderIdsLower) {
        if (id && remarkLower.includes(id)) return true;
      }
    }
    return false;
  };

  if (hasStrongKeys) {
    return allOrders.filter(strongMatches);
  }
  return [];
}

interface SequentialTradeTasksProps {
  theme: Theme;
  selectedAccountId: string | null;
}

type StatusFilter = 'all' | 'pending' | 'executing' | 'completed' | 'failed' | 'timeout' | 'paused' | 'cancelled';

export function SequentialTradeTasks({ theme, selectedAccountId }: SequentialTradeTasksProps) {
  const [tasks, setTasks] = useState<SequentialTradeTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailById, setDetailById] = useState<Record<number, SequentialTradeTask>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [ordersByTaskId, setOrdersByTaskId] = useState<Record<number, OptionOrder[]>>({});
  const [ordersErrorByTaskId, setOrdersErrorByTaskId] = useState<Record<number, string>>({});
  const [ordersLoadingId, setOrdersLoadingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | 'terminate' | 'restart' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    if (!selectedAccountId) {
      setTasks([]);
      setSelectedTaskId(null);
      setDetailById({});
      setOrdersByTaskId({});
      setOrdersErrorByTaskId({});
      setOrdersLoadingId(null);
      setError(null);
      setOffset(0);
      return;
    }
    let cancelled = false;
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const { data, error: serviceError } = await optionsService.getSequentialTrades(selectedAccountId, {
          status: statusFilter === 'all' ? undefined : statusFilter,
          limit,
          offset
        });
        if (cancelled) return;
        if (serviceError) {
          throw serviceError;
        }
        setTasks(data || []);
        setSelectedTaskId(prev => {
          if (prev != null && (data || []).some(t => t.id === prev)) return prev;
          return (data || []).length > 0 ? (data || [])[0].id : null;
        });
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : '加载顺序交易任务失败');
        setTasks([]);
        setSelectedTaskId(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, statusFilter, reloadKey, offset]);

  useEffect(() => {
    if (!selectedAccountId) return;
    setOffset(0);
  }, [selectedAccountId, statusFilter]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const interval = setInterval(() => {
      setReloadKey(prev => prev + 1);
    }, 10000);
    return () => {
      clearInterval(interval);
    };
  }, [selectedAccountId, statusFilter]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (detailById[selectedTaskId]) return;
    let cancelled = false;
    const fetchDetail = async () => {
      try {
        const base =
          detailById[selectedTaskId] || tasks.find(t => t.id === selectedTaskId) || null;
        const accountAlias =
          base?.account_alias || base?.account_id || selectedAccountId || '';
        if (!accountAlias) {
          setDetailLoadingId(null);
          return;
        }
        setDetailLoadingId(selectedTaskId);
        const { data, error: serviceError } = await optionsService.getSequentialTradeDetail(
          accountAlias,
          selectedTaskId
        );
        if (cancelled) return;
        if (serviceError) {
          throw serviceError;
        }
        if (data) {
          setDetailById(prev => ({
            ...prev,
            [selectedTaskId]: data
          }));
        }
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setDetailLoadingId(null);
        }
      }
    };
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId, detailById, selectedAccountId, tasks]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (ordersByTaskId[selectedTaskId]) return;
    let cancelled = false;
    const fetchOrders = async () => {
      try {
        const base =
          detailById[selectedTaskId] || tasks.find(t => t.id === selectedTaskId) || null;
        const accountAlias =
          base?.account_alias || base?.account_id || selectedAccountId || '';
        if (!accountAlias) return;

        const dateKey = getDateKey(base?.completed_at) || getDateKey(base?.updated_at) || getDateKey(base?.created_at);
        setOrdersLoadingId(selectedTaskId);
        setOrdersErrorByTaskId(prev => {
          const next = { ...prev };
          delete next[selectedTaskId];
          return next;
        });

        const { data, error: serviceError } = await optionsService.getOptionOrders(accountAlias, undefined, dateKey ? { date: dateKey } : { only_today: true });
        if (cancelled) return;
        if (serviceError) {
          throw serviceError;
        }
        setOrdersByTaskId(prev => ({
          ...prev,
          [selectedTaskId]: Array.isArray(data) ? data : []
        }));
      } catch (e) {
        if (cancelled) return;
        setOrdersByTaskId(prev => ({
          ...prev,
          [selectedTaskId]: []
        }));
        setOrdersErrorByTaskId(prev => ({
          ...prev,
          [selectedTaskId]: e instanceof Error ? e.message : '加载订单失败'
        }));
      } finally {
        if (!cancelled) {
          setOrdersLoadingId(null);
        }
      }
    };
    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId, ordersByTaskId, detailById, selectedAccountId, tasks]);

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'pending', label: '待执行' },
    { id: 'executing', label: '执行中' },
    { id: 'completed', label: '已完成' },
    { id: 'failed', label: '失败' },
    { id: 'timeout', label: '超时' },
    { id: 'paused', label: '已暂停' },
    { id: 'cancelled', label: '已终止' }
  ];

  const getStatusConfig = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'completed') {
      return {
        label: '已完成',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100',
        Icon: CheckCircle2
      };
    }
    if (s === 'executing') {
      return {
        label: '执行中',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100',
        Icon: RefreshCw
      };
    }
    if (s === 'pending') {
      return {
        label: '待执行',
        className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
        Icon: Clock
      };
    }
    if (s === 'failed') {
      return {
        label: '失败',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100',
        Icon: XCircle
      };
    }
    if (s === 'timeout') {
      return {
        label: '超时',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100',
        Icon: AlertTriangle
      };
    }
    if (s === 'paused') {
      return {
        label: '已暂停',
        className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
        Icon: Clock
      };
    }
    if (s === 'cancelled') {
      return {
        label: '已终止',
        className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
        Icon: XCircle
      };
    }
    return {
      label: status,
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
      Icon: Clock
    };
  };

  const getEnvConfig = (env?: string | null) => {
    const raw = String(env || '').trim();
    const e = raw.toLowerCase();
    if (!e) return null;
    if (e === 'prod' || e === 'production') {
      return { label: raw.toUpperCase(), className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100' };
    }
    if (e === 'stage' || e === 'staging') {
      return { label: raw.toUpperCase(), className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100' };
    }
    if (e === 'dev' || e === 'development') {
      return { label: raw.toUpperCase(), className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100' };
    }
    if (e === 'test' || e === 'qa' || e === 'local') {
      return { label: raw.toUpperCase(), className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100' };
    }
    return { label: raw.toUpperCase(), className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-100' };
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  const selectedTask =
    selectedTaskId != null
      ? detailById[selectedTaskId] || tasks.find(t => t.id === selectedTaskId) || null
      : null;
  const selectedSteps = selectedTask?.steps ?? [];
  const selectedOrders = selectedTaskId != null ? (ordersByTaskId[selectedTaskId] || []) : [];
  const matchedOrders = filterOrdersForTask(selectedOrders, selectedTask);
  const ordersError = selectedTaskId != null ? (ordersErrorByTaskId[selectedTaskId] || null) : null;
  const selectedStatus = selectedTask?.status ? selectedTask.status.toLowerCase() : '';
  const canPause = selectedStatus === 'pending' || selectedStatus === 'executing';
  const canResume = selectedStatus === 'paused';
  const canTerminate =
    selectedStatus === 'pending' ||
    selectedStatus === 'executing' ||
    selectedStatus === 'paused';
  const canRestartTask =
    selectedStatus === 'failed' ||
    selectedStatus === 'timeout' ||
    selectedStatus === 'cancelled';

  const handleRefresh = () => {
    setReloadKey(prev => prev + 1);
  };

  const refreshSelectedTask = (taskId: number) => {
    setDetailById(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setOrdersByTaskId(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setOrdersErrorByTaskId(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setReloadKey(prev => prev + 1);
  };

  const handlePause = async () => {
    if (!selectedTask) return;
    const accountAlias =
      selectedTask.account_alias || selectedTask.account_id || selectedAccountId || '';
    if (!accountAlias) {
      setActionError('当前任务缺少账户信息，无法暂停');
      return;
    }
    try {
      setActionLoading('pause');
      setActionError(null);
      const { error: serviceError } = await optionsService.pauseSequentialTrade(
        accountAlias,
        selectedTask.id
      );
      if (serviceError) {
        throw serviceError;
      }
      refreshSelectedTask(selectedTask.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '暂停任务失败');
    } finally {
      setActionLoading(current => (current === 'pause' ? null : current));
    }
  };

  const handleResume = async () => {
    if (!selectedTask) return;
    const accountAlias =
      selectedTask.account_alias || selectedTask.account_id || selectedAccountId || '';
    if (!accountAlias) {
      setActionError('当前任务缺少账户信息，无法恢复');
      return;
    }
    try {
      setActionLoading('resume');
      setActionError(null);
      const { error: serviceError } = await optionsService.resumeSequentialTrade(
        accountAlias,
        selectedTask.id
      );
      if (serviceError) {
        throw serviceError;
      }
      refreshSelectedTask(selectedTask.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '恢复任务失败');
    } finally {
      setActionLoading(current => (current === 'resume' ? null : current));
    }
  };

  const handleTerminate = async () => {
    if (!selectedTask) return;
    const accountAlias =
      selectedTask.account_alias || selectedTask.account_id || selectedAccountId || '';
    if (!accountAlias) {
      setActionError('当前任务缺少账户信息，无法终止');
      return;
    }
    try {
      setActionLoading('terminate');
      setActionError(null);
      const { error: serviceError } = await optionsService.terminateSequentialTrade(
        accountAlias,
        selectedTask.id
      );
      if (serviceError) {
        throw serviceError;
      }
      refreshSelectedTask(selectedTask.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '终止任务失败');
    } finally {
      setActionLoading(current => (current === 'terminate' ? null : current));
    }
  };

  const handleRestart = async (stepIndex?: number) => {
    if (!selectedTask) return;
    const accountAlias =
      selectedTask.account_alias || selectedTask.account_id || selectedAccountId || '';
    if (!accountAlias) {
      setActionError('当前任务缺少账户信息，无法重启');
      return;
    }
    try {
      setActionLoading('restart');
      setActionError(null);
      const { error: serviceError } = await optionsService.restartSequentialTrade(
        accountAlias,
        selectedTask.id,
        stepIndex
      );
      if (serviceError) {
        throw serviceError;
      }
      refreshSelectedTask(selectedTask.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '重启任务失败');
    } finally {
      setActionLoading(current => (current === 'restart' ? null : current));
    }
  };

  const canPrevPage = offset > 0;
  const canNextPage = tasks.length >= limit;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className={`${themes[theme].card} rounded-lg p-4 space-y-6`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${themes[theme].text}`}>顺序交易任务</h2>
            <p className={`text-xs ${themes[theme].text} opacity-70`}>
              查看由多个阶段组成的复杂任务及其执行进度
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-300">
            <span>第 {currentPage} 页</span>
            <button
              type="button"
              onClick={() => setOffset(prev => Math.max(0, prev - limit))}
              disabled={isLoading || !selectedAccountId || !canPrevPage}
              className="px-2 py-1 rounded-full text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setOffset(prev => prev + limit)}
              disabled={isLoading || !selectedAccountId || !canNextPage}
              className="px-2 py-1 rounded-full text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading || !selectedAccountId}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? '刷新中' : '刷新'}</span>
          </button>
          {statusFilters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setOffset(0);
                setStatusFilter(f.id);
              }}
              className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === f.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100'
                  : 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!selectedAccountId && (
        <div className={`text-sm ${themes[theme].text} opacity-75`}>
          请先在上方选择账户，以查看该账户的顺序交易任务。
        </div>
      )}

      {selectedAccountId && (
        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
              <span className={themes[theme].text}>正在加载任务列表...</span>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500">
              {error}
            </div>
          )}

          {!isLoading && !error && tasks.length === 0 && (
            <div className={`text-sm ${themes[theme].text} opacity-75`}>
              当前筛选条件下没有顺序交易任务。
            </div>
          )}

          {tasks.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                {tasks.map(task => {
                  const status = getStatusConfig(task.status);
                  const env = getEnvConfig(task.env);
                  const progressText =
                    task.steps_count != null && task.steps_count > 0 && task.current_step != null
                      ? `${task.current_step}/${task.steps_count}`
                      : task.steps && task.steps.length > 0 && task.current_step_index != null
                        ? `${task.current_step_index + 1}/${task.steps.length}`
                        : '';
                  const isSelected = selectedTaskId === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : themes[theme].border
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className={`font-medium ${themes[theme].text} truncate`}>
                          {task.action_type}
                        </div>
                        <div className="flex items-center gap-2">
                          {env && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${env.className}`}>
                              ENV {env.label}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${status.className}`}>
                            <status.Icon className="w-3 h-3" />
                            <span>{status.label}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            创建: {formatTime(task.created_at)}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            更新: {formatTime(task.updated_at)}
                          </span>
                          {(task.combo_id != null || task.expiry_date) && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {task.combo_id != null && <>组合ID: {task.combo_id}</>}
                              {task.combo_id != null && task.expiry_date && ' · '}
                              {task.expiry_date && <>到期日: {task.expiry_date}</>}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          {progressText && (
                            <span className="text-[11px] text-slate-600 dark:text-slate-300">
                              阶段 {progressText}
                            </span>
                          )}
                          {task.error_msg && (
                            <span className="text-[10px] text-red-500 truncate max-w-[180px]">
                              {task.error_msg}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border p-3 text-xs space-y-3">
                {!selectedTask && (
                  <div className={`text-sm ${themes[theme].text} opacity-75`}>
                    从左侧选择一个任务以查看详细阶段。
                  </div>
                )}

                {selectedTask && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className={`text-sm font-semibold ${themes[theme].text} mb-1`}>
                          任务 {selectedTask.id}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {selectedTask.account_alias || selectedTask.account_id} · {selectedTask.action_type}
                          </div>
                          {(() => {
                            const env = getEnvConfig(selectedTask.env);
                            if (!env) return null;
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${env.className}`}>
                                ENV {env.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {detailLoadingId === selectedTask.id && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-300">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500" />
                            <span>刷新中...</span>
                          </div>
                        )}
                        {canPause && (
                          <button
                            type="button"
                            onClick={handlePause}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded text-[11px] font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading === 'pause' ? '暂停中...' : '暂停'}
                          </button>
                        )}
                        {canResume && (
                          <button
                            type="button"
                            onClick={handleResume}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded text-[11px] font-medium border border-emerald-400 text-emerald-700 dark:border-emerald-500 dark:text-emerald-100 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading === 'resume' ? '恢复中...' : '恢复'}
                          </button>
                        )}
                        {canTerminate && (
                          <button
                            type="button"
                            onClick={handleTerminate}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded text-[11px] font-medium border border-red-400 text-red-600 dark:border-red-500 dark:text-red-100 hover:bg-red-50 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading === 'terminate' ? '终止中...' : '终止'}
                          </button>
                        )}
                        {canRestartTask && (
                          <button
                            type="button"
                            onClick={() => handleRestart()}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded text-[11px] font-medium border border-blue-400 text-blue-600 dark:border-blue-400 dark:text-blue-100 hover:bg-blue-50 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionLoading === 'restart' ? '重启中...' : '重启任务'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 space-y-1">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        创建时间: {formatTime(selectedTask.created_at)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        最近更新: {formatTime(selectedTask.updated_at)}
                      </div>
                      {(selectedTask.combo_id != null || selectedTask.expiry_date) && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedTask.combo_id != null && <>组合ID: {selectedTask.combo_id}</>}
                          {selectedTask.combo_id != null && selectedTask.expiry_date && ' · '}
                          {selectedTask.expiry_date && <>到期日: {selectedTask.expiry_date}</>}
                        </div>
                      )}
                      {selectedTask.completed_at && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          完成时间: {formatTime(selectedTask.completed_at)}
                        </div>
                      )}
                      {selectedTask.timeout_seconds != null && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          超时时间: {selectedTask.timeout_seconds} 秒
                        </div>
                      )}
                      {selectedTask.error_msg && (
                        <div className="text-[11px] text-red-500">
                          错误信息: {selectedTask.error_msg}
                        </div>
                      )}
                      {actionError && (
                        <div className="text-[11px] text-red-500">
                          操作失败: {actionError}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                      <div className={`text-xs font-medium mb-2 ${themes[theme].text}`}>
                        任务阶段
                      </div>
                      {selectedSteps.length > 0 ? (
                        <div className="space-y-2">
                          {selectedSteps.map((step: SequentialTradeStep, index: number) => {
                            const status = getStatusConfig(step.status);
                            const isCurrent =
                              selectedTask.current_step_index != null
                                ? selectedTask.current_step_index === index
                                : false;
                            return (
                              <div key={`${step.name}-${index}`} className="flex items-start gap-2">
                                <div className="flex flex-col items-center mt-0.5">
                                  <div
                                    className={`w-3 h-3 rounded-full border-2 ${isCurrent ? 'border-blue-500' : 'border-slate-300 dark:border-slate-600'} bg-white dark:bg-slate-900`}
                                  />
                                  {index < selectedSteps.length - 1 && (
                                    <div className="flex-1 w-px bg-slate-200 dark:bg-slate-700 mt-1 mb-1" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className={`text-xs font-medium ${themes[theme].text}`}>
                                      {step.name || step.action || `阶段 ${index + 1}`}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${status.className}`}>
                                        <status.Icon className="w-3 h-3" />
                                        <span className="text-[10px]">{status.label}</span>
                                      </span>
                                      {canRestartTask && (
                                        <button
                                          type="button"
                                          onClick={() => handleRestart(index)}
                                          disabled={!!actionLoading}
                                          className="text-[10px] text-blue-600 dark:text-blue-300 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          从此步骤重启
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {step.description && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      {step.description}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    {step.start_time && (
                                      <span>开始: {formatTime(step.start_time)}</span>
                                    )}
                                    {step.end_time && (
                                      <span>结束: {formatTime(step.end_time)}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={`text-xs ${themes[theme].text} opacity-70`}>
                          当前任务暂时没有可展示的阶段信息。
                        </div>
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-xs font-medium ${themes[theme].text}`}>关联订单</div>
                        {ordersLoadingId === selectedTask.id && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-300">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500" />
                            <span>加载中...</span>
                          </div>
                        )}
                      </div>

                      {Array.isArray(selectedTask.order_ids) && selectedTask.order_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedTask.order_ids.slice(0, 12).map((id) => (
                            <span
                              key={id}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              title={id}
                            >
                              {id}
                            </span>
                          ))}
                          {selectedTask.order_ids.length > 12 && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              +{selectedTask.order_ids.length - 12}
                            </span>
                          )}
                        </div>
                      )}

                      {ordersError && (
                        <div className="text-[11px] text-red-500">
                          订单加载失败: {ordersError}
                        </div>
                      )}

                      {!ordersError && ordersLoadingId !== selectedTask.id && matchedOrders.length === 0 && (
                        <div className={`text-xs ${themes[theme].text} opacity-70`}>
                          暂无可展示的关联订单。
                        </div>
                      )}

                      {matchedOrders.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                            <thead className="bg-slate-50 dark:bg-slate-900/50">
                              <tr>
                                <th className="px-2 py-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  时间
                                </th>
                                <th className="px-2 py-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  合约
                                </th>
                                <th className="px-2 py-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  动作
                                </th>
                                <th className="px-2 py-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  状态
                                </th>
                                <th className="px-2 py-1 text-right text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  价
                                </th>
                                <th className="px-2 py-1 text-right text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  成交/委托
                                </th>
                                <th className="px-2 py-1 text-left text-[10px] font-medium text-slate-500 dark:text-slate-300">
                                  备注
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {matchedOrders.map((o, idx) => (
                                <tr key={`${o.remark}-${idx}`} className="bg-white dark:bg-slate-900">
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-slate-600 dark:text-slate-300">
                                    {o.order_time ? formatTime(o.order_time) : '-'}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-100">
                                    {o.instrument_name || o.contract_code_full || o.instrument_id || '-'}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-100">
                                    {o.op_type_name_zh || o.op_type_name || '-'}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-100">
                                    {o.order_status_name || '-'}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-right text-slate-700 dark:text-slate-100">
                                    {o.traded_price || o.limit_price || 0}
                                  </td>
                                  <td className="px-2 py-1 whitespace-nowrap text-[10px] text-right text-slate-700 dark:text-slate-100">
                                    {o.volume_traded}/{o.volume_total_original}
                                  </td>
                                  <td className="px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono max-w-[260px] truncate" title={o.remark || undefined}>
                                    {o.remark || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
