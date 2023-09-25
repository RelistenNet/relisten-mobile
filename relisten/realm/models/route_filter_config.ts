import Realm from 'realm';

export class RouteFilterConfig extends Realm.Object<RouteFilterConfig> {
  static schema: Realm.ObjectSchema = {
    name: 'RouteFilterConfig',
    primaryKey: 'pathname',
    properties: {
      pathname: 'string',
      serializedFilters: 'string',
    },
  };

  path!: string;
  serializedFilters!: string;
}
