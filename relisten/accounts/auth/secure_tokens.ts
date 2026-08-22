import { RefreshTokenEnvelope } from './account_auth_types';
import {
  deleteSecureValue,
  readSecureJson,
  SecureValueResult,
  writeSecureJson,
} from './secure_storage';

const REFRESH_TOKEN_STORAGE_KEY = 'relisten.account.refresh-token.v1';

function isRefreshTokenEnvelope(value: unknown): value is RefreshTokenEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RefreshTokenEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.issuer === 'string' &&
    typeof candidate.clientId === 'string' &&
    typeof candidate.userUuid === 'string' &&
    typeof candidate.nativeSessionId === 'string'
  );
}

export async function readRefreshTokenEnvelope(): Promise<SecureValueResult<RefreshTokenEnvelope>> {
  const result = await readSecureJson<unknown>(REFRESH_TOKEN_STORAGE_KEY);

  if (result.state !== 'available') {
    return result;
  }

  if (!isRefreshTokenEnvelope(result.value)) {
    await clearRefreshTokenEnvelope();
    return { state: 'missing' };
  }

  return { state: 'available', value: result.value };
}

export function writeRefreshTokenEnvelope(envelope: RefreshTokenEnvelope): Promise<void> {
  return writeSecureJson(REFRESH_TOKEN_STORAGE_KEY, envelope);
}

export function clearRefreshTokenEnvelope(): Promise<void> {
  return deleteSecureValue(REFRESH_TOKEN_STORAGE_KEY);
}
