import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Language = 'zh' | 'en';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  isEn: boolean;
  t: <T>(zh: T, en: T) => T;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const APP_LANG_STORAGE_KEY = 'app_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(APP_LANG_STORAGE_KEY);
      return saved === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(APP_LANG_STORAGE_KEY, newLang);
      window.dispatchEvent(new CustomEvent('app_lang_change', { detail: newLang }));
    } catch {}
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === APP_LANG_STORAGE_KEY && e.newValue) {
        setLangState(e.newValue === 'en' ? 'en' : 'zh');
      }
    };
    const handleCustomChange = (e: Event) => {
      const detail = (e as CustomEvent<Language>).detail;
      if (detail === 'zh' || detail === 'en') {
        setLangState(detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('app_lang_change', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('app_lang_change', handleCustomChange);
    };
  }, []);

  const t = useCallback(<T,>(zh: T, en: T): T => {
    return lang === 'en' ? en : zh;
  }, [lang]);

  const value = {
    lang,
    setLang,
    isEn: lang === 'en',
    t,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
