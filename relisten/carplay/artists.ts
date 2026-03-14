import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay';
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
import { TodayShowsNetworkBackedBehavior } from '@/relisten/realm/models/shows/today_shows_repo';
import { sample } from 'remeda';
import plur from 'plur';

type ItemMap<T extends { uuid: string }> = Map<string, T>;

type YearShowsResults = YearShows;

const FAVORITES_ACTION_ON_THIS_DAY = 'action:favorites:on-this-day';
const FAVORITES_ACTION_RANDOM = 'action:favorites:random-show';
const ARTIST_ACTION_ON_THIS_DAY = 'action:artist:on-this-day';
const ARTIST_ACTION_RANDOM = 'action:artist:random-show';
const ACTION_SHOW_YEARS = 'action:show:years';

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

    const filtered = artists.filter((artist) => includeArtistForScope(ctx, scope, artist));
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
    const offline = sorted.filter((a) => ctx.libraryIndex.artistHasOfflineTracks(a.uuid));
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
  const showMap: ItemMap<Show> = new Map();
  let currentMode: 'years' | 'shows' | 'today' = 'years';
  let selectedYear: Year | undefined;
  let detailExecutorTeardown: (() => void) | undefined;
  let detailResultsTeardown: (() => void) | undefined;

  const clearDetailBehavior = () => {
    if (detailResultsTeardown) {
      detailResultsTeardown();
      detailResultsTeardown = undefined;
    }

    if (detailExecutorTeardown) {
      detailExecutorTeardown();
      detailExecutorTeardown = undefined;
    }
  };

  ctx.addTeardown(clearDetailBehavior);

  // Keep Years and Shows within one template so CarPlay only sees one pushed screen here.
  const showYears = () => {
    clearDetailBehavior();
    currentMode = 'years';
    selectedYear = undefined;
    showMap.clear();

    const sorted = Array.from(yearMap.values()).sort((a, b) => a.year.localeCompare(b.year));
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
  };

  const showShows = (year: Year) => {
    clearDetailBehavior();
    currentMode = 'shows';
    selectedYear = year;
    showMap.clear();

    template.updateSections([
      {
        header: year.year,
        items: [
          {
            id: ACTION_SHOW_YEARS,
            text: 'Back to Years',
            detailText: artist.name,
            showsDisclosureIndicator: false,
          },
          {
            id: `loading-${year.uuid}`,
            text: 'Loading shows...',
            showsDisclosureIndicator: false,
          },
        ],
      },
    ]);

    const userFilters = {
      isPlayableOffline: scope === 'offline' || scope === 'library' ? true : null,
      isFavorite: scope === 'library' ? true : null,
      operator: 'OR' as const,
    };

    const showsBehavior = createYearShowsNetworkBackedBehavior(
      ctx.realm,
      artist.uuid,
      year.uuid,
      userFilters,
      behaviorOptions
    );
    const showsExecutor = showsBehavior.sharedExecutor(ctx.apiClient);
    const showsResults = showsExecutor.start();

    detailExecutorTeardown = () => showsExecutor.tearDown();
    detailResultsTeardown = () => showsResults.tearDown();

    showsResults.addListener((nextValue) => {
      if (currentMode !== 'shows' || selectedYear?.uuid !== year.uuid) {
        return;
      }

      const value: YearShowsResults = nextValue.data;
      const shows = value?.shows ? Array.from(value.shows) : [];
      const filteredShows = shows.filter((show) => includeShowForScope(ctx, scope, show));
      const sortedShows = filteredShows.sort((a, b) => a.displayDate.localeCompare(b.displayDate));

      showMap.clear();
      for (const show of sortedShows) {
        showMap.set(show.uuid, show);
      }

      template.updateSections([
        {
          header: 'Year',
          items: [
            {
              id: ACTION_SHOW_YEARS,
              text: 'Back to Years',
              detailText: year.year,
              showsDisclosureIndicator: false,
            },
          ],
        },
        {
          header: `${sortedShows.length} ${plur('show', sortedShows.length)}`,
          items:
            sortedShows.length > 0
              ? sortedShows.map((show) => ({
                  id: show.uuid,
                  text: show.displayDate,
                  detailText: formatShowDetail(show),
                  showsDisclosureIndicator: true,
                }))
              : [
                  {
                    id: `empty-${year.uuid}`,
                    text: 'No shows available',
                    detailText: 'Try another year.',
                    showsDisclosureIndicator: false,
                  },
                ],
        },
      ]);
    });
  };

  const showToday = () => {
    clearDetailBehavior();
    currentMode = 'today';
    selectedYear = undefined;
    showMap.clear();

    template.updateSections([
      {
        header: 'On This Day',
        items: [
          {
            id: ACTION_SHOW_YEARS,
            text: 'Back to Years',
            detailText: artist.name,
            showsDisclosureIndicator: false,
          },
          {
            id: `loading-today-${artist.uuid}`,
            text: 'Loading shows...',
            showsDisclosureIndicator: false,
          },
        ],
      },
    ]);

    const todayBehavior = new TodayShowsNetworkBackedBehavior(ctx.realm, [artist.uuid], {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
    const todayExecutor = todayBehavior.sharedExecutor(ctx.apiClient);
    const todayResults = todayExecutor.start();

    detailExecutorTeardown = () => todayExecutor.tearDown();
    detailResultsTeardown = () => todayResults.tearDown();

    todayResults.addListener((nextValue) => {
      if (currentMode !== 'today') {
        return;
      }

      const shows = Array.from(nextValue.data || []).sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );

      showMap.clear();
      for (const show of shows) {
        showMap.set(show.uuid, show);
      }

      template.updateSections([
        {
          header: 'Artist',
          items: [
            {
              id: ACTION_SHOW_YEARS,
              text: 'Back to Years',
              detailText: artist.name,
              showsDisclosureIndicator: false,
            },
          ],
        },
        {
          header: `${shows.length} ${plur('show', shows.length)} on this day`,
          items:
            shows.length > 0
              ? shows.map((show) => ({
                  id: show.uuid,
                  text: show.displayDate,
                  detailText: formatShowDetail(show),
                  showsDisclosureIndicator: true,
                }))
              : [
                  {
                    id: `empty-today-${artist.uuid}`,
                    text: 'No shows on this day',
                    detailText: 'Try another artist or check back later.',
                    showsDisclosureIndicator: false,
                  },
                ],
        },
      ]);
    });
  };

  const template = new ListTemplate({
    title: artist.name,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (currentMode === 'shows' || currentMode === 'today') {
        if (id === ACTION_SHOW_YEARS) {
          showYears();
          return;
        }

        carplay_logger.info('show selected', {
          id,
          artist: artist.uuid,
          year: selectedYear?.uuid,
          scope,
        });
        const show = showMap.get(String(id));
        if (!show) return;

        const sourcesTemplate = createSourcesListTemplate(ctx, scope, artist, show);
        CarPlay.pushTemplate(sourcesTemplate, true);
        return;
      }

      if (id === ARTIST_ACTION_ON_THIS_DAY) {
        showToday();
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

      showShows(year);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading years...'],
  });

  results.addListener((nextValue) => {
    const years = Array.from(nextValue.data || []);
    const filtered = years.filter((year) => includeYearForScope(ctx, scope, year));
    const sorted = filtered.sort((a, b) => a.year.localeCompare(b.year));

    yearMap.clear();
    for (const year of sorted) {
      yearMap.set(year.uuid, year);
    }

    if (currentMode === 'years') {
      showYears();
      return;
    }

    if (selectedYear && !yearMap.has(selectedYear.uuid)) {
      showYears();
    }
  });

  return template;
}

function includeArtistForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, artist: Artist) {
  if (scope === 'offline') {
    return ctx.libraryIndex.artistHasOfflineTracks(artist.uuid);
  }

  if (scope === 'library') {
    return ctx.libraryIndex.artistIsInLibrary(artist.uuid);
  }

  return true;
}

function includeYearForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, year: Year) {
  if (scope === 'offline') {
    return ctx.libraryIndex.yearHasOfflineTracks(year.uuid);
  }

  if (scope === 'library') {
    return ctx.libraryIndex.yearIsInLibrary(year.uuid);
  }

  return true;
}

function includeShowForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, show: Show) {
  if (scope === 'offline') {
    return ctx.libraryIndex.showHasOfflineTracks(show.uuid);
  }

  if (scope === 'library') {
    return ctx.libraryIndex.showIsInLibrary(show.uuid);
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
