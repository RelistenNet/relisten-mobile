import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useAccountsApiClient } from '@/relisten/accounts/account_context';
import {
  type ConnectedClient,
  disconnectClient,
  fetchConnectedClients,
} from '@/relisten/accounts/api/connected_clients';
import { SettingsGroup, SettingsRow } from '@/relisten/accounts/ui/settings_list';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';

/**
 * Apps the listener connected to their account, with Disconnect. Loaded each
 * time the account screen is shown; nothing is shown until an app is
 * connected, or while the list can't be loaded.
 */
export function ConnectedAppsGroup() {
  const api = useAccountsApiClient();
  const [clients, setClients] = useState<ConnectedClient[]>([]);

  const load = useCallback(() => {
    fetchConnectedClients(api).then(setClients, () => setClients([]));
  }, [api]);
  useFocusEffect(load);

  if (clients.length === 0) {
    return null;
  }

  const disconnect = (client: ConnectedClient) =>
    Alert.alert(
      `Disconnect ${client.name}?`,
      `${client.name} won’t be able to read or change your Relisten library. You can connect it again from ${client.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () =>
            void disconnectClient(api, client.id)
              .then(() => showPlaylistToast(`Disconnected ${client.name}`))
              .catch(() => showPlaylistToast(`Couldn’t disconnect ${client.name}. Try again.`))
              .finally(load),
        },
      ]
    );

  return (
    <SettingsGroup title="Connected Apps">
      {clients.map((client) => (
        <SettingsRow
          key={client.id}
          label={client.name}
          value={client.state === 'connected' ? 'Connected · Disconnect' : 'Allowed · Disconnect'}
          onPress={() => disconnect(client)}
        />
      ))}
    </SettingsGroup>
  );
}
