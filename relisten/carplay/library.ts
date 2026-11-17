import { visibleOwnerId } from '@/relisten/playlists/sync/playlist_sync_state';
import { CarPlay, ListTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RealmQueryValueStream } from '@/relisten/realm/value_streams';
import { Show } from '@/relisten/realm/models/show';
import { createSourcesListTemplate } from '@/relisten/carplay/show_templates';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import plur from 'plur';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { queuePlaybackHistoryEntry } from '@/relisten/carplay/queue_helpers';
import NetInfo from '@react-native-community/netinfo';
import { Playlist, PlaylistDeviceState } from '@/relisten/realm/models/playlists/playlist';
import { readPlaylistRowGroups, visiblePlaylists } from '@/relisten/playlists/playlist_hooks';
import { playPlaylist } from '@/relisten/playlists/playlist_playback';

const PLAYLIST_ITEM_PREFIX = 'playlist:';

async function playPlaylistFromCarPlay(ctx: RelistenCarPlayContext, playlistId: string) {
  // Same rule as the app: offline mode or no connection means downloaded tracks only.
  const network = await NetInfo.fetch();
  const online =
    network.type !== 'none' &&
    ctx.userSettings.offlineModeWithDefault() !== OfflineModeSetting.AlwaysOffline;
  if (playPlaylist(ctx.player, playlistId, readPlaylistRowGroups(ctx.realm, playlistId), online)) {
    ctx.showNowPlaying?.();
  } else {
    carplay_logger.warn('Playlist has no playable tracks', { playlistId });
  }
}

export function createLibraryTemplate(ctx: RelistenCarPlayContext): ListTemplate {
  carplay_logger.info('createLibraryTemplate');

  const showsStream = new RealmQueryValueStream(ctx.realm, ctx.realm.objects(Show));
  // All of this device's playlists; which ones are visible is decided on each
  // update, since signing in or switching accounts changes the visible owner.
  const playlistsStream = new RealmQueryValueStream(
    ctx.realm,
    ctx.realm.objects(Playlist).sorted('updatedAt', true)
  );
  const deviceStates = ctx.realm.objects(PlaylistDeviceState);

  ctx.addTeardown(() => showsStream.tearDown());
  ctx.addTeardown(() => playlistsStream.tearDown());

  const showMap: Map<string, Show> = new Map();

  const template = new ListTemplate({
    title: 'My Library',
    tabTitle: 'Library',
    tabSystemImageName: 'star.circle',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (String(id).startsWith(PLAYLIST_ITEM_PREFIX)) {
        await playPlaylistFromCarPlay(ctx, String(id).slice(PLAYLIST_ITEM_PREFIX.length));
        return;
      }
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
    const shows = Array.from(showsStream.currentValue || []).filter((show) =>
      ctx.libraryIndex.showIsInLibrary(show.uuid)
    );

    const sections: ListSection[] = [];

    // Playlists are read-only in the car: choosing one plays it from the top.
    const playlists = playlistsStream.currentValue
      ? [...visiblePlaylists(playlistsStream.currentValue, visibleOwnerId(ctx.realm) ?? null)]
      : [];
    if (playlists.length > 0) {
      sections.push({
        header: 'Playlists',
        items: playlists.map((playlist) => ({
          id: `${PLAYLIST_ITEM_PREFIX}${playlist.playlistId}`,
          text: playlist.name,
          detailText: `${playlist.entryCount} ${plur('track', playlist.entryCount)}`,
        })),
      });
    }

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
          detailText: formatLibraryShowDetail(ctx, show),
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
  playlistsStream.addListener(updateSections);
  deviceStates.addListener(updateSections);
  ctx.addTeardown(() => deviceStates.removeListener(updateSections));
  ctx.addTeardown(ctx.libraryIndex.subscribeLibraryMembership(updateSections));

  return template;
}

export function createRecentTemplate(ctx: RelistenCarPlayContext): ListTemplate {
  carplay_logger.info('createRecentTemplate');

  const historyStream = new RealmQueryValueStream(
    ctx.realm,
    ctx.realm.objects(PlaybackHistoryEntry).sorted('playbackStartedAt', true)
  );

  ctx.addTeardown(() => historyStream.tearDown());

  const template = new ListTemplate({
    title: 'Recently Played',
    tabTitle: 'Recent',
    tabSystemImageName: 'clock.arrow.circlepath',
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      const entry = ctx.realm.objectForPrimaryKey(PlaybackHistoryEntry, String(id));
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

      return queuePlaybackHistoryEntry(ctx, 'browse', String(id));
    },
    sections: [],
    emptyViewTitleVariants: ['Loading history...'],
  });

  const updateSections = () => {
    const entries = Array.from(historyStream.currentValue || []).slice(0, 50);

    const items = entries.map((entry) => {
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

function formatLibraryShowDetail(ctx: RelistenCarPlayContext, show: Show) {
  const venue = show.venue?.name;
  const location = show.venue?.location;
  const locationText = [venue, location].filter(Boolean).join(' • ');
  const offline = ctx.libraryIndex.showHasOfflineTracks(show.uuid) ? 'Offline' : undefined;
  const rating = show.avgRating ? `${show.humanizedAvgRating()}★` : undefined;
  const duration = show.avgDuration ? show.humanizedAvgDuration() : undefined;

  return [locationText, rating, duration, offline].filter(Boolean).join(' • ');
}
