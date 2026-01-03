import Realm from 'realm';
import { log } from '@/relisten/util/logging';

const logger = log.extend('lastfm-settings');

export const DEFAULT_LASTFM_SETTINGS_SENTINEL = '__LASTFM_SETTINGS__';

export const DEFAULT_LASTFM_SETTINGS_OBJ = Object.freeze({
  key: DEFAULT_LASTFM_SETTINGS_SENTINEL,
  enabled: false,
  username: undefined as string | undefined,
  lastAuthAt: undefined as Date | undefined,
  authInvalid: false,
});

export interface LastFmSettingsProps {
  key: string;
  enabled: boolean;
  username?: string;
  lastAuthAt?: Date;
  authInvalid: boolean;
}

export class LastFmSettings
  extends Realm.Object<LastFmSettings>
  implements Partial<LastFmSettingsProps>
{
  static schema: Realm.ObjectSchema = {
    name: 'LastFmSettings',
    primaryKey: 'key',
    properties: {
      key: 'string',
      enabled: { type: 'bool', optional: true, default: undefined },
      username: { type: 'string', optional: true, default: undefined },
      lastAuthAt: { type: 'date', optional: true, default: undefined },
      authInvalid: { type: 'bool', optional: true, default: undefined },
    },
  };

  static defaultObject(realm: Realm) {
    const obj = realm.objectForPrimaryKey(LastFmSettings, DEFAULT_LASTFM_SETTINGS_SENTINEL);

    if (obj === null) {
      return realm.write(() => {
        return realm.create(LastFmSettings, { key: DEFAULT_LASTFM_SETTINGS_SENTINEL });
      });
    }

    return obj;
  }

  static upsert(realm: Realm, props: Partial<Omit<LastFmSettingsProps, 'key'>>): LastFmSettings {
    const obj = this.defaultObject(realm);

    return realm.write(() => {
      return obj.upsert(props);
    });
  }

  upsert(props: Partial<Omit<LastFmSettingsProps, 'key'>>): LastFmSettings {
    if (props.enabled !== undefined && props.enabled !== null) {
      if (props.enabled === DEFAULT_LASTFM_SETTINGS_OBJ.enabled) {
        this.enabled = undefined;
      } else {
        this.enabled = props.enabled;
      }
    }

    if (Object.prototype.hasOwnProperty.call(props, 'username')) {
      if (props.username === DEFAULT_LASTFM_SETTINGS_OBJ.username) {
        this.username = undefined;
      } else {
        this.username = props.username;
      }
    }

    if (Object.prototype.hasOwnProperty.call(props, 'lastAuthAt')) {
      if (props.lastAuthAt === DEFAULT_LASTFM_SETTINGS_OBJ.lastAuthAt) {
        this.lastAuthAt = undefined;
      } else {
        this.lastAuthAt = props.lastAuthAt;
      }
    }

    if (props.authInvalid !== undefined && props.authInvalid !== null) {
      if (props.authInvalid === DEFAULT_LASTFM_SETTINGS_OBJ.authInvalid) {
        this.authInvalid = undefined;
      } else {
        this.authInvalid = props.authInvalid;
      }
    }

    logger.debug('Settings upsert performed: ' + this.debugState());

    return this;
  }

  key!: string;
  enabled?: boolean;
  username?: string;
  lastAuthAt?: Date;
  authInvalid?: boolean;

  enabledWithDefault() {
    if (this.enabled !== undefined && this.enabled !== null) {
      return this.enabled;
    }

    return DEFAULT_LASTFM_SETTINGS_OBJ.enabled;
  }

  authInvalidWithDefault() {
    if (this.authInvalid !== undefined && this.authInvalid !== null) {
      return this.authInvalid;
    }

    return DEFAULT_LASTFM_SETTINGS_OBJ.authInvalid;
  }

  debugState() {
    return `
RelistenLastFmSettings
  key=${this.key}
  enabled=${this.enabled}, resolvedValue=${this.enabledWithDefault()}
  username=${this.username}
  lastAuthAt=${this.lastAuthAt}
  authInvalid=${this.authInvalid}, resolvedValue=${this.authInvalidWithDefault()}
    `.trim();
  }
}
