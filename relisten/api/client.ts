import wretch, { ConfiguredMiddleware } from 'wretch';
import { log } from '../util/logging';
import { ArtistWithCounts, FullArtist } from './models/artist';
import { Year, YearWithShows } from './models/year';
import { ShowWithSources } from './models/source';
import dayjs from 'dayjs';
// import { dedupe } from 'wretch/middlewares';

const logger = log.extend('network');

const loggingMiddleware: ConfiguredMiddleware = (next) => (url, opts) => {
  logger.info(`[api] ${opts.method} ${url}`);

  return next(url, opts);
};

export class RelistenApiClient {
  static API_BASE = 'https://api.relisten.net/api';

  private api = wretch(RelistenApiClient.API_BASE).middlewares([
    // https://github.com/elbywan/wretch/issues/181
    // dedupe({
    //   /* Options - defaults below */
    //   skip: (url, opts) => opts.skipDedupe || opts.method !== 'GET',
    //   key: (url, opts) => opts.method + '@' + url,
    //   resolver: (response) => response.clone(),
    // }),
    loggingMiddleware,
  ]);
  // TODO: wretch error handling

  private async getJson(url: string) {
    const startedAt = dayjs();
    const resp = await this.api.get(url).res();
    const j = await resp.json();

    const duration = dayjs().diff(startedAt, 'milliseconds');

    logger.info(`[api] ${resp.status} ${duration}ms ${resp.url}`);

    return j;
  }

  public artists(): Promise<ArtistWithCounts[]> {
    return this.getJson('/v3/artists');
  }

  public artist(artistUuid: string): Promise<ArtistWithCounts> {
    return this.getJson(`/v3/artists/${artistUuid}`);
  }

  public showWithSources(showUuid: string): Promise<ShowWithSources> {
    return this.getJson(`/v3/shows/${showUuid}`);
  }

  public years(artistUuid: string): Promise<Year[]> {
    return this.getJson(`/v3/artists/${artistUuid}/years`);
  }

  public year(artistUuid: string, yearUuid: string): Promise<YearWithShows> {
    return this.getJson(`/v3/artists/${artistUuid}/years/${yearUuid}`);
  }

  public fullNormalizedArtist(artistUuid: string): Promise<FullArtist> {
    return this.getJson(`/v3/artists/${artistUuid}/normalized`);
  }
}
