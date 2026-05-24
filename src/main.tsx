import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

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
