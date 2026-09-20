import { describe, it, expect } from 'vitest';
import { isBuyOperation, isSellOperation, normalizeTradeOperation, normalizeTrade } from '../trade';

describe('trade utils', () => {
  describe('isBuyOperation', () => {
    it('should correctly identify buy operations', () => {
      expect(isBuyOperation('buy')).toBe(true);
      expect(isBuyOperation('BUY')).toBe(true);
      expect(isBuyOperation('stock_buy')).toBe(true);
      expect(isBuyOperation('STOCK_BUY')).toBe(true);
      expect(isBuyOperation('option_buy')).toBe(true);
      expect(isBuyOperation('买入')).toBe(true);
      expect(isBuyOperation('限价买入')).toBe(true);
      expect(isBuyOperation('买入开仓')).toBe(true);
      expect(isBuyOperation('开多')).toBe(true);
    });

    it('should return false for sell or invalid operations', () => {
      expect(isBuyOperation('sell')).toBe(false);
      expect(isBuyOperation('stock_sell')).toBe(false);
      expect(isBuyOperation('卖出')).toBe(false);
      expect(isBuyOperation('限价卖出')).toBe(false);
      expect(isBuyOperation('')).toBe(false);
      expect(isBuyOperation(null)).toBe(false);
      expect(isBuyOperation(undefined)).toBe(false);
    });
  });

  describe('isSellOperation', () => {
    it('should correctly identify sell operations', () => {
      expect(isSellOperation('sell')).toBe(true);
      expect(isSellOperation('SELL')).toBe(true);
      expect(isSellOperation('stock_sell')).toBe(true);
      expect(isSellOperation('STOCK_SELL')).toBe(true);
      expect(isSellOperation('option_sell')).toBe(true);
      expect(isSellOperation('卖出')).toBe(true);
      expect(isSellOperation('限价卖出')).toBe(true);
      expect(isSellOperation('卖出平仓')).toBe(true);
      expect(isSellOperation('平多')).toBe(true);
    });

    it('should return false for buy or invalid operations', () => {
      expect(isSellOperation('buy')).toBe(false);
      expect(isSellOperation('stock_buy')).toBe(false);
      expect(isSellOperation('买入')).toBe(false);
      expect(isSellOperation('')).toBe(false);
      expect(isSellOperation(null)).toBe(false);
      expect(isSellOperation(undefined)).toBe(false);
    });
  });

  describe('normalizeTradeOperation', () => {
    it('should normalize stock_buy to buy and stock_sell to sell', () => {
      expect(normalizeTradeOperation('stock_buy')).toBe('buy');
      expect(normalizeTradeOperation('stock_sell')).toBe('sell');
      expect(normalizeTradeOperation('buy')).toBe('buy');
      expect(normalizeTradeOperation('sell')).toBe('sell');
      expect(normalizeTradeOperation('限价买入')).toBe('buy');
      expect(normalizeTradeOperation('限价卖出')).toBe('sell');
    });
  });

  describe('normalizeTrade', () => {
    it('should normalize user reported trade object correctly', () => {
      const raw = {
        created_at: '2026-06-30T07:10:00Z',
        id: 814,
        notes: '未成交订单自动添加\n订单时间: 2026-06-30 09:35:45\n订单日期: 2026-06-30\n操作类型: 限价买入\n委托数量: 400\n已成交: 0\n剩余: 400\n委托价格: 12.3\n订单状态: REPORTED',
        operation: 'stock_buy',
        quantity: 400.0,
        status: 'pending',
        stock_code: '603043.SH',
        stock_name: '广州酒家',
        target_price: 12.3,
        updated_at: null,
      };

      const normalized = normalizeTrade(raw);

      expect(normalized.operation).toBe('buy');
      expect(normalized.updated_at).toBeNull();
      expect(normalized.stock_code).toBe('603043.SH');
      expect(normalized.quantity).toBe(400);
    });

    it('should sanitize 1970 epoch date strings to null', () => {
      const raw = {
        id: 1,
        created_at: '2026-06-30T07:10:00Z',
        operation: 'stock_sell',
        updated_at: '1970-01-01T00:00:00.000Z',
      };

      const normalized = normalizeTrade(raw);
      expect(normalized.operation).toBe('sell');
      expect(normalized.updated_at).toBeNull();
    });

    it('should preserve valid updated_at dates', () => {
      const raw = {
        id: 1,
        created_at: '2026-06-30T07:10:00Z',
        operation: 'buy',
        updated_at: '2026-06-30T08:00:00Z',
      };

      const normalized = normalizeTrade(raw);
      expect(normalized.updated_at).toBe('2026-06-30T08:00:00Z');
    });
  });
});
