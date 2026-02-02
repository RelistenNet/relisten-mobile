import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { LastFmClient } from '@/relisten/lastfm/lastfm_client';
import { LastFmSecrets } from '@/relisten/lastfm/lastfm_secrets';
import { LastFmSettings } from '@/relisten/realm/models/lastfm_settings';
import { Realm } from '@realm/react';
import { log } from '@/relisten/util/logging';
import { LastFmScrobbleQueue } from '@/relisten/lastfm/lastfm_scrobble_queue';

const logger = log.extend('lastfm-auth');

const LASTFM_AUTH_TOKEN_KEY = 'lastfm_auth_token';
const LASTFM_AUTH_PATH = 'lastfm-auth';

export const LastFmAuth = {
  async hasPendingAuth(): Promise<boolean> {
    return !!(await AsyncStorage.getItem(LASTFM_AUTH_TOKEN_KEY));
  },
  getCallbackPath() {
    return LASTFM_AUTH_PATH;
  },
  isCallbackUrl(url: string) {
    const parsed = Linking.parse(url);
    const rawPath = parsed.path ?? '';
    const normalizedPath = rawPath.replace(/^\//, '');
    const withoutExpoPrefix = normalizedPath.startsWith('--/')
      ? normalizedPath.slice(3)
      : normalizedPath;

    if (withoutExpoPrefix === LASTFM_AUTH_PATH) {
      return true;
    }

    if (parsed.hostname === LASTFM_AUTH_PATH) {
      return true;
    }

    return false;
  },
  async startAuth(): Promise<void> {
    const client = LastFmClient.fromEnv();

    if (!client) {
      throw new Error('Last.fm API keys are not configured');
    }

    const token = await client.getToken();
    await AsyncStorage.setItem(LASTFM_AUTH_TOKEN_KEY, token);

    const callbackUrl = Linking.createURL(LASTFM_AUTH_PATH);
    const authUrl = client.getAuthUrl(token, callbackUrl);

    await Linking.openURL(authUrl);
  },
  async finishAuth(realm: Realm): Promise<void> {
    const client = LastFmClient.fromEnv();

    if (!client) {
      throw new Error('Last.fm API keys are not configured');
    }

    const token = await AsyncStorage.getItem(LASTFM_AUTH_TOKEN_KEY);

    if (!token) {
      logger.warn('No pending Last.fm token found');
      return;
    }

    const session = await client.getSession(token);
    await LastFmSecrets.setSessionKey(session.key);
    await AsyncStorage.removeItem(LASTFM_AUTH_TOKEN_KEY);

    LastFmSettings.upsert(realm, {
      enabled: true,
      username: session.name,
      lastAuthAt: new Date(),
      authInvalid: false,
    });
  },
  async disconnect(realm: Realm): Promise<void> {
    const queue = new LastFmScrobbleQueue(realm);
    queue.clearAll();
    await LastFmSecrets.clearSessionKey();
    LastFmSettings.upsert(realm, {
      enabled: false,
      username: undefined,
      lastAuthAt: undefined,
      authInvalid: false,
    });
  },
};
