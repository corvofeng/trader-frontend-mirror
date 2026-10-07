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
  const isBlue = theme === 'blue';

  const triggerClass = isDark
    ? 'bg-[#161b26] text-zinc-100 border-[#263147] hover:bg-[#1e2535] shadow-xs'
    : isBlue
    ? 'bg-white text-slate-800 border-blue-200/90 hover:bg-blue-50/50 shadow-xs'
    : 'bg-white text-slate-800 border-slate-200/90 hover:bg-slate-50 shadow-xs';

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
    ? 'bg-[#121620]/95 border-[#232c3f] backdrop-blur-md fin-card-floating text-zinc-100'
    : isBlue
    ? 'bg-white/95 border-blue-200/90 backdrop-blur-md fin-card-floating text-slate-900'
    : 'bg-white/95 border-slate-200/90 backdrop-blur-md fin-card-floating text-slate-800';

  const renderPanelInner = () => (
    <>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${themes[theme].border} flex items-center justify-between shrink-0 bg-transparent`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
          }`}>
            <Briefcase className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h3 className={`text-sm font-semibold tracking-tight ${themes[theme].text} whitespace-nowrap`}>
              选择交易账户
            </h3>
            {accounts.length > 0 && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                isDark ? 'bg-[#1c2333] text-slate-400 border border-white/5' : 'bg-slate-100 text-slate-500 border border-slate-200/60'
              }`}>
                {accounts.length}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showCreate && resolvedMode !== 'all' && (
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors btn-tactile ${
                showAddForm
                  ? isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                  : isDark ? 'hover:bg-[#1e2535] text-slate-300 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
              title={showAddForm ? '取消添加' : '添加新账户'}
              aria-label={showAddForm ? '取消添加' : '添加新账户'}
            >
              <Plus className={`w-4 h-4 transition-transform duration-150 ${showAddForm ? 'rotate-45' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isDark ? 'hover:bg-[#1e2535] text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-800'
            }`}
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-3.5 overflow-y-auto max-h-[58vh] space-y-2 custom-scrollbar">
        {showCreate && resolvedMode !== 'all' && showAddForm && (
          <div className={`p-3 rounded-xl border space-y-2.5 animate-fade-in ${
            isDark
              ? 'bg-[#151b27] border-blue-500/30'
              : 'bg-blue-50/50 border-blue-200/80 shadow-xs'
          }`}>
            <div className="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
              <span>新建交易账户</span>
              <span className="text-[11px] opacity-70">按回车保存</span>
            </div>
            <input
              type="text"
              placeholder="账户名称 (例如: 招商证券主账户)"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateAccount();
              }}
              className={`w-full px-3 py-1.5 text-xs rounded-lg border ${themes[theme].input} ${themes[theme].border} focus:ring-2 focus:ring-blue-500/40 focus:outline-none transition-all`}
              autoFocus
            />
            <input
              type="text"
              placeholder="描述 (可选)"
              value={newAccountDescription}
              onChange={(e) => setNewAccountDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateAccount();
              }}
              className={`w-full px-3 py-1.5 text-xs rounded-lg border ${themes[theme].input} ${themes[theme].border} focus:ring-2 focus:ring-blue-500/40 focus:outline-none transition-all`}
            />
            <div className="flex gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={!newAccountName.trim()}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium btn-tactile disabled:opacity-50 disabled:cursor-not-allowed shadow-xs`}
              >
                确定创建
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewAccountName('');
                  setNewAccountDescription('');
                }}
                className={`px-3 py-1.5 text-xs rounded-lg ${themes[theme].secondary} btn-tactile font-medium`}
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {loading ? (
            <div className={`text-center py-8 ${themes[theme].text} opacity-60 text-xs`}>
              <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2.5" />
              加载账户中...
            </div>
          ) : accounts.length === 0 ? (
            <div className={`text-center py-8 px-4 ${themes[theme].text} opacity-60 text-xs`}>
              暂无账户，请创建一个新账户开始使用
            </div>
          ) : (
            accounts.map((account) => {
              const isSelected = selectedAccountId === (account.alias || account.id);
              const subText =
                account.description ||
                (account.broker
                  ? `${account.broker}${account.account_no ? ` · ${account.account_no}` : ''}`
                  : null);

              return (
                <div
                  key={account.id}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all duration-150 btn-tactile ${
                    isSelected
                      ? isDark
                        ? 'bg-blue-500/15 border border-blue-500/40 shadow-xs'
                        : 'bg-blue-50/80 border border-blue-200/90 shadow-xs ring-1 ring-blue-500/15'
                      : isDark
                        ? 'hover:bg-[#181f2c] border border-transparent hover:border-white/5'
                        : 'hover:bg-slate-50 border border-transparent hover:border-slate-200/70'
                  }`}
                  onClick={() => {
                    onAccountChange(account.alias || account.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    {/* Account Icon Badge */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isDark
                            ? 'bg-[#1b2232] text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-500/10'
                            : 'bg-slate-100 text-slate-500 group-hover:text-blue-600 group-hover:bg-blue-50'
                      }`}
                    >
                      <Briefcase className="w-4 h-4" />
                    </div>

                    {/* Account Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold text-xs sm:text-sm truncate ${
                            isSelected
                              ? isDark
                                ? 'text-white'
                                : 'text-blue-900'
                              : themes[theme].text
                          }`}
                        >
                          {account.name}
                        </span>
                        {account.is_default && (
                          <span
                            className={`whitespace-nowrap shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${
                              isDark
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-400/25'
                                : 'bg-blue-100/80 text-blue-700 border border-blue-200'
                            }`}
                          >
                            默认
                          </span>
                        )}
                      </div>
                      {subText && (
                        <div
                          className={`text-[11px] truncate mt-0.5 ${
                            isSelected
                              ? isDark
                                ? 'text-blue-300/80'
                                : 'text-blue-800/75'
                              : isDark
                                ? 'text-slate-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {subText}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-1.5 shrink-0 pl-1">
                    {resolvedMode !== 'all' && !account.is_default && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefault(account.alias || account.id);
                        }}
                        className={`whitespace-nowrap text-[11px] px-2 py-1 rounded-md font-medium transition-all ${
                          isDark
                            ? 'bg-[#1e2535] hover:bg-blue-500/25 text-slate-300 hover:text-blue-200 border border-[#2b364c]'
                            : 'bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 shadow-2xs'
                        }`}
                      >
                        设为默认
                      </button>
                    )}
                    {isSelected && (
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          isDark
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </div>
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
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium btn-tactile max-w-full min-w-0 transition-all ${triggerClass} ${
          isOpen ? 'ring-2 ring-blue-500/30 border-blue-400/60 shadow-xs' : ''
        }`}
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
                align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
              } w-[340px] sm:w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border ${panelClass} overflow-hidden flex flex-col shadow-2xl popover-spring`}
            >
              {renderPanelInner()}
            </div>
          </>
        )
      )}
    </div>
  );
}
