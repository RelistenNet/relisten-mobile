import Realm from 'realm';
import { DEFAULT_SETTINGS_SENTINEL, UserSettings } from '@/relisten/realm/models/user_settings';
import { RealmObjectValueStream } from '@/relisten/realm/value_streams';

type Listener = () => void;

export class UserSettingsStore {
  private readonly listeners = new Set<Listener>();
  private readonly settingsStream: RealmObjectValueStream<UserSettings>;
  private version = 0;
  private emitScheduled = false;

  constructor(realm: Realm.Realm) {
    UserSettings.defaultObject(realm);
    this.settingsStream = new RealmObjectValueStream(
      realm,
      UserSettings,
      DEFAULT_SETTINGS_SENTINEL
    );
    this.settingsStream.addListener(() => {
      this.scheduleEmit();
    });
  }

  tearDown() {
    this.settingsStream.tearDown();
    this.listeners.clear();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.version;
  };

  current() {
    return this.settingsStream.currentValue!;
  }

  private scheduleEmit() {
    if (this.emitScheduled) {
      return;
    }

    this.emitScheduled = true;

    queueMicrotask(() => {
      this.emitScheduled = false;
      this.version += 1;
      for (const listener of this.listeners) {
        listener();
      }
    });
  }
}
