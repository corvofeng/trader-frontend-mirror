import React, { useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, TrendingUp, TrendingDown, Activity, Shield, Target, BarChart2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Clock,
  Hash,
} from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, authService } from '../../../lib/services';
import { emitAddLegToStrategy } from '../events/strategySelection';
import { logger } from '../../../shared/utils/logger';
import type { OptionsPortfolioData, CustomOptionsStrategy, OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import toast from 'react-hot-toast';
import { ExpiryGroupCard } from './ExpiryGroupCard';

interface OptionsPortfolioProps {
  theme: Theme;
}

type OptionsViewMode = 'expiry' | 'strategy' | 'grouped';

const DEMO_USER_ID = 'mock-user-id';

const getPositionTypeInfo = (positionType: string, optionType: string) => {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';
  
  if (isLong && isCall) {
    return {
      icon: <TrendingUp className="w-3 h-3" />,
      label: '买入看涨',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
      description: '看涨期权买方'
    };
  } else if (isLong && !isCall) {
    return {
      icon: <TrendingDown className="w-3 h-3" />,
      label: '买入看跌',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      description: '看跌期权买方'
    };
  } else if (!isLong && isCall) {
    return {
      icon: <TrendingUp className="w-3 h-3" />,
      label: '卖出看涨',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
      description: '看涨期权卖方'
    };
  } else {
    return {
      icon: <TrendingDown className="w-3 h-3" />,
      label: '卖出看跌',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
      description: '看跌期权卖方'
    };
  }
};

// 扩展OptionsPosition类型以包含策略ID
interface ExtendedOptionsPosition extends OptionsPosition {
  strategy_id?: string;
  is_single_leg?: boolean;
}

const getPositionTypeInfo2 = (positionType: string, optionType: string, positionTypeZh?: string) => {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';

  if (positionTypeZh === '备兑' && !isLong) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '备兑',
      color: 'bg-purple-100 text-purple-800 dark:text-purple-400 dark:bg-purple-900',
      description: '备兑',
      borderColor: 'border-l-purple-500'
    };
  }

  if (isLong && isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权买入标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (isLong && !isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权卖出标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (!isLong && isCall) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
      description: '有义务卖出标的',
      borderColor: 'border-l-orange-500'
    };
  }

  return {
    icon: <Target className="w-3 h-3" />,
    label: '义务方',
    color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
    description: '有义务买入标的',
    borderColor: 'border-l-orange-500'
  };
};

export function OptionsPortfolio({ theme }: OptionsPortfolioProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [customStrategies, setCustomStrategies] = useState<CustomOptionsStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(false);
  const [viewMode, setViewMode] = useState<OptionsViewMode>('expiry');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'profitLoss' | 'symbol'>('expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStrategies, setExpandedStrategies] = useState<string[]>([]);
  // 到期分组选择模式（每个到期日单独开启多选）
  const [expirySelectionMode, setExpirySelectionMode] = useState<Record<string, boolean>>({});
  // 选中的腿及数量（positionId -> quantity）
  const [selectedLegs, setSelectedLegs] = useState<Record<string, number>>({});
  // 保存确认弹窗状态
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [modalExpiry, setModalExpiry] = useState<string | null>(null);
  const [saveStrategyName, setSaveStrategyName] = useState<string>('');
  const [saveStrategyCategory, setSaveStrategyCategory] = useState<'bullish' | 'bearish' | 'neutral' | 'volatility'>('neutral');
  const [saveStrategyDescription, setSaveStrategyDescription] = useState<string>('');
  const [isModalSaving, setIsModalSaving] = useState(false);
  const { currencyConfig } = useCurrency();
  
  // 复杂策略编辑复用“保存确认弹窗”，不使用独立编辑器

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        let userId = DEMO_USER_ID;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || DEMO_USER_ID;
        } catch (error) {
          console.log(error);
        }

        const { data, error } = await optionsService.getOptionsPortfolio(userId);
        if (error) throw error;
        if (data) setPortfolioData(data);
      } catch (error) {
        console.error('Error fetching portfolio data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // 本页面不订阅外部“打开编辑器”事件，保持弹窗一致

  useEffect(() => {
    const fetchCustomStrategies = async () => {
      try {
        setIsLoadingStrategies(true);
        let userId = DEMO_USER_ID;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || DEMO_USER_ID;
        } catch (e) {
          // ignore and fallback
        }
        const { data, error } = await optionsService.getCustomStrategies(userId);
        
        if (error) throw error;
        if (data) {
          setCustomStrategies(data);
        }
      } catch (error) {
        console.error('Error fetching custom strategies:', error);
      } finally {
        setIsLoadingStrategies(false);
      }
    };

    fetchCustomStrategies();
  }, []);

  const toggleStrategyExpansion = (strategyId: string) => {
    setExpandedStrategies(prev => 
      prev.includes(strategyId) 
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  // 开关指定到期日的选择模式
  const toggleExpirySelection = (expiry: string) => {
    setExpirySelectionMode(prev => ({ ...prev, [expiry]: !prev[expiry] }));
  };

  const isSelectingExpiry = (expiry: string) => !!expirySelectionMode[expiry];

  // 根据 positionId 查找持仓，用于判断是否复杂策略
  const findPositionById = (positionId: string): OptionsPosition | undefined => {
    for (const group of portfolioData?.expiryGroups || []) {
      const found = group.positions.find(p => p.id === positionId);
      if (found) return found;
    }
    return undefined;
  };

  const setPositionSelected = (positionId: string, checked: boolean) => {
    setSelectedLegs(prev => {
      const next = { ...prev };
      if (checked) {
        // 若无数量则默认1
        next[positionId] = next[positionId] && next[positionId] > 0 ? next[positionId] : 1;
        // 在选择模式下：复杂策略不再同步到构建器
        const pos = findPositionById(positionId);
        const isComplex = pos ? (pos.type !== 'call' && pos.type !== 'put') : false;
        if (!isComplex) {
          emitAddLegToStrategy({ positionId, quantity: next[positionId] });
        }
      } else {
        delete next[positionId];
      }
      return next;
    });
  };

  const updateSelectedQuantity = (positionId: string, qty: number) => {
    const bounded = Math.max(1, qty);
    setSelectedLegs(prev => ({ ...prev, [positionId]: bounded }));
    // 在选择模式下：复杂策略不再同步到构建器
    const pos = findPositionById(positionId);
    const isComplex = pos ? (pos.type !== 'call' && pos.type !== 'put') : false;
    if (!isComplex) {
      emitAddLegToStrategy({ positionId, quantity: bounded });
    }
  };

  // 构建并保存本到期日所选腿为一个自定义策略
  const buildStrategyFromExpiry = async (
    expiry: string,
    overrides?: { name?: string; strategyCategory?: 'bullish' | 'bearish' | 'neutral' | 'volatility'; description?: string }
  ) => {
    try {
      const selectedIds = Object.keys(selectedLegs).filter(id => {
        const qty = selectedLegs[id];
        return qty && qty > 0;
      });

      if (selectedIds.length === 0) {
        toast.error('请先选择期权腿并设置数量');
        return;
      }

      // 聚合该到期组的持仓，匹配被选中的ID
      const group = portfolioData?.expiryGroups.find(g => g.expiry === expiry);
      if (!group) {
        toast.error('未找到该到期组');
        return;
      }

      const positions: OptionsPosition[] = group.positions
        .filter(p => selectedIds.includes(p.id))
        .map(p => ({
          ...p,
          selectedQuantity: Math.max(1, Math.min(selectedLegs[p.id] || 1, p.quantity)),
          // 以选择数量估算策略中的盈亏，不影响原始quantity
          profitLoss: (p.currentValue - p.premium) * (selectedLegs[p.id] || 1) * 100,
        }));

      // 基本策略信息：名称可用到期日+数量概述
      const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} 自选组合 (${positions.length}腿)`;
      const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合`;
      const name = overrides?.name?.trim() ? overrides!.name! : defaultName;
      const description = overrides?.description?.trim() ? overrides!.description! : defaultDescription;
      const strategyCategoryOverride = overrides?.strategyCategory || 'neutral';

      // 用户ID（若登录则使用真实，否则DEMO）
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
        name,
        description,
        positions,
        strategyCategory: strategyCategoryOverride,
        riskLevel: 'medium',
        isPresetStrategy: false,
      };

      const { data, error } = await optionsService.saveCustomStrategy(payload);
      if (error) throw error;

      toast.success('组合构建并保存成功！');

      // 成功后：清理本到期的选择并退出选择模式
      setSelectedLegs(prev => {
        const next = { ...prev };
        positions.forEach(p => { delete next[p.id]; });
        return next;
      });
      setExpirySelectionMode(prev => ({ ...prev, [expiry]: false }));
    } catch (e) {
      console.error(e);
      toast.error('保存组合失败，请稍后重试');
    }
  };

  // 打开保存确认弹窗，并填充默认值（可编辑）
  const openSaveModal = (expiry: string) => {
    const group = (portfolioData?.expiryBuckets && portfolioData.expiryBuckets.length > 0)
      ? { expiry, positions: portfolioData.expiryBuckets.find(b => b.expiry === expiry)?.single || [] }
      : portfolioData?.expiryGroups.find(g => g.expiry === expiry);
    const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
    const positionsCount = group ? group.positions.filter(p => selectedIds.includes(p.id)).length : selectedIds.length;
    const currentPositions = group ? group.positions.filter(p => selectedIds.includes(p.id)) : [];
    const inferred = inferStrategyFromLegs(currentPositions);
    const inferredName = inferred ? inferred.nameZh : '自选组合';
    const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} ${inferredName} (${positionsCount}腿)`;
    const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合${inferred ? `，初步识别：${inferred.nameZh}` : ''}`;

    setModalExpiry(expiry);
    setSaveStrategyName(defaultName);
    setSaveStrategyCategory(inferred ? inferred.category : 'neutral');
    setSaveStrategyDescription(defaultDescription);
    setSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    setSaveModalOpen(false);
    setModalExpiry(null);
    setIsModalSaving(false);
  };

  const confirmSaveModal = async () => {
  if (!modalExpiry) {
    logger.debug('[OptionsPortfolio] Guard: modalExpiry missing');
    return;
  }
    try {
      setIsModalSaving(true);
      await buildStrategyFromExpiry(modalExpiry, {
        name: saveStrategyName,
        strategyCategory: saveStrategyCategory,
        description: saveStrategyDescription,
      });
      closeSaveModal();
    } catch (e) {
      setIsModalSaving(false);
    }
  };

  // ====== 策略类型初步解析（基于所选腿） ======
  type InferredResult = {
    nameZh: string;
    category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
    confidence: number; // 0~1
  };

  const inferStrategyFromLegs = (legs: OptionsPosition[]): InferredResult | null => {
    if (!legs || legs.length === 0) return null;

    const byType = {
      call: legs.filter(l => l.type === 'call'),
      put: legs.filter(l => l.type === 'put')
    };
    const getQty = (l: OptionsPosition) => selectedLegs[l.id] || 0;
    const totalLegs = legs.reduce((acc, l) => acc + (getQty(l) > 0 ? 1 : 0), 0);
    const calls = byType.call.filter(l => getQty(l) > 0);
    const puts = byType.put.filter(l => getQty(l) > 0);

    const sortByStrikeAsc = (arr: OptionsPosition[]) => [...arr].sort((a,b)=>a.strike-b.strike);

    // 单腿
    if (totalLegs === 1) {
      const l = legs.find(x => getQty(x) > 0)!;
      if (l.type === 'call') {
        return { nameZh: l.position_type === 'buy' ? '买入看涨' : '卖出看涨', category: l.position_type === 'buy' ? 'bullish' : 'bearish', confidence: 0.9 };
      } else if (l.type === 'put') {
        return { nameZh: l.position_type === 'buy' ? '买入看跌' : '卖出看跌', category: l.position_type === 'buy' ? 'bearish' : 'bullish', confidence: 0.9 };
      }
    }

    // 垂直价差（看涨/看跌）
    if (calls.length === 2 && puts.length === 0) {
      const [c1, c2] = sortByStrikeAsc(calls);
      const q1 = getQty(c1), q2 = getQty(c2);
      if (q1 === q2 && q1 > 0) {
        if (c1.position_type === 'buy' && c2.position_type === 'sell') {
          return { nameZh: '牛市看涨价差', category: 'bullish', confidence: 0.95 };
        }
        if (c1.position_type === 'sell' && c2.position_type === 'buy') {
          return { nameZh: '熊市看涨价差', category: 'bearish', confidence: 0.95 };
        }
      }
    }
    if (puts.length === 2 && calls.length === 0) {
      const [p1, p2] = sortByStrikeAsc(puts);
      const q1 = getQty(p1), q2 = getQty(p2);
      if (q1 === q2 && q1 > 0) {
        if (p1.position_type === 'sell' && p2.position_type === 'buy') {
          return { nameZh: '牛市看跌价差', category: 'bullish', confidence: 0.95 };
        }
        if (p1.position_type === 'buy' && p2.position_type === 'sell') {
          return { nameZh: '熊市看跌价差', category: 'bearish', confidence: 0.95 };
        }
      }
    }

    // 跨式 / 勒式
    if (calls.length === 1 && puts.length === 1) {
      const c = calls[0], p = puts[0];
      const qc = getQty(c), qp = getQty(p);
      if (qc === qp && qc > 0 && c.position_type === 'buy' && p.position_type === 'buy') {
        if (c.strike === p.strike) {
          return { nameZh: '买入跨式', category: 'volatility', confidence: 0.9 };
        } else {
          return { nameZh: '买入勒式', category: 'volatility', confidence: 0.9 };
        }
      }
    }

    // 铁鹰：卖出看涨价差 + 卖出看跌价差（各两腿）
    if (calls.length === 2 && puts.length === 2) {
      const [c1, c2] = sortByStrikeAsc(calls);
      const [p1, p2] = sortByStrikeAsc(puts);
      const spreadCallShort = c1.position_type === 'sell' && c2.position_type === 'buy';
      const spreadPutShort = p1.position_type === 'sell' && p2.position_type === 'buy';
      const qtyOk = getQty(c1) === getQty(c2) && getQty(p1) === getQty(p2) && getQty(c1) === getQty(p1) && getQty(c1) > 0;
      if (spreadCallShort && spreadPutShort && qtyOk) {
        return { nameZh: '铁鹰（Iron Condor）', category: 'neutral', confidence: 0.9 };
      }
    }

    // 蝶式（基于看涨）：买入低、卖出中x2、买入高
    if (calls.length >= 3 && puts.length === 0) {
      const sorted = sortByStrikeAsc(calls);
      if (sorted.length === 3) {
        const [low, mid, high] = sorted;
        const qLow = getQty(low), qMid = getQty(mid), qHigh = getQty(high);
        const pattern = low.position_type === 'buy' && mid.position_type === 'sell' && high.position_type === 'buy' && qMid === qLow * 2 && qLow === qHigh && qLow > 0;
        if (pattern) return { nameZh: '蝶式价差（看涨）', category: 'neutral', confidence: 0.85 };
      }
    }

    // 兜底：返回中性分类
    return { nameZh: '自选组合', category: 'neutral', confidence: 0.5 };
  };

  // 生成策略ID的逻辑
  const getStrategyId = (position: OptionsPosition, index: number): string => {
    // 规范化策略名，兼容 snake_case/大小写
    const normalized = (position.strategy || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (normalized.includes('SPREAD') || normalized.includes('CONDOR') || normalized.includes('BUTTERFLY')) {
      return `STR-${normalized.replace(/\s+/g, '')}-${Math.floor(index / 2) + 1}`;
    } else if (normalized.includes('STRADDLE') || normalized.includes('STRANGLE')) {
      return `VOL-${normalized.replace(/\s+/g, '')}-${Math.floor(index / 2) + 1}`;
    } else {
      return `SINGLE-${(position.type || 'unknown').toUpperCase()}-${index + 1}`;
    }
  };

  // 判断是否为单腿期权
  const isSingleLegPosition = (position: OptionsPosition): boolean => {
    return position.strategy === 'Long Call' || 
           position.strategy === 'Long Put' || 
           position.strategy === 'Covered Call' || 
           position.strategy === 'Protective Put';
  };

  // 按策略分组期权持仓
  const groupPositionsByStrategy = (positions: ExtendedOptionsPosition[]) => {
    const strategies = new Map<string, ExtendedOptionsPosition[]>();
    const singleLegs: ExtendedOptionsPosition[] = [];

    positions.forEach(position => {
      if (position.is_single_leg) {
        singleLegs.push(position);
      } else {
        const strategyId = position.strategy_id!;
        if (!strategies.has(strategyId)) {
          strategies.set(strategyId, []);
        }
        strategies.get(strategyId)!.push(position);
      }
    });

    return { strategies, singleLegs };
  };

  const getStatusColor = (status: OptionsPosition['status']) => {
    switch (status) {
      case 'open':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'closed':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'expired':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsPosition['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
      case 'iron_condor':
      case 'butterfly':
        return <Target className="w-4 h-4 text-purple-500" />;
      case 'straddle':
      case 'strangle':
        return <Activity className="w-4 h-4 text-orange-500" />;
      default:
        return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getDaysToExpiryColor = (days: number) => {
    if (days <= 7) return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
    if (days <= 30) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900';
    return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900';
  };

  const filterAndSortPositions = (positions: OptionsPosition[]) => {
    let filtered = positions;
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(pos => pos.status === statusFilter);
    }
    
    return filtered.sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'expiry':
          return multiplier * (new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        case 'profitLoss':
          return multiplier * (a.profitLoss - b.profitLoss);
        case 'symbol':
          return multiplier * a.symbol.localeCompare(b.symbol);
        default:
          return 0;
      }
    });
  };

  const computeCombosForPositions = (strategy: OptionsStrategy, type: 'call' | 'put') => computeCombosForStrategy(strategy, type);

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>正在加载期权投资组合...</p>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md p-8`}>
        <div className="text-center">
          <Calendar className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
          <p className={`text-lg font-medium ${themes[theme].text}`}>暂无期权持仓</p>
          <p className={`text-sm ${themes[theme].text} opacity-75`}>
            您还没有任何期权持仓
          </p>
        </div>
      </div>
    );
  }

  // 获取所有持仓并添加策略ID
  console.log(portfolioData)
  const allPositionsSource = (portfolioData?.expiryBuckets && portfolioData.expiryBuckets.length > 0)
    ? portfolioData.expiryBuckets.map(b => ({ expiry: b.expiry, positions: b.single }))
    : [];
  const allPositions = allPositionsSource
    .flatMap(group => group.positions)
    .filter(position => statusFilter === 'all' || position.status === statusFilter)
    .map((position, index) => {
      // 为缺失id生成稳定ID
      const safeId = position.id ?? `pos-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
      const extendedPosition: ExtendedOptionsPosition = {
        ...position,
        id: safeId,
        strategy_id: getStrategyId(position, index),
        is_single_leg: isSingleLegPosition(position)
      };
      return extendedPosition;
    });

  let groupedStrategies = new Map<string, ExtendedOptionsPosition[]>();
  let singleLegs: ExtendedOptionsPosition[] = [];

  if (Array.isArray(portfolioData.expiryBuckets) && portfolioData.expiryBuckets.length > 0) {
    singleLegs = portfolioData.expiryBuckets.flatMap(b => b.single)
      .filter(position => statusFilter === 'all' || position.status === statusFilter)
      .map((position, index) => {
        const safeId = position.id ?? `pos-single-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
        return {
          ...position,
          id: safeId,
          strategy_id: getStrategyId(position, index),
          is_single_leg: true,
        } as ExtendedOptionsPosition;
      });
  }

  if (Array.isArray(portfolioData.expiryBuckets) && portfolioData.expiryBuckets.length > 0) {
    groupedStrategies = new Map<string, ExtendedOptionsPosition[]>();
    portfolioData.expiryBuckets.forEach(bucket => {
      bucket.complex.forEach(strategy => {
        const positions = filterAndSortPositions(strategy.positions)
          .filter(position => statusFilter === 'all' || position.status === statusFilter)
          .map((position, index) => {
            const safeId = position.id ?? `pos-strategy-${index}-${(position.symbol || 'SYM')}-${(position.expiry || 'EXP')}`;
            return {
              ...position,
              id: safeId,
              strategy_id: strategy.id || getStrategyId(position, index),
              is_single_leg: false,
            } as ExtendedOptionsPosition;
          });
        if (positions.length > 0 && strategy.id) groupedStrategies.set(strategy.id, positions);
      });
    });
  }

  // 根据复杂仓位打开保存弹窗（预选同策略ID且同到期日的腿）
  const openEditForComplexPosition = (position: ExtendedOptionsPosition) => {
    const strategyId = position.strategy_id;
    if (!strategyId) {
      logger.debug('[OptionsPortfolio] Missing strategy_id for position, skip edit', {
        positionId: position.id,
        symbol: position.symbol,
        expiry: position.expiry,
        strategy: position.strategy,
        type: position.type,
      });
      return;
    }
    const expiry = position.expiry;

    const legs = allPositions.filter(p => p.strategy_id === strategyId && p.expiry === expiry);

    setSelectedLegs(prev => {
      const next = { ...prev };
      legs.forEach(l => {
        next[l.id] = Math.max(1, (l as any).selectedQuantity || l.quantity || 1);
      });
      return next;
    });

    openSaveModal(expiry);
  };

  // 不再使用独立编辑器更新回调

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>
            期权投资组合概览
          </h2>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总价值</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.totalValue, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总成本</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {formatCurrency(portfolioData.totalCost, currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>总盈亏</h3>
              <p className={`text-2xl font-bold mt-1 ${portfolioData.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioData.totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(portfolioData.totalProfitLoss), currencyConfig)}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>盈亏比例</h3>
              <p className={`text-2xl font-bold mt-1 ${portfolioData.totalProfitLossPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolioData.totalProfitLossPercentage >= 0 ? '+' : ''}{portfolioData.totalProfitLossPercentage.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  视图:
                </label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'expiry' | 'strategy' | 'grouped')}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="expiry">按到期日</option>
                  <option value="strategy">按策略</option>
                  <option value="grouped">策略分组</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${themes[theme].text}`}>
                  状态:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="all">全部</option>
                  <option value="open">持仓中</option>
                  <option value="closed">已平仓</option>
                  <option value="expired">已到期</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${themes[theme].text}`}>
                排序:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="expiry">到期日</option>
                <option value="profitLoss">盈亏</option>
                <option value="symbol">标的</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].secondary}`}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Content */}
      {viewMode === 'grouped' && (
        <div className="space-y-8">
          {/* 策略组合 */}
          {groupedStrategies.size > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-purple-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  策略组合 ({groupedStrategies.size} 个策略)
                </h3>
              </div>
              <div className="space-y-6">
                {Array.from(groupedStrategies.entries()).map(([strategyId, positions]) => (
                  <div key={strategyId} className={`${themes[theme].background} rounded-lg p-4 border-l-4 border-purple-500`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-purple-500" />
                        <span className={`text-sm font-mono ${themes[theme].text} bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded`}>
                          {strategyId}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {positions[0].strategy} ({positions.length} 腿)
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                          总成本: {formatCurrency(positions.reduce((sum, p) => sum + p.premium * p.quantity * 100, 0), currencyConfig)}
                        </div>
                        <div className={`text-sm ${
                          positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          盈亏: {positions.reduce((sum, p) => sum + p.profitLoss, 0) >= 0 ? '+' : ''}
                          {formatCurrency(Math.abs(positions.reduce((sum, p) => sum + p.profitLoss, 0)), currencyConfig)}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {positions.map((position) => {
                        const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                        const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        
                        return (
                          <div key={position.id} className={`${themes[theme].card} rounded-lg p-3 border ${themes[theme].border}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  {positionInfo.icon}
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                    {positionInfo.label}
                                  </span>
                                </div>
                                <div>
                                  <div className={`text-sm font-medium ${themes[theme].text}`}>
                                    {position.symbol} {position.strike} {position.type.toUpperCase()}
                                  </div>
                                  <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                    到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  数量: {position.quantity} | 成本: {formatCurrency(position.premium * position.quantity * 100, currencyConfig)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 单腿期权 */}
          {singleLegs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-blue-500" />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  单腿期权 ({singleLegs.length} 个持仓)
                </h3>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Call期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Call期权 ({singleLegs.filter(p => p.type === 'call').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'call').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} CALL
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                                <span className={`${themes[theme].text}`}>{position.quantity}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig)}</span>
                              </div>
                            </div>
                            {position.notes && (
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {singleLegs.filter(p => p.type === 'call').length === 0 && (
                      <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                        <TrendingUp className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                        <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Call期权持仓</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Put期权列 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <h4 className={`text-md font-medium ${themes[theme].text}`}>
                      Put期权 ({singleLegs.filter(p => p.type === 'put').length})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {singleLegs.filter(p => p.type === 'put').map((position) => {
                      const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                      const daysToExpiry = Math.ceil((new Date(position.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      
                      return (
                        <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border-l-4 ${
                          position.position_type === 'buy' ? 'border-blue-500' : 'border-orange-500'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono ${themes[theme].text} bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded`}>
                                {position.strategy_id}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                {positionInfo.label}
                              </span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
                              {position.status === 'open' ? '持仓中' : position.status === 'closed' ? '已平仓' : '已到期'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                  {position.symbol} {position.strike} PUT
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                  到期: {format(new Date(position.expiry), 'MM-dd')} ({daysToExpiry}天)
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-medium ${
                                  position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                </div>
                                <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                  ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>数量: </span>
                                <span className={`${themes[theme].text}`}>{position.quantity}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>权利金: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.premium, currencyConfig)}</span>
                              </div>
                              <div>
                                <span className={`${themes[theme].text} opacity-75`}>当前值: </span>
                                <span className={`${themes[theme].text}`}>{formatCurrency(position.currentValue, currencyConfig)}</span>
                              </div>
                            </div>
                            {position.notes && (
                              <div className={`text-xs ${themes[theme].text} opacity-75 mt-2 p-2 ${themes[theme].background} rounded`}>
                                {position.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {singleLegs.filter(p => p.type === 'put').length === 0 && (
                      <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                        <TrendingDown className={`w-8 h-8 mx-auto mb-2 ${themes[theme].text} opacity-40`} />
                        <p className={`text-sm ${themes[theme].text} opacity-75`}>暂无Put期权持仓</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 自定义策略显示 */}
          {customStrategies.length > 0 && (
            <div className="mt-8">
              <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4 flex items-center gap-2`}>
                <Layers className="w-5 h-5 text-purple-500" />
                自定义策略 ({customStrategies.length})
              </h3>
              <div className="space-y-4">
                {customStrategies.map((strategy) => {
                  const isExpanded = expandedStrategies.includes(strategy.id);
                  const totalCost = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.premium * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const currentValue = strategy.positions.reduce((sum, pos) => 
                    sum + (pos.currentValue * (pos.selectedQuantity || pos.quantity) * 100), 0);
                  const profitLoss = currentValue - totalCost;
                  const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
                  
                  return (
                    <div key={strategy.id} className={`${themes[theme].background} rounded-lg border ${themes[theme].border}`}>
                      <div 
                        className={`p-4 cursor-pointer ${themes[theme].cardHover}`}
                        onClick={() => toggleStrategyExpansion(strategy.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {strategy.strategyCategory && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.strategyCategory === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                                  strategy.strategyCategory === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                                  strategy.strategyCategory === 'volatility' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                                }`}>
                                  {strategy.strategyCategory === 'bullish' ? '看涨' :
                                   strategy.strategyCategory === 'bearish' ? '看跌' :
                                   strategy.strategyCategory === 'volatility' ? '波动率' : '中性'}
                                </span>
                              )}
                              {strategy.riskLevel && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  strategy.riskLevel === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' :
                                  strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                }`}>
                                  {strategy.riskLevel === 'low' ? '低风险' :
                                   strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                                </span>
                              )}
                            </div>
                            <div>
                              <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                {strategy.name}
                              </h4>
                              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                                {strategy.description}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                {strategy.positions.length} 个期权 • 创建于 {new Date(strategy.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={`text-lg font-semibold ${
                                profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(profitLoss), currencyConfig)}
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-75`}>
                                ({profitLossPercentage >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%)
                              </p>
                              <p className={`text-xs ${themes[theme].text} opacity-60`}>
                                成本: {formatCurrency(totalCost, currencyConfig)}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
                            ) : (
                              <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <div className="space-y-2">
                            <h5 className={`text-sm font-medium ${themes[theme].text} mb-3`}>
                              包含的期权持仓
                            </h5>
                            {strategy.positions.map((position) => {
                              const adjustedCost = position.premium * (position.selectedQuantity || position.quantity) * 100;
                              const adjustedValue = position.currentValue * (position.selectedQuantity || position.quantity) * 100;
                              const adjustedProfitLoss = adjustedValue - adjustedCost;
                              const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                              
                              return (
                                <div key={position.id} className={`${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {getTypeIcon(position.type)}
                                      <div>
                                        <div className={`text-sm font-medium ${themes[theme].text}`}>
                                          {position.symbol} {position.strike} {position.type.toUpperCase()}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          <div className="flex items-center gap-1">
                                            {positionInfo.icon}
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                              {positionInfo.label}
                                            </span>
                                          </div>
                                          <span className={`text-xs ${themes[theme].text} opacity-75`}>
                                            到期: {format(new Date(position.expiry), 'MM-dd')}
                                          </span>
                                        </div>
                                        <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                                          数量: {position.selectedQuantity || position.quantity}
                                          {position.selectedQuantity && position.selectedQuantity !== position.quantity && (
                                            <span className="text-blue-600 ml-1">
                                              (原始: {position.quantity})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className={`text-sm font-medium ${
                                        adjustedProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {adjustedProfitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(adjustedProfitLoss), currencyConfig)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        成本: {formatCurrency(adjustedCost, currencyConfig)}
                                      </div>
                                      <div className={`text-xs ${themes[theme].text} opacity-60`}>
                                        当前: {formatCurrency(adjustedValue, currencyConfig)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'expiry' ? (
        <div className="space-y-6">
          {(portfolioData.expiryBuckets || []).map((group) => (
            <ExpiryGroupCard
              key={group.expiry}
              theme={theme}
              group={group}
              statusFilter={statusFilter}
              filterAndSortPositions={filterAndSortPositions}
              isSelectingExpiry={isSelectingExpiry}
              toggleExpirySelection={toggleExpirySelection}
              openSaveModal={openSaveModal}
              selectedLegs={selectedLegs}
              setPositionSelected={setPositionSelected}
              updateSelectedQuantity={updateSelectedQuantity}
              currencyConfig={currencyConfig}
              getDaysToExpiryColor={getDaysToExpiryColor}
              getTypeIcon={getTypeIcon}
              getStatusColor={getStatusColor}
              getPositionTypeInfo2={getPositionTypeInfo2}
              computeCombosForPositions={computeCombosForPositions}
              allExpiryBuckets={portfolioData.expiryBuckets || []}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {(portfolioData.complexStrategies || []).map((strategy) => {
            const filteredPositions = filterAndSortPositions(strategy.positions);
            if (filteredPositions.length === 0) return null;

            return (
              <div key={strategy.id} className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                        {strategy.name}
                      </h3>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        {strategy.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.category === 'bullish' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.category === 'bearish' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                          strategy.category === 'neutral' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100' :
                          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100'
                        }`}>
                          {strategy.category === 'bullish' ? '看涨' :
                           strategy.category === 'bearish' ? '看跌' :
                           strategy.category === 'neutral' ? '中性' : '波动'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          strategy.riskLevel === 'low' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                          strategy.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                        }`}>
                          {strategy.riskLevel === 'low' ? '低风险' :
                           strategy.riskLevel === 'medium' ? '中风险' : '高风险'}
                        </span>
                        <span className={`text-sm ${themes[theme].text} opacity-75`}>
                          {filteredPositions.length} 个持仓
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {strategy.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(strategy.profitLoss), currencyConfig)}
                      </p>
                      <p className={`text-sm ${strategy.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({strategy.profitLossPercentage >= 0 ? '+' : ''}{strategy.profitLossPercentage.toFixed(2)}%)
                      </p>
                      <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                        当前价值: {formatCurrency(strategy.currentValue, currencyConfig)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="space-y-4">
                    {(() => {
                      const callPositions = filteredPositions.filter(pos => (pos.type === 'call' || (pos.contract_type_zh as any) === 'call'));
                      const putPositions = filteredPositions.filter(pos => (pos.type === 'put' || (pos.contract_type_zh as any) === 'put'));
                      const spreadPositions = filteredPositions.filter(pos => !['call', 'put'].includes(pos.type));
                      
                      return (
                        <div className="space-y-6">
                          {/* Call和Put期权两列展示 */}
                          {(callPositions.length > 0 || putPositions.length > 0) && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Call期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Call期权 ({callPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {callPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                              <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                            {isSelectingExpiry(position.expiry) && (
                                              <div className="mt-2 flex items-center justify-end gap-2">
                                                <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                                  <input
                                                    type="checkbox"
                                                    checked={!!selectedLegs[position.id]}
                                                    onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                                  />
                                                  选择
                                                </label>
                                                {!!selectedLegs[position.id] && (
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    max={position.quantity}
                                                    value={selectedLegs[position.id]}
                                                    onChange={(e) => {
                                                      const val = parseInt(e.target.value) || 1;
                                                      const clamped = Math.max(1, Math.min(val, position.quantity));
                                                      updateSelectedQuantity(position.id, clamped);
                                                    }}
                                                    className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                                  />
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {callPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Call期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Put期权列 */}
                              <div>
                                <div className="flex items-center gap-2 mb-4">
                                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                                  <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                    Put期权 ({putPositions.length})
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  {putPositions.map((position) => {
                                    const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                                    
                                    return (
                                      <div 
                                        key={position.id} 
                                        className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-start space-x-3">
                                            {getTypeIcon(position.type)}
                                            <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                  {position.symbol} {position.strike}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {positionInfo.icon}
                                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                    {positionInfo.label}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                                到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                              </div>
                                              <div className="flex items-center gap-3 mt-2 text-xs">
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  数量: {position.quantity}
                                                </span>
                                                <span className={`${themes[theme].text} opacity-75`}>
                                                  权利金: {formatCurrency(position.premium, currencyConfig)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                            </div>
                                            <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                              {position.status === 'open' ? '持仓中' : 
                                               position.status === 'closed' ? '已平仓' : '已到期'}
                                            </span>
                                            {isSelectingExpiry(position.expiry) && (
                                              <div className="mt-2 flex items-center justify-end gap-2">
                                                <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                                  <input
                                                    type="checkbox"
                                                    checked={!!selectedLegs[position.id]}
                                                    onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                                  />
                                                  选择
                                                </label>
                                                {!!selectedLegs[position.id] && (
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    max={position.quantity}
                                                    value={selectedLegs[position.id]}
                                                    onChange={(e) => {
                                                      const val = parseInt(e.target.value) || 1;
                                                      const clamped = Math.max(1, Math.min(val, position.quantity));
                                                      updateSelectedQuantity(position.id, clamped);
                                                    }}
                                                    className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                                  />
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {putPositions.length === 0 && (
                                    <div className={`${themes[theme].background} rounded-lg p-6 text-center border-2 border-dashed ${themes[theme].border}`}>
                                      <p className={`${themes[theme].text} opacity-75`}>
                                        暂无Put期权持仓
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 复杂策略期权（价差、跨式等）单独展示 */}
                          {spreadPositions.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                                <h4 className={`text-lg font-semibold ${themes[theme].text}`}>
                                  复杂策略 ({spreadPositions.length})
                                </h4>
                              </div>
                              <div className="space-y-3">
                                {spreadPositions.map((position) => {
                                  const positionInfo = getPositionTypeInfo2(position.position_type, position.type, position.position_type_zh);
                                  
                                  return (
                                    <div 
                                      key={`${position.id ?? 'noid'}-${position.symbol}-${position.strike}-${position.type}-${position.expiry}`}
                                      className={`${themes[theme].background} rounded-lg p-4 border-l-4 ${positionInfo.borderColor}`}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex items-start space-x-3">
                                          {getTypeIcon(position.type)}
                                          <div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className={`text-sm font-medium ${themes[theme].text}`}>
                                                {position.symbol} {position.strike} {position.type.toUpperCase()}
                                              </div>
                                              <div className="flex items-center gap-1">
                                                {positionInfo.icon}
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${positionInfo.color}`}>
                                                  {positionInfo.label}
                                                </span>
                                              </div>
                                            </div>
                                            <div className={`text-xs ${themes[theme].text} opacity-75`}>
                                              到期: {format(new Date(position.expiry), 'MM-dd')} • {positionInfo.description}
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs">
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                数量: {position.quantity}
                                              </span>
                                              <span className={`${themes[theme].text} opacity-75`}>
                                                权利金: {formatCurrency(position.premium, currencyConfig)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className={`text-sm font-bold ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {position.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(position.profitLoss), currencyConfig)}
                                          </div>
                                          <div className={`text-xs ${position.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ({position.profitLossPercentage >= 0 ? '+' : ''}{position.profitLossPercentage.toFixed(2)}%)
                                          </div>
                                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)} mt-1`}>
                                            {position.status === 'open' ? '持仓中' : 
                                             position.status === 'closed' ? '已平仓' : '已到期'}
                                          </span>
                                          {!isSelectingExpiry(position.expiry) && (
                                            <button
                                              type="button"
                                              onClick={() => openEditForComplexPosition(position as ExtendedOptionsPosition)}
                                              className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-600 text-white hover:bg-purple-700"
                                              aria-label="编辑策略"
                                            >
                                              编辑策略
                                            </button>
                                          )}
                                          {isSelectingExpiry(position.expiry) && (
                                            <div className="mt-2 flex items-center justify-end gap-2">
                                              <label className={`text-xs ${themes[theme].text} opacity-75 flex items-center gap-1`}>
                                                <input
                                                  type="checkbox"
                                                  checked={!!selectedLegs[position.id]}
                                                  onChange={(e) => setPositionSelected(position.id, e.target.checked)}
                                                />
                                                选择
                                              </label>
                                              {!!selectedLegs[position.id] && (
                                                <input
                                                  type="number"
                                                  min={1}
                                                  max={position.quantity}
                                                  value={selectedLegs[position.id]}
                                                  onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 1;
                                                    const clamped = Math.max(1, Math.min(val, position.quantity));
                                                    updateSelectedQuantity(position.id, clamped);
                                                  }}
                                                  className={`w-20 px-2 py-1 rounded text-xs ${themes[theme].input} ${themes[theme].text}`}
                                                />
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 保存确认弹窗 */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeSaveModal} />
          <div className={`${themes[theme].card} relative z-10 w-full max-w-md rounded-lg shadow-lg p-6`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>确认保存组合</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>策略名称</label>
                <input
                  type="text"
                  value={saveStrategyName}
                  onChange={(e) => setSaveStrategyName(e.target.value)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                  placeholder="请输入策略名称"
                />
              </div>
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>组合类型</label>
                <select
                  value={saveStrategyCategory}
                  onChange={(e) => setSaveStrategyCategory(e.target.value as typeof saveStrategyCategory)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="neutral">中性</option>
                  <option value="bullish">看涨</option>
                  <option value="bearish">看跌</option>
                  <option value="volatility">波动率</option>
                </select>
              </div>
              {/* 识别结果与腿预览（支持编辑） */}
              <div className="border rounded p-3">
                <div className={`text-sm font-medium ${themes[theme].text} mb-2`}>组合预览与编辑</div>
                <div className="max-h-48 overflow-auto space-y-2">
                  {(portfolioData?.expiryGroups.find(g => g.expiry === modalExpiry)?.positions || [])
                    .map(p => {
                      const checked = !!selectedLegs[p.id] && selectedLegs[p.id] > 0;
                      const qty = selectedLegs[p.id] || 0;
                      return (
                        <div key={`${p.id ?? 'noid'}-${p.symbol}-${p.strike}-${p.type}-${p.expiry}`} className="flex items-center justify-between text-xs gap-2">
                          <label className={`flex items-center gap-2 ${themes[theme].text}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setPositionSelected(p.id, e.target.checked)}
                            />
                            <span>
                              {p.symbol} {p.expiry} {p.type === 'call' ? '看涨' : p.type === 'put' ? '看跌' : p.strategy} {p.position_type === 'buy' ? '买入' : '卖出'} @ {p.strike}
                            </span>
                          </label>
                          <div className="flex items-center gap-1">
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
                              className={`w-20 px-2 py-1 rounded ${themes[theme].input} ${themes[theme].text}`}
                              disabled={!checked}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                {/* 实时识别提示 */}
                {(() => {
                  const group = portfolioData?.expiryGroups.find(g => g.expiry === modalExpiry);
                  const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
                  const positions = group ? group.positions.filter(p => selectedIds.includes(p.id)) : [];
                  const inferred = inferStrategyFromLegs(positions);
                  return (
                    <div className={`mt-2 text-xs ${themes[theme].text}`}>
                      初步识别：{inferred ? `${inferred.nameZh}（置信度 ${Math.round(inferred.confidence*100)}%）` : '无法识别'}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className={`text-sm ${themes[theme].text} opacity-75`}>描述</label>
                <textarea
                  value={saveStrategyDescription}
                  onChange={(e) => setSaveStrategyDescription(e.target.value)}
                  className={`mt-1 w-full px-3 py-2 rounded ${themes[theme].input} ${themes[theme].text}`}
                  rows={3}
                  placeholder="可选，添加组合描述"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeSaveModal}
                className={`px-3 py-2 rounded ${themes[theme].secondary}`}
                disabled={isModalSaving}
              >
                取消
              </button>
              <button
                onClick={confirmSaveModal}
                className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={isModalSaving}
              >
                {isModalSaving ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 复杂策略编辑与构建统一使用上方“保存确认弹窗” */}
    </div>
  );
}