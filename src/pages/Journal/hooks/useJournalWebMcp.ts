import { useEffect, useRef, useState } from 'react';
import { registerJournalWebMcpTools, type WebMcpToolContext } from '../../../lib/webmcp/journalWebMcp';

export interface UseJournalWebMcpOptions extends WebMcpToolContext {
  enabled?: boolean;
}

export function useJournalWebMcp(options: UseJournalWebMcpOptions) {
  const {
    userId,
    selectedAccountId,
    activeTab,
    onSelectAccount,
    onSwitchTab,
    getAccounts,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);

  // Keep latest context in ref so tool callbacks always invoke up-to-date props
  const contextRef = useRef<WebMcpToolContext>({
    userId,
    selectedAccountId,
    activeTab,
    onSelectAccount,
    onSwitchTab,
    getAccounts,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      selectedAccountId,
      activeTab,
      onSelectAccount,
      onSwitchTab,
      getAccounts,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const hasModelContext = 'modelContext' in document;
    setIsSupported(hasModelContext);

    const controller = new AbortController();

    const proxyContext: WebMcpToolContext = {
      get userId() {
        return contextRef.current.userId;
      },
      get selectedAccountId() {
        return contextRef.current.selectedAccountId;
      },
      get activeTab() {
        return contextRef.current.activeTab;
      },
      onSelectAccount: (accountId) => contextRef.current.onSelectAccount(accountId),
      onSwitchTab: (tab) => contextRef.current.onSwitchTab(tab),
      getAccounts: () => contextRef.current.getAccounts(),
    };

    const { toolNames } = registerJournalWebMcpTools(proxyContext, controller.signal);
    setRegisteredToolCount(toolNames.length);

    return () => {
      controller.abort();
    };
  }, [enabled]);

  return {
    isSupported,
    registeredToolCount,
  };
}
