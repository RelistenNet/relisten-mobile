# iOS Playback Engine Migration: Production Review

**Date:** 2026-03-31
**Scope:** Native GaplessMP3PlayerBackend, copied engine, shared controllers, resource lifecycle
**Migration status at review time:** Milestone 5 in progress (status/event/seek/cache translation parity)
**Cross-referenced with:** `docs/reviews/2026-03-31-ios-playback-engine-migration-review.md` (independent review). Findings marked *[from cross-review]* were identified by that review and verified here.

---

## Findings

Ordered by severity. Each finding was verified against the actual code by at least two independent review passes.

---

### F1. Pause during in-flight prepare is overridden — play() fires after prepare completes despite user pause *[from cross-review]*

**Severity:** BLOCKER
**Files:** `GaplessMP3PlayerBackend.swift:335-388` (playOnQueue Task), `GaplessMP3PlayerBackend.swift:451-458` (pauseOnQueue)

**What happens:** `pauseOnQueue()` calls `player.pause()` and sets `currentState = .Paused`, but does NOT increment `generation`. Meanwhile, the in-flight `playOnQueue` Task (line 335) is still running — it calls `await player.prepare()`, then checks `shouldContinueAsyncWork(for: generation)`. Since pause didn't change the generation, the check passes. The task then calls `player.play()` at line 348, overriding the user's pause.

The same pattern affects any command that doesn't increment generation (pause, volume change) while a play Task is in flight. The generation system only gates against play/stop/next — not against pause.

**Why it matters:** This is the most likely real-user bug. User taps play, then immediately taps pause while buffering. Audio starts playing despite the pause. The UI shows Paused but audio is audible. This will happen frequently on slow connections where prepare takes seconds.

**Recommended fix:** Either: (a) add a `isPaused` flag checked alongside generation in the play Task before calling `player.play()`, or (b) increment generation on pause and have resume restart the play sequence, or (c) add a "desired transport state" field that the play Task consults before issuing `player.play()`.

---

### F2. PlaybackPresentationController is still a stub — no now-playing metadata on native path *[from cross-review]*

**Severity:** BLOCKER
**Files:** `PlaybackPresentationController.swift:1-20`

**What happens:** The shared `PlaybackPresentationController` only sets `MPNowPlayingInfoCenter.default().playbackState`. It does NOT write title, artist, album, artwork, elapsed time, duration, or playback rate. The entire file is 20 lines. The BASS path (`PlaybackUpdates.swift:12-70`) handles all of this, but the native path doesn't use `PlaybackUpdates.swift`.

**Why it matters:** With the selector set to `true`, the lock screen, Control Center, Bluetooth accessory displays, and CarPlay will show no track metadata. This is a user-visible regression that blocks any production use of the native backend.

**Recommended fix:** Implement the full presentation controller as described in the spec: own now-playing metadata writes (title, artist, album, duration, elapsed, rate), artwork fetch, and teardown cleanup. Feed it the `PlaybackPresentationSnapshot` from the backend.

---

### F3. Cache key uses ephemeral queue IDs — cache is never reused across listens *[from cross-review]*

**Severity:** BLOCKER
**Files:** `relisten/player/relisten_player_queue.tsx:47-55, 107-108`, `GaplessMP3PlayerBackend.swift:742-744`

**What happens:** `PlayerQueueTrack.identifier` is a fresh `relistenQueueId_*` value generated per queue instantiation (line 47-54). `toStreamable()` passes this as the native `identifier` (line 108). The backend then uses it as `cacheKey` (line 744): `cacheKey: streamable.identifier`. Since the identifier changes every time the track is queued, the engine cache is keyed by ephemeral IDs. A user who listens to the same track twice — even in the same session — gets a cache miss and redownloads.

**Why it matters:** The engine cache is functionally useless. Every play is a fresh HTTP download. This wastes bandwidth, increases latency, and fills the cache directory with duplicate files (compounding F8 — no eviction). The spec explicitly requires cached-replay behavior.

**Recommended fix:** Derive `cacheKey` from a stable source identity (e.g., source UUID, or a hash of the streaming URL) instead of the queue-scoped identifier. Keep the queue identifier for JS-visible track identity.

---

### F4. Runtime events are not tied to a playback session — stale failures and transitions can mutate the wrong track

**Severity:** HIGH
**Files:** `Events.swift:74-80` (event definitions), `GaplessMP3PlayerBackend.swift:651-694` (handleRuntimeEvent), `GaplessMP3Player.swift:637-645` (handlePlaybackFailure)

**What happens:** `GaplessRuntimeEvent` carries no playback-session or generation token. `.playbackFailed(String)` carries only a description string — no source ID, no session ID. `.trackTransitioned` carries source references but the backend handler at line 651 does not check generation before mutating the snapshot.

Concrete scenario: play(trackA) starts, engine begins preparing. User quickly calls play(trackB) — backend increments generation, but the engine is still running trackA's pipeline. TrackA's prepare fails and the engine emits `.playbackFailed("timeout")`. The backend handler at line 654 reads `currentStreamable` (now trackB) and blames the failure on trackB. The user sees an error for a track that hasn't actually failed.

The same pattern applies to `.trackTransitioned`: if a stale transition from a superseded pipeline arrives after a new play has started, it overwrites `currentStreamable` at line 672 with a reference from the old pipeline.

**Why it matters:** This is the same bug family as F1 (pause-during-prepare) and F8 (setNext generation gap), but wider. Every runtime event callback is vulnerable. The generation system protects the backend's own async Tasks but does not protect against events originating from the engine's internal pipelines, which have no concept of backend generations.

**Recommended fix:** Either: (a) add a playback-session token to `GaplessRuntimeEvent` so the backend can reject stale events, or (b) check generation in every runtime event handler (requires the backend to stamp the generation when it issues a command and compare on callback), or (c) have the engine accept a cancellation token in `prepare()` that suppresses events from superseded pipelines.

---

### F5. Repeated seeks within the same generation can complete out of order — stale seek status overwrites newer position

**Severity:** HIGH
**Files:** `GaplessMP3PlayerBackend.swift:552-592` (seekOnQueue), `BackendSupport/GaplessMP3PlayerBackendSeekCommand.swift:3-46`

**What happens:** `seekOnQueue()` creates a `SeekCommandExecution` with the current `generation` and launches a Task. `shouldApplyResult()` (line 7-8 in SeekCommand) checks only `activeGeneration == generation`. If the user scrubs rapidly (seek to 30s, then seek to 90s) without a track change, both seeks share the same generation. Both Tasks call `player.seek()` and `player.status()` concurrently. If the first seek's status response arrives after the second seek's status response, it overwrites the snapshot with stale elapsed/duration data via `applyStatus()` at line 579.

The optimistic elapsed update at line 559-564 is correct (it immediately shows the latest scrub position), but the async status completion from the older seek can then regress the displayed position.

**Why it matters:** Users who scrub frequently (common in live music — jumping between jams) will see the progress bar jump backward after settling. The effect is transient (the next polling tick corrects it) but jarring and will happen on every rapid scrub sequence.

**Recommended fix:** Add a seek-request counter (separate from generation) to `SeekCommandExecution`. Only apply status from the most recent seek request. For example, store a monotonic `seekSequence` in the snapshot, increment it in `seekOnQueue`, capture it in the execution, and check it in `shouldApplyResult`.

---

### F6. Natural handoff leaves stale desiredNextStreamable — later next() can replay the current track *[from cross-review]*

**Severity:** HIGH
**Files:** `GaplessMP3PlayerBackend.swift:667-678` (trackTransitioned handler), `GaplessMP3PlayerBackend.swift:400-422` (setNextOnQueue), `GaplessMP3PlayerBackend.swift:497-533` (nextOnQueue)

**What happens:** When the engine fires `.trackTransitioned`, the handler at line 671-674 clears `nextStreamable` but does NOT clear `desiredNextStreamable`:
```swift
snapshotStore.withValue {
    $0.currentStreamable = currentStreamable
    $0.nextStreamable = nil  // cleared
    // desiredNextStreamable is NOT cleared
}
```
After handoff, `desiredNextStreamable` still holds the track that just became current. If the user then calls `next()`, `nextOnQueue()` at line 522 checks `snapshot.nextStreamable ?? snapshot.desiredNextStreamable` — it finds the stale desired-next (which is now the current track) and replays it.

**Why it matters:** After a natural track transition, the next manual skip can replay the track that just started instead of advancing or stopping. This is a queue-correctness bug that shows up during normal listening after a gapless handoff.

**Recommended fix:** Clear `desiredNextStreamable` in the `.trackTransitioned` handler. Or add an invariant that `desiredNextStreamable` can never equal `currentStreamable` after a transition.

---

### F7. Failed prepare leaves stale currentStreamable — downstream logic targets a dead track *[from cross-review]*

**Severity:** HIGH
**Files:** `GaplessMP3PlayerBackend.swift:309-313` (play commits identity), `GaplessMP3PlayerBackend.swift:375-386` (failure path)

**What happens:** `playOnQueue()` commits `currentStreamable = streamable` at line 313 before the async prepare begins. If prepare fails, the catch block at lines 376-386 sets `currentState = .Stopped` and emits an error, but does NOT clear `currentStreamable`, `nextStreamable`, or download identity fields. After the failure, `setNextOnQueue()`, `handleHTTPLogEvent()`, and `maybeEmitStreamingCacheCompletion()` still treat the failed source as the active track.

**Why it matters:** After a prepare failure (network error, invalid MP3), the backend is in `.Stopped` state but with a live `currentStreamable`. HTTP log events for the failed source still update download progress. If `setNext()` is called, it sees a current track and tries to apply next-track logic to a dead session.

**Recommended fix:** Clear `currentStreamable`, `nextStreamable`, `desiredNextStreamable`, and download byte fields in the failure path, matching the cleanup that `stopOnQueue()` does. Or commit `currentStreamable` only after prepare succeeds.

---

### F8. Temp files leak on HTTP session cancellation or interruption

**Severity:** CRITICAL
**Files:** `SourceCacheStore.swift:50`, `HTTPSourceSession.swift:199-243`, `MP3SourceManager.swift:301-307`

**What happens:** `SourceCacheStore.makeDownloadPaths()` creates a temp file at a UUID-based path. `HTTPSourceSession` writes to it during download. If the download is cancelled mid-stream (track change, stop, teardown, network loss), the `HTTPSourceSession` actor is deallocated but has no `deinit` — the temp file is never deleted. Each interrupted download leaves an orphaned `.download` file on disk.

**Why it matters:** Users who skip through tracks or have flaky networks accumulate temp files indefinitely. Over a long listening session (100+ track changes), this can consume significant disk space with no eviction or cleanup mechanism anywhere in the codebase.

**Recommended fix:** Add a deinit or explicit shutdown method to `HTTPSourceSession` that deletes `downloadPaths.tempFileURL` if `persistCompletedDownload()` was never called. Alternatively, have `MP3SourceManager` clean up the temp file when removing a session from `activeDownloads`.

---

### F9. Pending continuations in HTTPSourceSession hang forever on dealloc

**Severity:** CRITICAL
**Files:** `HTTPSourceSession.swift:28, 194-196`

**What happens:** `HTTPSourceSession` stores `CheckedContinuation` objects in `continuationWaiters` (line 28). These are resumed during normal stream execution via `resumeSatisfiedWaiters()` and `resumeAllWaiters()`. However, the actor has no `deinit`. If the actor is deallocated while continuations are pending (e.g., track change tears down the source manager mid-download), the continuations are never resumed.

**Why it matters:** Any `Task` awaiting one of these continuations will hang indefinitely. This is a silent deadlock. Swift's runtime will also emit a diagnostic warning about leaked continuations, but the awaiting task is stuck forever. In production, this manifests as playback that silently stops advancing — the coordinator's pipeline hangs waiting for data that will never arrive.

**Recommended fix:** Add a `shutdown()` method that resumes all pending continuations with `CancellationError`. Call it from `MP3SourceManager` when tearing down a source. Alternatively, use `withTaskCancellationHandler` at the call site so the continuation is resumed on cancellation.

---

### F10. setNext async task lacks proper generation gating

**Severity:** HIGH
**Files:** `GaplessMP3PlayerBackend.swift:391-434`

**What happens:** `setNextOnQueue()` captures `generation` at line 410 and checks it at lines 417 and 427 with direct `snapshotStore.get().generation == generation` comparisons. Unlike `playOnQueue()` — which uses `shouldContinueAsyncWork(for:)` at every critical await boundary (lines 339, 341, 344, 347, 350, 355, 377) — `setNextOnQueue` only checks generation twice: once before calling `player.setNext()` and once after. There is no check between the capture and the first await.

**Why it matters:** If `play(newTrack)` is called while `setNextOnQueue` is in flight, the play increments generation and clears desired-next state. The setNext task can still call `player.setNext()` with a stale source before its generation check fires. The engine receives a setNext for a source that the backend has already invalidated. While the next generation check will prevent the backend from applying the result, the engine has already done unnecessary work and may hold a stale source reference.

**Recommended fix:** Add a `shouldContinueAsyncWork(for:)` check immediately before `await player.setNext()` (between lines 416 and 417). This matches the discipline used in `playOnQueue`.

---

### F11. AudioSessionController.teardown() does not deactivate the audio session

**Severity:** HIGH
**Files:** `AudioSessionController.swift:225-229`

**What happens:** `teardown()` clears notification observers, removes remote command handlers, and calls `endReceivingRemoteControlEvents()`. It never calls `AVAudioSession.sharedInstance().setActive(false)`.

**Why it matters:** After teardown, the app continues to hold the audio session active. Other apps (Music, Podcasts) may be unable to reclaim audio focus until the app is terminated. This violates Apple's audio session best practices and can cause user-visible issues (other audio apps stay ducked or silent).

**Recommended fix:** Add `try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)` to teardown. The `notifyOthersOnDeactivation` option lets other apps know they can resume.

---

### F12. downloadDestination copy failure is silent

**Severity:** HIGH
**Files:** `GaplessMP3PlayerBackend.swift:999-1029`

**What happens:** `maybeEmitStreamingCacheCompletion()` copies the engine's cached file to the app's `downloadDestination` path (line 1015). If the copy fails (disk full, permission error), the error is caught at line 1024 and logged, but no failure callback is emitted to the delegate. The module and JS layer never learn that the offline download failed.

**Why it matters:** Users see the download as "complete" in the UI, but the file doesn't exist at the expected path. When they go offline and try to play the track, it fails. This is a user-facing data integrity issue for the offline listening feature.

**Recommended fix:** Emit an error event to the delegate on copy failure, or add a `streamingCacheFailed` callback to `PlaybackBackendDelegate`. At minimum, do not emit `onTrackStreamingCacheComplete` if the copy failed.

---

### F13. Engine cache has no eviction — resolved by session-scoped wipe

**Severity:** RESOLVED (was HIGH — addressed by Spec 3's session-scoped cache decision)
**Files:** `SourceCacheStore.swift` (entire file)

**What happens:** `SourceCacheStore` writes cached MP3 files to a persistent directory with no eviction mechanism. Every successfully downloaded track stays on disk forever.

**Resolution:** The engine cache is session-scoped: wiped on app launch (see Spec 3). Within a single session, unbounded growth is acceptable — a worst-case 4-hour listening session produces ~2-4 GB, which is cleared on the next launch. No LRU or size-based eviction is needed. Durable offline files live at `downloadDestination`, managed by the app's download system.

---

### F14. Temp files leak when cacheMode is disabled

**Severity:** MEDIUM
**Files:** `SourceCacheStore.swift:97-122`

**What happens:** When `cacheMode == .disabled`, `persistCompletedDownload()` returns the temp file URL (line 121) without promoting it to the cache directory. But it also doesn't delete it. The caller (`HTTPSourceSession`) doesn't delete it either. The temp file persists on disk indefinitely.

**Why it matters:** If the engine is used with caching disabled (e.g., for previews or low-storage mode), every completed download leaves a temp file. Less severe than F8 because this only affects completed downloads, but still leaks disk space.

**Recommended fix:** In the `.disabled` path, delete the temp file before returning, or return `nil` to signal that no persistent file was created.

---

### F15. Range-restart truncation can corrupt temp file state

**Severity:** MEDIUM
**Files:** `HTTPSourceSession.swift:216-232`, `URLSessionHTTPDataLoader.swift:406-417`

**What happens:** When a range-resume request gets a 200 response (server ignores the range), the code truncates the temp file to zero (line 220) and restarts the download. If the download task is cancelled between the truncate and writing enough replacement data, the temp file is left with incomplete data that doesn't match the original download state. `downloadedPrefixEnd` is reset to 0 (line 222), but if the session is then finalized, the cache validation logic may see an inconsistent file.

**Why it matters:** Corrupted cache entries can cause playback failures (garbled audio, decoder errors) that persist across app restarts because the cache record points to a truncated file.

**Recommended fix:** Write to a new temp file for restart attempts instead of truncating in place. Only replace the original temp file after the restart download completes successfully.

---

### ~~F16. (Retracted) GaplessPlaybackCoordinator playbackTask cancellation~~

**Severity:** Retracted (originally MEDIUM)
**Files:** `GaplessPlaybackCoordinator.swift:157-177, 181-190`

**Original claim:** Task cancellation is "non-terminating" because the task type is `Task<Void, Never>` and cannot propagate errors.

**Why retracted:** The task explicitly catches `CancellationError` at line 169 and returns. The inner `runPlayback` loop checks `try Task.checkCancellation()` at every chunk iteration in `drainProducer` (line 476), inside the backpressure sleep (line 481), and in `resolveNextProducer` (line 418). The `makeNextProducerTask` polling loop also checks (line 396). Cancellation propagates correctly through all these `throws` paths, is caught at the top-level `catch is CancellationError` (line 169), and exits the task. The `Task<Void, Never>` type is appropriate here — the do/catch converts all errors (including cancellation) into non-throwing returns, which is valid Swift concurrency.

---

### F17. Progress polling uses strong self capture in asyncAfter

**Severity:** MEDIUM
**Files:** `GaplessMP3PlayerBackend.swift:860-863`

**What happens:** `scheduleProgressPollingTickOnQueue()` uses `backendQueue.asyncAfter` with an implicit strong capture of `self`:
```swift
backendQueue.asyncAfter(deadline: .now() + .milliseconds(250)) {
    self.refreshProgressPollingTickOnQueue(for: generation)
}
```

**Why it matters:** The backend cannot be deallocated while any polling tick is scheduled (250-500ms window). After `teardown()`, the backend stays alive for up to one polling interval. During this window, `refreshProgressPollingTickOnQueue` fires, calls `await player.status()`, and accesses engine state that may be mid-teardown.

**Recommended fix:** Use `[weak self]` in the asyncAfter closure. The generation check inside `refreshProgressPollingTickOnQueue` will handle the nil case.

---

### F18. Progress polling guard has dead code

**Severity:** LOW
**Files:** `GaplessMP3PlayerBackend.swift:872-876`

**What happens:** The guard at line 872 checks `snapshot.progressPollingGeneration == generation`. Inside the else block (line 873), the code checks the same condition again. This inner check is always false (the outer guard already established inequality), making lines 873-875 dead code.

**Why it matters:** Functionally harmless — the polling loop still self-terminates correctly via the outer guard. But dead code in a state-management path is confusing and suggests the author intended a different cleanup behavior.

**Recommended fix:** Remove the inner check or restructure to express the intended cleanup logic.

---

### F19. Generation field lacks documentation

**Severity:** LOW (maintainability)
**Files:** `GaplessMP3PlayerBackend.swift:43`

**What happens:** `var generation: UInt64 = 0` in the Snapshot struct has no comment. Understanding the generation-based supersession pattern requires reading ~100 lines across `playOnQueue`, `shouldContinueAsyncWork`, and `PlaySupersessionState`.

**Why it matters:** The generation pattern is the most important correctness mechanism in the backend. A developer unfamiliar with the codebase might remove or weaken a generation check without understanding its purpose.

**Recommended fix:** Add a doc comment explaining the pattern: generation is incremented on each new play request and used to invalidate all in-flight async work from prior requests.

---

## Findings that were investigated and refuted

These were raised during review but verified to be non-issues:

- **"resume() doesn't validate play() success"**: Refuted. `ResumeCommandState.perform()` explicitly guards on the `play()` return value. If `play()` returns false, `updateStateToPlaying()` is never called.

- **"Progress polling loops accumulate over track changes"**: Refuted. The polling loop checks `progressPollingGeneration == generation` on every tick and self-terminates when the generation is stale. `startProgressPollingIfNeededOnQueue` only schedules a new loop if one isn't already active. Accumulation does not occur.

- **"Playback task cancellation is non-terminating" (originally F16)**: Retracted. The `Task<Void, Never>` playback task catches `CancellationError` at line 169 and returns. All inner loops (`drainProducer`, `resolveNextProducer`, `makeNextProducerTask`) check `try Task.checkCancellation()` at every iteration. Cancellation propagates correctly through throws paths.

---

## Architecture Assessment

### Strengths

1. **Command serialization is sound.** All public methods marshal onto `backendQueue`. The `enqueue*` pattern in `PlaybackBackend` is clean and the queue ownership is clear.

2. **Generation-based supersession is well-designed.** The pattern of incrementing a generation counter and checking it at await boundaries is effective and avoids the complexity of explicit task cancellation. Most critical paths (play, seek, stop) implement it correctly.

3. **Snapshot-based state management works.** The `BackendLockedValue<Snapshot>` pattern provides thread-safe reads for sync getters while keeping mutations serialized on `backendQueue`. This is the right approach for the Expo bridge constraint.

4. **Backend protocol seam is clean.** The `PlaybackBackend` protocol is minimal and well-defined. The module doesn't reach into backend internals. The boolean switch works as designed.

5. **AudioSessionController correctly extracts cross-backend audio session policy.** Remote commands and audio session setup are shared code, not duplicated. However, `PlaybackPresentationController` is still a 20-line stub (F2) — the spec's shared presentation controller has not been implemented yet.

### Weaknesses

1. **GaplessMP3PlayerBackend is a 1,192-line file with 7+ concerns.** It handles command routing, state management, audio session lifecycle, remote control handling, interruption handling, error translation, progress/download polling, and cache completion. This is the biggest maintainability risk in the codebase. The BackendSupport extraction helped but moved logic out without reducing coupling — the support files are only used by this one class.

2. **The engine lacks a cancellation/request-ID mechanism.** The backend tracks generations, but the engine (GaplessMP3Player, GaplessPlaybackCoordinator) is unaware of them. When the backend calls `player.prepare()` or `player.setNext()`, the engine has no way to know the request is stale. The backend must wait for the engine call to complete before checking generation, which means wasted work and delayed supersession.

3. **Resource cleanup in the engine layer relies on GC/dealloc rather than explicit lifecycle.** `HTTPSourceSession` has no shutdown method. `SourceReadSession` relies on deinit for FileHandle cleanup. Continuations are not cleaned up on actor dealloc. This is fragile — Swift actors don't guarantee prompt dealloc, especially when retain cycles or task references exist.

4. **The BASS backend code is still present but shares no code with the native backend.** During rollout this is correct (the spec says to keep both buildable), but it means the duplicated remote-command and interrupt-handling code in `RelistenGaplessAudioPlayer/AudioSession.swift` is a divergence risk. Any bug fix to `AudioSessionController` must be manually checked against the BASS path.

### File size report (files >200 lines)

| File | Lines | Assessment |
|------|-------|------------|
| GaplessMP3PlayerBackend.swift | 1,192 | Too large. Needs decomposition. |
| GaplessPlaybackCoordinator.swift | 739 | Large but focused on one concern (playback coordination). Acceptable. |
| GaplessMP3Player.swift | 734 | Large but serves as the engine API facade. Acceptable with better docs. |
| MP3SourceManager.swift | ~580 | Manages source lifecycle, downloads, seeks. Borderline. |
| RelistenAudioPlayerModule.swift | ~350 | Expo bridge. Acceptable given framework boilerplate. |
| PlaybackPresentationController.swift | 20 | Stub. Only sets playbackState. Needs full implementation (F2). |
| AudioSessionController.swift | ~230 | Shared session/remote logic. Acceptable. |

---

## Open Questions

1. ~~**Is the engine cache (`SourceCacheStore`) intended to be persistent across app sessions?**~~ **Resolved:** Session-scoped. Wiped on app launch. Eviction not needed (F13 addressed by Spec 3).

2. ~~**Cache key collision is confirmed, not hypothetical.**~~ **Resolved:** Cache key will derive from `sourceTrack.uuid` (Spec 3).

3. **Is `cacheMode == .disabled` ever used in production?** If so, F14 (temp file leak with disabled cache) needs a fix. If it's only for testing, it's low priority.

4. ~~**Has the engine been tested with sample rate or channel count changes between tracks?**~~ **Resolved:** PCMFormatNormalizer work is done, tracked separately from this review.

5. ~~**Audio session deactivation scope (F11).**~~ **Resolved:** `setActive(false)` only on full teardown, not on stop. Matches Spotify/music app behavior.

6. ~~**Artwork source for PlaybackPresentationController (F2).**~~ **Resolved:** Artwork URL comes from JS via streamable, same as BASS path. May need refactor of how it's plumbed through.

---

## Residual Risks

Even if all findings above are addressed, these risks remain:

1. **Memory pressure during long sessions.** PCM prefetch buffers (~4 MB per track, ~8 MB with next-track prefetch) are held in memory. On low-memory devices with background app pressure, this could trigger jetsam kills. No memory pressure handling is implemented.

2. **Audio engine lifecycle across app backgrounding.** The `PCMOutputGraph` (AUAudioUnit-based) must survive app suspension and resume correctly. iOS can reclaim audio units from backgrounded apps. No recovery path for this scenario was found in the review.

3. **Seek into unbuffered regions under poor network.** A seek past the buffered prefix triggers a range request. If the server returns 416 (Range Not Satisfiable) or the network drops during the range read, the error path may not cleanly recover to "stalled" state. This needs targeted testing.

4. **Rapid track changes during engine prepare.** While the generation pattern prevents stale results from applying, the engine still does the full prepare work before the backend can discard the result. Under rapid skipping (e.g., user holds the "next" button), the engine queues up multiple heavy prepare operations that compete for CPU and network.

5. **Thread safety of queue-local state in GaplessMP3PlayerBackend.** Properties like `wasPlayingWhenInterrupted` and `hasInstalledAudioSessionHandlers` (lines 83-85) are accessed without locks, relying on `backendQueue` serialization. This is correct but undocumented and fragile — any future code that accesses these off-queue creates a data race.

---

## Summary

The migration architecture is sound. The protocol seam, generation-based supersession, and shared controllers are well-designed and the direction is right.

**Three blockers prevent flipping the selector to `true`:**
- **F1 (pause during prepare):** User-facing bug where pause is overridden by in-flight prepare completion. Will happen on every slow-connection play+pause sequence.
- **F2 (presentation controller is a stub):** Lock screen, Control Center, CarPlay, and Bluetooth displays show no track metadata. Immediately visible regression.
- **F3 (ephemeral cache keys):** Engine cache is functionally useless — every play is a fresh HTTP download. Wastes bandwidth and fills disk.

**Seven high-severity issues to fix before production confidence:**
- F4 (stale runtime events without session tokens), F5 (seek supersession within same generation), F6 (stale desiredNextStreamable after handoff), F7 (stale currentStreamable after failed prepare), F8 (temp file leaks), F9 (hung continuations), F10 (setNext generation gap).

**The underlying theme across F1, F4, F5, F10 is one structural gap:** the engine has no concept of backend command generations or playback-session tokens. The backend's generation system protects its own async Tasks, but cannot protect against events originating from the engine's internal pipelines. Fixing the individual symptoms (pause flag, seek counter, setNext gate) is necessary but not sufficient — the engine-to-backend event boundary needs a session-identity mechanism.

**Resource lifecycle is the second deepest risk area.** The engine layer relies on GC/dealloc for cleanup rather than explicit lifecycle management. Temp files, continuations, and source sessions can all leak during normal track-change sequences. These won't crash the app but will degrade long listening sessions.

The biggest maintainability concern is the 1,192-line `GaplessMP3PlayerBackend` — it works but will be increasingly difficult to modify and review as the feature matures.

---

## Implementation Readiness Assessment

This document is sufficient to drive localized fixes for:
- F1 (add pause/transport-state check in play Task)
- F2 (implement full presentation controller)
- F3 (derive cacheKey from stable source identity)
- F5 (add seek-request counter)
- F6 (clear desiredNextStreamable at handoff)
- F7 (clear currentStreamable on prepare failure)
- F8-F9 (add deinit/shutdown to HTTPSourceSession)
- F11 (add setActive(false) to teardown)
- F12 (don't emit cache-complete on copy failure)

---

## Implementation Spec 1: Command Supersession and Stale Event Filtering

**Covers:** F1 (pause during prepare), F4 (stale runtime events), F5 (seek supersession), F10 (setNext generation gap)

### Design: four independent mechanisms, each solving one problem

1. **`generation`** (existing) — for backend-owned async work (`playOnQueue`, `setNextOnQueue`, `seekOnQueue`, reset flows, polling). Already works. Needs minor tightening (F10).
2. **`sessionID`** (new, engine API change) — a real per-session identity carried by runtime and HTTP events from the engine. The clean fix for F4 (stale `playbackFailed`, `trackTransitioned`, HTTP callbacks).
3. **`desiredTransport`** (new, backend-only) — prevents in-flight prepare from overriding pause/stop. The clean fix for F1.
4. **`seekSequence`** (new, backend-only) — prevents out-of-order seek completions within the same generation. The clean fix for F5. Does not grow into a general command token.

### Command/Session Invariant Table

This table is the single source of truth for which operations change generation, which callbacks must be filtered, and which state survives supersession.

#### Operations that mint a new generation

| Operation | Mints generation? | Sets new sessionID on engine? | Resets seekSequence? |
|-----------|-------------------|------------------------------|---------------------|
| `playOnQueue()` | **Yes** | **Yes** | **Yes** (to 0) |
| `stopOnQueue()` | **Yes** | **Yes** (to nil) | **Yes** (to 0) |
| `nextOnQueue()` (when stopping) | **Yes** (via NextCommandState) | **Yes** | **Yes** (to 0) |
| `handleMediaServicesResetOnQueue()` | **Yes** | **Yes** | **Yes** (to 0) |
| `pauseOnQueue()` | No | No | No |
| `resumeOnQueue()` | No | No | No |
| `seekOnQueue()` | No | No | No (increments seekSequence) |
| `setNextOnQueue()` | No | No | No |

#### Callbacks that must be filtered

| Callback source | Filter mechanism | What happens if stale |
|----------------|-----------------|----------------------|
| `runtimeEventHandler` (engine → backend) | `event.sessionID != currentSessionID` | Event silently dropped |
| `httpLogHandler` (engine → backend) | `event.sessionID != currentSessionID` | Event silently dropped |
| `playOnQueue` Task completion | `shouldContinueAsyncWork(for: generation)` + `desiredTransport` check | Task result discarded |
| `setNextOnQueue` Task completion | `snapshotStore.get().generation == generation` | Task result discarded |
| `seekOnQueue` Task completion | `shouldApplyResult(activeGeneration:, currentSeekSequence:)` | Status update discarded |

#### State that survives supersession (NOT cleared on new generation)

| State field | Why it survives |
|-------------|----------------|
| `volume` | User preference, not tied to a track |
| `desiredTransport` | Set by the new command, not inherited from old |

#### State that must be cleared on new generation

| State field | Cleared by |
|-------------|-----------|
| `currentStreamable` | Set to new value in `playOnQueue`, cleared in `stopOnQueue` |
| `nextStreamable` | Cleared in `playOnQueue`, `stopOnQueue` |
| `desiredNextStreamable` | Cleared in `playOnQueue`, `stopOnQueue`, and `.trackTransitioned` handler |
| `currentDuration`, `elapsed` | Reset in `playOnQueue`, cleared in `stopOnQueue` |
| `activeTrackDownloadedBytes`, `activeTrackTotalBytes` | Reset in `playOnQueue`, cleared in `stopOnQueue` |
| `isPreparingCurrentTrack` | Reset in `playOnQueue` |
| `progressPollingGeneration` | Set to new generation in `startProgressPollingIfNeededOnQueue` |
| `seekSequence` | Reset to 0 on new generation |
| `pendingStartTimeAfterPrepare` | Cleared in `playOnQueue`, `stopOnQueue` |

### Changes to Snapshot

```swift
private struct Snapshot {
    // existing fields...
    var generation: UInt64 = 0
    var seekSequence: UInt64 = 0              // NEW: monotonic, incremented per seek
    var desiredTransport: DesiredTransport = .stopped  // NEW
    var currentSessionID: String?             // NEW: matches engine's sessionID
}

private enum DesiredTransport {
    case playing, paused, stopped
}
```

### F1 fix: desiredTransport field

**Where to change:** `GaplessMP3PlayerBackend.swift`

| Method | Sets desiredTransport to |
|--------|--------------------------|
| `playOnQueue()` | `.playing` |
| `pauseOnQueue()` | `.paused` |
| `stopOnQueue()` | `.stopped` |
| `resumeOnQueue()` | `.playing` |

In `playOnQueue()`, the Task at line 348 currently calls `player.play()` unconditionally. Change to:

```swift
guard self.shouldContinueAsyncWork(for: generation) else { return }
guard self.snapshotStore.get().desiredTransport == .playing else { return }  // NEW
_ = self.player.play()
```

Same pattern in `handleMediaServicesResetOnQueue()` at line 1143: check `desiredTransport == .playing` before calling `player.play()`.

When prepare finishes and `desiredTransport == .paused`, the backend should NOT call `player.play()`. The track is prepared and ready — `resume()` will start it later.

### F4 fix: engine sessionID

**This is an engine API change.** The engine gains a `sessionID` property that it stamps onto all events it emits. The backend sets it whenever it mints a new generation and checks it on incoming events.

#### Engine-side changes

**Where to change:** `Events.swift`, `GaplessMP3Player.swift`, `MP3SourceManager.swift`

Add `sessionID` to both event types in `Events.swift`:

```swift
public enum GaplessRuntimeEvent: Sendable {
    case playbackFailed(String, sessionID: String?)
    case networkRetrying(String, sessionID: String?)
    case trackTransitioned(previous: GaplessPlaybackSource?, current: GaplessPlaybackSource?, sessionID: String?)
    case playbackFinished(last: GaplessPlaybackSource?, sessionID: String?)
}

public struct GaplessHTTPLogEvent: Sendable {
    // ... existing fields ...
    public var sessionID: String?   // NEW
}
```

Add a `sessionID` property to `GaplessMP3Player`:

```swift
// GaplessMP3Player.swift — add to CallbackConfiguration or as a top-level locked property:
public var sessionID: String? {
    get { callbackConfiguration.get().sessionID }
    set { callbackConfiguration.withValue { $0.sessionID = newValue } }
}
```

**Critical: capture sessionID at pipeline start, not at delivery time.** The sessionID must be captured when `startPipeline()` creates its closures, so that events from an old pipeline carry the old session's identity even if a new session has since started.

There are three event emission paths. Each must capture sessionID at creation time:

**Path 1: Runtime events from GaplessMP3Player itself** (playbackFailed, playbackFinished, trackTransitioned)

These are emitted from closures created in `startPipeline()` (line 378) — `playbackFailed:`, `playbackFinished:`, and from `applyPendingTrackTransitionIfNeededOnPlaybackQueue`. Capture sessionID when creating the pipeline:

```swift
private func startPipeline(at startTime: TimeInterval) async throws {
    let capturedSessionID = self.sessionID  // capture once at pipeline start

    // Create per-session event bridges that stamp the captured sessionID
    await coordinator.setRuntimeEventHandler { [weak self] event in
        self?.deliverRuntimeEvent(event.withSessionID(capturedSessionID))
    }
    await coordinator.setHTTPLogHandler { [weak self] event in
        var stamped = event
        stamped.sessionID = capturedSessionID
        self?.deliverHTTPLogEvent(stamped)
    }

    try await coordinator.startPlayback(
        // ... existing parameters ...
        playbackFinished: { [weak self] in
            guard let self else { return }
            await self.handlePlaybackFinished(sessionID: capturedSessionID)
            await self.promoteCoordinatorTransitionIfNeeded()
        },
        playbackFailed: { [weak self] error in
            guard let self else { return }
            await self.handlePlaybackFailure(error, sessionID: capturedSessionID)
        }
    )
}
```

Update `handlePlaybackFinished` and `handlePlaybackFailure` to accept and pass through sessionID:

```swift
private func handlePlaybackFinished(sessionID: String?) async {
    // ... existing logic ...
    if case let .finished(lastSource) = outcome {
        deliverRuntimeEvent(.playbackFinished(last: lastSource, sessionID: sessionID))
    }
}

private func handlePlaybackFailure(_ error: Error, sessionID: String?) async {
    // ... existing logic ...
    deliverRuntimeEvent(.playbackFailed(String(describing: error), sessionID: sessionID))
}
```

For `trackTransitioned` (emitted from `applyPendingTrackTransitionIfNeededOnPlaybackQueue` at line 489): this runs on the playback queue during an active pipeline. Store the captured sessionID in a playback-queue-local field (e.g., `activePipelineSessionID`) set at the start of `startPipeline`, and use it when emitting:

```swift
self.deliverRuntimeEvent(.trackTransitioned(
    previous: previousSource,
    current: state.currentSource,
    sessionID: self.activePipelineSessionID
))
```

**Path 2: Runtime events from MP3SourceManager** (networkRetrying)

These are emitted via the `runtimeEventHandler` closure on the source manager. The closure is set by `coordinator.setRuntimeEventHandler()` which is called from `startPipeline()`. Since the per-session bridge closure created above already stamps `capturedSessionID`, events from source sessions are correctly identified. No source manager changes needed beyond accepting the new event signatures.

**Path 3: HTTP log events from MP3SourceManager**

Same as Path 2 — the `httpLogHandler` closure set from `startPipeline()` stamps `capturedSessionID`. Source manager calls `httpLogHandler?(event)` and the bridge adds the sessionID.

**Why capture at pipeline start?** `startPipeline()` is called once per play command. The closures it creates live for the duration of that pipeline. A stale pipeline's closures carry the old sessionID. A new `startPipeline()` call creates new closures with the new sessionID. There is no shared mutable state — the identity is baked into the closure at creation time.

`deliverRuntimeEvent` and `deliverHTTPLogEvent` themselves do NOT stamp sessionID — they pass through whatever sessionID the event already carries.

#### Backend-side changes

**Where to change:** `GaplessMP3PlayerBackend.swift`

In `playOnQueue()`, after incrementing generation:

```swift
let sessionID = UUID().uuidString
snapshotStore.withValue { $0.currentSessionID = sessionID }
player.sessionID = sessionID
```

In `stopOnQueue()`, after incrementing generation:

```swift
snapshotStore.withValue { $0.currentSessionID = nil }
player.sessionID = nil
```

Same pattern in `nextOnQueue()` (when stopping/restarting) and `handleMediaServicesResetOnQueue()`.

In `handleRuntimeEvent`, add a session check at the top:

```swift
private func handleRuntimeEvent(_ event: GaplessRuntimeEvent) {
    guard event.sessionID == snapshotStore.get().currentSessionID else { return }
    // ... existing handler logic ...
}
```

Same pattern in `handleHTTPLogEvent`:

```swift
private func handleHTTPLogEvent(_ event: GaplessHTTPLogEvent) {
    guard event.sessionID == snapshotStore.get().currentSessionID else { return }
    // ... existing handler logic ...
}
```

The one-time handler setup at init (line 92) stays as-is — no handler swapping needed. The handlers are installed once and filter by sessionID.

**Additional guard in handleRuntimeEvent:** For `.playbackFailed`, also verify `currentState != .Stopped` before blaming the current streamable, as a defense-in-depth measure.

### F5 fix: seek sequence counter

**Where to change:** `GaplessMP3PlayerBackend.swift` seekOnQueue, `BackendSupport/GaplessMP3PlayerBackendSeekCommand.swift`

In `seekOnQueue()` (line 552), increment `seekSequence` and capture it:

```swift
private func seekOnQueue(to time: TimeInterval) {
    let seekSeq = snapshotStore.withValue { snapshot -> UInt64 in
        snapshot.seekSequence += 1
        return snapshot.seekSequence
    }
    let state = SeekCommandState(
        hasCurrentTrack: snapshotStore.get().currentStreamable != nil,
        currentDuration: snapshotStore.get().currentDuration,
        requestedTime: time,
        activeGeneration: snapshotStore.get().generation,
        seekSequence: seekSeq  // NEW
    )
    // ...
}
```

In `SeekCommandExecution.shouldApplyResult`:

```swift
func shouldApplyResult(activeGeneration: UInt64, currentSeekSequence: UInt64) -> Bool {
    activeGeneration == generation && currentSeekSequence == seekSequence
}
```

At the call site (line 578): `guard execution.shouldApplyResult(activeGeneration: ..., currentSeekSequence: self.snapshotStore.get().seekSequence) else { return }`

Also reset `seekSequence` to 0 in `playOnQueue()` and `stopOnQueue()` when generation increments, so the counter doesn't grow unbounded across tracks.

### F10 fix: pre-await generation check in setNextOnQueue

**Where to change:** `GaplessMP3PlayerBackend.swift` setNextOnQueue, line 413

Add a generation check before the first await:

```swift
Task { [weak self] in
    guard let self else { return }
    do {
        guard self.snapshotStore.get().generation == generation else { return }  // NEW
        try await self.player.setNext(streamable.map(self.makePlaybackSource(from:)))
        // ... existing generation checks after await ...
```

---

## Implementation Spec 2: Source Ownership and Cancellation

**Covers:** F8 (temp file leaks), F9 (hung continuations), F14 (disabled-cache temp leak)

### Design decisions
- Current and next source sessions may live
- Stop, pause, and seek preserve source sessions
- Teardown shuts down all sessions immediately
- Temp files are cleaned up on session shutdown, failure, and app launch
- No heuristic eviction (no "max N / oldest" logic). Ownership is explicit: current, next, or dead.

### HTTPSourceSession: add explicit shutdown

**Where to change:** `HTTPSourceSession.swift`

```swift
// Add to HTTPSourceSession actor:
func shutdown() {
    streamTask?.cancel()
    streamTask = nil
    resumeAllWaiters(with: CancellationError())
    // Clean up temp file if download didn't complete
    if !isComplete {
        try? FileManager.default.removeItem(at: downloadPaths.tempFileURL)
    }
}
```

This covers F9 (hung continuations) and F8 (temp file cleanup).

### MP3SourceManager: enforce session bounds and teardown

**Where to change:** `MP3SourceManager.swift`

Add a `shutdown()` method:

```swift
func shutdown() async {
    for session in activeDownloads.values {
        await session.shutdown()
    }
    activeDownloads.removeAll()
    transientStatuses.removeAll()
}
```

**Do not call `shutdown()` from `stopPlayback()`.** See the teardown split table below — `stopPlayback()` is used by pause, seek, and play-restart, all of which must preserve source sessions. `shutdown()` is only called from the new `coordinator.teardown()` path (see below).

No heuristic session eviction (no "max N / oldest" logic). Source sessions live as long as they are current or next. Orphaned sessions are cleaned up on teardown and on app-launch scavenge. If bounded eviction becomes a product requirement later, it can be added as a follow-up with explicit ordering metadata — but it is not needed for correctness.

### SourceCacheStore: disabled-cache temp cleanup

**Where to change:** `SourceCacheStore.swift` persistCompletedDownload

For F14, in the `cacheMode == .disabled` branch (line 119-121), the temp file is returned as the resolved file but never cleaned up. Since the engine cache is session-scoped (see Spec 3), this is acceptable within a session — the file is needed for playback. But add cleanup on app launch (see Spec 3).

### Important: `stopPlayback()` vs. source teardown are different operations

`GaplessPlaybackCoordinator.stopPlayback()` is called from five sites:

| Caller | Purpose | Should shut down sources? |
|--------|---------|---------------------------|
| `coordinator.startPlayback()` (line 151) | Cancel old playback task before starting new one | **No** — reuses sessions for the new track |
| `GaplessMP3Player.stop()` (line 255) | Explicit stop | **No** — user decision says allow downloads to finish on stop |
| `GaplessMP3Player.seek()` (line 280) | Stop-then-restart for seek | **No** — same track, same session |
| `GaplessMP3Player.pause()` (line 456) | Cancel decode loop while paused | **No** — track will resume |
| `GaplessMP3Player.teardown()` (if added) | Full engine shutdown | **Yes** |

**Do NOT add `sourceManager.shutdown()` to `stopPlayback()`.** That method is a playback-task lifecycle operation, not a source-ownership operation. Adding source shutdown there would break pause, seek, and play-restart.

### GaplessPlaybackCoordinator: add a separate `teardownSources()` method

**Where to change:** `GaplessPlaybackCoordinator.swift`

```swift
/// Full teardown: cancels playback AND shuts down all source sessions.
/// Only called during engine teardown, not during normal stop/pause/seek.
func teardown() async {
    stopPlayback()
    await sourceManager.shutdown()
}
```

This is the only path that calls `sourceManager.shutdown()`. All other callers continue using `stopPlayback()` which preserves source sessions.

### GaplessMP3Player: wire teardown

**Where to change:** `GaplessMP3Player.swift`

Add a `teardown()` method (or modify the existing `stop()` + deinit path) that calls through to coordinator teardown:

```swift
public func teardown() async {
    await performOnPlaybackQueue {
        self.stopOutputGraphOnPlaybackQueue()
        // ... clear all state (same as stop) ...
    }
    await coordinator.teardown()  // NOT coordinator.stopPlayback()
}
```

### GaplessMP3PlayerBackend: wire teardown

**Where to change:** `GaplessMP3PlayerBackend.swift` teardown

The backend's `teardown()` should call `player.teardown()` (not `player.stop()`). This is the only path that triggers source session shutdown and temp file cleanup.

### App-launch scavenge

**Where to change:** `GaplessMP3PlayerBackend.swift` init, or `SourceCacheStore.swift`

Add a one-time cleanup of the temp directory on engine init:

```swift
// In SourceCacheStore.init or a new method:
func scavengeTempFiles() {
    guard let contents = try? fileManager.contentsOfDirectory(at: tempDirectory, includingPropertiesForKeys: nil) else { return }
    for file in contents {
        try? fileManager.removeItem(at: file)
    }
}
```

Call from `GaplessMP3Player.init()` or `MP3SourceManager.init()`.

---

## Implementation Spec 3: Cache Lifecycle

**Covers:** F3 (ephemeral cache keys), F13 (unbounded cache growth)

### Design decisions
- Engine cache is session-scoped: wiped on app launch
- Cache key derived from `sourceTrack.uuid` (stable, matches `downloadedFileLocation()` pattern)
- No eviction needed since cache is wiped on launch
- `downloadDestination` is the only durable storage (managed by the app's download system)

### Stable cache key

**Where to change:** `relisten/player/relisten_player_queue.tsx` toStreamable(), `modules/relisten-audio-player/ios/RelistenAudioPlayerModule.swift`

Option A (JS-side, preferred): Add a `cacheKey` field to `RelistenStreamable` and populate it from `sourceTrack.uuid`:

```typescript
// In toStreamable():
return {
    identifier: this.identifier,        // ephemeral queue ID, unchanged
    url,
    cacheKey: this.sourceTrack.uuid,     // NEW: stable key for engine cache
    title: this.title,
    // ...
};
```

Add `cacheKey` to the Expo `RelistenStreamable` record, pass it through `RelistenGaplessStreamable`, and use it in `makePlaybackSource`:

```swift
// GaplessMP3PlayerBackend.swift makePlaybackSource:
private func makePlaybackSource(from streamable: RelistenGaplessStreamable) -> GaplessPlaybackSource {
    GaplessPlaybackSource(
        id: streamable.identifier,           // queue-scoped ID for event matching
        url: streamable.url,
        cacheKey: streamable.cacheKey,        // CHANGED: stable source UUID
        headers: [:],
        expectedContentLength: nil
    )
}
```

Option B (native-side fallback): If adding a field to the Expo record is undesirable, derive the cache key from the URL by hashing it. Less clean but zero JS changes.

**Recommendation:** Option A. It's 3 lines of JS, 1 line of Swift, and aligns with `downloadedFileLocation()`.

### Session-scoped cache wipe

**Where to change:** `SourceCacheStore.swift` or `MP3SourceManager.init()`

Add a method and call it at engine initialization:

```swift
// SourceCacheStore:
func wipeCacheDirectory() {
    try? fileManager.removeItem(at: cacheDirectory)
    try? ensureDirectories()
}
```

Call from `MP3SourceManager.init()`. This clears all cached MP3s, index records, and temp files from the previous session. The cache is rebuilt during the current session as tracks are streamed.

**Why wipe-on-launch is sufficient:** The engine cache is a streaming buffer, not a durable offline store. Durable offline files live at `downloadDestination` (managed by the app's download manager). Users who re-listen to a track within the same session get cache hits. Users who relaunch the app pay a fresh download, which is acceptable for a streaming buffer.

---

## Implementation Spec 4: PlaybackPresentationController (F2 — now-playing metadata)

**Covers:** F2 (lock screen, Control Center, CarPlay, Bluetooth show no track metadata)

This is a user-visible regression fix, not a decomposition task. The existing `PlaybackPresentationController` stub (20 lines) needs to become a real now-playing controller. This does NOT require extracting polling/emission from the backend — it adds the missing metadata writes alongside the existing `setPlaybackState` call.

### What to implement

**Where to change:** `PlaybackPresentationController.swift`

Add methods for the backend to call when track or progress changes:

```swift
final class PlaybackPresentationController {
    func setPlaybackState(_ state: PlaybackState)          // existing
    func updateNowPlaying(
        title: String?,
        artist: String?,
        album: String?,
        duration: TimeInterval?,
        elapsed: TimeInterval?,
        rate: Float,
        artworkURL: URL?
    )
    func clearNowPlaying()
    func teardown()
}
```

`updateNowPlaying` writes to `MPNowPlayingInfoCenter.default().nowPlayingInfo`. Use the BASS implementation in `RelistenGaplessAudioPlayer/PlaybackUpdates.swift:12-70` as the reference for which `MPMediaItemProperty` keys to set and how artwork fetching works. Artwork URL comes from JS via the streamable — the backend passes it through.

`clearNowPlaying` sets `nowPlayingInfo = nil`. Called from `teardown()` and when transitioning to `.Stopped`.

`teardown()` calls `clearNowPlaying()`.

**Where to call from:** `GaplessMP3PlayerBackend.swift`

- Call `updateNowPlaying(...)` after successful prepare (when `currentStreamable` is set and state transitions to `.Playing`)
- Call `updateNowPlaying(...)` on progress polling ticks to update elapsed time
- Call `clearNowPlaying()` in `stopOnQueue()` and `teardown()`

### Phase 2 (follow-up, not part of this stabilization pass): Backend Decomposition

After the correctness fixes are verified on device, the backend can be decomposed:
- Remote command handlers → `AudioSessionController` delegate pattern
- Polling/emission → `PlaybackPresentationController`
- Estimated reduction: ~250 lines from `GaplessMP3PlayerBackend.swift`

This is tracked separately because it is a refactor, not a correctness fix, and should not be interleaved with lifecycle bug fixes.

---

## Implementation Spec 5: Verification Matrix

**Covers:** Long-running playback, rapid track changes, scrubbing, interruptions, offline transitions

All scenarios are manual on-device tests unless marked otherwise. Pass/fail criteria are binary — the scenario either produces the expected result or it doesn't.

### Category 1: Rapid track changes (stress supersession)

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 1.1 | Rapid play supersession | Tap play on 5 different tracks in <2 seconds | Only the last track plays. No errors shown for intermediate tracks. Lock screen shows last track's metadata. |
| 1.2 | Play then immediate pause | Tap play, then tap pause within 1 second (before buffering completes) | Audio never starts. State is Paused. Resume later starts audio. |
| 1.3 | Play then immediate stop | Tap play, then tap stop within 1 second | Audio never starts. State is Stopped. No stale events appear. |
| 1.4 | setNext during prepare | Start a track, immediately queue a next track, then queue a different next track before current finishes preparing | The second queued next-track wins. Natural handoff plays the second choice. |
| 1.5 | next() with no next | Let a track play, don't queue a next, tap skip | Playback stops cleanly. State is Stopped. No crash or replay. |
| 1.6 | 50-track skip marathon | Skip through 50 tracks rapidly (hold next button) | No crash. Memory stable (check Instruments). No orphaned progress updates in console. Final track plays correctly. |

### Category 2: Seek stress (scrubbing)

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 2.1 | Rapid scrub | Drag the scrubber rapidly back and forth 10 times within 3 seconds | Progress bar settles on the final scrub position. No backward jumps after settling (allow <500ms). |
| 2.2 | Seek while paused | Pause, scrub to a new position | Position updates immediately. Audio does NOT resume. Resume plays from the new position. |
| 2.3 | Seek to 100% | Scrub to 100% or call seekTo(1.0) | Advances to next track (or stops if no next). Does not seek to file end. |
| 2.4 | Seek past buffered region | Start an HTTP track, immediately seek to 80% before buffering reaches that point | Playback stalls briefly, range request fetches data, playback resumes at 80%. |

### Category 3: Long session (4+ hours simulated)

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 3.1 | Memory stability | Play through 100+ tracks (mix of HTTP and cached) using a playlist or auto-advance. Monitor in Instruments. | Memory stays within 50 MB of baseline. No monotonic growth. |
| 3.2 | Disk stability | Same as 3.1. Check temp directory and cache directory sizes afterward. | Temp directory is empty (all completed or cleaned up). Cache directory size < 2 GB (reasonable for 100 tracks). |
| 3.3 | Progress polling stability | Same as 3.1. Monitor console for polling-related logs. | No duplicate polling loops. Polling stops on pause/stop, restarts on play/resume. |

### Category 4: Gapless handoff

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 4.1 | HTTP → HTTP | Play two consecutive HTTP tracks | Audio is continuous at handoff. One `trackChanged(A, B)` event. Elapsed resets for track B. |
| 4.2 | HTTP → local | Play an HTTP track, queue a local/offline track as next | Handoff is continuous. No stale desiredNextStreamable after handoff (verify: manual next() after handoff does NOT replay track B). |
| 4.3 | Local → HTTP | Play a local track, queue an HTTP track as next | Handoff is continuous. |
| 4.4 | Queue end | Play last track in queue with no next | Track finishes. `trackChanged(last, nil)` fires. State is Stopped. |

### Category 5: Interruptions and route changes (device-only)

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 5.1 | Bluetooth disconnect | Play audio via Bluetooth, disconnect the headphones | Audio pauses. Lock screen shows Paused. |
| 5.2 | Phone call interruption | Play audio, receive a phone call, end the call | Audio pauses during call. Resumes after call if system provides shouldResume hint. |
| 5.3 | Lock screen controls | Play audio, lock phone | Lock screen shows title, artist, album, artwork, elapsed, duration. Play/pause/skip/scrub all work. |
| 5.4 | CarPlay display | Connect to CarPlay, play audio | Now-playing metadata appears on CarPlay display. |
| 5.5 | Media services reset | Trigger media services reset (rare, can use Instruments) | Playback rebuilds from current position. No crash. |

### Category 6: Offline and cache

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 6.1 | Streaming cache completion | Play an HTTP track with streaming cache enabled. Wait for completion. | `onTrackStreamingCacheComplete` fires. File exists at `downloadDestination`. |
| 6.2 | Cache copy failure | Play an HTTP track, make `downloadDestination` directory read-only beforehand | Error is reported (after F12 fix). `onTrackStreamingCacheComplete` does NOT fire. |
| 6.3 | App relaunch cache wipe | Play 5 HTTP tracks. Force quit and relaunch. Check engine cache directory. | Cache directory is empty (or freshly created). No stale temp files. |
| 6.4 | Same-track cache reuse within session | Play a track to completion. Navigate away and play the same track again. | Second play uses cached data (observable: no HTTP request in console, instant duration). |
| 6.5 | Local-file playback offline | Enable airplane mode. Play a downloaded offline track. | Plays immediately from local file. No network errors. |

### Measurement tools

- **Memory:** Instruments → Allocations or Leaks. Baseline after first track, check after 100th.
- **Disk:** `ls -la` on `NSTemporaryDirectory()/GaplessMP3PlayerCache/` and its `temp/` subdirectory.
- **Polling:** `NSLog` grep for `refreshProgressPollingTickOnQueue` (add a log if needed during testing, remove after).
- **Events:** Console.app filtered to `relisten-audio-player` to verify event ordering and generation filtering.
