import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { UserLibraryApiError } from '@/relisten/api/user_library_client';
import { useRealm } from '@/relisten/realm/schema';
import { createUserLibrarySyncServices } from '@/relisten/user_library/user_library_sync_services';
import {
  exchangeOpenedPlaylistShareToken,
  PlaylistShareTokenExchangeError,
} from '@/relisten/user_library/share_token_exchange';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { log } from '@/relisten/util/logging';

const logger = log.extend('playlist-share-link');

function firstStringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PlaylistShareLinkRoute() {
  const { playlistId, t } = useLocalSearchParams<{
    playlistId?: string | string[];
    t?: string | string[];
  }>();
  const realm = useRealm();
  const services = useMemo(() => createUserLibrarySyncServices(realm), [realm]);
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const safePlaylistId = firstStringParam(playlistId);
  const shareToken = firstStringParam(t);

  useEffect(() => {
    if (!safePlaylistId || !shareToken || !shouldMakeNetworkRequests) {
      return;
    }

    let mounted = true;

    void exchangeOpenedPlaylistShareToken(
      {
        playlistUuidOrShortId: safePlaylistId,
        token: shareToken,
      },
      {
        realm,
        client: services.client,
        authSession: services.authSession,
        secretStore: services.mobileAccessGrantSecretStore,
        platform: shareTokenPlatform(),
      }
    ).catch((error) => {
      if (mounted) {
        logger.warn(
          `playlist share-token exchange failed for ${safePlaylistId}: ${errorCode(error)}`
        );
      }
    });

    return () => {
      mounted = false;
    };
  }, [
    realm,
    safePlaylistId,
    services.authSession,
    services.client,
    services.mobileAccessGrantSecretStore,
    shareToken,
    shouldMakeNetworkRequests,
  ]);

  return (
    <Redirect
      href={{
        pathname: '/relisten/tabs',
        params: safePlaylistId ? { pendingPlaylistId: safePlaylistId } : {},
      }}
    />
  );
}

function shareTokenPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }

  return 'ios';
}

function errorCode(error: unknown) {
  if (error instanceof PlaylistShareTokenExchangeError) {
    return error.code;
  }

  if (error instanceof UserLibraryApiError) {
    return `api_${error.status}`;
  }

  return error instanceof Error ? error.name : 'unknown_error';
}
