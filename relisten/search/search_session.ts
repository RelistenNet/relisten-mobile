import type { SearchMode, SearchRequest, SearchResponse, SearchScope } from './search_types';

export const SEARCH_DEBOUNCE_MS = 120;

/** An explicit artist filter, shown as a removable chip. */
export interface SearchArtistFilter {
  artistId: string;
  label: string;
}

/** What the listener has asked for. Any change invalidates pending results. */
export interface SearchInputs {
  query: string;
  scope: SearchScope;
  /** Interpretation chip keys the listener removed; sent in `ignore`. */
  removedChipKeys: readonly string[];
  artistFilter: SearchArtistFilter | null;
}

/**
 * Who the results are for and whether to ask the server. Results fetched for
 * one `accountKey` are never shown under another, so a private playlist card
 * can't outlive a sign-out or an account switch.
 */
export interface SearchContext {
  accountKey: string;
  signedIn: boolean;
  online: boolean;
  boostArtistIds: readonly string[];
}

/**
 * The key results are bound to. It includes the scope generation, which
 * changes on every sign-in and sign-out, so signing out and back in as the
 * same user still starts from an empty list.
 */
export function searchAccountKey(scope: {
  scopeId: string;
  userId: string | null;
  generation: number;
}): string {
  return `${scope.scopeId}:${scope.userId ?? ''}:${scope.generation}`;
}

export interface SearchSessionState {
  inputs: SearchInputs;
  /**
   * The latest response for the current account. While a newer request is
   * pending it stays on screen, so results are replaced in one render rather
   * than blanking between keystrokes.
   */
  response: SearchResponse | null;
  /** The inputs `response` answers. They trail `inputs` while a request is pending. */
  responseInputs: SearchInputs | null;
  /** A request is debouncing or in flight for the current inputs. */
  pending: boolean;
  /** The latest request failed before the server answered; `retry` sends it again. */
  failed: boolean;
}

export type SearchFetcher = (
  request: SearchRequest,
  signedIn: boolean,
  signal: AbortSignal
) => Promise<SearchResponse>;

const EMPTY_INPUTS: SearchInputs = {
  query: '',
  scope: 'all',
  removedChipKeys: [],
  artistFilter: null,
};

let nextSessionId = 1;

/**
 * One search screen's query and results. It owns the inputs, debounces typing,
 * and makes sure only the answer to the latest inputs, for the current
 * account, is ever shown.
 *
 * Every change bumps `generation` immediately, before the debounce runs, and
 * aborts the request in flight. A response is applied only if its generation
 * is still current when it arrives, so an answer to an old query that lands
 * during the debounce of a new one is dropped rather than flashed.
 */
export class SearchSession {
  private readonly listeners = new Set<() => void>();
  private readonly sessionId = nextSessionId++;
  private state: SearchSessionState = {
    inputs: EMPTY_INPUTS,
    response: null,
    responseInputs: null,
    pending: false,
    failed: false,
  };
  private context: SearchContext | null = null;
  private generation = 0;
  private requestCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: AbortController | null = null;

  constructor(
    private readonly mode: SearchMode,
    private readonly fetcher: SearchFetcher,
    private readonly debounceMs = SEARCH_DEBOUNCE_MS
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SearchSessionState => this.state;

  /**
   * Updates who is searching:
   * - another account discards everything shown and searches again;
   * - going offline drops anything pending;
   * - coming back online searches again.
   * Boost changes apply to the next request without refetching.
   */
  setContext(context: SearchContext) {
    const previous = this.context;
    this.context = context;

    if (!previous) {
      // A query typed before the first context waits for it.
      this.restart();
      return;
    }
    if (previous.accountKey !== context.accountKey) {
      this.update({ response: null, responseInputs: null });
      this.restart();
    } else if (previous.online !== context.online) {
      this.restart();
    }
  }

  /**
   * Typing: debounced, with the server's fast typing results. Removed chips
   * belong to the text they were read from, so editing the text brings them back.
   */
  setQuery(query: string) {
    this.changeInputs({ query, removedChipKeys: [] }, { typing: true });
  }

  /** Return key: full results for the current text, right away. */
  submit() {
    this.changeInputs({}, { typing: false });
  }

  setScope(scope: SearchScope) {
    this.changeInputs({ scope }, { typing: false });
  }

  removeChip(key: string) {
    if (key === 'artist' && this.state.inputs.artistFilter) {
      this.setArtistFilter(null);
      return;
    }

    const removedChipKeys = [...new Set([...this.state.inputs.removedChipKeys, key])];
    this.changeInputs({ removedChipKeys }, { typing: false });
  }

  /** Narrows to one artist (Add Tracks), or clears the filter with null. */
  setArtistFilter(artistFilter: SearchArtistFilter | null) {
    this.changeInputs({ artistFilter }, { typing: false });
  }

  retry() {
    this.restart();
  }

  dispose() {
    this.invalidate();
    this.listeners.clear();
  }

  private changeInputs(change: Partial<SearchInputs>, { typing }: { typing: boolean }) {
    this.invalidate();
    this.update({ inputs: { ...this.state.inputs, ...change }, failed: false });
    this.schedule(typing);
  }

  /** Sends the current inputs again, now: after a retry, reconnect or account switch. */
  private restart() {
    this.invalidate();
    this.update({ failed: false });
    this.schedule(false);
  }

  /** Drops the pending timer and request, so nothing older can land. */
  private invalidate() {
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /**
   * Sends a request for the current inputs, after the debounce when typing.
   * An empty field clears the results. Offline, nothing is sent and the last
   * response is kept but not shown (see `presentSearch`), so reconnecting
   * can replace it without a blank frame.
   */
  private schedule(typing: boolean) {
    const context = this.context;
    const hasQuery = this.state.inputs.query.trim() !== '';

    if (!hasQuery) {
      this.update({ pending: false, response: null, responseInputs: null });
      return;
    }
    if (!context?.online) {
      this.update({ pending: false });
      return;
    }

    this.update({ pending: true });
    const generation = this.generation;
    if (!typing) {
      void this.send(generation, false);
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send(generation, true);
    }, this.debounceMs);
  }

  private async send(generation: number, typing: boolean) {
    const context = this.context;
    if (!context?.online) {
      return;
    }

    const { inputs } = this.state;
    const controller = new AbortController();
    this.inFlight = controller;
    this.requestCount += 1;
    const request = this.request(inputs, context, typing);

    try {
      const response = await this.fetcher(request, context.signedIn, controller.signal);
      if (generation === this.generation) {
        this.update({ response, responseInputs: inputs, pending: false, failed: false });
      }
    } catch {
      // The transport wraps an abort as an ordinary error, and a stale account
      // throws its own; both belong to a generation that is no longer current.
      if (!controller.signal.aborted && generation === this.generation) {
        this.update({ pending: false, failed: true });
      }
    } finally {
      if (this.inFlight === controller) {
        this.inFlight = null;
      }
    }
  }

  private request(inputs: SearchInputs, context: SearchContext, typing: boolean): SearchRequest {
    const ignore = [...inputs.removedChipKeys];
    if (this.mode === 'add_tracks') {
      ignore.push('playlists');
    }

    return {
      q: inputs.query.trim(),
      scope: inputs.scope,
      mode: this.mode,
      typing,
      requestId: `${this.sessionId}-${this.requestCount}`,
      artistId: inputs.artistFilter?.artistId,
      boostArtistIds: context.boostArtistIds,
      ignore,
    };
  }

  private update(change: Partial<SearchSessionState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
