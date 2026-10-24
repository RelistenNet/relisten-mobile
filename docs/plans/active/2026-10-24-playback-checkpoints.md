# Preserve coherent playback checkpoints across interruptions

This ExecPlan is a living document. It records the implementation brief and proof for issue #158.

## Purpose / Big Picture

After a native automatic or explicit track transition, interruption, or app restart, restore a queue entry and timing observed for that same entry. Avoid losing the last confirmed checkpoint merely because a trailing JavaScript timer or bridge callback did not run. This fixes established mechanisms; it does not claim to reproduce the reporter's several-track loss or Peter's CarPlay report.

## Progress

- [x] Inspected upstream main 2bd727e, Alec's 30ffd2f, and zcmack's 0da784d / 457be48.
- [x] Isolated codex/fix-playback-checkpoints from unrelated player/UI branches.
- [x] Ported confirmed timing, explicit-request sequencing, and restore validation.
- [x] Added native atomic identity/timing snapshots and native checkpoint journals.
- [x] Regression matrix, code simplification and independent two-pass review; all three validated concerns fixed.
- [x] 64 Vitest tests, 38 Swift support tests, 14 Android tests and unsigned iOS simulator build passed.
- [x] Combined source merge with #159 ac3e44b has no conflicts; 70 Swift tests and unsigned iOS simulator build passed.
- [ ] Final aggregate checks on committed source, disposable integration worktree, draft PR and exact-head remote/CI verification.

## Context and Orientation

`relisten/player/relisten_player.tsx` owns native confirmation and the pending explicit request. `relisten_player_queue.tsx` owns queue entries and Realm checkpoint transactions. `modules/relisten-audio-player` bridges the iOS backend and Android MediaController. Each native observation carries an entry identifier, stable source UUID, native session, and sequence allocated at capture, before asynchronous delivery. Replacing a queue renews entry identifiers; reordering preserves them. Realm schema 14 stores original/shuffled entry identities so repeated source tracks remain distinguishable.

## Invariants and Plan of Work

Persist index, stable identity, and timing in one Realm transaction. Only matching confirmed native identity supplies timing. Reject older sequence numbers, mismatched source/entry identity, removed entries, and retired native sessions. Reset timing before publishing a newly confirmed queue entry; accept duration-only corrections. Preserve optimistic UI requests without allowing their timing to contaminate the confirmed checkpoint.

Normal Realm progress writes use a fixed five-second deadline that subsequent events cannot postpone. Structural queue changes and final saves run synchronously and cancel the pending timer. Deduplicate identical snapshots. Native journals write at most every five seconds during continuous playback, immediately for transitions and pause/interruption/background boundaries, and before teardown when callbacks execute. iOS uses an atomic file replacement; Android uses a synchronous SharedPreferences commit. On cold restore, accept a native journal only if its original queue-entry/source identity exists in persisted queue metadata and its capture sequence is newer than the Realm acknowledgment. Wall-clock timestamps are diagnostic only.

## Validation and Acceptance

Regression matrix: auto/explicit advances; immediate pause/focus loss; interleaved native pause snapshots; repeated/out-of-order prior-track progress; duplicate transitions; duration-only updates; reorder/removal/replacement/clear; duplicate source entries; cold restore; old data without new fields; native session changes; stale/delayed journal writes; fixed write deadlines; write failure/retry; older native API fallback.

Commands from the worktree: `nvm use`, `yarn test`, `yarn lint`, `yarn ts:check`; `swift test --package-path modules/relisten-audio-player --scratch-path /tmp/relisten-persistence-swift`; Android `JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew :relisten-audio-player:testDebugUnitTest --offline --no-daemon` from android/. Run the shared pause-snapshot integration test and verify the companion diff applies without conflicts. Save actual results in this plan before publishing a draft.

## Surprises & Discoveries

The earlier timing patches did not address the suspended-JS gap. Emitting a final native event is insufficient by itself. A bounded native journal can recover timing only for queue entries already durably represented by Realm; it is not a second owner of queue contents.

## Decision Log

Use upstream main as the independent PR base. Remove the duration-similarity legacy reset after independent review: legacy data lacks identity to justify discarding elapsed. Identified modern records retain measured duration. Apply native identity, timing and acknowledgment inside one save-suppression transaction so no intermediate transition record reaches Realm. Reuse useful logic from Alec and zcmack without cherry-picking unrelated branch foundations. Replace timestamp-based reconciliation with sequence and queue-entry identity checks. Keep all interruption classification, resume intent, audio activation, and remote-command result policy in the companion PR.

## Guarantees and Release Requirements

Full identity validation and native-journal recovery require new iOS and Android binaries plus this JavaScript. Do not publish this as an OTA-only fix to old runtimes. When APIs are absent, use the legacy event path and shared final-save/bounded-timer improvements; old binaries cannot provide native identity or suspended-JS recovery. Old JavaScript continues receiving the unchanged legacy events from new native code. Realm schema advances from 13 to 14; rollback to JavaScript that opens schema 13 after migration is unsupported and must be excluded from the new runtime's OTA channel.

There is no unconditional losslessness promise: sudden process/device failure can precede any callback, scheduled persistence, or filesystem completion. The journal stores the latest native observation, not a sample taken after a suspended renderer has stopped. Continuous native sampling and successful writes bound ordinary lag to roughly five seconds plus sampling/scheduling delays; pause/background callbacks attempt an immediate final checkpoint. File replacement prevents partial JSON records; no physical-power-loss fsync guarantee is claimed.

## Idempotence and Recovery

Tests use isolated fake clocks or temporary journal paths. No production data, release channel, or deployment is touched. Revert the branch commits to undo code changes; do not downgrade an already migrated Realm file.

## Outcomes & Retrospective

Pending final validation and integration with the companion CarPlay recovery PR.
