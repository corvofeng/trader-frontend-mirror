/* eslint-disable no-undef */
// ------------------------------------------------------------------
// YHTrader 自定义 Service Worker 补丁 — 处理 Web Push 通知
// 由 vite-plugin-pwa 的 workbox.importScripts 引入，
// 运行在全局 ServiceWorkerGlobalScope 上下文。
// ------------------------------------------------------------------

const PUSH_PAYLOAD_VERSION = 1;

/**
 * 前端发来的消息（registration.active.postMessage 可以触发），
 * 目前主要用于：在页面内测试一条通知，确保 SW 正常加载。
 */
self.addEventListener('message', (event) => {
  try {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'yh:show-test-notification') {
      const title = data.title || '✅ SW 已激活';
      const body = data.body || 'Service Worker 自定义补丁已成功注入，可以接收 Web Push。';
      self.registration.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `yh-sw-test-${Date.now()}`,
      });
    }
  } catch (err) {
    console.error('[YH-SW] message handler error:', err);
  }
});

/**
 * 后端 pywebpush 发来的 Push Payload（格式见 push_server/app.py TradeNotificationPayload）。
 */
self.addEventListener('push', (event) => {
  try {
    if (!event.data) return;
    let payload;
    try {
      payload = event.data.json();
    } catch (_jsonErr) {
      // 兼容纯文本
      const text = event.data.text?.() || String(event.data);
      payload = { title: 'YHTrader 新消息', body: text, tag: `yh-${Date.now()}`, url: '/' };
    }

    if (!payload || typeof payload !== 'object') return;

    const version = payload.__v ?? PUSH_PAYLOAD_VERSION;
    const account = payload.account_alias || '';
    const operation = payload.operation || '';

    // 买/卖/系统的 emoji 前缀 — 与页面内 toast 保持一致
    let prefix = '📋';
    if (operation === 'buy') prefix = '🔴';
    else if (operation === 'sell') prefix = '🟢';
    else if (operation === 'system') prefix = '✅';

    const baseTitle = String(payload.title || 'YHTrader 成交提醒');
    const title = /^[🔴🟢✅📋]/.test(baseTitle) ? baseTitle : `${prefix} ${baseTitle}`;

    const options = {
      body: String(payload.body || ''),
      icon: payload.icon || '/favicon.svg',
      badge: payload.badge || '/favicon.svg',
      tag: String(payload.tag || `yh-${account}-${Date.now()}`),
      renotify: !!payload.renotify,
      requireInteraction: !!payload.requireInteraction,
      silent: !!payload.silent,
      timestamp: Date.now(),
      data: {
        __v: version,
        url: payload.url || '/',
        account_alias: account,
        operation,
        stock_code: payload.stock_code || '',
        stock_name: payload.stock_name || '',
      },
      // Chrome 等浏览器会优先用 actions 里的按钮打开链接
      actions: payload.url
        ? [
            {
              action: 'open-page',
              title: '查看详情',
            },
          ]
        : undefined,
    };

    console.debug('[YH-SW] push received, showing notification:', {
      title,
      body: options.body,
      tag: options.tag,
    });

    event.waitUntil(
      Promise.resolve()
        .then(() => self.registration.showNotification(title, options))
        .then(() => {
          console.debug('[YH-SW] showNotification succeeded, now broadcasting to clients');
        })
        .catch((err) => {
          console.error('[YH-SW] showNotification FAILED — check browser/system notification permissions:', err);
          throw err;
        })
        .then(() =>
          self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        )
        .then((clients) => {
          for (const c of clients) {
            try {
              c.postMessage({
                type: 'yh:incoming-push',
                payload,
              });
            } catch (_) { /* ignore */ }
          }
        })
        .catch((err) => {
          console.error('[YH-SW] clients.matchAll / postMessage error:', err);
        })
    );
  } catch (err) {
    console.error('[YH-SW] push handler error:', err);
  }
});

/**
 * 用户点击通知本身：打开 url 或默认跳到 journal/portfolio。
 */
self.addEventListener('notificationclick', (event) => {
  try {
    event.notification.close();
    const data = event.notification.data || {};
    const url = data.url || '/';

    if (event.action === 'open-page' || !event.action) {
      event.waitUntil(
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            // 如果已有对应 tab 在前台，直接 focus
            for (const client of clientList) {
              if ('focus' in client) {
                try {
                  const same = new URL(client.url, self.location.origin).pathname === new URL(url, self.location.origin).pathname;
                  if (same || client.url === url) {
                    return client.focus().then((c) => {
                      try { c.navigate(url); } catch (_) { /* noop */ }
                      return c;
                    });
                  }
                } catch (_) { /* ignore */ }
              }
            }
            if (self.clients.openWindow) {
              return self.clients.openWindow(url);
            }
            return undefined;
          })
      );
    }
  } catch (err) {
    console.error('[YH-SW] notificationclick error:', err);
  }
});
