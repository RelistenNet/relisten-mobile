import Realm from 'realm';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { logLibraryIndexDebug } from '@/relisten/util/profile_logging';

type Listener = () => void;

const SLICE_SCOPES = ['library-membership', 'offline-availability', 'remaining-downloads'] as const;
type SliceScope = (typeof SLICE_SCOPES)[number];

const KEYED_SCOPES = [
  'artist-library',
  'year-library',
  'show-library',
  'artist-offline',
  'year-offline',
  'show-offline',
  'source-offline',
] as const;
type KeyedScope = (typeof KEYED_SCOPES)[number];

type SliceListeners = Record<SliceScope, Set<Listener>>;
type SliceVersions = Record<SliceScope, number>;
type KeyedListeners = Record<KeyedScope, Map<string, Set<Listener>>>;
type KeyedVersions = Record<KeyedScope, Map<string, number>>;
type PendingKeyNotifications = Record<KeyedScope, Set<string>>;

function createSliceListeners(): SliceListeners {
  return {
    'library-membership': new Set<Listener>(),
    'offline-availability': new Set<Listener>(),
    'remaining-downloads': new Set<Listener>(),
  };
}

function createSliceVersions(): SliceVersions {
  return {
    'library-membership': 0,
    'offline-availability': 0,
    'remaining-downloads': 0,
  };
}

function createKeyedListeners(): KeyedListeners {
  return {
    'artist-library': new Map<string, Set<Listener>>(),
    'year-library': new Map<string, Set<Listener>>(),
    'show-library': new Map<string, Set<Listener>>(),
    'artist-offline': new Map<string, Set<Listener>>(),
    'year-offline': new Map<string, Set<Listener>>(),
    'show-offline': new Map<string, Set<Listener>>(),
    'source-offline': new Map<string, Set<Listener>>(),
  };
}

function createKeyedVersions(): KeyedVersions {
  return {
    'artist-library': new Map<string, number>(),
    'year-library': new Map<string, number>(),
    'show-library': new Map<string, number>(),
    'artist-offline': new Map<string, number>(),
    'year-offline': new Map<string, number>(),
    'show-offline': new Map<string, number>(),
    'source-offline': new Map<string, number>(),
  };
}

function createPendingKeyNotifications(): PendingKeyNotifications {
  return {
    'artist-library': new Set<string>(),
    'year-library': new Set<string>(),
    'show-library': new Set<string>(),
    'artist-offline': new Set<string>(),
    'year-offline': new Set<string>(),
    'show-offline': new Set<string>(),
    'source-offline': new Set<string>(),
  };
}

function cloneStringSet(source: Set<string>) {
  return new Set(source);
}

function cloneCountMap(source: Map<string, number>) {
  return new Map(source);
}

function unionSetValues(...sources: Array<ReadonlySet<string>>) {
  const union = new Set<string>();

  for (const source of sources) {
    for (const value of source) {
      union.add(value);
    }
  }

  return union;
}

function unionMapKeys(...sources: Array<ReadonlyMap<string, number>>) {
  const union = new Set<string>();

  for (const source of sources) {
    for (const key of source.keys()) {
      union.add(key);
    }
  }

  return union;
}

export class LibraryIndex {
  private readonly listeners = new Set<Listener>();
  private version = 0;
  private emitScheduled = false;
  private readonly sliceListeners = createSliceListeners();
  private readonly sliceVersions = createSliceVersions();
  private readonly keyedListeners = createKeyedListeners();
  private readonly keyedVersions = createKeyedVersions();
  private readonly pendingSlices = new Set<SliceScope>();
  private readonly pendingKeyNotifications = createPendingKeyNotifications();

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
  private readonly remainingDownloads: Realm.Results<SourceTrackOfflineInfo>;
  private lastNotifiedRemainingDownloadsCount = 0;

  constructor(private readonly realm: Realm.Realm) {
    this.favoriteArtists = this.realm.objects(Artist).filtered('isFavorite == true');
    this.favoriteShows = this.realm.objects(Show).filtered('isFavorite == true');
    this.offlineInfos = this.realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Succeeded);
    this.remainingDownloads = this.realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded);
    this.lastNotifiedRemainingDownloadsCount = this.remainingDownloads.length;

    this.favoriteArtists.addListener(this.handleFavoriteArtistsChanged);
    this.favoriteShows.addListener(this.handleFavoriteShowsChanged);
    this.offlineInfos.addListener(this.handleOfflineInfosChanged);
    this.remainingDownloads.addListener(this.handleRemainingDownloadsChanged);

    this.rebuildFavoriteArtists();
    this.rebuildFavoriteShows();
    this.rebuildOfflineAvailability();
  }

  tearDown() {
    if (!this.realm.isClosed) {
      this.favoriteArtists.removeListener(this.handleFavoriteArtistsChanged);
      this.favoriteShows.removeListener(this.handleFavoriteShowsChanged);
      this.offlineInfos.removeListener(this.handleOfflineInfosChanged);
      this.remainingDownloads.removeListener(this.handleRemainingDownloadsChanged);
    }

    this.listeners.clear();
    for (const scope of SLICE_SCOPES) {
      this.sliceListeners[scope].clear();
    }
    for (const scope of KEYED_SCOPES) {
      this.keyedListeners[scope].clear();
    }
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

  subscribeLibraryMembership = (listener: Listener) => {
    return this.subscribeSlice('library-membership', listener);
  };

  getLibraryMembershipSnapshot = () => {
    return this.sliceVersions['library-membership'];
  };

  subscribeOfflineAvailability = (listener: Listener) => {
    return this.subscribeSlice('offline-availability', listener);
  };

  getOfflineAvailabilitySnapshot = () => {
    return this.sliceVersions['offline-availability'];
  };

  subscribeRemainingDownloads = (listener: Listener) => {
    return this.subscribeSlice('remaining-downloads', listener);
  };

  getRemainingDownloadsSnapshot = () => {
    return this.remainingDownloadsCount();
  };

  subscribeArtistLibrary = (artistUuid: string, listener: Listener) => {
    return this.subscribeKeyed('artist-library', artistUuid, listener);
  };

  getArtistLibrarySnapshot = (artistUuid: string) => {
    return this.getKeyedSnapshot('artist-library', artistUuid);
  };

  subscribeYearLibrary = (yearUuid: string, listener: Listener) => {
    return this.subscribeKeyed('year-library', yearUuid, listener);
  };

  getYearLibrarySnapshot = (yearUuid: string) => {
    return this.getKeyedSnapshot('year-library', yearUuid);
  };

  subscribeShowLibrary = (showUuid: string, listener: Listener) => {
    return this.subscribeKeyed('show-library', showUuid, listener);
  };

  getShowLibrarySnapshot = (showUuid: string) => {
    return this.getKeyedSnapshot('show-library', showUuid);
  };

  subscribeArtistOfflineTracks = (artistUuid: string, listener: Listener) => {
    return this.subscribeKeyed('artist-offline', artistUuid, listener);
  };

  getArtistOfflineTracksSnapshot = (artistUuid: string) => {
    return this.getKeyedSnapshot('artist-offline', artistUuid);
  };

  subscribeYearOfflineTracks = (yearUuid: string, listener: Listener) => {
    return this.subscribeKeyed('year-offline', yearUuid, listener);
  };

  getYearOfflineTracksSnapshot = (yearUuid: string) => {
    return this.getKeyedSnapshot('year-offline', yearUuid);
  };

  subscribeShowOfflineTracks = (showUuid: string, listener: Listener) => {
    return this.subscribeKeyed('show-offline', showUuid, listener);
  };

  getShowOfflineTracksSnapshot = (showUuid: string) => {
    return this.getKeyedSnapshot('show-offline', showUuid);
  };

  subscribeSourceOfflineTracks = (sourceUuid: string, listener: Listener) => {
    return this.subscribeKeyed('source-offline', sourceUuid, listener);
  };

  getSourceOfflineTracksSnapshot = (sourceUuid: string) => {
    return this.getKeyedSnapshot('source-offline', sourceUuid);
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

  remainingDownloadsCount() {
    return this.remainingDownloads.length;
  }

  hasRemainingDownloads() {
    return this.remainingDownloadsCount() > 0;
  }

  private readonly handleFavoriteArtistsChanged = () => {
    this.rebuildFavoriteArtists();
  };

  private readonly handleFavoriteShowsChanged = () => {
    this.rebuildFavoriteShows();
  };

  private readonly handleOfflineInfosChanged = () => {
    this.rebuildOfflineAvailability();
  };

  private readonly handleRemainingDownloadsChanged = () => {
    const remainingDownloadsCount = this.remainingDownloadsCount();

    if (remainingDownloadsCount === this.lastNotifiedRemainingDownloadsCount) {
      return;
    }

    logLibraryIndexDebug(
      `remaining-downloads ${this.lastNotifiedRemainingDownloadsCount} -> ${remainingDownloadsCount}`
    );
    this.lastNotifiedRemainingDownloadsCount = remainingDownloadsCount;

    this.queueSliceNotification('remaining-downloads');
    this.scheduleEmit();
  };

  private rebuildFavoriteArtists() {
    const previousFavoriteArtistUuids = cloneStringSet(this.favoriteArtistUuids);

    this.favoriteArtistUuids.clear();

    for (const artist of this.favoriteArtists) {
      this.favoriteArtistUuids.add(artist.uuid);
    }

    this.queueSliceNotification('library-membership');

    for (const artistUuid of unionSetValues(
      previousFavoriteArtistUuids,
      this.favoriteArtistUuids
    )) {
      const wasInLibrary =
        previousFavoriteArtistUuids.has(artistUuid) ||
        this.hasEntries(this.artistOfflineCounts, artistUuid) ||
        this.hasEntries(this.favoriteShowArtistCounts, artistUuid);
      const isInLibrary = this.artistIsInLibrary(artistUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('artist-library', artistUuid);
      }
    }

    this.scheduleEmit();
  }

  private rebuildFavoriteShows() {
    const previousFavoriteArtistUuids = cloneStringSet(this.favoriteArtistUuids);
    const previousFavoriteShowUuids = cloneStringSet(this.favoriteShowUuids);
    const previousFavoriteShowArtistCounts = cloneCountMap(this.favoriteShowArtistCounts);
    const previousFavoriteShowYearCounts = cloneCountMap(this.favoriteShowYearCounts);

    this.favoriteShowUuids.clear();
    this.favoriteShowArtistCounts.clear();
    this.favoriteShowYearCounts.clear();

    for (const show of this.favoriteShows) {
      this.favoriteShowUuids.add(show.uuid);
      this.incrementCount(this.favoriteShowArtistCounts, show.artistUuid);
      this.incrementCount(this.favoriteShowYearCounts, show.yearUuid);
    }

    this.queueSliceNotification('library-membership');

    for (const showUuid of unionSetValues(previousFavoriteShowUuids, this.favoriteShowUuids)) {
      const wasInLibrary =
        previousFavoriteShowUuids.has(showUuid) ||
        this.hasEntries(this.showOfflineCounts, showUuid);
      const isInLibrary = this.showIsInLibrary(showUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('show-library', showUuid);
      }
    }

    for (const artistUuid of unionMapKeys(
      previousFavoriteShowArtistCounts,
      this.favoriteShowArtistCounts
    )) {
      const wasInLibrary = this.artistLibraryMembershipFromState(
        previousFavoriteShowArtistCounts,
        previousFavoriteArtistUuids,
        this.artistOfflineCounts,
        artistUuid
      );
      const isInLibrary = this.artistIsInLibrary(artistUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('artist-library', artistUuid);
      }
    }

    for (const yearUuid of unionMapKeys(
      previousFavoriteShowYearCounts,
      this.favoriteShowYearCounts
    )) {
      const wasInLibrary = this.yearLibraryMembershipFromState(
        previousFavoriteShowYearCounts,
        this.yearOfflineCounts,
        yearUuid
      );
      const isInLibrary = this.yearIsInLibrary(yearUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('year-library', yearUuid);
      }
    }

    this.scheduleEmit();
  }

  private rebuildOfflineAvailability() {
    const previousArtistOfflineCounts = cloneCountMap(this.artistOfflineCounts);
    const previousYearOfflineCounts = cloneCountMap(this.yearOfflineCounts);
    const previousShowOfflineCounts = cloneCountMap(this.showOfflineCounts);
    const previousSourceOfflineCounts = cloneCountMap(this.sourceOfflineCounts);

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

    this.queueSliceNotification('offline-availability');
    this.queueSliceNotification('library-membership');

    for (const artistUuid of unionMapKeys(previousArtistOfflineCounts, this.artistOfflineCounts)) {
      const hadOfflineTracks = this.hasEntries(previousArtistOfflineCounts, artistUuid);
      const hasOfflineTracks = this.artistHasOfflineTracks(artistUuid);

      if (hadOfflineTracks !== hasOfflineTracks) {
        this.queueKeyNotification('artist-offline', artistUuid);
      }

      const wasInLibrary = this.artistLibraryMembershipFromState(
        this.favoriteShowArtistCounts,
        this.favoriteArtistUuids,
        previousArtistOfflineCounts,
        artistUuid
      );
      const isInLibrary = this.artistIsInLibrary(artistUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('artist-library', artistUuid);
      }
    }

    for (const yearUuid of unionMapKeys(previousYearOfflineCounts, this.yearOfflineCounts)) {
      const hadOfflineTracks = this.hasEntries(previousYearOfflineCounts, yearUuid);
      const hasOfflineTracks = this.yearHasOfflineTracks(yearUuid);

      if (hadOfflineTracks !== hasOfflineTracks) {
        this.queueKeyNotification('year-offline', yearUuid);
      }

      const wasInLibrary = this.yearLibraryMembershipFromState(
        this.favoriteShowYearCounts,
        previousYearOfflineCounts,
        yearUuid
      );
      const isInLibrary = this.yearIsInLibrary(yearUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('year-library', yearUuid);
      }
    }

    for (const showUuid of unionMapKeys(previousShowOfflineCounts, this.showOfflineCounts)) {
      const hadOfflineTracks = this.hasEntries(previousShowOfflineCounts, showUuid);
      const hasOfflineTracks = this.showHasOfflineTracks(showUuid);

      if (hadOfflineTracks !== hasOfflineTracks) {
        this.queueKeyNotification('show-offline', showUuid);
      }

      const wasInLibrary =
        this.favoriteShowUuids.has(showUuid) ||
        this.hasEntries(previousShowOfflineCounts, showUuid);
      const isInLibrary = this.showIsInLibrary(showUuid);

      if (wasInLibrary !== isInLibrary) {
        this.queueKeyNotification('show-library', showUuid);
      }
    }

    for (const sourceUuid of unionMapKeys(previousSourceOfflineCounts, this.sourceOfflineCounts)) {
      const hadOfflineTracks = this.hasEntries(previousSourceOfflineCounts, sourceUuid);
      const hasOfflineTracks = this.sourceHasOfflineTracks(sourceUuid);

      if (hadOfflineTracks !== hasOfflineTracks) {
        this.queueKeyNotification('source-offline', sourceUuid);
      }
    }

    this.scheduleEmit();
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
      this.flushNotifications();
    });
  }

  private flushNotifications() {
    const pendingSlices = [...this.pendingSlices];
    this.pendingSlices.clear();

    const pendingKeyNotifications = KEYED_SCOPES.map((scope) => {
      const keys = [...this.pendingKeyNotifications[scope]];
      this.pendingKeyNotifications[scope].clear();
      return { scope, keys };
    }).filter((entry) => entry.keys.length > 0);

    if (pendingSlices.length === 0 && pendingKeyNotifications.length === 0) {
      return;
    }

    const keyedSummary = pendingKeyNotifications
      .map(({ scope, keys }) => `${scope}:${keys.length}`)
      .join(', ');
    logLibraryIndexDebug(
      `flush slices=${pendingSlices.join(',') || '<none>'} keyed=${keyedSummary || '<none>'}`
    );

    for (const scope of pendingSlices) {
      this.sliceVersions[scope] += 1;
      for (const listener of this.sliceListeners[scope]) {
        listener();
      }
    }

    for (const { scope, keys } of pendingKeyNotifications) {
      const versions = this.keyedVersions[scope];
      const listenersByKey = this.keyedListeners[scope];

      for (const key of keys) {
        versions.set(key, (versions.get(key) ?? 0) + 1);
        for (const listener of listenersByKey.get(key) ?? []) {
          listener();
        }
      }
    }

    this.emit();
  }

  private subscribeSlice(scope: SliceScope, listener: Listener) {
    this.sliceListeners[scope].add(listener);

    return () => {
      this.sliceListeners[scope].delete(listener);
    };
  }

  private subscribeKeyed(scope: KeyedScope, key: string, listener: Listener) {
    let listenersByKey = this.keyedListeners[scope].get(key);
    if (!listenersByKey) {
      listenersByKey = new Set<Listener>();
      this.keyedListeners[scope].set(key, listenersByKey);
    }

    listenersByKey.add(listener);

    return () => {
      const currentListeners = this.keyedListeners[scope].get(key);
      currentListeners?.delete(listener);
      if (currentListeners && currentListeners.size === 0) {
        this.keyedListeners[scope].delete(key);
      }
    };
  }

  private getKeyedSnapshot(scope: KeyedScope, key: string) {
    return this.keyedVersions[scope].get(key) ?? 0;
  }

  private queueSliceNotification(scope: SliceScope) {
    this.pendingSlices.add(scope);
  }

  private queueKeyNotification(scope: KeyedScope, key?: string | null) {
    if (!key) {
      return;
    }

    this.pendingKeyNotifications[scope].add(key);
  }

  private artistLibraryMembershipFromState(
    favoriteShowArtistCounts: ReadonlyMap<string, number>,
    favoriteArtistUuids: ReadonlySet<string>,
    artistOfflineCounts: ReadonlyMap<string, number>,
    artistUuid: string
  ) {
    return (
      favoriteArtistUuids.has(artistUuid) ||
      this.hasEntries(artistOfflineCounts, artistUuid) ||
      this.hasEntries(favoriteShowArtistCounts, artistUuid)
    );
  }

  private yearLibraryMembershipFromState(
    favoriteShowYearCounts: ReadonlyMap<string, number>,
    yearOfflineCounts: ReadonlyMap<string, number>,
    yearUuid: string
  ) {
    return (
      this.hasEntries(yearOfflineCounts, yearUuid) ||
      this.hasEntries(favoriteShowYearCounts, yearUuid)
    );
  }

  private hasEntries(map: ReadonlyMap<string, number>, uuid?: string | null) {
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
