import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { themes, Theme } from '../../../lib/theme';
import type { Account } from '../../../lib/services/types';

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onAccountChange: (accountId: string | null) => void;
  theme: Theme;
}

export function AccountSelector({
  accounts,
  selectedAccountId,
  onAccountChange,
  theme
}: AccountSelectorProps) {
  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  return (
    <div className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Building2 className={`w-5 h-5 ${themes[theme].textSecondary}`} />
          <span className={`text-sm font-medium ${themes[theme].text}`}>
            账户选择
          </span>
        </div>

        <div className="relative">
          <select
            value={selectedAccountId || 'all'}
            onChange={(e) => onAccountChange(e.target.value === 'all' ? null : e.target.value)}
            className={`appearance-none ${themes[theme].secondary} px-4 py-2 pr-10 rounded-md text-sm font-medium ${themes[theme].text} border ${themes[theme].border} focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer`}
          >
            <option value="all">全部账户</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.isDefault && ' (默认)'}
              </option>
            ))}
          </select>
          <ChevronDown className={`w-4 h-4 ${themes[theme].textSecondary} absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} />
        </div>
      </div>

      {selectedAccount && (
        <div className={`mt-3 pt-3 border-t ${themes[theme].border} text-sm ${themes[theme].textSecondary}`}>
          <div className="flex justify-between">
            <span>券商:</span>
            <span className={themes[theme].text}>{selectedAccount.broker || '-'}</span>
          </div>
          {selectedAccount.accountNo && (
            <div className="flex justify-between mt-1">
              <span>账号:</span>
              <span className={themes[theme].text}>{selectedAccount.accountNo}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
