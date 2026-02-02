import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import { isRelistenTabKey, RelistenTabKey, tabKeyToRoute } from '@/relisten/util/tabs';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { ShowOfflineTabSetting } from '@/relisten/realm/models/user_settings';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import RelistenWhite from '@/assets/relisten_white.png';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';

type TabItem = {
  key: RelistenTabKey;
  label: string;
  icon: (active: boolean) => ReactNode;
};

const TAB_ITEMS: TabItem[] = [
  {
    key: '(artists)',
    label: 'Artists',
    icon: (active) => (
      <MaterialCommunityIcons
        name={active ? 'account-music' : 'account-music-outline'}
        size={22}
        color={active ? 'white' : 'rgba(255,255,255,0.7)'}
      />
    ),
  },
  {
    key: '(myLibrary)',
    label: 'My Library',
    icon: (active) => (
      <MaterialIcons
        name="library-music"
        size={22}
        color={active ? 'white' : 'rgba(255,255,255,0.7)'}
      />
    ),
  },
  {
    key: '(offline)',
    label: 'Offline',
    icon: (active) => (
      <MaterialIcons
        name="check-circle"
        size={22}
        color={active ? 'white' : 'rgba(255,255,255,0.7)'}
      />
    ),
  },
  {
    key: '(relisten)',
    label: 'Relisten',
    icon: (active) => (
      <Image
        source={ToolbarRelisten}
        style={{
          tintColor: active ? 'white' : 'rgba(255,255,255,0.7)',
          width: 22,
          height: 22,
        }}
      />
    ),
  },
];

type DesktopTabListProps = {
  onSelectTab?: (key: RelistenTabKey) => void;
  activeKey?: RelistenTabKey;
};

export default function DesktopTabList({ onSelectTab, activeKey }: DesktopTabListProps) {
  const router = useRouter();
  const segments = useSegments();
  const downloads = useRemainingDownloads();
  const settings = useUserSettings();
  const offline = !useShouldMakeNetworkRequests();

  const segment = segments.at(2);
  const activeGroup = activeKey ?? (isRelistenTabKey(segment) ? segment : '(artists)');

  const showOffline =
    settings?.showOfflineTabWithDefault() === ShowOfflineTabSetting.Always ||
    (settings?.showOfflineTabWithDefault() === ShowOfflineTabSetting.WhenOffline && offline);
  const visibleTabs = TAB_ITEMS.filter((item) => (item.key === '(offline)' ? showOffline : true));

  return (
    <View className="flex-1">
      <View className="px-4 pb-4 pt-6">
        <Image source={RelistenWhite} style={{ width: '100%', height: 28 }} resizeMode="contain" />
      </View>
      <View className="gap-2 px-3">
        {visibleTabs.map((item) => {
          const isActive = activeGroup === item.key;
          const showBadge = item.key === '(myLibrary)' && downloads.length > 0;

          return (
            <Pressable
              key={item.key}
              onPress={() => {
                if (onSelectTab) {
                  onSelectTab(item.key);
                  return;
                }

                router.replace(tabKeyToRoute(item.key));
              }}
              className={tw(
                'min-h-[44px] flex-row items-center gap-3 rounded-md px-4 py-2.5',
                isActive ? 'bg-relisten-blue-700' : 'bg-transparent'
              )}
            >
              {item.icon(isActive)}
              <RelistenText
                className={tw('text-lg font-semibold leading-tight', !isActive && 'text-gray-300')}
              >
                {item.label}
              </RelistenText>
              {showBadge ? (
                <View className="ml-auto rounded-full bg-relisten-blue-500 px-2 py-0.5">
                  <RelistenText className="text-xs font-bold">{downloads.length}</RelistenText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
