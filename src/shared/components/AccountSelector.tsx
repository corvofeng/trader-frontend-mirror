import React, { useState, useEffect } from 'react';
import { Plus, Check, Settings } from 'lucide-react';
import { accountService } from '../../lib/services';
import type { Account } from '../../shared/types/api';
import { Theme, themes } from '../../lib/theme';

interface AccountSelectorProps {
  userId: string;
  theme: Theme;
  selectedAccountId: string | null;
  onAccountChange: (accountId: string) => void;
}

export function AccountSelector({ userId, theme, selectedAccountId, onAccountChange }: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountDescription, setNewAccountDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [userId]);

  const loadAccounts = async () => {
    setLoading(true);
    const response = await accountService.getAccounts(userId);
    if (response.data) {
      setAccounts(response.data);
      if (!selectedAccountId && response.data.length > 0) {
        const defaultAccount = response.data.find(acc => acc.is_default) || response.data[0];
        onAccountChange(defaultAccount.id);
      }
    }
    setLoading(false);
  };

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
      onAccountChange(response.data.id);
      setNewAccountName('');
      setNewAccountDescription('');
      setShowAddForm(false);
    }
  };

  const handleSetDefault = async (accountId: string) => {
    await accountService.setDefaultAccount(userId, accountId);
    await loadAccounts();
  };

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-md ${themes[theme].secondary} ${themes[theme].text}`}
      >
        <Settings className="w-4 h-4" />
        <span className="font-medium">
          {selectedAccount ? selectedAccount.name : 'Select Account'}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute top-full mt-2 right-0 w-80 rounded-lg shadow-lg border ${themes[theme].card} ${themes[theme].border} z-20`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>Accounts</h3>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700`}
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {showAddForm && (
                <div className="mb-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Account Name"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newAccountDescription}
                    onChange={(e) => setNewAccountDescription(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateAccount}
                      className={`flex-1 px-3 py-2 rounded-md ${themes[theme].primary} text-white`}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewAccountName('');
                        setNewAccountDescription('');
                      }}
                      className={`flex-1 px-3 py-2 rounded-md ${themes[theme].secondary}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {loading ? (
                  <div className={`text-center py-4 ${themes[theme].text} opacity-60`}>
                    Loading accounts...
                  </div>
                ) : accounts.length === 0 ? (
                  <div className={`text-center py-4 ${themes[theme].text} opacity-60`}>
                    No accounts found. Create one to get started.
                  </div>
                ) : (
                  accounts.map(account => (
                    <div
                      key={account.id}
                      className={`flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        selectedAccountId === account.id ? 'bg-gray-100 dark:bg-gray-700' : ''
                      }`}
                      onClick={() => {
                        onAccountChange(account.id);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${themes[theme].text}`}>
                            {account.name}
                          </span>
                          {account.is_default && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Default
                            </span>
                          )}
                        </div>
                        {account.description && (
                          <div className={`text-sm ${themes[theme].text} opacity-60`}>
                            {account.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!account.is_default && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetDefault(account.id);
                            }}
                            className={`text-xs px-2 py-1 rounded ${themes[theme].secondary}`}
                          >
                            Set Default
                          </button>
                        )}
                        {selectedAccountId === account.id && (
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
