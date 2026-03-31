# iOS Engine Migration: Implementation Agent Prompt

## How to use

Each task below is a self-contained unit of work. Run them in order (dependencies flow downward). For each task, spawn an agent with the prompt template below, filling in the task-specific section.

After each task completes, the agent should:
1. Verify the build succeeds
2. Update the progress tracker at the bottom of this file
3. Commit with a descriptive message

## Prompt template

```
You are implementing the iOS native playback-engine migration incrementally from the tracked implementation plan.

## Primary docs

Read these files before doing anything:
- `docs/ios-engine-implementation-prompt.md`
- `docs/ios-playback-engine-review-2026-03-31.md`
- `docs/specs/2026-03-30-ios-gapless-engine-integration.md`

The implementation tracker in `docs/ios-engine-implementation-prompt.md` is the task source of truth. Work from it in order unless a dependency or a concrete blocker requires a different sequence.

## Your task

{TASK_DESCRIPTION}

## Rules

1. **Read before writing.** Read every file you will modify in full before making changes. If the task touches a lifecycle boundary, also read adjacent owners of that lifecycle.
2. **Work incrementally.** Pick exactly one incomplete tracker task. Do not combine tracker tasks unless the tracker explicitly bundles them.
3. **Follow the docs, but use judgment.** Treat the review doc and tracker as the plan of record. If they contradict code reality, stop, explain the contradiction concretely, and add a blocker note instead of inventing a redesign.
4. **Minimal coherent change.** Only change what the task requires. Do not refactor adjacent code or broaden scope unless the current task cannot be solved cleanly without it.
5. **Keep the design simple.** Prefer the smallest fix that really solves the bug. Do not introduce extra state machines, helper layers, or abstractions unless the task requires them.
6. **Engine API boundary.** If your task touches the engine layer (`GaplessMP3Player`, coordinator, source manager, HTTP sessions), keep the API clean and context-independent. Backend-specific concepts must not leak into the engine unless the task explicitly requires an engine API change.
7. **Code quality bar.** Keep code clean, DRY, and SRP-friendly. If a small helper or focused extraction makes the changed code easier to understand, do it. Do not casually grow already-large files with duplicated lifecycle logic.
8. **Comments must be useful.** Add brief, high-signal comments only for non-obvious invariants, ownership rules, session/generation behavior, or cleanup logic. Do not add tutorial comments or comments that just restate code.
9. **Tests must be high signal.** Add or update tests when the behavior can be meaningfully verified. Prefer targeted tests that lock the bug or invariant being fixed. Do not add shallow tests that only mirror implementation shape. If a meaningful automated test is not practical, say why and provide exact manual verification instead.
10. **Review your own work before declaring done.** Do a fresh pass focused on correctness, regressions, lifecycle/resource cleanup, race conditions, unnecessary complexity, comment quality, and test quality.
11. **Build verification.** After making changes, run: `cd modules/relisten-audio-player && xcodebuild -scheme RelistenAudioPlayerBackendSupport -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -20` to verify the package-local support target still compiles for iOS Simulator. If it fails, fix the issue before proceeding.
12. **Commit.** Stage only the files you changed. Write a commit message in this format:
   ```
   audio-player: {short description}

   Addresses F{N} from ios-playback-engine-review-2026-03-31.md.
   {One sentence explaining the behavioral change.}
   ```
13. **Update progress only after verification succeeds.** After committing, edit the Progress Tracker section at the bottom of `docs/ios-engine-implementation-prompt.md`. Change your task's status from `[ ]` to `[x]` and add the commit hash.
14. **Flag blockers.** If you discover something that contradicts the review doc or makes the task unsafe to implement as written, do NOT proceed. Instead, add a note under the task in the progress tracker explaining the issue.

## Task workflow

1. Read the tracker and choose the next incomplete task.
2. Restate the chosen task in one short paragraph.
3. Read all files the task touches, in full.
4. Implement only that task.
5. Add or update high-signal tests if appropriate.
6. Run focused verification, then build verification.
7. Do a self-review pass and fix anything you find.
8. Update the tracker.
9. Commit.

## Output format

When you report completion, use this structure:

### Completed task
- task name
- files changed

### What changed
- 3 to 6 concise bullets focused on behavior and design

### Verification
- commands run
- tests added or updated
- important result

### Self-review
- issues found and fixed during the review pass
- if none, say `No additional findings in self-review.`

### Tracker / commit
- tracker updated: yes or no
- commit hash
- blockers or residual risks

If blocked, report:
- chosen task
- blocker
- exact file(s) or doc section(s)
- why proceeding would be unsafe
- the tracker note you added
```

## Task list

### Phase 1: Command supersession (Spec 1)

**Task 1: desiredTransport field and pause-during-prepare fix (F1)**

```
{TASK_DESCRIPTION}:

Implement the F1 fix from Implementation Spec 1 in the review doc.

1. Add `seekSequence: UInt64`, `desiredTransport: DesiredTransport`, and `currentSessionID: String?` to the Snapshot struct in `GaplessMP3PlayerBackend.swift`
2. Add the `DesiredTransport` enum (playing, paused, stopped)
3. Set `desiredTransport` in `playOnQueue`, `pauseOnQueue`, `stopOnQueue`, `resumeOnQueue` per the table in Spec 1
4. In the `playOnQueue` Task, after `shouldContinueAsyncWork(for: generation)`, add a `desiredTransport == .playing` guard before calling `player.play()`
5. Apply the same guard in `handleMediaServicesResetOnQueue` before calling `player.play()`

Files to modify: `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`
```

**Task 2: Engine sessionID for stale event filtering (F4)**

```
{TASK_DESCRIPTION}:

Implement the F4 fix from Implementation Spec 1 in the review doc. This is an engine API change.

IMPORTANT: Read the "F4 fix: engine sessionID" section in the review doc carefully. The sessionID must be captured at pipeline start time, NOT stamped at delivery time. This is the key correctness property.

Engine-side:
1. Add `sessionID: String?` to `GaplessRuntimeEvent` cases and `GaplessHTTPLogEvent` struct in `Events.swift`
2. Add `withSessionID(_:)` helper to `GaplessRuntimeEvent`
3. Add `sessionID: String?` property to `GaplessMP3Player` (in CallbackConfiguration, matching the `callbackQueue` pattern)
4. In `startPipeline()` (GaplessMP3Player.swift:378), capture `self.sessionID` ONCE at the top. Create per-session bridge closures for coordinator.setRuntimeEventHandler and coordinator.setHTTPLogHandler that stamp the CAPTURED sessionID (not the current one)
5. Pass the captured sessionID into `playbackFinished` and `playbackFailed` closures. Update `handlePlaybackFinished` and `handlePlaybackFailure` to accept and use it.
6. For `trackTransitioned` (emitted from applyPendingTrackTransitionIfNeeded), store the captured sessionID in a playback-queue-local field set at pipeline start, and use it when emitting
7. `deliverRuntimeEvent` and `deliverHTTPLogEvent` do NOT stamp sessionID — they pass through whatever the event already carries

Backend-side:
8. In `playOnQueue`, after incrementing generation, mint a `UUID().uuidString` sessionID, store it in snapshot as `currentSessionID`, and set `player.sessionID`
9. In `stopOnQueue`, set `currentSessionID = nil` and `player.sessionID = nil`
10. Same pattern in `nextOnQueue` (when stopping) and `handleMediaServicesResetOnQueue`
11. In `handleRuntimeEvent`, add `guard event.sessionID == snapshotStore.get().currentSessionID` at the top
12. In `handleHTTPLogEvent`, add the same guard
13. Keep the one-time handler setup at init — no handler swapping needed. The per-session bridge closures are installed in startPipeline, not in the backend.

Depends on: Task 1 (Snapshot changes must be in place)
Files to modify: `modules/relisten-audio-player/ios/GaplessMP3Player/API/GaplessMP3Player.swift`, `modules/relisten-audio-player/ios/GaplessMP3Player/API/Events.swift`, `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`
```

**Task 3: Seek sequence counter and setNext generation gate (F5, F10)**

```
{TASK_DESCRIPTION}:

Implement the F5 and F10 fixes from Implementation Spec 1 in the review doc.

For F5 (seek sequence):
1. `seekSequence` was already added to Snapshot in Task 1. In `seekOnQueue`, increment it and capture it in the SeekCommandExecution.
2. Update `SeekCommandState` (in `BackendSupport/GaplessMP3PlayerBackendSeekCommand.swift`) to accept and store `seekSequence`
3. Update `shouldApplyResult` to check both `activeGeneration` and `currentSeekSequence`
4. At the call site in seekOnQueue, pass current seekSequence to shouldApplyResult
5. Reset seekSequence to 0 wherever generation is incremented (playOnQueue, stopOnQueue, etc.)

For F10 (setNext generation gate):
1. In `setNextOnQueue`, add a `snapshotStore.get().generation == generation` check immediately before the first `await` (before `player.setNext()`)

Depends on: Task 1 (seekSequence field must exist)
Files to modify: `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`, `modules/relisten-audio-player/ios/BackendSupport/GaplessMP3PlayerBackendSeekCommand.swift`
```

### Phase 2: Localized state-cleanup fixes

**Task 4: Handoff and failure state cleanup (F6, F7, F12, F11)**

```
{TASK_DESCRIPTION}:

Implement four localized fixes. Each is small and independent.

F6 — Clear desiredNextStreamable at handoff:
In the `.trackTransitioned` handler in `handleRuntimeEvent` (GaplessMP3PlayerBackend.swift), add `$0.desiredNextStreamable = nil` in the snapshotStore.withValue block that already clears nextStreamable.

F7 — Clear currentStreamable on failed prepare:
In the `playOnQueue` failure catch block, clear `currentStreamable`, `nextStreamable`, `desiredNextStreamable`, and download byte fields (`activeTrackDownloadedBytes`, `activeTrackTotalBytes`). Match the cleanup that `stopOnQueue` does.

F12 — Emit error on downloadDestination copy failure:
In `maybeEmitStreamingCacheCompletion`, when the copy fails (the catch block that currently just logs), emit an error event to the delegate instead of silently returning. Do NOT emit `onTrackStreamingCacheComplete` on failure.

F11 — Audio session deactivation on teardown:
In `AudioSessionController.teardown()`, add `try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)`. Only on teardown, not on stop.

Files to modify: `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`, `modules/relisten-audio-player/ios/AudioSessionController.swift`
```

### Phase 3: Now-playing metadata

**Task 5: Full PlaybackPresentationController (F2)**

```
{TASK_DESCRIPTION}:

Implement Spec 4 from the review doc — full now-playing metadata in PlaybackPresentationController.

1. Read `PlaybackPresentationController.swift` (currently a 20-line stub)
2. Read `RelistenGaplessAudioPlayer/PlaybackUpdates.swift` as the reference BASS implementation
3. Add `updateNowPlaying(title:artist:album:duration:elapsed:rate:artworkURL:)` method that writes to `MPNowPlayingInfoCenter.default().nowPlayingInfo`
4. Add `clearNowPlaying()` method that sets `nowPlayingInfo = nil`
5. Update `teardown()` to call `clearNowPlaying()`
6. Artwork URL comes from JS via the streamable — check how the BASS path gets it and plumb it through the same way
7. In `GaplessMP3PlayerBackend.swift`, call `updateNowPlaying` after successful prepare and on progress polling ticks, call `clearNowPlaying` in stopOnQueue and teardown

This is a user-visible regression fix, not a backend decomposition task. Keep changes focused on adding now-playing writes.

Files to modify: `modules/relisten-audio-player/ios/PlaybackPresentationController.swift`, `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`
```

### Phase 4: Source ownership and cache (Specs 2, 3)

**Task 6: HTTPSourceSession shutdown and continuation cleanup (F8, F9)**

```
{TASK_DESCRIPTION}:

Implement the HTTPSourceSession and MP3SourceManager shutdown from Spec 2.

1. Read `HTTPSourceSession.swift` and `MP3SourceManager.swift` in full
2. Add `shutdown()` method to HTTPSourceSession per Spec 2: cancel stream task, resume all waiters with CancellationError, delete temp file if download didn't complete
3. Add `shutdown()` method to MP3SourceManager per Spec 2: shut down all active sessions, clear activeDownloads and transientStatuses
4. Do NOT add any heuristic eviction (no "max N" or "oldest session" logic). Ownership is simple: current/next sessions live, teardown kills everything.
5. Verify build succeeds

Files to modify: `modules/relisten-audio-player/ios/GaplessMP3Player/Source/HTTPSourceSession.swift`, `modules/relisten-audio-player/ios/GaplessMP3Player/Source/MP3SourceManager.swift`
```

**Task 7: Coordinator teardown split and app-launch scavenge (Spec 2)**

```
{TASK_DESCRIPTION}:

Implement the coordinator teardown split and app-launch temp cleanup from Spec 2.

1. Read `GaplessPlaybackCoordinator.swift` and `GaplessMP3Player.swift` in full
2. Add `teardown()` method to GaplessPlaybackCoordinator per Spec 2: calls stopPlayback() then sourceManager.shutdown(). This is the ONLY path that shuts down source sessions.
3. Add `teardown()` method to GaplessMP3Player that calls coordinator.teardown() instead of coordinator.stopPlayback()
4. Update GaplessMP3PlayerBackend.teardown() to call player.teardown() instead of player.stop()
5. Add `scavengeTempFiles()` to SourceCacheStore per Spec 2 and call it from engine init
6. Verify build succeeds

IMPORTANT: Do NOT add sourceManager.shutdown() to stopPlayback(). Read the teardown split table in Spec 2 — stopPlayback() is used by pause, seek, and play-restart, all of which must preserve source sessions.

Depends on: Task 6 (shutdown methods must exist)
Files to modify: `modules/relisten-audio-player/ios/GaplessMP3Player/Playback/GaplessPlaybackCoordinator.swift`, `modules/relisten-audio-player/ios/GaplessMP3Player/API/GaplessMP3Player.swift`, `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`, `modules/relisten-audio-player/ios/GaplessMP3Player/Source/SourceCacheStore.swift`
```

**Task 8: Stable cache key and session-scoped cache wipe (F3, Spec 3)**

```
{TASK_DESCRIPTION}:

Implement Spec 3: stable cache keys and session-scoped cache wipe.

For F3 (stable cache key):
1. Read `relisten/player/relisten_player_queue.tsx`, the Expo module record definitions, and `GaplessMP3PlayerBackend.swift` makePlaybackSource
2. Add `cacheKey` field to the RelistenStreamable Expo record (check how other fields are defined)
3. In `toStreamable()` in relisten_player_queue.tsx, populate cacheKey from `this.sourceTrack.uuid`
4. Pass cacheKey through RelistenGaplessStreamable
5. In makePlaybackSource, use `streamable.cacheKey` instead of `streamable.identifier`

For session-scoped cache wipe:
6. Add `wipeCacheDirectory()` to SourceCacheStore per Spec 3
7. Call it from MP3SourceManager.init() or GaplessMP3Player.init()
8. Verify build succeeds

Files to modify: `relisten/player/relisten_player_queue.tsx`, `modules/relisten-audio-player/ios/GaplessMP3PlayerBackend.swift`, `modules/relisten-audio-player/ios/GaplessMP3Player/Source/SourceCacheStore.swift`, and Expo module record definition files
```

---

## Progress Tracker

Update this section as tasks complete. Change `[ ]` to `[x]` and add the commit hash.

### Phase 1: Command supersession
- [x] Task 1: desiredTransport field + F1 fix — commit: `586cb90`
- [x] Task 2: Engine sessionID for stale event filtering (F4) — commit: `ae489aa`
- [x] Task 3: Seek sequence + setNext gate (F5, F10) — commit: `0a397cf`

### Phase 2: Localized state-cleanup fixes
- [x] Task 4: F6 + F7 + F12 + F11 — commit: `d7ef236`

### Phase 3: Now-playing metadata
- [x] Task 5: Full PlaybackPresentationController (F2) — commit: `e63072f`

### Phase 4: Source ownership and cache
- [x] Task 6: HTTPSourceSession/MP3SourceManager shutdown (F8, F9) — commit: `832a03d`
- [x] Task 7: Coordinator teardown split + scavenge (Spec 2) — commit: `fe87327`
- [x] Task 8: Stable cache key + session-scoped wipe (F3, Spec 3) — commit: `e3df273`

### Verification
- [ ] Run full verification matrix (Spec 5) on device — notes: _pending_

### Phase 2 follow-up (after stabilization verified)
- [ ] Backend decomposition: remote commands → AudioSessionController delegate
- [ ] Backend decomposition: emission/polling → PlaybackPresentationController
