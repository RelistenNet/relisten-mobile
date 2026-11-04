import { Platform } from 'react-native';
import { encodeV4UuidCatalogId } from './v4/catalog_identity';
import type { V4CatalogReferenceRequest, V4CatalogResolveResponse } from './v4/catalog_resolve';
import { CatalogV4Transport } from './v4/catalog_transport';
import type {
  V4ArtistResource,
  V4ArtistSongEntryResource,
  V4ArtistVenueEntryResource,
  V4ArtistVenueWithShowsResource,
  V4ImportedSongWithShowsResource,
  V4ImportedVenueWithShowsResource,
  V4LiveHistoryResource,
  V4ShowResource,
  V4ShowSummaryResource,
  V4SongWithShowsResource,
  V4SongWithTracksResource,
  V4SourceResource,
  V4SourceReviewResource,
  V4TourResource,
  V4TourWithShowsResource,
  V4TrackResource,
  V4VenueWithShowsResource,
  V4YearResource,
  V4YearWithShowsResource,
} from './v4/wire_types';

export enum RelistenApiResponseType {
  Offline,
  RequestContentsUnchanged = 2,
  OnlineRequestCompleted = 3,
}

export interface RelistenApiResponse<T> {
  type: RelistenApiResponseType;
  data?: T;
  error?: RelistenApiClientError;
  etag?: string;
}

/** HTTP validators are supplied by the owning repository, never stored by this client. */
export interface RelistenApiRequestOptions {
  etag?: string;
}

export interface RelistenApiClientError {
  error?: Error;
  httpError?: { status: number; url: string };
  message?: string;
}

export function errorDisplayString(err?: RelistenApiClientError): string {
  if (!err) {
    return 'Unknown (missing) error';
  }

  if (err.message) {
    return err.message;
  }

  if (err.httpError) {
    return `${err.httpError.status} ${err.httpError.url}`;
  }

  return 'Unknown error';
}

/** HTTP-only v4 client. Repositories own Realm writes, freshness, membership and retry policy. */
export class RelistenApiClient {
  private readonly transport: CatalogV4Transport;

  constructor(options: { transport?: CatalogV4Transport } = {}) {
    this.transport = options.transport ?? new CatalogV4Transport();
  }

  /** Complete shared list; repositories filter automatically created visibility locally. */
  artists(options?: RelistenApiRequestOptions) {
    return this.get<V4ArtistResource[]>('/artists?include_autocreated=true', options);
  }

  years(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4YearResource[]>(`${this.artistPath(artistUuid)}/years`, options);
  }

  year(artistUuid: string, yearUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4YearWithShowsResource>(
      `${this.artistPath(artistUuid)}/years/${encodeV4UuidCatalogId(yearUuid, 'year')}`,
      options
    );
  }

  showWithSources(showUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ShowResource>(`/shows/${encodeV4UuidCatalogId(showUuid, 'show')}`, options);
  }

  source(sourceUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4SourceResource>(
      `/sources/${encodeV4UuidCatalogId(sourceUuid, 'source')}`,
      options
    );
  }

  track(trackUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4TrackResource>(
      `/source-tracks/${encodeV4UuidCatalogId(trackUuid, 'track')}`,
      options
    );
  }

  venues(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ArtistVenueEntryResource[]>(`${this.artistPath(artistUuid)}/venues`, options);
  }

  artistVenue(artistUuid: string, venueId: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ArtistVenueWithShowsResource>(
      `${this.artistPath(artistUuid)}/venues/${venueId}`,
      options
    );
  }

  importedVenue(venueUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ImportedVenueWithShowsResource>(
      `/imported-venues/${encodeV4UuidCatalogId(venueUuid, 'imported_venue')}`,
      options
    );
  }

  venue(venueId: string, options?: RelistenApiRequestOptions) {
    return this.get<V4VenueWithShowsResource>(`/venues/${venueId}`, options);
  }

  songs(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ArtistSongEntryResource[]>(`${this.artistPath(artistUuid)}/songs`, options);
  }

  song(songId: string, options?: RelistenApiRequestOptions) {
    return this.get<V4SongWithShowsResource>(`/songs/${songId}`, options);
  }

  songTracks(songId: string, options?: RelistenApiRequestOptions) {
    return this.get<V4SongWithTracksResource>(`/songs/${songId}/tracks`, options);
  }

  importedSong(songUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4ImportedSongWithShowsResource>(
      `/imported-songs/${encodeV4UuidCatalogId(songUuid, 'imported_song')}`,
      options
    );
  }

  tours(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4TourResource[]>(`${this.artistPath(artistUuid)}/tours`, options);
  }

  tour(tourUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<V4TourWithShowsResource>(
      `/tours/${encodeV4UuidCatalogId(tourUuid, 'tour')}`,
      options
    );
  }

  sourceReviews(sourceUuid: string) {
    return this.get<V4SourceReviewResource[]>(
      `/sources/${encodeV4UuidCatalogId(sourceUuid, 'source')}/reviews`
    );
  }

  showWithSourcesOnDate(artistUuid: string, date: string) {
    return this.get<V4ShowResource>(
      `${this.artistPath(artistUuid)}/shows/by-date/${encodeURIComponent(date)}`
    );
  }

  randomShow(artistUuid: string) {
    return this.request<V4ShowResource>(`${this.artistPath(artistUuid)}/shows/random`);
  }

  topShow(artistUuid: string) {
    return this.get<V4ShowSummaryResource[]>(`${this.artistPath(artistUuid)}/shows/top`);
  }

  recentPerformedShows(artistUuid: string) {
    return this.get<V4ShowSummaryResource[]>(
      `${this.artistPath(artistUuid)}/shows/recently-performed`
    );
  }

  recentUpdatedShows(artistUuid: string) {
    return this.get<V4ShowSummaryResource[]>(
      `${this.artistPath(artistUuid)}/shows/recently-updated`
    );
  }

  showsByMomentum(artistUuids: string[]) {
    const params = new URLSearchParams();
    for (const uuid of artistUuids) {
      params.append('artist_ids', encodeV4UuidCatalogId(uuid, 'artist'));
    }
    return this.get<V4ShowSummaryResource[]>(`/shows/momentum?${params}`);
  }

  todayShows(date = new Date()) {
    return this.get<V4ShowSummaryResource[]>(
      `/shows/on-date?month=${date.getMonth() + 1}&day=${date.getDate()}`
    );
  }

  recordPlayback(trackUuid: string) {
    return this.request<{
      sequence: number;
      played_at: string;
      track_id: string;
      app_type: string;
    }>('/live/play', {
      track_id: encodeV4UuidCatalogId(trackUuid, 'track'),
      app_type: Platform.OS,
    });
  }

  liveHistory(afterSequence?: number) {
    const params = new URLSearchParams({ limit: '200' });
    if (afterSequence !== undefined) {
      params.set('after_sequence', String(afterSequence));
    }
    return this.request<V4LiveHistoryResource[]>(`/live/history?${params}`);
  }

  resolveCatalogReferences(references: V4CatalogReferenceRequest[]) {
    return this.request<V4CatalogResolveResponse>('/catalog/resolve', { references });
  }

  private artistPath(uuid: string) {
    return `/artists/${encodeV4UuidCatalogId(uuid, 'artist')}`;
  }

  private async get<T>(
    path: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<T>> {
    try {
      const response = await this.transport.getJson<T>(path, options?.etag);
      return response.status === 'not_modified'
        ? { type: RelistenApiResponseType.RequestContentsUnchanged, etag: response.etag }
        : {
            type: RelistenApiResponseType.OnlineRequestCompleted,
            data: response.data,
            etag: response.etag,
          };
    } catch (error) {
      return this.failure(error);
    }
  }

  private async request<T>(path: string, body?: object): Promise<RelistenApiResponse<T>> {
    try {
      return {
        type: RelistenApiResponseType.OnlineRequestCompleted,
        data: await this.transport.requestJson<T>(path, body),
      };
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown) {
    const cause = error instanceof Error ? error : new Error(String(error));
    return {
      type: RelistenApiResponseType.Offline,
      error: { error: cause, message: cause.message },
    };
  }
}
