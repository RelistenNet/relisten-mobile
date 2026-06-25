import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { Stack } from 'expo-router';

type SourceActionsToolbarProps = {
  isFavorite: boolean;
  isRemovingDownloads: boolean;
  onDownload: () => void;
  onFavorite: () => void;
  onPlay: () => void;
  onRemoveDownloads: () => void;
  onShare: () => void;
  onSwitchSource: () => void;
};

export function SourceActionsToolbar({
  isFavorite,
  isRemovingDownloads,
  onDownload,
  onFavorite,
  onPlay,
  onRemoveDownloads,
  onShare,
  onSwitchSource,
}: SourceActionsToolbarProps) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu accessibilityLabel="Show actions" icon={nativeMenuIcons.more}>
        <Stack.Toolbar.MenuAction icon={nativeMenuIcons.play} onPress={onPlay}>
          Play Show
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon={nativeMenuIcons.favorite}
          isOn={isFavorite}
          onPress={onFavorite}
        >
          Favorite
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon={nativeMenuIcons.download} onPress={onDownload}>
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
        <Stack.Toolbar.MenuAction icon={nativeMenuIcons.switchSource} onPress={onSwitchSource}>
          Switch Source
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon={nativeMenuIcons.share} onPress={onShare}>
          Share Show
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
