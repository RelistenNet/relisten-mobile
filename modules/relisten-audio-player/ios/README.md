# Relisten iOS Native Audio Player

This directory contains the iOS implementation behind the Expo module in
`modules/relisten-audio-player`.

The current production path uses the native gapless MP3 backend:

- `RelistenAudioPlayerModule.swift`
- `PlaybackBackend.swift`
- `PlaybackBackendSelection.swift`
- `GaplessMP3PlayerBackend.swift`
- `GaplessMP3Player/`

The older BASS-backed implementation still exists under
`RelistenGaplessAudioPlayer/`, but `PlaybackBackendSelection.USE_NATIVE_GAPLESS_MP3_BACKEND`
currently selects `GaplessMP3PlayerBackend`.

## What This Module Does

At the Expo bridge boundary, the module exposes:

- play / pause / resume / stop
- seek by percent or time
- next-track updates
- playback progress polling
- download progress reporting for the active track
- track-change and remote-control events
- structured playback errors with a shared cross-platform kind plus raw native diagnostics
- audio session setup and presentation updates

On iOS, the native layer is responsible for:

- parsing MP3 metadata needed for accurate gapless trim and seeking
- preparing the current and next tracks ahead of playback
- downloading, caching, and reading source bytes
- decoding MP3 frames into PCM
- normalizing output into one fixed session format
- scheduling PCM into an output graph without audible gaps

## High-Level Architecture

The current engine is intentionally split into a few hard boundaries.

### 1. Expo Module / Backend Shell

`RelistenAudioPlayerModule.swift` marshals JS-facing records and delegates to a
`PlaybackBackend`.

`GaplessMP3PlayerBackend.swift` is the iOS-specific shell around the new engine.
It owns:

- command serialization on a backend queue
- audio session activation
- delegate/event forwarding back to JS
- playback/download snapshots for polling
- integration with `MPNowPlayingInfoCenter` / remote commands
- backend-scoped structured logging

The backend does not decode audio itself. It translates app-level commands into
engine operations and turns engine/runtime events back into app events.

### 2. Gapless Player API

`GaplessMP3Player/API/GaplessMP3Player.swift` is the high-level native player
surface used by the backend.

It owns:

- prepare / play / pause / stop / seek / setNext operations
- playback state snapshots
- callback queue delivery
- promotion of pending track transitions into visible state

This layer is deliberately thin. Most playback work lives below it.

### 3. Playback Coordinator

`GaplessMP3Player/Playback/GaplessPlaybackCoordinator.swift` owns one playback
session at a time.

Its responsibilities are:

- loading current/next track metadata
- validating that tracks can share one output format
- creating PCM producers for current and next tracks
- managing startup buffering and scheduled-ahead time
- deciding when the next track is warm enough to transition
- handling playback task cancellation and supersession

The coordinator is the layer that turns "prepared tracks" into a running
gapless playback pipeline.

### 4. Source Layer

`GaplessMP3Player/Source/MP3SourceManager.swift` is the byte-source boundary.
It makes local files, cached files, progressive HTTP downloads, and explicit
HTTP range reads look like one source abstraction.

Key source objects:

- `HTTPSourceSession`: shared byte-0 progressive session for one HTTP source
- `SourceReadSession`: linear reader consumed by the decoder
- `SourceCacheStore`: durable cache lookup + completed-download persistence
- `SeekMap` / `TrackSeekPlanner`: convert logical time into compressed-byte
  offsets plus any decode-side trim adjustments

### 5. Decode / Trim / Normalize / Output

The lower playback pipeline is:

1. `MP3FrameDecoder` decodes compressed MP3 bytes into PCM frames.
2. `GaplessTrimEngine` removes encoder delay/padding and applies seek trim.
3. `PCMFormatNormalizer` converts everything into a fixed session format.
4. `PCMOutputGraph` schedules normalized PCM into the output graph.

The current normalization policy is intentionally fixed-session:

- 44.1 kHz
- 2 channels
- Float32 PCM

That keeps the output graph stable across tracks and avoids per-transition graph
reconfiguration.

## Gapless Strategy

The engine follows a few deliberate rules:

- Prepare metadata for the current and optional next track before playback.
- Preload the next producer in the background so the next track can start
  without waiting for parse/decode setup.
- Keep compressed-byte seek planning separate from PCM trim.
- Normalize every track into one session output format.
- Schedule ahead by time, not by raw byte counts.

This mirrors the design used by ExoPlayer-style gapless pipelines: compressed
seeking gets you close, then trim/timeline logic makes the audible boundary
correct.

## Source and Network Strategy

The source layer now distinguishes ordinary startup from true seeks.

### Normal Track Start

When playback starts at time `0`:

- the player uses the byte-0 progressive/local path only
- no HTTP range request should be required just because the first decodable MP3
  bytes begin at `metadata.dataStartOffset`
- the decoder waits for the progressive prefix to reach the needed bytes

This prevents the old behavior where startup could accidentally issue repeated
small range requests just because the MP3 audio frames began after ID3/header
data.

### Metadata Preparation

When metadata is requested for a remote cache miss:

- the source layer still returns only the prefix bytes needed for parsing
- that prefix now comes from the same shared byte-0 session the later preload or
  playback path will use
- logs should show that session being upgraded from `metadata` to
  `progressive`, rather than a second byte-0 request for the same source

### True Mid-File Seek

When playback starts at a positive time:

- the planner resolves an approximate or exact compressed-byte offset
- if the byte-0 progressive session already covers that offset, playback uses it
- if not, the source layer can open a temporary seek bridge backed by HTTP range
  requests

The seek bridge is intentionally not the long-term source of truth. It exists to
bridge cold-seek latency while the byte-0 progressive session catches up.

## Seek Bridge Optimizations

The current seek bridge behavior is:

- range request size: `1 MB`
- prefetch low watermark: `512 KB`
- decoder read size: `32 KB`
- progressive transport yield size: `32 KB`

Important consequences:

- one decoder refill is no longer one HTTP request
- the bridge reads from in-memory 1 MB windows
- the next window is prefetched once the active window falls to 512 KB or less
- only one prefetched bridge request may be in flight at a time
- upgrade checks happen only at window boundaries, not on every 32 KB read

This keeps seeks responsive without turning normal playback into request spam.

## Progressive / Bridge Handoff Rules

At each bridge window boundary, the source layer tries to upgrade in this order:

1. fully resolved local/cached file
2. shared byte-0 progressive session
3. next bridged range window

That handoff is intentionally coarse-grained. The hot path inside one 1 MB
window does not keep polling for progressive catch-up on every decoder read.

### Fingerprint Safety

Bridge windows and upgrade targets now carry `CacheFingerprint` identity data.
The source layer refuses to splice bytes across backends unless the fingerprints
are compatible.

This protects against a bad class of bug where:

- a bridge window comes from one object version
- the progressive or cached source resolves to a different version
- playback silently mixes the two

If identity evidence disagrees, the engine fails instead of cross-wiring bytes.

### Progressive Reset Handling

`HTTPSourceSession` tracks a monotonic reset epoch. If the progressive session
restarts from zero after a retry/reconnect, the bridge layer treats prefix
coverage as non-monotonic and only reconsiders progressive handoff at a later
window boundary using the latest snapshot.

### Cancellation

Bridge work is explicitly cancellable:

- active bridge fetches
- prefetched bridge fetches
- read-session teardown / seek replacement
- playback supersession and stop flows via coordinator task cancellation

This avoids stale range completions mutating a newer playback generation.

## Caching and Download Behavior

The source layer maintains one shared progressive download session per HTTP
source/cache key.

That shared session supports:

- metadata reads from the prefix
- playback reads from the downloaded prefix
- final promotion into a durable cached/local file
- download progress snapshots for the backend
- HTTP transport logging

Range requests are intentionally ephemeral. They are not the durable cache path.
Only the byte-0 progressive session can produce the final cached file.

## Logging

Structured logging lives in `GaplessMP3Player/RelistenPlaybackLogger.swift`.

Current log layers:

- `backend`
- `player`
- `coordinator`
- `source`

Current categories:

- `command`
- `lifecycle`
- `preload`
- `network`
- `state`
- `error`

`GaplessMP3PlayerBackend` also enriches HTTP logs with request URL, `Range`, and
`Content-Range` information to make range/progressive behavior debuggable in
production logs.

The logger now lives inside `GaplessMP3Player/` so both the pod build and the
SwiftPM harness compile the same implementation.

## Test Strategy

There are two relevant test surfaces today.

### Backend Support Package

`modules/relisten-audio-player/Package.swift` contains lightweight backend
support tests.

### Gapless Harness

`modules/relisten-audio-player/tools/GaplessMP3PlayerHarness` is the more useful
native harness for engine behavior. It exercises:

- metadata parsing
- fixed-session normalization
- source-session behavior
- seek bridge windowing
- progressive catch-up handoff
- progressive reset handling
- bridge cancellation
- startup/no-range regressions

When touching source-layer logic, this harness is the primary confidence signal.

## File Map

### Backend shell

- `GaplessMP3PlayerBackend.swift`
- `AudioSessionController.swift`
- `PlaybackPresentationController.swift`
- `BackendSupport/`

### Gapless engine

- `GaplessMP3Player/API/`
- `GaplessMP3Player/Playback/`
- `GaplessMP3Player/Source/`
- `GaplessMP3Player/Metadata/`
- `GaplessMP3Player/Decode/`
- `GaplessMP3Player/HTTP/`
- `GaplessMP3Player/Support/`

### Legacy implementation

- `RelistenGaplessAudioPlayer/`

## Practical Guidance

If you are debugging playback behavior, start here:

1. `GaplessMP3PlayerBackend.swift` for command flow and emitted events
2. `GaplessPlaybackCoordinator.swift` for session lifecycle and track handoff
3. `MP3SourceManager.swift` and `SourceReadSession.swift` for network/read-path
   decisions
4. `HTTPSourceSession.swift` for progressive download behavior and retry/reset
   handling
5. `GaplessMP3PlayerHarness` tests for expected source-layer semantics

If you are changing seek or startup behavior, keep these invariants:

- startup at `0` must not rely on range requests
- true seeks may bridge with range windows, but only temporarily
- progressive/local sources are authoritative when they catch up
- byte identity must be preserved across backend handoffs
- cancellation must be tied to playback supersession
