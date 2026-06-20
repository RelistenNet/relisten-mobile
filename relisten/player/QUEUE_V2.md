# Queue V2

Queue V2 adds a stable logical identity to every queue row while keeping the
existing runtime identifier that the native player, Cast, and CarPlay already
use for concrete playback items.

## Identities

Each `PlayerQueueTrack` has two identities:

- `identifier`: generated at runtime for the current queue row. Native playback,
  Cast status, and CarPlay callbacks use this because they need to point at the
  row currently loaded in memory.
- `queueV2Item.queueItemId`: stable logical identity that survives persistence,
  restore, duplicate source tracks, playlist entries, and playlist block
  shuffle.

Catalog queue rows use `catalog:<sourceTrackUuid>:<occurrenceIndex>`. The
occurrence index is needed because a catalog queue can contain the same source
track more than once.

Playlist queue rows use the playlist entry UUID. This is the important identity
for playback history and playlist cursor attribution; source track UUID alone is
not enough because one playlist can contain duplicate tracks.

## Shuffle Units

Queue V2 shuffles playlist blocks as units. Entries with the same playlist
`blockUuid` stay together and are sorted by `blockPosition` inside the unit.
Standalone catalog rows and unblocked playlist entries shuffle as one-item units.

`RelistenPlayerQueue.reshuffleTracks` works on Queue V2 units, then flattens
them back into runtime `PlayerQueueTrack` rows for the existing player surface.

## Persistence and Restore

`PlayerState` still stores legacy source-track UUID arrays so old app versions
and legacy restore logic remain understandable. Queue V2 adds:

- `queueV2SchemaVersion`;
- `queueV2ItemsJson`;
- `queueV2ShuffledQueueItemIds`;
- `queueV2CurrentItemKey`.

On restore, the app prefers Queue V2 state when present and valid. If the state
is missing, invalid, or from an unsupported version, it migrates the legacy
source-track arrays into catalog Queue V2 items and uses the legacy active
indexes as the fallback cursor.

## Cast and CarPlay

Cast custom data carries both runtime identifier and Queue V2 item id. Runtime
identifier remains the best match when available; Queue V2 item id is the
fallback that lets Cast recover when duplicate source tracks would otherwise be
ambiguous.

CarPlay item ids include the Queue V2 item id and runtime identifier. This keeps
existing callbacks precise while making future playlist-attribution work visible
to CarPlay surfaces.
