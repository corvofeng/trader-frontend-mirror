import { createPortal } from 'react-dom';
import { X, Check, RotateCcw, SlidersHorizontal, Info } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import {
  TBoardColumnKey,
  ALL_TBOARD_COLUMNS,
  DEFAULT_PORTFOLIO_COLUMNS,
  DEFAULT_QUOTE_COLUMNS,
  FULL_ANALYTICS_COLUMNS,
} from '../types/tboard';

interface TBoardColumnSettingsModalProps {
  theme: Theme;
  isOpen: boolean;
  onClose: () => void;
  activeColumns: TBoardColumnKey[];
  onChangeColumns: (columns: TBoardColumnKey[]) => void;
  defaultPreset?: 'portfolio' | 'quote';
}

export function TBoardColumnSettingsModal({
  theme,
  isOpen,
  onClose,
  activeColumns,
  onChangeColumns,
  defaultPreset = 'quote',
}: TBoardColumnSettingsModalProps) {
  if (!isOpen) return null;

  const quoteCols = ALL_TBOARD_COLUMNS.filter(c => c.category === 'quote');
  const positionCols = ALL_TBOARD_COLUMNS.filter(c => c.category === 'position');
  const greekCols = ALL_TBOARD_COLUMNS.filter(c => c.category === 'greek');

  const toggleColumn = (key: TBoardColumnKey) => {
    if (activeColumns.includes(key)) {
      if (activeColumns.length <= 1) return; // 至少保留一列
      onChangeColumns(activeColumns.filter(k => k !== key));
    } else {
      // 保持合理的排序：将新列插入到 ALL_TBOARD_COLUMNS 中的对应相对位置
      const nextCols = ALL_TBOARD_COLUMNS.map(c => c.key).filter(
        k => activeColumns.includes(k) || k === key
      );
      onChangeColumns(nextCols);
    }
  };

  const handleSelectPreset = (cols: TBoardColumnKey[]) => {
    onChangeColumns(cols);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${themes[theme].card} ${themes[theme].border} animate-in fade-in zoom-in-95 duration-150`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tboard-col-modal-title"
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 sm:px-5 py-3.5 border-b ${themes[theme].border}`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 id="tboard-col-modal-title" className={`text-base font-bold ${themes[theme].text}`}>
                自定义 T 型报价展示列
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                按需配置期权两侧展示的属性列（左右对称镜像）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* Presets */}
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-2">
              常用预设推荐
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset(DEFAULT_QUOTE_COLUMNS)}
                className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all text-center flex flex-col items-center gap-1 ${
                  JSON.stringify(activeColumns) === JSON.stringify(DEFAULT_QUOTE_COLUMNS)
                    ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                    : `${themes[theme].secondary} ${themes[theme].border} hover:border-blue-400/50`
                }`}
              >
                <span>📊 行情报价</span>
                <span className="text-[10px] opacity-75 font-normal">OI/成交量/IV/现价</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset(DEFAULT_PORTFOLIO_COLUMNS)}
                className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all text-center flex flex-col items-center gap-1 ${
                  JSON.stringify(activeColumns) === JSON.stringify(DEFAULT_PORTFOLIO_COLUMNS)
                    ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                    : `${themes[theme].secondary} ${themes[theme].border} hover:border-blue-400/50`
                }`}
              >
                <span>💼 持仓管理</span>
                <span className="text-[10px] opacity-75 font-normal">权利/义务/备兑/组合</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset(FULL_ANALYTICS_COLUMNS)}
                className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all text-center flex flex-col items-center gap-1 ${
                  JSON.stringify(activeColumns) === JSON.stringify(FULL_ANALYTICS_COLUMNS)
                    ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                    : `${themes[theme].secondary} ${themes[theme].border} hover:border-blue-400/50`
                }`}
              >
                <span>🔬 深度分析</span>
                <span className="text-[10px] opacity-75 font-normal">含 Delta/Gamma 等</span>
              </button>
            </div>
          </div>

          {/* Group 1: Quote attributes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${themes[theme].text}`}>
                📈 期权行情与度量属性
              </span>
              <span className="text-[11px] text-gray-500 dark:text-zinc-400">
                关注合约价格、流动性与价值
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quoteCols.map(col => {
                const isChecked = activeColumns.includes(col.key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-300'
                        : `${themes[theme].card} ${themes[theme].border} opacity-70 hover:opacity-100`
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                        isChecked ? 'bg-blue-600 border-blue-600 text-white' : themes[theme].border
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs leading-snug ${themes[theme].text}`}>
                        {col.label}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-zinc-400 truncate mt-0.5" title={col.description}>
                        {col.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group 2: Greeks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${themes[theme].text}`}>
                🧮 希腊字母敏感度 (Greeks)
              </span>
              <span className="text-[11px] text-gray-500 dark:text-zinc-400">
                量化风险度量
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {greekCols.map(col => {
                const isChecked = activeColumns.includes(col.key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-300'
                        : `${themes[theme].card} ${themes[theme].border} opacity-70 hover:opacity-100`
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                        isChecked ? 'bg-purple-600 border-purple-600 text-white' : themes[theme].border
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs leading-snug ${themes[theme].text}`}>
                        {col.label}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-zinc-400 truncate mt-0.5" title={col.description}>
                        {col.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group 3: Portfolio positions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${themes[theme].text}`}>
                💼 账户持仓与保证金属性
              </span>
              <span className="text-[11px] text-gray-500 dark:text-zinc-400">
                持仓张数与风险保证金
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {positionCols.map(col => {
                const isChecked = activeColumns.includes(col.key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                        : `${themes[theme].card} ${themes[theme].border} opacity-70 hover:opacity-100`
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                        isChecked ? 'bg-amber-600 border-amber-600 text-white' : themes[theme].border
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs leading-snug ${themes[theme].text}`}>
                        {col.label}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-zinc-400 truncate mt-0.5" title={col.description}>
                        {col.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-4 sm:px-5 py-3 border-t ${themes[theme].border} bg-black/[0.02] dark:bg-white/[0.02]`}>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
            <Info className="w-3.5 h-3.5" />
            <span>单侧已选 <b>{activeColumns.length}</b> 列（自动镜像对称）</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectPreset(defaultPreset === 'portfolio' ? DEFAULT_PORTFOLIO_COLUMNS : DEFAULT_QUOTE_COLUMNS)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium btn-tactile ${themes[theme].secondary} ${themes[theme].border}`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置预设</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
