import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { artistsNetworkBackedBehavior } from '@/relisten/realm/models/artist_repo';
import {
  createYearShowsNetworkBackedBehavior,
  YearShows,
  yearsNetworkBackedModelArrayBehavior,
} from '@/relisten/realm/models/year_repo';
import {
  ShowWithFullSourcesNetworkBackedBehavior,
  sortSources,
} from '@/relisten/realm/models/show_repo';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import plur from 'plur';

export type CarPlayScope = 'browse' | 'offline' | 'library';

type ItemMap<T extends { uuid: string }> = Map<string, T>;

type YearShowsResults = YearShows;

const SCOPE_META: Record<CarPlayScope, { title: string; tabTitle: string }> = {
  browse: { title: 'Relisten', tabTitle: 'Browse' },
  offline: { title: 'Offline', tabTitle: 'Offline' },
  library: { title: 'My Library', tabTitle: 'Library' },
};

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
    behaviorOptions
  );
  const executor = artistsBehavior.sharedExecutor(ctx.apiClient);

  const results = executor.start();
  ctx.addTeardown(() => executor.tearDown());

  const artistMap: ItemMap<Artist> = new Map();

  const template = new ListTemplate({
    title: SCOPE_META[scope].title,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
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

    if (scope === 'browse') {
      if (favorites.length > 0) {
        sections.push({
          header: 'Favorites',
          items: favorites.map((artist) => artistListItem(artist)),
        });
      }

      const featured = sorted.filter((a) => a.featured !== 0);
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

    template.updateSections([
      {
        header: `${sorted.length} ${plur('year', sorted.length)}`,
        items,
      },
    ]);
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

export function createSourcesListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist,
  show: Show
): ListTemplate {
  carplay_logger.info('createSourcesListTemplate', { scope, artist: artist.uuid, show: show.uuid });
  const behavior = new ShowWithFullSourcesNetworkBackedBehavior(ctx.realm, show.uuid);
  const executor = behavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());

  const sourceMap: ItemMap<Source> = new Map();

  const template = new ListTemplate({
    title: `${artist.name} • ${show.displayDate}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      carplay_logger.info('source selected', { id, artist: artist.uuid, show: show.uuid });
      const source = sourceMap.get(String(id));
      if (!source) return;

      const tracksTemplate = createTracksListTemplate(ctx, scope, artist, show, source);
      CarPlay.pushTemplate(tracksTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading sources...'],
  });

  results.addListener((nextValue) => {
    const data = nextValue.data;
    const sources = data?.sources ? sortSources(data.sources) : [];

    const filteredSources = sources.filter((source) => includeSourceForScope(scope, source));

    sourceMap.clear();
    for (const source of filteredSources) {
      sourceMap.set(source.uuid, source);
    }

    const items = filteredSources.map((source) => ({
      id: source.uuid,
      text: source.source || 'Source',
      detailText: formatSourceDetail(source),
      showsDisclosureIndicator: true,
    }));

    template.updateSections([
      {
        header: `${filteredSources.length} ${plur('source', filteredSources.length)}`,
        items,
      },
    ]);
  });

  return template;
}

export function createTracksListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist,
  show: Show,
  source: Source
): ListTemplate {
  carplay_logger.info('createTracksListTemplate', {
    scope,
    artist: artist.uuid,
    show: show.uuid,
    source: source.uuid,
  });
  const offlineMode = ctx.userSettings.offlineModeWithDefault();
  const tracks = flattenTracks(source);

  const template = new ListTemplate({
    title: `${artist.name} • ${show.displayDate}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      carplay_logger.info('track selected', { id, scope, source: source.uuid, show: show.uuid });
      const targetIndex = tracks.findIndex((t) => t.uuid === id);
      if (targetIndex === -1) return;

      const playableTracks = tracks.filter((track) =>
        isTrackPlayableInScope(scope, offlineMode, track)
      );

      const queueTracks = playableTracks.map((t) => PlayerQueueTrack.fromSourceTrack(t));
      const playIndex = playableTracks.findIndex((t) => t.uuid === id);

      if (queueTracks.length === 0) {
        carplay_logger.warn('No playable tracks found for source', source.uuid);
        return;
      }

      if (playIndex < 0) {
        carplay_logger.warn('Selected track not playable in current scope', id);
        return;
      }

      carplay_logger.info('Replacing queue from CarPlay', {
        queueLength: queueTracks.length,
        playIndex,
        source: source.uuid,
      });
      ctx.player.queue.replaceQueue(queueTracks, playIndex);
      ctx.showNowPlaying?.();
    },
    sections: [],
    emptyViewTitleVariants: ['Loading tracks...'],
  });

  const items = tracks
    .filter((track) => includeTrackForScope(scope, offlineMode, track))
    .map((track) => ({
      id: track.uuid,
      text: `${track.trackPosition}. ${track.title}`,
      detailText: track.humanizedDuration || undefined,
      isPlaying: ctx.player.queue.currentTrack?.sourceTrack.uuid === track.uuid,
      showsDisclosureIndicator: false,
    }));

  template.updateSections([
    {
      header: `${items.length} ${plur('track', items.length)}`,
      items,
    },
  ]);

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

function includeSourceForScope(scope: CarPlayScope, source: Source) {
  if (scope === 'offline') {
    return source.hasOfflineTracks;
  }

  if (scope === 'library') {
    return source.isFavorite || source.hasOfflineTracks;
  }

  return true;
}

function includeTrackForScope(
  scope: CarPlayScope,
  offlineMode: OfflineModeSetting,
  track: SourceTrack
) {
  if (scope === 'offline') {
    return track.offlineInfo?.isPlayableOffline();
  }

  if (offlineMode === OfflineModeSetting.AlwaysOffline) {
    return track.offlineInfo?.isPlayableOffline();
  }

  return true;
}

function isTrackPlayableInScope(
  scope: CarPlayScope,
  offlineMode: OfflineModeSetting,
  track: SourceTrack
) {
  return includeTrackForScope(scope, offlineMode, track) && !!track.streamingUrl();
}

function artistListItem(artist: Artist) {
  return {
    id: artist.uuid,
    text: artist.name,
    detailText: `${artist.showCount} ${plur('show', artist.showCount)} • ${artist.sourceCount} ${plur('tape', artist.sourceCount)}`,
    showsDisclosureIndicator: true,
  };
}

function formatShowDetail(show: Show) {
  const venue = show.venue?.name;
  const location = show.venue?.location;
  const locationText = [venue, location].filter(Boolean).join(' • ');
  const rating = show.avgRating ? `${show.humanizedAvgRating()}★` : undefined;
  const duration = show.avgDuration ? show.humanizedAvgDuration() : undefined;
  const parts = [locationText, rating, duration].filter(Boolean);

  return parts.join(' • ');
}

function formatSourceDetail(source: Source) {
  const rating = source.avgRating ? `${source.humanizedAvgRating()}★` : undefined;
  const duration = source.duration ? source.humanizedDuration() : undefined;
  const type = source.isSoundboard ? 'SBD' : undefined;
  const taper = source.taper;
  const transferrer = source.transferrer;
  const taperInfo = [taper, transferrer].filter(Boolean).join(' / ');

  return [type, rating, duration, taperInfo].filter(Boolean).join(' • ');
}

function flattenTracks(source: Source) {
  const sortedSets = Array.from(source.sourceSets || []).sort((a, b) => a.index - b.index);

  const tracks: SourceTrack[] = [];

  for (const set of sortedSets) {
    const setTracks = Array.from<SourceTrack>(set.sourceTracks || []).sort(
      (a, b) => a.trackPosition - b.trackPosition
    );
    tracks.push(...setTracks);
  }

  return tracks;
}
