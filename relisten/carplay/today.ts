import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
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

type ItemMap<T extends { uuid: string }> = Map<string, T>;

export function createTodayShowsTemplate(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  artists: Artist[],
  title: string
): ListTemplate {
  carplay_logger.info('createTodayShowsTemplate', { scope, artistCount: artists.length });
  const artistUuids = artists.map((artist) => artist.uuid);
  const behavior = new TodayShowsNetworkBackedBehavior(ctx.realm, artistUuids, {
    fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
  });
  const executor = behavior.sharedExecutor(ctx.apiClient);
  const results = executor.start();

  ctx.addTeardown(() => executor.tearDown());
  ctx.addTeardown(() => results.tearDown());

  const showMap: ItemMap<Show> = new Map();

  const template = new ListTemplate({
    title,
    tabTitle: SCOPE_META[scope].tabTitle,
    tabSystemImageName: 'music.pages.fill',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      const show = showMap.get(String(id));
      if (!show || !show.artist) {
        carplay_logger.warn('Today show selection missing data', { id });
        return;
      }

      const sourcesTemplate = createSourcesListTemplate(ctx, scope, show.artist, show);
      CarPlay.pushTemplate(sourcesTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading shows...'],
  });

  results.addListener((nextValue) => {
    const shows = Array.from(nextValue.data || []);

    shows.sort((a, b) => b.date.getTime() - a.date.getTime());

    showMap.clear();
    for (const show of shows) {
      showMap.set(show.uuid, show);
    }

    const items = shows.map((show) => ({
      id: show.uuid,
      text: show.displayDate,
      detailText: formatTodayShowDetail(show, artists.length > 1) || undefined,
      showsDisclosureIndicator: true,
    }));

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
  });

  return template;
}

function formatTodayShowDetail(show: Show, includeArtist: boolean) {
  const artistName = includeArtist ? show.artist?.name : undefined;
  const detail = formatShowDetail(show);

  return [artistName, detail].filter(Boolean).join(' • ');
}
