import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, LogIn, LogOut, Menu, X, Sun, Moon, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import { Theme, themes } from '../../lib/theme';
import { noticeService } from '../../lib/services';
import type { Notice, User } from '../../lib/services/types';
import { renderMarkdown } from '../../shared/utils/markdown';

interface NavigationProps {
  user: User | null;
  theme: Theme;
  mobileMenuOpen: boolean;
  showThemeDropdown: boolean;
  onThemeChange: (theme: Theme) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onMobileMenuToggle: () => void;
  onThemeDropdownToggle: () => void;
}

const themeIcons = {
  light: <Sun className="w-5 h-5" />,
  dark: <Moon className="w-5 h-5" />,
  blue: <Palette className="w-5 h-5" />
};

const NOTICES_POLL_INTERVAL_MS = 5000;
const NOTICES_BADGE_POLL_INTERVAL_MS = 15000;

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
  if (normalized === 'FIRING') return 'bg-red-100 text-red-700';
  if (normalized === 'RESOLVED' || normalized === 'OK' || normalized === 'NORMAL') return 'bg-green-100 text-green-700';
  if (normalized) return 'bg-gray-100 text-gray-700';
  return 'bg-gray-100 text-gray-700';
};

export function Navigation({
  user,
  theme,
  mobileMenuOpen,
  showThemeDropdown,
  onThemeChange,
  onSignIn,
  onSignOut,
  onMobileMenuToggle,
  onThemeDropdownToggle
}: NavigationProps) {
  const navigate = useNavigate();
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNoticeUuid, setSelectedNoticeUuid] = useState<string | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeActionLoading, setNoticeActionLoading] = useState<'ack' | 'resolve' | null>(null);
  const noticesLoadingRef = useRef(false);
  const noticeLoadingRef = useRef(false);
  const noticeActionLoadingRef = useRef(false);

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

    const resolutionType = window.prompt('resolution_type', 'manual_fix') ?? null;
    if (resolutionType === null) {
      noticeActionLoadingRef.current = false;
      setNoticeActionLoading(null);
      return;
    }

    try {
      const { data, error } = await noticeService.resolveNotice(selectedNoticeUuid, { resolution_type: resolutionType });
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

  useEffect(() => {
    if (!noticesOpen) return;
    if (selectedNoticeUuid) return;
    void loadNotices();
  }, [loadNotices, noticesOpen, selectedNoticeUuid]);

  useEffect(() => {
    if (!noticesOpen) return;
    if (selectedNoticeUuid) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadNotices();
    }, NOTICES_POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [loadNotices, noticesOpen, selectedNoticeUuid]);

  useEffect(() => {
    if (noticesOpen && !selectedNoticeUuid) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void loadNotices({ silent: true });
    };
    refresh();
    const id = window.setInterval(refresh, NOTICES_BADGE_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadNotices, noticesOpen, selectedNoticeUuid]);

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
      <nav className={`${themes[theme].card} shadow-sm transition-colors duration-200 sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 
                className={`text-lg sm:text-xl font-bold ${themes[theme].text} cursor-pointer`}
                onClick={() => navigate('/')}
              >
                Stock Trading Journal
              </h1>
            </div>
            
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/journal')}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].secondary}`}
                >
                  Journal
                </button>
                <button
                  onClick={() => navigate('/options')}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].secondary}`}
                >
                  Options
                </button>
                <button
                  onClick={() => navigate('/admin')}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].secondary}`}
                >
                  Admin
                </button>
              </div>
              <button
                onClick={() => setNoticesOpen(true)}
                className={`relative p-2 rounded-md ${themes[theme].secondary}`}
                title="Alerts"
              >
                <Bell className="w-5 h-5" />
                {unresolvedCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
                    {unresolvedCount > 99 ? '99+' : unresolvedCount}
                  </span>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={onThemeDropdownToggle}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md ${themes[theme].secondary}`}
                >
                  {themeIcons[theme]}
                  <span className={`ml-2 ${themes[theme].text}`}>Theme</span>
                </button>
                
                {showThemeDropdown && (
                  <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${themes[theme].card} ring-1 ring-black ring-opacity-5 z-50`}>
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      {Object.keys(themes).map((themeName) => (
                        <button
                          key={themeName}
                          onClick={() => onThemeChange(themeName as Theme)}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            theme === themeName ? themes[theme].primary : themes[theme].secondary
                          }`}
                        >
                          {themeIcons[themeName as Theme]}
                          <span className="ml-2 capitalize">{themeName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {user ? (
                <div className="flex items-center space-x-3">
                  <div className="flex flex-col items-end">
                    <span className={`text-sm font-medium ${themes[theme].text}`}>
                      {user.name}
                    </span>
                    <span className={`text-xs ${themes[theme].text} opacity-75`}>
                      {user.email}
                    </span>
                  </div>
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <button
                    onClick={onSignOut}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].secondary}`}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={onSignIn}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].primary}`}
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  Sign In
                </button>
              )}
            </div>

            <div className="md:hidden flex items-center">
              <button
                onClick={onMobileMenuToggle}
                className={`p-2 rounded-md ${themes[theme].text}`}
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className={`md:hidden ${themes[theme].card} border-t ${themes[theme].border} py-4 absolute left-0 right-0 shadow-lg`}>
              <div className="flex flex-col space-y-4 px-4">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      navigate('/journal');
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2 rounded-md text-sm font-medium text-left ${themes[theme].secondary}`}
                  >
                    Journal
                  </button>
                  <button
                    onClick={() => {
                      navigate('/options');
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2 rounded-md text-sm font-medium text-left ${themes[theme].secondary}`}
                  >
                    Options
                  </button>
                  <button
                    onClick={() => {
                      navigate('/admin');
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2 rounded-md text-sm font-medium text-left ${themes[theme].secondary}`}
                  >
                    Admin
                  </button>
                  <button
                    onClick={() => {
                      setNoticesOpen(true);
                      onMobileMenuToggle();
                    }}
                    className={`w-full px-4 py-2 rounded-md text-sm font-medium text-left ${themes[theme].secondary}`}
                  >
                    Alerts{unresolvedCount > 0 ? ` (${unresolvedCount > 99 ? '99+' : unresolvedCount})` : ''}
                  </button>
                </div>
                <div className="flex justify-center space-x-2">
                  {Object.keys(themes).map((themeName) => (
                    <button
                      key={themeName}
                      onClick={() => onThemeChange(themeName as Theme)}
                      className={`p-2 rounded-full ${
                        theme === themeName ? themes[theme].primary : themes[theme].secondary
                      }`}
                    >
                      {themeIcons[themeName as Theme]}
                    </button>
                  ))}
                </div>
                {user ? (
                  <>
                    <div className="flex items-center justify-center space-x-3 py-2">
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                      <div className="flex flex-col">
                        <span className={`text-sm font-medium ${themes[theme].text}`}>
                          {user.name}
                        </span>
                        <span className={`text-xs ${themes[theme].text} opacity-75`}>
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={onSignOut}
                      className={`w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].secondary}`}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onSignIn}
                    className={`w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].primary}`}
                  >
                    <LogIn className="w-5 h-5 mr-2" />
                    Sign In
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {noticesOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeNotices} />
          <div
            className={`absolute right-0 top-0 h-full w-full max-w-md ${themes[theme].card} border-l ${themes[theme].border} shadow-xl flex flex-col`}
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
                    className={`p-2 rounded-md ${themes[theme].secondary}`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <span className={`text-lg font-semibold ${themes[theme].text}`}>Alerts</span>
              </div>
              <div className="flex items-center gap-2">
                {!selectedNoticeUuid && (
                  <button
                    onClick={() => void loadNotices()}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].secondary}`}
                  >
                    Refresh
                  </button>
                )}
                <button onClick={closeNotices} className={`p-2 rounded-md ${themes[theme].secondary}`}>
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
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusBadgeClass(status)}`}>
                              {status}
                            </span>
                          ) : null;
                        })()}
                        {selectedNotice.is_acked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                            已知
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs">
                            未 Ack
                          </span>
                        )}
                        {selectedNotice.is_resolved ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                            已处理
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
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
                          className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].secondary} ${noticeActionLoading !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {selectedNotice.is_acked ? '已 Ack' : noticeActionLoading === 'ack' ? 'Acking...' : 'Ack'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResolveNotice()}
                          disabled={noticeActionLoading !== null || selectedNotice.is_resolved}
                          className={`px-3 py-2 rounded-md text-sm font-medium ${themes[theme].primary} ${noticeActionLoading !== null || selectedNotice.is_resolved ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {selectedNotice.is_resolved ? 'Resolved' : noticeActionLoading === 'resolve' ? 'Resolving...' : 'Resolve'}
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
                                className={`w-full text-left p-4 rounded-xl border ${themes[theme].border} ${themes[theme].cardHover}`}
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
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusBadgeClass(status)}`}>
                                        {status}
                                      </span>
                                    ) : null}
                                    {isAcked ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                                        已知
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs">
                                        未 Ack
                                      </span>
                                    )}
                                    {isResolved ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                                        已处理
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                                        未处理
                                      </span>
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
