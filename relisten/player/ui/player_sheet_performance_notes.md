# Player Sheet Drag-Critical Performance Guardrails

This note documents the drag-path guardrails introduced for US-007.

## Implementation Guardrails

- Heavy queue rendering is deferred in the embedded sheet by `PlayerSheetHost`.
- `EmbeddedPlayerScreen` receives `shouldRenderQueue` and shows a lightweight placeholder while the sheet is collapsed or settling.
- Queue list mounting is delayed by `EMBEDDED_QUEUE_RENDER_DELAY_MS` after the sheet reaches expanded state.
- Dev-only markers are emitted from `player_sheet_host.tsx` under logger scope `player-sheet-transition`:
  - `[marker] gesture_start`
  - `[marker] gesture_end`
  - `[marker] transition_start`
  - `[marker] transition_complete`
  - `[marker] queue_gate`

## Qualitative Pass Criteria

- During repeated iOS drag/open/close cycles, the sheet follows the finger continuously without recurring hitch bursts.
- During active drag with a large queue, queue list mounting does not occur until after expand settle, and drag remains responsive.
- Manual profiling should not show repeated React render storms triggered by queue list work during active drag.

## Reference-Device Validation Steps

1. Use a reference iOS device (for example iPhone 14 class hardware on iOS 17+).
2. Populate a queue with enough tracks to make list rendering non-trivial (for example 150+ tracks).
3. Open the player sheet, then perform 15-20 repeated drag cycles (up/down with fast and slow releases).
4. Observe the sheet visually for hitch bursts while dragging.
5. In dev logs, confirm `queue_gate` mount markers happen after expand transitions, not during active drag movement.
6. Capture at least one profiling sample; verify no recurring queue-driven render bursts on the drag-critical path.
7. Repeat a shorter run on a reference Android device to ensure defer behavior does not regress expand/collapse responsiveness.
