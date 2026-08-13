import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../../../shared/utils/logger';
import { format } from 'date-fns';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';
export type NotificationMode = 'pwa_push';

export interface RssTradeItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  stockCode?: string;
  stockName?: string;
  operation?: 'buy' | 'sell';
  price?: number;
  quantity?: number;
  amount?: number;
}

interface UseTradeNotificationsOptions {
  accountAlias: string | null | undefined;
  pushServerBaseUrl?: string;
}

const STORAGE_KEY_LAST_GUIDS = 'trade_notifications:last_guids';
const STORAGE_KEY_ENABLED = 'trade_notifications:enabled';
const STORAGE_KEY_CLIENT_ID = 'trade_notifications:client_id';
const SW_PUSH_CAPABLE_CACHE_KEY = 'trade_notifications:sw_push_capable';

type PushCapable = 'unknown' | 'yes' | 'no';
type PushCapableReason =
  | undefined
  | 'no-service-worker-api'
  | 'no-push-manager-api'
  | 'insecure-context'
  | 'sw-ready-timeout'         // SW 没有注册/激活（最常见：开发模式没 build；或 main.tsx registerSW 还没完成）
  | 'no-pushmanager-on-sw';    // SW 存在但浏览器实例没有 pushManager.subscribe

interface PushServerConfig {
  vapid_public_key: string;
  poll_interval_seconds: number;
  upstream_base_url: string;
  admin_auth_required: boolean;
}

interface SwIncomingPushMessage {
  type: 'yh:incoming-push';
  payload?: Partial<{
    title: string;
    body: string;
    operation: 'buy' | 'sell' | 'system' | '';
    tag: string;
    url: string;
  }>;
}

function getRssUrl(accountAlias: string): string {
  return `/api/portfolio/${encodeURIComponent(accountAlias)}/recent-trades.rss`;
}

function getStorageKey(accountAlias: string, suffix: string): string {
  return `${suffix}:${accountAlias}`;
}

function ensureClientId(accountAlias: string): string {
  const key = getStorageKey(accountAlias, STORAGE_KEY_CLIENT_ID);
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
  } catch { /* noop */ }
  const v = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try { localStorage.setItem(key, v); } catch { /* noop */ }
  return v;
}

function _b64urlToUint8(b64url: string): Uint8Array {
  const padded = b64url + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseRssXml(xmlText: string): RssTradeItem[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const items = doc.querySelectorAll('item');
    const result: RssTradeItem[] = [];

    items.forEach((item) => {
      const guid = item.querySelector('guid')?.textContent?.trim() ?? '';
      const title = item.querySelector('title')?.textContent?.trim() ?? '';
      const link = item.querySelector('link')?.textContent?.trim() ?? '';
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';
      const description = item.querySelector('description')?.textContent?.trim() ?? '';

      let stockCode: string | undefined;
      let stockName: string | undefined;
      let operation: 'buy' | 'sell' | undefined;
      let price: number | undefined;
      let quantity: number | undefined;
      let amount: number | undefined;

      const codeMatch = title.match(/([A-Z]?\d{6}|\d{5,6})/);
      if (codeMatch) stockCode = codeMatch[1];

      if (title.includes('买入') || title.toLowerCase().includes('buy')) {
        operation = 'buy';
      } else if (title.includes('卖出') || title.toLowerCase().includes('sell')) {
        operation = 'sell';
      }

      const priceMatch = description.match(/价格[::]\s*([\d.]+)/) || description.match(/price[::]\s*([\d.]+)/i);
      if (priceMatch) price = Number(priceMatch[1]);

      const qtyMatch = description.match(/(数量|股数|quantity)[::]\s*([\d,]+)/i);
      if (qtyMatch) quantity = Number(qtyMatch[2].replace(/,/g, ''));

      const amountMatch = description.match(/(金额|成交额|amount)[::]\s*([\d,.]+)/i);
      if (amountMatch) amount = Number(amountMatch[2].replace(/,/g, ''));

      const nameMatch = description.match(/(股票名称|名称|name)[::]\s*([^\n<]+)/i);
      if (nameMatch) stockName = nameMatch[2].trim();

      if (!stockName) {
        const parts = title.split(/[—\-|]/);
        if (parts.length >= 2) stockName = parts[1].trim();
      }

      result.push({
        guid: guid || `${title}-${pubDate}`,
        title,
        link,
        pubDate,
        description,
        stockCode,
        stockName,
        operation,
        price,
        quantity,
        amount,
      });
    });

    return result;
  } catch (err) {
    logger.error('[TradeNotifications] Failed to parse RSS XML', err);
    return [];
  }
}

function formatNotificationBody(item: RssTradeItem): string {
  const parts: string[] = [];
  if (item.stockCode) parts.push(item.stockCode);
  if (item.stockName) parts.push(item.stockName);
  const symbol = parts.length > 0 ? parts.join(' · ') : item.title;

  const action = item.operation === 'buy' ? '买入' : item.operation === 'sell' ? '卖出' : '成交';
  const details: string[] = [action];

  if (typeof item.price === 'number') details.push(`价 ${item.price.toFixed(2)}`);
  if (typeof item.quantity === 'number') details.push(`量 ${item.quantity}`);
  if (typeof item.amount === 'number') details.push(`额 ${item.amount.toFixed(0)}`);

  try {
    if (item.pubDate) {
      const d = new Date(item.pubDate);
      if (!Number.isNaN(d.getTime())) {
        details.push(format(d, 'HH:mm:ss'));
      }
    }
  } catch {
    /* noop */
  }

  return `${symbol}\n${details.join('  ')}`;
}

function explainPushCapableReason(reason: PushCapableReason, _isSecureContext: boolean, isProdBuild: boolean): string {
  switch (reason) {
    case 'no-service-worker-api':
      return '浏览器不支持 Service Worker（隐私模式 / 过旧浏览器 / iframe 沙箱）。';
    case 'no-push-manager-api':
      return '浏览器不支持 Web Push（PushManager 不存在，iOS Safari <16.4 / 某些定制浏览器）。';
    case 'insecure-context':
      return '需要 HTTPS（或 localhost）才能使用 Web Push；当前协议不安全。';
    case 'sw-ready-timeout':
      if (!isProdBuild) {
        return 'Service Worker 仍未激活（vite dev 模式）。请确认：① vite.config.ts 里 VitePWA({ devOptions: { enabled: true } }) 已开启；② 重启 vite dev server；③ 打开 DevTools → Application → Service Workers 查看是否 404。还不行请 npm run build && npm run preview（:4173）。';
      }
      return 'Service Worker 还未注册/激活成功。请稍后重试（页面刚加载 SW 首次安装可能延迟），或刷新页面。';
    case 'no-pushmanager-on-sw':
      return 'Service Worker 已激活，但当前浏览器 profile 没有可用的 PushManager（用户设备/企业策略禁用了推送）。';
    default:
      return '当前环境无法使用 Web Push';
  }
}

async function ensureServiceWorkerRegistered(swPath = '/sw.js'): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined') return undefined;
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller as unknown as ServiceWorkerRegistration;
    const reg = await navigator.serviceWorker.register(swPath, { scope: '/' });
    if (reg.installing || reg.waiting) {
      // 等最多 6 秒让 SW 激活
      const ready = await Promise.race([
        new Promise<ServiceWorkerRegistration>((resolve) => {
          const check = () => {
            const active = reg.active;
            if (active && navigator.serviceWorker.controller) resolve(reg);
            else setTimeout(check, 200);
          };
          check();
        }),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 6000)),
      ]);
      return ready ?? reg;
    }
    return reg;
  } catch {
    // /sw.js 404 是 dev 模式正常现象，不 throw
    return undefined;
  }
}

type ProbeResult = { ok: PushCapable; reason: PushCapableReason };

async function isServiceWorkerPushCapable(timeoutMs = 5000, _skipCache = false): Promise<ProbeResult> {
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  if (insecure) return { ok: 'no', reason: 'insecure-context' };
  if (typeof window === 'undefined') return { ok: 'no', reason: 'no-service-worker-api' };
  if (!('serviceWorker' in navigator)) return { ok: 'no', reason: 'no-service-worker-api' };
  if (!('PushManager' in window)) return { ok: 'no', reason: 'no-push-manager-api' };
  if (!_skipCache) {
    try {
      const cached = sessionStorage.getItem(SW_PUSH_CAPABLE_CACHE_KEY);
      if (cached === 'yes') return { ok: 'yes', reason: undefined };
      // cached='no' 不直接返回：可能是「上一次 SW 还没 ready 超时」，这一次可能已经激活了
    } catch { /* noop */ }
  }
  try {
    // 先确保至少尝试过注册 SW（解决用户点订阅时 registerSW 还没 run 完的竞争）
    await ensureServiceWorkerRegistered();
    const readyPromise = navigator.serviceWorker.ready;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    const reg = await Promise.race([readyPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    if (!reg) {
      try { sessionStorage.removeItem(SW_PUSH_CAPABLE_CACHE_KEY); } catch { /* noop */ }
      return { ok: 'no', reason: 'sw-ready-timeout' };
    }
    const pushMgr: PushManager | undefined = (
      reg as ServiceWorkerRegistration & { pushManager?: PushManager }
    ).pushManager;
    const capable = !!(pushMgr && typeof pushMgr.subscribe === 'function');
    const r: ProbeResult = capable
      ? { ok: 'yes', reason: undefined }
      : { ok: 'no', reason: 'no-pushmanager-on-sw' };
    try {
      if (capable) sessionStorage.setItem(SW_PUSH_CAPABLE_CACHE_KEY, 'yes');
      else sessionStorage.removeItem(SW_PUSH_CAPABLE_CACHE_KEY);
    } catch { /* noop */ }
    return r;
  } catch (e) {
    logger.warn('[TradeNotifications] isServiceWorkerPushCapable error', e);
    try { sessionStorage.removeItem(SW_PUSH_CAPABLE_CACHE_KEY); } catch { /* noop */ }
    return { ok: 'no', reason: 'sw-ready-timeout' };
  }
}

function NotificationToast({
  kind,
  title,
  body,
  onDismiss,
}: {
  kind: 'buy' | 'sell' | 'system';
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const emoji = kind === 'buy' ? '🔴' : kind === 'sell' ? '🟢' : '✅';
  const border =
    kind === 'buy'
      ? 'border-rose-500'
      : kind === 'sell'
        ? 'border-emerald-500'
        : 'border-blue-500';
  return (
    <div
      className={`max-w-sm w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 pointer-events-auto flex items-start gap-3 p-3 border-l-4 ${border}`}
      style={{ zIndex: 9999 }}
    >
      <div className="text-xl leading-none shrink-0 pt-0.5">{emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 break-words">
          {title}
        </div>
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line break-words font-mono tabular-nums leading-relaxed">
          {body}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        aria-label="关闭"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  );
}

export function useTradeNotifications(options: UseTradeNotificationsOptions) {
  const {
    accountAlias,
    pushServerBaseUrl: rawPushServerBase,
  } = options;

  const pushServerBaseUrl = useMemo(() => {
    const trimmed = (rawPushServerBase ?? '').toString().replace(/\/$/, '');
    return trimmed === '' ? '' : trimmed;
  }, [rawPushServerBase]);

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission as NotificationPermission;
  });

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!accountAlias) return false;
    try {
      return localStorage.getItem(getStorageKey(accountAlias, STORAGE_KEY_ENABLED)) === '1';
    } catch {
      return false;
    }
  });

  const [pushCapable, setPushCapable] = useState<PushCapable>('unknown');
  const [pushCapableReason, setPushCapableReason] = useState<PushCapableReason>(undefined);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushServerConfig, setPushServerConfig] = useState<PushServerConfig | null>(null);
  const [newTradesCount, setNewTradesCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const lastSeenGuidsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const pushSubEndpointRef = useRef<string | null>(null);
  const swMessageHandlerAttachedRef = useRef(false);
  const lastEnforceSubscribeRef = useRef<number>(0);
  // 用 ref 间接引用后面声明的 useCallback，避免 useEffect 里 TDZ：
  //   ReferenceError: Cannot access 'fetchPushServerConfig' before initialization
  // 同理 subscribeWebPush 也走 ref
  const fetchPushServerConfigRef = useRef<() => Promise<PushServerConfig | null>>(() => Promise.resolve(null));
  const subscribeWebPushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  // ----------------------------------------------------------------- init
  useEffect(() => {
    if (!accountAlias) {
      setEnabled(false);
      setPushSubscribed(false);
      return;
    }
    try {
      const raw = localStorage.getItem(getStorageKey(accountAlias, STORAGE_KEY_LAST_GUIDS));
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        lastSeenGuidsRef.current = new Set(parsed);
      } else {
        lastSeenGuidsRef.current = new Set();
      }
    } catch {
      lastSeenGuidsRef.current = new Set();
    }

    // 重新读取新账户的订阅开启状态，重置 pushSubscribed 状态重新触发检测
    try {
      const isEnabled = localStorage.getItem(getStorageKey(accountAlias, STORAGE_KEY_ENABLED)) === '1';
      logger.debug(`[TradeNotifications][init] accountAlias=${accountAlias} loaded enabled=${isEnabled}`);
      setEnabled(isEnabled);
    } catch {
      setEnabled(false);
    }
    setPushSubscribed(false);

    initializedRef.current = false;
    // 重新评估 SW push 能力（跨账户共享即可，这里不影响）
    void isServiceWorkerPushCapable().then((r) => {
      setPushCapable(r.ok);
      setPushCapableReason(r.reason);
    });
  }, [accountAlias]);

  // -------------------------------------------------- 监听 SW push 消息
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (swMessageHandlerAttachedRef.current) return;
    swMessageHandlerAttachedRef.current = true;
    const handler = (event: MessageEvent) => {
      const data = event.data as SwIncomingPushMessage | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'yh:incoming-push') return;
      const p = data.payload || {};
      const kind: 'buy' | 'sell' | 'system' =
        p.operation === 'buy' ? 'buy' : p.operation === 'sell' ? 'sell' : 'system';
      const toastId = `sw-push-${p.tag || Date.now()}`;
      toast.custom(
        (t) => (
          <NotificationToast
            kind={kind}
            title={p.title || '新成交'}
            body={p.body || ''}
            onDismiss={() => toast.dismiss(t.id)}
          />
        ),
        { id: toastId, duration: 15_000 }
      );
      setNewTradesCount((c) => c + 1);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
      swMessageHandlerAttachedRef.current = false;
    };
  }, []);

  // ----------------------------------------------- PWA Push 初始化：立刻拉 config + probe push 能力
  // 否则 UI 永远显示「Push Server 未连接」且 pushCapable 永远 unknown
  useEffect(() => {
    if (!accountAlias) return;
    let cancelled = false;
    void (async () => {
      const capRes = await isServiceWorkerPushCapable();
      if (!cancelled) {
        setPushCapable(capRes.ok);
        setPushCapableReason(capRes.reason);
      }
      if (cancelled) return;
      // 如果从没 fetch 过 config → 立刻 fetch 一次
      if (!pushServerConfig) await fetchPushServerConfigRef.current();
    })();
    return () => { cancelled = true; };
  }, [accountAlias, pushServerConfig]);

  // ----------------------------------------------- 兜底防分裂：enabled=true + pushSubscribed=false → 重试真实订阅
  // 解决场景：
  //   a) 中途用户关闭了权限弹窗 / 网络抖动导致 subscribeWebPush 失败
  //   b) 页面刷新时 localStorage 恢复 enabled=1，但浏览器/后端的真实订阅已经没了
  useEffect(() => {
    if (!accountAlias || !enabled || pushSubscribed) return;
    if (pushCapable === 'unknown') return;       // 等 capability probe 完
    if (permission !== 'granted') return;        // 等 toggleEnabled 里 requestPermission 结束
    const now = Date.now();
    if (now - (lastEnforceSubscribeRef.current || 0) < 1500) return;   // 1.5s 节流，避免和 toggleEnabled 重复触发
    lastEnforceSubscribeRef.current = now;
    void (async () => {
      const ok = await subscribeWebPushRef.current();
      if (!ok) {
        // 真失败且浏览器里没有任何 subscription → 回滚 enabled=false（免得永远循环在「已订阅 badge + 未连接」
        try {
          const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
          const sub = await reg?.pushManager.getSubscription();
          if (!sub) {
            setEnabled(false);
            try {
              localStorage.removeItem(getStorageKey(accountAlias, STORAGE_KEY_ENABLED));
            } catch {}
          }
        } catch { /* ignore */ }
      }
    })();
  }, [accountAlias, enabled, pushSubscribed, pushCapable, permission]);

  // ------------------------------------------------ helpers

  type ShowDesktopNotificationResult = 'constructed' | 'sw-shown' | 'failed';
  const showDesktopNotificationSafely = useCallback(async (
    title: string,
    body: string,
    options: Partial<{
      tag: string;
      icon: string;
      badge: string;
      requireInteraction: boolean;
      silent: boolean;
      url: string;
    }> = {},
    onShown?: (via: 'constructor' | 'sw') => void,
    onError?: (err: unknown, attempted: ('constructor' | 'sw')[]) => void,
  ): Promise<ShowDesktopNotificationResult> => {
    if (typeof window === 'undefined') return 'failed';

    const tag = options.tag || `yh-${Date.now()}`;
    const icon = options.icon || '/favicon.svg';
    const badge = options.badge || '/favicon.svg';
    const requireInteraction = !!options.requireInteraction;
    const silent = !!options.silent;

    const attempted: ('constructor' | 'sw')[] = [];

    // 方法 1：new Notification()（桌面端 Chrome/Edge/Firefox 支持；Android Chrome PWA 可能抛 Illegal constructor）
    if ('Notification' in window) {
      try {
        attempted.push('constructor');
        const n = new window.Notification(title, {
          body,
          tag,
          icon,
          badge,
          requireInteraction,
          silent,
        });
        if (options.url) {
          n.onclick = () => {
            window.focus();
            window.open(options.url, '_blank', 'noopener');
            n.close();
          };
        }
        setTimeout(() => n.close(), 15_000);
        onShown?.('constructor');
        logger.debug('[TradeNotifications] showNotification via new Notification() OK');
        return 'constructed';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isIllegal = /Illegal constructor/i.test(msg);
        logger.warn(
          '[TradeNotifications] new Notification() failed, will try SW.showNotification().',
          isIllegal
            ? '(Android Chrome / PWA 模式下禁用了 Notification 构造函数 — 这是正常现象)'
            : '',
          err
        );
        if (!isIllegal) {
          onError?.(err, [...attempted]);
        }
      }
    }

    // 方法 2：回退到 ServiceWorkerRegistration.showNotification()（Android Chrome / PWA 必用）
    if ('serviceWorker' in navigator) {
      try {
        attempted.push('sw');
        const reg = await navigator.serviceWorker.ready;
        if (reg?.showNotification) {
          await reg.showNotification(title, {
            body,
            tag,
            icon,
            badge,
            requireInteraction,
            silent,
            data: {
              url: options.url || '/',
              __v: 1,
            },
            ...(options.url
              ? {
                  actions: [
                    { action: 'open-page', title: '查看详情' },
                  ],
                }
              : {}),
          } as NotificationOptions);
          onShown?.('sw');
          logger.debug('[TradeNotifications] showNotification via SW.showNotification() OK');
          return 'sw-shown';
        }
      } catch (err) {
        logger.error('[TradeNotifications] SW.showNotification() also failed', err);
        onError?.(err, [...attempted]);
        return 'failed';
      }
    }

    onError?.(
      new Error('No available notification mechanism (both new Notification() and SW.showNotification() unavailable/failed)'),
      [...attempted]
    );
    return 'failed';
  }, []);

  const persistLastSeenGuids = useCallback(() => {
    if (!accountAlias) return;
    try {
      const arr = Array.from(lastSeenGuidsRef.current).slice(-200);
      localStorage.setItem(getStorageKey(accountAlias, STORAGE_KEY_LAST_GUIDS), JSON.stringify(arr));
    } catch {
      /* noop */
    }
  }, [accountAlias]);

  const sendInAppToastAndNotification = useCallback((item: RssTradeItem) => {
    const isTrade = item.operation === 'buy' || item.operation === 'sell';
    const kind: 'buy' | 'sell' | 'system' =
      item.operation === 'buy' ? 'buy' : item.operation === 'sell' ? 'sell' : 'system';

    let title: string;
    let body: string;

    if (isTrade) {
      const actionText = item.operation === 'buy' ? '买入' : '卖出';
      title = `${actionText} · 新成交记录`;
      body = formatNotificationBody(item);
    } else {
      title = item.title;
      body = item.description || formatNotificationBody(item);
    }

    const toastId = `trade-notify-${item.guid || Date.now()}`;
    toast.custom(
      (t) => (
        <NotificationToast
          kind={kind}
          title={title}
          body={body}
          onDismiss={() => toast.dismiss(t.id)}
        />
      ),
      { id: toastId, duration: isTrade ? 15_000 : 8_000 }
    );

    if (typeof window === 'undefined') {
      logger.debug('[TradeNotifications] skip desktop: no window (SSR)');
      return;
    }

    const hasNotifApi = 'Notification' in window;
    const hasSwApi = 'serviceWorker' in navigator;
    if (!hasNotifApi && !hasSwApi) {
      logger.warn('[TradeNotifications] skip desktop: neither Notification API nor SW API supported');
      return;
    }

    const perm = hasNotifApi ? window.Notification.permission : 'granted';
    if (perm !== 'granted') {
      logger.warn(
        '[TradeNotifications] skip desktop: Notification.permission =',
        perm,
        perm === 'denied'
          ? '(user denied; open browser site settings to allow notifications)'
          : perm === 'default'
            ? '(permission never requested; click the subscribe/notify button to prompt)'
            : ''
      );
      return;
    }

    const prefix = isTrade
      ? item.operation === 'buy'
        ? '🔴 '
        : '🟢 '
      : '✅ ';
    void showDesktopNotificationSafely(
      prefix + title,
      body,
      {
        tag: item.guid || `trade-${Date.now()}`,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        requireInteraction: false,
        silent: false,
        url: item.link,
      },
      (via) => {
        if (via === 'constructor') {
          toast.dismiss(toastId);
        }
        logger.debug(`[TradeNotifications] desktop notification shown via ${via}`);
      },
      (err, attempted) => {
        logger.error(
          `[TradeNotifications] desktop notification FAILED after trying ${attempted.join(' + ')}. ` +
            'Possible causes: 1) OS notification disabled globally; 2) SW not activated; 3) Android Chrome needs build (vite dev mode sw.js 404); 4) private/incognito. Error:',
          err
        );
      }
    );
  }, [showDesktopNotificationSafely]);

  // ------------------------------------------------- permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      setError('当前浏览器不支持桌面通知');
      return false;
    }
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result as NotificationPermission);
      if (result === 'granted') {
        setError(null);
        return true;
      } else if (result === 'denied') {
        setError('通知权限被拒绝，请在浏览器设置中手动开启通知权限');
        return false;
      }
      return false;
    } catch (err) {
      logger.error('[TradeNotifications] requestPermission error', err);
      setError('请求通知权限失败');
      return false;
    }
  }, []);

  // ------------------------------------------------- push server 配置
  const fetchPushServerConfig = useCallback(async (): Promise<PushServerConfig | null> => {
    try {
      const res = await fetch(`${pushServerBaseUrl}/api/push/config`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PushServerConfig;
      setPushServerConfig(data);
      setError(null);
      return data;
    } catch (err) {
      logger.error('[TradeNotifications] fetchPushServerConfig error', err);
      setError(
        '无法连接到 Push Server：' +
          (err instanceof Error ? err.message : '请确认 push_server/app.py 是否运行，且反向代理已配置。')
      );
      return null;
    }
  }, [pushServerBaseUrl]);
  fetchPushServerConfigRef.current = fetchPushServerConfig;

  // ------------------------------------------------- web push 订阅
  const unsubscribeWebPush = useCallback(async () => {
    const step = (name: string, detail?: unknown) => {
      logger.debug(`[TradeNotifications][unsubscribeWebPush] ➜ step: ${name}`, detail ?? '');
    };
    step('START', { accountAlias, pushSubscribed, endpointRef: pushSubEndpointRef.current ? pushSubEndpointRef.current.slice(0, 40) + '...' : null });

    if (!accountAlias) {
      logger.warn('[TradeNotifications][unsubscribeWebPush] ✗ STOP early: 缺少 accountAlias');
      return;
    }
    step('accountAlias OK');

    let endpoint: string | null | undefined = null;
    try {
      if (!('serviceWorker' in navigator)) {
        step('⚠ 无 serviceWorker API，跳过浏览器端 sub.unsubscribe()，只尝试后端 unsubscribe（如有 cached endpoint）');
      } else {
        step('查询 SW registration + 当前 subscription...');
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        endpoint = sub?.endpoint || pushSubEndpointRef.current;
        if (sub) {
          try {
            await sub.unsubscribe();
            step('✓ 浏览器端 subscription.unsubscribe() 成功', { endpoint: endpoint ? endpoint.slice(0, 40) + '...' : null });
          } catch (e) {
            logger.warn('[TradeNotifications][unsubscribeWebPush] 浏览器端 unsubscribe() 抛错（非致命，继续后端）', e);
            step(`⚠ 浏览器端 unsubscribe 失败但继续：${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          step('浏览器端没有现存 subscription（可能之前已清或 SW 未激活），只尝试后端 unsubscribe');
          if (!endpoint) endpoint = pushSubEndpointRef.current;
        }
      }

      if (endpoint) {
        const url = `${pushServerBaseUrl}/api/push/unsubscribe`;
        step(`→ POST ${url}`, { account_alias: accountAlias, endpoint_prefix: endpoint.slice(0, 40) + '...' });
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_alias: accountAlias, endpoint }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            step(`✓ 后端 unsubscribe 成功 HTTP ${res.status}`, data);
            logger.info(`[TradeNotifications][unsubscribeWebPush] ← ${url} HTTP ${res.status} OK ✔`);
          } else {
            const txt = await res.text().catch(() => '');
            const msg = `后端 unsubscribe 失败 HTTP ${res.status} ${txt.slice(0, 120)}（忽略，不影响本地状态）`;
            logger.warn('[TradeNotifications][unsubscribeWebPush] ' + msg);
            step('⚠ ' + msg);
          }
        } catch (e) {
          const msg = `后端 unsubscribe fetch 异常（push_server 未运行 / 代理路径错误 / 网络断连？）：${e instanceof Error ? e.message : String(e)}（忽略，不影响本地状态）`;
          logger.warn('[TradeNotifications][unsubscribeWebPush] ' + msg);
          step('⚠ ' + msg);
        }
      } else {
        step(`跳过后端 unsubscribe：endpoint 为空`);
      }

      pushSubEndpointRef.current = null;
      setPushSubscribed(false);
      step('✓ 本地 pushSubscribed=false + endpointRef=null 设置完毕');
    } catch (err) {
      logger.error('[TradeNotifications][unsubscribeWebPush] 顶层异常', err);
    }
  }, [accountAlias, pushServerBaseUrl]);

  const subscribeWebPush = useCallback(async (): Promise<boolean> => {
    const step = (name: string, detail?: unknown) => {
      logger.debug(`[TradeNotifications][subscribeWebPush] ➜ step: ${name}`, detail ?? '');
    };
    step('START', {
      accountAlias,
      permission,
      pushCapable,
      pushSubscribed,
    });

    if (!accountAlias) {
      logger.warn('[TradeNotifications][subscribeWebPush] ✗ STOP early: 缺少 accountAlias');
      setError('请先选择账户');
      return false;
    }
    step('accountAlias OK');

    const noWin = typeof window === 'undefined';
    const noSw = typeof window !== 'undefined' && !('serviceWorker' in navigator);
    if (noWin || noSw) {
      logger.warn(
        '[TradeNotifications][subscribeWebPush] ✗ STOP early: 不支持 Service Worker',
        { noWin, noSw }
      );
      setError('当前浏览器不支持 Service Worker（隐私模式 / iframe / 过旧浏览器）');
      setPushCapable('no');
      setPushCapableReason('no-service-worker-api');
      return false;
    }
    step('Service Worker API OK');

    const hasPushMgr = 'PushManager' in window;
    if (!hasPushMgr) {
      logger.warn('[TradeNotifications][subscribeWebPush] ✗ STOP early: 没有 PushManager API（iOS <16.4 / iOS 第三方浏览器 / 非 PWA 模式）');
      setError('当前浏览器不支持 Web Push（PushManager 不存在）。\niOS：需要 ≥16.4 且「添加到主屏幕」后从主屏打开；Android Chrome 需 HTTPS + SW 注册。');
      setPushCapable('no');
      setPushCapableReason('no-push-manager-api');
      return false;
    }
    step('PushManager API OK');

    step('开始 isServiceWorkerPushCapable probe (8s timeout)...');
    const res = await isServiceWorkerPushCapable(8000, /* skipCache: */ true);
    setPushCapable(res.ok);
    setPushCapableReason(res.reason);
    step(`probe 完成: ok=${res.ok}, reason=${res.reason ?? 'n/a'}`);
    if (res.ok !== 'yes') {
      const detail = explainPushCapableReason(
        res.reason,
        window.isSecureContext,
        import.meta.env.PROD
      );
      logger.warn(
        `[TradeNotifications][subscribeWebPush] ✗ STOP early: SW Push 能力探测不通过 (ok=${res.ok}, reason=${res.reason})，即将调用 setError:`,
        detail
      );
      setError(detail);
      return false;
    }
    step('SW Push Capability OK');

    // iOS standalone 下 Notification API 可能不存在，所以权限检查放宽：
    // 仅当 Notification API 存在时才检查 permission === 'granted'
    const notifApiExists = 'Notification' in window;
    const notifPerm = notifApiExists ? window.Notification.permission : 'granted';
    if (notifPerm !== 'granted') {
      logger.warn(
        '[TradeNotifications][subscribeWebPush] ✗ STOP early: 通知权限未授予',
        { notifApiExists, notifPerm }
      );
      setError(
        notifPerm === 'denied'
          ? '通知权限已被拒绝，请到浏览器网站设置手动允许通知后重试。'
          : '尚未授予通知权限，点击订阅按钮后在系统弹窗中选择「允许」。'
      );
      return false;
    }
    step(`权限 OK: Notification API=${notifApiExists ? 'Y' : 'N'}, permission=${notifPerm}`);

    step(
      pushServerConfig
        ? `pushServerConfig 已缓存: vapid_key.length=${pushServerConfig.vapid_public_key?.length ?? 0}`
        : 'pushServerConfig 未缓存 → 开始 fetch /api/push/config'
    );
    const cfg = (pushServerConfig ?? await fetchPushServerConfig());
    if (!cfg || !cfg.vapid_public_key) {
      logger.warn(
        '[TradeNotifications][subscribeWebPush] ✗ STOP early: 无法从 /api/push/config 拿到 VAPID 公钥',
        { cfg: !!cfg, vapidLen: cfg?.vapid_public_key?.length ?? 0 }
      );
      setError(
        '无法从 /api/push/config 获取 VAPID 公钥。\n请确认：① push_server/app.py 正在运行；② 反向代理 /api/push/* → push_server 端口正确；③ 浏览器能直接 GET /api/push/config 返回 JSON。'
      );
      return false;
    }
    step(`pushServerConfig OK: vapid_key.length=${cfg.vapid_public_key.length}, poll_interval=${cfg.poll_interval_seconds}s`);
    if (!pushServerConfig) setPushServerConfig(cfg);

    try {
      step('等待 navigator.serviceWorker.ready...');
      const reg = await navigator.serviceWorker.ready;
      step(`SW ready OK: scope=${reg.scope}, has pushManager=${!!(reg as ServiceWorkerRegistration & { pushManager?: PushManager }).pushManager}`);
      if (!reg?.pushManager) throw new Error('Service Worker 已激活但没有 pushManager');

      step('检查已有 push subscription...');
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        step('已有 subscription，重用 endpoint 并上报后端', { endpoint: existing.endpoint.slice(0, 60) + '...' });
        const ex = existing as PushSubscription & {
          keys?: { p256dh: string; auth: string };
          getKey?: (name: 'p256dh' | 'auth') => ArrayBuffer | null;
        };
        const keys = ex.getKey
          ? {
              p256dh: arrayBufferToB64url(ex.getKey('p256dh')),
              auth: arrayBufferToB64url(ex.getKey('auth')),
            }
          : (ex.keys ?? { p256dh: '', auth: '' });
        step('即将 POST /api/push/subscribe (reuse existing)');
        await reportToBackend(existing.endpoint, keys);
        pushSubEndpointRef.current = existing.endpoint;
        setError(null);
        setPushSubscribed(true);
        logger.info('[TradeNotifications][subscribeWebPush] ✓ SUCCESS: reuse existing subscription');
        return true;
      }

      step('没有已有 subscription → 调用 pushManager.subscribe 新建订阅');
      const appServerKey = _b64urlToUint8(cfg.vapid_public_key);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey as unknown as BufferSource,
      });
      step(`pushManager.subscribe 成功: endpoint=${sub.endpoint.slice(0, 60)}...`);
      const keys = {
        p256dh: arrayBufferToB64url(sub.getKey('p256dh')),
        auth: arrayBufferToB64url(sub.getKey('auth')),
      };
      step('即将 POST /api/push/subscribe (new subscription)');
      await reportToBackend(sub.endpoint, keys);
      pushSubEndpointRef.current = sub.endpoint;
      setError(null);
      setPushSubscribed(true);
      logger.info('[TradeNotifications][subscribeWebPush] ✓ SUCCESS: new subscription + backend reported');
      return true;
    } catch (err) {
      logger.error('[TradeNotifications][subscribeWebPush] ✗ 订阅失败 (try/catch):', err);
      const msg = err instanceof Error ? err.message : String(err);
      let hint = '';
      if (/permission|denied|not allowed/i.test(msg)) {
        hint = '（浏览器/系统拒绝了 Push 订阅请求：请在权限弹窗中选「允许」；iOS/Android 系统设置里通知不能关）';
      } else if (/abort|timed?out|timeout|ready/i.test(msg)) {
        hint = '（SW 注册超时：vite dev 环境常见，需要 build + HTTPS 部署后才能完成 subscribe）';
      } else if (/vapid|applicationServerKey|key/i.test(msg)) {
        hint = '（VAPID 公钥不匹配：push_server 和前端拿到的 vapid_public_key 必须是同一个 keypair 生成）';
      } else if (/No active|service worker|register/i.test(msg)) {
        hint = '（SW 未激活：检查 DevTools → Application → Service Workers 是否正常且 activated）';
      }
      setError(`Web Push 订阅失败：${msg}${hint ? ' ' + hint : ''}`);
      return false;
    }

    async function reportToBackend(endpoint: string, keys: { p256dh: string; auth: string }) {
      const url = `${pushServerBaseUrl}/api/push/subscribe`;
      const body = {
        account_alias: accountAlias,
        endpoint,
        keys,
        client_id: ensureClientId(accountAlias ?? ''),
      };
      logger.debug(
        `[TradeNotifications][subscribeWebPush] → POST ${url}`,
        `account_alias=${body.account_alias}, endpoint_len=${body.endpoint.length}, keys.p256dh.len=${body.keys.p256dh.length}`
      );
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errMsg = await res.text().catch(() => '');
        logger.error(
          `[TradeNotifications][subscribeWebPush] ← ${url} HTTP ${res.status} failed:`,
          errMsg
        );
        throw new Error(`后端 subscribe 失败 HTTP ${res.status} ${errMsg}`);
      }
      logger.info(
        `[TradeNotifications][subscribeWebPush] ← ${url} HTTP ${res.status} OK ✔ 后端订阅请求发送成功！`
      );
    }
  }, [accountAlias, fetchPushServerConfig, pushServerBaseUrl, pushServerConfig, permission, pushCapable, pushSubscribed]);
  subscribeWebPushRef.current = subscribeWebPush;

  function arrayBufferToB64url(buf: ArrayBuffer | null | undefined): string {
    if (!buf) return '';
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ------------------------------------------------- enabled 切换
  const toggleEnabled = useCallback(async () => {
    const step = (name: string, detail?: unknown) => {
      logger.debug(`[TradeNotifications][toggleEnabled] ➜ step: ${name}`, detail ?? '');
    };
    step('START', {
      accountAlias,
      enabled,
      permission,
      pushCapable,
      pushSubscribed,
    });

    if (!accountAlias) {
      logger.warn('[TradeNotifications][toggleEnabled] ✗ STOP early: 缺少 accountAlias');
      setError('请先选择账户');
      return;
    }
    step('accountAlias OK');

    if (enabled) {
      step('enabled=true，关闭订阅：调用 unsubscribeWebPush() 并标记 enabled=false');
      await unsubscribeWebPush();
      setEnabled(false);
      try {
        localStorage.removeItem(getStorageKey(accountAlias, STORAGE_KEY_ENABLED));
      } catch {}
      return;
    }

    // 只支持 PWA Push 模式：只要没有 PushManager 就拦截
    const notifApiExists = 'Notification' in window;
    const hasPushManager = 'PushManager' in window;
    if (!hasPushManager && !notifApiExists) {
      logger.warn(
        '[TradeNotifications][toggleEnabled] ✗ STOP early: 既没有 Notification API 也没有 PushManager',
        { notifApiExists, hasPushManager, permission }
      );
      setError(
        '当前环境不支持 Web Push（既没有 Notification API，也没有 PushManager）。\n• iOS：请升级到 iOS ≥ 16.4，Safari → 添加到主屏幕，从主屏图标打开后重试；\n• Android：请使用 Chrome + HTTPS 访问；\n• 桌面端：推荐 Chrome/Edge/Firefox 正式版。'
      );
      return;
    }
    step(`基础能力 OK: Notification API=${notifApiExists ? 'Y' : 'N'}, PushManager=${hasPushManager ? 'Y' : 'N'}`);

    if (permission === 'denied') {
      logger.warn('[TradeNotifications][toggleEnabled] ✗ STOP early: permission=denied');
      setError(
        'Web Push 通知权限被拒绝：\n• iOS：设置 → 通知 → 找到你添加到主屏的 Web App → 打开「允许通知」；\n• Android：设置 → 应用 → Chrome（或对应 Web App）→ 通知 → 允许；\n修改后点击按钮重试或刷新页面。'
      );
      return;
    }

    if (notifApiExists && permission !== 'granted') {
      step(`permission=${permission} ≠ granted，开始 requestPermission...`);
      const ok = await requestPermission();
      step(`requestPermission 返回: ${ok}`);
      if (!ok) return;
    } else {
      step(`跳过 requestPermission: notifApiExists=${notifApiExists}, permission=${permission}`);
    }

    // 唯一模式：PWA Push，必须完成订阅才标记 enabled
    step('开始 subscribeWebPush()（probe SW → fetch config → pushManager.subscribe → POST /api/push/subscribe）');
    const ok = await subscribeWebPush();
    step(`subscribeWebPush 返回: ${ok}`);
    if (!ok) {
      logger.warn('[TradeNotifications][toggleEnabled] subscribeWebPush 返回 false，不标记 enabled=true');
      return;
    }

    initializedRef.current = false;
    setEnabled(true);
    try {
      localStorage.setItem(getStorageKey(accountAlias, STORAGE_KEY_ENABLED), '1');
    } catch {}
    logger.info('[TradeNotifications][toggleEnabled] ✓ enabled=true，订阅流程完成！');

    sendInAppToastAndNotification({
      guid: `welcome-${Date.now()}`,
      title: '订阅成功 · 成交通知已开启（PWA Push，关页也能收到）',
      link: window.location.href,
      pubDate: new Date().toISOString(),
      description:
        `已通过 Web Push 订阅账户 ${accountAlias}。即使关闭此页面，有新成交也会通过系统通知推送到你设备。`,
      stockCode: accountAlias,
      stockName: '成交通知订阅成功',
      operation: undefined,
      price: undefined,
      quantity: undefined,
      amount: undefined,
    });
  }, [accountAlias, enabled, permission, requestPermission, subscribeWebPush, unsubscribeWebPush, sendInAppToastAndNotification]);

  const resetCount = useCallback(() => setNewTradesCount(0), []);

  const sendTestWebPush = useCallback(async () => {
    if (!accountAlias) return;
    try {
      let endpoint: string | null = pushSubEndpointRef.current;
      if ('serviceWorker' in navigator && !endpoint) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) endpoint = sub.endpoint;
        } catch { /* ignore */ }
      }
      const res = await fetch(`${pushServerBaseUrl}/api/push/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_alias: accountAlias,
          endpoint: endpoint ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status}` + (data?.error ? `: ${data.error}` : ''));
      toast.success(
        `测试推送请求已发出（sent=${data.sent ?? '?'}/${data.total ?? '?'}` +
        (endpoint ? ' · 指定当前客户端）' : ' · 未指定 endpoint（全部匹配账户推送）')
      );
      return data as { sent: number; total: number };
    } catch (err) {
      setError('发送测试推送失败：' + (err instanceof Error ? err.message : String(err)));
      return null;
    }
  }, [accountAlias, pushServerBaseUrl]);

  const retryProbePushCapability = useCallback(async () => {
    try { sessionStorage.removeItem(SW_PUSH_CAPABLE_CACHE_KEY); } catch { /* noop */ }
    setPushCapable('unknown');
    setPushCapableReason(undefined);
    const r = await isServiceWorkerPushCapable(8000, /* skipCache: */ true);
    setPushCapable(r.ok);
    setPushCapableReason(r.reason);
    return r;
  }, []);

  const diagnoseDesktopNotifications = useCallback(async (): Promise<{
    notificationApi: 'unsupported' | 'granted' | 'denied' | 'default';
    secureContext: boolean;
    serviceWorkerSupported: boolean;
    serviceWorkerActive: boolean;
    pushManagerSupported: boolean;
    canShowNotification: boolean;
    platform: string;
    isIos: boolean;
    isIosSafari: boolean;
    isAndroid: boolean;
    isAndroidChrome: boolean;
    isStandalone: boolean;
    details: string;
  }> => {
    const result: {
      notificationApi: 'unsupported' | 'granted' | 'denied' | 'default';
      secureContext: boolean;
      serviceWorkerSupported: boolean;
      serviceWorkerActive: boolean;
      pushManagerSupported: boolean;
      canShowNotification: boolean;
      platform: string;
      isIos: boolean;
      isIosSafari: boolean;
      isAndroid: boolean;
      isAndroidChrome: boolean;
      isStandalone: boolean;
      details: string;
    } = {
      notificationApi: 'unsupported',
      secureContext: false,
      serviceWorkerSupported: false,
      serviceWorkerActive: false,
      pushManagerSupported: false,
      canShowNotification: false,
      platform: '',
      isIos: false,
      isIosSafari: false,
      isAndroid: false,
      isAndroidChrome: false,
      isStandalone: false,
      details: '',
    };

    if (typeof window === 'undefined') {
      result.details = '无 window 对象（SSR 环境）';
      return result;
    }

    const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    result.platform = (navigator.platform || '') + (userAgentData?.platform ? ` / ${userAgentData.platform}` : '');
    const ua = navigator.userAgent || '';
    result.isIos = /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    result.isIosSafari = result.isIos && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    result.isAndroid = /Android/i.test(ua);
    result.isAndroidChrome = result.isAndroid && /Chrome\/\d+/i.test(ua) && !/EdgA|SamsungBrowser|OPR|UCBrowser/i.test(ua);
    result.isStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true;

    result.secureContext = window.isSecureContext;

    if (!('Notification' in window)) {
      result.notificationApi = 'unsupported';

      const iosTips: string[] = [];
      if (result.isIos) {
        iosTips.push('⚠️ iOS (iPhone/iPad) 通知支持限制非常严格：');
        iosTips.push('');
        iosTips.push('① 系统版本要求：iOS ≥ 16.4（2023年3月发布）');
        iosTips.push('   低于此版本：Notification API 完全不可用（unsupported）');
        iosTips.push('');
        iosTips.push('② 必须「添加到主屏幕」作为 PWA 运行：');
        iosTips.push('   Safari → 分享按钮 → 添加到主屏幕 → 从主屏幕图标打开');
        iosTips.push('   普通 Safari 标签页中 Notification API 永远是 undefined');
        iosTips.push('');
        iosTips.push('③ 首次打开主屏幕 App 后，点击页面上的「订阅 PWA Push」按钮');
        iosTips.push('   系统会弹出权限请求，允许后才能收到通知');
        iosTips.push('');
        iosTips.push('④ iOS 设置 → 通知 → 找到你添加到主屏的 Web App，确保开启');
        iosTips.push('   （它不会显示为 Safari，而是你添加时命名的 App）');
        iosTips.push('');
        iosTips.push('⑤ 不支持 iOS 第三方浏览器：');
        iosTips.push('   Chrome/Firefox/Edge for iOS 都是 WebKit 壳，Web Push 均不可用');
        iosTips.push('');
        iosTips.push(`当前检测：iOS=${result.isIos ? '是' : '否'}  Safari=${result.isIosSafari ? '是' : '否'}  已添加主屏=${result.isStandalone ? '是' : '否'}`);
        if (!result.isStandalone && result.isIosSafari) {
          iosTips.push('');
          iosTips.push('👉 请先添加到主屏幕，再从主屏幕打开后重试。');
        }
        result.details = iosTips.join('\n');
      } else if (result.isAndroid) {
        const andTips: string[] = [];
        andTips.push('⚠️ Android Chrome 出现 Notification = unsupported 异常，通常在 PWA 安装后出现。');
        andTips.push('   请改用「PWA Push」模式，或通过以下方式解决：');
        andTips.push('');
        andTips.push('① 代码已自动回退到 SW.showNotification()，请点「🔔 测试通知」重试。');
        andTips.push('   （当前代码会自动尝试两种方式，不会只卡在 Illegal constructor）');
        andTips.push('');
        andTips.push('② 若仍失败，确认网站是 HTTPS（非 localhost/纯 http）');
        andTips.push('');
        andTips.push('③ vite dev 模式下 sw.js 经常 404，请运行：');
        andTips.push('   npm run build && npm run preview，再用手机访问 preview 端口。');
        andTips.push('');
        andTips.push(`当前检测：Android=${result.isAndroid ? '是' : '否'}  Chrome=${result.isAndroidChrome ? '是' : '否'}  PWA独立窗口=${result.isStandalone ? '是' : '否'}`);
        result.details = andTips.join('\n');
      } else {
        result.details = '浏览器不支持 Notification API（隐私模式 / iframe 沙箱 / 过旧浏览器）。\n如果你在桌面端：换用 Chrome/Edge/Firefox 正式版，或退出隐私/无痕模式。';
      }
      return result;
    }
    result.notificationApi = window.Notification.permission as 'unsupported' | 'granted' | 'denied' | 'default';

    result.serviceWorkerSupported = 'serviceWorker' in navigator;
    result.pushManagerSupported = 'PushManager' in window;

    if (result.serviceWorkerSupported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        result.serviceWorkerActive = !!(reg && reg.active);
      } catch { /* noop */ }
    }

    const canShowPermission = result.notificationApi === 'granted';
    const secureOk = result.secureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    result.canShowNotification = canShowPermission && secureOk;

    const tips: string[] = [];

    if (result.isIos && !result.isStandalone) {
      tips.push('⚠️ iOS 必须先「添加到主屏幕」后才能使用通知（当前是 Safari 标签页）。');
      tips.push('   操作：分享 → 添加到主屏幕 → 从主屏幕图标打开后再订阅。');
    }
    if (result.isAndroid && result.notificationApi === 'granted') {
      tips.push('ℹ️ Android Chrome：即使权限=granted，也可能禁用 new Notification() 构造函数。');
      tips.push('   代码已自动回退到 SW.showNotification()，点「🔔 测试通知」可验证链路。');
      if (!result.serviceWorkerActive) {
        tips.push('   当前 Service Worker 未激活，回退路径也会失败：需要 HTTPS + build 后运行（vite dev 通常没有可用 SW）。');
      }
    }

    if (result.notificationApi === 'denied') {
      tips.push('• 通知权限被【拒绝】：点击地址栏左侧 🔒 → 网站设置 → 通知 → 改为「允许」');
      if (result.isIos) {
        tips.push('• iOS：设置 → 通知 → 找到你添加到主屏的 Web App → 打开「允许通知」');
      }
      if (result.isAndroid) {
        tips.push('• Android：设置 → 应用 → Chrome（或你安装的 Web App）→ 通知 → 打开「允许通知」');
      }
    } else if (result.notificationApi === 'default') {
      tips.push('• 通知权限尚未请求：点击页面上的「订阅通知」按钮触发权限弹窗');
    } else if (result.notificationApi === 'unsupported') {
      tips.push('• 浏览器不支持通知：换用 Chrome/Edge/Firefox 正式版，或退出隐私/无痕模式');
    }
    if (!secureOk) {
      tips.push('• 当前非安全上下文（非 HTTPS 且非 localhost）：部分浏览器仅允许 HTTPS 页面发通知');
    }
    if (result.notificationApi === 'granted' && result.canShowNotification) {
      tips.push('• 如果权限正确仍无桌面通知：检查 系统设置→通知 中是否允许浏览器发送通知（Windows 专注助手 / macOS 勿扰模式 / Linux 通知中心）');
      if (result.isIos) {
        tips.push('• iOS：设置 → 通知 → 找到你添加到主屏的 Web App，确认开启通知且没有开启专注模式');
      }
      if (result.isAndroid) {
        tips.push('• Android：设置 → 应用 → Chrome（或对应 Web App）→ 通知 → 确认通知类别全部开启，且没有开启勿扰/专注模式');
      }
    }

    result.details = tips.length > 0 ? tips.join('\n') : '基础检查通过；如仍无通知，请到操作系统通知中心设置中排查。';

    return result;
  }, []);

  const sendTestDesktopNotification = useCallback(async () => {
    const step = (name: string, detail?: unknown) => {
      logger.debug(`[TradeNotifications][sendTestDesktopNotif] ➜ step: ${name}`, detail ?? '');
    };
    step('START');
    if (typeof window === 'undefined') {
      setError('无 window 对象');
      return;
    }
    const hasNotifApi = 'Notification' in window;
    const hasSwApi = 'serviceWorker' in navigator;
    step(`API 检查: hasNotification=${hasNotifApi}, hasServiceWorker=${hasSwApi}`);
    if (!hasNotifApi && !hasSwApi) {
      setError('浏览器既不支持 Notification API 也不支持 Service Worker，无法发通知');
      return;
    }

    const initialPerm = hasNotifApi ? window.Notification.permission : 'granted';
    let perm: NotificationPermission | 'granted' = initialPerm;
    step(`初始权限: Notification.permission=${initialPerm}`);

    if (perm === 'default' && hasNotifApi) {
      step('permission=default → 调用 Notification.requestPermission() 弹请求框');
      let reqRes: NotificationPermission | null = null;
      let reqThrew: unknown = null;
      try {
        // 注意：浏览器要求 requestPermission 必须紧跟 user gesture。
        // 如果这里没弹框，多半是 1) 之前阻止过 → 先手动在 🔒 里清空站点设置；2) 非安全上下文/HTTP；3) Windows 专注助手
        if (typeof Notification.requestPermission === 'function') {
          reqRes = await Notification.requestPermission();
        } else {
          step('⚠ Notification.requestPermission 不是函数（非标准浏览器环境）');
        }
      } catch (e) {
        reqThrew = e;
      }
      if (reqRes !== null) {
        perm = reqRes;
        step(`requestPermission 返回: ${reqRes}`);
      }
      if (reqThrew) {
        step(
          'requestPermission 抛错（可能没有 user gesture 或浏览器限制）: ' +
          (reqThrew instanceof Error ? reqThrew.message : String(reqThrew))
        );
        logger.warn(
          '[TradeNotifications][sendTestDesktopNotif] requestPermission threw — try click 「请求通知权限」按钮 in 调试面板',
          reqThrew
        );
      }
    }
    if (perm === 'denied') {
      step('权限=denied → 退出（浏览器/系统阻止了通知权限；之前选过「阻止」会永远 denied，需手动在站点设置里改回「允许」或「每次询问」）');
      setError(
        '通知权限被拒绝（denied），请在浏览器设置中打开通知权限：\n' +
        '• Chrome / Edge：地址栏左侧 🔒 图标 → 网站设置 → 通知 → 允许\n' +
        '• Firefox：地址栏左侧 🔒 / 🛡 → 连接安全 → 更多信息 → 权限 → 通知 → 允许\n' +
        '• Windows 系统：设置 → 系统 → 通知 → 打开通知，并确保对应浏览器开关也开启\n' +
        '• 如果之前选过「阻止」，必须手动清空站点通知设置后才会再次弹框'
      );
      return;
    }
    if (perm !== 'granted') {
      step(`权限仍未 granted（当前=${perm}）→ 无法发送。提示用户点击专用「请求通知权限」按钮或清空站点设置。`);
      setError(
        `通知权限未授予（当前状态：${perm}），无法发送测试通知。\n` +
        '请点击调试面板里的「请求通知权限」专用按钮，或手动在站点设置（🔒）里找到通知 → 允许。\n' +
        '如果浏览器完全不弹框，说明此前选过阻止 → 先在站点设置里把通知从「阻止」改为「询问」或「允许」。'
      );
      return;
    }

    step('权限=granted → 调用 showDesktopNotificationSafely 发通知');
    const result = await showDesktopNotificationSafely(
      '🔔 桌面通知测试',
      '如果你看到这条系统通知，说明桌面通知链路已通。',
      {
        tag: `yh-test-${Date.now()}`,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        requireInteraction: false,
      },
      (via) => {
        step(`发送成功 via=${via}`);
        toast.success(
          via === 'sw'
            ? '测试通知已通过 ServiceWorker 发送（Android/PWA 标准路径）'
            : '测试桌面通知已通过 Notification API 发送'
        );
      },
      (err, attempted) => {
        const msg = err instanceof Error ? err.message : String(err);
        const via = attempted.join(' + ') || 'none';
        logger.error('[TradeNotifications] sendTestDesktopNotification FAILED via', via, err);
        let hint = '';
        if (/Illegal constructor/i.test(msg)) {
          hint = '（Android Chrome PWA：需要先 build + 部署，vite dev 模式可能没有可用的 Service Worker。用 npm run build && npm run preview 后重试，或改用 PWA Push 模式）';
        } else if (attempted.includes('sw') && /ServiceWorker|service worker|registration/i.test(msg + via)) {
          hint = '（Service Worker 尚未注册/激活：vite dev 模式可能没有 sw.js，需 build 后运行；或刷新页面等待 SW ready）';
        } else if (/permission|denied|not allowed|NotAllowed/i.test(msg)) {
          hint = '（Windows 系统通知可能被全局关闭：设置 → 系统 → 通知 → 打开；并允许对应浏览器发通知；或「专注助手/免打扰」关一下）';
        }
        step(`发送失败 via=${via}: ${msg}${hint}`);
        setError(`发送测试桌面通知失败（尝试了 ${via}）：${msg}${hint ? ' ' + hint : ''}`);
        toast.error('桌面通知发送失败，请查看错误提示并检查设置');
      }
    );
    if (result === 'failed') {
      logger.warn('[TradeNotifications] sendTestDesktopNotification returned failed — check above errors');
    }
  }, [showDesktopNotificationSafely]);

  const pushCapableReasonText = useMemo(() => {
    if (pushCapable === 'yes') return '';
    return explainPushCapableReason(
      pushCapableReason,
      typeof window !== 'undefined' ? window.isSecureContext : false,
      import.meta.env.PROD
    );
  }, [pushCapable, pushCapableReason]);

  const diagnosePushSubscriptionFlow = useCallback(async (): Promise<{
    accountAliasSet: boolean;
    secureContext: boolean;
    serviceWorkerApi: boolean;
    pushManagerApi: boolean;
    notificationApi: boolean;
    notificationPermission: 'unsupported' | 'granted' | 'denied' | 'default';
    swRegistered: boolean;
    swScope: string | null;
    pushSubscribed: boolean;
    pushEndpointPrefix: string | null;
    pushServerBaseUrl: string;
    configFetchable: boolean | null;
    vapidKeyLen: number | null;
    pushCapable: 'unknown' | 'yes' | 'no' | 'probing';
    pushCapableReason: PushCapableReason | undefined;
    lastError: string | null;
    willSendSubscribeRequestIfClick: boolean;
    stepLog: string[];
    hint: string;
  }> => {
    const stepLog: string[] = [];
    const log = (msg: string) => stepLog.push(msg);

    log(`[1/11] 通知模式：PWA Push（唯一模式，一定会发 /api/push/subscribe 请求）`);

    const hasAccount = !!accountAlias;
    log(`[2/11] accountAlias=${accountAlias ?? '(未设置)'} → ${hasAccount ? '✓' : '✗ 缺少账户，任何订阅都会被直接拦截'}`);

    let secureCtx = false;
    let swApi = false;
    let pmApi = false;
    let notifApi = false;
    let notifPerm: 'unsupported' | 'granted' | 'denied' | 'default' = 'unsupported';
    let swRegistered = false;
    let swScope: string | null = null;
    let pushSub = false;
    let endpointPrefix: string | null = null;
    let cfgOk: boolean | null = null;
    let vapidLen: number | null = null;
    let lastErr: string | null = error;

    if (typeof window !== 'undefined') {
      secureCtx = window.isSecureContext;
      log(`[3/11] 安全上下文 isSecureContext=${secureCtx ? '✓' : '✗（HTTP 非 HTTPS，且非 localhost → iOS/Android PWA Push 不可用）'}`);

      swApi = 'serviceWorker' in navigator;
      log(`[4/11] Service Worker API: ${swApi ? '✓' : '✗ 隐私模式/过旧浏览器/禁用了 SW'}`);

      pmApi = 'PushManager' in window;
      log(`[5/11] PushManager API: ${pmApi ? '✓' : '✗（iOS < 16.4 / iOS Safari 没添加主屏 / iOS 第三方浏览器）'}`);

      notifApi = 'Notification' in window;
      notifPerm = notifApi ? window.Notification.permission : 'unsupported';
      log(`[6/11] Notification API: exists=${notifApi ? '✓' : '✗'}, permission=${notifPerm}`);

      if (swApi) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.active) {
            swRegistered = true;
            swScope = reg.scope;
            log(`[7/11] Service Worker: 已激活 ✓ scope=${reg.scope}`);
            if (reg.pushManager) {
              const sub = await reg.pushManager.getSubscription().catch(() => null);
              if (sub) {
                pushSub = true;
                endpointPrefix = sub.endpoint.slice(0, 40) + '...';
                log(`[8/11] Push subscription: 已存在 ✓ endpoint_prefix=${endpointPrefix}`);
              } else {
                log('[8/11] Push subscription: 尚未订阅（首次点击订阅按钮时新建）');
              }
            } else {
              log('[8/11] Push subscription: SW 没有 pushManager（?）');
            }
          } else {
            log('[7/11] Service Worker: 未注册或未激活（vite dev 模式常见；需 build+preview 或真实部署）');
            log('[8/11] Push subscription: 跳过（SW 未激活）');
          }
        } catch (e) {
          log(`[7/11] Service Worker: getRegistration 异常: ${e instanceof Error ? e.message : String(e)}`);
          log('[8/11] Push subscription: 跳过（SW 异常）');
        }
      } else {
        log('[7/11] Service Worker: 跳过（无 SW API）');
        log('[8/11] Push subscription: 跳过（无 SW API）');
      }
    } else {
      log('[3/11] 安全上下文: SSR 跳过');
      log('[4/11] Service Worker API: SSR 跳过');
      log('[5/11] PushManager API: SSR 跳过');
      log('[6/11] Notification API: SSR 跳过');
      log('[7/11] Service Worker: SSR 跳过');
      log('[8/11] Push subscription: SSR 跳过');
    }

    log(`[9/11] pushServerBaseUrl=${pushServerBaseUrl || '(空)'}`);

    try {
      log('[10/11] 尝试 GET /api/push/config 探测 VAPID 公钥是否可拿到...');
      const cfg = await fetchPushServerConfig();
      if (cfg && cfg.vapid_public_key) {
        cfgOk = true;
        vapidLen = cfg.vapid_public_key.length;
        log(`[10/11] config ✓ vapid_pubkey.length=${vapidLen}, poll_interval=${cfg.poll_interval_seconds}s`);
      } else {
        cfgOk = false;
        log('[10/11] config ✗ 返回为空或 vapid_public_key 缺失（push_server 没启动 / 代理路径错误 / 数据库未初始化）');
      }
    } catch (e) {
      cfgOk = false;
      log(`[10/11] config ✗ fetch 异常: ${e instanceof Error ? e.message : String(e)}（请检查 push_server/app.py 是否运行 + 反向代理 /api/push/* 是否正确）`);
    }

    log(`[11/11] pushCapable=${pushCapable}, reason=${pushCapableReason ?? 'n/a'}`);
    log(`[补充] pushSubscribed(UI state)=${pushSubscribed}, endpoint=${pushSubEndpointRef.current ? pushSubEndpointRef.current.slice(0, 40) + '...' : '(空)'}`);
    log(`[补充] 最近一次 error=${lastErr ?? '(无错误)'}`);

    // 唯一模式 PWA Push：判断是否能发送 subscribe 请求
    const willSend =
      hasAccount &&
      swApi &&
      pmApi &&
      secureCtx &&
      swRegistered &&
      cfgOk === true &&
      vapidLen !== null && vapidLen > 0 &&
      (notifPerm === 'granted' || !notifApi) &&
      pushCapable !== 'no';
    log(`---结论---`);
    log(`点击订阅按钮时 ${willSend ? '✅ 应该会发送 POST /api/push/subscribe' : '❌ 不会发送（缺少以上某个前置条件）'}`);

    const hints: string[] = [];
    if (!hasAccount) hints.push('❌ 没选账户：请先在下拉框选择一个账户。');
    if (!secureCtx) hints.push('❌ 非安全上下文：iOS/Android PWA Push 强制要求 HTTPS（或 localhost + 真机 remote-debug 也不一定行，推荐部署 HTTPS）。');
    if (!swApi) hints.push('❌ 无 SW API：检查是否是隐私模式 / 过旧浏览器。');
    if (!pmApi) hints.push('❌ 无 PushManager：iOS 需 ≥16.4 + 添加到主屏；Android 需 Chrome + HTTPS。');
    if (!swRegistered) hints.push('❌ SW 未激活：vite dev 模式 sw.js 经常 404，请 npm run build && npm run preview 后访问 preview 端口。');
    if (cfgOk !== true) hints.push('❌ /api/push/config 不可用：请确认 push_server/app.py 是否启动且 /api/push/* 代理正确。');
    if (notifPerm === 'denied') hints.push('❌ 通知权限 denied：浏览器/系统设置里手动允许通知。');
    if (notifPerm === 'default' && notifApi) hints.push('⚠ 权限 default：首次点订阅会弹请求框，允许即可。');
    if (pushCapable === 'no') hints.push(`⚠ pushCapable=no (${pushCapableReason ?? 'n/a'})：见上方解释。`);
    if (hints.length === 0) hints.push('✅ 所有前置条件满足，点击订阅按钮应该能看到后端日志里出现 /api/push/subscribe 200。');

    return {
      accountAliasSet: hasAccount,
      secureContext: secureCtx,
      serviceWorkerApi: swApi,
      pushManagerApi: pmApi,
      notificationApi: notifApi,
      notificationPermission: notifPerm,
      swRegistered,
      swScope,
      pushSubscribed: pushSub,
      pushEndpointPrefix: endpointPrefix,
      pushServerBaseUrl,
      configFetchable: cfgOk,
      vapidKeyLen: vapidLen,
      pushCapable,
      pushCapableReason,
      lastError: lastErr,
      willSendSubscribeRequestIfClick: willSend,
      stepLog,
      hint: hints.join('\n'),
    };
  }, [accountAlias, pushServerBaseUrl, fetchPushServerConfig, pushCapable, pushCapableReason, pushSubscribed, error]);

  return {
    permission,
    enabled,
    newTradesCount,
    error,
    pushCapable,
    pushCapableReason,
    pushCapableReasonText,
    pushSubscribed,
    pushServerConfig,
    requestPermission,
    toggleEnabled,
    resetCount,
    subscribeWebPush,
    unsubscribeWebPush,
    fetchPushServerConfig,
    sendTestWebPush,
    retryProbePushCapability,
    diagnoseDesktopNotifications,
    sendTestDesktopNotification,
    diagnosePushSubscriptionFlow,
  };
}
