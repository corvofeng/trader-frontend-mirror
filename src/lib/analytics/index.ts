import ReactGA from 'react-ga4';

const TRACKING_ID = 'G-0KF81E1YMG'; // Replace with your actual GA4 tracking ID

interface AnalyticsService {
  initialize: () => void;
  pageView: (path: string) => void;
  event: (category: string, action: string, label?: string) => void;
}

class MockAnalytics implements AnalyticsService {
  initialize() {
    console.log('[Mock Analytics] Initialized');
  }

  pageView(path: string) {
    console.log(`[Mock Analytics] Page view: ${path}`);
  }

  event(category: string, action: string, label?: string) {
    console.log(`[Mock Analytics] Event: ${category} - ${action}${label ? ` - ${label}` : ''}`);
  }
}

class ProductionAnalytics implements AnalyticsService {
  initialize() {
    ReactGA.initialize(TRACKING_ID);
  }

  pageView(path: string) {
    ReactGA.send({ hitType: "pageview", page: path });
  }

  event(category: string, action: string, label?: string) {
    ReactGA.event({
      category,
      action,
      label
    });
  }
}

const analytics: AnalyticsService = import.meta.env.VITE_ENV === 'production' 
  ? new ProductionAnalytics()
  : new MockAnalytics();

export default analytics;