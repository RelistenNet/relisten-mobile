import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { Stack } from 'expo-router';

type SourceActionsToolbarProps = {
  canDownload: boolean;
  canPlay: boolean;
  isFavorite: boolean;
  isRemovingDownloads: boolean;
  onAddToPlaylist: () => void;
  onDownload: () => void;
  onFavorite: () => void;
  onPlay: () => void;
  onRemoveDownloads: () => void;
  onSelectTracks: () => void;
  onShare: () => void;
  onSwitchSource: () => void;
};

export function SourceActionsToolbar({
  canDownload,
  canPlay,
  isFavorite,
  isRemovingDownloads,
  onAddToPlaylist,
  onDownload,
  onFavorite,
  onPlay,
  onRemoveDownloads,
  onSelectTracks,
  onShare,
  onSwitchSource,
}: SourceActionsToolbarProps) {
  return (
    <Stack.Toolbar placement="right">
      {/* Adding to a playlist starts by choosing tracks; the menu still adds the whole show. */}
      <Stack.Toolbar.Button
        accessibilityLabel="Select tracks to add to a playlist"
        icon={nativeMenuIcons.addToPlaylist}
        onPress={onSelectTracks}
      />
      <Stack.Toolbar.Menu accessibilityLabel="Show actions" icon={nativeMenuIcons.more}>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            disabled={!canPlay}
            icon={nativeMenuIcons.play}
            onPress={onPlay}
          >
            Play Show
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.addToPlaylist} onPress={onAddToPlaylist}>
            Add Show to Playlist…
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.select} onPress={onSelectTracks}>
            Select Tracks
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.favorite}
            isOn={isFavorite}
            onPress={onFavorite}
          >
            Favorite
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            disabled={!canDownload}
            icon={nativeMenuIcons.download}
            onPress={onDownload}
          >
            Download Entire Show
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            destructive
            disabled={isRemovingDownloads}
            icon={nativeMenuIcons.delete}
            onPress={onRemoveDownloads}
          >
            {isRemovingDownloads ? 'Removing Downloads…' : 'Remove All Downloads…'}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.switchSource} onPress={onSwitchSource}>
            Switch Source
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.share} onPress={onShare}>
            Share Show
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
