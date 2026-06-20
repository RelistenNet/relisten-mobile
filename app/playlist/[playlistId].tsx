import { Redirect, useLocalSearchParams } from 'expo-router';

function firstStringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PlaylistShareLinkRoute() {
  const { playlistId } = useLocalSearchParams<{ playlistId?: string | string[] }>();
  const safePlaylistId = firstStringParam(playlistId);

  return (
    <Redirect
      href={{
        pathname: '/relisten/tabs',
        params: safePlaylistId ? { pendingPlaylistId: safePlaylistId } : {},
      }}
    />
  );
}
