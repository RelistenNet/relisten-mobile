import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useAccountsApiClient } from '@/relisten/accounts/account_context';
import {
  type ConnectedClient,
  disconnectClient,
  fetchConnectedClients,
} from '@/relisten/accounts/api/connected_clients';
import { SettingsGroup } from '@/relisten/accounts/ui/settings_list';
import { ListRow } from '@/relisten/components/list_row';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { showToast } from '@/relisten/components/toast';

/**
 * Apps the listener connected to their account, with Disconnect. Loaded each
 * time the account screen is shown. Nothing is shown while loading or when no
 * app is connected; a failed load says so and offers a retry.
 */
export function ConnectedAppsGroup() {
  const api = useAccountsApiClient();
  const [clients, setClients] = useState<ConnectedClient[] | 'failed'>([]);

  const load = useCallback(() => {
    fetchConnectedClients(api).then(setClients, () => setClients('failed'));
  }, [api]);
  useFocusEffect(load);

  if (clients === 'failed') {
    return (
      <SettingsGroup title="Connected Apps">
        <View className="px-4 py-3" accessibilityLiveRegion="polite">
          <RelistenText className="text-sm text-gray-400">
            Couldn’t load your connected apps.
          </RelistenText>
          <RelistenButton className="mt-3" intent="outline" onPress={load}>
            Try Again
          </RelistenButton>
        </View>
      </SettingsGroup>
    );
  }

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
              .then(() => showToast(`Disconnected ${client.name}`))
              .catch(() =>
                showToast(`Couldn’t disconnect ${client.name}. Try again.`, { tone: 'error' })
              )
              .finally(load),
        },
      ]
    );

  return (
    <SettingsGroup title="Connected Apps">
      {clients.map((client) => (
        <ListRow
          key={client.id}
          title={client.name}
          subtitle={client.state === 'connected' ? 'Connected' : 'Signed out'}
          disclosure={false}
          accessory={<RelistenText className="ml-2 text-red-400">Disconnect</RelistenText>}
          accessibilityHint={`Disconnects ${client.name} from your account.`}
          onPress={() => disconnect(client)}
        />
      ))}
    </SettingsGroup>
  );
}
