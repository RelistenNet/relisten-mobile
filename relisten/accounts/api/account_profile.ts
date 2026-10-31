import { AccountProfileResponse } from './account_contract';
import { isUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

export interface AccountProfileSnapshot {
  userId: string;
  username: string;
  usernameVersion: number;
  usernameReviewNeeded: boolean;
  usernameReviewedAt: Date | null;
  usernameChangeAvailableAt: Date | null;
  nativeSessionId: string;
  lastSyncedAt: Date;
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Accounts response has an invalid ${field}`);
  }

  return value;
}

function requiredAccountId(value: unknown, prefix: string, field: string): string {
  if (!isUuidV7TypedId(value, prefix)) {
    throw new Error(`Accounts response has an invalid ${field}`);
  }

  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Accounts response has an invalid ${field}`);
  }

  return value;
}

function nullableDate(value: unknown, field: string): Date | null {
  if (value === null) {
    return null;
  }

  const serialized = requiredString(value, field);
  const parsed = new Date(serialized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Accounts response has an invalid ${field}`);
  }

  return parsed;
}

export function parseAccountProfileResponse(value: unknown): AccountProfileSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('Accounts response is not an object');
  }

  const response = value as Partial<AccountProfileResponse>;
  const username = requiredString(response.username, 'username');

  if (response.contract_version !== 1) {
    throw new Error('Accounts response has an unsupported contract_version');
  }

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Accounts response has an invalid username');
  }

  if (typeof response.username_review_needed !== 'boolean') {
    throw new Error('Accounts response has an invalid username_review_needed');
  }

  return {
    userId: requiredAccountId(response.user_id, 'user', 'user_id'),
    username,
    usernameVersion: requiredInteger(response.username_version, 'username_version'),
    usernameReviewNeeded: response.username_review_needed,
    usernameReviewedAt: nullableDate(response.username_reviewed_at, 'username_reviewed_at'),
    usernameChangeAvailableAt: nullableDate(
      response.username_change_available_at,
      'username_change_available_at'
    ),
    nativeSessionId: requiredAccountId(response.native_session_id, 'session', 'native_session_id'),
    lastSyncedAt: new Date(),
  };
}
