import type { ReactNode } from 'react';
import { View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { tw } from '@/relisten/util/tw';
import { markedRuns, searchRowAccessibilityLabel, type SearchRowView } from '../search_rows';

/**
 * A search result. Every kind stacks the same lines (see `SearchRowView`),
 * built from the app's own row pieces, so the artist, the place and the stats
 * are always where the eye expects them. The accessory at the end (Add Tracks' **+**) sits outside the row's
 * button, so tapping it never opens the row.
 */
export function SearchResultRow({
  view,
  onPress,
  onLongPress,
  trailing,
}: {
  view: SearchRowView;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
}) {
  const [titleAside, bylineAside, placeAside] = view.aside;

  return (
    <View className="flex-row items-center">
      <SectionedListItem
        accessibilityLabel={searchRowAccessibilityLabel(view)}
        accessibilityRole="button"
        cn="w-auto min-w-0 flex-1"
        disabled={!onPress}
        onLongPress={onLongPress}
        onPress={onPress}
      >
        <SearchRowLine aside={titleAside}>
          <View className="min-w-0 flex-1 flex-row flex-wrap items-center" style={{ columnGap: 8 }}>
            <SearchRowTitle view={view} />
            {view.badges.map((badge) => (
              <RelistenText key={badge} className="text-xs font-bold text-relisten-blue-600">
                {badge}
              </RelistenText>
            ))}
          </View>
        </SearchRowLine>

        <SearchRowLine aside={bylineAside}>
          <SubtitleText className="min-w-0 flex-1" numberOfLines={1}>
            {view.byline}
          </SubtitleText>
        </SearchRowLine>

        {view.place || placeAside ? (
          <SearchRowLine aside={placeAside}>
            <SubtitleText className="min-w-0 flex-1" numberOfLines={2}>
              {view.place}
            </SubtitleText>
          </SearchRowLine>
        ) : null}

        {view.note ? (
          <SubtitleText className={tw('pt-0.5', { italic: view.noteItalic })} numberOfLines={2}>
            {markedRuns(view.note).map((run, index) =>
              run.marked ? (
                <RelistenText key={index} className="text-s font-semibold text-gray-200">
                  {run.text}
                </RelistenText>
              ) : (
                run.text
              )
            )}
          </SubtitleText>
        ) : null}
      </SectionedListItem>
      {trailing && <View className="pr-2">{trailing}</View>}
    </View>
  );
}

/** One line of a row: its text, and a gray value at the end that lines up from row to row. */
function SearchRowLine({ aside, children }: { aside?: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center pt-0.5" style={{ gap: 8 }}>
      {children}
      {aside ? <SubtitleText numberOfLines={1}>{aside}</SubtitleText> : null}
    </View>
  );
}

/**
 * The title in the style of the app row for that kind of thing: a bold date
 * as in the show list, a song in regular weight as in a playlist, or a bold
 * name as in the artist, song and venue lists.
 */
function SearchRowTitle({ view }: { view: SearchRowView }) {
  if (view.titleStyle === 'track') {
    return (
      <RelistenText className="shrink text-lg" numberOfLines={2}>
        {view.title}
      </RelistenText>
    );
  }

  return <RowTitle numberOfLines={2}>{view.title}</RowTitle>;
}
