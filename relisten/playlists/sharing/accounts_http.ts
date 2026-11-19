import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';

/** Request helpers shared by playlist sync and playlist sharing. */

export function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/** The problem code the account service gave for a refused request, if any. */
export function problemCode(error: unknown): string | null {
  return error instanceof AccountsApiError ? error.code : null;
}

/**
 * A 4xx the server will answer the same way every time, so resending cannot
 * help. A 401, 408 or 429 may pass on a later attempt and is not one.
 */
export function isPermanentRejection(error: unknown): boolean {
  return (
    error instanceof AccountsApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  );
}
