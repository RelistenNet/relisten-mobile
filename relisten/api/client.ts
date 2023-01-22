import wretch, { ConfiguredMiddleware } from 'wretch';
import { log } from '../util/logging';
import { ArtistWithCounts, FullArtist } from './models/artist';
import { Year } from './models/year';
import { ShowWithSources } from './models/source';

const logger = log.extend('network');

const loggingMiddleware: ConfiguredMiddleware = (next) => (url, opts) => {
  logger.info(`${opts.method} ${url}`);

  return next(url, opts);
};

export class RelistenApiClient {
  static API_BASE = 'https://api.relisten.net/api';

  private api = wretch(RelistenApiClient.API_BASE).middlewares([loggingMiddleware]);
  // TODO: wretch error handling

  public artists(): Promise<ArtistWithCounts[]> {
    return this.api.get('/v3/artists').json();
  }

  public artist(artistUuid: string): Promise<ArtistWithCounts> {
    return this.api.get(`/v3/artists/${artistUuid}`).json();
  }

  public showWithSources(showUuid: string): Promise<ShowWithSources> {
    return this.api.get(`/v3/shows/${showUuid}`).json();
  }

  public year(artistUuid: string, yearUuid: string): Promise<Year> {
    return this.api.get(`/v2/artists/${artistUuid}/years/${yearUuid}`).json();
  }

  private inflightArtistRequests: { [artistUuid: string]: Promise<FullArtist> } = {};

  public fullNormalizedArtist(artistUuid: string): Promise<FullArtist> {
    if (!this.inflightArtistRequests[artistUuid]) {
      const req: Promise<FullArtist> = this.api.get(`/v3/artists/${artistUuid}/normalized`).json();

      this.inflightArtistRequests[artistUuid] = req
        .catch((err) => {
          delete this.inflightArtistRequests[artistUuid];
          throw err;
        })
        .then((res) => {
          delete this.inflightArtistRequests[artistUuid];
          return res;
        });
    }

    return this.inflightArtistRequests[artistUuid];
  }
}
