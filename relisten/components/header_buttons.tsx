import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

type NativeMenuIcon = (typeof nativeMenuIcons)[keyof typeof nativeMenuIcons];

/**
 * Props for a header button that reads as text, such as Edit or Cancel.
 * expo-router draws only icon buttons in the Android header and drops text
 * ones, so Android shows `androidIcon` with the text as its accessibility
 * label. This is props rather than a component because iOS takes only direct
 * Stack.Toolbar.Button children of Stack.Toolbar.
 */
export function textToolbarButtonProps(title: string, androidIcon: NativeMenuIcon) {
  return Platform.OS === 'android'
    ? { accessibilityLabel: title, icon: androidIcon }
    : { children: title };
}

/**
 * While the screen is focused, Android's Back runs `onBack` instead of
 * leaving the screen. Modes like selecting or editing use it so Back ends the
 * mode first, the way their header button does.
 */
export function useAndroidBackHandler(onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return;
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current();
        return true;
      });
      return () => subscription.remove();
    }, [])
  );
}

/** Renders nothing; while mounted, Android's Back runs `onBack`. For modes shown conditionally. */
export function AndroidBackHandler({ onBack }: { onBack: () => void }) {
  useAndroidBackHandler(onBack);
  return null;
}

/**
 * The header while choosing tracks to add to a playlist: Cancel on the left,
 * Add N to Playlist on the right. Android shows ✕ and the add-to-playlist icon
 * with the count as its badge, and Back cancels.
 */
export function TrackSelectionToolbar({
  count,
  onCancel,
  onAdd,
}: {
  count: number;
  onCancel: () => void;
  onAdd: () => void;
}) {
  useAndroidBackHandler(onCancel);

  // On Android the count is a badge on the icon, which screen readers also
  // announce, so the label leaves it out.
  const showsBadge = Platform.OS === 'android' && count > 0;
  const addButton = textToolbarButtonProps(
    count === 0 || showsBadge ? 'Add to Playlist' : `Add ${count} to Playlist`,
    nativeMenuIcons.addToPlaylist
  );

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          {...textToolbarButtonProps('Cancel', nativeMenuIcons.close)}
          onPress={onCancel}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button {...addButton} disabled={count === 0} onPress={onAdd}>
          {showsBadge ? (
            <Stack.Toolbar.Badge style={{ backgroundColor: RelistenBlue[400], color: 'white' }}>
              {String(count)}
            </Stack.Toolbar.Badge>
          ) : (
            addButton.children
          )}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}
