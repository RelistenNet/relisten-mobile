import { PendingAuthTransaction } from './account_auth_types';
import {
  deleteSecureValue,
  readSecureJson,
  SecureValueResult,
  writeSecureJson,
} from './secure_storage';

const AUTH_TRANSACTION_STORAGE_KEY = 'relisten.account.auth-transaction.v1';
const AUTH_TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;

function isPendingAuthTransaction(value: unknown): value is PendingAuthTransaction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PendingAuthTransaction>;
  return (
    candidate.version === 1 &&
    typeof candidate.transactionId === 'string' &&
    (candidate.provider === 'apple' || candidate.provider === 'google') &&
    typeof candidate.issuer === 'string' &&
    typeof candidate.clientId === 'string' &&
    typeof candidate.redirectUri === 'string' &&
    typeof candidate.state === 'string' &&
    typeof candidate.nonce === 'string' &&
    typeof candidate.codeVerifier === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.expiresAt === 'string'
  );
}

export function authTransactionExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + AUTH_TRANSACTION_LIFETIME_MS);
}

export function isExpiredAuthTransaction(transaction: PendingAuthTransaction, now = new Date()) {
  const expiresAt = new Date(transaction.expiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt <= now;
}

export async function readPendingAuthTransaction(): Promise<
  SecureValueResult<PendingAuthTransaction>
> {
  const result = await readSecureJson<unknown>(AUTH_TRANSACTION_STORAGE_KEY);

  if (result.state !== 'available') {
    return result;
  }

  if (!isPendingAuthTransaction(result.value)) {
    await clearPendingAuthTransaction();
    return { state: 'missing' };
  }

  return { state: 'available', value: result.value };
}

export function writePendingAuthTransaction(transaction: PendingAuthTransaction): Promise<void> {
  return writeSecureJson(AUTH_TRANSACTION_STORAGE_KEY, transaction);
}

export function clearPendingAuthTransaction(): Promise<void> {
  return deleteSecureValue(AUTH_TRANSACTION_STORAGE_KEY);
}
