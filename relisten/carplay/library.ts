import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';
import { Show } from '@/relisten/realm/models/show';
import { filterForUser } from '@/relisten/realm/realm_filters';
import { createSourcesListTemplate } from '@/relisten/carplay/show_templates';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import plur from 'plur';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { queuePlaybackHistoryEntry } from '@/relisten/carplay/queue_helpers';

export function createLibraryTemplate(ctx: RelistenCarPlayContext): ListTemplate {
  carplay_logger.info('createLibraryTemplate');

  const showsStream = new RealmQueryValueStream(
    ctx.realm,
    filterForUser(ctx.realm.objects(Show), {
      isFavorite: true,
      isPlayableOffline: true,
      operator: 'OR',
    })
  );

  ctx.addTeardown(() => showsStream.tearDown());

  const showMap: Map<string, Show> = new Map();

  const template = new ListTemplate({
    title: 'My Library',
    tabTitle: 'Library',
    tabSystemImageName: 'star.circle',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      const show = showMap.get(String(id));
      if (!show || !show.artist) {
        carplay_logger.warn('Library show selection missing data', { id });
        return;
      }

      const sourcesTemplate = createSourcesListTemplate(ctx, 'library', show.artist, show);
      CarPlay.pushTemplate(sourcesTemplate, true);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading library...'],
  });

  const updateSections = () => {
    showMap.clear();
    const shows = Array.from(showsStream.currentValue || []);

    const sections: ListSection[] = [];

    const groupedByArtist: Map<string, Show[]> = new Map();

    for (const show of shows) {
      const artist = show.artist;
      if (!artist) continue;

      const existing = groupedByArtist.get(artist.uuid) || [];
      groupedByArtist.set(artist.uuid, [...existing, show]);
    }

    const sortedArtists = Array.from(groupedByArtist.entries()).sort((a, b) => {
      const artistA = a[1][0]?.artist?.name || '';
      const artistB = b[1][0]?.artist?.name || '';
      return artistA.localeCompare(artistB);
    });

    for (const [, artistShows] of sortedArtists) {
      const artist = artistShows[0]?.artist;
      if (!artist) continue;

      const sortedShows = [...artistShows].sort((a, b) =>
        a.displayDate.localeCompare(b.displayDate)
      );
      const items = sortedShows.map((show) => {
        showMap.set(show.uuid, show);
        return {
          id: show.uuid,
          text: show.displayDate,
          detailText: formatLibraryShowDetail(show),
          showsDisclosureIndicator: true,
        };
      });

      sections.push({
        header: `${artist.name} (${items.length} ${plur('show', items.length)})`,
        items,
      });
    }

    if (sections.length === 0) {
      sections.push({
        header: 'Nothing in your library yet',
        items: [
          {
            text: 'No favorite or offline shows',
            detailText: 'Favorite shows or download tracks to see them here.',
          },
        ],
      });
    }

    template.updateSections(sections);
  };

  showsStream.addListener(updateSections);

  return template;
}

export function createRecentTemplate(ctx: RelistenCarPlayContext): ListTemplate {
  carplay_logger.info('createRecentTemplate');

  const historyStream = new RealmQueryValueStream(
    ctx.realm,
    ctx.realm.objects(PlaybackHistoryEntry).sorted('playbackStartedAt', true)
  );

  ctx.addTeardown(() => historyStream.tearDown());

  const entryMap: Map<string, PlaybackHistoryEntry> = new Map();

  const template = new ListTemplate({
    title: 'Recently Played',
    tabTitle: 'Recent',
    tabSystemImageName: 'clock.arrow.circlepath',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      const entry = entryMap.get(String(id));
      if (!entry) return;

      const track = entry.sourceTrack;
      const offlineMode = ctx.userSettings.offlineModeWithDefault();

      if (
        offlineMode === OfflineModeSetting.AlwaysOffline &&
        !track.offlineInfo?.isPlayableOffline()
      ) {
        carplay_logger.warn('History track not playable offline', { id });
        return;
      }

      await queuePlaybackHistoryEntry(ctx, 'browse', entry);
    },
    sections: [],
    emptyViewTitleVariants: ['Loading history...'],
  });

  const updateSections = () => {
    entryMap.clear();
    const entries = Array.from(historyStream.currentValue || []).slice(0, 50);

    const items = entries.map((entry) => {
      entryMap.set(entry.uuid, entry);
      const show = entry.show;
      const artist = entry.artist;
      const subtitle = [artist?.name, show?.displayDate].filter(Boolean).join(' • ');

      return {
        id: entry.uuid,
        text: entry.sourceTrack.title,
        detailText: subtitle,
        showsDisclosureIndicator: false,
      };
    });

    const sections: ListSection[] = [];

    if (items.length === 0) {
      sections.push({
        header: 'No recent tracks',
        items: [{ text: 'Play something to see it here.' }],
      });
    } else {
      sections.push({ header: 'Tracks', items });
    }

    template.updateSections(sections);
  };

  historyStream.addListener(updateSections);

  return template;
}

function formatLibraryShowDetail(show: Show) {
  const venue = show.venue?.name;
  const location = show.venue?.location;
  const locationText = [venue, location].filter(Boolean).join(' • ');
  const offline = show.hasOfflineTracks ? 'Offline' : undefined;
  const rating = show.avgRating ? `${show.humanizedAvgRating()}★` : undefined;
  const duration = show.avgDuration ? show.humanizedAvgDuration() : undefined;

  return [locationText, rating, duration, offline].filter(Boolean).join(' • ');
}
