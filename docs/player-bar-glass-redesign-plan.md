# Feature Spec: Native-Tabs Player Bar Glass Redesign

**Date:** 2026-03-19
**Status:** Phase 6 Locally Verified, External Runtime Validation Pending

---

## Goal

Redesign the compact player bar so it feels native alongside the Expo Router native tabs shell:

- inset from the screen edges instead of full-bleed
- glass-like on iOS, lighter and calmer than the current blue slab
- visually tied to the native tab bar instead of stacked above it awkwardly
- stable during tab switches and lazy tab loads
- compatible with the current `/relisten/player` modal expansion path

This is a collapsed-player redesign track. It is not the floating-sheet migration.

---

## Scope

### In Scope

- compact player bar visual redesign
- compact player bar placement redesign
- a cleaner bottom-edge layout contract for the collapsed bar
- iOS-first glass/material treatment
- a compatibility fallback path for older iOS and Android
- cleanup of the current scroll/content reservation contract where needed

### Out of Scope

- replacing `/relisten/player` with an interactive sheet
- full player screen redesign
- desktop/iPad mode
- web
- tab information architecture changes

---

## Current Code Snapshot

### Shell Ownership

- The app now uses a native-tabs-only compact shell in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx#L1).
- Supported iOS mounts the compact player through a direct `NativeTabs.BottomAccessory` child in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx#L26).
- `PlayerBarHost` remains mounted after `NativeTabs` in [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx#L87) as the compatibility overlay fallback owner.
- `/relisten/player` is still a modal stack route in [app/relisten/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/_layout.tsx#L35).

### Player Bar Contract

- Compact-bar visuals now use an inset card shell with iOS material styling and Android elevated fallback in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx#L131).
- Shared collapsed-bar height is tracked in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx#L133).
- That height is provided app-wide by `RelistenPlayerBottomBarProvider` in [app/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/_layout.tsx#L213).
- Placement backend selection now lives in [relisten/player/ui/player_bar_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bar_layout.tsx#L81) and [relisten/player/ui/player_bar_host.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bar_host.tsx#L4).
- Development builds can now force `nativeTabsAccessory` or `overlay` with `EXPO_PUBLIC_PLAYER_BAR_PLACEMENT_BACKEND` in [relisten/player/ui/player_bar_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bar_layout.tsx#L99), while production continues to ignore that override.
- Absolute `bottom: nativeTabsBottomInset` positioning is now overlay-fallback-only in [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx#L152).
- Native-tab fallback geometry currently comes from [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts#L1).

### Scroll and Inset Contract

- `ScrollScreen` is now only a `flex: 1` wrapper in [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx#L1).
- Shared list wrappers apply collapsed-player bottom reservation through `usePlayerBottomScrollInset()` in:
  - [relisten/components/relisten_flat_list.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/relisten_flat_list.tsx#L17)
  - [relisten/components/relisten_section_list.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/relisten_section_list.tsx#L53)
- Shared `ScrollView` consumers can now use `usePlayerBottomScrollViewProps()` in [relisten/player/ui/player_bar_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bar_layout.tsx#L66), which only reserves manual bottom spacing on the overlay fallback backend.
- The explicit `ScrollView` backlog is now cleared in the current repo state, including the remaining show/source screens in:
  - [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/sources/index.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/sources/index.tsx#L82)
  - [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/index.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/source/%5BsourceUuid%5D/index.tsx#L321)

### Current Inset Ownership Map

| Surface type | Current owner | Current contract |
| --- | --- | --- |
| `FlatList` screens | `RelistenFlatList` | shared `usePlayerBottomScrollInset()` plus `scrollIndicatorInsets` |
| `FlashList` section screens | `RelistenSectionList` | shared `usePlayerBottomScrollInset()` plus `scrollIndicatorInsets` |
| manual `ScrollView` screens | screen-local code | per-screen `contentContainerStyle` and `scrollIndicatorInsets` |
| generic screen wrapper | `ScrollScreen` | no inset logic, only `flex: 1` |
| tab-stack outer layout on Android | tab-root layouts | shell padding via `useNativeTabsBottomInset()` |

### Current Problems

- Visual height, placement height, and content reservation are still too tightly coupled.
- `native_tabs_inset.ts` still relies on compatibility constants because the local native-tabs surface does not expose a cross-platform tab-bar-height API.
- The scroll-consumer contract is now centralized, but fallback verification still matters because supported iOS accessory mode reserves no manual bottom inset while overlay mode still does.
- The main remaining migration boundary is no longer `ScrollScreen`; it is fallback hardening and compatibility validation around the shell-level placement contract.

---

## Platform Reality

### Current Local Native-Tabs Surface

- The installed Expo Router surface exposes `NativeTabs.BottomAccessory` in the local types at [elements.d.ts](/Users/alecgorge/code/relisten/relisten-mobile/node_modules/expo-router/build/native-tabs/common/elements.d.ts#L201).
- `NativeTabsView` forwards that accessory into `react-native-screens` in [NativeTabsView.js](/Users/alecgorge/code/relisten/relisten-mobile/node_modules/expo-router/build/native-tabs/NativeTabsView.js#L63).

### Constraint

That accessory path is documented in the local surface as iOS 26+ only.

So the redesign must treat placement as two backends behind one player-bar API:

1. native accessory path on supported iOS
2. compatibility overlay path everywhere else

The spec should not pretend `BottomAccessory` is the universal answer today.

---

## Product Direction

### Desired Feel

The compact player bar should read as a native accessory attached to the tab system:

- inset from the left and right edges
- visually lighter than the current full-width slab
- rounded and material-like
- clearly tappable as the entry point into the full player
- spatially aligned with the native tab bar rather than vertically fighting it

### iOS Visual Direction

- translucent or blurred material treatment
- soft border/highlight and restrained shadow
- enough separation from the tab bar to read as its own surface
- scrubber and metadata retained, but with calmer chrome than the current implementation

### Android Visual Direction

- no fake iOS blur
- use an inset elevated card with similar spacing and hierarchy
- keep behavior and footprint aligned with iOS, even if the material treatment differs

---

## Architecture Direction

### Principle 1: One Collapsed Player UI, Multiple Placement Backends

Keep one collapsed-player content component and separate only the placement wrapper:

- native accessory backend
- compatibility overlay backend

The rest of the app should not care which backend is active.

### Principle 2: Separate Visual Height From Reserved Content Inset

The current contract still encourages consumers to treat the rendered bar height as the only bottom-spacing number. The redesign should make the intended values explicit:

- collapsed player visual height
- reserved content inset for scroll surfaces
- placement offset relative to native tabs

These should be derived in one place, not improvised per screen.

### Principle 3: One Bottom-Edge Geometry Module

Centralize:

- placement offset for the collapsed bar
- reserved content inset for lists and scroll views
- platform compatibility constants
- supported-native-accessory detection

Do not leave this split across:

- [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx)
- [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts)
- explicit per-screen scroll consumers

### Principle 4: Preserve The Modal Player Contract

Keep `router.push('/relisten/player')` as the expansion path for this track. The redesign should improve the collapsed bar without mixing in the floating-sheet migration.

---

## Proposed Implementation Shape

### Components and Modules

Keep [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx) as the collapsed-player UI module, but split responsibilities around it.

Add:

- `relisten/player/ui/player_bar_host.tsx`
  - chooses native accessory vs overlay fallback
  - owns placement backend selection
- `relisten/player/ui/player_bar_layout.ts`
  - central source of truth for collapsed-player visual height, reserved content inset, and fallback offsets

Reduce [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts) to a compatibility helper used by `player_bar_layout.ts`, not the entire architecture.

### Placement Backends

#### Backend A: Native Accessory

When supported, mount the collapsed player through `NativeTabs.BottomAccessory` inside [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx#L23).

Benefits:

- the player belongs to the tab controller
- less shell-level absolute positioning
- better visual integration with native glass
- lower chance of lazy-tab placement jank

#### Backend B: Compatibility Overlay

For older iOS and Android:

- keep a shell-level mounted host
- keep placement stable and centralized
- keep the same collapsed-player content component
- treat this as compatibility infrastructure, not the long-term ideal

### Scroll Reservation Strategy

- Shared list wrappers should consume the reserved content inset from `player_bar_layout.ts`.
- Explicit `ScrollView` consumers should either move onto the shared contract or remain documented exceptions.
- `ScrollScreen` should stay a generic wrapper and not regain hardcoded bottom padding.
- Preferred target pattern for manual consumers: a shared hook or helper that returns the right `contentContainerStyle` and `scrollIndicatorInsets` payload, instead of repeating the same math in each screen.

---

## File Touchpoints

Primary files expected to change:

- [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx)
- [relisten/player/ui/player_bottom_bar.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/player_bottom_bar.tsx)
- [relisten/player/ui/native_tabs_inset.ts](/Users/alecgorge/code/relisten/relisten-mobile/relisten/player/ui/native_tabs_inset.ts)
- [relisten/components/relisten_flat_list.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/relisten_flat_list.tsx)
- [relisten/components/relisten_section_list.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/relisten_section_list.tsx)
- [relisten/components/screens/ScrollScreen.tsx](/Users/alecgorge/code/relisten/relisten-mobile/relisten/components/screens/ScrollScreen.tsx)
- [app/relisten/tabs/(relisten)/index.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/index.tsx)
- [app/relisten/tabs/(relisten)/recently-played.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28relisten%29/recently-played.tsx)
- [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/sources/index.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/sources/index.tsx)
- [app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/index.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/%28artists,myLibrary,offline%29/%5BartistUuid%5D/show/%5BshowUuid%5D/source/%5BsourceUuid%5D/index.tsx)

Likely new files:

- `relisten/player/ui/player_bar_host.tsx`
- `relisten/player/ui/player_bar_layout.ts`

---

## Execution Plan

### Phase 1: Lock the bottom-edge contract

- Create `player_bar_layout.ts`.
- Move collapsed-player geometry decisions there.
- Define explicit values for:
  - `visualHeight`
  - `reservedContentInset`
  - `placementOffset`
- Keep visuals unchanged in this phase.
- Preserve the current simulator-verified iOS content-spacing behavior while extracting the contract.

### Phase 2: Introduce `PlayerBarHost`

- Create `PlayerBarHost` and move shell-level mounting logic out of [app/relisten/tabs/_layout.tsx](/Users/alecgorge/code/relisten/relisten-mobile/app/relisten/tabs/_layout.tsx).
- Keep `PlayerBottomBar` as the collapsed-player content renderer.
- Keep `/relisten/player` modal behavior unchanged.

### Phase 3: Add native accessory backend

- Implement the supported-iOS `NativeTabs.BottomAccessory` path in `PlayerBarHost`.
- Keep overlay fallback for older iOS and Android.
- Do not redesign visuals yet; first prove placement parity and stable tab-switch behavior.

### Phase 4: Redesign the collapsed bar visuals

- Apply inset card geometry.
- Add iOS material treatment.
- Add Android-compatible elevated fallback treatment.
- Refine typography, spacing, controls, and scrubber treatment to match the new shell.
- Keep the interaction model unchanged: tap still opens `/relisten/player`.

### Phase 5: Normalize scroll consumers

- Move shared list wrappers onto the new layout contract.
- Audit the explicit `ScrollView` consumers listed above.
- Remove redundant one-off spacing logic where it is no longer needed.
- Re-verify long-list screens with playback active.

#### Manual-consumer backlog

Cleared in the current repo state.

### Phase 6: Fallback hardening

- Validate older iOS compatibility behavior.
  Local blocker: only iOS 26.x simulator runtimes are installed on this machine.
- Validate Android fallback behavior.
  Local blocker: a local AVD now boots, the debug APK installs, Metro connects, and the app renders on Android, but active playback validation still requires reliable in-app automation or manual emulator interaction because `adb input tap` was only dependable for native tab controls during this chunk.
- Leave compatibility constants isolated and explicitly temporary.

---

## Validation Plan

### Required Checks

- `yarn lint`
- `yarn ts:check`

### iOS Manual Validation

- compact iPhone shell with active playback
- tab switching with playback active
- no overlap with native tabs
- no large dead gap above the player bar
- list-heavy screens still scroll under tab glass where appropriate
- bottom rows and scroll indicators clear the collapsed player bar
- tapping the bar still opens `/relisten/player`

### Screenshot Set

- Artists root with active player bar
- My Library root with active player bar
- Offline root with active player bar
- Relisten root with active player bar
- one long list-heavy artists/my-library screen with active player bar
- one screenshot of the native accessory backend on supported iOS, if available locally

### Android Validation

- fallback path placement
- no overlap with tabs
- content spacing still clears the collapsed player bar
- visual treatment still feels intentional even without iOS glass

---

## Risks

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| `NativeTabs.BottomAccessory` support is limited to supported iOS only | High | High | Treat it as preferred backend, not universal backend |
| Overlay fallback diverges visually from the native accessory path | Medium | High | Keep one collapsed-player content component and separate only placement/material wrappers |
| Scroll spacing regresses on long-list screens | High | Medium | Make list-heavy simulator QA a blocking step |
| Visual redesign accidentally changes the `/relisten/player` expansion contract | Medium | Medium | Keep route expansion behavior unchanged during this track |
| Compatibility constants become permanent | Medium | Medium | Isolate them in `player_bar_layout.ts` and document them as fallback-only |

---

## Done Criteria

- The collapsed player bar is inset and visually aligned with the native tab system.
- Supported iOS uses `NativeTabs.BottomAccessory` where available.
- Older iOS and Android have a stable fallback path.
- Bottom-edge geometry is centralized in one module.
- Scroll surfaces use a cleaner shared reservation contract.
- `/relisten/player` modal behavior is preserved.
- `yarn lint` and `yarn ts:check` pass.
- Compact iOS simulator screenshots show correct placement and spacing with playback active.

---

## Recommended Implementation Prompt

Implement the player bar redesign described in `docs/player-bar-glass-redesign-plan.md`.

Requirements:

1. Keep `/relisten/player` modal behavior intact.
2. Treat `NativeTabs.BottomAccessory` as the preferred supported-iOS placement path, not the universal path.
3. Keep a compatibility overlay fallback for older iOS and Android.
4. Centralize collapsed-player geometry in one module and stop spreading bottom-edge math across the shell and scroll consumers.
5. Separate placement offset from reserved content inset.
6. Redesign the compact player bar to be inset and glass-like on iOS, while keeping Android coherent with its own platform-appropriate material treatment.
7. Verify with `yarn lint`, `yarn ts:check`, and compact iOS simulator screenshots with playback active.

## Manual Notes 

[keep this for the user to add notes. do not change between edits]

## Changelog
- 2026-03-19: Refined the supported-iOS `NativeTabs.BottomAccessory` compact bar press targets in `relisten/player/ui/player_bottom_bar.tsx` by separating the play button from the row-level `/relisten/player` pressable, so button taps no longer route through the whole-bar interaction target.
- 2026-03-19: Refined the supported-iOS `NativeTabs.BottomAccessory` compact bar again in `relisten/player/ui/player_bottom_bar.tsx` by giving the accessory path more vertical room, insetting the thin progress line from the rounded ends, and re-centering the transport and utility buttons within the taller single-row layout.
- 2026-03-19: Refined the supported-iOS `NativeTabs.BottomAccessory` compact bar in `relisten/player/ui/player_bottom_bar.tsx` by removing the accessory-only inner shell and replacing the clipped scrubber capsule with a thin inline progress line, so the bar no longer looks cut off or like a pill inside a pill on the iPhone simulator.
- 2026-03-19: Advanced Phase 6 Android runtime validation again by booting `Medium_Phone_API_36.1`, installing `android/app/build/outputs/apk/debug/app-debug.apk`, launching the app, connecting Metro, and capturing Android shell screenshots. The app now reaches the Artists/My Library tabs on the emulator, but compact-bar fallback validation remains incomplete because active playback could not be reached via reliable `adb` interaction with React Native content during this chunk.
- 2026-03-19: Advanced Phase 6 runtime validation by proving the Android path is no longer blocked by missing tooling: `Medium_Phone_API_36.1` boots locally, the default `java` 25 environment fails Gradle with `Unsupported class file major version 69`, and retrying `expo run:android` under Android Studio's bundled JDK 21 reaches deep native build execution. Android fallback runtime verification still remains incomplete because the cold debug build/install did not finish within this chunk.
- 2026-03-19: Closed the remaining local Phase 6 audit by reconfirming that no manual scroll/inset consumers still bypass the shared player-bar contract, rerunning `yarn lint` and `yarn ts:check`, and documenting that the only remaining Phase 6 work is external runtime validation on a natural older-iOS fallback environment and an Android emulator/device.
- 2026-03-19: Expanded Phase 6 iOS validation by rerunning the forced `overlay` fallback and restored default accessory backend on the iPhone 17 Pro simulator with playback active, confirming compact-bar placement and `/relisten/player` tap-through on both paths. Natural older-iOS fallback and Android fallback runtime validation remain blocked locally because only iOS 26.x runtimes are installed and no Android emulator/device is attached.
- 2026-03-19: Advanced Phase 6 by adding a development-only `EXPO_PUBLIC_PLAYER_BAR_PLACEMENT_BACKEND` override in `relisten/player/ui/player_bar_layout.tsx`, then validating the forced overlay fallback path on the iPhone 17 Pro simulator with playback active, long-list spacing, and `/relisten/player` tap-through preserved. Android fallback runtime validation remains blocked locally because no emulator/device is available.
- 2026-03-19: Started Phase 6 fallback hardening by extracting a pure compatible-native-tabs inset calculator in `relisten/player/ui/native_tabs_inset.ts`, keeping the compatibility constants isolated behind one helper before runtime fallback validation on older iOS and Android.
- 2026-03-19: Completed Phase 5 by migrating the remaining show/source `Animated.ScrollView` consumers in `app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/sources/index.tsx` and `app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/index.tsx` onto `usePlayerBottomScrollViewProps()`, removing the last screen-local bottom inset math from the current backlog.
- 2026-03-19: Advanced Phase 5 by migrating `app/relisten/tabs/(artists,myLibrary,offline)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/source_details.tsx` onto `usePlayerBottomScrollViewProps()`, removing one more screen-local bottom inset implementation from the manual backlog while preserving the existing `ScrollScreen` wrapper behavior.
- 2026-03-19: Advanced Phase 5 by adding `usePlayerBottomScrollViewProps()` for shared `ScrollView` consumers, migrating the two Relisten `ScrollView` screens onto that helper, and making reserved bottom scroll inset backend-aware so supported iOS accessory screens do not add duplicate manual spacing.
- 2026-03-19: Completed Phase 4 by redesigning `relisten/player/ui/player_bottom_bar.tsx` into an inset compact card with iOS material styling, Android elevated fallback styling, refined controls, and preserved `/relisten/player` expansion; verified with lint, typecheck, simulator playback, long-list spacing, and compact-bar tap-through to the modal player.
- 2026-03-19: Completed Phase 3 by wiring the supported-iOS `NativeTabs.BottomAccessory` backend with a direct `NativeTabs` child in `app/relisten/tabs/_layout.tsx`, while keeping `PlayerBarHost` as the overlay fallback path and preserving `/relisten/player`.
- 2026-03-19: Completed Phase 2 by introducing `player_bar_host.tsx` and moving shell-level compact-player mounting out of `app/relisten/tabs/_layout.tsx`; Phase 3 native accessory backend is next.
- 2026-03-19: Completed Phase 1 bottom-edge contract extraction by introducing `player_bar_layout.tsx` as the shared geometry/provider module; Phase 2 `PlayerBarHost` is next.
- 2026-03-19: Rewrote the spec to match the current native-tabs shell, current inset contract, and the intended native-accessory plus fallback redesign path (019d0332-81b4-7af1-b96d-bca17aed8071)
