import { useHeaderHeight } from 'expo-router/react-navigation';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, TextInput, TouchableOpacity, View } from 'react-native';
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from 'react-native-enriched-markdown';
import Realm from 'realm';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { PlaylistEntry, PlaylistSegment } from '@/relisten/realm/models/playlists/playlist';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import {
  addProseSegment,
  addTextBlock,
  removeEntry,
  setEntryDescription,
  setSegmentDescription,
} from '@/relisten/playlists/playlist_actions';
import { type PlaylistRowEntry, usePlaylistGroups } from '@/relisten/playlists/playlist_hooks';
import { trackTitle } from '@/relisten/playlists/playlist_format';
import { toastEdit } from '@/relisten/playlists/ui/playlist_toast';
import { timestampSeconds } from './guide_markdown';
import { normalizeGuideText } from './guide_text';
import { type GuideTextTarget, guideTextTargetFromParams } from './guide_text_navigation';

/**
 * The editor for a group's intro, a track's note, or a text block, opened as a
 * sheet from the playlist. It edits Markdown through the native rich text
 * input; whatever it saves is sanitized again when stored, so the toolbar
 * only offers the guide's subset but nothing depends on that.
 */
export default function GuideTextEditorScreen() {
  const params = useLocalSearchParams();
  const target = useMemo(() => guideTextTargetFromParams(params), [params]);
  const realm = useRealm();
  const router = useRouter();
  // An iOS form sheet lays its content out under the native header.
  const sheetHeaderHeight = useHeaderHeight();
  const topInset = Platform.OS === 'ios' ? sheetHeaderHeight : 0;
  const editing = useMemo(() => (target ? describeTarget(realm, target) : null), [realm, target]);
  const [markdown, setMarkdown] = useState(editing?.initialText ?? '');
  const [panel, setPanel] = useState<'link' | 'timestamp' | null>(null);
  const input = useRef<EnrichedMarkdownTextInputInstance>(null);

  if (!target || !editing) {
    return (
      <View className="flex-1 items-center bg-relisten-blue-900 px-8 pt-16">
        <RelistenText className="text-center text-gray-400">This text was deleted.</RelistenText>
      </View>
    );
  }

  const save = () => {
    let changed: boolean;
    try {
      changed = saveGuideText(realm, target, markdown);
    } catch (error) {
      // An alert, since the sheet covers the toast. The draft stays open.
      Alert.alert(error instanceof Error ? error.message : 'Couldn’t save that.');
      return;
    }
    router.back();
    toastEdit(realm, target.playlistId, changed, `Saved ${editing.noun}`);
  };

  return (
    <View className="flex-1 bg-relisten-blue-900" style={{ paddingTop: topInset }}>
      <Stack.Screen options={{ title: editing.title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Cancel"
          icon={nativeMenuIcons.close}
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Save"
          icon={nativeMenuIcons.done}
          variant="done"
          onPress={save}
        />
      </Stack.Toolbar>

      <FormattingBar input={input} panel={panel} onPanel={setPanel} />
      {panel === 'link' && (
        <LinkPanel
          onInsert={(label, url) => {
            insertWithSpace(input.current, (field) => field.insertLink(label, url));
            setPanel(null);
          }}
        />
      )}
      {panel === 'timestamp' && (
        <TimestampPanel
          playlistId={target.playlistId}
          ownEntryId={editing.ownTrackEntryId}
          onInsert={(insertion) => {
            if (insertion.kind === 'own') {
              // A bare timestamp in a track's note links to that track by itself.
              insertWithSpace(input.current, (field) => field.insertText(insertion.timestamp));
            } else {
              insertWithSpace(input.current, (field) =>
                field.insertLink(insertion.label, insertion.url)
              );
            }
            setPanel(null);
          }}
        />
      )}
      <EnrichedMarkdownTextInput
        ref={input}
        autoFocus
        multiline
        defaultValue={editing.initialText}
        placeholder={editing.placeholder}
        placeholderTextColor="#9ca3af"
        cursorColor={RelistenBlue[400]}
        selectionColor={RelistenBlue[600]}
        style={{ flex: 1, color: 'white', fontSize: 17, paddingHorizontal: 16, paddingTop: 12 }}
        formatMenuConfig={{
          underline: { enabled: false },
          strikethrough: { enabled: false },
          spoiler: { enabled: false },
        }}
        onChangeMarkdown={setMarkdown}
      />
    </View>
  );
}

/**
 * Inserts after a space, so a link or time doesn't run into the word before
 * it. A leading space at the very start is trimmed when the text is saved.
 */
function insertWithSpace(
  field: EnrichedMarkdownTextInputInstance | null,
  insert: (field: EnrichedMarkdownTextInputInstance) => void
) {
  if (!field) {
    return;
  }
  field.insertText(' ');
  insert(field);
}

// region Targets

interface EditingTarget {
  title: string;
  /** For the saved toast: "Saved note". */
  noun: string;
  placeholder: string;
  initialText: string;
  /** Set when editing a track's note: its own timestamps need no entry ID. */
  ownTrackEntryId?: string;
}

/** What the editor is editing, read once when it opens; null if it no longer exists. */
function describeTarget(realm: Realm, target: GuideTextTarget): EditingTarget | null {
  switch (target.kind) {
    case 'segment': {
      const segment = realm.objectForPrimaryKey(PlaylistSegment, target.segmentId);
      return segment
        ? {
            title: 'Intro',
            noun: 'intro',
            placeholder: 'Introduce these tracks',
            initialText: segment.description ?? '',
          }
        : null;
    }
    case 'entry': {
      const entry = realm.objectForPrimaryKey(PlaylistEntry, target.entryId);
      if (!entry) {
        return null;
      }
      return entry.trackId
        ? {
            title: 'Note',
            noun: 'note',
            placeholder: 'What to listen for. Times like 2:00 link to this track.',
            initialText: entry.description ?? '',
            ownTrackEntryId: entry.entryId,
          }
        : { title: 'Text', noun: 'text', placeholder: '', initialText: entry.description ?? '' };
    }
    case 'text':
    case 'section':
      return { title: 'Text', noun: 'text', placeholder: 'Write something', initialText: '' };
  }
}

/**
 * Saves the editor's text where its target says. Emptying an intro or a note
 * removes it, emptying a text block deletes the block, and an empty new block
 * isn't created. Returns whether anything changed.
 */
function saveGuideText(realm: Realm, target: GuideTextTarget, markdown: string): boolean {
  const text = normalizeGuideText(markdown) ?? null;
  const { playlistId } = target;

  switch (target.kind) {
    case 'segment':
      return setSegmentDescription(realm, playlistId, target.segmentId, text);
    case 'entry': {
      const entry = realm.objectForPrimaryKey(PlaylistEntry, target.entryId);
      if (!entry) {
        return false;
      }
      return !entry.trackId && !text
        ? removeEntry(realm, playlistId, target.entryId)
        : setEntryDescription(realm, playlistId, target.entryId, text);
    }
    case 'text':
      return text
        ? addTextBlock(realm, playlistId, target.segmentId, text, target.afterEntryId)
        : false;
    case 'section':
      return text ? addProseSegment(realm, playlistId, text, target.afterSegmentId) : false;
  }
}

// endregion

// region Formatting

/**
 * Formatting that the guide renders: bold, italic, a heading, lists, links and
 * timestamps. Underline, strikethrough and spoilers are left out of the
 * input's own menu too.
 */
function FormattingBar({
  input,
  panel,
  onPanel,
}: {
  input: React.RefObject<EnrichedMarkdownTextInputInstance | null>;
  panel: 'link' | 'timestamp' | null;
  onPanel: (panel: 'link' | 'timestamp' | null) => void;
}) {
  const buttons: { label: string; text: string; onPress: () => void }[] = [
    { label: 'Bold', text: 'B', onPress: () => input.current?.toggleBold() },
    { label: 'Italic', text: 'I', onPress: () => input.current?.toggleItalic() },
    { label: 'Heading', text: 'H', onPress: () => input.current?.toggleHeading(2) },
    { label: 'List', text: '•', onPress: () => input.current?.toggleUnorderedList() },
    { label: 'Link', text: 'Link', onPress: () => onPanel(panel === 'link' ? null : 'link') },
    {
      label: 'Insert timestamp',
      text: '0:00',
      onPress: () => onPanel(panel === 'timestamp' ? null : 'timestamp'),
    },
  ];

  return (
    <View className="flex-row border-b border-white/10 px-2 py-1">
      {buttons.map((button) => (
        <TouchableOpacity
          key={button.label}
          accessibilityRole="button"
          accessibilityLabel={button.label}
          className="min-h-[44px] min-w-[44px] items-center justify-center px-2"
          onPress={button.onPress}
        >
          <RelistenText className="text-base font-semibold" selectable={false}>
            {button.text}
          </RelistenText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Asks for an https URL and its label. Other links wouldn't survive sanitizing. */
function LinkPanel({ onInsert }: { onInsert: (label: string, url: string) => void }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const valid = /^https:\/\/\S+$/i.test(url.trim());

  return (
    <View className="gap-2 border-b border-white/10 p-3">
      <PanelInput value={url} onChangeText={setUrl} placeholder="https://" keyboardType="url" />
      <PanelInput value={label} onChangeText={setLabel} placeholder="Text to show (optional)" />
      <RelistenButton
        disabled={!valid}
        onPress={() => onInsert(label.trim() || url.trim(), url.trim())}
      >
        Insert Link
      </RelistenButton>
    </View>
  );
}

type TimestampInsertion =
  | { kind: 'own'; timestamp: string }
  | { kind: 'entry'; label: string; url: string };

/**
 * Picks a track in this playlist and a time in it. In a track's own note the
 * time is inserted bare and links by itself; elsewhere it becomes
 * `[label](#entry=<id>&t=<time>)`, which follows the entry when the playlist
 * is reordered.
 */
function TimestampPanel({
  playlistId,
  ownEntryId,
  onInsert,
}: {
  playlistId: string;
  ownEntryId?: string;
  onInsert: (insertion: TimestampInsertion) => void;
}) {
  const groups = usePlaylistGroups(playlistId);
  const tracks = useMemo(
    () => groups.flatMap((group) => group.entries).filter((row) => row.entry.trackId),
    [groups]
  );
  const [entryId, setEntryId] = useState(ownEntryId ?? tracks[0]?.entry.entryId);
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const chosen = tracks.find((row) => row.entry.entryId === entryId);
  const problem = timestampProblem(time.trim(), chosen);

  const insert = () => {
    const timestamp = time.trim();
    if (entryId === ownEntryId) {
      onInsert({ kind: 'own', timestamp });
    } else {
      onInsert({
        kind: 'entry',
        label: label.trim() || `${trackTitle(chosen)} at ${timestamp}`,
        url: `#entry=${entryId}&t=${timestamp}`,
      });
    }
  };

  return (
    <View className="max-h-[50%] gap-2 border-b border-white/10 p-3">
      <FlatList
        data={tracks}
        keyExtractor={(row) => row.entry.entryId}
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: item.entry.entryId === entryId }}
            className="flex-row items-center py-2"
            onPress={() => setEntryId(item.entry.entryId)}
          >
            <RelistenText
              className={item.entry.entryId === entryId ? 'font-bold text-white' : 'text-gray-300'}
              numberOfLines={1}
            >
              {item.entry.entryId === ownEntryId
                ? `This track · ${trackTitle(item)}`
                : trackTitle(item)}
            </RelistenText>
          </TouchableOpacity>
        )}
      />
      <PanelInput value={time} onChangeText={setTime} placeholder="Time, like 6:42" />
      {entryId !== ownEntryId && (
        <PanelInput value={label} onChangeText={setLabel} placeholder="Text to show (optional)" />
      )}
      {time.trim() !== '' && problem && (
        <RelistenText className="text-sm text-amber-300">{problem}</RelistenText>
      )}
      <RelistenButton disabled={!chosen || !!problem} onPress={insert}>
        Insert Timestamp
      </RelistenButton>
    </View>
  );
}

/** Why a typed time can't be inserted, or null when it can. */
function timestampProblem(time: string, row: PlaylistRowEntry | undefined): string | null {
  if (!/^(?:[0-9]+:[0-5][0-9]:[0-5][0-9]|[0-9]+:[0-5][0-9])$/.test(time)) {
    return 'Use minutes and seconds, like 6:42, or hours, like 1:02:03.';
  }
  const duration = row?.sourceTrack?.duration;
  if (duration && timestampSeconds(time) >= duration) {
    return 'That’s past the end of the track.';
  }
  return null;
}

function PanelInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      className="rounded-lg bg-relisten-blue-800 px-3 py-2 text-white"
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
}

// endregion
