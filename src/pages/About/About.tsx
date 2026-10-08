import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Copy, Github, Globe, Mail, MessageSquare } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';
import { isCloudflareEnv } from '../../lib/services';
import { InternalLink } from '../../shared/components';
import { useLanguage } from '../../lib/context/LanguageContext';

interface AboutProps {
  theme: Theme;
}

type ContactItem = {
  key: string;
  label: string;
  value: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  copyText?: string;
};

type AboutApiContact = {
  key?: unknown;
  label?: unknown;
  value?: unknown;
  href?: unknown;
  icon?: unknown;
  copyText?: unknown;
  copy_text?: unknown;
};

type AboutApiResponse = {
  contacts?: unknown;
};

export function About({ theme }: AboutProps) {
  const { isEn } = useLanguage();
  const fallbackContacts = useMemo<ContactItem[]>(
    () => [
      {
        key: 'email',
        label: 'Email',
        value: 'corvofeng@gmail.com',
        href: 'mailto:corvofeng@gmail.com',
        icon: Mail,
        copyText: 'corvofeng@gmail.com',
      },
      {
        key: 'github',
        label: 'GitHub',
        value: 'https://github.com/corvofeng',
        href: 'https://github.com/corvofeng',
        icon: Github,
        copyText: 'https://github.com/corvofeng',
      },
      {
        key: 'website',
        label: 'Website',
        value: 'https://corvo.myseu.cn',
        href: 'https://corvo.myseu.cn',
        icon: Globe,
        copyText: 'https://corvo.myseu.cn',
      },
      {
        key: 'wechat',
        label: 'WeChat',
        value: 'corvofeng',
        icon: MessageSquare,
        copyText: 'corvofeng',
      },
    ],
    []
  );

  const [aboutData, setAboutData] = useState<{ contacts: ContactItem[] }>(() => ({
    contacts: fallbackContacts,
  }));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const iconMap: Record<string, ContactItem['icon']> = {
      mail: Mail,
      email: Mail,
      github: Github,
      globe: Globe,
      website: Globe,
      message: MessageSquare,
      chat: MessageSquare,
      wechat: MessageSquare,
      telegram: MessageSquare,
    };

    const normalizeContacts = (raw: unknown): ContactItem[] => {
      if (!Array.isArray(raw)) return [];
      const items: ContactItem[] = [];
      for (const entry of raw as AboutApiContact[]) {
        const key = typeof entry?.key === 'string' ? entry.key : '';
        const label = typeof entry?.label === 'string' ? entry.label : '';
        const value = typeof entry?.value === 'string' ? entry.value : '';
        if (!key || !label || !value) continue;
        const href = typeof entry?.href === 'string' ? entry.href : undefined;
        const iconKey = typeof entry?.icon === 'string' ? entry.icon.toLowerCase() : '';
        const icon = iconMap[iconKey] || Mail;
        const copyText =
          typeof entry?.copyText === 'string'
            ? entry.copyText
            : typeof entry?.copy_text === 'string'
              ? entry.copy_text
              : undefined;
        items.push({ key, label, value, href, icon, copyText });
      }
      return items;
    };

    const load = async () => {
      try {
        const response = await fetch('/api/about', { method: 'GET' });
        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
          ? ((await response.json()) as AboutApiResponse)
          : ((await response.text()) as unknown);

        if (!response.ok) {
          const maybeMessage =
            body && typeof body === 'object' ? String((body as Record<string, unknown>).message || '') : '';
          throw new Error(maybeMessage || response.statusText || `HTTP ${response.status}`);
        }

        const contacts = normalizeContacts((body as AboutApiResponse)?.contacts);

        if (!cancelled) {
          const nextContacts = contacts.length ? contacts : fallbackContacts;
          setAboutData({ contacts: nextContacts });
        }
      } catch (error) {
        if (!cancelled) {
          setAboutData({ contacts: fallbackContacts });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [fallbackContacts]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    const write = async () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    try {
      await write();
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      setCopiedKey(null);
    }
  }, []);

  return (
    <div className={`min-h-[calc(100vh-4rem)] ${themes[theme].background}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} shadow-sm p-6`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${themes[theme].secondary}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                {isEn ? 'About' : '关于我'}
              </h2>
              <div className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                {isEn
                  ? 'Disclaimer, update mechanism, and contact information. A lightweight personal portal.'
                  : '这里是免责声明与联系方式。你可以把它当成一个轻量的个人主页入口。'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} shadow-sm p-6 lg:col-span-2`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              {isEn ? 'Disclaimer' : '免责声明'}
            </h3>
            <div className={`mt-3 text-sm ${themes[theme].text} opacity-85 leading-relaxed`}>
              {isEn
                ? 'The contents of this site are solely for personal record, learning, and technical sharing. They do not constitute any investment advice, financial endorsement, or return guarantee. Markets carry risks; invest with caution.'
                : '本页面内容仅用于学习交流与记录，不构成任何投资建议、投资承诺或收益保证。市场有风险，投资需谨慎。'}
            </div>
          </div>

          {isCloudflareEnv && (
            <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} shadow-sm p-6 lg:col-span-2`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  {isEn ? 'Data Sync Mechanism' : '数据更新机制'}
                </h3>
              </div>
              <div className={`mt-3 text-sm ${themes[theme].text} opacity-85 leading-relaxed`}>
                {isEn ? (
                  <>
                    Statically hosted on Cloudflare's global edge network. All portfolio equity curves, holdings, and returns are <strong>daily closing snapshots (automatically updated after trading hours)</strong> without real-time intraday tick streaming.
                  </>
                ) : (
                  <>
                    本站由 Cloudflare 全球边缘网络进行静态托管，所有投资组合净值走势、持仓标的与收益率数据均为<strong>每日收盘后的静态快照（交易日盘后自动更新）</strong>，不提供盘中实时逐笔行情推送。
                  </>
                )}
              </div>
            </div>
          )}

          <div className={`${themes[theme].card} rounded-xl border ${themes[theme].border} shadow-sm p-6 lg:col-span-2`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              {isEn ? 'Contact Information' : '联系方式'}
            </h3>

            <div className="mt-4 space-y-3">
              {aboutData.contacts.map((c) => {
                const Icon = c.icon;
                const canCopy = Boolean(c.copyText);
                const isCopied = copiedKey === c.key;
                const valueEl = c.href ? (
                  <InternalLink
                    to={c.href}
                    className={`text-sm ${themes[theme].text} underline underline-offset-2 opacity-90 hover:opacity-100`}
                    title={c.value}
                    openInNewTab={c.href.startsWith('http')}
                  >
                    {c.value}
                  </InternalLink>
                ) : (
                  <span className={`text-sm ${themes[theme].text} opacity-90`}>{c.value}</span>
                );

                return (
                  <div
                    key={c.key}
                    className={`flex items-center justify-between gap-3 rounded-lg border ${themes[theme].border} p-3`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${themes[theme].secondary}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs ${themes[theme].text} opacity-60`}>{c.label}</div>
                        <div className="truncate">{valueEl}</div>
                      </div>
                    </div>

                    {canCopy ? (
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(c.copyText || '', c.key)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${themes[theme].secondary}`}
                        title={isEn ? 'Copy' : '复制'}
                      >
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {isCopied ? (isEn ? 'Copied' : '已复制') : (isEn ? 'Copy' : '复制')}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
