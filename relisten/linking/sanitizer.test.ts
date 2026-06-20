import { describe, expect, it } from 'vitest';
import {
  formatSafeRouteForLogging,
  isSensitiveLinkParamName,
  REDACTED_QUERY_VALUE,
  sanitizeSearchParamsForNavigation,
  sanitizeUrlForLogging,
} from '@/relisten/linking/sanitizer';

describe('deep-link sanitizer', () => {
  it('classifies share, auth, and token-like params as sensitive', () => {
    expect(isSensitiveLinkParamName('t')).toBe(true);
    expect(isSensitiveLinkParamName('auth_code')).toBe(true);
    expect(isSensitiveLinkParamName('code')).toBe(true);
    expect(isSensitiveLinkParamName('state')).toBe(true);
    expect(isSensitiveLinkParamName('access_token')).toBe(true);
    expect(isSensitiveLinkParamName('mobileGrant')).toBe(true);
    expect(isSensitiveLinkParamName('artist')).toBe(false);
  });

  it('removes sensitive params before forwarding fallback navigation', () => {
    expect(
      sanitizeSearchParamsForNavigation({
        t: 'share-secret',
        auth_code: 'auth-secret',
        code: 'oauth-code',
        state: 'oauth-state',
        access_token: 'access-secret',
        artist: 'grateful-dead',
        repeated: ['safe-a', 'safe-b'],
      })
    ).toEqual({
      artist: 'grateful-dead',
      repeated: ['safe-a', 'safe-b'],
    });
  });

  it('redacts sensitive route params for logging without dropping safe context', () => {
    const formatted = formatSafeRouteForLogging('/playlist/example', {
      t: 'share-secret',
      code: 'oauth-code',
      artist: 'grateful-dead',
    });

    expect(formatted).toContain(`t=${encodeURIComponent(REDACTED_QUERY_VALUE)}`);
    expect(formatted).toContain(`code=${encodeURIComponent(REDACTED_QUERY_VALUE)}`);
    expect(formatted).toContain('artist=grateful-dead');
    expect(formatted).not.toContain('share-secret');
    expect(formatted).not.toContain('oauth-code');
  });

  it('redacts cold and warm link URLs before log or crash reporting', () => {
    expect(
      sanitizeUrlForLogging(
        'relisten://auth/callback?auth_code=auth-secret&state=oauth-state&next=tabs'
      )
    ).toBe(
      `relisten://auth/callback?auth_code=${encodeURIComponent(
        REDACTED_QUERY_VALUE
      )}&state=${encodeURIComponent(REDACTED_QUERY_VALUE)}&next=tabs`
    );

    expect(sanitizeUrlForLogging('/playlist/example?t=share-secret&source=web')).toBe(
      `/playlist/example?t=${encodeURIComponent(REDACTED_QUERY_VALUE)}&source=web`
    );
  });

  it('strips fragments from URLs before log or crash reporting', () => {
    expect(
      sanitizeUrlForLogging(
        'relisten://auth/callback?next=tabs#access_token=access-secret&state=oauth-state'
      )
    ).toBe('relisten://auth/callback?next=tabs');
  });
});
