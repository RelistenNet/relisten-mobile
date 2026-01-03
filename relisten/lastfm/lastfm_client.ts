import * as Crypto from 'expo-crypto';

const API_URL = 'https://ws.audioscrobbler.com/2.0/';

export class LastFmApiError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}

export interface LastFmSession {
  key: string;
  name: string;
}

export interface LastFmNowPlayingParams {
  artist: string;
  track: string;
  album?: string;
  duration?: number;
}

export interface LastFmScrobbleParams extends LastFmNowPlayingParams {
  timestamp: Date;
}

export class LastFmClient {
  static fromEnv(): LastFmClient | undefined {
    const apiKey = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
    const apiSecret = process.env.EXPO_PUBLIC_LASTFM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return undefined;
    }

    return new LastFmClient(apiKey, apiSecret);
  }

  static hasEnv(): boolean {
    return !!process.env.EXPO_PUBLIC_LASTFM_API_KEY && !!process.env.EXPO_PUBLIC_LASTFM_API_SECRET;
  }

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string
  ) {}

  getAuthUrl(token: string, callbackUrl: string) {
    const encodedCallback = encodeURIComponent(callbackUrl);

    return `https://www.last.fm/api/auth/?api_key=${this.apiKey}&token=${token}&cb=${encodedCallback}`;
  }

  async getToken(): Promise<string> {
    const json = await this.call('auth.getToken', {});

    return json.token as string;
  }

  async getSession(token: string): Promise<LastFmSession> {
    const json = await this.call('auth.getSession', { token });

    return json.session as LastFmSession;
  }

  async updateNowPlaying(sessionKey: string, params: LastFmNowPlayingParams) {
    await this.call('track.updateNowPlaying', {
      ...this.normalizeParams(params),
      sk: sessionKey,
    });
  }

  async scrobble(sessionKey: string, params: LastFmScrobbleParams) {
    const timestamp = Math.floor(params.timestamp.getTime() / 1000);

    await this.call('track.scrobble', {
      ...this.normalizeParams(params),
      timestamp: String(timestamp),
      sk: sessionKey,
    });
  }

  private normalizeParams(params: LastFmNowPlayingParams) {
    const normalized: Record<string, string> = {
      artist: params.artist,
      track: params.track,
    };

    if (params.album) {
      normalized.album = params.album;
    }

    if (params.duration !== undefined) {
      normalized.duration = String(Math.round(params.duration));
    }

    return normalized;
  }

  private async call(method: string, params: Record<string, string>) {
    const signedParams = await this.sign({
      method,
      api_key: this.apiKey,
      ...params,
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...signedParams,
        format: 'json',
      }).toString(),
    });

    const json = (await response.json()) as Record<string, unknown>;

    if (json.error) {
      throw new LastFmApiError(Number(json.error), String(json.message ?? 'Last.fm error'));
    }

    return json;
  }

  private async sign(params: Record<string, string>) {
    const entries = Object.entries(params)
      .filter(([key]) => key !== 'format' && key !== 'callback')
      .sort(([a], [b]) => a.localeCompare(b));

    const baseString = entries.map(([key, value]) => `${key}${value}`).join('') + this.apiSecret;
    const apiSig = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, baseString);

    return {
      ...params,
      api_sig: apiSig,
    };
  }
}
