import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { TodayShowsNetworkBackedBehavior } from '@/relisten/realm/models/shows/today_shows_repo';
import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';
import { createSourcesListTemplate } from '@/relisten/carplay/show_templates';
import { CarPlayScope, SCOPE_META } from '@/relisten/carplay/scope';
import { formatShowDetail } from '@/relisten/carplay/show_formatters';
import plur from 'plur';
import {
  catalogResultsForScope,
  selectedCatalogObjectForScope,
} from '@/relisten/carplay/catalog_scope';
import { readRetainedCatalogObject } from '@/relisten/realm/catalog_retirement';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';

export function createTodayShowsTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artistUuids: string[],
  title: string
): ListTemplate {
  carplay_logger.info('createTodayShowsTemplate', { scope, artistCount: artistUuids.length });
  const behavior = new TodayShowsNetworkBackedBehavior(ctx.realm, artistUuids, {
    fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
  });
  const executor = behavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();
  const retainedShowsStream =
    scope === 'browse'
      ? undefined
      : new RealmQueryValueStream<Show>(
          ctx.realm,
          ctx.realm
            .objects(Show)
            .filtered('displayDate ENDSWITH $0', todayDisplayDateSuffix())
            .filtered('artistUuid IN $0', artistUuids)
        );

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());
  if (retainedShowsStream) {
    ctx.addTeardown(() => retainedShowsStream.tearDown());
  }

  const showUuids = new Set<string>();

  const template = new ListTemplate({
    title,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      const showUuid = String(id);
      if (!showUuids.has(showUuid)) return;

      const show = selectedCatalogObjectForScope(
        ctx.realm,
        scope,
        Show,
        showUuid,
        'carplay.today.show-selection'
      );
      const artist = show
        ? selectedCatalogObjectForScope(
            ctx.realm,
            scope,
            Artist,
            show.artistUuid,
            'carplay.today.show-selection-artist'
          )
        : undefined;
      if (!show || !artist || !includeTodayShowForScope(ctx, scope, show)) {
        carplay_logger.warn('Today show selection missing data', { id });
        return;
      }

      const sourcesTemplate = createSourcesListTemplate(ctx, scope, artist, show);
      CarPlay.pushTemplate(sourcesTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading shows...'],
  });

  const updateShows = (nextShows: Show[]) => {
    const shows = nextShows.filter((show) => includeTodayShowForScope(ctx, scope, show));

    shows.sort((a, b) => b.date.getTime() - a.date.getTime());

    showUuids.clear();
    for (const show of shows) {
      showUuids.add(show.uuid);
    }

    const items = shows.map((show) => {
      const artist =
        artistUuids.length > 1
          ? selectedCatalogObjectForScope(
              ctx.realm,
              scope,
              Artist,
              show.artistUuid,
              'carplay.today.detail-artist'
            )
          : undefined;

      return {
        id: show.uuid,
        text: show.displayDate,
        detailText: formatTodayShowDetail(show, artist?.name, scope) || undefined,
        showsDisclosureIndicator: true,
      };
    });

    const sections: ListSection[] = [];

    if (items.length === 0) {
      sections.push({
        header: 'No shows on this day',
        items: [{ text: 'Try another artist or check back later.' }],
      });
    } else {
      sections.push({
        header: `${items.length} ${plur('show', items.length)} on this day`,
        items,
      });
    }

    template.updateSections(sections);
  };

  results.addListener((nextValue) => {
    const scopedResults = nextValue.data
      ? catalogResultsForScope(scope, nextValue.data)
      : undefined;
    const shows =
      scope === 'browse'
        ? Array.from(scopedResults || [])
        : Array.from(retainedShowsStream?.currentValue || []);
    updateShows(shows);
  });

  retainedShowsStream?.addListener((shows) => updateShows(Array.from(shows)));

  return template;
}

function includeTodayShowForScope(ctx: RelistenCarPlayContext, scope: CarPlayScope, show: Show) {
  const included =
    scope === 'offline'
      ? ctx.libraryIndex.showHasOfflineTracks(show.uuid)
      : scope === 'library'
        ? ctx.libraryIndex.showIsInLibrary(show.uuid)
        : true;

  if (included && scope !== 'browse') {
    readRetainedCatalogObject(show, 'carplay.today.scoped-show');
  }

  return included;
}

function formatTodayShowDetail(show: Show, artistName: string | undefined, scope: CarPlayScope) {
  const detail = formatShowDetail(show, scope);

  return [artistName, detail].filter(Boolean).join(' • ');
}

function todayDisplayDateSuffix() {
  const now = new Date();
  const month = (now.getMonth() + 1).toFixed(0).padStart(2, '0');
  const day = now.getDate().toFixed(0).padStart(2, '0');
  return `-${month}-${day}`;
}
