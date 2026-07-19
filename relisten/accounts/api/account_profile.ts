import { AccountProfileResponse } from './account_contract';
import { isUuidV7 } from '@/relisten/util/uuid_v7';

export interface AccountProfileSnapshot {
  userUuid: string;
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

function requiredUuid(value: unknown, field: string): string {
  const uuid = requiredString(value, field);

  if (!isUuidV7(uuid)) {
    throw new Error(`Accounts response has an invalid ${field}`);
  }

  return uuid.toLowerCase();
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
    userUuid: requiredUuid(response.user_uuid, 'user_uuid'),
    username,
    usernameVersion: requiredInteger(response.username_version, 'username_version'),
    usernameReviewNeeded: response.username_review_needed,
    usernameReviewedAt: nullableDate(response.username_reviewed_at, 'username_reviewed_at'),
    usernameChangeAvailableAt: nullableDate(
      response.username_change_available_at,
      'username_change_available_at'
    ),
    nativeSessionId: requiredUuid(response.native_session_uuid, 'native_session_uuid'),
    lastSyncedAt: new Date(),
  };
}
