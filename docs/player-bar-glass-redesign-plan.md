# Feature Spec: Native-Tabs Player Bar Redesign

**Date:** 2026-03-19
**Status:** Planning

---

## Goal

Redesign the compact player bar so it feels native alongside Expo Router native tabs:

- inset from screen edges instead of full-bleed
- glass-like visual treatment that belongs with the native tab bar
- stable placement during tab switches and lazy tab loads
- clean scroll-under behavior on iOS
- no dependence on ad hoc absolute-position heuristics as the long-term architecture

This is a player-bar redesign track, not a floating-sheet migration. The existing `/relisten/player` modal route stays intact for now.

---

## Product Intent

### Desired Feel

The compact player bar should read as a native accessory attached to the tab system, not as a legacy overlay floating above unrelated content.

It should feel:

- inset
- translucent/glassy on iOS
- compact and calm, not visually heavy
- clearly tappable as the entry point into the full player
- visually aligned with the native tab bar rather than stacked awkwardly above it

### UX Requirements

- The bar remains visible only when playback queue state makes it relevant.
- Tapping the main body still opens `/relisten/player`.
- Primary transport controls remain accessible from the collapsed bar.
- List content should still scroll naturally beneath the tab bar glass on iOS.
- The bar must not jump vertically during lazy tab transitions.
- The bar must not overlap the native tab bar.

---

## Scope

### In Scope

- Compact player bar visual redesign.
- Compact player bar placement redesign.
- Native-tabs-aware mounting and layout contract cleanup.
- iOS-first glass treatment and inset behavior.
- Cross-platform fallback strategy for Android and older iOS.
- Cleanup of current `playerBottomBarHeight` spacing contract where needed.

### Out of Scope

- Replacing the `/relisten/player` modal with an interactive sheet.
- Full player screen redesign.
- Tab information architecture changes.
- Web work.
- Desktop/iPad-specific redesign work.

---

## Current State

### Existing Mount and Layout

- The player bar is mounted in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx#L84) as a sibling after `NativeTabs`.
- The bar itself is absolutely positioned in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx#L119).
- Its bottom anchoring depends on [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts#L1), which currently uses platform constants plus safe-area heuristics.

### Existing Spacing Contract

- Shared bar height is measured in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx#L147) and provided by `RelistenPlayerBottomBarProvider` in [app/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/_layout.tsx#L213).
- Scrollable screens reserve space through [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx#L5).
- `source_details` also forwards bottom inset manually in [source_details.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/source/%5BsourceUuid%5D/source_details.tsx#L88).

### Existing Problems

- The placement contract is still heuristic because Expo native tabs do not expose a stable cross-platform tab-bar-height measurement API in the current local surface.
- The bar is structurally an overlay, so any inset mistake shows up immediately as overlap or gap.
- `playerBottomBarHeight` currently mixes two concerns:
  - visual accessory height
  - content reservation height
- Scroll-under-glass behavior on iOS and content reservation are currently coupled in a way that makes redesign awkward.

---

## Native Tabs Platform Reality

### What the Local API Supports

The installed Expo Router native-tabs implementation exposes a cleaner seam than the current overlay-only design:

- `NativeTabs.BottomAccessory` exists in the local surface at [elements.d.ts](/Users/alecgorge/code/relisten/relisten-mobile/node_modules/expo-router/build/native-tabs/common/elements.d.ts#L201).
- `NativeTabsView` forwards that accessory to `react-native-screens` at [NativeTabsView.js](/Users/alecgorge/code/relisten/relisten-mobile/node_modules/expo-router/build/native-tabs/NativeTabsView.js#L63).

### Constraint

That accessory path is documented as iOS 26+ only in the local Expo Router surface.

So the design target should be:

- iOS 26+: use `NativeTabs.BottomAccessory`
- older iOS: use a fallback overlay path
- Android: use a fallback overlay path

This means the redesign should explicitly have two render modes behind one player-bar API:

1. native accessory mode
2. compatibility overlay mode

---

## Design Direction

### Visual Direction

The redesigned bar should be a compact inset card:

- horizontal inset from screen edges
- rounded corners
- subtle blur/translucency on iOS
- restrained border/highlight to match the native tab bar glass language
- less dense chrome than the current full-width bar

### Suggested iOS Treatment

- Use a translucent material-style background.
- Keep the bar visually separate from the tab bar, but related to it.
- Prefer a softer edge and lower visual weight than the current blue slab.
- Keep the scrubber integrated, but consider reducing its visual dominance in the collapsed state.

### Suggested Android Treatment

- Do not mimic iOS blur literally.
- Use a flatter elevated surface with similar inset geometry and hierarchy.
- Keep spacing and layout rhythm aligned with iOS so behavior remains consistent even if materials differ.

---

## Architecture Direction

### Principle 1: One Player Bar API, Multiple Placement Backends

Introduce a single player-bar host abstraction with two implementations:

- `native accessory` backend for iOS 26+
- `overlay fallback` backend for older iOS and Android

The rest of the app should not care which backend is active.

### Principle 2: Separate Visual Height From Content Reservation

Split the current `playerBottomBarHeight` contract into explicit concepts:

- `playerAccessoryVisualHeight`
- `playerAccessoryReservedContentInset`

This avoids forcing every screen to use the raw rendered height as if it were always the correct scroll reservation value.

### Principle 3: Centralize Bottom-Edge Geometry

There should be one source of truth for:

- bar placement relative to native tabs
- content bottom reservation
- any platform-specific native-tabs fallback numbers

Do not leave Android-only padding logic duplicated in both:

- [relisten/pages/tab_roots/TabRootStackLayout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/pages/tab_roots/TabRootStackLayout.tsx#L23)
- [app/relisten/tabs/(relisten)/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/_layout.tsx#L9)

### Principle 4: Preserve The Modal Player Contract

Keep `/relisten/player` as the expansion path for now. The redesign should improve the collapsed bar without entangling this track with the separate floating-sheet migration.

---

## Proposed Implementation Shape

### New/Changed Components

- Keep [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx) as the primary collapsed-bar UI module.
- Add a dedicated placement host, for example:
  - `relisten/player/ui/player_bar_host.tsx`
- Add a dedicated geometry contract module, for example:
  - `relisten/player/ui/player_bar_layout.ts`
- Reduce [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts) to a compatibility helper instead of making it the core long-term architecture.

### Placement Strategy

#### Backend A: Native Accessory

When supported, render the collapsed player bar through `NativeTabs.BottomAccessory` directly inside [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx).

Benefits:

- bar belongs to the native tab controller
- better visual and spatial integration
- less manual bottom anchoring logic
- less susceptibility to lazy-tab overlay jank

#### Backend B: Compatibility Overlay

For older iOS and Android:

- keep a shell-level mounted host
- keep placement stable
- use centralized fallback geometry
- preserve iOS scroll-under-tab behavior where desired

This backend should be treated as compatibility infrastructure, not the desired end state.

### Content Reservation Strategy

- `ScrollScreen` should consume the reserved content inset, not blindly assume the rendered bar height equals the right padding amount.
- Special-case manual inset consumers such as `source_details` should be audited and either normalized onto the shared contract or justified as exceptions.

---

## Execution Phases

### Phase 1: Lock the layout contract

- Introduce a dedicated player-bar layout contract module.
- Split visual height from reserved content inset.
- Centralize all bottom-edge geometry and remove duplicated Android-only layout math where possible.
- Keep visuals unchanged in this phase.

### Phase 2: Introduce the placement host

- Create a `PlayerBarHost` that chooses between:
  - native accessory backend
  - overlay fallback backend
- Keep `PlayerBottomBar` as the rendered collapsed content surface.
- Keep `/relisten/player` modal behavior unchanged.

### Phase 3: Adopt `NativeTabs.BottomAccessory` where supported

- Wire the iOS 26+ native accessory path into [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx).
- Preserve the compatibility overlay for older iOS and Android.
- Verify no tab-switch placement jank remains in the supported path.

### Phase 4: Visual redesign

- Apply inset geometry, rounded corners, and lighter visual chrome.
- Add glass/material treatment for supported iOS paths.
- Refine spacing for title, subtitle, transport controls, and scrubber.
- Keep the result visually compatible with the native tab bar.

### Phase 5: Scroll and inset cleanup

- Audit `ScrollScreen`, `source_details`, and any other manual bottom-reservation consumers.
- Ensure list-heavy screens still feel right:
  - content can scroll under tab glass on iOS
  - important content is not obscured by the player bar
  - no double-spacing or clipped bottoms

### Phase 6: Fallback hardening

- Validate older iOS compatibility path.
- Validate Android fallback path.
- Keep platform constants isolated and explicitly temporary.

---

## File Touchpoints

Primary files expected to change:

- [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx)
- [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx)
- [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts)
- [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx)
- [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/source_details.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/source/%5BsourceUuid%5D/source_details.tsx)
- [relisten/pages/tab_roots/TabRootStackLayout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/pages/tab_roots/TabRootStackLayout.tsx)
- [app/relisten/tabs/(relisten)/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/_layout.tsx)

Likely new files:

- `relisten/player/ui/player_bar_host.tsx`
- `relisten/player/ui/player_bar_layout.ts`

---

## Risks

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| `NativeTabs.BottomAccessory` support is limited to iOS 26+ | High | High | Treat native accessory as preferred backend, not universal backend |
| Fallback overlay path diverges visually from native accessory path | Medium | High | Keep one shared `PlayerBottomBar` content component and separate only placement/material wrappers |
| Content spacing regresses on list-heavy screens | High | Medium | Make scroll-heavy QA a blocking validation step |
| The redesign accidentally entangles with the player-sheet migration | Medium | Medium | Keep `/relisten/player` modal intact for this track |
| Platform constants remain forever | Medium | Medium | Isolate them in one compatibility module and explicitly track removal criteria |

---

## Validation Plan

### Checks

- `yarn lint`
- `yarn ts:check`

### iOS Manual Validation

- Verify collapsed player bar on compact iPhone shell.
- Verify the bar is visually inset and aligned with native tabs.
- Verify the bar does not overlap tabs.
- Verify the bar does not jump during lazy tab transitions.
- Verify list-heavy screens still scroll correctly under native tab glass.
- Verify tapping the bar still opens `/relisten/player`.

### Screenshot Set

- Artists root with active player bar
- My Library root with active player bar
- Offline root with active player bar
- Relisten root with active player bar
- One long scroll/list-heavy screen with active player bar
- One screenshot from the native-accessory path if running on supported iOS

### Android Manual Validation

- Verify fallback path placement and content spacing.
- Verify no overlap with tabs.
- Verify the collapsed bar still feels inset and intentional, even without iOS glass.

---

## Done Criteria

- The compact player bar is inset and visually aligned with the native tab system.
- iOS supported path uses `NativeTabs.BottomAccessory` where available.
- Older iOS and Android use a stable fallback path.
- The bar no longer relies on scattered per-layout bottom-edge heuristics.
- Scrollable content uses a cleaner shared reservation contract.
- The bar no longer visibly jumps during native tab transitions.
- `/relisten/player` modal behavior is preserved.
- Lint and typecheck pass.

---

## Recommended Implementation Prompt

Implement the player bar redesign described in `docs/player-bar-glass-redesign-plan.md`.

Requirements:

1. Keep `/relisten/player` modal behavior intact.
2. Treat `NativeTabs.BottomAccessory` as the preferred iOS 26+ placement path, not the universal path.
3. Keep a compatibility overlay fallback for older iOS and Android.
4. Separate visual player-bar height from content reservation inset.
5. Centralize bottom-edge geometry so `PlayerBottomBar`, `ScrollScreen`, and tab-root layouts all use one contract.
6. Redesign the compact player bar to be inset and glass-like on iOS, while keeping Android visually coherent with its own platform-appropriate material treatment.
7. Verify with `yarn lint`, `yarn ts:check`, and simulator screenshots for the compact iOS shell.
