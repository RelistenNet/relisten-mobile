import type { AuthorizedAccountsApiClient } from './accounts_api_client';

/**
 * Apps outside Relisten that the listener let into their account, such as
 * ChatGPT. `expired` means its session lapsed: the app has to sign in and be
 * approved again, and disconnecting removes it from the list.
 */
export interface ConnectedClient {
  id: string;
  name: string;
  state: 'connected' | 'expired';
}

export async function fetchConnectedClients(
  api: AuthorizedAccountsApiClient
): Promise<ConnectedClient[]> {
  return parseConnectedClients(await api.request<unknown>('/v1/connected-clients'));
}

/** Revokes the app's access and its remembered consent. */
export function disconnectClient(api: AuthorizedAccountsApiClient, clientId: string) {
  return api.request<void>(`/v1/connected-clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });
}

/** Keeps only well-formed entries, so an unknown state never reaches the screen. */
export function parseConnectedClients(value: unknown): ConnectedClient[] {
  const clients = (value as { clients?: unknown })?.clients;
  if (!Array.isArray(clients)) {
    throw new Error('The connected apps response is invalid.');
  }
  return clients.filter(
    (client): client is ConnectedClient =>
      typeof client?.id === 'string' &&
      typeof client.name === 'string' &&
      (client.state === 'connected' || client.state === 'expired')
  );
}
