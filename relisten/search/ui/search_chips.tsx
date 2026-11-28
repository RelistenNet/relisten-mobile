import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import { LITERAL_READING_ID, visibleChips, visibleReadings } from '../search_presentation';
import type { SearchSession, SearchSessionState } from '../search_session';
import { showsTabChip, tabCountLabel, type SearchTabCounts } from '../search_tab_counts';
import type { SearchInterpretationChip, SearchReading, SearchScope } from '../search_types';

// A horizontal scroll view in a column either grows to fill it or clips its
// chips while the keyboard animates, so each chip row gets a fixed height.
const CHIP_ROW_STYLE = { flexGrow: 0, height: 44 } as const;

// Every chip row scrolls sideways with the same insets.
const CHIP_ROW_CONTENT_STYLE = {
  gap: 8,
  paddingHorizontal: 16,
  paddingVertical: 4,
  alignItems: 'center',
} as const;

/**
 * Everything above the results, in order: tabs (once there is text), the
 * clues the server read, readings to pick from, and the downloads narrowing
 * when On this device is showing. The Search tab and Add Tracks share it.
 */
export function SearchChipsHeader({
  session,
  state,
  includePlaylists,
  narrowingLabel,
  onClearNarrowing,
}: {
  session: SearchSession;
  state: SearchSessionState;
  includePlaylists: boolean;
  /** Set while On this device is narrowed to one artist's or show's downloads. */
  narrowingLabel?: string;
  onClearNarrowing: () => void;
}) {
  const { query, scope } = state.inputs;
  return (
    <>
      {query.trim() !== '' && (
        <SearchScopeChips
          scope={scope}
          counts={state.tabTotals?.counts}
          moreScopes={state.response?.more_scopes ?? []}
          includePlaylists={includePlaylists}
          onSelect={(next) => session.setScope(next)}
        />
      )}
      <SearchInterpretationChips
        chips={visibleChips(state)}
        onRemove={(key) => session.removeChip(key)}
      />
      <SearchReadingChips
        readings={visibleReadings(state)}
        // The text those readings were read from, until the next answer.
        query={state.responseInputs?.query ?? query}
        selected={state.response?.readings.applied?.id ?? null}
        onSelect={(id) => session.selectReading(id)}
      />
      {narrowingLabel && <NarrowingChip label={narrowingLabel} onClear={onClearNarrowing} />}
    </>
  );
}

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
      contentContainerStyle={CHIP_ROW_CONTENT_STYLE}
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
      contentContainerStyle={CHIP_ROW_CONTENT_STYLE}
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
      contentContainerStyle={CHIP_ROW_CONTENT_STYLE}
    >
      {readings.map((reading) => {
        const active = selected === reading.id;
        const label =
          reading.id === LITERAL_READING_ID
            ? `Exactly “${query.trim()}”`
            : reading.chips.map((chip) => chip.label).join(' · ');
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
