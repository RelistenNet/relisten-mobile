import Realm from 'realm';
import type { FavoriteAccountScopeSource } from '@/relisten/library/favorite_repository';
import type { FavoriteCatalogType } from '@/relisten/realm/models/library/favorite_catalog_type';
import { UserFavorite } from '@/relisten/realm/models/library/user_favorite';

type Listener = () => void;

interface ShowProjection extends Realm.Object<ShowProjection> {
  artistUuid?: string | null;
  yearUuid?: string | null;
}

interface SourceProjection extends Realm.Object<SourceProjection> {
  showUuid?: string | null;
}

interface SourceTrackProjection extends Realm.Object<SourceTrackProjection> {
  showUuid?: string | null;
}

interface ArtistChildProjection extends Realm.Object<ArtistChildProjection> {
  artistUuid?: string | null;
}

/** Active-account favorite membership plus the catalog relationships needed by My Library. */
export class FavoriteMembershipProjection {
  private readonly listeners = new Set<Listener>();
  private readonly favorites: Realm.Results<UserFavorite>;
  private readonly shows: Realm.Results<ShowProjection>;
  private readonly sources: Realm.Results<SourceProjection>;
  private readonly sourceTracks: Realm.Results<SourceTrackProjection>;
  private readonly songs: Realm.Results<ArtistChildProjection>;
  private readonly tours: Realm.Results<ArtistChildProjection>;
  private readonly venues: Realm.Results<ArtistChildProjection>;
  private readonly favoriteUuidsByType = new Map<FavoriteCatalogType, Set<string>>();
  private readonly libraryShowUuids = new Set<string>();
  private readonly favoriteContentByArtist = new Map<string, number>();
  private readonly favoriteContentByYear = new Map<string, number>();
  private readonly unsubscribeAccountScope: () => void;
  private version = 0;

  constructor(
    private readonly realm: Realm,
    private readonly accountScopeSource: FavoriteAccountScopeSource
  ) {
    // Observe the source collection instead of a prefiltered membership view. A favorite
    // entering or leaving `effectivePresent` must wake an already-mounted list; deriving the
    // active set here makes both transitions observable before the projection is rebuilt.
    this.favorites = realm.objects(UserFavorite);
    // String schema names keep this projection below the model/repository layer and avoid
    // making account membership participate in every catalog model's import graph.
    this.shows = realm.objects<ShowProjection>('Show');
    this.sources = realm.objects<SourceProjection>('Source');
    this.sourceTracks = realm.objects<SourceTrackProjection>('SourceTrack');
    this.songs = realm.objects<ArtistChildProjection>('Song');
    this.tours = realm.objects<ArtistChildProjection>('Tour');
    this.venues = realm.objects<ArtistChildProjection>('Venue');

    this.favorites.addListener(this.handleDataChanged, [
      'scopeId',
      'catalogType',
      'catalogUuid',
      'effectivePresent',
    ]);
    this.shows.addListener(this.handleDataChanged);
    this.sources.addListener(this.handleDataChanged);
    this.sourceTracks.addListener(this.handleDataChanged);
    this.songs.addListener(this.handleDataChanged);
    this.tours.addListener(this.handleDataChanged);
    this.venues.addListener(this.handleDataChanged);
    this.unsubscribeAccountScope = accountScopeSource.subscribe(this.handleDataChanged);
    this.rebuild();
  }

  tearDown() {
    if (!this.realm.isClosed) {
      this.favorites.removeListener(this.handleDataChanged);
      this.shows.removeListener(this.handleDataChanged);
      this.sources.removeListener(this.handleDataChanged);
      this.sourceTracks.removeListener(this.handleDataChanged);
      this.songs.removeListener(this.handleDataChanged);
      this.tours.removeListener(this.handleDataChanged);
      this.venues.removeListener(this.handleDataChanged);
    }
    this.unsubscribeAccountScope();
    this.listeners.clear();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.version;

  isFavorite(catalogType: FavoriteCatalogType, catalogUuid?: string | null) {
    return !!catalogUuid && (this.favoriteUuidsByType.get(catalogType)?.has(catalogUuid) ?? false);
  }

  favoriteUuids(catalogType: FavoriteCatalogType): ReadonlySet<string> {
    return this.favoriteUuidsByType.get(catalogType) ?? EMPTY_SET;
  }

  favoriteShowUuidsForLibrary(): ReadonlySet<string> {
    return this.libraryShowUuids;
  }

  libraryArtistUuids() {
    return new Set([
      ...this.favoriteUuids('artist'),
      ...this.favoriteContentByArtist.keys(),
    ]).values();
  }

  libraryYearUuids() {
    return this.favoriteContentByYear.keys();
  }

  artistHasFavoriteContent(artistUuid?: string | null) {
    return (
      !!artistUuid &&
      (this.isFavorite('artist', artistUuid) ||
        (this.favoriteContentByArtist.get(artistUuid) ?? 0) > 0)
    );
  }

  yearHasFavoriteContent(yearUuid?: string | null) {
    return !!yearUuid && (this.favoriteContentByYear.get(yearUuid) ?? 0) > 0;
  }

  private readonly handleDataChanged = () => {
    this.rebuild();
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  };

  private rebuild() {
    this.favoriteUuidsByType.clear();
    this.libraryShowUuids.clear();
    this.favoriteContentByArtist.clear();
    this.favoriteContentByYear.clear();

    const activeScopeId = this.accountScopeSource.capture().scopeId;
    for (const favorite of this.favorites) {
      if (favorite.scopeId !== activeScopeId || !favorite.effectivePresent) {
        continue;
      }

      let typeFavorites = this.favoriteUuidsByType.get(favorite.catalogType);
      if (!typeFavorites) {
        typeFavorites = new Set<string>();
        this.favoriteUuidsByType.set(favorite.catalogType, typeFavorites);
      }
      typeFavorites.add(favorite.catalogUuid);
    }

    for (const showUuid of this.favoriteUuids('show')) {
      this.addLibraryShow(showUuid);
    }
    for (const sourceUuid of this.favoriteUuids('source')) {
      this.addLibraryShow(
        this.realm.objectForPrimaryKey<SourceProjection>('Source', sourceUuid)?.showUuid
      );
    }
    for (const trackUuid of this.favoriteUuids('source_track')) {
      this.addLibraryShow(
        this.realm.objectForPrimaryKey<SourceTrackProjection>('SourceTrack', trackUuid)?.showUuid
      );
    }
    for (const songUuid of this.favoriteUuids('song')) {
      this.addLibraryArtist(
        this.realm.objectForPrimaryKey<ArtistChildProjection>('Song', songUuid)?.artistUuid
      );
    }
    for (const tourUuid of this.favoriteUuids('tour')) {
      this.addLibraryArtist(
        this.realm.objectForPrimaryKey<ArtistChildProjection>('Tour', tourUuid)?.artistUuid
      );
    }
    for (const venueUuid of this.favoriteUuids('venue')) {
      this.addLibraryArtist(
        this.realm.objectForPrimaryKey<ArtistChildProjection>('Venue', venueUuid)?.artistUuid
      );
    }
  }

  private addLibraryShow(showUuid?: string | null) {
    if (!showUuid || this.libraryShowUuids.has(showUuid)) {
      return;
    }

    this.libraryShowUuids.add(showUuid);
    const show = this.realm.objectForPrimaryKey<ShowProjection>('Show', showUuid);
    if (show) {
      this.addLibraryArtist(show.artistUuid);
      increment(this.favoriteContentByYear, show.yearUuid);
    }
  }

  private addLibraryArtist(artistUuid?: string | null) {
    increment(this.favoriteContentByArtist, artistUuid);
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

function increment(counts: Map<string, number>, uuid?: string | null) {
  if (uuid) {
    counts.set(uuid, (counts.get(uuid) ?? 0) + 1);
  }
}
