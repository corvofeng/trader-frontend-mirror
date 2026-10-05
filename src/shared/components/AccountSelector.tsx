import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, Briefcase, ChevronDown, X } from 'lucide-react';
import { accountService } from '../../lib/services';
import type { Account } from '../../lib/services/types';
import { Theme, themes } from '../../lib/theme';

interface AccountSelectorProps {
  userId: string;
  theme: Theme;
  selectedAccountId: string | null;
  onAccountChange: (accountId: string) => void;
  mode?: 'all' | 'options' | 'stocks';
  preferOptions?: boolean;
  refreshKey?: number;
  showCreate?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

// Simple in-memory cache per user and mode (options vs stocks)
const accountsCache: Map<string, Account[]> = new Map();

export function AccountSelector({
  userId,
  theme,
  selectedAccountId,
  onAccountChange,
  mode,
  preferOptions = true,
  refreshKey,
  showCreate = true,
  align = 'right',
  className = '',
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountDescription, setNewAccountDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedMode: 'all' | 'options' | 'stocks' = mode ?? (preferOptions ? 'options' : 'stocks');
  const cacheKey = `${resolvedMode}:${userId}`;
  const selectedAccountIdRef = React.useRef<string | null>(selectedAccountId);
  const onAccountChangeRef = React.useRef(onAccountChange);

  useEffect(() => {
    selectedAccountIdRef.current = selectedAccountId;
  }, [selectedAccountId]);

  useEffect(() => {
    onAccountChangeRef.current = onAccountChange;
  }, [onAccountChange]);

  const loadAccounts = useCallback(async (forceRefresh: boolean = false) => {
    setLoading(true);
    const currentSelectedAccountId = selectedAccountIdRef.current;
    const cached = accountsCache.get(cacheKey);
    if (!forceRefresh && cached && cached.length > 0) {
      setAccounts(cached);
      // Auto-select default if none provided or invalid
      const isAccountValid = currentSelectedAccountId && cached.some(a => (a.alias || a.id) === currentSelectedAccountId);
      
      if (!currentSelectedAccountId || !isAccountValid) {
        const def = cached.find(acc => acc.is_default) || cached[0];
        if (def) {
          const key = def.alias || def.id;
          if (key !== currentSelectedAccountId) {
            onAccountChangeRef.current(key);
          }
        }
      }
      setLoading(false);
      return;
    }

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

    let loadedAccounts: Account[] = [];
    if (resolvedMode === 'all') {
      const [stocksResponse, optionsResponse] = await Promise.all([
        accountService.getAccounts(userId),
        accountService.getOptionsAccounts(userId),
      ]);
      loadedAccounts = mergeAccounts([
        (stocksResponse.data || []) as Account[],
        (optionsResponse.data || []) as Account[],
      ]);
    } else if (resolvedMode === 'options') {
      const response = await accountService.getOptionsAccounts(userId);
      loadedAccounts = (response.data || []) as Account[];
      if (loadedAccounts.length === 0) {
        const fallback = await accountService.getAccounts(userId);
        loadedAccounts = (fallback.data || []) as Account[];
      }
    } else {
      const response = await accountService.getAccounts(userId);
      loadedAccounts = (response.data || []) as Account[];
    }

    if (loadedAccounts.length > 0) {
      setAccounts(loadedAccounts);
      accountsCache.set(cacheKey, loadedAccounts);
      
      // Auto-select default if none provided or invalid
      const freshSelectedAccountId = selectedAccountIdRef.current;
      const isAccountValid = freshSelectedAccountId && loadedAccounts.some(a => (a.alias || a.id) === freshSelectedAccountId);

      if ((!freshSelectedAccountId || !isAccountValid) && loadedAccounts.length > 0) {
        const defaultAccount = loadedAccounts.find(acc => acc.is_default) || loadedAccounts[0];
        const key = defaultAccount.alias || defaultAccount.id;
        if (key !== freshSelectedAccountId) {
          onAccountChangeRef.current(key);
        }
      }
    }
    setLoading(false);
  }, [userId, resolvedMode, cacheKey]);

  useEffect(() => {
    loadAccounts(false);
  }, [loadAccounts]);

  useEffect(() => {
    if (typeof refreshKey === 'number') {
      loadAccounts(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;

    const newAccount = {
      user_id: userId,
      name: newAccountName,
      description: newAccountDescription,
      is_default: accounts.length === 0,
      currency: 'USD',
    };

    const response = await accountService.createAccount(newAccount);
    if (response.data) {
      await loadAccounts();
      onAccountChange(response.data.alias || response.data.id);
      setNewAccountName('');
      setNewAccountDescription('');
      setShowAddForm(false);
    }
  };

  const handleSetDefault = async (accountId: string) => {
    await accountService.setDefaultAccount(userId, accountId);
    await loadAccounts();
  };

  const selectedAccount = accounts.find(
    acc => acc.alias === selectedAccountId || acc.id === selectedAccountId
  );
  const isDark = theme === 'dark';
  const triggerClass = isDark
    ? 'bg-[#161b26] text-zinc-100 border border-[#263147] hover:bg-[#1e2535] shadow-xs'
    : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs';
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const panelClass = isDark
    ? 'bg-[#121620] border-[#222a3d] fin-card-floating'
    : `bg-white border-slate-200 fin-card-floating`;
  const iconButtonClass = isDark
    ? 'p-1 rounded-full bg-[#1e2535] hover:bg-[#273248] text-slate-100 btn-tactile border border-white/5'
    : `p-1 rounded-full ${themes[theme].secondary} btn-tactile`;
  const selectedRowClass = isDark
    ? 'bg-blue-500/15 ring-1 ring-blue-500/40 border border-blue-500/30'
    : 'bg-blue-50 border-l-4 border-blue-600';
  const rowClass = isDark
    ? 'hover:bg-[#181e2b] border border-transparent'
    : 'hover:bg-gray-100';
  const defaultBadgeClass = isDark
    ? 'text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/25'
    : 'text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800';
  const setDefaultClass = isDark
    ? 'text-xs px-2 py-1 rounded-full bg-[#1e2535] text-slate-100 hover:bg-blue-500/20 hover:text-blue-200 btn-tactile'
    : `text-xs px-2 py-1 rounded-full btn-tactile hover:bg-blue-100 ${themes[theme].secondary}`;

  const renderPanelInner = () => (
    <>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${themes[theme].border} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-500" />
          <h3 className={`text-sm sm:text-base font-bold ${themes[theme].text}`}>
            选择交易账户
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {showCreate && resolvedMode !== 'all' && (
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={iconButtonClass}
              title="添加新账户"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4 overflow-y-auto max-h-[58vh] space-y-3 custom-scrollbar">
        {showCreate && resolvedMode !== 'all' && showAddForm && (
          <div className="p-3 rounded-xl border border-blue-500/20 fin-well space-y-2.5 animate-fade-in">
            <input
              type="text"
              placeholder="账户名称"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs sm:text-sm rounded-lg border ${themes[theme].input} ${themes[theme].text} ${themes[theme].border} focus:ring-2 focus:ring-blue-500`}
            />
            <input
              type="text"
              placeholder="描述 (可选)"
              value={newAccountDescription}
              onChange={(e) => setNewAccountDescription(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs sm:text-sm rounded-lg border ${themes[theme].input} ${themes[theme].text} ${themes[theme].border} focus:ring-2 focus:ring-blue-500`}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateAccount}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg ${themes[theme].primary} text-white btn-tactile font-medium`}
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewAccountName('');
                  setNewAccountDescription('');
                }}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg ${themes[theme].secondary} btn-tactile font-medium`}
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {loading ? (
            <div className={`text-center py-6 ${themes[theme].text} opacity-60 text-xs`}>
              <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              加载账户中...
            </div>
          ) : accounts.length === 0 ? (
            <div className={`text-center py-6 ${themes[theme].text} opacity-60 text-xs`}>
              暂无账户，请创建一个新账户开始使用
            </div>
          ) : (
            accounts.map((account) => {
              const isSelected = selectedAccountId === (account.alias || account.id);
              return (
                <div
                  key={account.id}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl cursor-pointer btn-tactile ${rowClass} ${
                    isSelected ? selectedRowClass : ''
                  }`}
                  onClick={() => {
                    onAccountChange(account.alias || account.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-xs sm:text-sm truncate ${themes[theme].text}`}>
                        {account.name}
                      </span>
                      {account.is_default && (
                        <span className={defaultBadgeClass}>默认</span>
                      )}
                    </div>
                    {account.description && (
                      <div className={`text-[11px] sm:text-xs ${themes[theme].text} opacity-60 truncate mt-0.5`}>
                        {account.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {resolvedMode !== 'all' && !account.is_default && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefault(account.alias || account.id);
                        }}
                        className={setDefaultClass}
                      >
                        设为默认
                      </button>
                    )}
                    {isSelected && (
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium btn-tactile max-w-full min-w-0 ${triggerClass}`}
        aria-expanded={isOpen}
        aria-label="选择交易账户"
      >
        <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 shrink-0" />
        <span className="font-medium truncate max-w-[8.5rem] sm:max-w-[14rem]">
          {selectedAccount ? selectedAccount.name : '选择账户'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-60 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        isMobile && typeof document !== 'undefined' ? (
          createPortal(
            <>
              {/* Mobile Backdrop */}
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9990] transition-opacity animate-fade-in"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
              />
              {/* Mobile Bottom Sheet Modal */}
              <div
                className={`fixed inset-x-3 bottom-5 z-[9995] max-h-[82vh] rounded-2xl border ${panelClass} overflow-hidden flex flex-col shadow-2xl animate-fade-in`}
              >
                {renderPanelInner()}
              </div>
            </>,
            document.body
          )
        ) : (
          <>
            {/* Desktop Transparent Backdrop to capture outside clicks */}
            <div
              className="fixed inset-0 z-[890]"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
            {/* Desktop Anchored Popover */}
            <div
              className={`absolute top-full mt-2 z-[900] ${
                align === 'left' ? 'left-0' : 'right-0'
              } w-84 rounded-2xl border ${panelClass} overflow-hidden flex flex-col shadow-2xl popover-spring`}
            >
              {renderPanelInner()}
            </div>
          </>
        )
      )}
    </div>
  );
}
