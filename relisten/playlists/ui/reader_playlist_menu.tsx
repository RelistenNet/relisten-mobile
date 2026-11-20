import { Stack } from 'expo-router';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import type { usePlaylistReaderActions } from '@/relisten/playlists/ui/playlist_reader_actions';
import { sharePlaylistLink } from '@/relisten/playlists/ui/playlist_share_actions';

/**
 * The ••• menu for someone else's public playlist, followed or not: share its
 * link, copy it, show only downloaded tracks, or report it. Share and Make a
 * Copy are also header buttons; the menu keeps them so they're where people
 * already look.
 */
export function ReaderPlaylistMenu({
  name,
  publicCode,
  reader,
  downloadedOnly,
  onToggleDownloadedOnly,
}: {
  name: string;
  publicCode: string;
  reader: ReturnType<typeof usePlaylistReaderActions>;
  downloadedOnly: boolean;
  onToggleDownloadedOnly: () => void;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu accessibilityLabel="Playlist actions" icon={nativeMenuIcons.more}>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.share}
            onPress={() => sharePlaylistLink(name, publicCode)}
          >
            Share…
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.copy}
            onPress={() => reader.copy(publicCode, name)}
          >
            Make a Copy
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.download}
            isOn={downloadedOnly}
            onPress={onToggleDownloadedOnly}
          >
            Show Downloaded Only
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.report}
            onPress={() => reader.report(publicCode, name)}
          >
            Report…
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
