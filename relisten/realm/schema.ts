// Create a configuration object
import { createRealmContext, Realm } from '@realm/react';
import { Artist } from './models/artist';
import { Year } from './models/year';
import { Show } from './models/show';
import { Venue } from './models/venue';
import { Source } from './models/source';
import { SourceSet } from './models/source_set';
import { SourceTrack } from './models/source_track';
import { UrlRequestMetadata } from '@/relisten/realm/models/url_request_metadata';
import { RouteFilterConfig } from '@/relisten/realm/models/route_filter_config';
import { Tour } from './models/tour';
import { Song } from './models/song';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { PlayerState } from '@/relisten/realm/models/player_state';
import { UserSettings } from './models/user_settings';

// uncomment to show realm queries (measured in microseconds):
// Realm.setLogLevel('debug');

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
    SourceTrack,
    UrlRequestMetadata,
    RouteFilterConfig,
    SourceTrackOfflineInfo,
    PlaybackHistoryEntry,
    PlayerState,
    UserSettings,
  ],
  schemaVersion: 6,
};

export const { RealmProvider, useRealm, useObject, useQuery } = createRealmContext(realmConfig);

export let realm: Realm | undefined = undefined;

export function setRealm(newRealm: Realm | undefined) {
  if (realm !== newRealm) {
    console.info('Realm database path', newRealm?.path);
    realm = newRealm;
  }
}
