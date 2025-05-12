import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Landing } from './pages/Landing';
import { Journal } from './pages/Journal';
import { Options } from './pages/Options';
import { authService } from './lib/services';
import { CurrencyProvider } from './lib/context/CurrencyContext';
import analytics from './lib/analytics';
import type { User, Stock } from './lib/services/types';
import type { Theme } from './lib/theme';

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

    authService.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    setShowThemeDropdown(false);
    setMobileMenuOpen(false);
    analytics.event('Theme', 'change', newTheme);
  };

  const handleSignIn = async () => {
    const { data: { user } } = await authService.signIn();
    setUser(user);
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
      </Routes>
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