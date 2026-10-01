# Player interaction changes and validation

This change gives the player measured resting positions within its existing timeline:
History, Now Playing, and Queue. History beyond its first endpoint and queue rows
beyond the Queue position remain freely scrollable. It preserves the current show-poster
style and native iOS audio spectrum.

## Continuing goal and review standards

Give Alec a player with clear History, Now Playing, and Queue resting positions,
responsive native gestures, readable controls, and the approved visual hierarchy.
Preserve playback and queue behavior in the existing main worktree. Do not commit,
push, merge, or deploy during this task.

Apply [Codex development prompt templates](https://chatgpt.com/space/page_c2d80e22b8288191b4e8dbbe10ba26af)
(full current Page read on 2026-10-01, sequence 7): separate observed behavior from
inference; check assumptions against code and simulator evidence; keep component
ownership clear; prefer straightforward changes; verify public behavior; and
review changed code and writing with code-simplifier and deslop. Alec is the
product decision-maker; these notes are also for the next implementation reviewer.
The explicit no-commit boundary overrides the template's starting-point advice.

## Follow-up: waveform, compact extent, and History top edge

The two supplied screenshots show a hard background change above Earlier Listening
and the lower halves of the expanded utility controls below the compact header.
The latter has eight upcoming tracks. These are distinct from the previously
checked lower History boundary and empty-queue layout.

- Native spectrum bars now rise from a bottom baseline; the SVG fallback uses the
  same geometry. No audio-analysis data or smoothing behavior changed.
- Compact skip buttons have 8pt gaps on each side of play/pause. The spectrum has
  12pt above and 8pt below, adding 12pt to total compact height.
- Expanded controls finish fading before compact transport begins to appear.
  Their measured layout stays in the list, so snap offsets remain stable. A first
  video review caught cropped utility buttons during the transition; this change
  removes that overlap.
- Native list deceleration uses `fast`. The sheet release spring uses stiffness
  600, damping 32, mass 0.65, and permits a small overshoot. Finger tracking is
  unchanged; native scrolling still owns list snap releases.
- A shared background progress fades to the section-header color while browsing
  History, including negative top overscroll. Now Playing retains its gradient.
- Queue extent comes from individual row/header measurements, independent of the
  footer. The former total-content-minus-footer calculation could use mismatched
  layout callbacks while the footer changed. That feedback is removed. The footer
  fills the measured space needed to reach the compact endpoint even with no rows.
  This is a code-based explanation; the original report was not instrumented.

Native checks passed for the exact Way to Go Home / 8-track case, both scroll
release directions, repeated compact entry, History top rest and held overscroll,
and one-track/empty queues. Motion evidence is `iteration-gestures.mp4` and
`iteration-history-overscroll.mp4`; screenshots use the `iteration-` prefix.

## Final waveform and venue polish

The magnified supplied screenshot showed detached ticks beside the live bars.
Those ticks came from an independent dashed baseline. Resting dots now use the
same centers as the live bars; the native stroke is capped at 2pt rather than
1.5pt. Bottom-up geometry and the 10pt/16pt view heights are unchanged. The SVG
fallback removes its separate dashed baseline and uses a slightly thicker stroke.

Venue text is 14pt, light-weight, and uppercase, close to the 13pt uppercase
artist label above the date. Flexible side rules meet
the label with a 16pt gap; long names wrap to two lines without reducing font size.
Actual playing screenshots and nearest-neighbor close-ups were inspected. A
Red Rocks venue-name fixture verified two-line layout and was immediately removed;
Boston location/secondary metadata in that fixture remains intentionally real.
Native rebuild, 35 focused tests, TypeScript, lint, and diff checks passed.

## Reorder comparison with production

PR #152, commit `1dfa9c83f5096fb06882e54316ff17fdd6b7d480`, adds a `finished`
guard to the timing completion in `react-native-reorderable-list` 0.18.0. This
branch replaced that dependency with `react-native-draggable-flatlist` 4.0.3 in
`e4acfba`. Its equivalent guard is the small `if (!finished) return` check before
applying the drop. Copying the old library's patch would not affect this branch.

The additional background/finalize cleanup and cleared retained cell translation
address separately reproduced stuck-drag bugs. They are not required to express
PR #152's completion guard. Removing them would restore the observed HOME-during-
drag lock and stale translated rows. Review found no useful simplification that
preserved those fixes without introducing another cross-thread callback layer.

## Ownership and behavior

- The native list owns drag velocity, deceleration, and snapping. Measured player
  and compact-header heights determine the offsets. There is no JS timer
  that forces a scroll after release.
- Now Playing uses ordinary scrolling geometry, even though its wrapper remains
  registered with the sticky-header machinery for measurement. Only section
  headers pin. This prevents the player from showing through a lifted queue row.
- The compact player stays mounted. Native scroll progress drives its crossfade,
  translation, and scale. Reduced motion removes translation and scale. This is
  not a shared-element morph of individual date/title views.
- A date-only calendar tile sits beside song and artist text. Normal-size text is
  limited to two lines per field; the accessibility label retains complete text.
  Accessibility text sizes use a stacked layout. The compact iOS waveform uses
  the existing native audio renderer; its paused baseline is intentional.
- Reordering and scrubbing suspend snapping. A changed timeline cancels reorder
  ownership, and completion cannot apply old row indices to a replacement queue.
- Return waits for native arrival and committed accessibility visibility before
  requesting heading focus. A new drag cancels the pending return focus.
- Short queues receive enough bottom space to reach the Queue position. Oversized
  Now Playing content remains freely scrollable so large text cannot trap controls.
- The background uses measured SVG dimensions and per-instance gradient IDs to
  avoid the observed rectangular cutoff.

## Automated checks

Run from the repository after `nvm use`:

```sh
yarn test relisten/player/ui/player_{timeline_layout,queue_reorder,close_completion,navigation_contract,drag_cancellation}.test.ts
yarn ts:check
yarn lint
```

The focused tests check endpoint alignment, short-queue reachability, position
preservation as history/title/header size changes, and reorder ownership after
playback or external queue changes. They do not claim to simulate native gestures.

## Manual device checks

1. Slowly drag between Now Playing and Queue; release on both sides of the
   transition. Flick both ways. Each should settle predictably, and scrolling
   farther into Queue should remain free.
2. Lift a queue row, move it in both directions, cancel once, then drop it.
   No Now Playing content should show through the gap. Repeat while playback
   advances naturally; controls and later reorders must remain usable.
3. Scrub in both player sizes, interrupt a scrub, and immediately scroll. There
   should be no unwanted snap, seek, or persistent scroll lock.
4. Tap Up Next and Return repeatedly; interrupt an animated return with a new
   drag. Check with VoiceOver and Reduce Motion as well.
5. Try an empty/one-item remaining queue, a long artist/title, large text, and
   a track change while browsing Queue. The queue header should stay below
   compact transport and the current browsing position should remain stable.
6. Open, close, and reopen the player while paused and playing. Check the
   background for rectangular edges and the live visualizer for clipping.

## Verified on 2026-10-01

- Native Debug build succeeded and was installed on iPhone 17 / iOS 26.5.
- Final focused suite: 35 tests passed. TypeScript, full repository lint, and
  `git diff --check` passed. Persisted draggable-list patch reverse-apply check passed.
- Real simulator gestures via installed `idb` verified Now Playing/Queue snapping,
  free queue scrolling, History return, header dismissal, and mini-player reopening.
- Live native spectrum renders thinner strokes. Expanded and compact play/pause work.
- A real row drag/drop changed order; reverse drag restored the original order.
  Backgrounding during a held drag now restores controls without another touch,
  retains order, and clears held cell transforms. Long-press autoscroll can leave
  the queue below its initial offset; Up Next restores the measured endpoint.
- One-track and empty remaining queues verified using the actual final two tracks. Long title, artist,
  and venue layouts were checked using temporary display-only fixtures, then
  restored; no stored metadata was changed. Independent pixel review passed.
- Both Now Playing menu destinations succeeded repeatedly after the mitigation.
  Backgrounding immediately after selecting show navigation also restored the
  correct destination on reopening; no new diagnostic crash report appeared.
  The original native abort was not reproduced independently, so its fix remains
  provisional. Crash evidence points to a Worklets remote callback registry
  lifetime failure, but does not identify a particular JS callback. Each close
  now owns a fresh retained completion, canceled on interruption, and navigation
  waits for successful completion. Tests cover real component callback contracts
  with a mocked native scheduler; they do not prove native memory lifetime safety.

Evidence is in the task workspace `evidence/`: `expanded-clean-final.png`,
`queue-clean-final.png`, `history-clean-final.png`, `empty-queue-final.png`,
`one-track-compact-final.png`,
`reorder-cancel-final.png`, `reorder-restored-final.png`, and the two
`long-metadata-*-fixture.png` captures. Fixture captures are synthetic display data.

VoiceOver, accessibility font sizes, reduced-motion behavior, physical-device
memory/lifecycle stress, and natural track advancement during an active reorder
remain manual coverage gaps. No commit, push, merge, or deployment was performed.

## Signed EQ gain follow-up

Volume Gain now spans -30 to +12 dB, with 0 dB at the physical center and integer dB adjustment. The legacy `extraVolumeReductionDb` storage/bridge key retains old settings and presets. Native EQ global gain is the chosen gain minus existing automatic band headroom; there is no limiter and boost can distort loud recordings. Android still reports EQ unsupported.

Validated with four TypeScript tests including real Realm settings/preset persistence, 12 native configuration/output-graph tests, TypeScript, lint, and a fresh iOS simulator build. One existing native animation test hit its one-second timeout while compiling; all 12 passed on rerun after compilation. Actual simulator interaction reached both endpoints, saved/reopened positive gain, crossed zero during advancing playback, and reset to 0 dB while retaining the enabled state. Independent code and screenshot reviews completed. Final screenshots: +5 dB, 0 dB, -13 dB.

The previously exported 6.2.0 (6050) TestFlight IPA predates this EQ change. It remains unuploaded and must be rebuilt before distributing these changes. No OTA was published.
