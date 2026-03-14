import { useEffect } from 'react';
import { useObject, useRealm } from '@/relisten/realm/schema';
import {
  DEFAULT_LASTFM_SETTINGS_SENTINEL,
  LastFmSettings,
} from '@/relisten/realm/models/lastfm_settings';

export const useLastFmSettings = () => {
  const realm = useRealm();
  const liveObject = useObject(LastFmSettings, DEFAULT_LASTFM_SETTINGS_SENTINEL, [
    'enabled',
    'username',
    'lastAuthAt',
    'authInvalid',
  ]);

  useEffect(() => {
    if (liveObject) {
      return;
    }

    LastFmSettings.defaultObject(realm);
  }, [liveObject, realm]);

  return liveObject;
};
