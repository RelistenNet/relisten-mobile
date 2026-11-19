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
  const [editing, setEditing] = useState(false);
  // Name and description edits are drafts until Done (or leaving the screen) commits them.
  const [draft, setDraft] = useState({ name: '', description: '' });
  const draftRef = useRef<typeof draft | null>(null);
  // What the fields held when editing began. Only fields the listener changed
  // are saved, so an untouched field never undoes another device's edit.
  const initialDraftRef = useRef<typeof draft>({ name: '', description: '' });
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const nameInput = useRef<TextInputInstance>(null);
  const [focusName, setFocusName] = useState(false);
  const lifecycle = usePlaylistLifecycle();
  const shareActions = usePlaylistShareActions();
  const syncService = usePlaylistSyncService();

  usePlaylistHydration(playlistId, allGroups, online);
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
      if (draftRef.current) {
        commitDetails(realm, playlistId, draftRef.current, initialDraftRef.current);
      }
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

  const name = playlist.name;
  const addTextSection = () =>
    openGuideTextEditor(router, {
      kind: 'section',
      playlistId,
      afterSegmentId: allGroups[allGroups.length - 1]?.segment.segmentId,
    });
  const deletePlaylist = () => lifecycle.remove(playlist);
  const startEditing = () => {
    const initial = { name, description: playlist.description ?? '' };
    draftRef.current = initial;
    initialDraftRef.current = initial;
    setDraft(initial);
    setEditing(true);
  };
  const finishEditing = () => {
    if (draftRef.current) {
      commitDetails(realm, playlistId, draftRef.current, initialDraftRef.current);
    }
    draftRef.current = null;
    setEditing(false);
    setFocusName(false);
    syncService.flush();
  };
  const updateDraft = (next: typeof draft) => {
    draftRef.current = next;
    setDraft(next);
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
              onPress={() => shareActions.share(playlist)}
            >
              Share…
            </Stack.Toolbar.MenuAction>
            {playlist.published && (
              <Stack.Toolbar.MenuAction
                icon={nativeMenuIcons.lock}
                onPress={() => shareActions.makePrivate(playlist)}
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

      {editing ? (
        <PlaylistEditList
          playlistId={playlistId}
          layout={layout}
          header={
            <EditHeader
              draft={draft}
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
              ? online
                ? 'Loading…'
                : 'Connect to the internet to load this playlist.'
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

function commitDetails(
  realm: Realm,
  playlistId: string,
  draft: { name: string; description: string },
  initial: { name: string; description: string }
) {
  const nameChanged = draft.name !== initial.name;
  updatePlaylistDetails(realm, playlistId, {
    // An emptied name keeps the old one rather than leaving the playlist unnamed.
    name: nameChanged && draft.name.trim() ? draft.name : undefined,
    description: draft.description !== initial.description ? draft.description : undefined,
  });
}

function EditHeader({
  draft,
  onChange,
  nameInput,
  focusName,
  onAddText,
}: {
  focusName: boolean;
  onAddText: () => void;
  draft: { name: string; description: string };
  onChange: (draft: { name: string; description: string }) => void;
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
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        returnKeyType="done"
      />
      <TextInput
        accessibilityLabel="Description"
        className="mt-2 rounded-lg bg-relisten-blue-800 px-3 py-3 text-white"
        maxLength={PLAYLIST_LIMITS.descriptionLength}
        multiline
        placeholder="Add a description"
        placeholderTextColor="#9ca3af"
        value={draft.description}
        onChangeText={(description) => onChange({ ...draft, description })}
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
