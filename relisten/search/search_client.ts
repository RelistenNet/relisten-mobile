import type { AuthorizedAccountsApiClient } from '@/relisten/accounts/api/accounts_api_client';
import type { SearchRequest, SearchResponse } from './search_types';

/** The server rejects more boosts than this. */
export const MAX_BOOST_ARTIST_IDS = 32;

export function searchPath(request: SearchRequest): string {
  const params = new URLSearchParams();
  params.set('q', request.q);
  params.set('scope', request.scope);
  params.set('mode', request.mode);
  params.set('typing', request.typing ? 'true' : 'false');
  params.set('request_id', request.requestId);

  if (request.artistId) {
    params.set('artist_id', request.artistId);
  }
  if (request.boostArtistIds?.length) {
    params.set('boost_artist_ids', request.boostArtistIds.slice(0, MAX_BOOST_ARTIST_IDS).join(','));
  }
  if (request.ignore?.length) {
    params.set('ignore', request.ignore.join(','));
  }
  if (request.page && request.page > 1) {
    params.set('page', String(request.page));
  }

  return `/v1/search?${params.toString()}`;
}

/**
 * Runs one search. Signed in, it goes with the account's token, which brings
 * the listener's private playlists and refreshes the token on a 401; signed
 * out, it goes without credentials. An aborted request rejects with the
 * transport's error, so callers check `signal.aborted` rather than the error.
 */
export function fetchSearch(
  api: AuthorizedAccountsApiClient,
  request: SearchRequest,
  signedIn: boolean,
  signal: AbortSignal
): Promise<SearchResponse> {
  const path = searchPath(request);

  return signedIn
    ? api.request<SearchResponse>(path, { signal, routine: true })
    : api.requestAnonymously<SearchResponse>(path, { signal });
}
