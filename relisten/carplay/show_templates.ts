import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import {
  ShowWithFullSourcesNetworkBackedBehavior,
  sortSources,
} from '@/relisten/realm/models/show_repo';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { CarPlayScope, SCOPE_META } from '@/relisten/carplay/scope';
import { resolveSourcesForScope } from '@/relisten/carplay/source_selection';
import { formatSourceDetail } from '@/relisten/carplay/show_formatters';
import { buildTrackSections } from '@/relisten/carplay/track_sections';
import { queueTracksFromSelection } from '@/relisten/carplay/queue_helpers';
import plur from 'plur';

type ItemMap<T extends { uuid: string }> = Map<string, T>;

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
  let currentMode: 'sources' | 'tracks' = 'sources';
  let orderedTracks: SourceTrack[] = [];
  let activeSourceUuid: string | undefined;
  const offlineMode = ctx.userSettings.offlineModeWithDefault();

  const template = new ListTemplate({
    title: `${artist.name} • ${show.displayDate}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (currentMode === 'tracks') {
        queueTracksFromSelection({
          ctx,
          scope,
          orderedTracks,
          selectedTrackUuid: String(id),
          sourceUuid: activeSourceUuid,
        });
        return;
      }

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
    const { displaySources, autoSelectSource } = resolveSourcesForScope(scope, show, sources);

    if (autoSelectSource) {
      const { orderedTracks: nextTracks, sections } = buildTrackSections({
        source: autoSelectSource,
        artist,
        scope,
        offlineMode,
        currentTrackUuid: ctx.player.queue.currentTrack?.sourceTrack.uuid,
      });

      currentMode = 'tracks';
      orderedTracks = nextTracks;
      activeSourceUuid = autoSelectSource.uuid;
      template.updateSections(sections);
      return;
    }

    currentMode = 'sources';
    orderedTracks = [];
    activeSourceUuid = undefined;
    sourceMap.clear();
    for (const source of displaySources) {
      sourceMap.set(source.uuid, source);
    }

    const items = displaySources.map((source) => ({
      id: source.uuid,
      text: source.source || 'Source',
      detailText: formatSourceDetail(source),
      showsDisclosureIndicator: true,
    }));

    const sections: ListSection[] = [
      {
        header: `${displaySources.length} ${plur('source', displaySources.length)}`,
        items,
      },
    ];

    template.updateSections(sections);
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

  const { orderedTracks, sections } = buildTrackSections({
    source,
    artist,
    scope,
    offlineMode,
    currentTrackUuid: ctx.player.queue.currentTrack?.sourceTrack.uuid,
  });

  const template = new ListTemplate({
    title: `${artist.name} • ${show.displayDate}`,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      carplay_logger.info('track selected', { id, scope, source: source.uuid, show: show.uuid });
      queueTracksFromSelection({
        ctx,
        scope,
        orderedTracks,
        selectedTrackUuid: String(id),
        sourceUuid: source.uuid,
      });
    },
    sections: [],
    emptyViewTitleVariants: ['Loading tracks...'],
  });

  template.updateSections(sections);

  return template;
}
