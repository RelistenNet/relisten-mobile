import { StyleSheet, View } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import type { LinkPosition } from '@/relisten/playlists/playlist_drag_slots';

/**
 * The thin line in the left gutter that joins linked tracks. It is the only
 * mark a link gets in the view, so a playlist built from many shows still reads
 * as one smooth list.
 */
export function LinkRail({ link, active }: { link?: LinkPosition; active: boolean }) {
  if (!link) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={[
        railStyles.rail,
        (link === 'first' || link === 'only') && railStyles.first,
        (link === 'last' || link === 'only') && railStyles.last,
        { backgroundColor: active ? RelistenBlue[400] : RelistenBlue[700] },
      ]}
    />
  );
}

const railStyles = StyleSheet.create({
  rail: { position: 'absolute', left: 6, width: 2, top: 0, bottom: 0 },
  first: { top: 16, borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  last: { bottom: 16, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
});
