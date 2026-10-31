import { AccountsApiError } from './api/accounts_api_client';
import { AuthFlowError } from './auth/auth_client';

export interface AccountError {
  code: string;
  message: string;
  retryable: boolean;
}

export function toAccountError(error: unknown, fallbackCode: string): AccountError {
  if (error instanceof AccountsApiError) {
    return {
      code: error.code ?? fallbackCode,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (fallbackCode === 'session_restore_failed' && isTerminalRefreshFailure(error)) {
    return {
      code: 'session_expired',
      message: 'Your Relisten session expired. Sign in again.',
      retryable: false,
    };
  }

  if (error instanceof AuthFlowError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }

  return {
    code: fallbackCode,
    message: 'Relisten could not finish the account request.',
    retryable: true,
  };
}

function oauthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as { code?: unknown; params?: { error?: unknown } };

  if (typeof candidate.params?.error === 'string') {
    return candidate.params.error;
  }

  return typeof candidate.code === 'string' ? candidate.code : null;
}

export function isTerminalRefreshFailure(error: unknown) {
  if (error instanceof AccountsApiError && error.status === 401) {
    return true;
  }

  const code = oauthErrorCode(error);
  return (
    code === 'invalid_grant' ||
    code === 'session_mismatch' ||
    code === 'missing_refresh_token' ||
    code === 'invalid_token_response'
  );
}
