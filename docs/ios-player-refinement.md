# iOS player refinement

The player keeps its concert-poster presentation and continuous queue scroll.
Compact views and queue rows show title, artist, and show date. The expanded
player also shows venue and location. Spoken actions include the full performance
context so recordings with the same title remain distinguishable.

## Behavior and constraints

- A seek before the first Play updates the displayed and saved position. Play
  starts at that position. Seeking never resumes paused playback.
- A seek during a track change joins the existing serialized play request. It
  cannot seek the previous native item. Repeated seeks retain the latest
  position; a newer track selection takes priority.
- Expanded and compact controls overlap during collapse. Visibility and input
  ownership share one transition policy. The outgoing header is masked without
  changing the measured scroll anchors. Existing snap behavior and presentation
  springs are unchanged. The section-header background follows the queue backdrop:
  transparent against the resting poster, opaque before rows scroll beneath it.
  Earlier queue and listening-history headers stay opaque while pinned.
- One centered downward chevron dismisses the player. The surrounding header
  also accepts a downward drag; there is no separate decorative grabber.
- Native visualizer bars expand equally above and below a fixed centerline.
  Resting dots use the same centerline, so amplitude changes do not shift the
  display vertically. Frequency order and amplitudes remain unchanged.
- Light impact feedback marks a committed open or close. Selection feedback
  marks manual Next, Previous, queue-row playback, and queue-menu Play Now.
  Cancelled drags, repeated endpoint requests, resets, autoplay, and individual
  scroll updates stay silent. Simulator tests verify these calls, not how the
  feedback feels on an iPhone.
- The right time label switches between duration and remaining time. Both
  headers share one persisted installation preference.
- Cast and AirPlay use native frames large enough for a 44-point button. AirPlay
  needs a 48-point view height because UIKit insets its internal button.
- External output names appear in the expanded player and mini-player. Route
  observation also runs while paused and does not activate the audio session.
- Queue metadata stacks at larger text sizes. The native tab accessory has a
  fixed height, so its metadata uses bounded text scaling and no vertical
  padding. Controls and progress fill UIKit's actual accessory frame. Progress
  sits inside its bottom edge; stacking it below the 48-point AirPlay view clips
  it on a 48-point accessory. Metadata uses its natural height so the row can
  center the text beside the controls. The expanded player retains its existing
  Dynamic Type behavior.

## Verification

Verified on iPhone 17 with iOS 27, primarily at normal text size and normal
motion: cold-restored seeking and subsequent Play, preference persistence after
termination, slow scroll and reversal, compact time-display synchronization,
chevron dismissal, a cancelled short drag, More-to-Equalizer navigation, and
repeat mode changes. Long artist names and output labels were checked using
temporary display-only samples; those samples are removed from the source.
The dismissed native mini-player was rechecked after correcting its vertical
alignment and clipped progress: paused and playing progress, repeated opening
and dismissal, and a longer artist name with an output label. Simulator frames
show a 44-by-44-point Play button and a 44-by-46.3-point AirPlay button.
Accessibility Large was checked last, then normal text size was restored.

The iOS native build, production Hermes export, TypeScript, lint, 141 app tests,
and 12 favorites tests pass. Playback tests exercise the actual player and queue
through driver calls, saved progress, and native event ordering.

Physical-device checks remain for VoiceOver focus and adjustment, AirPlay and
Bluetooth route changes, haptic feel, and frame pacing. Simulator accessibility
snapshots expose the scrubber value and adjustment actions; they do not replace
VoiceOver testing.

## Distribution

The output-route API adds native iOS code. Distribute this JavaScript with a new
iOS binary and its matching runtime. Do not publish it as an OTA update targeting
an older binary that lacks the new bridge methods. Use the repository's
`build_releases.sh` workflow when preparing a release.
