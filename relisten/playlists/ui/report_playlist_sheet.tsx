import { useHeaderHeight } from 'expo-router/react-navigation';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenText } from '@/relisten/components/relisten_text';
import { REPORT_REASON_LENGTH } from '@/relisten/playlists/sharing/sharing_wire';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { sharingFailureAlert } from '@/relisten/playlists/ui/sharing_messages';
import { usePlaylistSharingService } from '@/relisten/realm/root_services';

/**
 * Reports a public playlist to the Relisten team. The reason is required;
 * a moderator reads it, and may take the playlist down.
 */
export default function ReportPlaylistSheet() {
  const { publicCode, name } = useLocalSearchParams<{ publicCode: string; name: string }>();
  const router = useRouter();
  const sharing = usePlaylistSharingService();
  // An iOS form sheet lays its content out under the native header.
  const sheetHeaderHeight = useHeaderHeight();
  const topInset = Platform.OS === 'ios' ? sheetHeaderHeight : 0;
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const trimmed = reason.trim();

  const send = async () => {
    if (!trimmed || sending) {
      return;
    }
    setSending(true);
    try {
      await sharing.report(publicCode, trimmed);
      router.back();
      showPlaylistToast('Thanks. We’ll take a look.');
    } catch (error) {
      setSending(false);
      // An alert, since the sheet covers the toast. The reason stays for another try.
      Alert.alert(...(sharingFailureAlert(error) ?? ['Couldn’t send the report. Try again.']));
    }
  };

  return (
    <View className="flex-1 bg-relisten-blue-900 px-4" style={{ paddingTop: topInset }}>
      <Stack.Screen options={{ title: 'Report Playlist' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Cancel"
          icon={nativeMenuIcons.close}
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Send"
          icon={nativeMenuIcons.done}
          variant="done"
          disabled={!trimmed || sending}
          onPress={() => void send()}
        />
      </Stack.Toolbar>

      <RelistenText className="pb-3 pt-4 text-gray-300">
        What’s wrong with {name ? `“${name}”` : 'this playlist'}? The Relisten team reads every
        report.
      </RelistenText>
      <TextInput
        accessibilityLabel="Reason"
        autoFocus
        multiline
        maxLength={REPORT_REASON_LENGTH}
        placeholder="For example, offensive name or description"
        placeholderTextColor="#9ca3af"
        className="min-h-[120px] rounded-lg bg-relisten-blue-800 px-3 py-3 text-white"
        style={{ textAlignVertical: 'top' }}
        value={reason}
        onChangeText={setReason}
      />
      <RelistenText className="pt-2 text-right text-sm text-gray-400" selectable={false}>
        {REPORT_REASON_LENGTH - reason.length}
      </RelistenText>
    </View>
  );
}
