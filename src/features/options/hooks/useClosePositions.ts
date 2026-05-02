import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { optionsService } from '../../../lib/services';
import type { OptionsPortfolioData, OptionsPosition } from '../../../lib/services/types';
import { logger } from '../../../shared/utils/logger';

type ClosePositionsMeta = {
  action?: string;
  comboType?: 'call' | 'put';
  strike?: number;
  expiry?: string;
  strategyIds?: string[];
  category?: string;
};

export function useClosePositions({
  portfolioData,
  setPortfolioData,
  selectedAccountId,
  userId,
  activeSymbol,
  fallbackUserId,
}: {
  portfolioData: OptionsPortfolioData | null;
  setPortfolioData: (data: OptionsPortfolioData) => void;
  selectedAccountId: string | null;
  userId: string | null;
  activeSymbol: string;
  fallbackUserId: string;
}) {
  const handleClosePositions = useCallback(
    async (ids: string[], meta?: ClosePositionsMeta, overrides?: Record<string, number>) => {
      if (!ids || ids.length === 0) return;
      try {
        logger.info('[OptionsPortfolio] handleClosePositions: start', { idsCount: ids.length, meta });
        const matchesMeta = (p: OptionsPosition) => {
          let ok = true;
          if (meta?.expiry) ok = ok && p.expiry === meta.expiry;
          if (meta?.strike != null) {
            const sv = Number(p.contract_strike_price ?? p.strike);
            ok = ok && sv === meta.strike;
          }
          if (meta?.comboType) {
            const t = p.type ?? p.contract_type_zh;
            ok = ok && t === meta.comboType;
          }
          if (meta?.category) {
            const isCovered = p.position_type_zh === '备兑' || !!p.is_covered;
            if (meta.category === 'call_obligation') {
              ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'sell' && !isCovered);
            } else if (meta.category === 'put_obligation') {
              ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'sell' && !isCovered);
            } else if (meta.category === 'call_right') {
              ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'buy');
            } else if (meta.category === 'put_right') {
              ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'buy');
            } else if (meta.category === 'call_covered') {
              ok = ok && ((p.type === 'call' || p.contract_type_zh === 'call') && p.position_type === 'sell' && isCovered);
            } else if (meta.category === 'put_covered') {
              ok = ok && ((p.type === 'put' || p.contract_type_zh === 'put') && p.position_type === 'sell' && isCovered);
            }
          }
          return ok;
        };

        const collectPositions = (): OptionsPosition[] => {
          const list: OptionsPosition[] = [];
          (portfolioData?.expiryBuckets || []).forEach(bucket => {
            bucket.single.forEach(p => {
              if (ids.includes(p.id) && matchesMeta(p)) list.push(p);
            });
          });
          (portfolioData?.expiryGroups || []).forEach(group => {
            group.positions.forEach(p => {
              if (ids.includes(p.id) && matchesMeta(p) && !list.find(x => x.id === p.id)) list.push(p);
            });
          });
          (portfolioData?.strategies || []).forEach(s => {
            s.positions.forEach(p => {
              if (ids.includes(p.id) && matchesMeta(p) && !list.find(x => x.id === p.id)) list.push(p);
            });
          });
          logger.debug('[OptionsPortfolio] collectPositions: collected', { count: list.length });
          return list;
        };

        const selectedPositions = collectPositions();
        logger.debug('[OptionsPortfolio] selectedPositions', { ids: selectedPositions.map(p => p.id) });
        const rawSingles = (portfolioData?.expiryBuckets || []).flatMap(b => b.single);
        const rawPositions = selectedPositions
          .map(p => rawSingles.find(x => x.id === p.id) || p)
          .map(pos => ({
            ...pos,
            option_type: pos.type,
            strike_price: String(pos.strike)
          }));

        const selectedPositionsWithQty = selectedPositions.map(p => {
          const override = overrides?.[p.id];
          const base = Number(p.selectedQuantity ?? p.leg_quantity ?? p.quantity);
          const qty = override ?? base;
          return { ...p, selectedQuantity: qty } as OptionsPosition;
        });

        const updates = selectedPositionsWithQty.map(p => {
          const base = Number(p.selectedQuantity ?? p.leg_quantity ?? p.quantity) || 0;
          const avail = Number(p.available ?? base) || 0;
          const defaultTarget = Math.max(0, Math.min(avail, avail));
          const targetQty = Math.max(0, Math.min(avail, overrides?.[p.id] ?? defaultTarget));
          return {
            id: p.id,
            type: p.type as 'call' | 'put',
            position_type: p.position_type,
            strike: Number(p.contract_strike_price ?? p.strike),
            expiry: p.expiry,
            quantity: targetQty,
            original_quantity: avail,
            change_quantity: targetQty - avail,
            is_covered: p.position_type_zh === '备兑' || !!p.is_covered,
            symbol: p.symbol,
            option_type: p.type,
            strike_price: String(p.strike),
            last_price_refer: typeof p.last_price === 'number' && Number.isFinite(p.last_price) ? p.last_price : undefined
          };
        });

        const { error } = await optionsService.updatePositions({
          updates,
          positions: rawPositions,
          accountId: selectedAccountId,
          userId
        });
        if (error) throw error;
        toast.success('同步成功');

        try {
          const { data: refreshed } = await optionsService.getOptionsPortfolio(
            userId || fallbackUserId,
            selectedAccountId,
            activeSymbol ? { symbol: activeSymbol } : undefined
          );
          if (refreshed) setPortfolioData(refreshed);
        } catch (refreshError) {
          console.error(refreshError);
        }
      } catch (e) {
        console.error(e as Error);
        toast.error(e instanceof Error ? e.message : '同步失败');
      }
    },
    [activeSymbol, fallbackUserId, portfolioData, selectedAccountId, setPortfolioData, userId]
  );

  return { handleClosePositions };
}
