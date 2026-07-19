import { log } from '@/relisten/util/logging';
import { AccountsApiTransport } from './accounts_api_client';

const logger = log.extend('account-logout');
const LOGOUT_WAIT_MS = 1500;

export class AccountLogoutRequest {
  constructor(private readonly transport: AccountsApiTransport) {}

  async send(accessToken: string | null): Promise<void> {
    if (!accessToken) {
      return;
    }

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<'timedOut'>((resolve) => {
      timeout = setTimeout(() => resolve('timedOut'), LOGOUT_WAIT_MS);
    });
    const requestResult = this.transport
      .request<void>('/v1/logout', accessToken, { method: 'POST', signal: controller.signal })
      .then(() => 'completed' as const)
      .catch(() => 'failed' as const);
    const outcome = await Promise.race([requestResult, timeoutResult]);
    clearTimeout(timeout);

    if (outcome === 'timedOut') {
      controller.abort();
    }

    if (outcome !== 'completed') {
      logger.info('Remote session logout did not complete');
    }
  }
}
