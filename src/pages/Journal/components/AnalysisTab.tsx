import React, { useEffect, useState } from 'react';
import { themes, Theme } from '../../../lib/theme';
import type { AccountPrompt } from '../../../lib/services/types';
import { accountService, accountPromptService } from '../../../lib/services';
import { RelatedLinks } from '../../../shared/components';
import toast from 'react-hot-toast';

interface AnalysisTabProps {
  theme: Theme;
  portfolioUuid: string | null;
  userId?: string;
  selectedAccountId?: string | null;
  activeTab: string;
}

export function AnalysisTab({
  theme,
  portfolioUuid,
  userId,
  selectedAccountId,
  activeTab
}: AnalysisTabProps) {
  const isSharedView = !!portfolioUuid;

  const [accountAlias, setAccountAlias] = useState<string>('');
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<AccountPrompt[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [editPromptId, setEditPromptId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'stock_analysis' | 'option_analysis'>('stock_analysis');
  const [formContent, setFormContent] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewHasCustom, setPreviewHasCustom] = useState<boolean | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const loadPromptsForAccount = async (targetAccountAlias: string) => {
    try {
      setPromptLoading(true);
      const { data, error } = await accountPromptService.listPrompts(targetAccountAlias);
      if (error) {
        throw error;
      }
      setPrompts(data || []);
    } catch (error) {
      console.error('Error loading prompts:', error);
      setPrompts([]);
      toast.error('获取 Prompt 列表失败');
    } finally {
      setPromptLoading(false);
    }
  };

  useEffect(() => {
    const loadAccountAndPrompts = async () => {
      if (activeTab !== 'analysis' || isSharedView) {
        return;
      }
      if (!userId || !selectedAccountId) {
        setAccountAlias('');
        setAccountLabel(null);
        setPrompts([]);
        return;
      }
      try {
        setAccountsLoading(true);
        const { data: accounts } = await accountService.getAccounts(userId);
        if (!accounts) {
          setAccountAlias('');
          setAccountLabel(null);
          setPrompts([]);
          return;
        }
        const currentAccount = accounts.find(
          (acc) => acc.alias === selectedAccountId || acc.id === selectedAccountId
        ) || null;
        if (!currentAccount) {
          setAccountAlias('');
          setAccountLabel(null);
          setPrompts([]);
          return;
        }
        const label = currentAccount.alias || currentAccount.name || currentAccount.account_no || null;
        setAccountLabel(label);
        const targetAccountAlias = currentAccount.alias || selectedAccountId || '';
        if (!targetAccountAlias) {
          setAccountAlias('');
          setPrompts([]);
          return;
        }
        setAccountAlias(targetAccountAlias);
        await loadPromptsForAccount(targetAccountAlias);
      } catch (error) {
        console.error('Error loading account or prompts:', error);
        setAccountAlias('');
        setAccountLabel(null);
        setPrompts([]);
        toast.error('获取账户或 Prompt 信息失败');
      } finally {
        setAccountsLoading(false);
      }
    };
    loadAccountAndPrompts();
  }, [activeTab, isSharedView, userId, selectedAccountId]);

  const startCreatePrompt = () => {
    setEditPromptId(null);
    setFormName('');
    setFormType('stock_analysis');
    setFormContent('');
    setFormActive(true);
  };

  const startEditPrompt = async (prompt: AccountPrompt) => {
    try {
      setPromptLoading(true);
      const { data, error } = await accountPromptService.getPrompt(prompt.id);
      if (error) {
        throw error;
      }
      const full = data || prompt;
      setEditPromptId(full.id);
      setFormName(full.prompt_name);
      setFormType(full.prompt_type);
      setFormContent(full.prompt_content || '');
      setFormActive(full.is_active === 1);
    } catch (error) {
      console.error('Error loading prompt detail:', error);
      toast.error('获取 Prompt 详情失败');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!formName.trim()) {
      toast.error('Prompt 名称不能为空');
      return;
    }
    if (!accountAlias) {
      toast.error('当前账户缺少 alias，无法保存 Prompt');
      return;
    }
    if (!formContent.trim()) {
      toast.error('Prompt 内容不能为空');
      return;
    }
    try {
      setSaving(true);
      if (editPromptId) {
        const { error } = await accountPromptService.updatePrompt(editPromptId, {
          prompt_name: formName,
          prompt_content: formContent,
          prompt_type: formType,
          is_active: formActive ? 1 : 0
        });
        if (error) {
          throw error;
        }
        toast.success('Prompt 已更新');
      } else {
        const { error } = await accountPromptService.createPrompt({
          account_alias: accountAlias,
          prompt_name: formName,
          prompt_content: formContent,
          prompt_type: formType,
          is_active: formActive ? 1 : 0
        });
        if (error) {
          throw error;
        }
        toast.success('Prompt 已创建');
      }
      await loadPromptsForAccount(accountAlias);
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast.error('保存 Prompt 失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrompt = async (prompt: AccountPrompt) => {
    if (!window.confirm(`确认删除 Prompt「${prompt.prompt_name}」吗？`)) {
      return;
    }
    try {
      setSaving(true);
      const { error } = await accountPromptService.deletePrompt(prompt.id);
      if (error) {
        throw error;
      }
      toast.success('Prompt 已删除');
      if (accountAlias) {
        await loadPromptsForAccount(accountAlias);
      }
      if (editPromptId === prompt.id) {
        startCreatePrompt();
      }
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast.error('删除 Prompt 失败');
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePrompt = async (prompt: AccountPrompt) => {
    try {
      setSaving(true);
      const { error } = await accountPromptService.activatePrompt(prompt.id);
      if (error) {
        throw error;
      }
      toast.success('Prompt 已激活');
      if (accountAlias) {
        await loadPromptsForAccount(accountAlias);
      }
    } catch (error) {
      console.error('Error activating prompt:', error);
      toast.error('激活 Prompt 失败');
    } finally {
      setSaving(false);
    }
  };

  const renderPreviewMarkdown = (raw: string) => {
    const content = raw.trim().replace(/\n{3,}/g, '\n\n');
    const lines = content.split(/\r?\n/);
    let html = '';
    let paragraph = '';
    let inList = false;
    let listTag: 'ul' | 'ol' | null = null;

    const flushParagraph = () => {
      const text = paragraph.trim();
      if (text) {
        const formatted = text
          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
        html += `<p class="mb-2 leading-relaxed text-sm ${themes[theme].text}">${formatted}</p>`;
      }
      paragraph = '';
    };

    const closeList = () => {
      if (inList && listTag) {
        html += `</${listTag}>`;
        inList = false;
        listTag = null;
      }
    };

    for (const line of lines) {
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushParagraph();
        closeList();
        html += '<hr class="my-3 border-t border-gray-300 dark:border-gray-600" />';
        continue;
      }

      const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
      if (headingMatch) {
        flushParagraph();
        closeList();
        const level = headingMatch[1].length;
        const text = headingMatch[2]
          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
        const common = `leading-tight whitespace-normal ${themes[theme].text}`;
        if (level === 1) html += `<h1 class="text-lg font-semibold mt-3 mb-2 ${common}">${text}</h1>`;
        else if (level === 2) html += `<h2 class="text-base font-semibold mt-3 mb-2 ${common}">${text}</h2>`;
        else if (level === 3) html += `<h3 class="text-sm font-semibold mt-2 mb-1 ${common}">${text}</h3>`;
        else html += `<h4 class="text-xs font-medium mt-2 mb-1 ${common}">${text}</h4>`;
        continue;
      }

      const unorderedMatch = /^\s{0,4}[-*]\s+(.*)$/.exec(line);
      const orderedMatch = /^\s{0,4}\d+\.\s+(.*)$/.exec(line);
      if (unorderedMatch || orderedMatch) {
        flushParagraph();

        const isOrdered = !!orderedMatch;
        const tag: 'ul' | 'ol' = isOrdered ? 'ol' : 'ul';
        const rawItem = (unorderedMatch ? unorderedMatch[1] : orderedMatch![1]) || '';

        if (!inList || listTag !== tag) {
          closeList();
          const listClass = isOrdered ? 'list-decimal' : 'list-disc';
          html += `<${tag} class="ml-4 ${listClass} space-y-1">`;
          inList = true;
          listTag = tag;
        }

        const item = rawItem
          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
          .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

        const indentClass = /^\s{2,}/.test(line) ? 'ml-4' : '';
        html += `<li class="text-sm ${themes[theme].text} ${indentClass}">${item}</li>`;
        continue;
      }

      if (line.trim() === '') {
        flushParagraph();
        closeList();
        continue;
      }

      paragraph += (paragraph ? ' ' : '') + line.trim();
    }

    flushParagraph();
    closeList();
    return html;
  };

  const handlePreviewPrompt = async () => {
    if (!accountAlias) {
      toast.error('当前账户缺少 alias，无法预览 Prompt');
      return;
    }
    try {
      setPreviewLoading(true);
      setPreviewContent(null);
      setPreviewHasCustom(null);
      setPreviewModalOpen(false);
      const { data, error } = await accountPromptService.previewPrompt(accountAlias, formType);
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('预览数据为空');
      }
      setPreviewHasCustom(!!data.has_custom_prompt);
      setPreviewContent(data.prompt || '');
      setPreviewModalOpen(true);
    } catch (error) {
      console.error('Error previewing prompt:', error);
      toast.error('获取 Prompt 预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!previewContent) {
      return;
    }
    try {
      await navigator.clipboard.writeText(previewContent);
      toast.success('已复制合成 Prompt 到剪贴板');
    } catch (error) {
      console.error('Error copying prompt to clipboard:', error);
      toast.error('复制失败，请手动选择文本复制');
    }
  };

  const sharedViewContent = (
    <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
      <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Performance Analysis</h2>
      <p className={`${themes[theme].text} opacity-70`}>
        Trading performance analysis features coming soon...
      </p>
      <div className="mt-6">
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=analysis" 
          maxItems={3}
        />
      </div>
    </div>
  );

  return (
    <React.Fragment>
      {isSharedView ? (
        sharedViewContent
      ) : (
        <div className="space-y-6">
          <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className={`text-xl sm:text-2xl font-bold ${themes[theme].text}`}>分析 Prompt 管理</h2>
                <p className={`${themes[theme].text} opacity-70 text-sm mt-1`}>
                  为当前账户配置用于投资组合分析的自定义 Prompt。
                </p>
              </div>
              <div className="text-sm text-right">
                {accountsLoading ? (
                  <span className={`${themes[theme].text} opacity-70`}>正在加载账户...</span>
                ) : accountLabel ? (
                  <span className={`${themes[theme].text} opacity-80`}>
                    当前账户：<span className="font-medium">{accountLabel}</span>
                  </span>
                ) : (
                  <span className={`${themes[theme].text} opacity-70`}>
                    请先在 Portfolio 标签页选择一个账户
                  </span>
                )}
              </div>
            </div>

            {(!userId || !selectedAccountId) && (
              <div className="mt-2">
                <p className={`${themes[theme].text} opacity-70 text-sm`}>
                  当前没有选中的账户。请在 Portfolio 标签页选择账户后再管理 Prompt。
                </p>
              </div>
            )}

            {userId && selectedAccountId && accountLabel && (
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-semibold ${themes[theme].text}`}>Prompt 列表</h3>
                    <button
                      type="button"
                      onClick={startCreatePrompt}
                      disabled={saving || promptLoading}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm ${
                        saving || promptLoading
                          ? `opacity-60 cursor-not-allowed ${themes[theme].secondary}`
                          : themes[theme].primary
                      }`}
                    >
                      新建 Prompt
                    </button>
                  </div>
                  <div className={`rounded-md border text-sm ${themes[theme].input}`}>
                    {promptLoading ? (
                      <div className="p-4 text-center">
                        <span className={`${themes[theme].text} opacity-70`}>正在加载 Prompt...</span>
                      </div>
                    ) : prompts.length === 0 ? (
                      <div className="p-4 text-center">
                        <span className={`${themes[theme].text} opacity-70`}>
                          还没有配置 Prompt，点击右上角「新建 Prompt」开始配置。
                        </span>
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {prompts.map((prompt) => (
                          <li key={prompt.id} className="px-3 py-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium truncate ${themes[theme].text}`}>
                                  {prompt.prompt_name}
                                </span>
                                {prompt.is_active === 1 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                    激活中
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs opacity-70">
                                <span className={themes[theme].text}>
                                  类型：{prompt.prompt_type === 'stock_analysis' ? '股票分析' : '期权分析'}
                                </span>
                                <span className={themes[theme].text}>
                                  更新：{new Date(prompt.updated_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditPrompt(prompt)}
                                className={`px-2 py-1 rounded-md text-xs ${themes[theme].secondary}`}
                                disabled={saving || promptLoading}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleActivatePrompt(prompt)}
                                className={`px-2 py-1 rounded-md text-xs ${
                                  prompt.is_active === 1
                                    ? 'opacity-60 cursor-not-allowed ' + themes[theme].secondary
                                    : themes[theme].primary
                                }`}
                                disabled={saving || promptLoading || prompt.is_active === 1}
                              >
                                激活
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePrompt(prompt)}
                                className="px-2 py-1 rounded-md text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={saving || promptLoading}
                              >
                                删除
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className={`text-sm font-semibold mb-3 ${themes[theme].text}`}>
                    {editPromptId ? '编辑 Prompt' : '新建 Prompt'}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <label className={`${themes[theme].text}`}>Prompt 名称</label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-md border ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={`${themes[theme].text}`}>Prompt 类型</label>
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value as 'stock_analysis' | 'option_analysis')}
                        className={`w-full px-2 py-1.5 rounded-md border ${themes[theme].input} ${themes[theme].text}`}
                      >
                        <option value="stock_analysis">股票分析</option>
                        <option value="option_analysis">期权分析</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={`${themes[theme].text}`}>Prompt 内容</label>
                      <textarea
                        value={formContent}
                        onChange={(e) => setFormContent(e.target.value)}
                        rows={8}
                        className={`w-full px-2 py-1.5 rounded-md border resize-y ${themes[theme].input} ${themes[theme].text}`}
                        placeholder="在这里描述你的投资偏好、风险承受能力、仓位控制要求等..."
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className={`flex items-center gap-2 text-xs ${themes[theme].text}`}>
                          <input
                            type="checkbox"
                            checked={formActive}
                            onChange={(e) => setFormActive(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          保存时设为当前账户该类型的激活 Prompt
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handlePreviewPrompt}
                            disabled={previewLoading || !accountAlias}
                            className={`px-3 py-1.5 rounded-md text-xs sm:text-sm ${
                              previewLoading || !accountAlias
                                ? `opacity-60 cursor-not-allowed ${themes[theme].secondary}`
                                : themes[theme].secondary
                            }`}
                          >
                            {previewLoading ? '预览中...' : '预览合成 Prompt'}
                          </button>
                          <button
                            type="button"
                            onClick={handleSavePrompt}
                            disabled={saving || promptLoading}
                            className={`px-4 py-1.5 rounded-md text-xs sm:text-sm ${
                              saving || promptLoading
                                ? `opacity-60 cursor-not-allowed ${themes[theme].secondary}`
                                : themes[theme].primary
                            }`}
                          >
                            {saving ? '保存中...' : '保存 Prompt'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className={`${themes[theme].text} opacity-70 text-xs`}>
                      Prompt 保存后，会在 Portfolio 页的智能分析报告生成时自动生效。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!isSharedView && (
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=analysis" 
          maxItems={3}
        />
      )}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPreviewModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-5xl">
            <div className={`${themes[theme].card} flex flex-col rounded-lg shadow-xl max-h-[80vh]`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div>
                  <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
                    合成 Prompt 预览
                  </h3>
                  <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70`}>
                    当前账户 {accountLabel || accountAlias} · {formType === 'stock_analysis' ? '股票分析' : '期权分析'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {previewHasCustom !== null && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        previewHasCustom
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                      }`}
                    >
                      {previewHasCustom ? '使用自定义 Prompt' : '使用系统默认 Prompt'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm ${themes[theme].secondary}`}
                  >
                    复制全部
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewModalOpen(false)}
                    className="ml-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <span className={`${themes[theme].text}`}>×</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div
                  className={`grid ${
                    previewHasCustom === false ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                  } divide-y md:divide-y-0 ${
                    previewHasCustom === false ? 'md:divide-x' : ''
                  } divide-gray-200 dark:divide-gray-700`}
                >
                  {previewHasCustom === false && (
                    <div className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`text-xs font-semibold ${themes[theme].text}`}>
                          系统默认模板
                        </span>
                      </div>
                      <div
                        className={`${themes[theme].text} text-xs sm:text-sm leading-relaxed space-y-2 break-words`}
                        dangerouslySetInnerHTML={{
                          __html: renderPreviewMarkdown(previewContent || '')
                        }}
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`text-xs font-semibold ${themes[theme].text}`}>
                        合成后的最终 Prompt
                      </span>
                    </div>
                    <div
                      className={`${themes[theme].text} text-xs sm:text-sm leading-relaxed space-y-2 break-words`}
                      dangerouslySetInnerHTML={{
                        __html: renderPreviewMarkdown(previewContent || '')
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
