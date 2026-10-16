import { type NativeScrollEvent } from 'react-native';
import { type PlayerTimelineLayout } from './player_timeline_layout';

const ARRIVAL_TOLERANCE = 1;
type Breakpoint = 'expanded' | 'compact';

/** One deliberate scroll can confirm one new breakpoint, after native scrolling stops. */
export class PlayerTimelineHaptics {
  private pending?: {
    expanded: number;
    compact: number;
    origin?: Breakpoint;
    target?: number;
  };

  /** Arms feedback for a user drag or an explicit scroll button. */
  begin(offset: number, layout: PlayerTimelineLayout, compactHeight: number, target?: number) {
    const expanded = layout.y;
    const compact = layout.y + layout.height - compactHeight;
    this.pending =
      compact > expanded
        ? { expanded, compact, origin: this.breakpoint(offset, expanded, compact), target }
        : undefined;
  }

  cancel() {
    this.pending = undefined;
  }

  /** Consumes a completed move; true means one new breakpoint needs feedback. */
  settle(offset: number, layout: PlayerTimelineLayout, compactHeight: number) {
    const pending = this.pending;
    if (!pending) return false;
    if (
      pending.expanded !== layout.y ||
      pending.compact !== layout.y + layout.height - compactHeight
    ) {
      this.cancel();
      return false;
    }
    // A superseded native animation may still report its old destination.
    if (pending.target !== undefined && Math.abs(offset - pending.target) > ARRIVAL_TOLERANCE) {
      return false;
    }
    this.cancel();
    const destination = this.breakpoint(offset, pending.expanded, pending.compact);
    return destination !== undefined && destination !== pending.origin;
  }

  private breakpoint(offset: number, expanded: number, compact: number): Breakpoint | undefined {
    if (Math.abs(offset - expanded) <= ARRIVAL_TOLERANCE) return 'expanded';
    if (Math.abs(offset - compact) <= ARRIVAL_TOLERANCE) return 'compact';
    return undefined;
  }
}

/** A release can already be at a breakpoint while native deceleration is still pending. */
export function isPlayerTimelineReleaseAtRest(
  event: Pick<NativeScrollEvent, 'contentOffset' | 'targetContentOffset' | 'velocity'>
) {
  return (
    (event.velocity?.y ?? 0) === 0 &&
    (!event.targetContentOffset ||
      Math.abs(event.targetContentOffset.y - event.contentOffset.y) <= ARRIVAL_TOLERANCE)
  );
}
