import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import { showsTabChip, tabCountLabel, type SearchTabCounts } from '../search_tab_counts';
import type { SearchInterpretationChip, SearchReading, SearchScope } from '../search_types';

// A horizontal scroll view in a column either grows to fill it or clips its
// chips while the keyboard animates, so each chip row gets a fixed height.
const CHIP_ROW_STYLE = { flexGrow: 0, height: 44 } as const;

const SCOPE_LABELS: { scope: SearchScope; label: string }[] = [
  { scope: 'all', label: 'All' },
  { scope: 'artists', label: 'Artists' },
  { scope: 'songs', label: 'Songs' },
  { scope: 'venues', label: 'Venues' },
  { scope: 'shows', label: 'Shows' },
  { scope: 'sources', label: 'Sources' },
  { scope: 'playlists', label: 'Playlists' },
  { scope: 'reviews', label: 'Reviews' },
];

/**
 * The tabs a search can narrow to, each with its total when the server gave
 * one (see `showsTabChip` for which show). Add Tracks leaves Playlists out.
 */
export function SearchScopeChips({
  scope,
  counts,
  moreScopes,
  includePlaylists,
  onSelect,
}: {
  scope: SearchScope;
  counts: SearchTabCounts | undefined;
  moreScopes: readonly SearchScope[];
  includePlaylists: boolean;
  onSelect: (scope: SearchScope) => void;
}) {
  const scopes = SCOPE_LABELS.filter(
    (entry) =>
      (entry.scope !== 'playlists' || includePlaylists) &&
      showsTabChip(entry.scope, { selected: scope, counts, moreScopes })
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={CHIP_ROW_STYLE}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 4,
        alignItems: 'center',
      }}
    >
      {scopes.map((entry) => {
        const selected = entry.scope === scope;
        const count = entry.scope === 'all' ? undefined : counts?.[entry.scope];
        return (
          <TouchableOpacity
            key={entry.scope}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={tw('rounded-full border px-3 py-1.5', {
              'border-relisten-blue-500 bg-relisten-blue-600': selected,
              'border-relisten-blue-700': !selected,
            })}
            onPress={() => onSelect(entry.scope)}
          >
            <RelistenText className="text-sm font-semibold">
              {entry.label}
              {count && count.count > 0 ? (
                <RelistenText className="text-sm font-normal text-gray-300">
                  {` ${tabCountLabel(count)}`}
                </RelistenText>
              ) : null}
            </RelistenText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** The clues the server read, each removable. */
export function SearchInterpretationChips({
  chips,
  onRemove,
}: {
  chips: SearchInterpretationChip[];
  onRemove: (key: string) => void;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={CHIP_ROW_STYLE}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 4,
        alignItems: 'center',
      }}
    >
      {chips.map((chip) => (
        <TouchableOpacity
          key={`${chip.key}:${chip.value}`}
          accessibilityLabel={`Remove ${chip.label}`}
          accessibilityRole="button"
          className="flex-row items-center rounded-full bg-relisten-blue-700 py-1 pl-3 pr-2"
          onPress={() => onRemove(chip.key)}
        >
          <RelistenText className="text-sm">{chip.label}</RelistenText>
          <MaterialIcons
            name="close"
            size={14}
            color="rgba(255,255,255,0.7)"
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/** Select the reading without changing the query text. */
export function SearchReadingChips({
  readings,
  query,
  selected,
  onSelect,
}: {
  readings: SearchReading[];
  query: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (!readings.some((reading) => reading.chips.length > 0)) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={CHIP_ROW_STYLE}
      contentContainerStyle={{
        gap: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
      }}
    >
      {readings.map((reading) => {
        const active = selected === reading.id;
        // The literal reading has no chips: it searches the words as typed.
        const label =
          reading.chips.map((chip) => chip.label).join(' · ') || `Exactly “${query.trim()}”`;
        return (
          <TouchableOpacity
            key={reading.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={tw('rounded-full border px-3 py-1.5', {
              'border-relisten-blue-500 bg-relisten-blue-600': active,
              'border-relisten-blue-700': !active,
            })}
            onPress={() => onSelect(active ? null : reading.id)}
          >
            <RelistenText className="text-sm">{label}</RelistenText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** The On this device list is narrowed to one artist's or show's downloads. */
export function NarrowingChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <View className="flex-row px-4 py-1">
      <TouchableOpacity
        accessibilityLabel={`Show all downloads, not only ${label}`}
        accessibilityRole="button"
        className="flex-row items-center rounded-full bg-relisten-blue-700 py-1 pl-3 pr-2"
        onPress={onClear}
      >
        <RelistenText className="text-sm">Downloads: {label}</RelistenText>
        <MaterialIcons
          name="close"
          size={14}
          color="rgba(255,255,255,0.7)"
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>
    </View>
  );
}
