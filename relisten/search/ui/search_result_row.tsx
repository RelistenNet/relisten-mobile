import type { ReactNode } from 'react';
import { View } from 'react-native';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { ArtistRow } from '@/relisten/components/artist_rows';
import { ListRow } from '@/relisten/components/list_row';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { ShowRow } from '@/relisten/components/shows_list';
import { TrackWithArtistRow } from '@/relisten/components/source/source_track_with_artist';
import { Artist } from '@/relisten/realm/models/artist';
import { useObject } from '@/relisten/realm/schema';
import {
  markedRuns,
  namedRowSubtitle,
  namedRowTitle,
  playlistCardSubtitle,
  recordingNote,
  reviewNote,
  searchPassageFields,
  searchRowPopularity,
  searchShowFields,
  searchShowPopularity,
  searchTrackFields,
  showPlace,
} from '../search_rows';
import type { SearchCatalogRow, SearchPlaylistCard } from '../search_types';

interface RowActions {
  onPress?: () => void;
  onLongPress?: () => void;
  /** Add Tracks' **+**, at the end of rows that name a file. */
  trailing?: ReactNode;
}

/**
 * A catalog result, drawn with the app's own row for that kind of thing (see
 * `search_rows.ts`). Shows, recordings and reviews are show rows; files and
 * passages are track rows; artists are artist rows; songs, tours and venues
 * are plain list rows.
 */
export function SearchCatalogResult({
  row,
  onPress,
  onLongPress,
  trailing,
}: RowActions & { row: SearchCatalogRow }) {
  const pressable = {
    onPress,
    onLongPress,
    disabled: !onPress,
    accessibilityRole: 'button' as const,
  };

  switch (row.kind) {
    case 'artist':
      return <SearchArtistResult row={row} {...pressable} />;
    case 'song':
    case 'tour':
    case 'venue':
      return <ListRow title={namedRowTitle(row)} subtitle={namedRowSubtitle(row)} {...pressable} />;
    case 'show':
    case 'recording':
      return (
        <ShowRow
          fields={searchShowFields(row.show, row.source)}
          popularity={searchShowPopularity(row.show)}
          byline={row.artist.name}
          {...pressable}
        >
          <SearchNote text={recordingNote(row)} />
        </ShowRow>
      );
    case 'review':
      return (
        <ShowRow
          fields={searchShowFields(row.show, row.source)}
          popularity={searchShowPopularity(row.show)}
          byline={row.artist.name}
          {...pressable}
        >
          <SearchNote text={reviewNote(row)} />
        </ShowRow>
      );
    case 'performance':
      return (
        <TrackWithArtistRow
          fields={searchTrackFields(row)}
          subtitleColumn
          indicatorComponent={trailing}
          {...pressable}
        >
          <VenueLine place={showPlace(row.show)} popularity={searchRowPopularity(row)} />
        </TrackWithArtistRow>
      );
    case 'sequence':
      return (
        <TrackWithArtistRow fields={searchPassageFields(row)} subtitleColumn {...pressable}>
          <VenueLine place={showPlace(row.show)} popularity={searchShowPopularity(row.show)} />
        </TrackWithArtistRow>
      );
  }
}

/**
 * An artist result as the Artists tab draws it, heart and activity included.
 * The device loads every artist at launch, so it is almost always there; a
 * brand-new artist falls back to a plain row.
 */
function SearchArtistResult({
  row,
  ...pressable
}: {
  row: Extract<SearchCatalogRow, { kind: 'artist' }>;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled: boolean;
}) {
  const artist = useObject(Artist, decodeUuidCatalogId(row.artist.id, 'artist'));
  if (!artist) {
    return <ListRow title={row.artist.name} subtitle="Artist" {...pressable} />;
  }

  return (
    <ArtistRow
      artist={artist}
      metadata={{ shows: artist.showCount, sources: artist.sourceCount }}
      {...pressable}
    />
  );
}

export function SearchPlaylistResult({
  card,
  onPress,
}: {
  card: SearchPlaylistCard;
  onPress?: () => void;
}) {
  return (
    <ListRow
      title={card.name}
      subtitle={playlistCardSubtitle(card)}
      disabled={!onPress}
      onPress={onPress}
    />
  );
}

/** A file's venue, with its own listening activity where the catalog has it. */
export function VenueLine({
  place,
  popularity,
}: {
  place?: string;
  popularity?: Parameters<typeof PopularityIndicator>[0]['popularity'];
}) {
  if (!place && !popularity) {
    return null;
  }

  return (
    <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
      <SubtitleText className="flex-shrink" numberOfLines={2}>
        {place}
      </SubtitleText>
      <PopularityIndicator popularity={popularity} isTrendingSort={false} />
    </View>
  );
}

/**
 * The quoted passage that tells a recording or review apart, with the words
 * the query matched in bold. The text is split on `<mark>` tags, never
 * parsed as markup, since listeners wrote it.
 */
function SearchNote({ text }: { text?: string }) {
  if (!text) {
    return null;
  }

  return (
    <SubtitleText className="pt-0.5 italic" numberOfLines={2}>
      {markedRuns(text).map((run, index) =>
        run.marked ? (
          <RelistenText key={index} className="text-s font-semibold text-gray-200">
            {run.text}
          </RelistenText>
        ) : (
          run.text
        )
      )}
    </SubtitleText>
  );
}
