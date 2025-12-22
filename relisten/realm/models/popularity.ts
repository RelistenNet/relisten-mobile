import Realm from 'realm';

export interface PopularityRequiredProperties {
  hotScore: number;
  momentumScore: number;
  trendRatio: number;
  plays30d: number;
  plays48h: number;
}

export class Popularity
  extends Realm.Object<Popularity, keyof PopularityRequiredProperties>
  implements PopularityRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'Popularity',
    embedded: true,
    properties: {
      hotScore: 'double',
      momentumScore: 'double',
      trendRatio: 'double',
      plays30d: 'int',
      plays48h: 'int',
    },
  };

  hotScore!: number;
  momentumScore!: number;
  trendRatio!: number;
  plays30d!: number;
  plays48h!: number;
}
