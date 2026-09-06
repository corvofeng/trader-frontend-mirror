import { useEffect, useRef, useState } from 'react';
import { registerLandingWebMcpTools, type LandingWebMcpContext } from '../../../lib/webmcp/landingWebMcp';

export interface UseLandingWebMcpOptions extends LandingWebMcpContext {
  enabled?: boolean;
}

export function useLandingWebMcp(options: UseLandingWebMcpOptions) {
  const {
    userId,
    currentTheme,
    currentLang,
    onNavigate,
    onThemeChange,
    onLanguageChange,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);

  const contextRef = useRef<LandingWebMcpContext>({
    userId,
    currentTheme,
    currentLang,
    onNavigate,
    onThemeChange,
    onLanguageChange,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      currentTheme,
      currentLang,
      onNavigate,
      onThemeChange,
      onLanguageChange,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const hasModelContext = 'modelContext' in document;
    setIsSupported(hasModelContext);

    const controller = new AbortController();

    const proxyContext: LandingWebMcpContext = {
      get userId() {
        return contextRef.current.userId;
      },
      get currentTheme() {
        return contextRef.current.currentTheme;
      },
      get currentLang() {
        return contextRef.current.currentLang;
      },
      onNavigate: (path) => contextRef.current.onNavigate(path),
      onThemeChange: (theme) => contextRef.current.onThemeChange(theme),
      onLanguageChange: (lang) => contextRef.current.onLanguageChange(lang),
    };

    const { toolNames } = registerLandingWebMcpTools(proxyContext, controller.signal);
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
