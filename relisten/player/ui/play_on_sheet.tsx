import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { CastButton } from 'react-native-google-cast';
import AirPlayButton from 'react-native-airplay-button';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useRelistenCastStatus, useShouldRenderCastButton } from '@/relisten/casting/cast_ui';
import { usePlayerOutputRoute } from '@/relisten/player/ui/player_output_route';
import { groupSonosHouseholds, type SonosGroup } from '@/relisten/sonos/sonos_api';
import { useSonosRemote } from '@/relisten/sonos/sonos_remote';
import { sonosSession } from '@/relisten/sonos/sonos_session';
import { type SonosHandoffState, useSonosOutput } from '@/relisten/sonos/use_sonos_output';

const ICON_COLOR = 'rgba(255, 255, 255, 0.78)';

/**
 * Where music plays: this phone, a Sonos room, or the system's AirPlay and
 * Chromecast pickers. Sonos rooms are listed here; iOS doesn't let apps list
 * AirPlay devices, and Chromecast keeps its own dialog for now, so those rows
 * open the native pickers.
 */
export default function PlayOnSheet() {
  // An iOS form sheet lays content out under its native header.
  const headerHeight = useHeaderHeight();

  return (
    <>
      <Stack.Screen options={{ title: 'Play On' }} />
      {/* Directly in the sheet, like Add to Playlist: a flex-1 wrapper collapses in a form sheet. */}
      <ScrollView
        style={{ flex: 1, backgroundColor: RelistenBlue[900] }}
        contentContainerStyle={{ paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }}
      >
        <ThisPhoneRow />
        <SonosSection />
        <OtherDevicesSection />
      </ScrollView>
    </>
  );
}

/**
 * This phone, checked while it is where music plays. While a Sonos room
 * plays, tapping it moves playback back here at the same track and position.
 */
function ThisPhoneRow() {
  const router = useRouter();
  const outputRoute = usePlayerOutputRoute();
  const sonosPlaying = useSonosRemote().kind === 'active';
  const here = !outputRoute;
  return (
    <OutputRow
      icon={<MaterialIcons name="smartphone" size={22} color={ICON_COLOR} />}
      title={Platform.OS === 'ios' ? 'This iPhone' : 'This Phone'}
      subtitle={
        sonosPlaying
          ? `Tap to move playback from ${outputRoute}`
          : outputRoute
            ? `Music is playing on ${outputRoute}`
            : undefined
      }
      trailing={
        here ? <MaterialIcons name="check" size={20} color={RelistenBlue[300]} /> : undefined
      }
      onPress={
        sonosPlaying
          ? () => {
              void sonosSession.transferToPhone();
              router.back();
            }
          : undefined
      }
    />
  );
}

function SonosSection() {
  const router = useRouter();
  const { connection, handoff, hasQueue, refresh, connect, playOn } = useSonosOutput();

  if (connection.kind === 'unavailable') {
    return null;
  }

  const speaker = <MaterialCommunityIcons name="speaker" size={22} color={ICON_COLOR} />;
  let rows: ReactNode;
  switch (connection.kind) {
    case 'loading':
      rows = <OutputRow icon={speaker} title="Looking for Sonos…" trailing={<Spinner />} />;
      break;
    case 'signedOut':
      rows = (
        <OutputRow
          icon={speaker}
          title="Sign In to Use Sonos"
          subtitle="Sonos connects to your Relisten account."
          onPress={() => router.push('/relisten/sign-in')}
        />
      );
      break;
    case 'notLinked':
      rows = (
        <OutputRow
          icon={speaker}
          title="Connect Sonos"
          subtitle="Sign in to Sonos, then come back to Relisten."
          onPress={() => void connect()}
        />
      );
      break;
    case 'error':
      rows = (
        <OutputRow
          icon={speaker}
          title={connection.message}
          subtitle="Tap to try again."
          onPress={() => void refresh()}
        />
      );
      break;
    case 'linked':
      rows =
        connection.groups === undefined ? (
          <OutputRow icon={speaker} title="Looking for rooms…" trailing={<Spinner />} />
        ) : connection.groups.length === 0 ? (
          <OutputRow icon={speaker} title="No Sonos rooms found" />
        ) : (
          <SonosHouseholds
            groups={connection.groups}
            handoff={handoff}
            hasQueue={hasQueue}
            playOn={playOn}
          />
        );
      break;
  }

  return (
    <View>
      <SectionHeader title="Sonos" />
      {rows}
    </View>
  );
}

function SonosHouseholds({
  groups,
  handoff,
  hasQueue,
  playOn,
}: {
  groups: SonosGroup[];
  handoff: SonosHandoffState | undefined;
  hasQueue: boolean;
  playOn: (group: SonosGroup) => Promise<void>;
}) {
  return groupSonosHouseholds(groups).map((rooms, index) => (
    <View key={rooms[0].householdId}>
      {/* Sonos doesn't name households, so a band sets each home's rooms apart. */}
      {index > 0 && <View className="h-3 bg-relisten-blue-800" />}
      {rooms.map((group, roomIndex) => (
        <View key={group.id}>
          {roomIndex > 0 && <ItemSeparator />}
          <SonosRoomRow
            group={group}
            handoff={handoff?.groupId === group.id ? handoff : undefined}
            busy={handoff?.phase === 'connecting'}
            hasQueue={hasQueue}
            onPress={() => void playOn(group)}
          />
        </View>
      ))}
    </View>
  ));
}

/**
 * A room. Tapping it moves the queue there; the row then shows the handoff
 * until it settles.
 */
function SonosRoomRow({
  group,
  handoff,
  busy,
  hasQueue,
  onPress,
}: {
  group: SonosGroup;
  handoff: SonosHandoffState | undefined;
  busy: boolean;
  hasQueue: boolean;
  onPress: () => void;
}) {
  const status = roomStatus(handoff, hasQueue);
  return (
    <OutputRow
      icon={<MaterialCommunityIcons name="speaker" size={22} color={ICON_COLOR} />}
      title={group.name}
      subtitle={status.text}
      subtitleTone={status.tone}
      trailing={status.trailing}
      onPress={hasQueue && !busy ? onPress : undefined}
    />
  );
}

function roomStatus(
  handoff: SonosHandoffState | undefined,
  hasQueue: boolean
): { text?: string; tone?: 'error'; trailing?: ReactNode } {
  if (handoff?.phase === 'connecting') {
    return { text: 'Connecting…', trailing: <Spinner /> };
  }
  if (handoff?.phase === 'done') {
    switch (handoff.outcome.kind) {
      case 'playing':
        return {
          text: 'Playing on Sonos',
          trailing: <MaterialIcons name="check" size={20} color={RelistenBlue[300]} />,
        };
      case 'refused':
        return { text: handoff.outcome.message, tone: 'error' };
      case 'uncertain':
        return { text: 'Sonos didn’t confirm. Check the room before trying again.', tone: 'error' };
    }
  }
  return hasQueue ? {} : { text: 'Play something first, then choose a room.' };
}

function OtherDevicesSection() {
  const shouldRenderCastButton = useShouldRenderCastButton();
  const { isCasting, deviceName } = useRelistenCastStatus();

  if (Platform.OS !== 'ios' && !shouldRenderCastButton) {
    return null;
  }

  return (
    <View>
      <SectionHeader title="Other Devices" />
      {Platform.OS === 'ios' && (
        <NativePickerRow
          icon={<MaterialIcons name="airplay" size={22} color={ICON_COLOR} />}
          title="AirPlay & Bluetooth…"
          picker={
            <AirPlayButton
              prioritizesVideoDevices={false}
              tintColor="transparent"
              activeTintColor="transparent"
              className="absolute inset-0"
            />
          }
        />
      )}
      {Platform.OS === 'ios' && shouldRenderCastButton && <ItemSeparator />}
      {shouldRenderCastButton && (
        <NativePickerRow
          icon={
            <MaterialIcons
              name={isCasting ? 'cast-connected' : 'cast'}
              size={22}
              color={ICON_COLOR}
            />
          }
          title="Chromecast…"
          subtitle={isCasting ? `Casting to ${deviceName ?? 'a Cast device'}` : undefined}
          // Kept just above UIKit's hit-test alpha threshold so the native button receives taps.
          picker={<CastButton style={[StyleSheet.absoluteFill, { opacity: 0.02 }]} />}
        />
      )}
    </View>
  );
}

/** A row whose whole area is a native picker button laid over it. */
function NativePickerRow({
  picker,
  ...row
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  picker: ReactNode;
}) {
  return (
    <View>
      <OutputRow {...row} />
      {picker}
    </View>
  );
}

function OutputRow({
  icon,
  title,
  subtitle,
  subtitleTone,
  trailing,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  subtitleTone?: 'error';
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View className="min-h-[56px] flex-row items-center px-4 py-2">
      <View className="w-9">{icon}</View>
      <View className="min-w-0 flex-1">
        <RelistenText className="text-base" selectable={false}>
          {title}
        </RelistenText>
        {subtitle && (
          <RelistenText
            className={
              subtitleTone === 'error' ? 'text-sm text-[#e5c07b]' : 'text-sm text-gray-400'
            }
            selectable={false}
          >
            {subtitle}
          </RelistenText>
        )}
      </View>
      {trailing}
    </View>
  );

  return onPress ? (
    <TouchableOpacity accessibilityRole="button" onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

function Spinner() {
  return <ActivityIndicator size="small" color="white" />;
}
