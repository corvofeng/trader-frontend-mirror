import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, Briefcase } from 'lucide-react';
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
  showCreate = true
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountDescription, setNewAccountDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedMode: 'all' | 'options' | 'stocks' = mode ?? (preferOptions ? 'options' : 'stocks');
  const cacheKey = `${resolvedMode}:${userId}`;

  const loadAccounts = useCallback(async (forceRefresh: boolean = false) => {
    setLoading(true);
    const cached = accountsCache.get(cacheKey);
    if (!forceRefresh && cached && cached.length > 0) {
      setAccounts(cached);
      // Auto-select default if none provided or invalid
      const isAccountValid = selectedAccountId && cached.some(a => (a.alias || a.id) === selectedAccountId);
      
      if (!selectedAccountId || !isAccountValid) {
        const def = cached.find(acc => acc.is_default) || cached[0];
        if (def) {
          const key = def.alias || def.id;
          if (key !== selectedAccountId) {
            onAccountChange(key);
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
      const isAccountValid = selectedAccountId && loadedAccounts.some(a => (a.alias || a.id) === selectedAccountId);

      if ((!selectedAccountId || !isAccountValid) && loadedAccounts.length > 0) {
        const defaultAccount = loadedAccounts.find(acc => acc.is_default) || loadedAccounts[0];
        const key = defaultAccount.alias || defaultAccount.id;
        if (key !== selectedAccountId) {
          onAccountChange(key);
        }
      }
    }
    setLoading(false);
  }, [userId, resolvedMode, cacheKey, selectedAccountId, onAccountChange]);

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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors duration-200 max-w-full min-w-0 ${themes[theme].primary} ${themes[theme].text}`}
      >
        <Briefcase className="w-4 h-4" />
        <span className="font-medium truncate max-w-[12rem] sm:max-w-[16rem]">
          {selectedAccount ? selectedAccount.name : '选择账户'}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute top-full mt-2 right-0 w-80 rounded-lg shadow-lg border ${themes[theme].card} ${themes[theme].border} z-20 overflow-hidden`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>账户管理</h3>
                {showCreate && resolvedMode !== 'all' && (
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className={`p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200`}
                    title="添加新账户"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>

              {showCreate && resolvedMode !== 'all' && showAddForm && (
                <div className="mb-4 space-y-3 animate-fadeIn">
                  <input
                    type="text"
                    placeholder="账户名称"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${themes[theme].input} ${themes[theme].text} ${themes[theme].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                  />
                  <input
                    type="text"
                    placeholder="描述 (可选)"
                    value={newAccountDescription}
                    onChange={(e) => setNewAccountDescription(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${themes[theme].input} ${themes[theme].text} ${themes[theme].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateAccount}
                      className={`flex-1 px-3 py-2 rounded-md ${themes[theme].primary} text-white hover:opacity-90 transition-opacity duration-200`}
                    >
                      创建
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewAccountName('');
                        setNewAccountDescription('');
                      }}
                      className={`flex-1 px-3 py-2 rounded-md ${themes[theme].secondary} hover:opacity-90 transition-opacity duration-200`}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {loading ? (
                  <div className={`text-center py-4 ${themes[theme].text} opacity-60`}>
                    <div className="animate-pulse flex justify-center">
                      <div className="h-5 w-5 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"></div>
                    </div>
                    <div className="mt-2">加载账户中...</div>
                  </div>
                ) : accounts.length === 0 ? (
                  <div className={`text-center py-4 ${themes[theme].text} opacity-60`}>
                    暂无账户，请创建一个新账户开始使用
                  </div>
                ) : (
                  accounts.map(account => (
                    <div
                      key={account.id}
                      className={`flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        selectedAccountId === (account.alias || account.id) ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                      }`}
                      onClick={() => {
                        onAccountChange(account.alias || account.id);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${themes[theme].text}`}>
                            {account.name}
                          </span>
                          {account.is_default && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              默认
                            </span>
                          )}
                        </div>
                        {account.description && (
                          <div className={`text-sm ${themes[theme].text} opacity-60 truncate max-w-[200px]`}>
                            {account.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {resolvedMode !== 'all' && !account.is_default && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetDefault(account.alias || account.id);
                            }}
                            className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 hover:bg-blue-100 dark:hover:bg-blue-900 ${themes[theme].secondary}`}
                          >
                            设为默认
                          </button>
                        )}
                        {selectedAccountId === (account.alias || account.id) && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
