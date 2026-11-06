import { createElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: ReactElement): string;
}>('react-dom/server');

const state = vi.hoisted(() => ({
  song: null as unknown,
  venue: null as unknown,
  headerOptions: null as { headerRight?: () => ReactElement | null } | null,
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: (options: typeof state.headerOptions) => {
      state.headerOptions = options;
    },
  }),
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
  FavoriteTargetButton: 'favorite-button',
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

vi.mock('@/relisten/realm/models/shows/venue_shows_repo', () => ({
  useArtistVenueShows: () => ({ data: { venue: { venue: state.venue, shows: [] } } }),
  useGlobalVenueShows: () => ({ data: { venue: state.venue, shows: [] } }),
}));
import ArtistVenueDetailPage from '@/relisten/pages/venues/artist_venue_detail_page';
import GlobalVenueDetailPage from '@/relisten/pages/venues/global_venue_detail_page';

beforeEach(() => {
  state.headerOptions = null;
});

import SongDetailPage from '@/app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/song/[songUuid]/index';

describe('song detail header', () => {
  it('leaves song metadata empty while the online selection is loading', () => {
    state.song = null;
    const html = renderToStaticMarkup(createElement(SongDetailPage));
    expect(html.replace(/<[^>]*>/g, '')).toBe('');
    expect(state.headerOptions?.headerRight?.()).toBeNull();
  });

  it('shows the loaded song and show count without a recordings shortcut', () => {
    state.song = {
      name: 'Althea',
      showCount: 283,
      recordingCount: 2843,
      favorite: { targetKind: 'song', catalogId: 'song_althea' },
    };
    const html = renderToStaticMarkup(createElement(SongDetailPage));
    expect(html).toContain('Althea');
    expect(html).toContain('283 shows');
    expect(html).not.toMatch(/recording|2843|favorite-button/i);
    expect(state.headerOptions?.headerRight?.()?.props).toMatchObject({
      targetKind: 'song',
      catalogId: 'song_althea',
    });
  });
});

describe('venue detail favorites', () => {
  it.each([
    ['artist', ArtistVenueDetailPage],
    ['global', GlobalVenueDetailPage],
  ] as const)(
    'puts the %s venue favorite in the navigation header instead of beside the title',
    (_kind, Page) => {
      state.venue = {
        name: 'Winterland',
        showCount: 5,
        favorite: { targetKind: 'venue', catalogId: 'venue_winterland' },
      };
      const html = renderToStaticMarkup(createElement(Page));
      expect(html).toContain('Winterland');
      expect(html).not.toContain('favorite-button');
      expect(state.headerOptions?.headerRight?.()?.props).toMatchObject({
        targetKind: 'venue',
        catalogId: 'venue_winterland',
      });
    }
  );
});
