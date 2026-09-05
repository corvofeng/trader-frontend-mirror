import React, { useState, useEffect } from 'react';
import { X, Save, PlusCircle, Calendar, DollarSign, Tag, User, FileText, Hash, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { cashFlowService } from '../../../lib/services';
import type { CashFlowItem, CreateCashFlowPayload, UpdateCashFlowPayload } from '../../../lib/services/types';

interface CashFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  theme: Theme;
  accountAlias: string;
  initialData?: CashFlowItem | null;
}

export function CashFlowModal({
  isOpen,
  onClose,
  onSuccess,
  theme,
  accountAlias,
  initialData
}: CashFlowModalProps) {
  const isEdit = !!initialData;

  const [flowDate, setFlowDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [flowType, setFlowType] = useState<'deposit' | 'withdraw' | string>('deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const [benefitNote, setBenefitNote] = useState('');
  const [externalId, setExternalId] = useState('');
  const [source, setSource] = useState('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFlowDate(initialData.flow_date ? initialData.flow_date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
      setFlowType(initialData.flow_type || 'deposit');
      setAmount(initialData.amount != null ? String(Math.abs(parseFloat(String(initialData.amount)) || 0) || '') : '');
      setCurrency(initialData.currency || 'CNY');
      setCounterparty(initialData.counterparty || '');
      setDescription(initialData.description || '');
      setBenefitNote(initialData.benefit_note || '');
      setExternalId(initialData.external_id || '');
      setSource(initialData.source || 'manual');
    } else {
      setFlowDate(format(new Date(), 'yyyy-MM-dd'));
      setFlowType('deposit');
      setAmount('');
      setCurrency('CNY');
      setCounterparty('');
      setDescription('');
      setBenefitNote('');
      setExternalId('');
      setSource('manual');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountAlias) {
      toast.error('未指定账户别名');
      return;
    }

    const trimmedAmount = amount.trim();
    if (!trimmedAmount || isNaN(Number(trimmedAmount)) || Number(trimmedAmount) <= 0) {
      toast.error('请输入有效的金额 (大于 0)');
      return;
    }

    if (!flowDate) {
      toast.error('请选择流水日期');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && initialData) {
        const payload: UpdateCashFlowPayload = {
          flow_date: flowDate,
          flow_type: flowType,
          amount: trimmedAmount,
          currency: currency.trim() || 'CNY',
          counterparty: counterparty.trim() || null,
          description: description.trim() || null,
          benefit_note: benefitNote.trim() || null,
          external_id: externalId.trim() || null,
          source: source.trim() || 'manual'
        };
        const { error } = await cashFlowService.updateCashFlow(accountAlias, initialData.id, payload);
        if (error) throw error;
        toast.success('现金流水更新成功');
      } else {
        const payload: CreateCashFlowPayload = {
          flow_date: flowDate,
          flow_type: flowType,
          amount: trimmedAmount,
          currency: currency.trim() || 'CNY',
          counterparty: counterparty.trim() || null,
          description: description.trim() || null,
          benefit_note: benefitNote.trim() || null,
          external_id: externalId.trim() || null,
          source: source.trim() || 'manual'
        };
        const { error } = await cashFlowService.createCashFlow(accountAlias, payload);
        if (error) throw error;
        toast.success('现金流水创建成功');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving cash flow:', err);
      toast.error(err?.message || '保存现金流水失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className={`${themes[theme].card} w-full max-w-xl rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            {isEdit ? (
              <Save className="w-5 h-5 text-blue-500" />
            ) : (
              <PlusCircle className="w-5 h-5 text-emerald-500" />
            )}
            <h3 className={`text-lg font-bold ${themes[theme].text}`}>
              {isEdit ? '编辑现金流水' : '新增现金流水'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono">
              {accountAlias}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Flow Type Toggle & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                流水类型 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFlowType('deposit')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                    flowType === 'deposit'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  入金 (Deposit)
                </button>
                <button
                  type="button"
                  onClick={() => setFlowType('withdraw')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                    flowType === 'withdraw'
                      ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                      : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  出金 (Withdraw)
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                流水日期 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  required
                  value={flowDate}
                  onChange={(e) => setFlowDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                金额 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                币种
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="CNY">CNY (人民币)</option>
                <option value="USD">USD (美元)</option>
                <option value="HKD">HKD (港币)</option>
              </select>
            </div>
          </div>

          {/* Counterparty & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                交易对手方 (Counterparty)
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="如：张春秋、国金证券"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
                来源 (Source)
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="默认 manual"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* External ID */}
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
              外部流水号 / 单号 (External ID)
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="例如: family-gift-20260408-01"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
              描述 (Description)
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="例如: 手动入金、银证转账出金"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Benefit Note */}
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${themes[theme].text} opacity-80`}>
              权益说明 / 备注 (Benefit Note)
            </label>
            <div className="relative">
              <Bookmark className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <textarea
                rows={2}
                placeholder="例如: 发了很多皮肤haha、充实保证金"
                value={benefitNote}
                onChange={(e) => setBenefitNote(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${themes[theme].secondary} transition-colors`}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-sm font-medium rounded-lg ${themes[theme].primary} flex items-center gap-2 transition-all disabled:opacity-50`}
            >
              {isSubmitting ? (
                <span>保存中...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isEdit ? '更新' : '创建'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
