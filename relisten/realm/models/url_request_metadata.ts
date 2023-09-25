import Realm from 'realm';

export class UrlRequestMetadata extends Realm.Object<UrlRequestMetadata> {
  static schema: Realm.ObjectSchema = {
    name: 'UrlRequestMetadata',
    primaryKey: 'url',
    properties: {
      url: 'string',
      etag: 'string',
      lastRequestCompletedAt: 'date',
    },
  };

  url!: string;
  etag!: string;
  lastRequestCompletedAt!: Date;
}
