# Player Sheet Polish RN Debugger Regression (US-006)

This run executes the approved scenario matrix from `docs/player-sheet-polish-spec.md` and records deterministic pass/fail outcomes for scroll-under, clipping integrity, and bar-transform continuity.

## Run Metadata

- Story: `US-006`
- Run ID: `20260213-191642-58230` (iteration `6`)
- Date: `2026-02-14`
- iOS target: `com.alecgorge.ios.Listen-to-the-Dead` on `iPhone 17 Pro`
- Android target: unavailable (`adb` missing in environment)

## Pass/Fail Contract

- `SCROLL` scenarios pass only when content visibly scrolls under the collapsed bar and bottom rows remain reachable.
- `CLIP` scenarios pass only when no border/corner/shadow clipping appears in idle/drag/settle states.
- `CONTINUITY` scenarios pass only when one surface tracks gesture progress/reversal without a separate bottom-entry sheet.

These criteria are taken from the `Expected assertions` sections for `PS-SCROLL-*`, `PS-CLIP-*`, and `PS-CONTINUITY-*` in `docs/player-sheet-polish-spec.md`.

## Execution Evidence

### RN Debugger MCP command outcomes

1. `scan_metro` -> PASS  
   Result: connected to iOS app on port `8081`.
2. `get_apps` -> PASS  
   Result: iOS app listed as connected.
3. `list_android_devices` -> FAIL  
   Result: `ADB is not installed or not in PATH.`
4. `ensure_connection` -> PASS  
   Result: health check passed.
5. `ocr_screenshot(platform=ios)` -> FAIL  
   Result: `Transport closed`.
6. `ensure_connection(forceRefresh=true)` (single reconnect attempt) -> FAIL  
   Result: `Transport closed`.
7. `ios_screenshot` -> FAIL  
   Result: `Transport closed`.

### Fallback artifact

- `xcrun simctl io booted screenshot .ralph/screenshots/us006-ios-fallback-current.png` -> PASS
- Artifact: `.ralph/screenshots/us006-ios-fallback-current.png`
- Route/state context from artifact: `/relisten/tabs` artists tab visible, collapsed player bar present, playback active.

## Scenario Outcome Matrix

Status keys:
- `PASS`: all required assertions verified in app
- `FAIL`: required assertions not met or required tooling unavailable

| Scenario ID | Category | Route/State Context | iOS | Android | Failure Artifact / Repro Context |
| --- | --- | --- | --- | --- | --- |
| `PS-SCROLL-ARTISTS-001` | SCROLL | `/relisten/tabs/(artists)` collapsed | FAIL | FAIL | iOS: `Transport closed` on first gesture/screenshot call after healthy connection. Android: `adb` missing. Artifact: `.ralph/screenshots/us006-ios-fallback-current.png` |
| `PS-SCROLL-MYLIBRARY-002` | SCROLL | `/relisten/tabs/(myLibrary)` collapsed | FAIL | FAIL | iOS automation unavailable due `Transport closed`; could not navigate and execute scripted scroll. Android blocked by missing `adb`. |
| `PS-SCROLL-OFFLINE-003` | SCROLL | `/relisten/tabs/(offline)` collapsed | FAIL | FAIL | iOS automation unavailable due `Transport closed`; could not navigate and execute scripted scroll. Android blocked by missing `adb`. |
| `PS-CLIP-IDLE-004` | CLIP | `/relisten/tabs/(artists)` collapsed idle | FAIL | FAIL | iOS idle baseline screenshot captured, but RN Debugger assertions unavailable due `Transport closed`. Android blocked by missing `adb`. |
| `PS-CLIP-ANIM-005` | CLIP | `/relisten/tabs/(artists)` drag/settle | FAIL | FAIL | Gesture and settle cycle execution blocked on iOS (`Transport closed`) and Android (`adb` missing). |
| `PS-CONTINUITY-UP-006` | CONTINUITY | collapsed drag-up on artists | FAIL | FAIL | Could not execute drag-up gesture checks because RN Debugger transport closed; Android unavailable. |
| `PS-CONTINUITY-DOWN-007` | CONTINUITY | expanded drag-down on artists | FAIL | FAIL | Could not execute expanded-state drag-down checks because RN Debugger transport closed; Android unavailable. |
| `PS-CONTINUITY-REVERSAL-008` | CONTINUITY | mid-gesture reversal | FAIL | FAIL | Could not execute reversal assertions because RN Debugger transport closed; Android unavailable. |

## Gate Result

- Required scenario gate: `FAILED`
- Blocking reason:
  - iOS RN Debugger MCP interaction tools returned repeated `Transport closed` errors after one reconnect attempt.
  - Android RN Debugger MCP execution blocked because `adb` is not installed.
- Completion policy impact: US-006 remains blocked until the scenario matrix can be executed and required assertions pass on both reference targets.
