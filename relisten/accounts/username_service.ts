import { AccountProfileSnapshot } from './api/account_profile';
import { AccountsApiError, AuthorizedAccountsApiClient } from './api/accounts_api_client';
import { AccountScopeStore, StaleAccountScopeError } from './account_scope_store';
import { UsernameCommandStore } from './username_command_store';
import { preferNewerUsernameProfile } from './username_profile_monotonicity';

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export class UsernameService {
  constructor(
    private readonly scopeStore: AccountScopeStore,
    private readonly commandStore: UsernameCommandStore,
    private readonly accountsApi: AuthorizedAccountsApiClient
  ) {}

  pendingUsername(scopeId: string): string | null {
    return this.commandStore.pending(scopeId)?.username ?? null;
  }

  async update(username: string, profile: AccountProfileSnapshot | null) {
    const normalizedUsername = username.toLowerCase();

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      throw new AccountsApiError(
        'Usernames use 3–30 lowercase letters, numbers, or underscores.',
        400,
        'username_invalid',
        false
      );
    }

    const capture = this.scopeStore.capture();

    if (!capture.isAuthenticated || !profile || profile.userUuid !== capture.userUuid) {
      throw new StaleAccountScopeError();
    }

    let command = this.commandStore.pending(capture.scopeId);

    if (command && command.username !== normalizedUsername) {
      throw new AccountsApiError(
        'Retry the pending username change before choosing another name.',
        409,
        'username_command_pending',
        true
      );
    }

    command ??= this.commandStore.create(capture, normalizedUsername, profile.usernameVersion);

    try {
      const updated = await this.accountsApi.updateUsername({
        contract_version: 1,
        client_command_uuid: command.commandUuid,
        expected_username_version: command.expectedUsernameVersion,
        username: command.username,
      });
      this.assertProfileMatchesCapture(updated, capture);
      const profileToPublish = preferNewerUsernameProfile(updated, this.scopeStore.activeProfile());
      if (profileToPublish === updated) {
        this.scopeStore.updateProfile(capture, updated);
      }
      this.commandStore.clear(command);
      return profileToPublish;
    } catch (error) {
      if (
        error instanceof AccountsApiError &&
        (error.code === 'username_version_stale' || !error.retryable)
      ) {
        this.commandStore.clear(command);
      }

      throw error;
    }
  }

  private assertProfileMatchesCapture(
    profile: AccountProfileSnapshot,
    capture: ReturnType<AccountScopeStore['capture']>
  ) {
    if (
      profile.userUuid !== capture.userUuid ||
      profile.nativeSessionId !== capture.nativeSessionId ||
      !this.scopeStore.isCurrent(capture)
    ) {
      throw new StaleAccountScopeError();
    }
  }
}
