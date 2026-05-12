import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { authService, accountService, portfolioService, stockConfigService } from './lib/services';
import { CurrencyProvider } from './lib/context/CurrencyContext';
import analytics from './lib/analytics';
import type { User, Stock } from './lib/services/types';
import type { Theme } from './lib/theme';

// Lazy load pages
const Landing = React.lazy(() => import('./pages/Landing').then(module => ({ default: module.Landing })));
const Journal = React.lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })));
const Options = React.lazy(() => import('./pages/Options').then(module => ({ default: module.Options })));
const Admin = React.lazy(() => import('./pages/Admin').then(module => ({ default: module.Admin })));

const Loading = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
  </div>
);

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    analytics.pageView(location.pathname + location.search);
  }, [location]);

  return null;
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);

  useEffect(() => {
    // Initialize analytics
    analytics.initialize();

    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme && ['light', 'dark', 'blue'].includes(savedTheme)) {
      setTheme(savedTheme);
    }

    authService.getUser().then((resp) => {
      setUser(resp.data?.user ?? null);
    });
  }, []);

  useEffect(() => {
    const schedule = (fn: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(fn, { timeout: 1200 });
        return;
      }
      setTimeout(fn, 0);
    };

    const getAccountKey = () => {
      try {
        return (
          localStorage.getItem('journalSelectedAccountAlias') ||
          localStorage.getItem('journalAccountId') ||
          localStorage.getItem('selectedAccountAlias') ||
          localStorage.getItem('selectedAccountId') ||
          ''
        );
      } catch {
        return '';
      }
    };

    const shouldSkipByTtl = (key: string, ttlMs: number) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { ts?: number };
        const ts = typeof parsed?.ts === 'number' ? parsed.ts : 0;
        return ts > 0 && Date.now() - ts < ttlMs;
      } catch {
        return false;
      }
    };

    const prefetchJournalCritical = async () => {
      try {
        if (sessionStorage.getItem('prefetch:journal:critical') === '1') return;
        sessionStorage.setItem('prefetch:journal:critical', '1');
      } catch {}

      let accountAlias = getAccountKey();
      if (!accountAlias) {
        try {
          const resp = await accountService.getAccounts('mock-user-id');
          const list = resp?.data || [];
          const defaultAccount = list.find(acc => acc.is_default) || list[0];
          const key = defaultAccount ? (defaultAccount.alias || defaultAccount.id) : '';
          if (key) {
            accountAlias = key;
            try {
              localStorage.setItem('journalSelectedAccountAlias', key);
              localStorage.setItem('journalAccountId', key);
              localStorage.setItem('selectedAccountAlias', key);
              localStorage.setItem('selectedAccountId', key);
            } catch {}
          }
        } catch {}
      }

      schedule(async () => {
        const stockCfg = await stockConfigService.getStockConfigs();
        if (stockCfg?.data) {
          try {
            localStorage.setItem('journal:stockConfigs', JSON.stringify({ ts: Date.now(), data: stockCfg.data }));
          } catch {}
        }

        if (!accountAlias) return;

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const holdingsCacheKey = `journal:holdings:${accountAlias}`;
        const recentTradesCacheKey = `journal:recentTrades:${accountAlias}:${startDate}:${endDate}`;

        if (!shouldSkipByTtl(holdingsCacheKey, 15_000)) {
          const holdingsResp = await portfolioService.getHoldings('mock-user-id', accountAlias);
          if (holdingsResp?.data) {
            try {
              localStorage.setItem(holdingsCacheKey, JSON.stringify({ ts: Date.now(), data: holdingsResp.data }));
            } catch {}
          }
        }

        if (!shouldSkipByTtl(recentTradesCacheKey, 15_000)) {
          const tradesResp = await portfolioService.getRecentTrades('mock-user-id', startDate, endDate, accountAlias);
          if (tradesResp?.data) {
            try {
              localStorage.setItem(recentTradesCacheKey, JSON.stringify({ ts: Date.now(), data: tradesResp.data }));
            } catch {}
          }
        }
      });
    };

    prefetchJournalCritical();
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    setShowThemeDropdown(false);
    setMobileMenuOpen(false);
    analytics.event('Theme', 'change', newTheme);
  };

  const handleSignIn = async () => {
    const resp = await authService.signIn();
    setUser(resp.data?.user ?? null);
    setMobileMenuOpen(false);
    analytics.event('User', 'sign_in');
  };

  const handleSignOut = async () => {
    await authService.signOut();
    setUser(null);
    setMobileMenuOpen(false);
    analytics.event('User', 'sign_out');
  };

  const handleStockSelect = (stock: Stock) => {
    setSelectedStock(stock);
    analytics.event('Stock', 'select', stock.stock_code);
  };

  return (
    <MainLayout
      user={user}
      theme={theme}
      mobileMenuOpen={mobileMenuOpen}
      showThemeDropdown={showThemeDropdown}
      onThemeChange={handleThemeChange}
      onSignIn={handleSignIn}
      onSignOut={handleSignOut}
      onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      onThemeDropdownToggle={() => setShowThemeDropdown(!showThemeDropdown)}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route 
            path="/" 
            element={<Landing theme={theme} onThemeChange={handleThemeChange} />} 
          />
          <Route
            path="/journal"
            element={
              <Journal
                selectedStock={selectedStock}
                theme={theme}
                onStockSelect={handleStockSelect}
              />
            }
          />
          <Route
            path="/options"
            element={<Options theme={theme} />}
          />
          <Route
            path="/admin"
            element={<Admin theme={theme} />}
          />
        </Routes>
      </Suspense>
    </MainLayout>
  );
}

function App() {
  return (
    <Router>
      <RouteTracker />
      <CurrencyProvider>
        <AppContent />
      </CurrencyProvider>
    </Router>
  );
}

export default App;
