import Realm from 'realm';

export const DEFAULT_SETTINGS_SENTINAL = '__SETTINGS__';

export enum AutocacheDeleteFirst {
  OldestPlayed,
  OldestCached,
}

export const DEFAULT_SETTINGS_OBJ = Object.freeze({
  key: DEFAULT_SETTINGS_SENTINAL,
  trackListeningHistory: true,
  allowDownloadViaCellularData: true,
  offlineMode: false,
  showOfflineTab: false,
  autocacheStreamedMusic: true,
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB: 1024 * 10, // 10gb
  autocacheDeleteFirst: AutocacheDeleteFirst.OldestCached,
});

interface UserSettingsProps {
  key: string;
  trackListeningHistory: boolean;
  allowDownloadViaCellularData: boolean;
  offlineMode: boolean;
  showOfflineTab: false;
  autocacheStreamedMusic: boolean;
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB: number;
  autocacheDeleteFirst: AutocacheDeleteFirst;
}

export class UserSettings extends Realm.Object<UserSettings> {
  static schema: Realm.ObjectSchema = {
    name: 'UserSettings',
    primaryKey: 'key',
    properties: {
      key: 'string',
      trackListeningHistory: 'bool',
      allowDownloadViaCellularData: 'bool',
      offlineMode: 'bool',
      showOfflineTab: 'bool',
      autocacheStreamedMusic: 'bool',
      // min available storage to autosave when streaming
      autocacheMinAvailableStorageMB: 'int',
      autocacheDeleteFirst: 'int',
    },
  };

  static defaultObject(realm: Realm) {
    return realm.objectForPrimaryKey(UserSettings, DEFAULT_SETTINGS_SENTINAL);
  }

  static upsert(realm: Realm, props: Omit<UserSettingsProps, 'key'>): UserSettings {
    const obj = this.defaultObject(realm);

    return realm.write(() => {
      if (obj) {
        Object.entries(props).forEach(([key, value]) => {
          // @ts-expect-error ignore
          obj[key] = value;
        });
        // obj.trackListeningHistory = props.trackListeningHistory;
        // obj.allowDownloadViaCellularData = props.allowDownloadViaCellularData;
        // obj.offlineMode = props.offlineMode;
        // showOfflineTab: false,
        // showOfflineTab: false,
        // obj.autocacheStreamedMusic = props.autocacheStreamedMusic;
        // obj.autocacheMinAvailableStorageMB = props.autocacheMinAvailableStorageMB;
        // obj.autocacheDeleteFirst = props.autocacheDeleteFirst;
        return obj;
      } else {
        return realm.create(UserSettings, {
          // key: DEFAULT_SETTINGS_SENTINAL,
          ...DEFAULT_SETTINGS_OBJ,
          ...props,
        });
      }
    });
  }

  key!: string;
  trackListeningHistory!: boolean;
  allowDownloadViaCellularData!: boolean;
  offlineMode!: boolean;
  showOfflineTab!: boolean;
  autocacheStreamedMusic!: boolean;
  // min available storage to autosave when streaming
  autocacheMinAvailableStorageMB!: number;
  autocacheDeleteFirst!: AutocacheDeleteFirst;
}
