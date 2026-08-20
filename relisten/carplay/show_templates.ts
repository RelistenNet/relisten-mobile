import { ListTemplate } from '@g4rb4g3/react-native-carplay';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import {
  ShowWithFullSourcesNetworkBackedBehavior,
  sortSources,
} from '@/relisten/realm/models/show_repo';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { CarPlayScope, SCOPE_META } from '@/relisten/carplay/scope';
import { resolveSourcesForScope } from '@/relisten/carplay/source_selection';
import { formatSourceDetail } from '@/relisten/carplay/show_formatters';
import { buildTrackSections } from '@/relisten/carplay/track_sections';
import { queueTracksFromSelection } from '@/relisten/carplay/queue_helpers';
import {
  catalogObjectsForScope,
  catalogResultsForScope,
  selectedCatalogObjectForScope,
} from '@/relisten/carplay/catalog_scope';
import plur from 'plur';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

const ACTION_SHOW_SOURCES = 'action:show:sources';

export function createSourcesListTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artist: Artist,
  show: Show
): ListTemplate {
  const artistUuid = artist.uuid;
  const showUuid = show.uuid;
  const selectedArtist = selectedCatalogObjectForScope(
    ctx.realm,
    scope,
    Artist,
    artistUuid,
    'carplay.sources.initial-artist'
  );
  const selectedShow = selectedCatalogObjectForScope(
    ctx.realm,
    scope,
    Show,
    showUuid,
    'carplay.sources.initial-show'
  );
  const artistName = selectedArtist?.name ?? 'Artist';
  const showDisplayDate = selectedShow?.displayDate ?? 'Show';
  let showIsFavorite = selectedShow?.isFavorite ?? false;

  carplay_logger.info('createSourcesListTemplate', { scope, artist: artistUuid, show: showUuid });
  const behavior = new ShowWithFullSourcesNetworkBackedBehavior(ctx.realm, showUuid);
  const executor = behavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();
  const retainedSourcesStream =
    scope === 'browse'
      ? undefined
      : new RealmQueryValueStream<Source>(
          ctx.realm,
          ctx.realm.objects(Source).filtered('showUuid == $0', showUuid)
        );
  const retainedShowStream =
    scope === 'browse'
      ? undefined
      : new RealmQueryValueStream<Show>(
          ctx.realm,
          ctx.realm.objects(Show).filtered('uuid == $0', showUuid)
        );

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());
  if (retainedSourcesStream) {
    ctx.addTeardown(() => retainedSourcesStream.tearDown());
  }
  if (retainedShowStream) {
    ctx.addTeardown(() => retainedShowStream.tearDown());
  }

  let currentMode: 'sources' | 'tracks' = 'sources';
  let orderedTrackUuids: string[] = [];
  let activeSourceUuid: string | undefined;
  let displaySourceUuids: string[] = [];
  const offlineMode = ctx.userSettings.offlineModeWithDefault();

  const showSources = () => {
    currentMode = 'sources';
    orderedTrackUuids = [];
    activeSourceUuid = undefined;

    const displaySources = displaySourceUuids
      .map((uuid) =>
        selectedCatalogObjectForScope(
          ctx.realm,
          scope,
          Source,
          uuid,
          'carplay.sources.render-source'
        )
      )
      .filter((source): source is Source => source !== undefined);
    displaySourceUuids = displaySources.map((source) => source.uuid);

    const items = displaySources.map((source) => ({
      id: source.uuid,
      text: source.source || 'Source',
      detailText: formatSourceDetail(source, scope),
      showsDisclosureIndicator: true,
    }));

    template.updateSections([
      {
        header: `${displaySources.length} ${plur('source', displaySources.length)}`,
        items,
      },
    ]);
  };

  const showTracks = (source: Source) => {
    const trackArtist = selectedCatalogObjectForScope(
      ctx.realm,
      scope,
      Artist,
      artistUuid,
      'carplay.sources.track-artist'
    );
    if (!trackArtist) {
      carplay_logger.warn('Source artist is no longer available', {
        artist: artistUuid,
        show: showUuid,
      });
      return;
    }

    const { orderedTrackUuids: nextTrackUuids, sections } = buildTrackSections({
      source,
      artist: trackArtist,
      scope,
      offlineMode,
      currentTrackUuid: ctx.player.queue.currentTrack?.sourceTrack.uuid,
    });

    currentMode = 'tracks';
    orderedTrackUuids = nextTrackUuids;
    activeSourceUuid = source.uuid;

    if (displaySourceUuids.length > 1) {
      sections.unshift({
        header: 'Source',
        items: [
          {
            id: ACTION_SHOW_SOURCES,
            text: 'Choose Different Source',
            detailText: source.source || 'Source',
            showsDisclosureIndicator: false,
          },
        ],
      });
    }

    template.updateSections(sections);
  };

  const template = new ListTemplate({
    title: `${artistName} • ${showDisplayDate}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (currentMode === 'tracks') {
        if (id === ACTION_SHOW_SOURCES) {
          showSources();
          return;
        }

        queueTracksFromSelection({
          ctx,
          scope,
          orderedTrackUuids,
          selectedTrackUuid: String(id),
          sourceUuid: activeSourceUuid,
        });
        return;
      }

      carplay_logger.info('source selected', { id, artist: artistUuid, show: showUuid });
      const sourceUuid = String(id);
      if (!displaySourceUuids.includes(sourceUuid)) return;

      const source = selectedCatalogObjectForScope(
        ctx.realm,
        scope,
        Source,
        sourceUuid,
        'carplay.sources.source-selection'
      );
      if (!source) return;
      if (
        !resolveSourcesForScope(scope, { isFavorite: showIsFavorite }, [source], ctx.libraryIndex)
          .displaySources.length
      ) {
        return;
      }

      showTracks(source);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading sources...'],
  });

  const updateSources = (sources: Source[]) => {
    const { displaySources: nextDisplaySources, autoSelectSource } = resolveSourcesForScope(
      scope,
      { isFavorite: showIsFavorite },
      sources,
      ctx.libraryIndex
    );
    const retainedOrActiveSources = catalogObjectsForScope(
      scope,
      nextDisplaySources,
      'carplay.sources.display-source'
    );
    displaySourceUuids = retainedOrActiveSources.map((source) => source.uuid);

    if (displaySourceUuids.length === 0) {
      showSources();
      return;
    }

    if (autoSelectSource) {
      const selectedSource = retainedOrActiveSources.find(
        (source) => source.uuid === autoSelectSource.uuid
      );
      if (selectedSource) showTracks(selectedSource);
      return;
    }

    if (currentMode === 'tracks' && activeSourceUuid) {
      const activeSource = retainedOrActiveSources.find(
        (source) => source.uuid === activeSourceUuid
      );
      if (activeSource) {
        showTracks(activeSource);
        return;
      }
    }

    showSources();
  };

  results.addListener((nextValue) => {
    const data = nextValue.data;
    const currentShow = data?.show
      ? catalogObjectsForScope(scope, [data.show], 'carplay.sources.result-show')[0]
      : undefined;
    if (currentShow) {
      showIsFavorite = currentShow.isFavorite;
    }

    if (scope === 'browse') {
      const scopedSourceResults = data?.sources
        ? catalogResultsForScope(scope, data.sources)
        : undefined;
      updateSources(scopedSourceResults ? sortSources(scopedSourceResults, ctx.libraryIndex) : []);
      return;
    }

    updateSources(
      retainedSourcesStream ? sortSources(retainedSourcesStream.currentValue, ctx.libraryIndex) : []
    );
  });

  retainedSourcesStream?.addListener((sources) => {
    updateSources(sortSources(sources, ctx.libraryIndex));
  });

  retainedShowStream?.addListener((shows) => {
    const currentShow = catalogObjectsForScope(scope, shows, 'carplay.sources.retained-show')[0];
    if (currentShow) {
      showIsFavorite = currentShow.isFavorite;
    }
    updateSources(
      retainedSourcesStream ? sortSources(retainedSourcesStream.currentValue, ctx.libraryIndex) : []
    );
  });

  return template;
}
