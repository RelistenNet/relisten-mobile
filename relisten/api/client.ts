import wretch, { ConfiguredMiddleware, WretchError } from 'wretch';
import { log } from '../util/logging';
import { ArtistWithCounts } from './models/artist';
import { Year, YearWithShows } from './models/year';
import { ShowWithSources, SourceReview } from './models/source';
import dayjs from 'dayjs';
import { RelistenObject, RelistenUpdatableObject } from '@/relisten/api/models/relisten';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { realm } from '@/relisten/realm/schema';
import { UrlRequestMetadata } from '@/relisten/realm/models/url_request_metadata';
import { VenueWithShowCounts, VenueWithShows } from './models/venue';
import { TourWithShowCount, TourWithShows } from './models/tour';
import { SongWithPlayCount, SongWithShows } from './models/song';
import { Show } from './models/show';
import { Platform } from 'react-native';

const logger = log.extend('network');

const loggingMiddleware: ConfiguredMiddleware = (next) => (url, opts) => {
  logger.info(`[api] ${opts.method} ${url}`);

  return next(url, opts);
};

function calculateEtag(objs: Array<RelistenObject & RelistenUpdatableObject>): Promise<string> {
  let str = '';

  for (const obj of objs) {
    str += obj.uuid;
    str += obj.updated_at;
  }

  return digestStringAsync(CryptoDigestAlgorithm.MD5, str);
}

export enum RelistenApiResponseType {
  Offline,
  LastRequestTooRecent,
  RequestContentsUnchanged,
  OnlineRequestCompleted,
}

export interface RelistenApiResponse<T> {
  type: RelistenApiResponseType;
  data?: T;
  error?: RelistenApiClientError;
}

export interface RelistenApiRequestOptions {
  bypassEtagCaching?: boolean;
  bypassRateLimit?: boolean;
  bypassRequestDeduplication?: boolean;
}

export interface RelistenApiClientError {
  error?: Error;
  httpError?: WretchError;
  message?: string;
}

enum RelistenApiRequestMethod {
  GET = 'GET',
  POST = 'POST',
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

export class RelistenApiClient {
  static API_BASE = 'https://api.relisten.net/api';
  // static API_BASE = 'http://192.168.88.14:3823/api';

  private api = wretch(RelistenApiClient.API_BASE).middlewares([loggingMiddleware]);
  // TODO: wretch error handling

  private inflightRequests: Map<string, Promise<RelistenApiResponse<unknown>>> = new Map();

  private postJson<T>(url: string, body: object): Promise<RelistenApiResponse<T>> {
    return this.makeJsonRequest<T>(RelistenApiRequestMethod.POST, url, body);
  }

  private getJson<
    T extends
      | (RelistenObject & RelistenUpdatableObject)
      | Array<RelistenObject & RelistenUpdatableObject>,
  >(url: string, options?: RelistenApiRequestOptions): Promise<RelistenApiResponse<T>> {
    // we only do GET requests for now
    const key = 'GET@' + url;
    const hasInFlightRequest = this.inflightRequests.has(key);

    let req: Promise<RelistenApiResponse<T>> | undefined = undefined;

    if (options?.bypassRequestDeduplication === true || !hasInFlightRequest) {
      req = this.makeJsonRequest<T>(
        RelistenApiRequestMethod.GET,
        url,
        /* body= */ undefined,
        options
      );

      if (!options?.bypassRequestDeduplication) {
        req.then(() => {
          this.inflightRequests.delete(key);
        });

        this.inflightRequests.set(key, req);
      }
    } else if (hasInFlightRequest) {
      logger.info(`[dedupe] url=${url}, duplicate request found.`);
      req = this.inflightRequests.get(key) as Promise<RelistenApiResponse<T>>;
    }

    return req!;
  }

  static MIN_REQUEST_COOLDOWN_SECONDS = 1 * 60 * 60;
  static MIN_ETAG_COOLDOWN_SECONDS = 24 * 60 * 60;

  private async makeJsonRequest<T>(
    method: RelistenApiRequestMethod,
    url: string,
    body?: object,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<T>> {
    let urlMetadata: UrlRequestMetadata | null = null;
    if (method == RelistenApiRequestMethod.POST) {
      logger.info('[rate limiting] Bypassing rate-limiting for POST request');
    } else if (realm) {
      urlMetadata = realm.objectForPrimaryKey<UrlRequestMetadata>(UrlRequestMetadata, url);

      const msSinceLastRequest = urlMetadata
        ? Date.now() - urlMetadata.lastRequestCompletedAt.getTime()
        : undefined;

      // don't make a request more than once per hour
      if (options?.bypassRateLimit === true) {
        logger.info(
          `[rate limiting] url=${url}, making request. bypassRateLimit=${options?.bypassRateLimit}`
        );
      } else if (
        msSinceLastRequest &&
        msSinceLastRequest < RelistenApiClient.MIN_REQUEST_COOLDOWN_SECONDS * 1000
      ) {
        logger.info(
          `[rate limiting] url=${url}, skipping request. last request was too recent: ${(
            msSinceLastRequest / 1000.0
          ).toFixed(2)}s ago. (limit: ${RelistenApiClient.MIN_REQUEST_COOLDOWN_SECONDS.toFixed(2)})`
        );
        return { type: RelistenApiResponseType.LastRequestTooRecent };
      } else {
        logger.info(
          `[rate limiting] url=${url}, making request. secondsSinceLastRequest=${msSinceLastRequest}`
        );
      }
    }

    const startedAt = dayjs();

    try {
      const resp = await this.api.fetch(method, url, body).res();
      const j = await resp.json();

      const completedAt = new Date();
      const duration = dayjs(completedAt).diff(startedAt, 'milliseconds');

      logger.info(`[api] ${resp.status} ${duration}ms ${method} ${resp.url}`);

      if (method === RelistenApiRequestMethod.GET) {
        const values = (Array.isArray(j) ? j : [j]) as Array<
          RelistenObject & RelistenUpdatableObject
        >;

        // TODO(alecgorge): This doesn't account for situations like VenuesWithShows
        //  where the Venue hasn't changed but the list of Shows has changed
        const etag = await calculateEtag(values);
        const oldEtag = urlMetadata?.etag;

        let etagLastUpdatedAt = urlMetadata?.etagLastUpdatedAt;

        const msSinceEtagLastUpdated = etagLastUpdatedAt
          ? Date.now() - etagLastUpdatedAt.getTime()
          : undefined;

        if (options?.bypassEtagCaching === true) {
          logger.info(
            `[etag] url=${url}, updating local database. bypassEtagCaching=${options?.bypassEtagCaching}`
          );

          etagLastUpdatedAt = completedAt;
        } else if (etag === oldEtag) {
          if (
            msSinceEtagLastUpdated !== undefined &&
            msSinceEtagLastUpdated < RelistenApiClient.MIN_ETAG_COOLDOWN_SECONDS * 1000
          ) {
            logger.info(`[etag] url=${resp.url}, request contents unchanged. etag=${etag}`);
            return { type: RelistenApiResponseType.RequestContentsUnchanged };
          } else {
            logger.info(
              `[etag] url=${resp.url}, request contents unchanged but expired. msSinceEtagLastUpdated=${msSinceEtagLastUpdated}, etag=${etag}`
            );

            etagLastUpdatedAt = completedAt;
          }
        }

        logger.info(
          `[etag] url=${resp.url}, updating local database; request contents changed or expired. msSinceEtagLastUpdated=${msSinceEtagLastUpdated}, stored_etag=${oldEtag}, new_etag=${etag}`
        );

        realm?.write(() => {
          if (urlMetadata) {
            urlMetadata.etag = etag;
            urlMetadata.etagLastUpdatedAt = etagLastUpdatedAt;
            urlMetadata.lastRequestCompletedAt = completedAt;
          } else {
            realm?.create(UrlRequestMetadata, {
              url,
              etag,
              lastRequestCompletedAt: completedAt,
              etagLastUpdatedAt,
            });
          }
        });
      }

      return {
        type: RelistenApiResponseType.OnlineRequestCompleted,
        data: j as T,
      };
    } catch (e: any) {
      const err: RelistenApiClientError = {};

      if (e.response && e.response instanceof Response) {
        const wretchError = e as WretchError;
        err.httpError = wretchError;
        logger.error(`${wretchError.status} method=${method} url=${url} text=${wretchError.text}`);
      } else {
        err.error = e;
        err.message = `Error loading ${url}`;
        logger.error(`method=${method} url=${url} ${e}`);
      }

      return {
        type: RelistenApiResponseType.OnlineRequestCompleted,
        data: undefined,
        error: err,
      };
    }
  }

  public refreshOptions(forceRefresh: boolean): RelistenApiRequestOptions | undefined {
    if (!forceRefresh) {
      return;
    }

    return {
      bypassEtagCaching: true,
      bypassRateLimit: true,
    };
  }

  public artists(
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<ArtistWithCounts[]>> {
    return this.getJson('/v3/artists', options);
  }

  public artist(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<ArtistWithCounts>> {
    return this.getJson(`/v3/artists/${artistUuid}`, options);
  }

  public showWithSources(
    showUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<ShowWithSources>> {
    return this.getJson(`/v3/shows/${showUuid}`, options);
  }

  public showWithSourcesOnDate(
    artistIdOrSlug: string,
    showDate: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<ShowWithSources>> {
    return this.getJson(`/v2/artists/${artistIdOrSlug}/shows/${showDate}`, options);
  }

  public sourceReviews(
    sourceUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<SourceReview[]>> {
    return this.getJson(`/v3/sources/${sourceUuid}/reviews`, options);
  }

  public randomShow(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<ShowWithSources>> {
    return this.getJson(`/v2/artists/${artistUuid}/shows/random`, {
      bypassRateLimit: true,
      bypassEtagCaching: true,
      ...(options || {}),
    });
  }

  public topShow(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<Show[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/shows/top`, options);
  }

  public years(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<Year[]>> {
    return this.getJson(`/v3/artists/${artistUuid}/years`, options);
  }

  public year(
    artistUuid: string,
    yearUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<YearWithShows>> {
    return this.getJson(`/v3/artists/${artistUuid}/years/${yearUuid}`, options);
  }

  public venues(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<VenueWithShowCounts[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/venues`, options);
  }

  public venue(
    artistUuid: string,
    venueUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<VenueWithShows>> {
    return this.getJson(`/v3/artists/${artistUuid}/venues/${venueUuid}`, options);
  }

  public tours(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<TourWithShowCount[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/tours`, options);
  }

  public tour(
    artistUuid: string,
    tourUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<TourWithShows>> {
    return this.getJson(`/v3/artists/${artistUuid}/tours/${tourUuid}`, options);
  }

  public songs(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<SongWithPlayCount[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/songs`, options);
  }

  public song(
    artistUuid: string,
    songUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<SongWithShows>> {
    return this.getJson(`/v3/artists/${artistUuid}/songs/${songUuid}`, options);
  }

  public recentPerformedShows(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<Show[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/shows/recently-performed`, options);
  }

  public recentUpdatedShows(
    artistUuid: string,
    options?: RelistenApiRequestOptions
  ): Promise<RelistenApiResponse<Show[]>> {
    return this.getJson(`/v2/artists/${artistUuid}/shows/recently-updated`, options);
  }

  public async recordPlayback(sourceTrackUuid: string): Promise<RelistenApiResponse<unknown>> {
    const app_type = Platform.OS;

    // const app_type = 'ios';
    return await this.postJson<unknown>(
      `/v2/live/play?app_type=${app_type}&track_uuid=${sourceTrackUuid}`,
      {}
    );
  }

  public todayShows(options?: RelistenApiRequestOptions): Promise<RelistenApiResponse<Show[]>> {
    const now = new Date();
    return this.getJson(
      `/v2/shows/today?month=${now.getMonth() + 1}&day=${now.getDate()}`,
      options
    );
  }
}
