import { describe, expect, it } from 'vitest';
import { catalogPopularitySnapshot, popularityPlaysLabel } from './popularity';

const window = (plays: number) => ({ plays, hours: 0, hot_score: 0 });

describe('catalogPopularitySnapshot', () => {
  it('keeps the past year’s plays, which rows print as "16.4M 1y"', () => {
    const snapshot = catalogPopularitySnapshot({
      momentum_score: 0.9,
      trend_ratio: 1,
      windows: { '48h': window(1), '7d': window(2), '30d': window(3), '1y': window(16_379_876) },
    });
    expect(popularityPlaysLabel(snapshot)).toBe('16.4M 1y');
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

describe('popularityPlaysLabel', () => {
  const snapshot = (days30d: number, days1y?: number) =>
    catalogPopularitySnapshot({
      momentum_score: 0,
      trend_ratio: 1,
      windows: {
        '48h': window(0),
        '7d': window(0),
        '30d': window(days30d),
        ...(days1y === undefined ? {} : { '1y': window(days1y) }),
      },
    });

  it('labels a row stored before the app kept a year with its 30 days, as 30d', () => {
    expect(popularityPlaysLabel(snapshot(250))).toBe('0.3k 30d');
  });

  it('prints small counts as they are, and nothing when there were no plays', () => {
    expect(popularityPlaysLabel(snapshot(0, 42))).toBe('42 1y');
    expect(popularityPlaysLabel(snapshot(0, 0))).toBeUndefined();
    expect(popularityPlaysLabel(null)).toBeUndefined();
  });
});
