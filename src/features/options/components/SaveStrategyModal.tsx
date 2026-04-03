import { Theme, themes } from '../../../lib/theme';
import type { OptionsPosition } from '../../../lib/services/types';

type StrategyCategory = 'bullish' | 'bearish' | 'neutral' | 'volatility';

interface InferredResult {
  nameZh: string;
  category: StrategyCategory;
  confidence: number;
}

interface SaveStrategyModalProps {
  theme: Theme;
  isOpen: boolean;
  modalExpiry: string | null;
  positions: OptionsPosition[];
  selectedLegs: Record<string, number>;
  setPositionSelected: (positionId: string, checked: boolean) => void;
  updateSelectedQuantity: (positionId: string, qty: number) => void;
  name: string;
  setName: (value: string) => void;
  category: StrategyCategory;
  setCategory: (value: StrategyCategory) => void;
  description: string;
  setDescription: (value: string) => void;
  inferStrategyFromLegs: (legs: OptionsPosition[]) => InferredResult | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SaveStrategyModal({
  theme,
  isOpen,
  modalExpiry,
  positions,
  selectedLegs,
  setPositionSelected,
  updateSelectedQuantity,
  name,
  setName,
  category,
  setCategory,
  description,
  setDescription,
  inferStrategyFromLegs,
  isSaving,
  onCancel,
  onConfirm
}: SaveStrategyModalProps) {
  if (!isOpen) return null;
  const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
  const currentPositions = positions.filter(p => selectedIds.includes(p.id));
  const inferred = inferStrategyFromLegs(currentPositions);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className={`${themes[theme].card} relative z-10 w-full max-w-4xl rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto`}>
        <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
          确认保存组合{modalExpiry ? `（${modalExpiry}）` : ''}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-sm ${themes[theme].text} opacity-75`}>策略名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                placeholder="请输入策略名称"
              />
            </div>
            <div>
              <label className={`text-sm ${themes[theme].text} opacity-75`}>组合类型</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as StrategyCategory)}
                className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="neutral">中性</option>
                <option value="bullish">看涨</option>
                <option value="bearish">看跌</option>
                <option value="volatility">波动率</option>
              </select>
            </div>
          </div>
          <div className="border rounded p-4">
            <div className={`text-sm font-medium ${themes[theme].text} mb-3`}>组合预览与编辑</div>
            <div className="max-h-[50vh] overflow-auto space-y-3">
              {positions.map(p => {
                const checked = !!selectedLegs[p.id] && selectedLegs[p.id] > 0;
                const qty = selectedLegs[p.id] || 0;
                return (
                  <div key={`${p.id ?? 'noid'}-${p.symbol}-${p.strike}-${p.type}-${p.expiry}`} className={`flex items-center justify-between text-sm gap-4 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 ${checked ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                    <label className={`flex items-center gap-3 ${themes[theme].text} flex-1 cursor-pointer`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setPositionSelected(p.id, e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="font-medium">
                        {p.symbol} {p.expiry} {p.type === 'call' ? '看涨' : p.type === 'put' ? '看跌' : p.strategy} {p.position_type === 'buy' ? '买入' : '卖出'} @ {p.strike}
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className={`${themes[theme].text} opacity-70`}>数量</span>
                      <input
                        type="number"
                        min={1}
                        max={p.quantity}
                        value={checked ? qty : 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          const clamped = Math.max(checked ? 1 : 0, Math.min(val, p.quantity));
                          updateSelectedQuantity(p.id, clamped);
                        }}
                        className={`w-24 px-3 py-1.5 rounded ${themes[theme].input} ${themes[theme].text}`}
                        disabled={!checked}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 text-sm font-medium ${themes[theme].text} bg-gray-100 dark:bg-gray-800 p-2 rounded`}>
              初步识别：{inferred ? `${inferred.nameZh}（置信度 ${Math.round(inferred.confidence*100)}%）` : '无法识别'}
            </div>
          </div>
          <div>
            <label className={`text-sm ${themes[theme].text} opacity-75`}>描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
              rows={3}
              placeholder="可选，添加组合描述"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`px-3 py-2 rounded ${themes[theme].secondary}`}
            disabled={isSaving}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : '确认保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
