import { useEffect, useState } from 'react';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useAccountScope, useAccountsApiClient } from '@/relisten/accounts/account_context';
import { playlistAudienceLabel, type PlaylistAudience } from '../playlist_audience';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export function PlaylistAudienceDetail({ audience }: { audience?: PlaylistAudience }) {
  const line = playlistAudienceLabel(audience);
  const popularity = audience?.popularity;
  return line ? (
    <RelistenText className="pb-3 text-center text-gray-300">
      {line}
      {popularity
        ? `\n${(['48h', '7d', '1y'] as const)
            .flatMap((window) => {
              const activity = popularity.windows[window];
              return activity
                ? [`${activity.plays.toLocaleString()} track plays in ${window}`]
                : [];
            })
            .join(' · ')}\nMomentum ${Math.round(popularity.momentum_score * 100)}%`
        : ''}
    </RelistenText>
  ) : null;
}

export function usePublicPlaylistAudience(code?: string | null) {
  const sharing = usePlaylistSharingService();
  const online = useShouldMakeNetworkRequests();
  const [result, setResult] = useState<{ code: string; audience: PlaylistAudience }>();
  useEffect(() => {
    if (!code || !online) {
      return;
    }
    let active = true;
    void sharing.publicSnapshot(code).then(
      (snapshot) => {
        if (active) {
          setResult(snapshot ? { code, audience: snapshot } : undefined);
        }
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [code, online, sharing]);
  return online && result?.code === code ? result?.audience : undefined;
}

export function useLibraryPlaylistAudience(publicPlaylistIds: string[]) {
  // Following or publishing while the list is mounted makes another card eligible.
  const audienceKey = [...publicPlaylistIds].sort().join(',');
  const api = useAccountsApiClient();
  const { generation, isAuthenticated } = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const [result, setResult] = useState<{
    generation: number;
    byId: Map<string, PlaylistAudience>;
  }>();
  useEffect(() => {
    if (!isAuthenticated || !online || !audienceKey) {
      return;
    }
    const controller = new AbortController();
    type Card = PlaylistAudience & { playlist_id: string };
    void api
      .request<{ playlists: Card[]; followed_playlists?: Card[] }>('/v1/library/snapshot', {
        signal: controller.signal,
      })
      .then(
        (snapshot) => {
          if (controller.signal.aborted) return;
          setResult({
            generation,
            byId: new Map(
              [...snapshot.playlists, ...(snapshot.followed_playlists ?? [])].map((card) => [
                card.playlist_id,
                card,
              ])
            ),
          });
        },
        () => {}
      );
    return () => {
      controller.abort();
    };
  }, [api, audienceKey, generation, isAuthenticated, online]);
  return online && isAuthenticated && result?.generation === generation ? result.byId : undefined;
}
