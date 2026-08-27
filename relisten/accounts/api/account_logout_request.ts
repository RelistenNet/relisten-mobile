import { log } from '@/relisten/util/logging';
import { AccountsApiError, AccountsApiTransport } from './accounts_api_client';

const logger = log.extend('account-logout');
const LOGOUT_ATTEMPT_TIMEOUT_MS = 4000;
const LOGOUT_RETRY_DELAYS_MS = [250, 750] as const;

type LogoutAttemptOutcome = 'completed' | 'retryable' | 'terminal';
type LogoutOutcome = 'completed' | 'terminal' | 'exhausted' | 'no_access_token';

export class AccountLogoutRequest {
  constructor(private readonly transport: AccountsApiTransport) {}

  async send(accessToken: string | null): Promise<void> {
    if (!accessToken) {
      this.logOutcome('no_access_token');
      return;
    }

    for (let attempt = 0; attempt <= LOGOUT_RETRY_DELAYS_MS.length; attempt += 1) {
      const outcome = await this.sendAttempt(accessToken);

      if (outcome === 'completed' || outcome === 'terminal') {
        this.logOutcome(outcome);
        return;
      }

      const retryDelay = LOGOUT_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        this.logOutcome('exhausted');
        return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  private async sendAttempt(accessToken: string): Promise<LogoutAttemptOutcome> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<'timedOut'>((resolve) => {
      timeout = setTimeout(() => resolve('timedOut'), LOGOUT_ATTEMPT_TIMEOUT_MS);
    });
    const requestResult = this.transport
      .request<void>('/v1/logout', accessToken, { method: 'POST', signal: controller.signal })
      .then(() => 'completed' as const)
      .catch((error: unknown) =>
        error instanceof AccountsApiError && error.retryable ? 'retryable' : 'terminal'
      );
    const outcome = await Promise.race([requestResult, timeoutResult]);
    clearTimeout(timeout);

    if (outcome === 'timedOut') {
      controller.abort();
      return 'retryable';
    }

    return outcome;
  }

  private logOutcome(outcome: LogoutOutcome) {
    logger.info(`Remote session logout outcome=${outcome}`);
  }
}
