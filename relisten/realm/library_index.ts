import Realm from 'realm';
import { FavoriteAccountScopeSource } from '@/relisten/library/favorite_repository';
import { FavoriteMembershipProjection } from '@/relisten/library/favorite_membership_projection';
import { OfflineAvailabilityProjection } from '@/relisten/library/offline_availability_projection';
import { FavoriteCatalogType, FAVORITE_CATALOG_TYPES } from '@/relisten/realm/models/library';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { logLibraryIndexDebug } from '@/relisten/util/profile_logging';

type Listener = () => void;
type SliceScope = 'library-membership' | 'offline-availability' | 'remaining-downloads';
type KeyedScope =
  | 'artist-library'
  | 'year-library'
  | 'show-library'
  | 'artist-offline'
  | 'year-offline'
  | 'show-offline'
  | 'source-offline'
  | 'favorite';

const SLICE_SCOPES: SliceScope[] = [
  'library-membership',
  'offline-availability',
  'remaining-downloads',
];
const KEYED_SCOPES: KeyedScope[] = [
  'artist-library',
  'year-library',
  'show-library',
  'artist-offline',
  'year-offline',
  'show-offline',
  'source-offline',
  'favorite',
];

/**
 * Subscription facade over account-scoped favorites and device-global media.
 * The projections own Realm traversal; this class only combines their results
 * and preserves the fine-grained subscriptions used by list rows.
 */
export class LibraryIndex {
  private readonly favoriteProjection: FavoriteMembershipProjection;
  private readonly offlineProjection: OfflineAvailabilityProjection;
  private readonly remainingDownloads: Realm.Results<SourceTrackOfflineInfo>;
  private readonly listeners = new Set<Listener>();
  private readonly sliceListeners = createListenerRecord<SliceScope>(SLICE_SCOPES);
  private readonly sliceVersions = createVersionRecord<SliceScope>(SLICE_SCOPES);
  private readonly keyedListeners = createKeyedListenerRecord();
  private readonly keyedVersions = createKeyedVersionRecord();
  private readonly pendingSlices = new Set<SliceScope>();
  private readonly pendingKeys = createPendingKeyRecord();
  private readonly favoriteUuids = createFavoriteSetRecord();
  private libraryArtistUuids = new Set<string>();
  private libraryYearUuids = new Set<string>();
  private libraryShowUuids = new Set<string>();
  private offlineArtistUuids = new Set<string>();
  private offlineYearUuids = new Set<string>();
  private offlineShowUuids = new Set<string>();
  private offlineSourceUuids = new Set<string>();
  private version = 0;
  private emitScheduled = false;
  private lastRemainingDownloadsCount = 0;

  constructor(
    private readonly realm: Realm,
    accountScopeSource: FavoriteAccountScopeSource
  ) {
    this.favoriteProjection = new FavoriteMembershipProjection(realm, accountScopeSource);
    this.offlineProjection = new OfflineAvailabilityProjection(realm);
    this.remainingDownloads = realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded);
    this.lastRemainingDownloadsCount = this.remainingDownloads.length;

    this.favoriteProjection.subscribe(this.handleFavoriteProjectionChanged);
    this.offlineProjection.subscribe(this.handleOfflineProjectionChanged);
    this.remainingDownloads.addListener(this.handleRemainingDownloadsChanged);
    this.replaceFavoriteSets();
    this.replaceOfflineSets();
    this.replaceLibrarySets();
  }

  tearDown() {
    this.favoriteProjection.tearDown();
    this.offlineProjection.tearDown();
    if (!this.realm.isClosed) {
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

  subscribe = (listener: Listener) => subscribeSet(this.listeners, listener);
  getSnapshot = () => this.version;

  subscribeLibraryMembership = (listener: Listener) =>
    subscribeSet(this.sliceListeners['library-membership'], listener);
  getLibraryMembershipSnapshot = () => this.sliceVersions['library-membership'];

  subscribeOfflineAvailability = (listener: Listener) =>
    subscribeSet(this.sliceListeners['offline-availability'], listener);
  getOfflineAvailabilitySnapshot = () => this.sliceVersions['offline-availability'];

  subscribeRemainingDownloads = (listener: Listener) =>
    subscribeSet(this.sliceListeners['remaining-downloads'], listener);
  getRemainingDownloadsSnapshot = () => this.remainingDownloadsCount();

  subscribeFavorite = (catalogType: FavoriteCatalogType, catalogUuid: string, listener: Listener) =>
    this.subscribeKey('favorite', favoriteKey(catalogType, catalogUuid), listener);
  getFavoriteSnapshot = (catalogType: FavoriteCatalogType, catalogUuid: string) =>
    this.keyVersion('favorite', favoriteKey(catalogType, catalogUuid));

  subscribeArtistLibrary = (uuid: string, listener: Listener) =>
    this.subscribeKey('artist-library', uuid, listener);
  getArtistLibrarySnapshot = (uuid: string) => this.keyVersion('artist-library', uuid);
  subscribeYearLibrary = (uuid: string, listener: Listener) =>
    this.subscribeKey('year-library', uuid, listener);
  getYearLibrarySnapshot = (uuid: string) => this.keyVersion('year-library', uuid);
  subscribeShowLibrary = (uuid: string, listener: Listener) =>
    this.subscribeKey('show-library', uuid, listener);
  getShowLibrarySnapshot = (uuid: string) => this.keyVersion('show-library', uuid);
  subscribeArtistOfflineTracks = (uuid: string, listener: Listener) =>
    this.subscribeKey('artist-offline', uuid, listener);
  getArtistOfflineTracksSnapshot = (uuid: string) => this.keyVersion('artist-offline', uuid);
  subscribeYearOfflineTracks = (uuid: string, listener: Listener) =>
    this.subscribeKey('year-offline', uuid, listener);
  getYearOfflineTracksSnapshot = (uuid: string) => this.keyVersion('year-offline', uuid);
  subscribeShowOfflineTracks = (uuid: string, listener: Listener) =>
    this.subscribeKey('show-offline', uuid, listener);
  getShowOfflineTracksSnapshot = (uuid: string) => this.keyVersion('show-offline', uuid);
  subscribeSourceOfflineTracks = (uuid: string, listener: Listener) =>
    this.subscribeKey('source-offline', uuid, listener);
  getSourceOfflineTracksSnapshot = (uuid: string) => this.keyVersion('source-offline', uuid);

  isFavorite(catalogType: FavoriteCatalogType, catalogUuid?: string | null) {
    return !!catalogUuid && this.favoriteUuids[catalogType].has(catalogUuid);
  }

  favoriteCatalogUuids(catalogType: FavoriteCatalogType): ReadonlySet<string> {
    return this.favoriteUuids[catalogType];
  }

  artistHasOfflineTracks(uuid?: string | null) {
    return !!uuid && this.offlineArtistUuids.has(uuid);
  }

  yearHasOfflineTracks(uuid?: string | null) {
    return !!uuid && this.offlineYearUuids.has(uuid);
  }

  showHasOfflineTracks(uuid?: string | null) {
    return !!uuid && this.offlineShowUuids.has(uuid);
  }

  sourceHasOfflineTracks(uuid?: string | null) {
    return !!uuid && this.offlineSourceUuids.has(uuid);
  }

  artistIsInLibrary(uuid?: string | null) {
    return !!uuid && this.libraryArtistUuids.has(uuid);
  }

  yearIsInLibrary(uuid?: string | null) {
    return !!uuid && this.libraryYearUuids.has(uuid);
  }

  showIsInLibrary(uuid?: string | null) {
    return !!uuid && this.libraryShowUuids.has(uuid);
  }

  remainingDownloadsCount() {
    return this.remainingDownloads.length;
  }

  hasRemainingDownloads() {
    return this.remainingDownloadsCount() > 0;
  }

  private readonly handleFavoriteProjectionChanged = () => {
    const previousFavorites = cloneFavoriteSets(this.favoriteUuids);
    const previousLibrary = this.librarySets();
    this.replaceFavoriteSets();
    this.replaceLibrarySets();

    this.queueSlice('library-membership');
    for (const catalogType of FAVORITE_CATALOG_TYPES) {
      this.queueChangedKeys(
        'favorite',
        previousFavorites[catalogType],
        this.favoriteUuids[catalogType],
        (uuid) => favoriteKey(catalogType, uuid)
      );
    }
    this.queueLibraryChanges(previousLibrary);
    this.scheduleEmit();
  };

  private readonly handleOfflineProjectionChanged = () => {
    const previousOffline = this.offlineSets();
    const previousLibrary = this.librarySets();
    this.replaceOfflineSets();
    this.replaceLibrarySets();

    this.queueSlice('offline-availability');
    this.queueSlice('library-membership');
    this.queueChangedKeys('artist-offline', previousOffline.artist, this.offlineArtistUuids);
    this.queueChangedKeys('year-offline', previousOffline.year, this.offlineYearUuids);
    this.queueChangedKeys('show-offline', previousOffline.show, this.offlineShowUuids);
    this.queueChangedKeys('source-offline', previousOffline.source, this.offlineSourceUuids);
    this.queueLibraryChanges(previousLibrary);
    this.scheduleEmit();
  };

  private readonly handleRemainingDownloadsChanged = () => {
    const count = this.remainingDownloadsCount();
    if (count === this.lastRemainingDownloadsCount) {
      return;
    }

    logLibraryIndexDebug(`remaining-downloads ${this.lastRemainingDownloadsCount} -> ${count}`);
    this.lastRemainingDownloadsCount = count;
    this.queueSlice('remaining-downloads');
    this.scheduleEmit();
  };

  private replaceFavoriteSets() {
    for (const type of FAVORITE_CATALOG_TYPES) {
      this.favoriteUuids[type] = new Set(this.favoriteProjection.favoriteUuids(type));
    }
  }

  private replaceOfflineSets() {
    this.offlineArtistUuids = new Set(this.offlineProjection.playableArtistUuids());
    this.offlineYearUuids = new Set(this.offlineProjection.playableYearUuids());
    this.offlineShowUuids = new Set(this.offlineProjection.playableShowUuids());
    this.offlineSourceUuids = new Set(this.offlineProjection.playableSourceUuids());
  }

  private replaceLibrarySets() {
    this.libraryArtistUuids = new Set([
      ...this.favoriteProjection.libraryArtistUuids(),
      ...this.offlineProjection.libraryArtistUuids(),
    ]);
    this.libraryYearUuids = new Set([
      ...this.favoriteProjection.libraryYearUuids(),
      ...this.offlineProjection.libraryYearUuids(),
    ]);
    this.libraryShowUuids = new Set([
      ...this.favoriteProjection.favoriteShowUuidsForLibrary(),
      ...this.offlineProjection.libraryShowUuids(),
    ]);
  }

  private queueLibraryChanges(previous: ReturnType<LibraryIndex['librarySets']>) {
    this.queueChangedKeys('artist-library', previous.artist, this.libraryArtistUuids);
    this.queueChangedKeys('year-library', previous.year, this.libraryYearUuids);
    this.queueChangedKeys('show-library', previous.show, this.libraryShowUuids);
  }

  private librarySets() {
    return {
      artist: new Set(this.libraryArtistUuids),
      year: new Set(this.libraryYearUuids),
      show: new Set(this.libraryShowUuids),
    };
  }

  private offlineSets() {
    return {
      artist: new Set(this.offlineArtistUuids),
      year: new Set(this.offlineYearUuids),
      show: new Set(this.offlineShowUuids),
      source: new Set(this.offlineSourceUuids),
    };
  }

  private queueChangedKeys(
    scope: KeyedScope,
    previous: ReadonlySet<string>,
    current: ReadonlySet<string>,
    keyForUuid: (uuid: string) => string = (uuid) => uuid
  ) {
    for (const uuid of union(previous, current)) {
      if (previous.has(uuid) !== current.has(uuid)) {
        this.pendingKeys[scope].add(keyForUuid(uuid));
      }
    }
  }

  private queueSlice(scope: SliceScope) {
    this.pendingSlices.add(scope);
  }

  private subscribeKey(scope: KeyedScope, key: string, listener: Listener) {
    let listeners = this.keyedListeners[scope].get(key);
    if (!listeners) {
      listeners = new Set();
      this.keyedListeners[scope].set(key, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.keyedListeners[scope].delete(key);
      }
    };
  }

  private keyVersion(scope: KeyedScope, key: string) {
    return this.keyedVersions[scope].get(key) ?? 0;
  }

  private scheduleEmit() {
    if (this.emitScheduled) {
      return;
    }
    this.emitScheduled = true;

    // One Realm transaction can notify several projections. React should see
    // the final combined membership instead of the intermediate notifications.
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.flushNotifications();
    });
  }

  private flushNotifications() {
    const slices = [...this.pendingSlices];
    this.pendingSlices.clear();
    const keyed = KEYED_SCOPES.map((scope) => ({ scope, keys: [...this.pendingKeys[scope]] }));
    for (const scope of KEYED_SCOPES) {
      this.pendingKeys[scope].clear();
    }

    if (slices.length === 0 && keyed.every(({ keys }) => keys.length === 0)) {
      return;
    }

    for (const scope of slices) {
      this.sliceVersions[scope] += 1;
      for (const listener of this.sliceListeners[scope]) {
        listener();
      }
    }
    for (const { scope, keys } of keyed) {
      for (const key of keys) {
        this.keyedVersions[scope].set(key, this.keyVersion(scope, key) + 1);
        for (const listener of this.keyedListeners[scope].get(key) ?? []) {
          listener();
        }
      }
    }

    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function createListenerRecord<T extends string>(keys: T[]) {
  return Object.fromEntries(keys.map((key) => [key, new Set<Listener>()])) as Record<
    T,
    Set<Listener>
  >;
}

function createVersionRecord<T extends string>(keys: T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function createKeyedListenerRecord() {
  return Object.fromEntries(
    KEYED_SCOPES.map((key) => [key, new Map<string, Set<Listener>>()])
  ) as Record<KeyedScope, Map<string, Set<Listener>>>;
}

function createKeyedVersionRecord() {
  return Object.fromEntries(KEYED_SCOPES.map((key) => [key, new Map<string, number>()])) as Record<
    KeyedScope,
    Map<string, number>
  >;
}

function createPendingKeyRecord() {
  return Object.fromEntries(KEYED_SCOPES.map((key) => [key, new Set<string>()])) as Record<
    KeyedScope,
    Set<string>
  >;
}

function createFavoriteSetRecord() {
  return Object.fromEntries(
    FAVORITE_CATALOG_TYPES.map((type) => [type, new Set<string>()])
  ) as Record<FavoriteCatalogType, Set<string>>;
}

function cloneFavoriteSets(source: Record<FavoriteCatalogType, Set<string>>) {
  return Object.fromEntries(
    FAVORITE_CATALOG_TYPES.map((type) => [type, new Set(source[type])])
  ) as Record<FavoriteCatalogType, Set<string>>;
}

function favoriteKey(catalogType: FavoriteCatalogType, catalogUuid: string) {
  return `${catalogType}:${catalogUuid}`;
}

function union(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return new Set([...a, ...b]);
}

function subscribeSet(listeners: Set<Listener>, listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
