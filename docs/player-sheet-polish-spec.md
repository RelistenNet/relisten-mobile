# Player Sheet Polish Spec (US-001)

This artifact defines the deterministic visual and gesture contract for player-sheet polish and the RN Debugger MCP scenario matrix used by implementation and QA.

## In Scope

### Route coverage

- `/relisten/tabs` host shell (`app/relisten/tabs/_layout.tsx`)
- `/relisten/tabs/(artists)` group and nested stack screens (`app/relisten/tabs/(artists,myLibrary,offline)/_layout.tsx`)
- `/relisten/tabs/(myLibrary)` group and nested stack screens (`app/relisten/tabs/(artists,myLibrary,offline)/_layout.tsx`)
- `/relisten/tabs/(offline)` group and nested stack screens (`app/relisten/tabs/(artists,myLibrary,offline)/_layout.tsx`)
- `/relisten/player` compatibility route must still redirect into `/relisten/tabs` behavior (`app/relisten/player.tsx`)

### UI surfaces and state sources

- Collapsed surface: `PlayerBottomBar` (`relisten/player/ui/player_bottom_bar.tsx`)
- Expanded surface and drag host: `PlayerSheetHost` (`relisten/player/ui/player_sheet_host.tsx`)
- Sheet state source: `player_sheet_state` (`relisten/player/ui/player_sheet_state.tsx`)

## Required States and Transition Invariants

### Required states

- `collapsed`: bottom player bar is visible and interactive.
- `expanded`: full player sheet is visible and interactive.
- `transitioning`: drag or settle animation between collapsed and expanded (not a resting state).

### Invariants (must always hold)

1. Exactly two resting snap states exist: `collapsed` and `expanded`.
2. Transition progress is continuous and monotonic with finger movement during drag.
3. The same visual surface must morph between states; no separate bottom-entry sheet may appear.
4. Scrollable tab content in covered routes must pass under the collapsed bar plane (no hard visual stop above bar).
5. Collapsed bar border radius, border edges, and shadow/elevation remain fully visible (no clipping artifacts) in idle, drag, and settle.
6. Gesture reversal (up then down or down then up before release) keeps continuity with no pop-in/pop-out.
7. `/relisten/player` compatibility entry preserves the same host behavior by routing into `/relisten/tabs`.

## RN Debugger MCP Scenario Matrix

Run each scenario on iOS and Android reference simulators/devices.

### PS-SCROLL-ARTISTS-001: scroll-under on artists tab

- Route/setup:
  - Navigate to `/relisten/tabs/(artists)`.
  - Ensure playback is active so the collapsed bar is visible.
  - Load a long list (enough rows to scroll past viewport).
- Steps:
  1. Fling vertically several times in both directions.
  2. Stop near list end and resume dragging.
- Expected assertions:
  - Rows visually move beneath the collapsed bar area.
  - There is no hard stop where list content freezes above the bar.
  - Final rows remain reachable (no inaccessible tail caused by incorrect inset/padding).

### PS-SCROLL-MYLIBRARY-002: scroll-under on my library tab

- Route/setup:
  - Navigate to `/relisten/tabs/(myLibrary)`.
  - Ensure collapsed bar is visible.
- Steps:
  1. Perform repeated slow and fast vertical scroll gestures.
- Expected assertions:
  - Content plane continues under the collapsed player surface.
  - Header/list transitions do not jump when crossing behind the bar.
  - Tap targets remain usable after content passes behind/under the bar.

### PS-SCROLL-OFFLINE-003: scroll-under on offline tab

- Route/setup:
  - Navigate to `/relisten/tabs/(offline)` with enough rows/items.
  - Ensure collapsed bar is visible.
- Steps:
  1. Scroll to top, middle, and end of list.
  2. Repeat with one fast fling and one slow drag.
- Expected assertions:
  - Content can pass under the collapsed bar in all tested positions.
  - No route-specific regression to clipped/unreachable bottom items.
  - Visual layering remains stable (bar above content; content still scrolls underneath).

### PS-CLIP-IDLE-004: clipped-border detection while collapsed/idle

- Route/setup:
  - Open `/relisten/tabs/(artists)` with collapsed bar visible.
- Steps:
  1. Inspect collapsed bar corners, top border edge, and shadow/elevation.
  2. Repeat after device rotation or safe-area variant (if available).
- Expected assertions:
  - All four rounded corners are fully rendered.
  - No border cut-off lines, corner clipping, or shadow truncation.
  - Visual integrity remains intact across safe-area variants.

### PS-CLIP-ANIM-005: clipped-border detection during drag and settle

- Route/setup:
  - Start from collapsed in `/relisten/tabs/(artists)`.
- Steps:
  1. Drag up partially and release.
  2. Drag down from expanded and release.
  3. Repeat at least 5 cycles.
- Expected assertions:
  - No frame shows clipped corners, border tears, or shadow cut-off.
  - Surface outline stays coherent throughout drag and settle.
  - No transient visual seams appear between collapsed and expanded surfaces.

### PS-CONTINUITY-UP-006: drag-up-from-collapsed-on-artists-tab

- Route/setup:
  - Navigate to `/relisten/tabs/(artists)` with collapsed bar visible.
- Steps:
  1. Touch collapsed bar and drag upward progressively to expanded.
  2. Repeat with slow drag and fast drag/release.
- Expected assertions:
  - The visible collapsed surface moves continuously with finger progress.
  - Expansion reads as one morphing surface, not a disappearing bar plus incoming sheet.
  - No separate bottom-entry sheet appears before continuity surface reaches expanded position.

### PS-CONTINUITY-DOWN-007: drag-down-from-expanded

- Route/setup:
  - Start from expanded player on `/relisten/tabs/(artists)`.
- Steps:
  1. Drag downward toward collapsed and release at different progress points.
- Expected assertions:
  - The same surface tracks downward continuously and settles to collapsed/expanded based on release.
  - No detached secondary surface appears during collapse.
  - Backdrop and surface opacity/shape changes remain synchronized with movement.

### PS-CONTINUITY-REVERSAL-008: mid-gesture reversal continuity

- Route/setup:
  - Start collapsed on `/relisten/tabs/(artists)`.
- Steps:
  1. Drag up to about 40-60% progress.
  2. Reverse direction before release and drag back down.
  3. Repeat from expanded with inverse direction.
- Expected assertions:
  - Surface follows reversal without jump discontinuities.
  - No pop-in/pop-out between collapsed and expanded representations.
  - Final settle target matches release position/velocity without visual desync.

## Completeness Gate (Negative Case)

A required scenario is incomplete if either condition is true:

1. Scenario steps are present but `Expected assertions` is missing.
2. `Expected assertions` exists but does not define explicit pass/fail checks tied to visible behavior.

This spec is only valid when every required scenario above includes explicit expected assertions.
