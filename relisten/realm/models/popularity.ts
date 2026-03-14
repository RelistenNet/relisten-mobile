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
    },
  };

  hours48h!: PopularityWindow;
  days7d!: PopularityWindow;
  days30d!: PopularityWindow;
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
    return {
      momentumScore: this.momentumScore,
      trendRatio: this.trendRatio,
      windows: {
        hours48h: {
          plays: this.windows.hours48h.plays,
          hours: this.windows.hours48h.hours,
          hotScore: this.windows.hours48h.hotScore,
        },
        days7d: {
          plays: this.windows.days7d.plays,
          hours: this.windows.days7d.hours,
          hotScore: this.windows.days7d.hotScore,
        },
        days30d: {
          plays: this.windows.days30d.plays,
          hours: this.windows.days30d.hours,
          hotScore: this.windows.days30d.hotScore,
        },
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
  };
}
