import React, { useEffect, useMemo, useState } from 'react';
import { logger } from '../../../shared/utils/logger';
import { Save, Layers, Filter, CheckSquare, Square } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { formatCurrency } from '../../../shared/utils/format';
import { optionsService, authService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPortfolioData, OptionsPosition } from '../../../lib/services/types';
import toast from 'react-hot-toast';
import { onAddLegToStrategy } from '../events/strategySelection';

interface HoldingsStrategyBuilderProps {
  theme: Theme;
  onStrategyCreated?: (strategy: CustomOptionsStrategy) => void;
}

const DEMO_USER_ID = 'mock-user-id';

export function HoldingsStrategyBuilder({ theme, onStrategyCreated }: HoldingsStrategyBuilderProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [strategyName, setStrategyName] = useState('从持仓构建的策略');
  const [strategyDescription, setStrategyDescription] = useState('基于当前持仓选择的腿部组合');
  const [strategyCategory, setStrategyCategory] = useState<'bullish' | 'bearish' | 'neutral' | 'volatility'>('neutral');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');

  // 选择状态：positionId -> 选择数量
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { currencyConfig } = useCurrency();

  const allPositions: OptionsPosition[] = useMemo(() => {
    if (!portfolioData) return [];
    if (portfolioData.expiryBuckets && portfolioData.expiryBuckets.length > 0) {
      return portfolioData.expiryBuckets.flatMap(b => b.single);
    }
    return [];
  }, [portfolioData]);

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        setIsLoading(true);
        setError(null);
        let userId = DEMO_USER_ID;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || DEMO_USER_ID;
        } catch {
          // ignore, fallback to demo id
        }
        const { data, error } = await optionsService.getOptionsPortfolio(userId);
        if (error) throw error;
        setPortfolioData(data);
      } catch (e) {
        console.error(e);
        setError('获取期权持仓失败');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPortfolio();
  }, []);

  // Subscribe to external "add leg" events from OptionsPortfolio
  useEffect(() => {
    const unsubscribe = onAddLegToStrategy(({ positionId, quantity }) => {
      // Find the position in current list
      const pos = allPositions.find(p => p.id === positionId);
  if (!pos) {
    logger.debug('[HoldingsStrategyBuilder] Guard: pos not found');
    return;
  }
      // Toggle select on if not already selected
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.add(positionId);
        return next;
      });
      setSelectedQuantities(prev => ({
        ...prev,
        [positionId]: Math.max(1, Math.min(quantity ?? 1, pos.quantity))
      }));
      toast.success('已加入策略构建器');
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPositions]);

  const toggleSelect = (pos: OptionsPosition) => {
    const next = new Set(selectedIds);
    if (next.has(pos.id)) {
      next.delete(pos.id);
    } else {
      next.add(pos.id);
      if (!selectedQuantities[pos.id]) {
        setSelectedQuantities(prev => ({ ...prev, [pos.id]: 1 }));
      }
    }
    setSelectedIds(next);
  };

  const updateQuantity = (pos: OptionsPosition, qty: number) => {
    const bounded = Math.max(0, Math.min(qty, pos.quantity));
    setSelectedQuantities(prev => ({ ...prev, [pos.id]: bounded }));
    if (bounded > 0) {
      setSelectedIds(prev => new Set(prev).add(pos.id));
    }
  };

  const selectAll = () => {
    const nextIds = new Set<string>();
    const nextQty: Record<string, number> = {};
    allPositions.forEach(p => {
      nextIds.add(p.id);
      nextQty[p.id] = p.quantity;
    });
    setSelectedIds(nextIds);
    setSelectedQuantities(nextQty);
  };

  const clearAll = () => {
    setSelectedIds(new Set());
    setSelectedQuantities({});
  };

  const selectedPositions: OptionsPosition[] = useMemo(() => {
    const map = new Map(allPositions.map(p => [p.id, p] as const));
    return Array.from(selectedIds).map(id => map.get(id)!).filter(Boolean);
  }, [selectedIds, allPositions]);

  const summary = useMemo(() => {
    const cost = selectedPositions.reduce((sum, p) => {
      const qty = selectedQuantities[p.id] || 0;
      const legCost = p.premium * qty * 100 * (p.position_type === 'buy' ? 1 : -1);
      return sum + legCost;
    }, 0);
    const value = selectedPositions.reduce((sum, p) => {
      const qty = selectedQuantities[p.id] || 0;
      return sum + (p.currentValue * qty * 100);
    }, 0);
    const pl = value - Math.abs(cost);
    const costAbs = Math.abs(cost);
    const plPct = costAbs > 0 ? (pl / costAbs) * 100 : 0;
    return { cost, value, pl, plPct };
  }, [selectedPositions, selectedQuantities]);

  const handleSave = async () => {
    if (!strategyName.trim()) {
      toast.error('请输入策略名称');
      return;
    }
    if (selectedPositions.length === 0) {
      toast.error('请至少选择一个持仓作为腿部');
      return;
    }

    setSaving(true);
    try {
      const positions: OptionsPosition[] = selectedPositions.map(p => ({
        ...p,
        selectedQuantity: Math.max(0, Math.min(selectedQuantities[p.id] || 0, p.quantity)),
        // 重新按选择数量估算策略内的盈亏指标（不覆盖原始 quantity）
        profitLoss: (p.currentValue - p.premium) * (selectedQuantities[p.id] || 0) * 100,
        profitLossPercentage: p.premium > 0 ? ((p.currentValue - p.premium) / p.premium) * 100 : 0,
        strategy: strategyName,
      }));

      // 提取用户ID
      let userId = DEMO_USER_ID;
      try {
        const authRes = await authService.getUser();
        const user = authRes?.data?.user;
        userId = user?.id || DEMO_USER_ID;
      } catch {
        // ignore
      }

      const payload: Omit<CustomOptionsStrategy, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        name: strategyName,
        description: strategyDescription,
        positions,
        strategyCategory,
        riskLevel,
        isPresetStrategy: false,
      };

      const { data, error } = await optionsService.saveCustomStrategy(payload);
      if (error) throw error;
      toast.success('策略保存成功！');
      if (data) onStrategyCreated?.(data);
      // 重置选择但保留名称，方便连续保存
      setSelectedIds(new Set());
      setSelectedQuantities({});
    } catch (e) {
      console.error(e);
      toast.error('保存策略失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className={`w-5 h-5 ${themes[theme].text}`} />
          <h3 className={`text-lg font-semibold ${themes[theme].text}`}>从持仓构建策略</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">全选</button>
          <button onClick={clearAll} className={`px-3 py-1 text-sm rounded ${themes[theme].card} ${themes[theme].text}`}>清空</button>
        </div>
      </div>

      {/* 表单设置 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>策略名称</label>
          <input
            type="text"
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            className={`w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
            placeholder="例如：持仓组合 A"
          />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>策略分类</label>
          <select
            value={strategyCategory}
            onChange={(e) => setStrategyCategory(e.target.value as typeof strategyCategory)}
            className={`w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="bullish">看涨</option>
            <option value="bearish">看跌</option>
            <option value="neutral">中性</option>
            <option value="volatility">波动率</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>策略描述</label>
          <input
            type="text"
            value={strategyDescription}
            onChange={(e) => setStrategyDescription(e.target.value)}
            className={`w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
            placeholder="为策略添加备注说明"
          />
        </div>
        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>风险等级</label>
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
            className={`w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="low">低风险</option>
            <option value="medium">中风险</option>
            <option value="high">高风险</option>
          </select>
        </div>
      </div>

      {/* 列表区 */}
      {isLoading && (
        <div className="py-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className={`${themes[theme].text} opacity-80`}>加载持仓中...</p>
        </div>
      )}

      {error && (
        <div className={`p-3 rounded border ${themes[theme].border} mb-3`}>
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-2 mb-4">
          {allPositions.length === 0 && (
            <div className={`${themes[theme].card} p-4 rounded text-center ${themes[theme].text} opacity-75`}>
              暂无期权持仓可用于构建策略
            </div>
          )}
          {allPositions.map((pos) => {
            const checked = selectedIds.has(pos.id);
            const qty = selectedQuantities[pos.id] || 0;
            return (
              <div key={pos.id} className={`${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSelect(pos)}
                    className="flex items-center gap-2"
                    aria-label={checked ? '取消选择' : '选择'}
                  >
                    {checked ? (
                      <CheckSquare className={`w-5 h-5 ${themes[theme].text}`} />
                    ) : (
                      <Square className={`w-5 h-5 ${themes[theme].text}`} />
                    )}
                    <span className={`font-medium ${themes[theme].text}`}>
                      {pos.symbol} | {pos.position_type === 'buy' ? '买入' : '卖出'} {pos.type.toUpperCase()} {pos.strike}
                    </span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="hidden md:block text-sm">
                      <span className={`${themes[theme].text} opacity-70`}>到期: </span>
                      <span className={`${themes[theme].text}`}>{pos.expiry}</span>
                    </div>
                    <div className="hidden md:block text-sm">
                      <span className={`${themes[theme].text} opacity-70`}>可用: </span>
                      <span className={`${themes[theme].text}`}>{pos.quantity} 手</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${themes[theme].text} opacity-75`}>选择数量</span>
                      <input
                        type="number"
                        min={0}
                        max={pos.quantity}
                        value={qty}
                        onChange={(e) => updateQuantity(pos, parseInt(e.target.value) || 0)}
                        className={`w-24 px-2 py-1 rounded ${themes[theme].input} ${themes[theme].text}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                  <div>
                    <span className={`${themes[theme].text} opacity-70`}>权利金: </span>
                    <span className={`${themes[theme].text}`}>{formatCurrency(pos.premium, currencyConfig)}/手</span>
                  </div>
                  <div>
                    <span className={`${themes[theme].text} opacity-70`}>现值: </span>
                    <span className={`${themes[theme].text}`}>{formatCurrency(pos.currentValue, currencyConfig)}/手</span>
                  </div>
                  <div>
                    <span className={`${themes[theme].text} opacity-70`}>方向: </span>
                    <span className={`${themes[theme].text}`}>{pos.position_type === 'buy' ? '做多' : '做空'} {pos.type.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className={`${themes[theme].text} opacity-70`}>小计(选择): </span>
                    <span className={`${themes[theme].text}`}>
                      {formatCurrency(pos.currentValue * (selectedQuantities[pos.id] || 0) * 100, currencyConfig)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 摘要与保存 */}
      <div className={`${themes[theme].card} rounded p-3 border ${themes[theme].border} flex flex-col md:flex-row md:items-center md:justify-between gap-3`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className={`${themes[theme].text} opacity-70`}>总成本: </span>
            <span className={`${summary.cost >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(summary.cost), currencyConfig)}
              <span className="text-xs ml-1">({summary.cost >= 0 ? '净支出' : '净收入'})</span>
            </span>
          </div>
          <div>
            <span className={`${themes[theme].text} opacity-70`}>当前价值: </span>
            <span className={`${themes[theme].text}`}>{formatCurrency(summary.value, currencyConfig)}</span>
          </div>
          <div>
            <span className={`${themes[theme].text} opacity-70`}>盈亏: </span>
            <span className={`${summary.pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.pl >= 0 ? '+' : ''}{formatCurrency(summary.pl, currencyConfig)}
            </span>
          </div>
          <div>
            <span className={`${themes[theme].text} opacity-70`}>盈亏比: </span>
            <span className={`${themes[theme].text}`}>{summary.plPct.toFixed(2)}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || selectedPositions.length === 0}
            className={`px-4 py-2 rounded text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            <Save className="w-4 h-4" /> 保存策略
          </button>
        </div>
      </div>
    </div>
  );
}

export default HoldingsStrategyBuilder;