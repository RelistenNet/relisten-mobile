import wretch, { ConfiguredMiddleware } from 'wretch';
import { log } from '../util/logging';
import { ArtistWithCounts, FullArtist } from './models/artist';

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
