import { createElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');

const state = vi.hoisted(() => ({ song: null as unknown }));
vi.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: () => {} }),
  useLocalSearchParams: () => ({ artistUuid: 'artist', songUuid: 'song' }),
}));
vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('@/relisten/util/netinfo', () => ({
  useShouldMakeNetworkRequests: () => true,
}));
vi.mock('@/relisten/realm/models/shows/song_shows_repo', () => ({
  useArtistSongShows: () => ({
    data: { song: { song: state.song, shows: [], isAvailable: !!state.song } },
    isNetworkLoading: !state.song,
  }),
}));
vi.mock('@/relisten/components/non_ideal_state', () => ({
  NonIdealState: () => null,
}));
vi.mock('@/relisten/components/refresh_context', () => ({
  RefreshContextProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/relisten/components/screens/disappearing_title_screen', () => ({
  DisappearingHeaderScreen: ({ ListHeaderComponent }: { ListHeaderComponent: ReactElement }) =>
    ListHeaderComponent,
}));
vi.mock('@/relisten/components/relisten_text', () => ({
  RelistenText: 'span',
}));
vi.mock('@/relisten/components/flex', () => ({ default: 'div' }));
vi.mock('@/relisten/components/favorite_icon_button', () => ({
  FavoriteTargetButton: () => null,
}));
vi.mock('@/relisten/components/plur', () => ({
  default: ({ count, word }: { count: number; word: string }) => `${count} ${word}s`,
}));
vi.mock('@/relisten/components/filtering/filters', () => ({
  SortDirection: { Ascending: 'asc' },
}));
vi.mock('@/relisten/components/shows_list', () => ({
  ShowFilterKey: { Date: 'date' },
  ShowListContainer: 'div',
}));

import SongDetailPage from '@/app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/song/[songUuid]/index';

describe('song detail header', () => {
  it('leaves song metadata empty while the online selection is loading', () => {
    state.song = null;
    const html = renderToStaticMarkup(createElement(SongDetailPage));
    expect(html.replace(/<[^>]*>/g, '')).toBe('');
  });

  it('shows the loaded song and show count without a recordings shortcut', () => {
    state.song = {
      name: 'Althea',
      showCount: 283,
      recordingCount: 2843,
      favorite: {},
    };
    const html = renderToStaticMarkup(createElement(SongDetailPage));
    expect(html).toContain('Althea');
    expect(html).toContain('283 shows');
    expect(html).not.toMatch(/recording|2843/i);
  });
});
