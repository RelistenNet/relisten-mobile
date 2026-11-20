import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { LinkPosition } from '@/relisten/playlists/playlist_drag_slots';

/** How far a card's fill sits in from the screen's edges; row padding must be at least this. */
export const CARD_MARGIN = 6;
/** The space a card leaves above its first row and below its last. */
const CARD_GAP = 4;
const CARD_RADIUS = 12;

/** A card's fill, and a slightly brighter one while a track in its run plays. */
const CARD_BACKGROUND = 'rgba(255,255,255,0.055)';
const CARD_BACKGROUND_PLAYING = 'rgba(255,255,255,0.09)';

/** Whether a row is the last in its card, with the card's edge below it. */
export function closesCard(link: LinkPosition | undefined): boolean {
  return link === 'last' || link === 'only';
}

function opensCard(link: LinkPosition | undefined): boolean {
  return link === 'first' || link === 'only';
}

/**
 * One row of a list that groups linked tracks into cards: the playlist, the
 * queue and the playlist editor. Each row draws its slice of the card, and
 * `link` says which slice, so a run of rows reads as one rounded card.
 *
 * The fill is a layer behind the row, and the gap that keeps a card off its
 * neighbors is padding on its first and last rows. A row that sizes to its
 * content grows by the gap; the editor's rows keep their fixed height (drag
 * targeting depends on it), and the padding just centers their content in the
 * visible card.
 *
 * `paddingLeft` and `paddingRight` are the row's distance from the screen's
 * edges to its content, the same with or without a card, so text and buttons
 * line up down the list whichever rows are linked. They must be at least
 * CARD_MARGIN.
 */
export function LinkCardRow({
  link,
  playing = false,
  paddingLeft,
  paddingRight,
  style,
  children,
}: {
  link: LinkPosition | undefined;
  /** A track in this run is playing, which brightens the card. */
  playing?: boolean;
  paddingLeft: number;
  paddingRight: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        { paddingLeft, paddingRight },
        opensCard(link) && styles.gapAbove,
        closesCard(link) && styles.gapBelow,
        style,
      ]}
    >
      {link && (
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            { backgroundColor: playing ? CARD_BACKGROUND_PLAYING : CARD_BACKGROUND },
            opensCard(link) && styles.opens,
            closesCard(link) && styles.closes,
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gapAbove: { paddingTop: CARD_GAP },
  gapBelow: { paddingBottom: CARD_GAP },
  fill: { position: 'absolute', top: 0, bottom: 0, left: CARD_MARGIN, right: CARD_MARGIN },
  opens: { top: CARD_GAP, borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  closes: {
    bottom: CARD_GAP,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
});
