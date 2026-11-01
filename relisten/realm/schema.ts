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
import { PLAYER_STATE_SCHEMAS } from '@/relisten/realm/models/player_state';
import { migratePlayerState } from '@/relisten/realm/models/player_state_migration';
import { UserSettings } from '@/relisten/realm/models/user_settings';
import { LastFmSettings } from '@/relisten/realm/models/lastfm_settings';
import { LastFmScrobbleEntry } from '@/relisten/realm/models/lastfm_scrobble_entry';
import {
  AudioAdjustmentPresetModel,
  AudioAdjustmentSettings,
} from '@/relisten/realm/models/audio_adjustment_settings';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { isVerboseProfileLoggingEnabled } from '@/relisten/util/profile_logging';
import {
  CatalogStartupRepairState,
  repairCatalogAtStartup,
} from '@/relisten/realm/catalog_startup_repair';
import { ACCOUNT_REALM_MODELS } from '@/relisten/realm/models/accounts';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import { migrateLegacyFavoritesToAnonymous } from '@/relisten/realm/migrations/favorite_migration';
import { AccountIdentityUpgradeState } from '@/relisten/realm/models/accounts/account_identity_upgrade_state';
import {
  stageLegacyAccountIdentityFields,
  upgradeTypedAccountIdentity,
} from '@/relisten/realm/account_identity_upgrade';
import { V4_CATALOG_REALM_MODELS } from '@/relisten/realm/models/v4_catalog';

if (isVerboseProfileLoggingEnabled()) {
  Realm.setLogger(({ category, level, message }) => {
    console.log(`[Realm ${category} ${level}] ${message}`);
  });

  Realm.setLogLevel('debug', 'Realm.Storage');
  Realm.setLogLevel('debug', 'Realm.Storage.Transaction');
  Realm.setLogLevel('debug', 'Realm.Storage.Notification');
}

export const REALM_SCHEMA_VERSION = 19;

export const REALM_SCHEMA = [
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
  ...PLAYER_STATE_SCHEMAS,
  UserSettings,
  LastFmSettings,
  LastFmScrobbleEntry,
  AudioAdjustmentSettings,
  AudioAdjustmentPresetModel,
  Popularity,
  PopularityWindow,
  PopularityWindows,
  CatalogStartupRepairState,
  AccountIdentityUpgradeState,
  ...ACCOUNT_REALM_MODELS,
  ...FAVORITE_REALM_MODELS,
  ...V4_CATALOG_REALM_MODELS,
];

export const realmConfig: Realm.Configuration = {
  schema: REALM_SCHEMA,
  // Schema 19 removes the unreleased full-artist snapshot while retaining granular v4 state.
  schemaVersion: REALM_SCHEMA_VERSION,
  onMigration: (oldRealm, newRealm) => {
    migratePlayerState(oldRealm, newRealm);
    stageLegacyAccountIdentityFields(oldRealm, newRealm);
    migrateLegacyFavoritesToAnonymous(oldRealm, newRealm);
  },
  // As to not conflict with the prior versions default.realm that isn't readable with this version of the SDK
  path: './relisten.realm',
};

export const { RealmProvider, useRealm, useObject, useQuery } = createRealmContext(realmConfig);

export let realm: Realm | undefined = undefined;
let realmOpenPromise: Promise<Realm> | null = null;

export function setRealm(newRealm: Realm | undefined) {
  if (realm !== newRealm) {
    console.info('Realm database path', newRealm?.path);
    realm = newRealm;
  }
}

/** Completes every startup repair before services can observe the Realm. */
export async function prepareRealmForUse(openedRealm: Realm): Promise<Realm> {
  repairCatalogAtStartup(openedRealm);
  await upgradeTypedAccountIdentity(openedRealm);
  setRealm(openedRealm);
  return openedRealm;
}

export async function openRealm(): Promise<Realm> {
  if (realm) {
    return realm;
  }

  if (!realmOpenPromise) {
    realmOpenPromise = Realm.open(realmConfig)
      .then(async (openedRealm) => {
        try {
          return await prepareRealmForUse(openedRealm);
        } catch (error) {
          openedRealm.close();
          throw error;
        }
      })
      .catch((error) => {
        realmOpenPromise = null;
        throw error;
      });
  }

  return realmOpenPromise;
}
