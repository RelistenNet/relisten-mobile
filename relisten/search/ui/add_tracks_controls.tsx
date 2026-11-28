import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, useNavigation, type Href } from 'expo-router';
import { ActivityIndicator, Keyboard, TouchableOpacity, View } from 'react-native';
import {
  ROW_ACCESSORY_ICON_COLOR,
  ROW_ACCESSORY_ICON_SIZE,
} from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useAddTracks, usePendingAddTrackId } from './add_tracks_context';

/**
 * Closes the whole sheet from any of its screens. `router.dismiss()` would
 * only pop the sheet's own stack, so this goes back in the parent stack.
 */
export function useCloseAddTracks() {
  const navigation = useNavigation();
  return () => navigation.getParent()?.goBack();
}

/**
 * Open full page: closes the sheet, then pushes the full screen, which the
 * caller builds in the playlist's tab. Full screens have no **+**, so the
 * listener reopens Add Tracks to keep adding.
 */
export function useOpenFullPage() {
  const closeSheet = useCloseAddTracks();
  return (href: Href) => {
    closeSheet();
    router.push(href);
  };
}

/** The header action that opens a sheet screen's full page. */
export function OpenFullPageButton({ href }: { href: Href }) {
  const openFullPage = useOpenFullPage();
  return (
    <TouchableOpacity
      accessibilityLabel="Open full page"
      accessibilityRole="button"
      className="p-2"
      onPress={() => openFullPage(href)}
    >
      <MaterialIcons name="open-in-new" size={22} color="white" />
    </TouchableOpacity>
  );
}

/**
 * Goes first in every sheet screen, ahead of its scroll view. An iOS form
 * sheet treats a scroll view that is its screen's first child as the sheet's
 * own scroll view, and then draws it wrong: blank, or over the views above
 * it. Any view ahead of it avoids that, so this one has no size, and
 * `collapsable={false}` keeps it from being flattened away.
 */
export function SheetScrollAnchor() {
  return <View collapsable={false} style={{ height: 0 }} />;
}

/**
 * The **+** on a file. It shows progress while the catalog is checked and a
 * check once added. While any add or duplicate prompt is pending, the other
 * buttons are disabled, so only one add runs at a time.
 */
export function AddTrackButton({
  trackId,
  title,
  onAdd,
}: {
  trackId: string;
  title: string;
  onAdd: () => void;
}) {
  const { addedTrackIds } = useAddTracks();
  const pendingTrackId = usePendingAddTrackId();
  const isPending = pendingTrackId === trackId;
  const isAdded = addedTrackIds.has(trackId);
  const disabled = pendingTrackId !== null && !isPending;

  return (
    <TouchableOpacity
      accessibilityLabel={isAdded ? `${title}, added. Add again` : `Add ${title}`}
      accessibilityRole="button"
      accessibilityState={{ busy: isPending, disabled }}
      className="h-11 w-11 items-center justify-center"
      disabled={disabled || isPending}
      onPress={() => {
        // The confirmation and its Undo draw at the bottom of the sheet.
        Keyboard.dismiss();
        onAdd();
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {/* Sized and colored like the rows' ⋯ menu, so it doesn't outshine the title. */}
      {isPending ? (
        <ActivityIndicator size="small" color={ROW_ACCESSORY_ICON_COLOR} />
      ) : (
        <Ionicons
          name={isAdded ? 'checkmark-circle-outline' : 'add-circle-outline'}
          size={ROW_ACCESSORY_ICON_SIZE}
          color={ROW_ACCESSORY_ICON_COLOR}
        />
      )}
    </TouchableOpacity>
  );
}

/** The sheet's own toast: added with Undo, or why an add didn't happen. */
export function AddTracksNoticeBar() {
  const { notice, dismissNotice } = useAddTracks();
  if (!notice) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute bottom-8 left-4 right-4 flex-row items-center rounded-xl px-4 py-3"
      style={{
        backgroundColor: notice.tone === 'warning' ? '#5a4a1a' : RelistenBlue[700],
      }}
    >
      <RelistenText className="flex-1" numberOfLines={3}>
        {notice.text}
      </RelistenText>
      {notice.action && (
        <TouchableOpacity
          accessibilityRole="button"
          className="ml-3 px-2 py-1"
          onPress={notice.action.onPress}
        >
          <RelistenText className="font-bold text-relisten-blue-300">
            {notice.action.label}
          </RelistenText>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        className="ml-1 p-1"
        onPress={dismissNotice}
      >
        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </View>
  );
}
