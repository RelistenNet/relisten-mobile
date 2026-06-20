# Ledger: Scoped Realm User Data

## Experiments

### MOB-SCOPE-001 - Scoped Realm foundation

- Status: completed
- Timestamp: 2026-06-20T00:18:16Z
- Responsible agent: root Codex agent
- Branch/worktree: `codex/scoped-realm-user-data`
- Start commit: `fa0b016`
- Hypothesis: Additive scoped user-owned models plus a small active scope service can establish the Realm data boundary without migrating catalog rows or implementing full auth.
- Mutable surface: `package.json`, lockfile, `relisten/realm/schema.ts`, new user-owned Realm model files, new scoped user-data service/query helpers, focused scope tests, and this AutoPlan package.
- Planned action: Add stable scope ID helpers, an active scope Realm row, scoped primary-key helpers, user-owned Realm models for playlists, entries, favorites, settings, pending operations, sync cursors, playback journal rows, auth/session metadata, mobile access grants, and migration markers. Add tests for scope key generation, active scope switching, and scoped query helpers.
- Validator: `yarn test -- scope`, `yarn lint`, `yarn ts:check`, and an iOS Simulator smoke using device `DEC49863-5AF8-4832-8BA2-C5E7C41A029D`.
- Expected evidence: Schema version is bumped additively, catalog model identities are not rewritten, tests prove scope isolation and deterministic keys, and the simulator can still launch the app.
- Evidence:
  - Added Vitest harness and `yarn test` script.
  - Added stable user-data scope helpers and scoped primary-key helpers under `relisten/user_library/`.
  - Added `ActiveUserDataScope`, `UserAuthSessionMetadata`, `UserPlaylist`, `UserPlaylistEntry`, `UserMobileAccessGrant`, `UserFavorite`, `ScopedUserSettings`, `PendingUserOperation`, `UserSyncCursor`, `UserDataMigrationMarker`, and `ScopedPlaybackHistoryEntry`.
  - Registered the user-library model bundle in `relisten/realm/schema.ts` and bumped Realm schema version from 12 to 13.
  - Verified scope ID generation, active scope switching, scoped query helpers, model shape, secret-free auth/grant schemas, and temp-Realm opening with the complete user-library model bundle.
  - Launched the app on iOS Simulator `DEC49863-5AF8-4832-8BA2-C5E7C41A029D` through Metro; the app loaded the Relisten UI and opened the upgraded Realm at `.../Documents/relisten.realm`.
- Validators:
  - `yarn test -- scope`: pass, 3 files / 10 tests.
  - `yarn test`: pass, 3 files / 10 tests.
  - `yarn ts:check`: pass.
  - `yarn lint`: pass.
  - `git diff --check`: pass.
  - iOS Simulator smoke: pass after starting Metro and opening `relisten://expo-development-client/?url=http%3A%2F%2F192.168.1.35%3A8081`.
- Review:
  - Code review subagent reported no correctness findings.
  - Plan review subagent's actionable test-gap finding was addressed with a temp-Realm open test for `USER_LIBRARY_REALM_MODELS`.
- Outcome: pass
- next_action: done
