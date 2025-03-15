import Realm from 'realm';
import { log } from '@/relisten/util/logging';

const logger = log.extend('user-settings');

export const DEFAULT_SETTINGS_SENTINEL = '__SETTINGS__';

export enum AutocacheDeleteFirstSetting {
  OldestPlayed = 'oldest_played',
  OldestCached = 'oldest_cached',
}

export enum AutocacheStreamedMusicSetting {
  Always = 'always',
  Never = 'never',
}

export enum AutoplayDeepLinkToTrackSetting {
  PlayTrack = 'play_track',
  ShowSource = 'show_source',
}

export enum TrackListeningHistorySetting {
  Always = 'always',
  Never = 'never',
}

export enum ShowOfflineTabSetting {
  Always = 'always',
  Never = 'never',
  WhenOffline = 'when_offline',
}

export enum OfflineModeSetting {
  Automatic = 'automatic',
  AlwaysOffline = 'always_offline',
}

export enum DownloadViaCellularDataSetting {
  Always = 'always',
  Never = 'never',
}

export const DEFAULT_SETTINGS_OBJ = Object.freeze({
  key: DEFAULT_SETTINGS_SENTINEL,
  trackListeningHistory: TrackListeningHistorySetting.Always,
  downloadViaCellularData: DownloadViaCellularDataSetting.Always,
  offlineMode: OfflineModeSetting.Automatic,
  showOfflineTab: ShowOfflineTabSetting.Always,
  autocacheStreamedMusic: AutocacheStreamedMusicSetting.Never,
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB: 1000 * 10, // 10GB
  autocacheDeleteFirst: AutocacheDeleteFirstSetting.OldestCached,
  autoplayDeepLinkToTrack: AutoplayDeepLinkToTrackSetting.PlayTrack,
});

export interface UserSettingsProps {
  key: string;
  trackListeningHistory: TrackListeningHistorySetting;
  downloadViaCellularData: DownloadViaCellularDataSetting;
  offlineMode: OfflineModeSetting;
  showOfflineTab: ShowOfflineTabSetting;
  autocacheStreamedMusic: AutocacheStreamedMusicSetting;
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB: number;
  autocacheDeleteFirst: AutocacheDeleteFirstSetting;
  autoplayDeepLinkToTrack: AutoplayDeepLinkToTrackSetting;
}

export class UserSettings extends Realm.Object<UserSettings> implements Partial<UserSettingsProps> {
  static schema: Realm.ObjectSchema = {
    name: 'UserSettings',
    primaryKey: 'key',
    properties: {
      key: 'string',
      // only store non-defaults -- this makes sure that we can easily change defaults if we need to
      trackListeningHistory: { type: 'string', optional: true, default: undefined },
      downloadViaCellularData: { type: 'string', optional: true, default: undefined },
      offlineMode: { type: 'string', optional: true, default: undefined },
      showOfflineTab: { type: 'string', optional: true, default: undefined },
      autocacheStreamedMusic: { type: 'string', optional: true, default: undefined },
      // min available storage to autosave when streaming
      autocacheMinAvailableStorageMB: { type: 'int', optional: true, default: undefined },
      autocacheDeleteFirst: { type: 'string', optional: true, default: undefined },
      autoplayDeepLinkToTrack: { type: 'string', optional: true, default: undefined },
    },
  };

  static defaultObject(realm: Realm) {
    const obj = realm.objectForPrimaryKey(UserSettings, DEFAULT_SETTINGS_SENTINEL);

    if (obj === null) {
      return realm.write(() => {
        return realm.create(UserSettings, { key: DEFAULT_SETTINGS_SENTINEL });
      });
    }

    return obj;
  }

  static upsert(realm: Realm, props: Partial<Omit<UserSettingsProps, 'key'>>): UserSettings {
    const obj = this.defaultObject(realm);

    return realm.write(() => {
      return obj.upsert(props);
    });
  }

  upsert(props: Partial<Omit<UserSettingsProps, 'key'>>): UserSettings {
    // yes, this is very repetitive right now, but it will make it easier to add custom behavior later as this object matures
    if (props.trackListeningHistory !== undefined && props.trackListeningHistory !== null) {
      if (props.trackListeningHistory === DEFAULT_SETTINGS_OBJ.trackListeningHistory) {
        this.trackListeningHistory = undefined;
      } else {
        this.trackListeningHistory = props.trackListeningHistory;
      }
    }

    if (props.downloadViaCellularData !== undefined && props.downloadViaCellularData !== null) {
      if (props.downloadViaCellularData === DEFAULT_SETTINGS_OBJ.downloadViaCellularData) {
        this.downloadViaCellularData = undefined;
      } else {
        this.downloadViaCellularData = props.downloadViaCellularData;
      }
    }

    if (props.offlineMode !== undefined && props.offlineMode !== null) {
      if (props.offlineMode === DEFAULT_SETTINGS_OBJ.offlineMode) {
        this.offlineMode = undefined;
      } else {
        this.offlineMode = props.offlineMode;
      }
    }

    if (props.showOfflineTab !== undefined && props.showOfflineTab !== null) {
      if (props.showOfflineTab === DEFAULT_SETTINGS_OBJ.showOfflineTab) {
        this.showOfflineTab = undefined;
      } else {
        this.showOfflineTab = props.showOfflineTab;
      }
    }

    if (props.autocacheStreamedMusic !== undefined && props.autocacheStreamedMusic !== null) {
      if (props.autocacheStreamedMusic === DEFAULT_SETTINGS_OBJ.autocacheStreamedMusic) {
        this.autocacheStreamedMusic = undefined;
      } else {
        this.autocacheStreamedMusic = props.autocacheStreamedMusic;
      }
    }

    if (
      props.autocacheMinAvailableStorageMB !== undefined &&
      props.autocacheMinAvailableStorageMB !== null
    ) {
      if (
        props.autocacheMinAvailableStorageMB === DEFAULT_SETTINGS_OBJ.autocacheMinAvailableStorageMB
      ) {
        this.autocacheMinAvailableStorageMB = undefined;
      } else {
        this.autocacheMinAvailableStorageMB = props.autocacheMinAvailableStorageMB;
      }
    }

    if (props.autocacheDeleteFirst !== undefined && props.autocacheDeleteFirst !== null) {
      if (props.autocacheDeleteFirst === DEFAULT_SETTINGS_OBJ.autocacheDeleteFirst) {
        this.autocacheDeleteFirst = undefined;
      } else {
        this.autocacheDeleteFirst = props.autocacheDeleteFirst;
      }
    }

    if (props.autoplayDeepLinkToTrack !== undefined && props.autoplayDeepLinkToTrack !== null) {
      if (props.autoplayDeepLinkToTrack === DEFAULT_SETTINGS_OBJ.autoplayDeepLinkToTrack) {
        this.autoplayDeepLinkToTrack = undefined;
      } else {
        this.autoplayDeepLinkToTrack = props.autoplayDeepLinkToTrack;
      }
    }

    logger.debug('Settings upsert performed: ' + this.debugState());

    return this;
  }

  key!: string;
  trackListeningHistory?: TrackListeningHistorySetting;
  downloadViaCellularData?: DownloadViaCellularDataSetting;
  offlineMode?: OfflineModeSetting;
  showOfflineTab?: ShowOfflineTabSetting;
  autocacheStreamedMusic?: AutocacheStreamedMusicSetting;
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB?: number;
  autocacheDeleteFirst?: AutocacheDeleteFirstSetting;
  autoplayDeepLinkToTrack?: AutoplayDeepLinkToTrackSetting;

  trackListeningHistoryWithDefault() {
    if (this.trackListeningHistory !== undefined && this.trackListeningHistory !== null) {
      return this.trackListeningHistory;
    }

    return DEFAULT_SETTINGS_OBJ.trackListeningHistory;
  }

  downloadViaCellularDataWithDefault() {
    if (this.downloadViaCellularData !== undefined && this.downloadViaCellularData !== null) {
      return this.downloadViaCellularData;
    }

    return DEFAULT_SETTINGS_OBJ.downloadViaCellularData;
  }

  offlineModeWithDefault() {
    if (this.offlineMode !== undefined && this.offlineMode !== null) {
      return this.offlineMode;
    }

    return DEFAULT_SETTINGS_OBJ.offlineMode;
  }

  showOfflineTabWithDefault() {
    if (this.showOfflineTab !== undefined && this.showOfflineTab !== null) {
      return this.showOfflineTab;
    }

    return DEFAULT_SETTINGS_OBJ.showOfflineTab;
  }

  autocacheStreamedMusicWithDefault() {
    if (this.autocacheStreamedMusic !== undefined && this.autocacheStreamedMusic !== null) {
      return this.autocacheStreamedMusic;
    }

    return DEFAULT_SETTINGS_OBJ.autocacheStreamedMusic;
  }

  autocacheMinAvailableStorageMBWithDefault() {
    if (
      this.autocacheMinAvailableStorageMB !== undefined &&
      this.autocacheMinAvailableStorageMB !== null
    ) {
      return this.autocacheMinAvailableStorageMB;
    }

    return DEFAULT_SETTINGS_OBJ.autocacheMinAvailableStorageMB;
  }

  autocacheDeleteFirstWithDefault() {
    if (this.autocacheDeleteFirst !== undefined && this.autocacheDeleteFirst !== null) {
      return this.autocacheDeleteFirst;
    }

    return DEFAULT_SETTINGS_OBJ.autocacheDeleteFirst;
  }

  autoplayDeepLinkToTrackWithDefault() {
    if (this.autoplayDeepLinkToTrack !== undefined && this.autoplayDeepLinkToTrack !== null) {
      return this.autoplayDeepLinkToTrack;
    }

    return DEFAULT_SETTINGS_OBJ.autoplayDeepLinkToTrack;
  }

  debugState() {
    return `
RelistenUserSettings
  key=${this.key}
  trackListeningHistory=${this.trackListeningHistory}, resolvedValue=${this.trackListeningHistoryWithDefault()}
  downloadViaCellularData=${this.downloadViaCellularData}, resolvedValue=${this.downloadViaCellularDataWithDefault()}
  offlineMode=${this.offlineMode}, resolvedValue=${this.offlineModeWithDefault()}
  showOfflineTab=${this.showOfflineTab}, resolvedValue=${this.showOfflineTabWithDefault()}
  autocacheStreamedMusic=${this.autocacheStreamedMusic}, resolvedValue=${this.autocacheStreamedMusicWithDefault()}
  autocacheMinAvailableStorageMB=${this.autocacheMinAvailableStorageMB}, resolvedValue=${this.autocacheMinAvailableStorageMBWithDefault()}
  autocacheDeleteFirst=${this.autocacheDeleteFirst}, resolvedValue=${this.autocacheDeleteFirstWithDefault()}
  autoplayDeepLinkToTrack=${this.autoplayDeepLinkToTrack}, resolvedValue=${this.autoplayDeepLinkToTrackWithDefault()}
    `.trim();
  }
}
