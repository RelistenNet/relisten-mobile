import type { ReactNode } from 'react';
import { View } from 'react-native';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { ArtistRow } from '@/relisten/components/artist_rows';
import { ListRow } from '@/relisten/components/list_row';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { ShowRow, showRowFields } from '@/relisten/components/shows_list';
import {
  TrackWithArtistRow,
  type TrackWithArtistFields,
} from '@/relisten/components/source/source_track_with_artist';
import {
  catalogPopularitySnapshot,
  type PopularitySnapshot,
} from '@/relisten/realm/models/popularity';
import { Artist } from '@/relisten/realm/models/artist';
import type { Show } from '@/relisten/realm/models/show';
import { useObject } from '@/relisten/realm/schema';
import {
  markedRuns,
  namedRowSubtitle,
  namedRowTitle,
  playlistCardSubtitle,
  recordingNote,
  reviewNote,
  searchPassageFields,
  searchShowFields,
  searchTrackFields,
  showPlace,
  showRowAccessibilityLabel,
  trackRowAccessibilityLabel,
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
    case 'review': {
      const fields = searchShowFields(row.show, row.source);
      const note = row.kind === 'review' ? reviewNote(row) : recordingNote(row);
      // Recording and review results carry no popularity of their own; the
      // embedded show's activity is what show rows print anyway.
      return (
        <ShowRow
          fields={fields}
          popularity={catalogPopularitySnapshot(row.show.popularity)}
          byline={row.artist.name}
          accessibilityLabel={showRowAccessibilityLabel(fields, row.artist.name, note)}
          {...pressable}
        >
          <SearchNote text={note} />
        </ShowRow>
      );
    }
    case 'performance':
      return (
        <SearchTrackResult
          fields={searchTrackFields(row)}
          place={showPlace(row.show)}
          // A file's own song-level activity; only performance results carry it.
          popularity={catalogPopularitySnapshot(row.popularity)}
          trailing={trailing}
          {...pressable}
        />
      );
    case 'sequence':
      return (
        <SearchTrackResult
          fields={searchPassageFields(row)}
          place={showPlace(row.show)}
          popularity={catalogPopularitySnapshot(row.show.popularity)}
          {...pressable}
        />
      );
  }
}

/**
 * A file as the download list's track row. Add Tracks' **+** sits beside the
 * row rather than inside its button: a disabled **+** (another add is
 * running) would otherwise pass the tap through to the row, and VoiceOver
 * couldn't reach it inside the row's single element.
 */
export function SearchTrackResult({
  fields,
  place,
  popularity,
  trailing,
  ...pressable
}: {
  fields: TrackWithArtistFields;
  place?: string;
  popularity?: PopularitySnapshot | null;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center">
      <TrackWithArtistRow
        fields={fields}
        cn="w-auto min-w-0 flex-1"
        subtitleColumn
        popularity={popularity ?? null}
        accessibilityRole="button"
        accessibilityLabel={trackRowAccessibilityLabel(fields, place)}
        {...pressable}
      >
        {place ? (
          <SubtitleText className="flex-shrink" numberOfLines={2}>
            {place}
          </SubtitleText>
        ) : null}
      </TrackWithArtistRow>
      {trailing ? <View className="pr-2">{trailing}</View> : null}
    </View>
  );
}

/**
 * An artist result as the Artists tab draws it, with its activity and without
 * the favorite heart. The device loads every artist at launch, so it is
 * almost always there; a brand-new artist falls back to a plain row.
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
  return <SearchArtistRow artist={artist} {...pressable} />;
}

/** An artist on the device, as search draws artists: no favorite heart. */
export function SearchArtistRow({
  artist,
  ...pressable
}: {
  artist: Artist;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <ArtistRow
      artist={artist}
      showFavorite={false}
      metadata={{ shows: artist.showCount, sources: artist.sourceCount }}
      accessibilityRole="button"
      {...pressable}
    />
  );
}

/**
 * A show on the device (a download, a recent play, a venue's or song's show)
 * as a search show row. A recent play passes the played recording's
 * soundboard mark, since the show's own mark says whether any recording is one.
 */
export function SearchLocalShowRow({
  show,
  hasSoundboardSource,
  onPress,
}: {
  show: Show;
  hasSoundboardSource?: boolean;
  onPress: () => void;
}) {
  return (
    <ShowRow
      fields={{
        ...showRowFields(show),
        hasSoundboardSource: hasSoundboardSource ?? show.hasSoundboardSource,
      }}
      popularity={show.popularity?.snapshot()}
      byline={show.artist?.name}
      accessibilityRole="button"
      onPress={onPress}
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
