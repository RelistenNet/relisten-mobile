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
import {
  catalogResultsForScope,
  selectedCatalogObjectForScope,
} from '@/relisten/carplay/catalog_scope';
import { readRetainedCatalogObject } from '@/relisten/realm/catalog_retirement';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

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
  const retainedArtistsStream =
    scope === 'browse'
      ? undefined
      : new RealmQueryValueStream<Artist>(ctx.realm, ctx.realm.objects(Artist));
  if (retainedArtistsStream) {
    ctx.addTeardown(() => retainedArtistsStream.tearDown());
  }

  const artistUuids = new Set<string>();
  let favoriteArtistUuids: string[] = [];

  const template = new ListTemplate({
    title: SCOPE_META[scope].title,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (scope === 'browse') {
        if (id === FAVORITES_ACTION_ON_THIS_DAY && favoriteArtistUuids.length > 0) {
          const todayTemplate = createTodayShowsTemplate(
            ctx,
            scope,
            favoriteArtistUuids,
            'On This Day'
          );
          CarPlay.pushTemplate(todayTemplate, true);
          return;
        }

        if (id === FAVORITES_ACTION_RANDOM && favoriteArtistUuids.length > 0) {
          const randomArtistUuid = sample(favoriteArtistUuids, 1)[0]!;
          const randomShow = await ctx.apiClient.randomShow(randomArtistUuid);

          if (randomShow?.data?.uuid) {
            const upsertedShow = upsertShowWithSources(ctx.realm, randomShow.data);
            const show = upsertedShow
              ? selectedCatalogObjectForScope(
                  ctx.realm,
                  scope,
                  Show,
                  upsertedShow.uuid,
                  'carplay.artists.random-show'
                )
              : undefined;
            const showArtist = show
              ? selectedCatalogObjectForScope(
                  ctx.realm,
                  scope,
                  Artist,
                  show.artistUuid,
                  'carplay.artists.random-show-artist'
                )
              : undefined;

            if (show && showArtist) {
              const sourcesTemplate = createSourcesListTemplate(ctx, scope, showArtist, show);
              CarPlay.pushTemplate(sourcesTemplate, true);
            }
          }
          return;
        }
      }

      carplay_logger.info('artist selected', { id, scope });
      const artistUuid = String(id);
      if (!artistUuids.has(artistUuid)) return;

      const artist = selectedCatalogObjectForScope(
        ctx.realm,
        scope,
        Artist,
        artistUuid,
        'carplay.artists.artist-selection'
      );

      if (!artist || !includeArtistForScope(ctx, scope, artist)) return;

      const yearsTemplate = createYearsListTemplate(ctx, scope, artist);
      CarPlay.pushTemplate(yearsTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading artists...'],
  });

  ctx.addTeardown(() => results.tearDown());

  let isNetworkLoading = true;
  const updateArtists = (artists: Artist[], isLoading: boolean) => {
    const filtered = artists.filter((artist) => includeArtistForScope(ctx, scope, artist));
    const sorted = filtered.sort((a, b) => a.sortName.localeCompare(b.sortName));

    artistUuids.clear();

    for (const artist of sorted) {
      artistUuids.add(artist.uuid);
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
    favoriteArtistUuids = favorites.map((artist) => artist.uuid);

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
  };

  results.addListener((nextValue) => {
    isNetworkLoading = nextValue.isNetworkLoading;
    const scopedResults = nextValue.data
      ? catalogResultsForScope(scope, nextValue.data)
      : undefined;
    const artists =
      scope === 'browse'
        ? Array.from(scopedResults || [])
        : Array.from(retainedArtistsStream?.currentValue || []);
    updateArtists(artists, isNetworkLoading);
  });

  retainedArtistsStream?.addListener((artists) => {
    updateArtists(Array.from(artists), isNetworkLoading);
  });

  return template;
}

function createYearsListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist
): ListTemplate {
  const artistUuid = artist.uuid;
  const artistName = artist.name;
  carplay_logger.info('createYearsListTemplate', { scope, artist: artistUuid });
  const behaviorOptions =
    scope === 'offline'
      ? { fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable }
      : undefined;

  const yearsBehavior = yearsNetworkBackedModelArrayBehavior(
    ctx.realm,
    scope === 'offline',
    artistUuid,
    behaviorOptions,
    scope !== 'browse'
  );
  const executor = yearsBehavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());

  const yearUuids = new Set<string>();
  const showUuids = new Set<string>();
  let currentMode: 'years' | 'shows' | 'today' = 'years';
  let selectedYearUuid: string | undefined;
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
    selectedYearUuid = undefined;
    showUuids.clear();

    const sorted = Array.from(yearUuids)
      .map((uuid) =>
        selectedCatalogObjectForScope(ctx.realm, scope, Year, uuid, 'carplay.years.render-year')
      )
      .filter((year): year is Year => year !== undefined)
      .sort((a, b) => a.year.localeCompare(b.year));
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
            detailText: `Shows on this day by ${artistName}.`,
            showsDisclosureIndicator: true,
          },
          {
            id: ARTIST_ACTION_RANDOM,
            text: 'Random Show',
            detailText: `Play a random ${artistName} show.`,
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
    const yearUuid = year.uuid;
    const yearLabel = year.year;
    clearDetailBehavior();
    currentMode = 'shows';
    selectedYearUuid = yearUuid;
    showUuids.clear();

    template.updateSections([
      {
        header: yearLabel,
        items: [
          {
            id: ACTION_SHOW_YEARS,
            text: 'Back to Years',
            detailText: artistName,
            showsDisclosureIndicator: false,
          },
          {
            id: `loading-${yearUuid}`,
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
      artistUuid,
      yearUuid,
      userFilters,
      behaviorOptions
    );
    const showsExecutor = showsBehavior.sharedExecutor(ctx.apiClient);
    const showsResults = showsExecutor.start();

    detailExecutorTeardown = () => showsExecutor.tearDown();
    detailResultsTeardown = () => showsResults.tearDown();

    showsResults.addListener((nextValue) => {
      if (currentMode !== 'shows' || selectedYearUuid !== yearUuid) {
        return;
      }

      const value: YearShowsResults = nextValue.data;
      const scopedShows = value?.shows ? catalogResultsForScope(scope, value.shows) : undefined;
      const shows = scopedShows ? Array.from(scopedShows) : [];
      const filteredShows = shows.filter((show) => includeShowForScope(ctx, scope, show));
      const sortedShows = filteredShows.sort((a, b) => a.displayDate.localeCompare(b.displayDate));

      showUuids.clear();
      for (const show of sortedShows) {
        showUuids.add(show.uuid);
      }

      template.updateSections([
        {
          header: 'Year',
          items: [
            {
              id: ACTION_SHOW_YEARS,
              text: 'Back to Years',
              detailText: yearLabel,
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
                  detailText: formatShowDetail(show, scope),
                  showsDisclosureIndicator: true,
                }))
              : [
                  {
                    id: `empty-${yearUuid}`,
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
    selectedYearUuid = undefined;
    showUuids.clear();

    template.updateSections([
      {
        header: 'On This Day',
        items: [
          {
            id: ACTION_SHOW_YEARS,
            text: 'Back to Years',
            detailText: artistName,
            showsDisclosureIndicator: false,
          },
          {
            id: `loading-today-${artistUuid}`,
            text: 'Loading shows...',
            showsDisclosureIndicator: false,
          },
        ],
      },
    ]);

    const todayBehavior = new TodayShowsNetworkBackedBehavior(ctx.realm, [artistUuid], {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
    const todayExecutor = todayBehavior.sharedExecutor(ctx.apiClient);
    const todayResults = todayExecutor.start();
    const retainedTodayStream =
      scope === 'browse'
        ? undefined
        : new RealmQueryValueStream<Show>(
            ctx.realm,
            ctx.realm
              .objects(Show)
              .filtered('displayDate ENDSWITH $0', todayDisplayDateSuffix())
              .filtered('artistUuid == $0', artistUuid)
          );

    detailExecutorTeardown = () => todayExecutor.tearDown();
    detailResultsTeardown = () => {
      todayResults.tearDown();
      retainedTodayStream?.tearDown();
    };

    const updateTodayShows = (nextShows: Show[]) => {
      if (currentMode !== 'today') {
        return;
      }

      const shows = nextShows
        .filter((show) => includeShowForScope(ctx, scope, show))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      showUuids.clear();
      for (const show of shows) {
        showUuids.add(show.uuid);
      }

      template.updateSections([
        {
          header: 'Artist',
          items: [
            {
              id: ACTION_SHOW_YEARS,
              text: 'Back to Years',
              detailText: artistName,
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
                  detailText: formatShowDetail(show, scope),
                  showsDisclosureIndicator: true,
                }))
              : [
                  {
                    id: `empty-today-${artistUuid}`,
                    text: 'No shows on this day',
                    detailText: 'Try another artist or check back later.',
                    showsDisclosureIndicator: false,
                  },
                ],
        },
      ]);
    };

    todayResults.addListener((nextValue) => {
      const scopedShows = nextValue.data
        ? catalogResultsForScope(scope, nextValue.data)
        : undefined;
      const shows =
        scope === 'browse'
          ? Array.from(scopedShows || [])
          : Array.from(retainedTodayStream?.currentValue || []);
      updateTodayShows(shows);
    });

    retainedTodayStream?.addListener((shows) => {
      updateTodayShows(Array.from(shows));
    });
  };

  const template = new ListTemplate({
    title: artistName,
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
          artist: artistUuid,
          year: selectedYearUuid,
          scope,
        });
        const showUuid = String(id);
        if (!showUuids.has(showUuid)) return;

        const show = selectedCatalogObjectForScope(
          ctx.realm,
          scope,
          Show,
          showUuid,
          'carplay.years.show-selection'
        );
        const selectedArtist = selectedCatalogObjectForScope(
          ctx.realm,
          scope,
          Artist,
          artistUuid,
          'carplay.years.show-selection-artist'
        );
        if (
          !show ||
          !selectedArtist ||
          !includeShowForScope(ctx, scope, show) ||
          !includeArtistForScope(ctx, scope, selectedArtist)
        ) {
          return;
        }

        const sourcesTemplate = createSourcesListTemplate(ctx, scope, selectedArtist, show);
        CarPlay.pushTemplate(sourcesTemplate, true);
        return;
      }

      if (id === ARTIST_ACTION_ON_THIS_DAY) {
        showToday();
        return;
      }

      if (id === ARTIST_ACTION_RANDOM) {
        const randomShow = await ctx.apiClient.randomShow(artistUuid);

        if (randomShow?.data?.uuid) {
          const upsertedShow = upsertShowWithSources(ctx.realm, randomShow.data);
          const show = upsertedShow
            ? selectedCatalogObjectForScope(
                ctx.realm,
                scope,
                Show,
                upsertedShow.uuid,
                'carplay.years.random-show'
              )
            : undefined;
          const showArtist = show
            ? selectedCatalogObjectForScope(
                ctx.realm,
                scope,
                Artist,
                show.artistUuid,
                'carplay.years.random-show-artist'
              )
            : undefined;

          if (show && showArtist) {
            const sourcesTemplate = createSourcesListTemplate(ctx, scope, showArtist, show);
            CarPlay.pushTemplate(sourcesTemplate, true);
          }
        }
        return;
      }

      carplay_logger.info('year selected', { id, artist: artistUuid, scope });
      const yearUuid = String(id);
      if (!yearUuids.has(yearUuid)) return;

      const year = selectedCatalogObjectForScope(
        ctx.realm,
        scope,
        Year,
        yearUuid,
        'carplay.years.year-selection'
      );
      if (!year || !includeYearForScope(ctx, scope, year)) return;

      showShows(year);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading years...'],
  });

  results.addListener((nextValue) => {
    const scopedYears = nextValue.data ? catalogResultsForScope(scope, nextValue.data) : undefined;
    const years = Array.from(scopedYears || []);
    const filtered = years.filter((year) => includeYearForScope(ctx, scope, year));
    const sorted = filtered.sort((a, b) => a.year.localeCompare(b.year));

    yearUuids.clear();
    for (const year of sorted) {
      yearUuids.add(year.uuid);
    }

    if (currentMode === 'years') {
      showYears();
      return;
    }

    if (selectedYearUuid && !yearUuids.has(selectedYearUuid)) {
      showYears();
    }
  });

  return template;
}

function includeArtistForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, artist: Artist) {
  let included = true;

  if (scope === 'offline') {
    included = ctx.libraryIndex.artistHasOfflineTracks(artist.uuid);
  } else if (scope === 'library') {
    included = ctx.libraryIndex.artistIsInLibrary(artist.uuid);
  }

  if (included && scope !== 'browse') {
    readRetainedCatalogObject(artist, 'carplay.artists.scoped-artist');
  }

  return included;
}

function includeYearForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, year: Year) {
  let included = true;

  if (scope === 'offline') {
    included = ctx.libraryIndex.yearHasOfflineTracks(year.uuid);
  } else if (scope === 'library') {
    included = ctx.libraryIndex.yearIsInLibrary(year.uuid);
  }

  if (included && scope !== 'browse') {
    readRetainedCatalogObject(year, 'carplay.years.scoped-year');
  }

  return included;
}

function includeShowForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, show: Show) {
  let included = true;

  if (scope === 'offline') {
    included = ctx.libraryIndex.showHasOfflineTracks(show.uuid);
  } else if (scope === 'library') {
    included = ctx.libraryIndex.showIsInLibrary(show.uuid);
  }

  if (included && scope !== 'browse') {
    readRetainedCatalogObject(show, 'carplay.shows.scoped-show');
  }

  return included;
}

function artistListItem(artist: Artist) {
  return {
    id: artist.uuid,
    text: artist.name,
    detailText: `${artist.showCount} ${plur('show', artist.showCount)} • ${artist.sourceCount} ${plur('tape', artist.sourceCount)}`,
    showsDisclosureIndicator: true,
  };
}

function todayDisplayDateSuffix() {
  const now = new Date();
  const month = (now.getMonth() + 1).toFixed(0).padStart(2, '0');
  const day = now.getDate().toFixed(0).padStart(2, '0');
  return `-${month}-${day}`;
}
