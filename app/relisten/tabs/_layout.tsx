import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';
import { useState } from 'react';
import { useRemainingDownloadsCount } from '@/relisten/realm/root_services';
import { shouldShowOfflineTab } from '@/relisten/util/offline_tab_visibility';
import {
  PlayerBarHost,
  renderPlayerBarNativeTabsAccessory,
} from '@/relisten/player/ui/player_bar_host';
import { usePlayerBarPlacementBackend } from '@/relisten/player/ui/player_bar_layout';
import { View } from 'react-native';

const ACTIVE_TINT = '#009DC1';
const INACTIVE_TINT = 'gray';

export default function TabLayout() {
  const downloadsCount = useRemainingDownloadsCount();
  const settings = useUserSettings();
  const offline = !useShouldMakeNetworkRequests();
  const playerBarPlacementBackend = usePlayerBarPlacementBackend();
  const [showOfflineTabOnCompactMobile] = useState(() =>
    shouldShowOfflineTab(settings.showOfflineTabWithDefault(), offline)
  );

  return (
    <View className="flex-1">
      <NativeTabs
        backgroundColor={RelistenBlue['950']}
        badgeBackgroundColor={ACTIVE_TINT}
        iconColor={{ default: INACTIVE_TINT, selected: ACTIVE_TINT }}
        labelStyle={{
          default: { color: INACTIVE_TINT },
          selected: { color: ACTIVE_TINT },
        }}
        tintColor={ACTIVE_TINT}
      >
        {renderPlayerBarNativeTabsAccessory(playerBarPlacementBackend)}
        <NativeTabs.Trigger name="(artists)">
          <NativeTabs.Trigger.Icon
            src={{
              default: (
                <NativeTabs.Trigger.VectorIcon
                  family={MaterialCommunityIcons}
                  name="account-music-outline"
                />
              ),
              selected: (
                <NativeTabs.Trigger.VectorIcon
                  family={MaterialCommunityIcons}
                  name="account-music"
                />
              ),
            }}
          />
          <NativeTabs.Trigger.Label>Artists</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(myLibrary)">
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="library-music" />}
          />
          <NativeTabs.Trigger.Label>My Library</NativeTabs.Trigger.Label>
          {downloadsCount === 0 ? null : (
            <NativeTabs.Trigger.Badge>{String(downloadsCount)}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(offline)" hidden={!showOfflineTabOnCompactMobile}>
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="check-circle" />}
          />
          <NativeTabs.Trigger.Label>Offline</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(relisten)">
          <NativeTabs.Trigger.Icon
            src={ToolbarRelisten}
            renderingMode="template"
            selectedColor={ACTIVE_TINT}
          />
          <NativeTabs.Trigger.Label>Relisten</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <PlayerBarHost placementBackend={playerBarPlacementBackend} />
    </View>
  );
}
