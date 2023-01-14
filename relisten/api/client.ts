import wretch, { ConfiguredMiddleware } from 'wretch';
import { ArtistWithCounts, FullArtist } from './models/artist';

const loggingMiddleware: ConfiguredMiddleware = (next) => (url, opts) => {
  console.debug(`[NETWORK] ${opts.method} ${url}`);

  return next(url, opts);
};

export class RelistenApiClient {
  static API_BASE = 'https://api.relisten.net/api';

  private api = wretch(RelistenApiClient.API_BASE).middlewares([loggingMiddleware]);
  // TODO: wretch error handling

  public artists(): Promise<ArtistWithCounts[]> {
    return this.api.get('/v3/artists').json();
  }

  public fullNormalizedArtist(artistUuid: string): Promise<FullArtist> {
    return this.api.get(`/v3/artists/${artistUuid}/normalized`).json();
  }
}
