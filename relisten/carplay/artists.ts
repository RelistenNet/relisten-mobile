import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { artistsNetworkBackedBehavior } from '@/relisten/realm/models/artist_repo';
import {
  createYearShowsNetworkBackedBehavior,
  YearShows,
  yearsNetworkBackedModelArrayBehavior,
} from '@/relisten/realm/models/year_repo';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { createSourcesListTemplate } from '@/relisten/carplay/show_templates';
import { createTodayShowsTemplate } from '@/relisten/carplay/today';
import { CarPlayScope, SCOPE_META } from '@/relisten/carplay/scope';
import { formatShowDetail } from '@/relisten/carplay/show_formatters';
import { upsertShowWithSources } from '@/relisten/realm/models/show_repo';
import { sample } from 'remeda';
import plur from 'plur';

type ItemMap<T extends { uuid: string }> = Map<string, T>;

type YearShowsResults = YearShows;

const FAVORITES_ACTION_ON_THIS_DAY = 'action:favorites:on-this-day';
const FAVORITES_ACTION_RANDOM = 'action:favorites:random-show';
const ARTIST_ACTION_ON_THIS_DAY = 'action:artist:on-this-day';
const ARTIST_ACTION_RANDOM = 'action:artist:random-show';

export function createArtistsListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope
): ListTemplate {
  carplay_logger.info('createArtistsListTemplate', { scope });
  const behaviorOptions =
    scope === 'offline'
      ? { fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable }
      : undefined;

  const artistsBehavior = artistsNetworkBackedBehavior(
    ctx.realm,
    scope === 'offline',
    false,
    behaviorOptions
  );
  const executor = artistsBehavior.sharedExecutor(ctx.apiClient);

  const results = executor.start();
  ctx.addTeardown(() => executor.tearDown());

  const artistMap: ItemMap<Artist> = new Map();
  let favoriteArtists: Artist[] = [];

  const template = new ListTemplate({
    title: SCOPE_META[scope].title,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (scope === 'browse') {
        if (id === FAVORITES_ACTION_ON_THIS_DAY && favoriteArtists.length > 0) {
          const todayTemplate = createTodayShowsTemplate(
            ctx,
            scope,
            favoriteArtists,
            'On This Day'
          );
          CarPlay.pushTemplate(todayTemplate, true);
          return;
        }

        if (id === FAVORITES_ACTION_RANDOM && favoriteArtists.length > 0) {
          const randomArtist = sample([...favoriteArtists], 1)[0]!;
          const randomShow = await ctx.apiClient.randomShow(randomArtist.uuid);

          if (randomShow?.data?.uuid) {
            const show = upsertShowWithSources(ctx.realm, randomShow.data);

            if (show && show.artist) {
              const sourcesTemplate = createSourcesListTemplate(ctx, scope, show.artist, show);
              CarPlay.pushTemplate(sourcesTemplate, true);
            }
          }
          return;
        }
      }

      carplay_logger.info('artist selected', { id, scope });
      const artist = artistMap.get(String(id));

      if (!artist) return;

      const yearsTemplate = createYearsListTemplate(ctx, scope, artist);
      CarPlay.pushTemplate(yearsTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading artists...'],
  });

  ctx.addTeardown(() => results.tearDown());

  results.addListener((nextValue) => {
    const isLoading = nextValue.isNetworkLoading;
    const artists = Array.from(nextValue.data || []);

    const filtered = artists.filter((artist) => includeArtistForScope(scope, artist));
    const sorted = filtered.sort((a, b) => a.sortName.localeCompare(b.sortName));

    artistMap.clear();

    for (const artist of sorted) {
      artistMap.set(artist.uuid, artist);
    }

    const sections: ListSection[] = [];

    if ((scope === 'offline' || scope === 'library') && !isLoading && sorted.length === 0) {
      sections.push({
        header: scope === 'offline' ? 'Nothing offline yet' : 'Nothing in your library yet',
        items: [
          {
            text: scope === 'offline' ? 'No offline artists' : 'No favorite artists or shows',
            detailText:
              scope === 'offline'
                ? 'Download shows or tracks to see them here.'
                : 'Favorite artists or shows to see them here.',
          },
        ],
      });

      template.updateSections(sections);
      return;
    }

    const favorites = sorted.filter((a) => a.isFavorite);
    const offline = sorted.filter((a) => a.hasOfflineTracks);
    favoriteArtists = favorites;

    if (scope === 'browse') {
      if (favorites.length > 0) {
        sections.push({
          header: 'Favorites',
          items: [
            {
              id: FAVORITES_ACTION_ON_THIS_DAY,
              text: 'On This Day',
              detailText: 'Shows on this day by favorite artists.',
              showsDisclosureIndicator: true,
            },
            {
              id: FAVORITES_ACTION_RANDOM,
              text: 'Random Show',
              detailText: 'Play a random show by a favorite artist.',
              showsDisclosureIndicator: true,
            },
          ],
        });
      }

      if (favorites.length > 0) {
        sections.push({
          header: 'Favorite Artists',
          items: favorites.map((artist) => artistListItem(artist)),
        });
      }

      const featured = sorted.filter((a) => a.isFeatured());
      if (featured.length > 0) {
        sections.push({
          header: 'Featured',
          items: featured.map((artist) => artistListItem(artist)),
        });
      }

      sections.push({
        header: `${sorted.length} ${plur('artist', sorted.length)}`,
        items: sorted.map((artist) => artistListItem(artist)),
      });
    } else if (scope === 'offline') {
      sections.push({
        header: 'Available Offline',
        items: sorted.map((artist) => artistListItem(artist)),
      });
    } else {
      // library
      if (favorites.length > 0) {
        sections.push({
          header: 'Favorites',
          items: favorites.map((artist) => artistListItem(artist)),
        });
      }
      if (offline.length > 0) {
        sections.push({
          header: 'Downloads',
          items: offline.map((artist) => artistListItem(artist)),
        });
      }
      sections.push({
        header: 'In Library',
        items: sorted.map((artist) => artistListItem(artist)),
      });
    }

    template.updateSections(sections);
  });

  return template;
}

function createYearsListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist
): ListTemplate {
  carplay_logger.info('createYearsListTemplate', { scope, artist: artist.uuid });
  const behaviorOptions =
    scope === 'offline'
      ? { fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable }
      : undefined;

  const yearsBehavior = yearsNetworkBackedModelArrayBehavior(
    ctx.realm,
    scope === 'offline',
    artist.uuid,
    behaviorOptions
  );
  const executor = yearsBehavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());

  const yearMap: ItemMap<Year> = new Map();

  const template = new ListTemplate({
    title: artist.name,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (id === ARTIST_ACTION_ON_THIS_DAY) {
        const todayTemplate = createTodayShowsTemplate(ctx, scope, [artist], 'On This Day');
        CarPlay.pushTemplate(todayTemplate, true);
        return;
      }

      if (id === ARTIST_ACTION_RANDOM) {
        const randomShow = await ctx.apiClient.randomShow(artist.uuid);

        if (randomShow?.data?.uuid) {
          const show = upsertShowWithSources(ctx.realm, randomShow.data);

          if (show && show.artist) {
            const sourcesTemplate = createSourcesListTemplate(ctx, scope, show.artist, show);
            CarPlay.pushTemplate(sourcesTemplate, true);
          }
        }
        return;
      }

      carplay_logger.info('year selected', { id, artist: artist.uuid, scope });
      const year = yearMap.get(String(id));
      if (!year) return;

      const showsTemplate = createShowsListTemplate(ctx, scope, artist, year);
      CarPlay.pushTemplate(showsTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading years...'],
  });

  results.addListener((nextValue) => {
    const years = Array.from(nextValue.data || []);
    const filtered = years.filter((year) => includeYearForScope(scope, year));
    const sorted = filtered.sort((a, b) => a.year.localeCompare(b.year));

    yearMap.clear();
    for (const year of sorted) {
      yearMap.set(year.uuid, year);
    }

    const items = sorted.map((year) => ({
      id: year.uuid,
      text: year.year,
      detailText: `${year.showCount} ${plur('show', year.showCount)} • ${year.sourceCount} ${plur('tape', year.sourceCount)}`,
      showsDisclosureIndicator: true,
    }));

    const sections: ListSection[] = [
      {
        header: 'Actions',
        items: [
          {
            id: ARTIST_ACTION_ON_THIS_DAY,
            text: 'On This Day',
            detailText: `Shows on this day by ${artist.name}.`,
            showsDisclosureIndicator: true,
          },
          {
            id: ARTIST_ACTION_RANDOM,
            text: 'Random Show',
            detailText: `Play a random ${artist.name} show.`,
            showsDisclosureIndicator: true,
          },
        ],
      },
      {
        header: `${sorted.length} ${plur('year', sorted.length)}`,
        items,
      },
    ];

    template.updateSections(sections);
  });

  return template;
}

function createShowsListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist,
  year: Year
): ListTemplate {
  carplay_logger.info('createShowsListTemplate', { scope, artist: artist.uuid, year: year.uuid });
  const userFilters = {
    isPlayableOffline: scope === 'offline' ? true : null,
    isFavorite: scope === 'library' ? true : null,
    operator: 'OR' as const,
  };

  const options =
    scope === 'offline'
      ? { fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable }
      : undefined;

  const behavior = createYearShowsNetworkBackedBehavior(
    ctx.realm,
    artist.uuid,
    year.uuid,
    userFilters,
    options
  );
  const executor = behavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());

  const showMap: ItemMap<Show> = new Map();

  const template = new ListTemplate({
    title: `${artist.name} • ${year.year}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      carplay_logger.info('show selected', { id, artist: artist.uuid, year: year.uuid });
      const show = showMap.get(String(id));
      if (!show) return;

      const sourcesTemplate = createSourcesListTemplate(ctx, scope, artist, show);
      CarPlay.pushTemplate(sourcesTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading shows...'],
  });

  results.addListener((nextValue) => {
    const value: YearShowsResults = nextValue.data;
    const shows = value?.shows ? Array.from(value.shows) : [];

    const filteredShows = shows.filter((show) => includeShowForScope(scope, show));
    const sorted = filteredShows.sort((a, b) => a.displayDate.localeCompare(b.displayDate));

    showMap.clear();
    for (const show of sorted) {
      showMap.set(show.uuid, show);
    }

    const items = sorted.map((show) => ({
      id: show.uuid,
      text: show.displayDate,
      detailText: formatShowDetail(show),
      showsDisclosureIndicator: true,
    }));

    template.updateSections([
      {
        header: `${sorted.length} ${plur('show', sorted.length)}`,
        items,
      },
    ]);
  });

  return template;
}

function includeArtistForScope(scope: CarPlayScope, artist: Artist) {
  if (scope === 'offline') {
    return artist.hasOfflineTracks;
  }

  if (scope === 'library') {
    return (
      artist.isFavorite ||
      artist.hasOfflineTracks ||
      artist.sourceTracks.filtered('show.isFavorite == true').length > 0
    );
  }

  return true;
}

function includeYearForScope(scope: CarPlayScope, year: Year) {
  if (scope === 'offline') {
    return year.hasOfflineTracks;
  }

  if (scope === 'library') {
    return (
      year.hasOfflineTracks || year.sourceTracks.filtered('show.isFavorite == true').length > 0
    );
  }

  return true;
}

function includeShowForScope(scope: CarPlayScope, show: Show) {
  if (scope === 'offline') {
    return show.hasOfflineTracks;
  }

  if (scope === 'library') {
    return show.isFavorite || show.hasOfflineTracks;
  }

  return true;
}

function artistListItem(artist: Artist) {
  return {
    id: artist.uuid,
    text: artist.name,
    detailText: `${artist.showCount} ${plur('show', artist.showCount)} • ${artist.sourceCount} ${plur('tape', artist.sourceCount)}`,
    showsDisclosureIndicator: true,
  };
}
