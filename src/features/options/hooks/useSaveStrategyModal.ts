import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { authService, optionsService } from '../../../lib/services';
import type { CustomOptionsStrategy, OptionsPosition } from '../../../lib/services/types';
import { logger } from '../../../shared/utils/logger';
import type { InferredStrategyResult } from '../utils/portfolioUi';

export function useSaveStrategyModal({
  getPositionsForExpiry,
  selectedLegs,
  setSelectedLegs,
  setExpirySelectionMode,
  inferStrategyFromLegs,
  fallbackUserId,
}: {
  getPositionsForExpiry: (expiry: string) => OptionsPosition[];
  selectedLegs: Record<string, number>;
  setSelectedLegs: Dispatch<SetStateAction<Record<string, number>>>;
  setExpirySelectionMode: Dispatch<SetStateAction<Record<string, boolean>>>;
  inferStrategyFromLegs: (legs: OptionsPosition[]) => InferredStrategyResult | null;
  fallbackUserId: string;
}) {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [modalExpiry, setModalExpiry] = useState<string | null>(null);
  const [saveStrategyName, setSaveStrategyName] = useState<string>('');
  const [saveStrategyCategory, setSaveStrategyCategory] = useState<'bullish' | 'bearish' | 'neutral' | 'volatility'>('neutral');
  const [saveStrategyDescription, setSaveStrategyDescription] = useState<string>('');
  const [isModalSaving, setIsModalSaving] = useState(false);

  const buildStrategyFromExpiry = useCallback(
    async (
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

        const allPositions = getPositionsForExpiry(expiry);
        if (!allPositions || allPositions.length === 0) {
          toast.error('未找到该到期组');
          return;
        }

        const positions: OptionsPosition[] = allPositions
          .filter(p => selectedIds.includes(p.id))
          .map(p => ({
            ...p,
            selectedQuantity: Math.max(1, Math.min(selectedLegs[p.id] || 1, p.quantity)),
            profitLoss: (p.currentValue - p.premium) * (selectedLegs[p.id] || 1) * 100,
          }));

        const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} 自选组合 (${positions.length}腿)`;
        const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合`;
        const name = overrides?.name?.trim() ? overrides.name : defaultName;
        const description = overrides?.description?.trim() ? overrides.description : defaultDescription;
        const strategyCategoryOverride = overrides?.strategyCategory || 'neutral';

        let userId = fallbackUserId;
        try {
          const authRes = await authService.getUser();
          const user = authRes?.data?.user;
          userId = user?.id || fallbackUserId;
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

        const { error } = await optionsService.saveCustomStrategy(payload);
        if (error) throw error;

        toast.success('组合构建并保存成功！');

        setSelectedLegs(prev => {
          const next = { ...prev };
          positions.forEach(p => {
            delete next[p.id];
          });
          return next;
        });
        setExpirySelectionMode(prev => ({ ...prev, [expiry]: false }));
      } catch (e) {
        console.error(e);
        toast.error('保存组合失败，请稍后重试');
      }
    },
    [fallbackUserId, getPositionsForExpiry, selectedLegs, setExpirySelectionMode, setSelectedLegs]
  );

  const openSaveModal = useCallback(
    (expiry: string) => {
      const allPositions = getPositionsForExpiry(expiry);
      const selectedIds = Object.keys(selectedLegs).filter(id => selectedLegs[id] && selectedLegs[id] > 0);
      const positionsCount = allPositions ? allPositions.filter(p => selectedIds.includes(p.id)).length : selectedIds.length;
      const currentPositions = allPositions ? allPositions.filter(p => selectedIds.includes(p.id)) : [];
      const inferred = inferStrategyFromLegs(currentPositions);
      const inferredName = inferred ? inferred.nameZh : '自选组合';
      const defaultName = `${format(new Date(expiry), 'yyyy-MM-dd')} ${inferredName} (${positionsCount}腿)`;
      const defaultDescription = `基于到期日 ${format(new Date(expiry), 'yyyy-MM-dd')} 的多腿组合${inferred ? `，初步识别：${inferred.nameZh}` : ''}`;

      setModalExpiry(expiry);
      setSaveStrategyName(defaultName);
      setSaveStrategyCategory(inferred ? inferred.category : 'neutral');
      setSaveStrategyDescription(defaultDescription);
      setSaveModalOpen(true);
    },
    [getPositionsForExpiry, inferStrategyFromLegs, selectedLegs]
  );

  const closeSaveModal = useCallback(() => {
    setSaveModalOpen(false);
    setModalExpiry(null);
    setIsModalSaving(false);
  }, []);

  const confirmSaveModal = useCallback(async () => {
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
    } catch {
      setIsModalSaving(false);
    }
  }, [buildStrategyFromExpiry, closeSaveModal, modalExpiry, saveStrategyCategory, saveStrategyDescription, saveStrategyName]);

  return {
    saveModalOpen,
    modalExpiry,
    saveStrategyName,
    saveStrategyCategory,
    saveStrategyDescription,
    isModalSaving,
    setSaveStrategyName,
    setSaveStrategyCategory,
    setSaveStrategyDescription,
    openSaveModal,
    closeSaveModal,
    confirmSaveModal,
  };
}
