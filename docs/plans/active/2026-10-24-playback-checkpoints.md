# Save coherent playback state at native transitions and pause

## Outcome

Issue [#158](https://github.com/RelistenNet/relisten-mobile/issues/158) reports lost playback position. Separate track and progress events could pair the next queue entry with the previous entry's timing. A trailing save timer could also disappear before writing a pause. This change fixes those established mechanisms. It does not reproduce the reported loss across several tracks.

## Design

The native player captures entry identity, source UUID, elapsed, duration, and playback state in one live observation before asynchronous delivery. `RelistenPlaybackSnapshot` documents the bridge contract. Timing uses seconds; a backend session and increasing sequence reject delayed observations. Sequence is local to that backend instance and is never persisted. Each queue occurrence has its own identity, so repeated source tracks remain distinct.

`RelistenPlayer` accepts the observation before publishing selection, timing, and state. The queue suppresses intermediate saves while those fields change, then writes the completed observation. A terminal observation reports current Stopped state with no native track; it preserves the last selected queue entry and its confirmed timing. Android emits that observation when the controller loses its last media item, even when an already-paused transport does not emit another state change. Play can then start the selected stream instead of resuming an empty controller. Native preparation does not confirm a requested selection before the renderer has prepared it. A pending request can preview a new entry without allowing the old entry's pause to overwrite that preview's state.

Realm is the only playback persistence store. Queue transitions, edits, pause, stop, and background notifications save immediately. A fixed five-second timer saves normal progress; further updates cannot postpone it. Identical persisted records do not cause another write. Native background handling captures a current observation, whose checkpoint flag requests an immediate Realm save when JS receives it. The JS AppState callback also flushes the latest already-delivered observation.

Restore uses saved occurrence identities for selection and shuffled order, including duplicates. It filters missing catalog entries before selecting a surviving entry. Timing belongs to the identified entry; measured native duration takes precedence over catalog duration. Legacy records preserve elapsed, clamped to catalog duration when available. An unsolicited startup Paused event does not erase the saved queue or prevent resume from starting the restored stream at its saved position.

## Scope decision

The earlier implementation added native journals and reconciled them with Realm at startup. That feature and its cross-store sequence acknowledgments have been removed. No device reproduction or controlled experiment demonstrated a failure that requires a second persistent store. The review found that acknowledgment deduplication could itself restore an older native journal position after a backward seek.

This design makes no suspended-JS durability guarantee. If JS cannot receive the native pause/background observation before termination, Realm can retain an earlier position. Demonstrating that failure on a supported device would justify evaluating native persistence separately. Native legacy events remain outputs for older JavaScript; this JavaScript requires the new coherent bridge and has no legacy-event adapter.

## Validation

Focused regressions exercise the player and queue through native observations and inspect persisted state: pause immediately after advance, stale/repeated observations, terminal stop, fixed save deadline, cancellation of pending writes, reordered/removed/replaced entries, duplicate occurrence restore, measured duration, and startup pause/restore/resume. The schema test opens an actual schema-13 Realm file at schema 14.

Local validation of the simplified source passed 64 Vitest tests, 33 Swift support tests, 12 Android tests plus native Kotlin compilation, lint, and TypeScript. The combined iOS sources from this PR at `6fcd1c6` and #159 at `8cb7891` passed the Debug simulator build and install; combined Swift support tests passed 67 cases. The later Android terminal-state fix does not change those iOS sources. Earlier journal-suite results do not validate this revised implementation. Physical-device background, navigation, call and CarPlay coverage remains outstanding.

## Release and rollback

The change requires new iOS and Android binaries with matching JavaScript. Do not deliver it as an OTA update to an older binary. Realm advances from schema 13 to 14 for queue occurrence identities and timing ownership. Rollback must retain schema-14 support; exclude schema-13 JavaScript from the new runtime's OTA channel.

PR [#159](https://github.com/RelistenNet/relisten-mobile/pull/159) separately controls iOS interruption permission and audio-session activation. When combining the PRs, an explicit resume outcome must force a coherent snapshot even if native state has not changed, so it corrects JavaScript's optimistic Play state. The combined source and native build passed the checks above. Simulator playback smoke testing is separate from physical-device interruption coverage.
