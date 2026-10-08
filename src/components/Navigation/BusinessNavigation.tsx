import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Bell, LogOut, LogIn, Menu, X, Sun, Moon, Palette, 
  RefreshCw, TrendingUp, Search, ChevronDown, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Theme, themes } from '../../lib/theme';
import { noticeService } from '../../lib/services';
import type { Notice } from '../../lib/services/types';
import { renderMarkdown } from '../../shared/utils/markdown';
import type { NavigationProps } from './types';

const themeIcons = {
  light: <Sun className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
  blue: <Palette className="w-4 h-4" />
};

type NoticeTimeBucket = 'today' | 'recent3days' | 'older' | 'unknown';

const safeParseDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
};

const getNoticeTimeBucket = (createdAt: string | null | undefined): NoticeTimeBucket => {
  const created = safeParseDate(createdAt);
  if (!created) return 'unknown';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recent3DaysStart = new Date(todayStart);
  recent3DaysStart.setDate(todayStart.getDate() - 3);
  if (created >= todayStart) return 'today';
  if (created >= recent3DaysStart) return 'recent3days';
  return 'older';
};

const extractStatusFromContent = (content: string | null | undefined): string | null => {
  const text = (content || '').trim();
  if (!text) return null;
  const m1 = text.match(/(?:\*\*Status\*\*|Status)\s*:\s*`([^`]+)`/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = text.match(/(?:\*\*Status\*\*|Status)\s*:\s*([A-Za-z0-9_-]+)/i);
  if (m2?.[1]) return m2[1].trim();
  return null;
};

const toOneLinePlainText = (markdown: string | null | undefined, maxLen: number): string => {
  const text = (markdown || '')
    .replace(/\[\[button:[^\]]+\]\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
};

const statusBadgeClass = (status: string | null): string => {
  const normalized = (status || '').trim().toUpperCase();
  if (normalized === 'FIRING') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  if (normalized === 'RESOLVED' || normalized === 'OK' || normalized === 'NORMAL') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
};

export function BusinessNavigation({
  user,
  theme,
  mobileMenuOpen,
  showThemeDropdown,
  onThemeChange,
  onSignIn,
  onSignOut,
  onMobileMenuToggle,
  onThemeDropdownToggle,
  onOpenCommandPalette
}: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActivePath = (path: string) => location.pathname === path;

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (showThemeDropdown && themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        onThemeDropdownToggle();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showThemeDropdown, onThemeDropdownToggle]);

  useEffect(() => {
    if (sessionStorage.getItem('sw_refreshed') === 'true') {
      sessionStorage.removeItem('sw_refreshed');
      toast.success('页面及 Service Worker 缓存已成功刷新！', { id: 'sw-refresh-success' });
    }
  }, []);

  const [noticesOpen, setNoticesOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) onMobileMenuToggle();
        if (noticesOpen) setNoticesOpen(false);
        if (userMenuOpen) setUserMenuOpen(false);
        if (showThemeDropdown) onThemeDropdownToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, noticesOpen, userMenuOpen, showThemeDropdown, onMobileMenuToggle, onThemeDropdownToggle]);

  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNoticeUuid, setSelectedNoticeUuid] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeActionLoading, setNoticeActionLoading] = useState<'ack' | 'resolve' | null>(null);
  const [noticeListActionLoading, setNoticeListActionLoading] = useState<string | null>(null);
  const noticesLoadingRef = useRef(false);
  const noticeLoadingRef = useRef(false);
  const noticeActionLoadingRef = useRef(false);
  const noticeListActionLoadingRef = useRef(false);

  const unresolvedCount = useMemo(() => {
    return notices.filter(n => !n.is_resolved).length;
  }, [notices]);

  const groupedNotices = useMemo(() => {
    const sorted = notices
      .slice()
      .sort((a, b) => {
        const ta = safeParseDate(a.created_at)?.getTime() ?? -Infinity;
        const tb = safeParseDate(b.created_at)?.getTime() ?? -Infinity;
        return tb - ta;
      });

    const result: Record<NoticeTimeBucket, Notice[]> = {
      today: [],
      recent3days: [],
      older: [],
      unknown: []
    };
    for (const n of sorted) {
      result[getNoticeTimeBucket(n.created_at)].push(n);
    }
    return result;
  }, [notices]);

  const loadNotices = useCallback(async (options?: { silent?: boolean }) => {
    if (noticesLoadingRef.current) return;
    noticesLoadingRef.current = true;
    if (!options?.silent) {
      setNoticesLoading(true);
      setNoticesError(null);
    }
    try {
      const { data, error } = await noticeService.listNotices();
      if (error) {
        if (!options?.silent) {
          setNoticesError(error.message || 'Failed to load notices');
          setNotices([]);
        }
        return;
      }
      setNotices(data || []);
    } finally {
      noticesLoadingRef.current = false;
      if (!options?.silent) {
        setNoticesLoading(false);
      }
    }
  }, []);

  const handleRefreshServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      toast.error('当前浏览器不支持 Service Worker');
      return;
    }
    setIsRefreshing(true);
    const toastId = toast.loading('正在刷新缓存及检测更新...');
    try {
      const w = window as unknown as { __pwaUpdateSW?: (reload?: boolean) => Promise<void> };
      if (typeof w.__pwaUpdateSW === 'function') {
        sessionStorage.setItem('sw_refreshed', 'true');
        await w.__pwaUpdateSW(true);
        toast.dismiss(toastId);
        toast.success('已是最新版本，缓存刷新成功！', { id: 'sw-refresh-latest' });
        sessionStorage.removeItem('sw_refreshed');
        setIsRefreshing(false);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      sessionStorage.setItem('sw_refreshed', 'true');
      await reg?.update();
      window.location.reload();
    } catch (e) {
      toast.dismiss(toastId);
      sessionStorage.removeItem('sw_refreshed');
      setIsRefreshing(false);
      toast.error(e instanceof Error ? e.message : '刷新 Service Worker 失败');
    }
  }, []);

  const openNotice = useCallback(async (noticeUuid: string) => {
    if (noticeLoadingRef.current) return;
    noticeLoadingRef.current = true;
    setSelectedNoticeUuid(noticeUuid);
    setSelectedNotice(null);
    setNoticesError(null);
    setNoticeLoading(true);
    try {
      const { data, error } = await noticeService.getNotice(noticeUuid);
      if (error) {
        setNoticesError(error.message || 'Failed to load notice');
        return;
      }
      setSelectedNotice(data);
    } finally {
      noticeLoadingRef.current = false;
      setNoticeLoading(false);
    }
  }, []);

  const closeNotices = () => {
    setNoticesOpen(false);
    setSelectedNoticeUuid(null);
    setSelectedNotice(null);
    noticeLoadingRef.current = false;
    setNoticeLoading(false);
    noticeActionLoadingRef.current = false;
    setNoticeActionLoading(null);
    setNoticesError(null);
  };

  const handleAckNotice = useCallback(async () => {
    if (!selectedNoticeUuid) return;
    if (noticeActionLoadingRef.current) return;
    noticeActionLoadingRef.current = true;
    setNoticeActionLoading('ack');

    const userComment = window.prompt('user_comment（可选）', '') ?? null;
    if (userComment === null) {
      noticeActionLoadingRef.current = false;
      setNoticeActionLoading(null);
      return;
    }

    try {
      const { data, error } = await noticeService.ackNotice(selectedNoticeUuid, { user_comment: userComment });
      if (error) {
        toast.error(error.message || 'Ack 失败');
        return;
      }
      toast.success('已标记为已知');
      if (data) {
        setSelectedNotice(data);
      } else {
        await openNotice(selectedNoticeUuid);
      }
      await loadNotices({ silent: true });
    } finally {
      noticeActionLoadingRef.current = false;
      setNoticeActionLoading(null);
    }
  }, [loadNotices, openNotice, selectedNoticeUuid]);

  const handleResolveNotice = useCallback(async () => {
    if (!selectedNoticeUuid) return;
    if (noticeActionLoadingRef.current) return;
    noticeActionLoadingRef.current = true;
    setNoticeActionLoading('resolve');

    try {
      const { data, error } = await noticeService.resolveNotice(selectedNoticeUuid, { resolution_type: 'manual_fix' });
      if (error) {
        toast.error(error.message || 'Resolve 失败');
        return;
      }
      toast.success('已处理');
      if (data) {
        setSelectedNotice(data);
      } else {
        await openNotice(selectedNoticeUuid);
      }
      await loadNotices({ silent: true });
    } finally {
      noticeActionLoadingRef.current = false;
      setNoticeActionLoading(null);
    }
  }, [loadNotices, openNotice, selectedNoticeUuid]);

  const handleQuickResolveNotice = useCallback(
    async (noticeUuid: string) => {
      if (!noticeUuid) return;
      if (noticeListActionLoadingRef.current) return;
      noticeListActionLoadingRef.current = true;
      setNoticeListActionLoading(noticeUuid);
      try {
        const { data, error } = await noticeService.resolveNotice(noticeUuid, { resolution_type: 'manual_fix' });
        if (error) {
          toast.error(error.message || 'Resolve 失败');
          return;
        }
        toast.success('已处理');
        if (selectedNoticeUuid === noticeUuid) {
          if (data) {
            setSelectedNotice(data);
          } else {
            await openNotice(noticeUuid);
          }
        }
        await loadNotices({ silent: true });
      } finally {
        noticeListActionLoadingRef.current = false;
        setNoticeListActionLoading(null);
      }
    },
    [loadNotices, openNotice, selectedNoticeUuid]
  );

  const handleResolveAllUnresolved = useCallback(async () => {
    if (noticeListActionLoadingRef.current) return;
    const targets = notices.filter(n => !n.is_resolved).map(n => n.notice_uuid);
    if (targets.length === 0) return;

    noticeListActionLoadingRef.current = true;
    setNoticeListActionLoading('ALL');
    const toastId = toast.loading(`Resolving ${targets.length} 条...`);
    let ok = 0;
    let failed = 0;
    try {
      for (const uuid of targets) {
        const { error } = await noticeService.resolveNotice(uuid, { resolution_type: 'manual_fix' });
        if (error) {
          failed += 1;
          continue;
        }
        ok += 1;
      }
      await loadNotices({ silent: true });
      if (selectedNoticeUuid && targets.includes(selectedNoticeUuid)) {
        await openNotice(selectedNoticeUuid);
      }
      toast.dismiss(toastId);
      if (failed === 0) {
        toast.success(`已处理 ${ok} 条`);
      } else {
        toast.error(`已处理 ${ok} 条，失败 ${failed} 条`);
      }
    } finally {
      noticeListActionLoadingRef.current = false;
      setNoticeListActionLoading(null);
      toast.dismiss(toastId);
    }
  }, [loadNotices, notices, openNotice, selectedNoticeUuid]);

  useEffect(() => {
    if (!user) {
      setNotices([]);
      return;
    }
    void loadNotices({ silent: true });
  }, [loadNotices, user]);

  const handleNoticeContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const button = target?.closest?.('button[data-notice-uuid]') as HTMLButtonElement | null;
    if (!button) return;
    const uuid = button.dataset.noticeUuid;
    if (!uuid) return;
    e.preventDefault();
    void openNotice(uuid);
  };

  return (
    <React.Fragment>
      <nav className={`${themes[theme].card} border-b ${themes[theme].border} backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 sticky top-0 z-40 transition-colors duration-200 pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_20px_-4px_rgba(15,23,42,0.07)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.85)]`}>
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left Section: Logo & Main Navigation Links */}
            <div className="flex items-center gap-6 min-w-0">
              {/* Logo */}
              <div 
                className="flex items-center gap-2.5 cursor-pointer group shrink-0 select-none"
                onClick={() => navigate('/')}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform duration-200 ring-1 ring-white/20 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className={`text-lg sm:text-xl font-bold tracking-tight ${themes[theme].text} whitespace-nowrap`}>
                  Trader<span className="text-blue-500">Log</span>
                </span>
              </div>

              {/* Desktop Nav Pills */}
              <div className="hidden md:flex items-center gap-1 p-1 rounded-xl fin-well border border-black/5 dark:border-white/5 shrink-0">
                <button
                  onClick={() => navigate('/journal')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap shrink-0 transition-all ${
                    isActivePath('/journal')
                      ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  投资组合
                </button>
                {user && (
                  <button
                    onClick={() => navigate('/options')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap shrink-0 transition-all ${
                      isActivePath('/options')
                        ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    期权
                  </button>
                )}
                {user && (
                  <button
                    onClick={() => navigate('/terminal')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap shrink-0 transition-all ${
                      isActivePath('/terminal')
                        ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                        : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 font-semibold'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <span>终端</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                      PRO
                    </span>
                  </button>
                )}
                {user && (
                  <button
                    onClick={() => navigate('/admin')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap shrink-0 transition-all ${
                      isActivePath('/admin')
                        ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    管理
                  </button>
                )}
                <button
                  onClick={() => navigate('/about')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap shrink-0 transition-all ${
                    isActivePath('/about')
                      ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  关于
                </button>
              </div>
            </div>

            {/* Right Section: Compact Pro Tools & User Profile */}
            <div className="hidden md:flex items-center gap-2.5 shrink-0">
              {/* Quick Search & Command Palette trigger */}
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border btn-tactile whitespace-nowrap shrink-0 transition-all ${
                    theme === 'dark'
                      ? 'border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:text-white hover:border-zinc-600 hover:bg-zinc-800'
                      : theme === 'blue'
                      ? 'border-blue-900/40 bg-slate-800/40 text-slate-200 hover:text-white hover:border-blue-700 hover:bg-slate-800'
                      : 'border-slate-200 bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                  title="快捷指令与搜索 (⌘K / Ctrl+K)"
                >
                  <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="hidden xl:inline text-xs">搜索 / 指令</span>
                  <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-semibold text-slate-500 dark:text-zinc-400">
                    ⌘K
                  </kbd>
                </button>
              )}

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 pl-1">
                {/* Refresh Service Worker / Cache (Icon Button) */}
                <button
                  onClick={() => void handleRefreshServiceWorker()}
                  className={`p-2 rounded-lg btn-tactile ${themes[theme].secondary}`}
                  title="刷新 Service Worker 及更新检测"
                  aria-label="Refresh Cache"
                >
                  <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-zinc-300 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
                </button>

                {/* Notifications / Alerts Bell Button */}
                {user && (
                  <button
                    onClick={() => setNoticesOpen(true)}
                    className={`relative p-2 rounded-lg btn-tactile ${themes[theme].secondary}`}
                    title={`系统告警与提醒 (${unresolvedCount} 条未处理)`}
                    aria-label="Alerts"
                  >
                    <Bell className="w-4 h-4 text-slate-600 dark:text-zinc-300" />
                    {unresolvedCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                        {unresolvedCount > 99 ? '99+' : unresolvedCount}
                      </span>
                    )}
                  </button>
                )}

                {/* Theme Selector Popover */}
                <div className="relative" ref={themeMenuRef}>
                  <button
                    onClick={onThemeDropdownToggle}
                    className={`p-2 rounded-lg btn-tactile ${themes[theme].secondary}`}
                    title={`外观主题: ${theme}`}
                    aria-label="Theme switcher"
                  >
                    {themeIcons[theme]}
                  </button>
                  
                  {showThemeDropdown && (
                    <div className={`absolute right-0 mt-2 w-36 rounded-xl ${themes[theme].card} border ${themes[theme].border} fin-card-floating popover-spring z-50 overflow-hidden shadow-xl`}>
                      <div className="p-1 space-y-0.5" role="menu">
                        {Object.keys(themes).map((themeName) => {
                          const isCurrent = theme === themeName;
                          return (
                            <button
                              key={themeName}
                              onClick={() => {
                                onThemeChange(themeName as Theme);
                                onThemeDropdownToggle();
                              }}
                              className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium btn-tactile select-none ${
                                isCurrent 
                                  ? `${themes[theme].primary} text-white font-semibold`
                                  : `${themes[theme].secondary} hover:opacity-100 opacity-80`
                              }`}
                            >
                              <div className="flex items-center gap-2 capitalize">
                                {themeIcons[themeName as Theme]}
                                <span>{themeName}</span>
                              </div>
                              {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* User Profile Pill & Dropdown */}
              {user ? (
                <div className="relative ml-1" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(prev => !prev)}
                    className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 btn-tactile select-none shrink-0"
                    aria-label="User menu"
                  >
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-7 h-7 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10 shrink-0"
                    />
                    <span className={`text-xs font-semibold max-w-[90px] truncate ${themes[theme].text}`}>
                      {user.name}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {userMenuOpen && (
                    <div className={`absolute right-0 mt-2 w-56 rounded-2xl ${themes[theme].card} border ${themes[theme].border} fin-card-floating popover-spring z-50 overflow-hidden shadow-2xl p-1.5 animate-fade-in`}>
                      {/* User Info Header */}
                      <div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={user.avatar_url}
                            alt={user.name}
                            className="w-9 h-9 rounded-xl object-cover ring-1 ring-black/10 dark:ring-white/10 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-bold truncate ${themes[theme].text}`}>
                              {user.name}
                            </p>
                            <p className={`text-[11px] truncate opacity-60 ${themes[theme].text}`}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dropdown Actions */}
                      <div className="py-1 space-y-0.5">
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            void handleRefreshServiceWorker();
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium btn-tactile ${themes[theme].secondary}`}
                        >
                          <RefreshCw className="w-3.5 h-3.5 opacity-70" />
                          <span>刷新系统与缓存</span>
                        </button>

                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setNoticesOpen(true);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium btn-tactile ${themes[theme].secondary}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Bell className="w-3.5 h-3.5 opacity-70" />
                            <span>告警与通知</span>
                          </div>
                          {unresolvedCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
                              {unresolvedCount}
                            </span>
                          )}
                        </button>
                      </div>

                      <div className="pt-1 border-t border-black/5 dark:border-white/5">
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            onSignOut();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 btn-tactile transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>退出登录</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={onSignIn}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold btn-tactile ${themes[theme].primary} text-white whitespace-nowrap shrink-0`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>登录</span>
                </button>
              )}
            </div>

            {/* Mobile Actions Button */}
            <div className="md:hidden flex items-center gap-1">
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className={`p-2 rounded-lg ${themes[theme].text} btn-tactile`}
                  title="搜索与快捷指令"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onMobileMenuToggle}
                className={`p-2 rounded-lg ${themes[theme].text} btn-tactile`}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className={`md:hidden ${themes[theme].card} border-t ${themes[theme].border} py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] absolute left-0 right-0 shadow-xl animate-fade-in z-50`}>
              <div className="flex flex-col space-y-3 px-4">
                {onOpenCommandPalette && (
                  <button
                    onClick={() => {
                      onMobileMenuToggle();
                      onOpenCommandPalette();
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left flex items-center justify-between btn-tactile ${themes[theme].secondary}`}
                  >
                    <span className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-blue-500" />
                      搜索与快捷指令
                    </span>
                    <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10">⌘K</kbd>
                  </button>
                )}

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      navigate('/journal');
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left btn-tactile ${
                      isActivePath('/journal')
                        ? `${themes[theme].primary} text-white font-semibold shadow-xs`
                        : themes[theme].secondary
                    }`}
                  >
                    投资组合
                  </button>
                  {user && (
                    <button
                      onClick={() => {
                        navigate('/options');
                        onMobileMenuToggle();
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left btn-tactile ${
                        isActivePath('/options')
                          ? `${themes[theme].primary} text-white font-semibold shadow-xs`
                          : themes[theme].secondary
                      }`}
                    >
                      期权
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={() => {
                        navigate('/terminal');
                        onMobileMenuToggle();
                      }}
                      className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-left btn-tactile flex items-center justify-between bg-blue-50/70 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        交易终端 (Terminal)
                      </span>
                      <span className="text-[10px] font-mono uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">
                        PRO
                      </span>
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={() => {
                        navigate('/admin');
                        onMobileMenuToggle();
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left btn-tactile ${
                        isActivePath('/admin')
                          ? `${themes[theme].primary} text-white font-semibold shadow-xs`
                          : themes[theme].secondary
                      }`}
                    >
                      管理
                    </button>
                  )}
                  <button
                    onClick={() => {
                      navigate('/about');
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left btn-tactile ${
                      isActivePath('/about')
                        ? `${themes[theme].primary} text-white font-semibold shadow-xs`
                        : themes[theme].secondary
                    }`}
                  >
                    关于
                  </button>
                  {user && (
                    <button
                      onClick={() => {
                        setNoticesOpen(true);
                        onMobileMenuToggle();
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left flex items-center justify-between btn-tactile ${themes[theme].secondary}`}
                    >
                      <span className="flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        系统告警与提醒
                      </span>
                      {unresolvedCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                          {unresolvedCount > 99 ? '99+' : unresolvedCount}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      void handleRefreshServiceWorker();
                      onMobileMenuToggle();
                    }}
                    className={`w-full inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-left btn-tactile ${themes[theme].secondary}`}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    刷新 Service Worker 与缓存
                  </button>
                </div>

                {/* Theme Selector in Mobile */}
                <div className="flex justify-center space-x-3 pt-2 border-t border-black/5 dark:border-white/5">
                  {Object.keys(themes).map((themeName) => (
                    <button
                      key={themeName}
                      onClick={() => onThemeChange(themeName as Theme)}
                      className={`p-2.5 rounded-xl btn-tactile ${
                        theme === themeName ? themes[theme].primary : themes[theme].secondary
                      }`}
                      title={themeName}
                    >
                      {themeIcons[themeName as Theme]}
                    </button>
                  ))}
                </div>

                {/* User Section in Mobile */}
                {user ? (
                  <div className="pt-2 border-t border-black/5 dark:border-white/5">
                    <div className="flex items-center space-x-3 py-2">
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        className="h-10 w-10 rounded-xl object-cover ring-1 ring-black/10 dark:ring-white/10"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-bold truncate ${themes[theme].text}`}>
                          {user.name}
                        </span>
                        <span className={`text-xs truncate ${themes[theme].text} opacity-60`}>
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onMobileMenuToggle();
                        onSignOut();
                      }}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-red-200/50 dark:border-red-900/40 text-sm font-medium rounded-xl text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/30 btn-tactile mt-2"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      退出登录
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onSignIn();
                      onMobileMenuToggle();
                    }}
                    className={`w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-xl ${themes[theme].primary} text-white btn-tactile mt-2`}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    登录
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Alerts Drawer Modal */}
      {noticesOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-fade-in" onClick={closeNotices} />
          <div
            className={`absolute right-0 top-0 h-full w-full max-w-md ${themes[theme].card} border-l ${themes[theme].border} shadow-2xl flex flex-col transform transition-transform duration-250 ease-emil-out`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-4 border-b ${themes[theme].border}`}>
              <div className="flex items-center gap-2">
                {selectedNoticeUuid && (
                  <button
                    onClick={() => {
                      setSelectedNoticeUuid(null);
                      setSelectedNotice(null);
                      setNoticeLoading(false);
                      setNoticesError(null);
                    }}
                    className={`p-2 rounded-lg btn-tactile ${themes[theme].secondary}`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <span className={`text-lg font-semibold tracking-tight ${themes[theme].text}`}>Alerts</span>
              </div>
              <div className="flex items-center gap-2">
                {!selectedNoticeUuid && (
                  <React.Fragment>
                    <button
                      onClick={() => void loadNotices()}
                      className={`px-3 py-2 rounded-lg text-sm font-medium btn-tactile ${themes[theme].secondary}`}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveAllUnresolved()}
                      disabled={unresolvedCount === 0 || noticeListActionLoading !== null}
                      className={`px-3 py-2 rounded-lg text-sm font-medium btn-tactile ${themes[theme].primary} ${unresolvedCount === 0 || noticeListActionLoading !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title={unresolvedCount === 0 ? '没有未处理提醒' : '一键 Resolve 全部未处理提醒'}
                    >
                      {noticeListActionLoading === 'ALL' ? 'Resolving...' : `一键 Resolve${unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}`}
                    </button>
                  </React.Fragment>
                )}
                <button onClick={closeNotices} className={`p-2 rounded-lg btn-tactile ${themes[theme].secondary}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {noticesError && (
                <div className={`mb-3 text-sm ${themes[theme].text} opacity-80`}>
                  {noticesError}
                </div>
              )}

              {selectedNoticeUuid ? (
                noticeLoading ? (
                  <div className={`flex justify-center items-center h-40 ${themes[theme].text} opacity-70`}>
                    Loading...
                  </div>
                ) : selectedNotice ? (
                  <div className="space-y-3">
                    <div>
                      <div className={`text-base font-semibold ${themes[theme].text}`}>
                        {selectedNotice.title}
                      </div>
                      <div className={`text-xs ${themes[theme].text} opacity-70 mt-1`}>
                        {new Date(selectedNotice.created_at).toLocaleString()}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-3">
                        {(() => {
                          const status = extractStatusFromContent(selectedNotice.content);
                          return status ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(status)}`}>
                              {status}
                            </span>
                          ) : null;
                        })()}
                        {selectedNotice.is_acked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 text-xs">
                            已知
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs">
                            未 Ack
                          </span>
                        )}
                        {selectedNotice.is_resolved ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs">
                            已处理
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs">
                            未处理
                          </span>
                        )}
                      </div>
                      <div className={`mt-3 rounded-lg border ${themes[theme].border} p-3`}>
                        <div className={`text-xs ${themes[theme].text} opacity-80 space-y-1`}>
                          <div className="flex items-center justify-between gap-3">
                            <span>创建时间</span>
                            <span className="text-right">{safeParseDate(selectedNotice.created_at)?.toLocaleString() ?? '-'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>更新时间</span>
                            <span className="text-right">{safeParseDate(selectedNotice.updated_at)?.toLocaleString() ?? '-'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Ack 信息</span>
                            <span className="text-right">
                              {selectedNotice.is_acked
                                ? `${selectedNotice.acker || '-'} @ ${safeParseDate(selectedNotice.acked_at || '')?.toLocaleString() ?? '-'}`
                                : '-'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Resolve 信息</span>
                            <span className="text-right">
                              {selectedNotice.is_resolved
                                ? `${selectedNotice.resolver || '-'} @ ${safeParseDate(selectedNotice.resolved_at || '')?.toLocaleString() ?? '-'}`
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => void handleAckNotice()}
                          disabled={noticeActionLoading !== null || Boolean(selectedNotice.is_acked)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium btn-tactile ${themes[theme].secondary} ${noticeActionLoading !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {selectedNotice.is_acked ? '已 Ack' : noticeActionLoading === 'ack' ? 'Acking...' : 'Ack'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResolveNotice()}
                          disabled={noticeActionLoading !== null || selectedNotice.is_resolved}
                          className={`px-3 py-2 rounded-lg text-sm font-medium btn-tactile ${themes[theme].primary} ${noticeActionLoading !== null || selectedNotice.is_resolved ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {selectedNotice.is_resolved ? '已 Resolve' : noticeActionLoading === 'resolve' ? 'Resolving...' : '一键 Resolve'}
                        </button>
                      </div>
                    </div>
                    <div
                      className={`${themes[theme].text} text-sm leading-relaxed space-y-2 break-words`}
                      onClick={handleNoticeContentClick}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(selectedNotice.content || '', theme)
                      }}
                    />
                  </div>
                ) : (
                  <div className={`text-sm ${themes[theme].text} opacity-70`}>
                    Alert not found.
                  </div>
                )
              ) : noticesLoading ? (
                <div className={`flex justify-center items-center h-40 ${themes[theme].text} opacity-70`}>
                  Loading...
                </div>
              ) : notices.length === 0 ? (
                <div className={`text-sm ${themes[theme].text} opacity-70`}>
                  No alerts.
                </div>
              ) : (
                <div className="space-y-5">
                  {(
                    [
                      { key: 'today' as const, label: '今天' },
                      { key: 'recent3days' as const, label: '最近 3 天' },
                      { key: 'older' as const, label: '超过 3 天' },
                      { key: 'unknown' as const, label: '未知时间' }
                    ] as const
                  ).map((group) => {
                    const items = groupedNotices[group.key];
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={group.key} className="space-y-2">
                        <div className={`flex items-center justify-between ${themes[theme].text}`}>
                          <div className="text-xs font-semibold opacity-80">
                            {group.label}
                          </div>
                          <div className="text-xs opacity-60">
                            {items.length}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {items.map((n) => {
                            const status = extractStatusFromContent(n.content);
                            const created = safeParseDate(n.created_at);
                            const createdLabel = created ? created.toLocaleString() : '-';
                            const preview = toOneLinePlainText(n.content, 88);
                            const isAcked = Boolean(n.is_acked);
                            const isResolved = Boolean(n.is_resolved);
                            return (
                              <button
                                key={n.notice_uuid}
                                onClick={() => void openNotice(n.notice_uuid)}
                                className={`w-full text-left p-4 rounded-xl border ${themes[theme].border} ${themes[theme].cardHover} card-subtle-ring btn-tactile transition-all duration-150 select-none`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className={`text-sm font-semibold ${themes[theme].text} truncate`}>
                                      {n.title}
                                    </div>
                                    <div className={`text-xs ${themes[theme].text} opacity-70 mt-1`}>
                                      {createdLabel}
                                    </div>
                                  </div>
                                  <div className="flex items-center flex-wrap justify-end gap-2">
                                    {status ? (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(status)}`}>
                                        {status}
                                      </span>
                                    ) : null}
                                    {isAcked ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 text-xs">
                                        已知
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs">
                                        未 Ack
                                      </span>
                                    )}
                                    {isResolved ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs">
                                        已处理
                                      </span>
                                    ) : (
                                      <React.Fragment>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs">
                                          未处理
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleQuickResolveNotice(n.notice_uuid);
                                          }}
                                          disabled={noticeListActionLoading !== null}
                                          className={`px-2 py-1 rounded-md text-[10px] font-semibold btn-tactile ${themes[theme].primary} ${noticeListActionLoading !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        >
                                          {noticeListActionLoading === n.notice_uuid ? 'Resolving...' : '一键 Resolve'}
                                        </button>
                                      </React.Fragment>
                                    )}
                                  </div>
                                </div>
                                {preview ? (
                                  <div className={`mt-2 text-xs ${themes[theme].text} opacity-75 break-words`}>
                                    {preview}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
