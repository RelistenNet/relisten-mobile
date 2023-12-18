// Create a configuration object
import { RouteFilterConfig } from '@/relisten/realm/models/route_filter_config';
import { UrlRequestMetadata } from '@/relisten/realm/models/url_request_metadata';
import { createRealmContext, Realm } from '@realm/react';
import { Artist } from './models/artist';
import { Show } from './models/show';
import { Song } from './models/song';
import { Source } from './models/source';
import { SourceSet } from './models/source_set';
import { SourceTrack } from './models/source_track';
import { Tour } from './models/tour';
import { Venue } from './models/venue';
import { Year } from './models/year';

const realmConfig: Realm.Configuration = {
  schema: [
    Artist,
    Year,
    Show,
    Venue,
    Tour,
    Song,
    Source,
    SourceSet,
    SourceTrack.SourceTrackDownloadPauseState,
    SourceTrack,
    UrlRequestMetadata,
    RouteFilterConfig,
  ],
  deleteRealmIfMigrationNeeded: true,
};

export const { RealmProvider, useRealm, useObject, useQuery } = createRealmContext(realmConfig);

export let realm: Realm | undefined = undefined;

export function setRealm(newRealm: Realm | undefined) {
  if (realm !== newRealm) {
    console.info('Realm database path', newRealm?.path);
    realm = newRealm;
  }
}
