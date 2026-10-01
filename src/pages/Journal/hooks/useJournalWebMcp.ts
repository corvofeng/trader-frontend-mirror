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
    isAuthenticated,
    allowedTabs,
    onSelectAccount,
    onSwitchTab,
    getAccounts,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [tools, setTools] = useState<import('../../../lib/webmcp/landingWebMcp').WebMcpToolDescriptor[]>([]);

  // Keep latest context in ref so tool callbacks always invoke up-to-date props
  const contextRef = useRef<WebMcpToolContext>({
    userId,
    selectedAccountId,
    activeTab,
    isAuthenticated,
    allowedTabs,
    onSelectAccount,
    onSwitchTab,
    getAccounts,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      selectedAccountId,
      activeTab,
      isAuthenticated,
      allowedTabs,
      onSelectAccount,
      onSwitchTab,
      getAccounts,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const hasModelContext =
      (typeof document !== 'undefined' && 'modelContext' in document) ||
      'modelContext' in window ||
      (typeof navigator !== 'undefined' && 'modelContext' in navigator);
    setIsSupported(Boolean(hasModelContext));

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
      get isAuthenticated() {
        return contextRef.current.isAuthenticated;
      },
      get allowedTabs() {
        return contextRef.current.allowedTabs;
      },
      onSelectAccount: (accountId) => contextRef.current.onSelectAccount(accountId),
      onSwitchTab: (tab) => contextRef.current.onSwitchTab(tab),
      getAccounts: () => contextRef.current.getAccounts(),
    };

    const registration = registerJournalWebMcpTools(proxyContext, controller.signal);
    setTools(registration.tools);

    void registration.registrationPromise.then((count) => {
      if (!controller.signal.aborted) {
        setRegisteredToolCount(count);
        setIsReady(count > 0);
      }
    });

    return () => {
      controller.abort();
    };
  }, [enabled]);

  return {
    isSupported,
    registeredToolCount,
    isReady,
    tools,
  };
}
