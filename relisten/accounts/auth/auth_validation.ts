import type { PendingAuthTransaction } from './account_auth_types';

export class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cancelled = false,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  nonce?: unknown;
  sid?: unknown;
}

export function normalizedIssuer(value: string) {
  return value.replace(/\/$/, '');
}

function decodeIdTokenClaims(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');

  if (parts.length !== 3) {
    throw new AuthFlowError('The identity token is malformed.', 'invalid_id_token');
  }

  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as IdTokenClaims;
  } catch {
    throw new AuthFlowError('The identity token could not be decoded.', 'invalid_id_token');
  }
}

function tokenAudienceIncludes(audience: unknown, clientId: string): boolean {
  return audience === clientId || (Array.isArray(audience) && audience.includes(clientId));
}

export function validateInitialIdToken(
  idToken: string | undefined,
  transaction: PendingAuthTransaction
): { subject: string; nativeSessionId: string | null } {
  if (!idToken) {
    throw new AuthFlowError(
      'The authorization server did not return an identity token.',
      'missing_id_token'
    );
  }

  const claims = decodeIdTokenClaims(idToken);

  if (normalizedIssuer(String(claims.iss ?? '')) !== normalizedIssuer(transaction.issuer)) {
    throw new AuthFlowError('The identity token issuer is invalid.', 'invalid_id_token');
  }

  if (!tokenAudienceIncludes(claims.aud, transaction.clientId)) {
    throw new AuthFlowError('The identity token audience is invalid.', 'invalid_id_token');
  }

  if (claims.nonce !== transaction.nonce) {
    throw new AuthFlowError('The identity token nonce is invalid.', 'invalid_id_token');
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new AuthFlowError('The identity token has expired.', 'invalid_id_token');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new AuthFlowError('The identity token subject is invalid.', 'invalid_id_token');
  }

  return {
    subject: claims.sub,
    nativeSessionId: typeof claims.sid === 'string' ? claims.sid : null,
  };
}
