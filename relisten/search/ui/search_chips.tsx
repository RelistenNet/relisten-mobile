import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import type { SearchCatalogCounts, SearchInterpretationChip, SearchScope } from '../search_types';

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
 * The scopes a search can narrow to. Reviews shows only when the response
 * counts reviews, and Add Tracks leaves Playlists out.
 */
export function SearchScopeChips({
  scope,
  counts,
  includePlaylists,
  onSelect,
}: {
  scope: SearchScope;
  counts: SearchCatalogCounts | undefined;
  includePlaylists: boolean;
  onSelect: (scope: SearchScope) => void;
}) {
  const scopes = SCOPE_LABELS.filter(
    (entry) =>
      (entry.scope !== 'playlists' || includePlaylists) &&
      (entry.scope !== 'reviews' || counts?.reviews !== undefined || scope === 'reviews')
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
            <RelistenText className="text-sm font-semibold">{entry.label}</RelistenText>
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
