# Player Sheet Production Polish Signoff (US-007)

## Metadata

- Story: `US-007`
- Run: `20260213-191642-58230` (iteration `7`)
- Date: `2026-02-13` (PST)
- Scope: final production-polish signoff and rollback-safe release guardrails
- Signoff status: `BLOCKED`

## Evidence Inputs

- Scenario contract: `docs/player-sheet-polish-spec.md`
- Regression matrix run: `docs/player-sheet-polish-regression-us006.md`
- Manual fallback screenshots:
  - `.ralph/screenshots/us006-ios-fallback-current.png`
  - `.ralph/screenshots/us007-tabs-collapsed-spotcheck.png`
  - `.ralph/screenshots/us007-player-compat-spotcheck.png`
  - `.ralph/screenshots/us007-tabs-post-player-spotcheck.png`
- Compatibility entry implementation: `app/relisten/player.tsx`
- Host shell implementation: `app/relisten/tabs/_layout.tsx`
- Clipping and continuity implementation references:
  - `a0d2409` (`relisten/player/ui/player_bottom_bar.tsx`, `relisten/player/ui/player_sheet_host.tsx`)
  - `8e0e4e2` (`relisten/player/ui/player_bottom_bar.tsx`, `relisten/player/ui/player_sheet_host.tsx`)
  - `84e1117` (`relisten/player/ui/player_sheet_host.tsx`)

## UI Verification Checklist (US-007)

1. `/relisten/tabs` collapsed state renders with primary tab shell intact.
   - Method: manual simulator deep link + screenshot fallback.
   - Evidence: `.ralph/screenshots/us007-tabs-collapsed-spotcheck.png`.
   - Result: `PASS` (collapsed bar visible, tab shell still rendered).
2. `/relisten/player` compatibility entry does not regress into a broken navigation surface.
   - Method: `xcrun simctl openurl booted "relisten://relisten/player"` then screenshot fallback.
   - Evidence: `.ralph/screenshots/us007-player-compat-spotcheck.png`, `app/relisten/player.tsx` redirect logic.
   - Result: `PASS` for compatibility-shell stability, `LIMITED` for expand-state verification (see blockers).
3. `/relisten/tabs` remains stable after compatibility-entry attempt.
   - Method: return deep link to tabs and capture another screenshot.
   - Evidence: `.ralph/screenshots/us007-tabs-post-player-spotcheck.png`.
   - Result: `PASS`.
4. Collapsed/expanded gesture continuity assertions (`PS-CONTINUITY-*`).
   - Method: RN Debugger MCP interaction tooling.
   - Evidence: `Transport closed` failures in `docs/player-sheet-polish-regression-us006.md` plus US-007 rerun failures in `.ralph/errors.log`.
   - Result: `BLOCKED`.
5. Scroll-under and clipping scenario assertions (`PS-SCROLL-*`, `PS-CLIP-*`).
   - Method: RN Debugger MCP scenario matrix.
   - Evidence: scenario outcomes in `docs/player-sheet-polish-regression-us006.md`.
   - Result: `BLOCKED`.

## Success Metric Traceability

| PRD success metric | Evidence | Status |
| --- | --- | --- |
| Content scrolls under collapsed player across in-scope tab list screens | `docs/player-sheet-polish-regression-us006.md` (`PS-SCROLL-ARTISTS-001`, `PS-SCROLL-MYLIBRARY-002`, `PS-SCROLL-OFFLINE-003`) | `BLOCKED` (required RN Debugger assertions unavailable) |
| Collapsed bar radius/stroke/shadow render without clipping on iOS/Android | `a0d2409` implementation refs + `.ralph/screenshots/us007-tabs-collapsed-spotcheck.png` + `docs/player-sheet-polish-regression-us006.md` (`PS-CLIP-*`) | `PARTIAL` (manual iOS spot check positive, required matrix still blocked) |
| Drag-up/drag-down/reversal show one morphing continuity surface | `8e0e4e2` + `84e1117` implementation refs + `docs/player-sheet-polish-regression-us006.md` (`PS-CONTINUITY-*`) | `BLOCKED` |
| RN Debugger MCP validation scenarios pass in final verification run | US-006 matrix + US-007 rerun attempts (`ocr_screenshot`, reconnect, `scan_metro`, `get_connection_status`) recorded in `.ralph/errors.log` | `FAIL` (`Transport closed`; Android `adb` unavailable in latest validated run) |
| `yarn lint` and `yarn ts:check` pass | Final US-007 command run results (see "Quality Gates") | `PASS` |

## Before/After References For Prior Defects

- Clipping defect:
  - Before reference: PRD US-003 negative case (cut-off border/shadow during animation) captured in `docs/player-sheet-polish-spec.md` (`PS-CLIP-*` assertions).
  - After reference: `a0d2409` updates non-clipping wrappers and explicit stroke in `relisten/player/ui/player_bottom_bar.tsx` and `relisten/player/ui/player_sheet_host.tsx`.
- Continuity defect:
  - Before reference: PRD US-004 negative case (separate bottom-entry sheet) described in `docs/player-sheet-polish-spec.md` (`PS-CONTINUITY-*` assertions).
  - After reference: `8e0e4e2` introduces shared continuity geometry layer and `84e1117` ensures drag interruption tracks finger immediately on Android.

## Quality Gates

- `source ~/.nvm/nvm.sh && nvm use >/dev/null && yarn lint` -> `PASS`
- `source ~/.nvm/nvm.sh && nvm use >/dev/null && yarn ts:check` -> `PASS`
- `source ~/.nvm/nvm.sh && nvm use >/dev/null && CI=1 npx expo run:ios --device "iPhone 17 Pro" --no-bundler --no-install` -> `PASS`
- RN Debugger MCP scenario matrix -> `FAIL`/`BLOCKED` (`Transport closed`; prior Android run also blocked by missing `adb`)

## Rollback-Safe Guardrails

1. Release stays blocked while any required success metric remains `BLOCKED`, `FAIL`, or `PARTIAL` without required RN Debugger scenario evidence.
2. If post-merge visual regression is reported before RN Debugger is restored, rollback should be targeted by defect class:
   - Continuity regressions: revert `84e1117` and `8e0e4e2` together.
   - Clipping regressions: revert `a0d2409`.
   - Scroll-under regressions: revert `e3fcb92`.
3. After any rollback, rerun `yarn lint`, `yarn ts:check`, and the full `PS-*` RN Debugger matrix before re-approving release.

## Final Decision

Production polish signoff is `BLOCKED` for US-007 at this run state.

Blocking reasons:
- Required RN Debugger MCP gesture/visual assertions could not be completed due repeated `Transport closed` failures.
- Final scenario matrix does not contain passing required `PS-SCROLL-*`, `PS-CLIP-*`, and `PS-CONTINUITY-*` evidence on reference targets.
