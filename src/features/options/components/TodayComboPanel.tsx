import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
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

  return (
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
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">{task.status}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{task.combo_id ?? '-'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                              {task.expiry_date ? format(new Date(task.expiry_date), 'yyyy-MM-dd') : '-'}
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
  );
}

