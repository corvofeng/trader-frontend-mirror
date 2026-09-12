import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Compass, 
  FileText, 
  BarChart2, 
  Shield, 
  Info, 
  Sun, 
  Moon, 
  Palette, 
  RefreshCw, 
  Share2, 
  CornerDownLeft, 
  X,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Theme } from '../../lib/theme';
import type { User } from '../../lib/services/types';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

interface CommandItem {
  id: string;
  category: '导航' | '外观主题' | '系统与分享';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  keywords?: string[];
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  user,
  theme,
  onThemeChange
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input and lock body scroll when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  const handleShare = useCallback(async () => {
    onClose();
    const url = window.location.href;
    const title = document.title || 'YHTrader';
    if (navigator.share && navigator.canShare && navigator.canShare({ url, title })) {
      try {
        await navigator.share({
          title,
          text: 'YHTrader 交易日志与期权工具',
          url,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    // Fallback: Copy link
    try {
      await navigator.clipboard.writeText(url);
      toast.success('链接已复制到剪贴板！');
    } catch {
      toast.error('无法复制链接，请手动复制地址栏');
    }
  }, [onClose]);

  const handleRefreshApp = useCallback(async () => {
    onClose();
    toast.loading('正在刷新缓存并更新应用...', { id: 'sw-refresh-task' });
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      sessionStorage.setItem('sw_refreshed', 'true');
      window.location.reload();
    } catch (e) {
      toast.error('更新失败，请刷新网页重试', { id: 'sw-refresh-task' });
    }
  }, [onClose]);

  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: 'nav-home',
        category: '导航',
        title: '返回首页',
        subtitle: '概览与系统介绍',
        icon: <Compass className="w-4 h-4 text-blue-500" />,
        keywords: ['home', 'sy', 'shouye', '概览'],
        action: () => {
          navigate('/');
          onClose();
        },
      },
      {
        id: 'nav-journal',
        category: '导航',
        title: '交易日志 Journal',
        subtitle: '账户总览、持仓、流水与分析',
        icon: <FileText className="w-4 h-4 text-emerald-500" />,
        keywords: ['journal', 'rz', 'rizhi', '持仓', '流水', '资产'],
        action: () => {
          navigate('/journal');
          onClose();
        },
      },
      {
        id: 'nav-options',
        category: '导航',
        title: '期权工具 Options',
        subtitle: 'T型报价、盈亏图表、策略计算器',
        icon: <BarChart2 className="w-4 h-4 text-purple-500" />,
        keywords: ['options', 'qq', 'qiquan', 't型', '行权', '策略'],
        action: () => {
          navigate('/options');
          onClose();
        },
      },
      {
        id: 'nav-about',
        category: '导航',
        title: '关于应用 About',
        subtitle: '版本信息、技术栈与更新日志',
        icon: <Info className="w-4 h-4 text-sky-500" />,
        keywords: ['about', 'gy', 'guanyu', '版本', '说明'],
        action: () => {
          navigate('/about');
          onClose();
        },
      },
    ];

    if (user) {
      list.push({
        id: 'nav-admin',
        category: '导航',
        title: '后台管理 Admin',
        subtitle: '配置管理与调试工具',
        icon: <Shield className="w-4 h-4 text-amber-500" />,
        keywords: ['admin', 'ht', 'guanli', '管理', '后台'],
        action: () => {
          navigate('/admin');
          onClose();
        },
      });
    }

    list.push(
      {
        id: 'theme-light',
        category: '外观主题',
        title: '浅色模式 (Light Theme)',
        subtitle: '清爽明亮界面',
        icon: <Sun className="w-4 h-4 text-amber-500" />,
        keywords: ['light', 'qs', 'qianse', '亮色', '白天'],
        action: () => {
          onThemeChange('light');
          onClose();
          toast.success('已切换为浅色模式');
        },
      },
      {
        id: 'theme-dark',
        category: '外观主题',
        title: '深色模式 (Dark Theme)',
        subtitle: '沉浸护眼暗黑界面',
        icon: <Moon className="w-4 h-4 text-indigo-400" />,
        keywords: ['dark', 'ss', 'shense', '暗黑', '夜间'],
        action: () => {
          onThemeChange('dark');
          onClose();
          toast.success('已切换为深色模式');
        },
      },
      {
        id: 'theme-blue',
        category: '外观主题',
        title: '海洋蓝模式 (Blue Theme)',
        subtitle: '专业金融交易配色',
        icon: <Palette className="w-4 h-4 text-blue-500" />,
        keywords: ['blue', 'lan', 'lanse', '深蓝', '金融'],
        action: () => {
          onThemeChange('blue');
          onClose();
          toast.success('已切换为海洋蓝模式');
        },
      },
      {
        id: 'sys-share',
        category: '系统与分享',
        title: '系统原生分享',
        subtitle: '调用 iPad / 系统原生分享面板或复制链接',
        icon: <Share2 className="w-4 h-4 text-emerald-500" />,
        keywords: ['share', 'fx', 'fenxiang', '分享', '复制'],
        action: handleShare,
      },
      {
        id: 'sys-refresh',
        category: '系统与分享',
        title: '更新应用与重置缓存',
        subtitle: '强制更新 Service Worker 与离线离包',
        icon: <RefreshCw className="w-4 h-4 text-rose-500" />,
        keywords: ['refresh', 'update', 'sx', 'shuaxin', '缓存', '更新'],
        action: handleRefreshApp,
      }
    );

    return list;
  }, [navigate, onClose, user, onThemeChange, handleShare, handleRefreshApp]);

  // Filter commands
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(item => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some(k => k.toLowerCase().includes(q));
      return matchTitle || matchSubtitle || matchKeywords;
    });
  }, [commands, query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 pb-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden card-subtle-ring ${
          theme === 'dark' 
            ? 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-black/80' 
            : theme === 'blue'
            ? 'bg-slate-900/95 border-blue-900/60 text-slate-100 shadow-blue-950/80'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/30'
        }`}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${
          theme === 'dark' ? 'border-zinc-800' : theme === 'blue' ? 'border-blue-900/50' : 'border-slate-100'
        }`}>
          <Search className="w-5 h-5 text-slate-400 dark:text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索页面、操作或快捷指令..."
            className="w-full bg-transparent text-base outline-none placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-normal"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors btn-tactile"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400">
            Esc
          </kbd>
        </div>

        {/* Command list */}
        <div 
          ref={listRef}
          className="max-h-[60vh] sm:max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400 dark:text-zinc-500">
              未找到匹配的指令或页面
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-75 ${
                    isSelected
                      ? theme === 'dark'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : theme === 'blue'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-500 text-white shadow-sm'
                      : theme === 'dark'
                      ? 'hover:bg-zinc-800/80 text-zinc-200'
                      : theme === 'blue'
                      ? 'hover:bg-slate-800/80 text-slate-200'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isSelected 
                        ? 'bg-white/20 text-white' 
                        : theme === 'dark' 
                        ? 'bg-zinc-800/80' 
                        : theme === 'blue'
                        ? 'bg-slate-800/80'
                        : 'bg-slate-100'
                    }`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-white' : ''}`}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className={`text-xs truncate ${
                          isSelected 
                            ? 'text-blue-100/90' 
                            : 'text-slate-400 dark:text-zinc-500'
                        }`}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-2 shrink-0">
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : theme === 'dark'
                        ? 'bg-zinc-800 text-zinc-400'
                        : theme === 'blue'
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.category}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-4 h-4 text-white/80 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className={`flex items-center justify-between px-4 py-2 text-[11px] border-t ${
          theme === 'dark'
            ? 'border-zinc-800/80 bg-zinc-950/40 text-zinc-400'
            : theme === 'blue'
            ? 'border-blue-900/40 bg-slate-950/40 text-slate-400'
            : 'border-slate-100 bg-slate-50 text-slate-500'
        }`}>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-current font-mono text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-current font-mono text-[10px]">↓</kbd>
              导航
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-current font-mono text-[10px]">↵</kbd>
              进入
            </span>
          </div>
          <span className="flex items-center gap-1 text-slate-400 dark:text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            YHTrader 妙控指令
          </span>
        </div>
      </div>
    </div>
  );
}
