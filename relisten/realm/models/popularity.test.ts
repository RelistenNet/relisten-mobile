import { describe, expect, it } from 'vitest';
import { catalogPopularitySnapshot } from './popularity';

const window = (plays: number) => ({ plays, hours: 0, hot_score: 0 });

describe('catalogPopularitySnapshot', () => {
  it('keeps the past year’s plays, which rows print as "16.4M 1y"', () => {
    const snapshot = catalogPopularitySnapshot({
      momentum_score: 0.9,
      trend_ratio: 1,
      windows: { '48h': window(1), '7d': window(2), '30d': window(3), '1y': window(16_379_876) },
    });
    expect(snapshot?.windows.days1y?.plays).toBe(16_379_876);
  });

  it('leaves the year out when the catalog sends none', () => {
    const snapshot = catalogPopularitySnapshot({
      momentum_score: 0.9,
      trend_ratio: 1,
      windows: { '48h': window(1), '7d': window(2), '30d': window(3) },
    });
    expect(snapshot?.windows).not.toHaveProperty('days1y');
  });
});
