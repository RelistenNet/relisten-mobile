import type { AccountProfileSnapshot } from './api/account_profile';

/**
 * A retried username command can return its original receipt after a later
 * profile refresh has observed a newer rename. Keep that newer local snapshot
 * instead of moving the account cache backward.
 */
export function preferNewerUsernameProfile(
  commandResult: AccountProfileSnapshot,
  cachedProfile: AccountProfileSnapshot | null
) {
  if (
    cachedProfile &&
    cachedProfile.userUuid === commandResult.userUuid &&
    cachedProfile.nativeSessionId === commandResult.nativeSessionId &&
    cachedProfile.usernameVersion > commandResult.usernameVersion
  ) {
    return cachedProfile;
  }

  return commandResult;
}
