import { describe, expect, it } from 'vitest';
import { playerTransportTransition } from './player_transport_transition';

describe('scrolling player transport handoff', () => {
  const collapsePositions = Array.from({ length: 201 }, (_, index) => index / 200);

  it.each([
    ['collapse', collapsePositions],
    ['expand', [...collapsePositions].reverse()],
  ] as const)('keeps usable playback controls throughout a slow %s', (_direction, positions) => {
    for (const progress of positions) {
      const transition = playerTransportTransition(progress);
      const ownerOpacity = transition.compactOwnsControls
        ? transition.compactOpacity
        : transition.expandedOpacity;

      // Input and VoiceOver follow the dominant view, before the outgoing
      // controls fade away. Half-visible controls are too weak for the handoff.
      expect(ownerOpacity).toBeGreaterThanOrEqual(0.79);
    }
  });

  it('hands control back to the expanded player when a partial collapse is cancelled', () => {
    const positions = [0, 0.2, 0.48, 0.42, 0.2, 0];
    const compactOwnership = positions.map(
      (progress) => playerTransportTransition(progress).compactOwnsControls
    );

    expect(compactOwnership).toEqual([false, false, true, false, false, false]);
    expect(playerTransportTransition(0).expandedOpacity).toBe(1);
  });

  it('clips the outgoing controls only after input moves to the compact header', () => {
    for (const progress of collapsePositions) {
      const transition = playerTransportTransition(progress);
      if (transition.expandedClipProgress > 0) {
        expect(transition.compactOwnsControls).toBe(true);
      }
      if (transition.compactOpacity === 1) {
        expect(transition.expandedClipProgress).toBeCloseTo(1);
      }
    }
  });

  it.each([-1, -0.1, 0, 0.4, 0.5, 1, 1.5])(
    'keeps fade and clipping values bounded during native overscroll at %s',
    (progress) => {
      const { compactOpacity, expandedOpacity, expandedClipProgress } =
        playerTransportTransition(progress);
      for (const value of [compactOpacity, expandedOpacity, expandedClipProgress]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  );
});
