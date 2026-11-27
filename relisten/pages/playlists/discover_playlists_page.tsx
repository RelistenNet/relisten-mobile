import { Link, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useAccountsApiClient } from '@/relisten/accounts/account_context';
import { ListRow } from '@/relisten/components/list_row';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  playlistAudienceLabel,
  type PlaylistAudience,
} from '@/relisten/playlists/playlist_audience';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';

const sorts = { recent: 'Recent', followers: 'Most followed', plays: 'Most played' } as const;
type Sort = keyof typeof sorts;
interface Card extends PlaylistAudience {
  playlist_id: string;
  public_code: string;
  name: string;
  owner: { username: string };
}
interface Page {
  playlists: Card[];
  next_cursor: string | null;
}

export default function DiscoverPlaylistsPage() {
  const api = useAccountsApiClient();
  const online = useShouldMakeNetworkRequests();
  const group = useGroupSegment();
  const [request, setRequest] = useState<{ sort: Sort; cursor?: string }>({ sort: 'recent' });
  const [page, setPage] = useState<{ sort: Sort; rows: Card[]; next: string | null }>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ sort: request.sort });
    if (request.cursor) params.set('cursor', request.cursor);
    setError(false);
    setLoading(true);
    void api
      .requestAnonymously<Page>(`/v1/public-playlists?${params}`, { signal: controller.signal })
      .then(
        (received) => {
          if (controller.signal.aborted) return;
          setPage((current) => ({
            sort: request.sort,
            rows:
              request.cursor && current?.sort === request.sort
                ? [
                    ...new Map(
                      [...current.rows, ...received.playlists].map((row) => [row.playlist_id, row])
                    ).values(),
                  ]
                : received.playlists,
            next: received.next_cursor,
          }));
          setLoading(false);
        },
        () => {
          if (!controller.signal.aborted) {
            setError(true);
            setLoading(false);
          }
        }
      );
    return () => {
      controller.abort();
    };
  }, [api, online, request]);

  const current = page?.sort === request.sort ? page : undefined;
  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: 'Discover Playlists' }} />
      <View className="flex-row flex-wrap gap-2 p-3">
        {(Object.keys(sorts) as Sort[]).map((sort) => (
          <RelistenButton
            key={sort}
            disabled={sort === request.sort}
            onPress={() => setRequest({ sort })}
          >
            {sorts[sort]}
          </RelistenButton>
        ))}
      </View>
      {!online ? (
        <RelistenText className="p-4">Connect to the internet to browse playlists.</RelistenText>
      ) : (
        <FlatList
          data={current?.rows ?? []}
          keyExtractor={(card) => card.playlist_id}
          renderItem={({ item }) => (
            <Link
              href={{
                pathname: `/relisten/tabs/${group}/playlists/shared/[publicCode]`,
                params: { publicCode: item.public_code },
              }}
              asChild
            >
              <ListRow
                title={item.name}
                subtitle={[`@${item.owner.username}`, playlistAudienceLabel(item)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Link>
          )}
          ListEmptyComponent={
            !loading && !error ? (
              <RelistenText className="p-4">No public playlists yet.</RelistenText>
            ) : undefined
          }
          ListFooterComponent={
            error ? (
              <RelistenButton onPress={() => setRequest({ ...request })}>Try Again</RelistenButton>
            ) : current?.next ? (
              <RelistenButton
                disabled={loading}
                onPress={() => setRequest({ sort: request.sort, cursor: current.next! })}
              >
                Load More
              </RelistenButton>
            ) : undefined
          }
        />
      )}
    </View>
  );
}
