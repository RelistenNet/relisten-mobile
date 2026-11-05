import { Platform } from 'react-native';
import { encodeUuidCatalogId } from './catalog/identity';
import type { CatalogReferenceRequest, CatalogResolveResponse } from './catalog/resolve';
import { CatalogTransport } from './catalog/transport';
import type {
  ArtistResource,
  ArtistSongEntryResource,
  ArtistVenueEntryResource,
  ArtistVenueWithShowsResource,
  ImportedSongWithShowsResource,
  ImportedVenueWithShowsResource,
  LiveHistoryResource,
  ShowResource,
  ShowSummaryResource,
  SongWithShowsResource,
  SongWithTracksResource,
  SourceResource,
  SourceReviewResource,
  TourResource,
  TourWithShowsResource,
  TrackResource,
  VenueWithShowsResource,
  YearResource,
  YearWithShowsResource,
} from './catalog/resources';

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

/** HTTP-only catalog client. Repositories own Realm writes, freshness, membership and retry policy. */
export class RelistenApiClient {
  private readonly transport: CatalogTransport;

  constructor(options: { transport?: CatalogTransport } = {}) {
    this.transport = options.transport ?? new CatalogTransport();
  }

  /** Complete shared list; repositories filter automatically created visibility locally. */
  artists(options?: RelistenApiRequestOptions) {
    return this.get<ArtistResource[]>('/artists?include_autocreated=true', options);
  }

  years(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<YearResource[]>(`${this.artistPath(artistUuid)}/years`, options);
  }

  year(artistUuid: string, yearUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<YearWithShowsResource>(
      `${this.artistPath(artistUuid)}/years/${encodeUuidCatalogId(yearUuid, 'year')}`,
      options
    );
  }

  showWithSources(showUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<ShowResource>(`/shows/${encodeUuidCatalogId(showUuid, 'show')}`, options);
  }

  source(sourceUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<SourceResource>(
      `/sources/${encodeUuidCatalogId(sourceUuid, 'source')}`,
      options
    );
  }

  track(trackUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<TrackResource>(
      `/source-tracks/${encodeUuidCatalogId(trackUuid, 'track')}`,
      options
    );
  }

  venues(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<ArtistVenueEntryResource[]>(`${this.artistPath(artistUuid)}/venues`, options);
  }

  artistVenue(artistUuid: string, venueId: string, options?: RelistenApiRequestOptions) {
    return this.get<ArtistVenueWithShowsResource>(
      `${this.artistPath(artistUuid)}/venues/${venueId}`,
      options
    );
  }

  importedVenue(venueUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<ImportedVenueWithShowsResource>(
      `/imported-venues/${encodeUuidCatalogId(venueUuid, 'imported_venue')}`,
      options
    );
  }

  venue(venueId: string, options?: RelistenApiRequestOptions) {
    return this.get<VenueWithShowsResource>(`/venues/${venueId}`, options);
  }

  songs(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<ArtistSongEntryResource[]>(`${this.artistPath(artistUuid)}/songs`, options);
  }

  song(songId: string, options?: RelistenApiRequestOptions) {
    return this.get<SongWithShowsResource>(`/songs/${songId}`, options);
  }

  songTracks(songId: string, options?: RelistenApiRequestOptions) {
    return this.get<SongWithTracksResource>(`/songs/${songId}/tracks`, options);
  }

  importedSong(songUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<ImportedSongWithShowsResource>(
      `/imported-songs/${encodeUuidCatalogId(songUuid, 'imported_song')}`,
      options
    );
  }

  tours(artistUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<TourResource[]>(`${this.artistPath(artistUuid)}/tours`, options);
  }

  tour(tourUuid: string, options?: RelistenApiRequestOptions) {
    return this.get<TourWithShowsResource>(
      `/tours/${encodeUuidCatalogId(tourUuid, 'tour')}`,
      options
    );
  }

  sourceReviews(sourceUuid: string) {
    return this.get<SourceReviewResource[]>(
      `/sources/${encodeUuidCatalogId(sourceUuid, 'source')}/reviews`
    );
  }

  showWithSourcesOnDate(artistUuid: string, date: string) {
    return this.get<ShowResource>(
      `${this.artistPath(artistUuid)}/shows/by-date/${encodeURIComponent(date)}`
    );
  }

  randomShow(artistUuid: string) {
    return this.request<ShowResource>(`${this.artistPath(artistUuid)}/shows/random`);
  }

  topShow(artistUuid: string) {
    return this.get<ShowSummaryResource[]>(`${this.artistPath(artistUuid)}/shows/top`);
  }

  recentPerformedShows(artistUuid: string) {
    return this.get<ShowSummaryResource[]>(
      `${this.artistPath(artistUuid)}/shows/recently-performed`
    );
  }

  recentUpdatedShows(artistUuid: string) {
    return this.get<ShowSummaryResource[]>(`${this.artistPath(artistUuid)}/shows/recently-updated`);
  }

  showsByMomentum(artistUuids: string[]) {
    const params = new URLSearchParams();
    for (const uuid of artistUuids) {
      params.append('artist_ids', encodeUuidCatalogId(uuid, 'artist'));
    }
    return this.get<ShowSummaryResource[]>(`/shows/momentum?${params}`);
  }

  todayShows(date = new Date()) {
    return this.get<ShowSummaryResource[]>(
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
      track_id: encodeUuidCatalogId(trackUuid, 'track'),
      app_type: Platform.OS,
    });
  }

  liveHistory(afterSequence?: number) {
    const params = new URLSearchParams({ limit: '200' });
    if (afterSequence !== undefined) {
      params.set('after_sequence', String(afterSequence));
    }
    return this.request<LiveHistoryResource[]>(`/live/history?${params}`);
  }

  resolveCatalogReferences(references: CatalogReferenceRequest[]) {
    return this.request<CatalogResolveResponse>('/catalog/resolve', { references });
  }

  private artistPath(uuid: string) {
    return `/artists/${encodeUuidCatalogId(uuid, 'artist')}`;
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
