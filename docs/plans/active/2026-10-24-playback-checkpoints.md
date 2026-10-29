# Save coherent playback state at native transitions and pause

## Outcome

Issue [#158](https://github.com/RelistenNet/relisten-mobile/issues/158) reports lost playback position. Separate track and progress events could pair the next queue entry with the previous entry's timing. A trailing save timer could also disappear before writing a pause. This change fixes those established mechanisms. It does not reproduce the reported loss across several tracks.

## Design

The native player captures entry identity, source UUID, elapsed, duration, and playback state in one live observation before asynchronous delivery. `RelistenPlaybackSnapshot` documents the bridge contract. Timing uses seconds; a backend session and increasing sequence reject delayed observations. Sequence is local to that backend instance and is never persisted. Each queue occurrence has its own identity, so repeated source tracks remain distinct.

`RelistenPlayer` accepts the observation before publishing selection, timing, and state. The queue suppresses intermediate saves while those fields change, then writes the completed observation. A terminal observation reports current Stopped state with no native track; it preserves the last selected queue entry and its confirmed timing. Android emits that observation when the controller loses its last media item, even when an already-paused transport does not emit another state change. Play can then start the selected stream instead of resuming an empty controller. Native preparation does not confirm a requested selection before the renderer has prepared it. A pending request can preview a new entry without allowing the old entry's pause to overwrite that preview's state.

Realm is the only playback persistence store. Queue transitions, edits, pause, stop, and background notifications save immediately. A fixed five-second timer saves normal progress; further updates cannot postpone it. Identical persisted records do not cause another write. Native background handling captures a current observation, whose checkpoint flag requests an immediate Realm save when JS receives it. The JS AppState callback also flushes the latest already-delivered observation.

Realm stores one original-order `queueEntries` list of embedded `PlayerQueueEntry` objects. The property name avoids Realm.Object's reserved `entries()` method. Each entry contains its occurrence ID and source-track UUID. An optional embedded `PlayerShuffleOrder` contains the permutation of those entry IDs; null means shuffle is off. The nullable `PlayerCheckpoint` contains the selected entry ID, elapsed seconds, and optional duration seconds. `PlayerRepeatState` names the persisted numeric repeat mode. Selection, timing, and queue edits are written in one transaction. Progress-only writes retain the existing queue and shuffle objects.

Restore preserves the saved entry IDs, so duplicate tracks keep their association with both orders. The checkpoint identifies an entry before missing catalog sources are filtered. If that entry cannot be restored, the first surviving entry in playback order is selected at zero seconds. A null checkpoint preserves a queue without a selection.

Saved duration takes precedence over catalog duration; absent duration falls back to the catalog. If neither duration is known, restore retains the elapsed position without clamping it and waits for native timing before allowing fractional scrubs. The schema-13 migration preserves elapsed and uses catalog duration when available because legacy timing did not identify its entry.

An unsolicited startup Paused event does not erase the saved queue or prevent resume from starting the restored stream at its saved position. Native confirmation compares against the last published native identifier, independently of the restored queue selection. This completes the initial Play request and prepares the next stream even when native playback selects the already-restored entry.

The native observation handler separates delivery ordering, request reconciliation, confirmed timing, and UI publication. A named `NativePlayRequest` records whether Play is waiting to be issued or has reached native playback. Identity confirmation, progress conversion, and publication run inside one queue checkpoint boundary. Restore separately loads catalog tracks, restores order and modes, then applies selection and timing.

The player tests are grouped by observable behavior. `PlaybackScenario` owns mocked native delivery and persistence access; each case shows the action and its result directly. Restore tests start with an empty player, and actual Realm tests own their file and connections for the duration of one test.

Native timing updates the internal confirmed progress on every accepted observation. UI progress publishes once per elapsed second, or when duration, selection, or playback state changes. Immediate checkpoints also publish. Save timing and listening-history thresholds use the latest confirmed sample even between UI updates.

## Scope decision

The earlier implementation added native journals and reconciled them with Realm at startup. That feature and its cross-store sequence acknowledgments have been removed. No device reproduction or controlled experiment demonstrated a failure that requires a second persistent store. The review found that acknowledgment deduplication could itself restore an older native journal position after a backward seek.

This design makes no suspended-JS durability guarantee. If JS cannot receive the native pause/background observation before termination, Realm can retain an earlier position. Demonstrating that failure on a supported device would justify evaluating native persistence separately. Native legacy events remain outputs for older JavaScript; this JavaScript requires the new coherent bridge and has no legacy-event adapter.

## Validation

Focused regressions exercise the player and queue through native observations and inspect persisted state: pause immediately after advance, stale/repeated observations, terminal stop, fixed save deadline, cancellation of pending writes, reordered/removed/replaced entries, duplicate occurrence restore and advance followed by shuffle-off, missing selected sources, measured duration, UI progress throttling, listening-history thresholds between UI updates, and startup pause/restore/resume. The schema test opens an actual schema-13 Realm file at schema 14.

The embedded-schema implementation passes 75 Vitest tests, lint, and TypeScript checks. Both independent review passes have no remaining actionable findings after the native-confirmation and unknown-duration fixes.

The readability pass also expands compressed native snapshot construction without changing its payload or emission conditions. All 33 Swift support tests, 12 Android tests, and Kotlin compilation pass. The combined iOS sources with #159 pass a Debug simulator rebuild.

The rebuilt iPhone 17 simulator restored Jack Straw at 16.820 seconds after a cold relaunch. Resume requested that native seek, completed native confirmation, and prepared Dire Wolf. Next played Dire Wolf and prepared Looks Like Rain; Pause worked and left the player paused. Physical-device background, navigation, call and CarPlay coverage remains outstanding.

## Release and rollback

The change requires new iOS and Android binaries with matching JavaScript. Do not deliver it as an OTA update to an older binary. Realm advances from schema 13 to 14 for the embedded queue entries and checkpoint. Schema 14 remains the version for this redesign because the earlier schema-14 format has never shipped. Rollback must retain schema-14 support; exclude schema-13 JavaScript from the new runtime's OTA channel.

PR [#159](https://github.com/RelistenNet/relisten-mobile/pull/159) separately controls iOS interruption permission and audio-session activation. When combining the PRs, an explicit resume outcome must force a coherent snapshot even if native state has not changed, so it corrects JavaScript's optimistic Play state. The combined source and native build passed the checks above. Simulator playback smoke testing is separate from physical-device interruption coverage.
