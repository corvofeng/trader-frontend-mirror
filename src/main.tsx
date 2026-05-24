import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

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
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      void registration.unregister();
    });
  });
  if ('caches' in window) {
    void caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));
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
