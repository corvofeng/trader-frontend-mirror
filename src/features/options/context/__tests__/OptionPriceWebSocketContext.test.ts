import { describe, expect, it } from 'vitest';

import { buildRealtimeSubscriptionBatches } from '../OptionPriceWebSocketContext';

describe('buildRealtimeSubscriptionBatches', () => {
  it('includes every active underlying in each contract batch', () => {
    const batches = buildRealtimeSubscriptionBatches([
      '510300.SH',
      '10000001.SH',
      '10000002.SH',
      '10000003.SH',
      '10000004.SH',
      '10000005.SH',
    ]);

    expect(batches).toEqual([
      ['510300.SH', '10000001.SH', '10000002.SH', '10000003.SH', '10000004.SH'],
      ['510300.SH', '10000005.SH'],
    ]);
  });

  it('prefers qualified codes before batching', () => {
    const batches = buildRealtimeSubscriptionBatches([
      '510300',
      '510300.SH',
      '10000001',
      '10000001.SH',
    ]);

    expect(batches).toEqual([
      ['510300.SH', '10000001.SH'],
    ]);
  });
});
