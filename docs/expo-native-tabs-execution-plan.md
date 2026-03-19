# Feature Spec: Expo Native Tabs Migration for Relisten

**Date:** 2026-03-19
**Status:** Native-tabs-only shell conversion complete on iOS-validated paths; Android still unverified.

---

## Goal and Scope

### Goal
Replace the relisten tabs shell with Expo Router native tabs as the only shell implementation, removing the old JavaScript-tabs desktop/sidebar path while preserving route contracts, nested stack behavior, badges, and playback UI. The current execution focus is finishing the native-tabs-only conversion cleanly and keeping iOS behavior intact.

### In Scope
- Migrate the relisten tabs shell in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx:1) to `expo-router/unstable-native-tabs` as the only shell implementation.
- Remove the old desktop/sidebar tabs shell and any legacy `expo-router` `Tabs` structures that only existed to support it.
- Preserve the existing four tab groups from [relisten/util/tabs.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/util/tabs.ts:1).
- Remove compact-mobile dependence on `BottomTabBar`, `BottomTabBarProps`, and `useBottomTabBarHeight`.
- Rework player-bottom-bar placement so compact mobile no longer depends on measured tab-bar height.
- Ensure compact iOS content can scroll cleanly under the native tab bar so the system glass effect still reads correctly.
- Keep the current nested stacks under each tab group intact.
- Add an implementation prompt that another coding agent can execute directly.

### Out of Scope
- Reworking the floating player sheet migration beyond preserving compatibility with this tabs migration.
- Matching the visual design of `PlayerBottomBar` to the native tab bar glass treatment; that is a separate follow-up pass.
- Redesigning tab information architecture or adding/removing primary tabs.
- Any web layout or web compatibility work.

---

## Context and Constraints

### Background
The relisten tabs flow now centers on Expo Router native tabs. The old desktop-width sidebar shell and JavaScript-tabs branch have been removed so the app uses one native-tabs shell across widths. Expo Router native tabs are available in SDK 55, but Expo documents them as beta and explicitly says they are not a drop-in replacement for JavaScript tabs. This repo still has tab-shell-specific behavior that must survive the cleanup:

- Per-tab route identity is encoded as route groups: `(artists)`, `(myLibrary)`, `(offline)`, `(relisten)` in [relisten/util/tabs.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/util/tabs.ts:1).
- The compact mobile player bar is now owned inside each compact tab-root layout and anchored with the documented native-tabs inset fallback in [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts:4), then consumed in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx:121). The fallback is platform-specific: iOS uses bottom safe area only, while Android uses the native tab height because Expo’s Android native-tabs wrapper already reserves the bottom inset before rendering tab content.

### Current State
- The relisten shell is a root stack with `player` modal plus `tabs` main flow in [app/relisten/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/_layout.tsx:42).
- The tabs layout now renders a single `expo-router/unstable-native-tabs` shell with four `NativeTabs.Trigger` entries in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx:16).
- Compact mobile Offline-tab visibility is decided once per shell mount and passed to `NativeTabs.Trigger hidden` in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx:62), rather than live-hiding the tab after mount.
- The compact player bar is mounted inside the shared compact tab-root layouts in [relisten/pages/tab_roots/TabRootStackLayout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/pages/tab_roots/TabRootStackLayout.tsx:104) and [app/relisten/tabs/(relisten)/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/_layout.tsx:48), and anchored above the native tab bar with the fallback inset in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx:127).
- The old width-based desktop layout helper has been removed from the relisten tabs flow, so the deleted desktop shell cannot reactivate through breakpoints or dev overrides.
- Content spacing also depends on `playerBottomBarHeight` in [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx:5) and [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/source_details.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/source/%5BsourceUuid%5D/source_details.tsx:88).

### Required Pre-Read
- Expo guide: https://docs.expo.dev/router/advanced/native-tabs/
- Expo reference: https://docs.expo.dev/versions/latest/sdk/router/native-tabs/
- [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx:1)
- [app/relisten/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/_layout.tsx:1)
- [relisten/pages/tab_roots/TabRootStackLayout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/pages/tab_roots/TabRootStackLayout.tsx:1)
- [app/relisten/tabs/(relisten)/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/_layout.tsx:1)
- [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx:1)
- [docs/floating-player-sheet-native-tabs-plan.md](/Users/alecgorge/code/relisten/relisten-mobile/docs/floating-player-sheet-native-tabs-plan.md:1)

### Constraints
- Expo marks `expo-router/unstable-native-tabs` as beta in SDK 55 and subject to change.
- Native tabs are not a drop-in replacement for JavaScript tabs. Expo’s guidance is to use `Trigger` instead of `Screen` and to keep nested `Stack` layouts inside tabs.
- Expo documents a hard limit of 5 Android tabs. This app currently uses 4, so the current IA fits, but any additional tab would break the migration path.
- Expo documents that native tabs do not expose a stable tab-bar-height measurement API. The current compact mobile shell depends on that measurement, so this contract must be removed instead of shimmed.
- Expo documents that dynamically hiding tabs remounts the navigator and resets state. The current Offline tab behavior cannot be ported directly.
- The old width-based desktop shell is being removed in this track, so any remaining width-based layout branching in the relisten tabs flow is migration residue.
- For the current pass, compact iOS should favor native-tab glass behavior: list content should be able to scroll under the tab bar without broken insets or awkward bottom clipping.

### Non-obvious Dependencies or Access
- [app/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/_layout.tsx:213) owns `RelistenPlayerBottomBarProvider`, so any shell refactor must keep the provider above all tab routes.
- `PlayerBottomBar` still routes to `/relisten/player` in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx:56), and `/relisten/player` is still a modal route in [app/relisten/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/_layout.tsx:44).

---

## Approach and Touchpoints

### Proposed Approach
Finish the migration as a single-shell native-tabs implementation. Remove the old JavaScript-tabs desktop branch, delete the desktop/sidebar structures that only existed to support it, and keep the shared player/tab inset contract aligned with the native-tabs-only world. `playerBottomBarHeight` remains valid for content padding, while the old `tabBarHeight` / width-based desktop logic should disappear from the relisten tabs flow entirely. For iOS polish, content should still be able to scroll under the native tab bar so the glass treatment feels native; the player bar only needs correct placement in this pass, not a final visual redesign.

### Integration Points / Touchpoints
- [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx:31)
  Keep the relisten tabs shell native-tabs-only and remove any leftover JavaScript-tabs or desktop/sidebar logic.

- [relisten/util/tabs.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/util/tabs.ts:1)
  Keep this as the source of truth for tab ids and route mapping.

- [relisten/pages/tab_roots/TabRootStackLayout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/pages/tab_roots/TabRootStackLayout.tsx:20)
  Remove `useBottomTabBarHeight` writes for compact mobile and convert this to a shared content-shell layout that can host `Stack` plus `PlayerBottomBar`.

- [app/relisten/tabs/(relisten)/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/_layout.tsx:10)
  Apply the same removal of measured tab-bar height from the Relisten tab stack.

- [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx:100)
  Remove dependence on `tabBarHeight` for compact mobile placement; keep `playerBottomBarHeight` measurement for content padding.

- [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx:5)
  Verify that content still clears the player bar where needed while also scrolling naturally under the native tab bar glass on compact iOS.

- [app/relisten/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/_layout.tsx:44)
  Keep `/relisten/player` modal behavior unchanged for this migration unless it directly blocks shell parity.

### Resolved Ambiguities / Decisions
- The relisten tabs shell is now native-tabs-only across widths; the old desktop/sidebar shell is not being preserved.
- Compact mobile Offline-tab visibility is decided when the compact shell mounts. `Always` and `Never` remain exact; `When Offline` snapshots network state at shell mount and applies on the next shell remount rather than live-remounting the navigator.
- `lastTabRoutes` and the desktop sidebar route-memory model are removed with the old shell.
- The player-sheet migration remains adjacent but separate. This tabs spec must preserve compatibility with the modal player route and existing bottom-bar interactions.

### Important Implementation Notes
- Expo’s docs note that hidden native tabs cannot be navigated to and that dynamic hiding remounts the navigator. The current `tabBarItemStyle.display` workaround in the JavaScript tabs shell must not be copied into `NativeTabs.Trigger hidden`.
- Expo’s docs note limited FlatList support and scroll-edge transparency behavior. The spec should assume targeted QA for list-heavy tabs and use `disableTransparentOnScrollEdge` if needed during parity validation.
- Local package types show `NativeTabs.BottomAccessory`, but it is iOS 26+ only in the bundled SDK. It can be treated as a future enhancement, not the core cross-platform migration seam.

---

## Phases and Dependencies

### Phase 1: Lock migration scope and invariants
- [x] Declare compact mobile as the only native-tabs target for phase 1.
- [x] Decide the Offline-tab strategy before coding:
  - compact mobile visibility is decided before navigator mount
  - `Always` and `Never` behave exactly as before
  - `When Offline` snapshots network state at compact-shell mount
  - no runtime tab-hiding path is reintroduced after mount
- [x] Write down the parity contract for badges, titles, route names, and modal player behavior.
  - keep the same four route-group names: `(artists)`, `(myLibrary)`, `(offline)`, `(relisten)`
  - preserve My Library badge behavior
  - preserve current labels and modal player route behavior
  - keep nested stack ownership inside each tab group layout

### Phase 2: Introduce compact-shell split
- [x] Split the tabs layout into compact-mobile native layout and isolate the old desktop-width branch so it could be removed cleanly afterward.
- [x] Keep the temporary desktop-width branch only long enough to complete the native-tabs cutover.
- [x] Preserve the four existing route groups and tab order from [relisten/util/tabs.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/util/tabs.ts:1).

### Phase 2b: Remove the old desktop/sidebar shell
- [x] Delete the JavaScript-tabs desktop branch in `app/relisten/tabs/_layout.tsx`.
- [x] Remove desktop-shell-only helpers and route-memory logic (`DesktopTabList`, `lastTabRoutes`, `router.replace()` tab selection).
- [x] Collapse relisten tab layouts and player-bar visibility to the native-tabs-only path.

### Phase 3: Remove measured tab-bar-height dependency
- [x] Refactor shared tab-root layouts so compact mobile no longer calls `useBottomTabBarHeight`.
- [x] Move `PlayerBottomBar` ownership from the root tabs shell into a shared tab-content container for compact mobile.
- [x] Keep `playerBottomBarHeight` measurement for content padding while deleting compact-mobile writes to `tabBarHeight`.
- [x] Audit all consumers of `playerBottomBarHeight` and remove any assumptions that also depended on tab-bar height.

### Phase 4: NativeTabs implementation
- [x] Replace mobile `<Tabs.Screen>` declarations with `<NativeTabs.Trigger>` declarations.
- [x] Port icons, labels, and badges for all four tabs.
- [x] Configure nested stack behavior inside each tab group rather than relying on tab-level header props.
- [x] Validate reselect/back behavior and set explicit options only where native defaults are wrong for the app.

### Phase 5: Parity and cleanup
- [x] Validate compact iOS parity for tab switching, nested navigation, badges, player bar placement, and general visual quality.
- [x] Run list-heavy iOS screens to catch transparency, glass-scroll, or inset regressions.
- [x] Remove compact-mobile legacy tab-bar code paths once parity is confirmed.
- [x] Remove the old desktop/sidebar shell and any dead tabs structures.
- [x] Re-verify the native-tabs-only shell after the desktop-path removal.

### Phase Dependencies
- Offline-tab visibility must be resolved before phase 4 because `NativeTabs.Trigger hidden` is not a safe live replacement for the current runtime hide behavior.
- Phase 3 must land before phase 4 because the current `tabBarHeight` contract is structurally incompatible with Expo’s native-tabs limitations.

---

## Validation and Done Criteria

### Validation Plan

Integration checks:
- `yarn lint`
- `yarn ts:check`

Manual validation:
- Compact mobile iOS:
  - switch between all four tabs
  - drill into nested stacks and switch tabs
  - reselect the active tab and confirm behavior is intentional
  - verify player bottom bar placement with and without playback
  - verify content can scroll cleanly under the native tab bar for the glass effect
  - verify list-heavy screens do not produce broken transparent tab-bar states or clipped bottom content
  - run on simulator and capture screenshots for each primary tab plus one nested-stack screen
- Compact mobile Android:
  - intentionally deferred; no Android parity validation is part of this pass

Regression checks:
- Verify `/relisten/player` still opens as modal from the bottom bar.
- Verify `ScrollScreen` and `source_details` still clear the bottom player bar.
- Verify Offline-tab behavior matches the explicit product decision adopted in phase 1.

### Done Criteria
- [x] Compact mobile uses `expo-router/unstable-native-tabs` with the same four route groups.
- [x] Compact mobile no longer depends on `useBottomTabBarHeight` or measured tab-bar height.
- [x] Compact iOS looks good with native tabs, including scroll-under-glass behavior for list content.
- [x] Offline-tab behavior is stable and no longer relies on dynamic live hiding that remounts the navigator.
- [x] Player bar placement remains correct on compact iOS; visual restyling to match native tabs is explicitly deferred.
- [x] The relisten tabs flow no longer contains the old desktop/sidebar shell or the legacy JavaScript-tabs branch.
- [x] Simulator validation artifacts exist for compact iOS tab states.
- [x] Lint and typecheck pass.
- [x] The implementation prompt below is still accurate after any scope adjustments during execution.

---

## Open Items and Risks

### Open Items
- [x] Keep native-tab reselect as pop-to-root while preserving nested stack state across tab switches.
- [x] Compact iOS scroll-under-glass behavior has been validated on list-heavy screens; remaining visual follow-up is the separate player-bar restyling pass.
- [x] Native tab-bar height remains a documented fallback constant for player-bar anchoring because the current local `expo-router` / `react-native-screens` native-tabs surface exposes no supported runtime height API. The fallback is platform-specific: iOS uses bottom safe area only, Android uses tab height only.
- [x] The relisten tabs flow has been re-verified after removing the old desktop/sidebar path.
- [x] Keep the Relisten tab’s current special header treatment unchanged; it still owns its custom wordmark header in `app/relisten/tabs/(relisten)/_layout.tsx`.

### Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| Dynamic Offline-tab visibility remounts the navigator and resets state | High | High | Resolve visibility strategy before implementation; do not port current runtime hide behavior directly |
| Compact mobile player bar still depends on measured tab-bar height somewhere in the tree | High | High | Make phase 3 a hard prerequisite and audit all `tabBarHeight` writes before switching layouts |
| Native tab bar height is not available from the current local native-tabs API | Medium | High | Keep the documented platform fallback for player-bar anchoring and revisit this seam during the separate player-bar redesign pass; on Android do not add bottom safe area again because Expo’s native-tabs wrapper already reserves it |
| Native tab defaults differ from current JavaScript-tab behavior on reselect/back | Medium | Medium | Validate explicitly and set options only where defaults diverge from desired UX |
| Legacy desktop/sidebar shell or JavaScript-tabs structures remain reachable in the relisten flow | Medium | Medium | Remove the old branch and dead helpers together in one pass, then re-verify the native-tabs-only shell |
| Expo beta API changes under SDK updates | Medium | Medium | Keep migration isolated, document the exact SDK assumption, and avoid deep unsupported internals |
| List-heavy screens expose scroll-edge transparency or glass-scroll issues | High | Medium | Make list-heavy iOS QA a current blocking validation step and apply `disableTransparentOnScrollEdge` or inset fixes where needed |

### Simplifications and Assumptions
- This spec assumes the player modal route remains intact during the tabs migration.
- This spec assumes Android stays at four primary tabs.
- This spec assumes player-bar visual alignment with native-tab glass is a separate follow-up after placement and scrolling behavior are stable.

---

## Implementation Prompt

Implement the Expo native tabs migration for relisten-mobile using this exact scope:

1. Use a single native-tabs shell under `app/relisten/tabs`.
   Remove the old desktop-width sidebar shell from `app/relisten/tabs/_layout.tsx`. Do not do any web work as part of this migration.

2. Preserve the current four route groups and route contracts:
   `(artists)`, `(myLibrary)`, `(offline)`, `(relisten)`.
   Keep `relisten/util/tabs.ts` as the source of truth for tab ids and routes.

3. Do not treat native tabs as a drop-in replacement for `<Tabs />`.
   Replace `<Tabs.Screen>` with `<NativeTabs.Trigger>`, keep nested stacks inside each tab group, and port icons/labels/badges explicitly.

4. Remove compact-mobile dependence on measured tab-bar height before the shell swap.
   The current implementation writes `useBottomTabBarHeight()` into `RelistenPlayerBottomBarContext` and positions `PlayerBottomBar` with `bottom: tabBarHeight`.
   That contract must be removed from compact mobile because Expo documents that native tabs do not expose a stable tab-bar-height measurement API.

5. Re-home `PlayerBottomBar` for compact mobile.
   Render it inside a shared tab-content container so it naturally sits above the compact tab content without needing measured tab-bar height.
   Keep `playerBottomBarHeight` measurement for content padding, but stop using compact-mobile `tabBarHeight`.

6. Treat Offline-tab visibility as a required design constraint.
   Do not port the current runtime hide behavior from `tabBarItemStyle.display` to `NativeTabs.Trigger hidden`.
   Expo documents that dynamically hiding tabs remounts the navigator and resets state. Pick a stable strategy before shipping.

7. Remove the old desktop/sidebar shell.
   Delete `DesktopTabList`, `lastTabRoutes`, the embedded desktop player shell, and the JavaScript-tabs branch in `app/relisten/tabs/_layout.tsx`. The relisten tabs flow should use a single native-tabs shell across widths.

8. Preserve current modal player behavior.
   Keep the player bar functionally correct for placement and navigation, but defer any visual redesign to better match native tabs.

9. Finish the native-tabs-only conversion cleanly.
   Compact iOS visual parity validation and the old shell removal are already complete. Android validation remains intentionally deferred by instruction.
   `PlayerBottomBar` should still open `/relisten/player` after this migration unless you hit a concrete blocker and can justify a scoped compatibility shim.

10. Validate the current pass with:
   - `yarn lint`
   - `yarn ts:check`
   - manual checks for compact iOS only
   - nested-stack behavior, badges, player bar placement, Offline-tab behavior, and scroll-under-glass quality on list-heavy screens
   - simulator screenshots for each primary tab and one nested-stack screen on iOS
   - treat Android validation as explicitly out of scope unless the user reopens that track

11. Keep the change reversible.
    If you need to stage the migration, do it behind a small shell split or adapter seam rather than a large rewrite.

## Manual Notes 

[keep this for the user to add notes. do not change between edits]

## Changelog
- 2026-03-19: Created initial execution plan and implementation prompt for compact-mobile Expo native tabs migration, with repo-specific shell and player-bar constraints documented. (019d0332-81b4-7af1-b96d-bca17aed8071)
- 2026-03-19: Updated phase-5 status after compact iOS under-glass validation and narrowed remaining work to deferred Android/desktop plus separate player-bar visual polish. (019d0332-81b4-7af1-b96d-bca17aed8071)
- 2026-03-19: Marked the compact iOS pass complete in the spec and clarified that Android/desktop remain intentionally deferred by instruction rather than pending phase-5 work. (019d0332-81b4-7af1-b96d-bca17aed8071)
- 2026-03-19: Re-scoped the migration to remove the old desktop/sidebar shell and JavaScript-tabs branch entirely, leaving a native-tabs-only relisten shell across widths. (019d0332-81b4-7af1-b96d-bca17aed8071)
- 2026-03-19: Completed the native-tabs-only shell conversion by deleting the old desktop/sidebar path and re-verifying the iOS shell launch and tab switching. (019d0332-81b4-7af1-b96d-bca17aed8071)
