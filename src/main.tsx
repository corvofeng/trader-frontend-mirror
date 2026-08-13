import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const apiBase = import.meta.env.VITE_API_BASE_URL;
const staticDbBase = import.meta.env.VITE_STATIC_DB_BASE_URL;
const isCloudflare = import.meta.env.VITE_ENV === 'cloudflare';

if (staticDbBase && !isCloudflare) {
  const originalFetch = window.fetch;
  let dbPromise: Promise<any> | null = null;

  const getMockDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      try {
        const latestRes = await originalFetch(`${staticDbBase}/latest.json`);
        if (!latestRes.ok) throw new Error(`latest.json not found: ${latestRes.status}`);
        const { date } = await latestRes.json();
        const dbRes = await originalFetch(`${staticDbBase}/${date}.json`);
        if (!dbRes.ok) throw new Error(`${date}.json not found: ${dbRes.status}`);
        return await dbRes.json();
      } catch (e) {
        console.error("Failed to load static database from R2", e);
        return {};
      }
    })();
    return dbPromise;
  };

  window.fetch = async function (input, init) {
    let urlStr = '';
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else if (input && typeof input === 'object' && 'url' in input) {
      urlStr = (input as Request).url;
    }

    const urlObj = new URL(urlStr, window.location.origin);
    const path = urlObj.pathname;
    const params = urlObj.searchParams;

    if (path.startsWith('/api/') || path === '/api') {
      // 1. Handle special non-db check paths
      if (path === "/api/check" || path === "/api/check/") {
        return new Response(JSON.stringify({ status: false }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path === "/api/settings/currency" || path === "/api/settings/currency/") {
        return new Response(JSON.stringify({ currency: "CNY" }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // 2. Load the database
      const db = await getMockDb();
      let responseBody: any = null;

      // 3. Route matching and data extraction
      if (path === "/api/accounts" || path === "/api/accounts/" || path.endsWith("/accounts") || path.endsWith("/accounts/")) {
        responseBody = db.accounts || [];
      } else if (path === "/api/stock-configs" || path === "/api/stock-configs/") {
        responseBody = (db.holdings || []).map((h: any) => ({
          stock_code: h.stock_code,
          category: "Stock",
          tags: []
        }));
      } else if (path.endsWith("/kline")) {
        let candles = db.kline || [];
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate) candles = candles.filter((c: any) => c.date >= startDate);
        if (endDate) candles = candles.filter((c: any) => c.date <= endDate);
        responseBody = { candles, metrics: db.metrics || null };
      } else if (path.endsWith("/trend")) {
        let trend = db.trend || [];
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate) trend = trend.filter((t: any) => t.date >= startDate);
        if (endDate) trend = trend.filter((t: any) => t.date <= endDate);
        responseBody = trend;
      } else if (path.endsWith("/recent-trades") || path.endsWith("/trades")) {
        let trades = db.trades || [];
        const startDate = params.get("startDate");
        const endDate = params.get("endDate");
        if (startDate) trades = trades.filter((t: any) => t.date >= startDate);
        if (endDate) trades = trades.filter((t: any) => t.date <= endDate);
        responseBody = trades;
      } else if (path.endsWith("/metrics")) {
        responseBody = { metrics: db.metrics || null };
      } else if (path.includes("/stocks/orders/")) {
        responseBody = db.today_orders || [];
      } else if (path.endsWith("/operations")) {
        responseBody = db.operations || [];
      } else if (path === "/api/llm/prompts") {
        responseBody = { prompts: db.prompts || [] };
      } else if (path.includes("/api/analysis/portfolio/")) {
        responseBody = db.portfolio_analysis || null;
      } else if (path.startsWith("/api/portfolio/") && path.split("/").length === 4) {
        responseBody = db.holdings || [];
      }

      if (responseBody !== null) {
        return new Response(JSON.stringify(responseBody), {
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: `Route ${path} not supported in static mode` }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return originalFetch(input, init);
  };
} else if (apiBase) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    let targetInput = input;
    if (typeof input === 'string' && (input.startsWith('/api') || input.startsWith('/login') || input.startsWith('/logout'))) {
      targetInput = `${apiBase}${input}`;
    } else if (input instanceof URL && (input.pathname.startsWith('/api') || input.pathname.startsWith('/login') || input.pathname.startsWith('/logout'))) {
      targetInput = new URL(`${apiBase}${input.pathname}${input.search}`);
    }
    return originalFetch(targetInput, init);
  };
}

const isProduction = import.meta.env.PROD || import.meta.env.VITE_ENV === 'production';

if (isProduction) {
  const updateSW = registerSW({ immediate: true });
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    w.__pwaUpdateSW = (reload?: boolean) => updateSW(reload ?? true);
    w.__pwaCheckSW = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    };
    w.__pwaUnregisterSW = async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    };
  }
} else if ('serviceWorker' in navigator) {
  // Vite dev（:5173）+ vite-plugin-pwa devOptions.enabled=true 时，SW 会注册在 /sw.js（或带 vite 前缀的 /dev-sw.js?dev-sw）
  // 我们不应该把「vite-plugin-pwa 生成的 dev SW」也 unregister，否则 PWA Push 永远用不了
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      const activeUrl = (reg as ServiceWorkerRegistration & { active?: { scriptURL?: string } }).active?.scriptURL;
      const installingUrl = (reg as ServiceWorkerRegistration & { installing?: { scriptURL?: string } }).installing?.scriptURL;
      const waitingUrl = (reg as ServiceWorkerRegistration & { waiting?: { scriptURL?: string } }).waiting?.scriptURL;
      const scriptUrl = activeUrl ?? installingUrl ?? waitingUrl ?? '';
      const isVitePWADev = /\/(dev-sw\.js|sw\.js)/.test(scriptUrl) || scriptUrl.includes('vite');
      if (!isVitePWADev) void reg.unregister();
    });
  });
  if ('caches' in window) {
    void caches.keys().then(names => Promise.all(
      names
        // 不要误删 vite-plugin-pwa workbox / 预缓存；只删可能遗留的旧 API cache
        .filter((name) => /^workbox-precache-/i.test(name) === false || /api/i.test(name))
        .map((name) => caches.delete(name))
    ));
  }
}

const purgeApiFromCaches = async () => {
  if (!('caches' in window)) return;
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(async name => {
        try {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          await Promise.all(
            requests.map(req => {
              try {
                const url = new URL(req.url);
                if (url.pathname.startsWith('/api')) return cache.delete(req);
              } catch {
                void 0;
              }
              return Promise.resolve(false);
            })
          );
        } catch {
          void 0;
        }
      })
    );
  } catch {
    void 0;
  }
};

void purgeApiFromCaches();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
