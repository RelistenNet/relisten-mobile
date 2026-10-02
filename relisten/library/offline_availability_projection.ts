import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';

type Listener = () => void;
type Counts = {
  artist: Map<string, number>;
  year: Map<string, number>;
  show: Map<string, number>;
  source: Map<string, number>;
};

/** Separates playable cache availability from user-initiated My Library downloads. */
export class OfflineAvailabilityProjection {
  private readonly listeners = new Set<Listener>();
  private readonly offlineInfos: Realm.Results<SourceTrackOfflineInfo>;
  private readonly playable = createCounts();
  private readonly library = createCounts();
  private version = 0;

  constructor(private readonly realm: Realm) {
    this.offlineInfos = realm
      .objects(SourceTrackOfflineInfo)
      .filtered('status == $0', SourceTrackOfflineInfoStatus.Succeeded);
    this.offlineInfos.addListener(this.handleDataChanged);
    this.rebuild();
  }

  tearDown() {
    if (!this.realm.isClosed) {
      this.offlineInfos.removeListener(this.handleDataChanged);
    }
    this.listeners.clear();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.version;

  artistHasPlayableTracks(uuid?: string | null) {
    return hasEntries(this.playable.artist, uuid);
  }

  yearHasPlayableTracks(uuid?: string | null) {
    return hasEntries(this.playable.year, uuid);
  }

  showHasPlayableTracks(uuid?: string | null) {
    return hasEntries(this.playable.show, uuid);
  }

  sourceHasPlayableTracks(uuid?: string | null) {
    return hasEntries(this.playable.source, uuid);
  }

  artistHasLibraryDownloads(uuid?: string | null) {
    return hasEntries(this.library.artist, uuid);
  }

  yearHasLibraryDownloads(uuid?: string | null) {
    return hasEntries(this.library.year, uuid);
  }

  showHasLibraryDownloads(uuid?: string | null) {
    return hasEntries(this.library.show, uuid);
  }

  libraryArtistUuids() {
    return this.library.artist.keys();
  }

  libraryYearUuids() {
    return this.library.year.keys();
  }

  libraryShowUuids() {
    return this.library.show.keys();
  }

  playableArtistUuids() {
    return this.playable.artist.keys();
  }

  playableYearUuids() {
    return this.playable.year.keys();
  }

  playableShowUuids() {
    return this.playable.show.keys();
  }

  playableSourceUuids() {
    return this.playable.source.keys();
  }

  private readonly handleDataChanged = () => {
    this.rebuild();
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  };

  private rebuild() {
    clearCounts(this.playable);
    clearCounts(this.library);

    for (const offlineInfo of this.offlineInfos) {
      const track = offlineInfo.sourceTrack;
      if (!track) {
        continue;
      }

      const yearUuid =
        track.year?.uuid ??
        track.show?.yearUuid ??
        this.realm.objectForPrimaryKey(Show, track.showUuid)?.yearUuid;
      this.addTrack(this.playable, track.artistUuid, yearUuid, track.showUuid, track.sourceUuid);
      if (offlineInfo.type === SourceTrackOfflineInfoType.UserInitiated) {
        this.addTrack(this.library, track.artistUuid, yearUuid, track.showUuid, track.sourceUuid);
      }
    }
  }

  private addTrack(
    counts: Counts,
    artistUuid: string,
    yearUuid: string | undefined,
    showUuid: string,
    sourceUuid: string
  ) {
    increment(counts.artist, artistUuid);
    increment(counts.year, yearUuid);
    increment(counts.show, showUuid);
    increment(counts.source, sourceUuid);
  }
}

function createCounts(): Counts {
  return {
    artist: new Map(),
    year: new Map(),
    show: new Map(),
    source: new Map(),
  };
}

function clearCounts(counts: Counts) {
  counts.artist.clear();
  counts.year.clear();
  counts.show.clear();
  counts.source.clear();
}

function increment(counts: Map<string, number>, uuid?: string | null) {
  if (uuid) {
    counts.set(uuid, (counts.get(uuid) ?? 0) + 1);
  }
}

function hasEntries(counts: ReadonlyMap<string, number>, uuid?: string | null) {
  return !!uuid && (counts.get(uuid) ?? 0) > 0;
}
