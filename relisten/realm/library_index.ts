import Realm from 'realm';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';

type Listener = () => void;

export class LibraryIndex {
  private readonly listeners = new Set<Listener>();
  private version = 0;
  private emitScheduled = false;

  private readonly artistOfflineCounts = new Map<string, number>();
  private readonly yearOfflineCounts = new Map<string, number>();
  private readonly showOfflineCounts = new Map<string, number>();
  private readonly sourceOfflineCounts = new Map<string, number>();

  private readonly favoriteArtistUuids = new Set<string>();
  private readonly favoriteShowUuids = new Set<string>();
  private readonly favoriteShowArtistCounts = new Map<string, number>();
  private readonly favoriteShowYearCounts = new Map<string, number>();

  private readonly favoriteArtists: Realm.Results<Artist>;
  private readonly favoriteShows: Realm.Results<Show>;
  private readonly offlineInfos: Realm.Results<SourceTrackOfflineInfo>;

  constructor(private readonly realm: Realm.Realm) {
    this.favoriteArtists = this.realm.objects(Artist).filtered('isFavorite == true');
    this.favoriteShows = this.realm.objects(Show).filtered('isFavorite == true');
    this.offlineInfos = this.realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Succeeded);

    this.favoriteArtists.addListener(this.handleFavoriteArtistsChanged);
    this.favoriteShows.addListener(this.handleFavoriteShowsChanged);
    this.offlineInfos.addListener(this.handleOfflineInfosChanged);

    this.rebuildFavoriteArtists();
    this.rebuildFavoriteShows();
    this.rebuildOfflineAvailability();
  }

  tearDown() {
    if (!this.realm.isClosed) {
      this.favoriteArtists.removeListener(this.handleFavoriteArtistsChanged);
      this.favoriteShows.removeListener(this.handleFavoriteShowsChanged);
      this.offlineInfos.removeListener(this.handleOfflineInfosChanged);
    }

    this.listeners.clear();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.version;
  };

  artistHasOfflineTracks(artistUuid?: string | null) {
    return this.hasEntries(this.artistOfflineCounts, artistUuid);
  }

  yearHasOfflineTracks(yearUuid?: string | null) {
    return this.hasEntries(this.yearOfflineCounts, yearUuid);
  }

  showHasOfflineTracks(showUuid?: string | null) {
    return this.hasEntries(this.showOfflineCounts, showUuid);
  }

  sourceHasOfflineTracks(sourceUuid?: string | null) {
    return this.hasEntries(this.sourceOfflineCounts, sourceUuid);
  }

  artistIsInLibrary(artistUuid?: string | null) {
    if (!artistUuid) {
      return false;
    }

    return (
      this.favoriteArtistUuids.has(artistUuid) ||
      this.artistHasOfflineTracks(artistUuid) ||
      this.hasEntries(this.favoriteShowArtistCounts, artistUuid)
    );
  }

  yearIsInLibrary(yearUuid?: string | null) {
    if (!yearUuid) {
      return false;
    }

    return (
      this.yearHasOfflineTracks(yearUuid) || this.hasEntries(this.favoriteShowYearCounts, yearUuid)
    );
  }

  showIsInLibrary(showUuid?: string | null) {
    if (!showUuid) {
      return false;
    }

    return this.favoriteShowUuids.has(showUuid) || this.showHasOfflineTracks(showUuid);
  }

  private readonly handleFavoriteArtistsChanged = () => {
    this.rebuildFavoriteArtists();
    this.scheduleEmit();
  };

  private readonly handleFavoriteShowsChanged = () => {
    this.rebuildFavoriteShows();
    this.scheduleEmit();
  };

  private readonly handleOfflineInfosChanged = () => {
    this.rebuildOfflineAvailability();
    this.scheduleEmit();
  };

  private rebuildFavoriteArtists() {
    this.favoriteArtistUuids.clear();

    for (const artist of this.favoriteArtists) {
      this.favoriteArtistUuids.add(artist.uuid);
    }
  }

  private rebuildFavoriteShows() {
    this.favoriteShowUuids.clear();
    this.favoriteShowArtistCounts.clear();
    this.favoriteShowYearCounts.clear();

    for (const show of this.favoriteShows) {
      this.favoriteShowUuids.add(show.uuid);
      this.incrementCount(this.favoriteShowArtistCounts, show.artistUuid);
      this.incrementCount(this.favoriteShowYearCounts, show.yearUuid);
    }
  }

  private rebuildOfflineAvailability() {
    this.artistOfflineCounts.clear();
    this.yearOfflineCounts.clear();
    this.showOfflineCounts.clear();
    this.sourceOfflineCounts.clear();

    for (const offlineInfo of this.offlineInfos) {
      const track = offlineInfo.sourceTrack;
      if (!track) {
        continue;
      }

      this.incrementCount(this.artistOfflineCounts, track.artistUuid);
      this.incrementCount(this.showOfflineCounts, track.showUuid);
      this.incrementCount(this.sourceOfflineCounts, track.sourceUuid);

      const yearUuid =
        track.year?.uuid ??
        track.show?.yearUuid ??
        this.realm.objectForPrimaryKey(Show, track.showUuid)?.yearUuid;
      this.incrementCount(this.yearOfflineCounts, yearUuid);
    }
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private scheduleEmit() {
    if (this.emitScheduled) {
      return;
    }

    this.emitScheduled = true;

    // Realm can fire several notifiers back-to-back for one write transaction.
    // Forwarding those notifications synchronously into useSyncExternalStore can
    // re-enter Fabric while it is still committing. Batch them into one
    // microtask so React observes the final derived state after the notifier
    // burst has settled.
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.emit();
    });
  }

  private hasEntries(map: Map<string, number>, uuid?: string | null) {
    if (!uuid) {
      return false;
    }

    return (map.get(uuid) ?? 0) > 0;
  }

  private incrementCount(map: Map<string, number>, uuid?: string | null) {
    if (!uuid) {
      return;
    }

    map.set(uuid, (map.get(uuid) ?? 0) + 1);
  }
}
