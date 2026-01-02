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
}
