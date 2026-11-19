import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Realm from 'realm';
import { TextInput, type TextInputInstance, View } from 'react-native';
import { AndroidBackHandler, textToolbarButtonProps } from '@/relisten/components/header_buttons';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useRealm } from '@/relisten/realm/schema';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import {
  usePlaylist,
  usePlaylistGroups,
  usePlaylistLayout,
} from '@/relisten/playlists/playlist_hooks';
import { usePlaylistHydration } from '@/relisten/playlists/playlist_hydration';
import { PLAYLIST_LIMITS, updatePlaylistDetails } from '@/relisten/playlists/playlist_repository';
import { needsSnapshot } from '@/relisten/playlists/sync/playlist_sync_state';
import { PlaylistEditList } from '@/relisten/playlists/ui/playlist_edit_list';
import { openGuideTextEditor } from '@/relisten/playlists/guide/guide_text_navigation';
import { usePlaylistLifecycle } from '@/relisten/playlists/ui/playlist_lifecycle';
import {
  notLoadedText,
  PlaylistReadingList,
  PlaylistViewHeader,
} from '@/relisten/playlists/ui/playlist_reading_view';
import { usePlaylistShareActions } from '@/relisten/playlists/ui/playlist_share_actions';
import { PlaylistSyncNotice } from '@/relisten/playlists/ui/playlist_sync_notice';
import { FollowedPlaylistView } from '@/relisten/pages/playlists/followed_playlist_view';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export default function PlaylistDetailPage() {
  const { playlistId } = useLocalSearchParams<{ playlistId: string }>();
  const realm = useRealm();
  const router = useRouter();
  const online = useShouldMakeNetworkRequests();
  const playlist = usePlaylist(playlistId);
  const allGroups = usePlaylistGroups(playlistId);
  const layout = usePlaylistLayout(allGroups);
  // What the name and description held when editing began; null when not editing.
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const editing = initialDraft !== null;
  // The fields the listener changed from `initialDraft`, saved on Done or on
  // leaving the screen. Only changed fields are saved, so an untouched field
  // never undoes another device's edit. The inputs are uncontrolled and this
  // is a ref, so typing doesn't re-render the page.
  const changedDetails = useRef<Partial<Draft>>({});
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const nameInput = useRef<TextInputInstance>(null);
  const [focusName, setFocusName] = useState(false);
  const lifecycle = usePlaylistLifecycle();
  const shareActions = usePlaylistShareActions();
  const syncService = usePlaylistSyncService();

  // A followed playlist its owner made private keeps its last rows, hidden; don't fetch them.
  usePlaylistHydration(playlistId, playlist?.unavailable ? [] : allGroups, online);
  // Opening the playlist (or coming back to it) checks for other devices' changes.
  useFocusEffect(
    useCallback(() => {
      syncService.checkForChanges(playlistId);
    }, [playlistId, syncService])
  );
  // Leaving the screen mid-edit keeps the name and description changes. Undo
  // history is kept so a toast's Undo still works after navigating away.
  // Leaving also sends this playlist's pending edits rather than waiting.
  useEffect(
    () => () => {
      commitDetails(realm, playlistId, changedDetails);
      syncService.flush();
    },
    [playlistId, realm, syncService]
  );
  if (!playlist || playlist.deletedAt) {
    return (
      <View className="flex-1 items-center bg-relisten-blue-900 px-8 pt-16">
        <Stack.Screen options={{ title: '' }} />
        <RelistenText className="text-center text-gray-400">
          This playlist was deleted.
        </RelistenText>
      </View>
    );
  }

  if (playlist.access === 'follower') {
    return <FollowedPlaylistView playlist={playlist} groups={allGroups} />;
  }

  // The toolbar's actions read only these primitives (and IDs), so its menu
  // isn't rebuilt and re-sent to native on every write to the playlist or
  // every track that loads.
  const name = playlist.name;
  const description = playlist.description ?? '';
  const lastSegmentId = allGroups[allGroups.length - 1]?.segment.segmentId;
  const addTextSection = () =>
    openGuideTextEditor(router, { kind: 'section', playlistId, afterSegmentId: lastSegmentId });
  const deletePlaylist = () => lifecycle.remove(playlistId);
  const startEditing = () => {
    changedDetails.current = {};
    setInitialDraft({ name, description });
  };
  const finishEditing = () => {
    commitDetails(realm, playlistId, changedDetails);
    setInitialDraft(null);
    setFocusName(false);
    syncService.flush();
  };
  const updateDraft = (field: keyof Draft, text: string) => {
    // A field typed back to how it started is no longer an edit.
    if (text === initialDraft?.[field]) {
      delete changedDetails.current[field];
    } else {
      changedDetails.current[field] = text;
    }
  };
  // Rename opens edit mode with the name field focused as it appears.
  const startRename = () => {
    if (editing) {
      nameInput.current?.focus();
      return;
    }
    setFocusName(true);
    startEditing();
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      {/* Viewing, the name fades into the header as you scroll (DisappearingHeaderScreen
          sets that title view). Editing shows a plain "Editing" instead. */}
      <Stack.Screen
        options={
          editing
            ? {
                title: 'Editing',
                headerTitle: ({ children }) => (
                  <RelistenText className="text-xl font-semibold">{children}</RelistenText>
                ),
              }
            : { title: name }
        }
      />
      {/* Back while editing finishes editing, like Done; edits apply as they're made. */}
      {editing && <AndroidBackHandler onBack={finishEditing} />}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          {...(editing
            ? textToolbarButtonProps('Done', nativeMenuIcons.done)
            : textToolbarButtonProps('Edit', nativeMenuIcons.edit))}
          onPress={editing ? finishEditing : startEditing}
        />
        <Stack.Toolbar.Menu accessibilityLabel="Playlist actions" icon={nativeMenuIcons.more}>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction icon={nativeMenuIcons.edit} onPress={startRename}>
              Rename…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon={nativeMenuIcons.add} onPress={addTextSection}>
              Add Text at End…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.download}
              isOn={downloadedOnly}
              onPress={() => setDownloadedOnly(!downloadedOnly)}
            >
              Show Downloaded Only
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.share}
              onPress={() => shareActions.share(playlistId)}
            >
              Share…
            </Stack.Toolbar.MenuAction>
            {playlist.published && (
              <Stack.Toolbar.MenuAction
                icon={nativeMenuIcons.lock}
                onPress={() => shareActions.makePrivate(playlistId)}
              >
                Make Private
              </Stack.Toolbar.MenuAction>
            )}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction
              destructive
              icon={nativeMenuIcons.delete}
              onPress={deletePlaylist}
            >
              Delete Playlist…
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      {initialDraft ? (
        <PlaylistEditList
          playlistId={playlistId}
          layout={layout}
          header={
            <EditHeader
              initialDraft={initialDraft}
              onChange={updateDraft}
              nameInput={nameInput}
              focusName={focusName}
              onAddText={addTextSection}
            />
          }
        />
      ) : (
        <PlaylistReadingList
          playlistId={playlistId}
          groups={allGroups}
          editable
          downloadedOnly={downloadedOnly}
          emptyText={
            isLoading(playlist)
              ? notLoadedText(online)
              : "This playlist is empty. Add songs from any show's ••• menu."
          }
          header={
            <PlaylistViewHeader
              playlistId={playlistId}
              name={name}
              byline={sharingLine(playlist)}
              description={playlist.description}
              trackCount={playlist.entryCount}
              groups={allGroups}
              notice={<PlaylistSyncNotice playlist={playlist} />}
            />
          }
        />
      )}
    </View>
  );
}

/** Saves the changed fields and clears them, so Done and leaving the screen save them once. */
function commitDetails(
  realm: Realm,
  playlistId: string,
  changedDetails: React.RefObject<Partial<Draft>>
) {
  const changed = changedDetails.current;
  if (changed.name === undefined && changed.description === undefined) {
    return;
  }

  changedDetails.current = {};
  updatePlaylistDetails(realm, playlistId, {
    // An emptied name keeps the old one rather than leaving the playlist unnamed.
    name: changed.name?.trim() ? changed.name : undefined,
    description: changed.description,
  });
}

function EditHeader({
  initialDraft,
  onChange,
  nameInput,
  focusName,
  onAddText,
}: {
  focusName: boolean;
  onAddText: () => void;
  initialDraft: Draft;
  onChange: (field: keyof Draft, text: string) => void;
  nameInput: React.RefObject<TextInputInstance | null>;
}) {
  return (
    <View className="px-4 pb-4 pt-2">
      <TextInput
        ref={nameInput}
        autoFocus={focusName}
        accessibilityLabel="Playlist name"
        className="rounded-lg bg-relisten-blue-800 px-3 py-3 text-xl font-bold text-white"
        maxLength={PLAYLIST_LIMITS.nameLength}
        defaultValue={initialDraft.name}
        onChangeText={(name) => onChange('name', name)}
        returnKeyType="done"
      />
      <TextInput
        accessibilityLabel="Description"
        className="mt-2 rounded-lg bg-relisten-blue-800 px-3 py-3 text-white"
        maxLength={PLAYLIST_LIMITS.descriptionLength}
        multiline
        placeholder="Add a description"
        placeholderTextColor="#9ca3af"
        defaultValue={initialDraft.description}
        onChangeText={(description) => onChange('description', description)}
      />
      {/* One way in, instead of a control in every gap: new text goes at the end,
          and its handle drags it into place like a track. */}
      <View className="mt-3 flex-row items-center" style={{ gap: 12 }}>
        <RelistenButton
          icon={<MaterialIcons name="notes" size={18} color="white" />}
          onPress={onAddText}
        >
          Add Text
        </RelistenButton>
        <RelistenText className="flex-1 text-sm text-gray-400" selectable={false}>
          Adds text at the end. Drag it into place.
        </RelistenText>
      </View>
    </View>
  );
}

/** An account playlist this device hasn't fetched yet, such as a new copy: its rows are on their way. */
function isLoading(playlist: Playlist) {
  return playlist.serverState === 'synced' && needsSnapshot(playlist) && playlist.entryCount === 0;
}

/** Whether others can see the playlist, under its name. */
function sharingLine(playlist: Playlist) {
  if (playlist.takenDown) {
    return 'Removed from public view';
  }
  return playlist.published ? 'Public' : undefined;
}

interface Draft {
  name: string;
  description: string;
}
