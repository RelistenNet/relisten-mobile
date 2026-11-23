import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert } from 'react-native';
import { useAccountScopeSource } from '@/relisten/accounts/account_context';
import { useRelistenApi } from '@/relisten/api/context';
import { OnePendingAdd } from '@/relisten/playlists/one_pending_add';
import { undoForLatestEdit, type UndoOutcome } from '@/relisten/playlists/playlist_actions';
import { duplicateTracksMessage } from '@/relisten/playlists/playlist_format';
import { sourceTrackFor, trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { readPlaylistSnapshot } from '@/relisten/playlists/playlist_repository';
import {
  addDownloadedTrack,
  addSearchTrack,
  type SearchTrackAddResult,
  TrackUnavailableError,
} from '@/relisten/playlists/playlist_search_add';
import { PlaylistLimitError } from '@/relisten/playlists/playlist_repository';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { useRealm } from '@/relisten/realm/schema';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { searchAccountKey } from '../search_session';

/**
 * A line drawn at the bottom of the sheet, which covers the app's global
 * toast: confirmation with Undo after an add, or why an add didn't happen.
 */
export interface AddTracksNotice {
  id: number;
  text: string;
  tone: 'info' | 'warning';
  action?: { label: string; onPress: () => void };
}

interface AddTracksContextValue {
  playlistId: string;
  /** The tab the playlist is in; Open full page pushes there. */
  tab: RelistenTabGroupSegment;
  /** The destination playlist's artists, ranked first in search. */
  playlistArtistUuids: readonly string[];
  pending: OnePendingAdd;
  addedTrackIds: ReadonlySet<string>;
  notice: AddTracksNotice | null;
  dismissNotice: () => void;
  /** Adds a file from a search result, after the catalog says it can. */
  addTrack: (trackId: string, title: string) => Promise<void>;
  /** Adds a downloaded file from On this device. */
  addDownloaded: (track: SourceTrack) => Promise<void>;
}

const AddTracksContext = createContext<AddTracksContextValue | null>(null);

export function useAddTracks(): AddTracksContextValue {
  const value = useContext(AddTracksContext);
  if (!value) {
    throw new Error('useAddTracks must be used inside the Add Tracks sheet.');
  }
  return value;
}

export function usePendingAddTrackId(): string | null {
  const { pending } = useAddTracks();
  return useSyncExternalStore(pending.subscribe, pending.getSnapshot, pending.getSnapshot);
}

/**
 * The Add Tracks sheet's shared state: where files go, one add at a time,
 * and the in-sheet Undo.
 *
 * An add belongs to the sheet that started it. It checks `isCurrent` before
 * writing, which fails once the account changes or the sheet closes, so an
 * add still resolving after Done writes nothing and prompts nothing.
 */
export function AddTracksProvider({
  playlistId,
  tab,
  children,
}: PropsWithChildren<{ playlistId: string; tab: RelistenTabGroupSegment }>) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const scopeSource = useAccountScopeSource();
  const online = useShouldMakeNetworkRequests();
  const [pending] = useState(() => new OnePendingAdd());
  const [addedTrackIds, setAddedTrackIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<AddTracksNotice | null>(null);
  const nextNoticeId = useRef(1);
  const [openedForAccount] = useState(() => searchAccountKey(scopeSource.getSnapshot()));
  const sheetOpen = useRef(true);

  useEffect(() => {
    sheetOpen.current = true;
    return () => {
      sheetOpen.current = false;
    };
  }, []);

  const playlistArtistUuids = useMemo(
    () => artistsOnPlaylist(realm, playlistId),
    [realm, playlistId]
  );

  // The React Compiler memoizes the functions below; none needs useCallback.
  const isCurrent = () =>
    sheetOpen.current && searchAccountKey(scopeSource.getSnapshot()) === openedForAccount;

  const showNotice = (next: Omit<AddTracksNotice, 'id'>) => {
    setNotice({ ...next, id: nextNoticeId.current++ });
  };

  const markAdded = (trackId: string, added: boolean) => {
    setAddedTrackIds((current) => {
      const next = new Set(current);
      if (added) {
        next.add(trackId);
      } else {
        next.delete(trackId);
      }
      return next;
    });
  };

  /** Runs one add and reports the result in the sheet. */
  const runAdd = (
    trackId: string,
    title: string,
    attempt: (allowDuplicate: boolean) => Promise<SearchTrackAddResult>
  ): Promise<void> =>
    runOneAdd(pending, title, trackId, attempt, {
      canPrompt: () => sheetOpen.current,
      onResult: (result) => reportResult(result, trackId, title),
      onFailure: (error) => reportFailure(error, () => void runAdd(trackId, title, attempt)),
    });

  // A declined duplicate prompt (`duplicate`) changes nothing, so the last
  // notice, with its own Undo, stays up.
  const reportResult = (result: SearchTrackAddResult, trackId: string, title: string) => {
    if (result === 'destination_changed') {
      showNotice({ text: 'This playlist can’t be changed right now.', tone: 'warning' });
      return;
    }
    if (result !== 'added') {
      return;
    }

    markAdded(trackId, true);
    showNotice({ text: `Added “${title}”`, tone: 'info', action: undoAction(trackId, title) });
  };

  // Undo is bound to this edit when the add finishes, before any other edit
  // can land, so it can never reach an earlier one.
  const undoAction = (trackId: string, title: string) => {
    const undo = undoForLatestEdit(playlistId);
    return { label: 'Undo', onPress: () => reportUndo(undo(realm), trackId, title) };
  };

  const reportUndo = (outcome: UndoOutcome, trackId: string, title: string) => {
    if (outcome === 'undone') {
      markAdded(trackId, false);
      showNotice({ text: `Removed “${title}”`, tone: 'info' });
    } else if (outcome === 'sent') {
      showNotice({
        text: 'That add is already saved to your account, so it can’t be undone here.',
        tone: 'warning',
      });
    } else {
      setNotice(null);
    }
  };

  const reportUnavailable = () => {
    showNotice({
      text: 'This recording is no longer available, so it wasn’t added.',
      tone: 'warning',
    });
  };

  const reportFailure = (error: unknown, retry: () => void) => {
    if (error instanceof TrackUnavailableError) {
      reportUnavailable();
    } else if (error instanceof PlaylistLimitError) {
      showNotice({ text: error.message, tone: 'warning' });
    } else {
      showNotice({
        text: 'Couldn’t check that recording. Nothing was added.',
        tone: 'warning',
        action: { label: 'Try Again', onPress: retry },
      });
    }
  };

  const addTrack = (trackId: string, title: string) =>
    runAdd(trackId, title, (allowDuplicate) =>
      addSearchTrack(realm, apiClient, playlistId, trackId, { isCurrent, allowDuplicate })
    );

  // Online, a download still goes through the catalog check like any other
  // file. Offline, `addDownloadedTrack` checks the file on the device instead.
  const addDownloaded = async (track: SourceTrack) => {
    if (!track.isValid()) {
      // The download was deleted while its row was on screen.
      reportUnavailable();
      return;
    }

    const trackId = trackIdForSourceTrack(track);
    if (online) {
      return addTrack(trackId, track.title);
    }
    return runAdd(trackId, track.title, async (allowDuplicate) =>
      addDownloadedTrack(realm, playlistId, track, trackId, { isCurrent, allowDuplicate })
    );
  };

  const value: AddTracksContextValue = {
    playlistId,
    tab,
    playlistArtistUuids,
    pending,
    addedTrackIds,
    notice,
    dismissNotice: () => setNotice(null),
    addTrack,
    addDownloaded,
  };

  return <AddTracksContext.Provider value={value}>{children}</AddTracksContext.Provider>;
}

/**
 * One add under the lock, through any duplicate prompt. Outside the
 * component because the React Compiler can't compile conditionals inside a
 * `try`. `attempt` runs again with `allowDuplicate` when the listener chooses
 * to add a file the playlist already has; a closed sheet never prompts.
 */
async function runOneAdd(
  pending: OnePendingAdd,
  title: string,
  trackId: string,
  attempt: (allowDuplicate: boolean) => Promise<SearchTrackAddResult>,
  report: {
    canPrompt: () => boolean;
    onResult: (result: SearchTrackAddResult) => void;
    onFailure: (error: unknown) => void;
  }
) {
  await pending.run(trackId, async () => {
    try {
      let result = await attempt(false);
      if (result === 'duplicate' && report.canPrompt() && (await confirmDuplicate(title))) {
        result = await attempt(true);
      }
      report.onResult(result);
    } catch (error) {
      report.onFailure(error);
    }
  });
}

/** The existing duplicate prompt, as a promise that always settles. */
function confirmDuplicate(title: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Already on this playlist',
      duplicateTracksMessage(1, 1, title),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Add Anyway', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** The artists already on the playlist, from the tracks this device has. */
function artistsOnPlaylist(realm: ReturnType<typeof useRealm>, playlistId: string): string[] {
  const artists = new Set<string>();
  for (const entry of readPlaylistSnapshot(realm, playlistId).entries.values()) {
    const artistUuid = entry.trackId ? sourceTrackFor(realm, entry.trackId)?.artistUuid : undefined;
    if (artistUuid) {
      artists.add(artistUuid);
    }
  }
  return [...artists];
}
