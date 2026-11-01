import { describe, expect, it } from 'vitest';

import { trackNormalizationSummary } from './track_normalization_summary';

describe('trackNormalizationSummary', () => {
  it('keeps matched medley parts in order and marks a segue', () => {
    expect(
      trackNormalizationSummary({
        state: 'interpreted',
        parts: [
          {
            text: 'Mama Tried',
            state: 'matched',
            segueAfter: true,
            song: { name: 'Mama Tried' },
          },
          {
            text: 'Me And My Uncle',
            state: 'matched',
            segueAfter: false,
            song: { name: 'Me And My Uncle' },
          },
        ],
      })
    ).toBe('Interpreted: Mama Tried → Me And My Uncle');
  });

  it('makes unresolved and non-song partial parts explicit', () => {
    expect(
      trackNormalizationSummary({
        state: 'partial',
        parts: [
          {
            text: 'Beat It On Down The Line',
            state: 'matched',
            segueAfter: false,
            song: { name: 'Beat It On Down The Line' },
          },
          { text: 'The', state: 'unresolved', segueAfter: false },
          { text: 'Crowd', state: 'non_song', segueAfter: false },
        ],
      })
    ).toBe(
      'Partial interpretation: Beat It On Down The Line · The (unresolved) · Crowd (non-song)'
    );
  });

  it('adds no secondary line for unavailable or absent interpretation', () => {
    expect(trackNormalizationSummary()).toBeNull();
    expect(trackNormalizationSummary({ state: 'unavailable', parts: [] })).toBeNull();
  });
});
