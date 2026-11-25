import type { PopularityResource } from '@/relisten/api/catalog/resources';
import Realm from 'realm';

export interface PopularityRequiredProperties {
  momentumScore: number;
  trendRatio: number;
  windows: PopularityWindows;
}

export interface PopularityWindowRequiredProperties {
  plays: number;
  hours: number;
  hotScore: number;
}

export class PopularityWindow
  extends Realm.Object<PopularityWindow, keyof PopularityWindowRequiredProperties>
  implements PopularityWindowRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'PopularityWindow',
    embedded: true,
    properties: {
      plays: 'int',
      hours: 'double',
      hotScore: 'double',
    },
  };

  plays!: number;
  hours!: number;
  hotScore!: number;
}

export interface PopularityWindowsRequiredProperties {
  hours48h: PopularityWindow;
  days7d: PopularityWindow;
  days30d: PopularityWindow;
}

export class PopularityWindows
  extends Realm.Object<PopularityWindows, keyof PopularityWindowsRequiredProperties>
  implements PopularityWindowsRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'PopularityWindows',
    embedded: true,
    properties: {
      hours48h: 'PopularityWindow',
      days7d: 'PopularityWindow',
      days30d: 'PopularityWindow',
      // Added in schema 29; rows stored before the next catalog refresh lack it.
      days1y: 'PopularityWindow',
    },
  };

  hours48h!: PopularityWindow;
  days7d!: PopularityWindow;
  days30d!: PopularityWindow;
  days1y?: PopularityWindow;
}

export class Popularity
  extends Realm.Object<Popularity, keyof PopularityRequiredProperties>
  implements PopularityRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'Popularity',
    embedded: true,
    properties: {
      momentumScore: 'double',
      trendRatio: 'double',
      windows: 'PopularityWindows',
    },
  };

  momentumScore!: number;
  trendRatio!: number;
  windows!: PopularityWindows;

  snapshot(): PopularitySnapshot {
    const { hours48h, days7d, days30d, days1y } = this.windows;
    return {
      momentumScore: this.momentumScore,
      trendRatio: this.trendRatio,
      windows: {
        hours48h: storedWindow(hours48h),
        days7d: storedWindow(days7d),
        days30d: storedWindow(days30d),
        ...(days1y ? { days1y: storedWindow(days1y) } : {}),
      },
    };
  }

  static snapshot(
    popularity?: Popularity | PopularitySnapshot | null
  ): PopularitySnapshot | undefined {
    if (!popularity) {
      return undefined;
    }

    return popularity instanceof Popularity ? popularity.snapshot() : popularity;
  }
}

export interface PopularitySnapshot {
  momentumScore: number;
  trendRatio: number;
  windows: {
    hours48h: PopularityWindowRequiredProperties;
    days7d: PopularityWindowRequiredProperties;
    days30d: PopularityWindowRequiredProperties;
    /** Missing on rows stored before schema 29 until their next refresh. */
    days1y?: PopularityWindowRequiredProperties;
  };
}

/** The windows `displayedPlays` reads; a stored `Popularity` and a snapshot both have them. */
interface PlaysWindows {
  windows?: {
    days1y?: { plays: number } | null;
    days30d?: { plays: number } | null;
  } | null;
}

/**
 * The plays rows show and the Popular sorts rank by: the past year's. A row
 * stored before the app kept that window falls back to its 30 days until the
 * catalog refreshes it.
 */
export function displayedPlays(
  popularity?: PlaysWindows | null
): { plays: number; window: '1y' | '30d' } | undefined {
  const { days1y, days30d } = popularity?.windows ?? {};
  if (days1y) {
    return { plays: days1y.plays, window: '1y' };
  }
  return days30d ? { plays: days30d.plays, window: '30d' } : undefined;
}

/** How rows print listening activity: "16.4M 1y", or "0.3k 30d" for an older row. */
export function popularityPlaysLabel(popularity?: PlaysWindows | null): string | undefined {
  const shown = displayedPlays(popularity);
  const count = shortCount(shown?.plays);
  return count && shown ? `${count} ${shown.window}` : undefined;
}

/** The value the Popular sorts compare: the displayed plays, 0 when there are none. */
export function popularSortValue(popularity?: PlaysWindows | null): number {
  return displayedPlays(popularity)?.plays ?? 0;
}

/** `1.4M`, `16.4k`, `0.3k` from 100 up, else the count itself. */
function shortCount(plays: number | undefined): string | undefined {
  if (!plays || plays <= 0) {
    return undefined;
  }
  if (plays >= 1_000_000) {
    return `${(plays / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (plays >= 100) {
    return `${(plays / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return plays.toFixed(0);
}

export function catalogPopularitySnapshot(
  popularity: PopularityResource | null | undefined
): PopularitySnapshot | null {
  if (!popularity) {
    return null;
  }

  const { windows } = popularity;
  return {
    momentumScore: popularity.momentum_score,
    trendRatio: popularity.trend_ratio,
    windows: {
      hours48h: resourceWindow(windows['48h']),
      days7d: resourceWindow(windows['7d']),
      days30d: resourceWindow(windows['30d']),
      ...(windows['1y'] ? { days1y: resourceWindow(windows['1y']) } : {}),
    },
  };
}

function storedWindow(window: PopularityWindow): PopularityWindowRequiredProperties {
  return { plays: window.plays, hours: window.hours, hotScore: window.hotScore };
}

function resourceWindow(window: {
  plays: number;
  hours: number;
  hot_score: number;
}): PopularityWindowRequiredProperties {
  return { plays: window.plays, hours: window.hours, hotScore: window.hot_score };
}
