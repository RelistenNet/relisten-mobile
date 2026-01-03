import { useObject, useRealm } from '@/relisten/realm/schema';
import {
  DEFAULT_LASTFM_SETTINGS_SENTINEL,
  LastFmSettings,
} from '@/relisten/realm/models/lastfm_settings';

let _calledDefaultObject = false;

export const useLastFmSettings = () => {
  const realm = useRealm();

  if (!_calledDefaultObject) {
    LastFmSettings.defaultObject(realm);
    _calledDefaultObject = true;
  }

  const liveObject = useObject(LastFmSettings, DEFAULT_LASTFM_SETTINGS_SENTINEL)!;

  return liveObject!;
};
