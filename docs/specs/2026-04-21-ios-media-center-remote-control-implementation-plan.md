# iOS Media Center and Remote Control Implementation Plan

**Date:** 2026-04-21  
**Status:** Planning  
**Scope:** iOS native playback backend, Media Center / Now Playing, remote commands, audio-session interruptions, route changes, gapless transition presentation

## Summary

Relisten should behave like a normal iOS music app. The lock screen and Control Center should show a coherent Relisten item when Relisten is active or meaningfully resumable, phone-call-style interruptions should preserve the user's listening context, and another app taking over playback should not leave Relisten stuck on the lock screen.

The implementation should replace split Media Center writes with one backend-owned presentation decision and one atomic writer. The important design point is that app/render state and Media Center transport state are related but not identical: during active buffering, JS can show a stalled/buffering state while Media Center still uses `.playing` and `MPNowPlayingInfoPropertyPlaybackRate = 1.0` because the user asked playback to continue.

## Execution Principles

| Principle | Meaning for implementation |
| --- | --- |
| One presentation authority | Every Now Playing write comes from one resolved backend intent. No split metadata/state updates. |
| Separate app state from Media Center intent | JS `.Playing` means render confirmed or grace-window startup; Media Center `.playing` can also represent active buffering. |
| Preserve user intent | User pause, route-loss pause, interruption suspension, external media takeover, and stop are distinct states. |
| Yield when another media app takes over | Spotify or another primary audio app should be able to replace Relisten on the lock screen. |
| Keep transport native and queue policy in JS | Native owns current-track play/pause/toggle/seek. JS owns next/previous queue decisions. |
| Prefer a small model | Add explicit fields and one presentation intent. Avoid several single-use reducer abstractions. |

## Scope

| In scope | Out of scope |
| --- | --- |
| `PlaybackPresentationController` atomic write API | JS queue redesign |
| `GaplessMP3PlayerBackend` presentation decision | Moving queue ownership into native |
| Remote command routing and seek rejection | Android behavior |
| Interruption, secondary-audio hint, route-change handling | A broad native streamable catalog |
| Gapless transition metadata coherence | A rollback flag unless the final patch becomes unusually invasive |
| Focused Swift support tests and device verification | Reusing the old `docs/superpowers/plans/...` execution workflow |

## Apple APIs To Consider

The enum values below were verified against the local Xcode iPhoneOS 26.2 SDK headers. The links point to the corresponding Apple documentation pages.

| Area | API / Values | Implementation implication |
| --- | --- | --- |
| Now Playing center | [`MPNowPlayingInfoCenter`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter), `nowPlayingInfo`, `playbackState` | `nowPlayingInfo = nil` clears metadata. Set playback state defensively, but do not rely on it as the only iOS truth because audio session state also matters. |
| Playback state | `MPNowPlayingPlaybackState`: `.unknown`, `.playing`, `.paused`, `.stopped`, `.interrupted` | Use `.playing` for active playback intent, including buffering; `.paused` for user/route pause; `.interrupted` for temporary interruption or unrecoverable render failure; `.stopped` when clearing. |
| Playback rate | [`MPNowPlayingInfoPropertyPlaybackRate`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfopropertyplaybackrate) | Use `1.0` for desired playback, including buffering/awaiting audio. Use `0.0` for pause, interruption, stopped, and external-media suppression. |
| Elapsed time | [`MPNowPlayingInfoPropertyElapsedPlaybackTime`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfopropertyelapsedplaybacktime) | iOS extrapolates elapsed from elapsed + rate, so every rate transition must write an elapsed anchor in the same snapshot. |
| Metadata | `MPMediaItemPropertyTitle`, `Artist`, `AlbumTitle`, `PlaybackDuration`, `Artwork` | Publish metadata, duration, elapsed, rate, artwork, and playback state coherently. |
| Remote commands | [`MPRemoteCommandCenter`](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter) | Enable only supported commands. Native handles play/pause/toggle/change-position. JS handles next/previous. |
| Seek event | [`MPChangePlaybackPositionCommandEvent`](https://developer.apple.com/documentation/mediaplayer/mpchangeplaybackpositioncommandevent), `positionTime` | Return `.commandFailed` when no current streamable or duration exists. |
| Interruption notification | [`AVAudioSession.interruptionNotification`](https://developer.apple.com/documentation/avfaudio/avaudiosession/interruptionnotification) | Read `AVAudioSessionInterruptionTypeKey`, ended-only `AVAudioSessionInterruptionOptionKey`, and began-only `AVAudioSessionInterruptionReasonKey` where available. |
| Interruption values | `AVAudioSession.InterruptionType`: `.began`, `.ended`; `InterruptionOptions`: `.shouldResume`; `InterruptionReason`: `.default`, `.appWasSuspended` deprecated, `.builtInMicMuted`, `.routeDisconnected` iOS 17+ | Resume only when iOS says should resume and user intent still wants playback. Do not treat every interruption pause as user pause. |
| External-audio hint | [`secondaryAudioShouldBeSilencedHint`](https://developer.apple.com/documentation/avfaudio/avaudiosession/secondaryaudioshouldbesilencedhint), [`silenceSecondaryAudioHintNotification`](https://developer.apple.com/documentation/avfaudio/avaudiosession/silencesecondaryaudiohintnotification), `AVAudioSessionSilenceSecondaryAudioHintTypeKey`, `.begin`, `.end` | Use as a hint that another primary audio app started or stopped. It informs external-media suppression but should not be the only authority. |
| Route change | [`AVAudioSession.routeChangeNotification`](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes), `AVAudioSessionRouteChangeReasonKey`, `AVAudioSessionRouteChangePreviousRouteKey` | Handle all reasons, not just old-device-unavailable. Pause only for route loss; log/refresh for other reasons. |
| Route reasons | `.unknown`, `.newDeviceAvailable`, `.oldDeviceUnavailable`, `.categoryChange`, `.override`, `.wakeFromSleep`, `.noSuitableRouteForCategory`, `.routeConfigurationChange` | `oldDeviceUnavailable` is the only route reason that should behave like a safety pause by default. |
| Media services | `AVAudioSession.mediaServicesWereLostNotification`, `mediaServicesWereResetNotification` | Reinstall handlers, rebuild state, and publish either complete stalled/interrupted metadata or clear atomically. |

## Current Failure Modes

| Failure mode | Current risk | Correct target |
| --- | --- | --- |
| Split Media Center writes | Metadata, rate, and playback state can diverge across queued main-thread writes. | One atomic snapshot writer owns all Media Center updates. |
| Artwork callback races | Late artwork can update Now Playing after state changed. | Artwork merges only into the latest matching, non-frozen snapshot. |
| Phase maps directly to playing | `GaplessPlaybackPhase.playing` can publish JS/Media Center playing before render is confirmed. | Resolve app state and Media Center state separately from phase, render, desired transport, and suspension. |
| Interruption uses normal pause | System suspension becomes user intent and polling can reassert Relisten. | Dedicated interruption suspension preserves intent and freezes/suppresses writes as appropriate. |
| Spotify takeover | Relisten can keep showing after another app starts primary audio. | Relisten freezes, then suppresses/clears when external media owns audio. |
| Transition metadata race | A native current source can publish before mapping to a Relisten streamable. | Never publish active playback without current streamable metadata. |
| End/seek near boundary | Previous track elapsed/duration can stick at 100 percent. | Transition publishes next metadata, duration, elapsed, rate, and state together. |

## Target Behavior Matrix

| Scenario | JS/app state | Media Center state | Rate | Metadata | Resume behavior |
| --- | --- | --- | --- | --- | --- |
| Render-confirmed playback | `.Playing` | `.playing` | `1.0` | Current track | Already active |
| Resume startup within grace window | `.Playing` | `.playing` | `1.0` | Current track | Continue startup |
| Active buffering after grace window | `.Stalled` | `.playing` | `1.0` | Current track | Keep trying |
| User pause | `.Paused` | `.paused` | `0.0` | Current track | Resume only by user/app command |
| Headphones unplugged / route loss | `.Paused` | `.paused` | `0.0` | Current track | Resume only by user/app command |
| Temporary interruption began | `.Stalled` or `.Paused` | `.interrupted` | `0.0` | Current track, optionally one final write | Resume only if ended with `.shouldResume` and user still wants playing |
| Phone call ended with should resume | Startup then `.Playing` when render confirmed | `.playing` | `1.0` | Current track | Auto-resume only if user had not paused |
| External media takeover | Paused/stalled internally, not reasserted | `.stopped`/cleared or frozen until replaced | `0.0` before clear | Cleared or frozen | Resume only by explicit Relisten action |
| Unrecoverable render failure | `.Stalled` or `.Stopped` | `.interrupted` or `.stopped` | `0.0` | Current track if recoverable, clear if not | No automatic pretend-playing |
| End of queue | `.Stopped` | `.stopped` | `0.0` | Cleared | None |

## Native State Model

Keep the state model inside `GaplessMP3PlayerBackend.Snapshot`. These fields are enough to make the presentation decision explicit without creating a new framework.

| Field | Purpose |
| --- | --- |
| `desiredTransport: DesiredTransport` | User/app intent: `.playing`, `.paused`, or `.stopped`. |
| `systemSuspension: SystemSuspension` | Why native render is not free to behave normally: `.none`, `.temporaryInterruption`, `.externalMedia`. |
| `mediaCenterWriteMode: MediaCenterWriteMode` | Whether writes are `.active`, `.frozen`, or `.suppressed`. |
| `resumeStartedAtUptime: TimeInterval?` | Short grace window anchor for resume/startup. |
| `currentStreamable`, `currentDuration`, `elapsed` | Required metadata and timing for a coherent snapshot. |
| `currentState: PlaybackState` | JS-visible state assigned from the resolved presentation intent. |

Suggested enums:

```swift
private enum DesiredTransport {
    case playing
    case paused
    case stopped
}

private enum SystemSuspension {
    case none
    case temporaryInterruption
    case externalMedia
}

private enum MediaCenterWriteMode {
    case active
    case frozen
    case suppressed
}
```

## Presentation Intent

Use one compact presentation decision. Keep it private in `GaplessMP3PlayerBackend.swift` unless SwiftPM tests need direct access; if so, move only this type into `ios/BackendSupport/MediaCenterPresentationIntent.swift`.

```swift
private enum MediaCenterPresentationIntent: Equatable {
    case clear(reason: Reason)
    case freeze(reason: Reason)
    case update(snapshot: PlaybackPresentationController.Snapshot, appState: PlaybackState)

    enum Reason: Equatable {
        case stopped
        case missingMetadata
        case externalMedia
        case temporaryInterruption
        case userPaused
        case awaitingRender
        case buffering
        case renderStoppedUnexpectedly
        case playing
    }
}
```

The decision table is the core of the implementation.

| Condition | Intent | App state | Media Center | Rate |
| --- | --- | --- | --- | --- |
| Missing `currentStreamable` | `clear(.missingMetadata)` unless frozen | `.Stopped` | `.stopped` | `0.0` |
| Write mode suppressed | `clear(.externalMedia)` | Keep internal state | `.stopped` / nil info | `0.0` |
| Write mode frozen | `freeze(...)` | Keep internal state | No write | No write |
| External media suspension | `clear` or `freeze` depending on classification confidence | Internal only | Yield to other app | `0.0` before clear |
| Temporary interruption | `update(..., .temporaryInterruption)` | `.Stalled` or `.Paused` | `.interrupted` | `0.0` |
| Desired stopped | `clear(.stopped)` | `.Stopped` | `.stopped` | `0.0` |
| Desired paused | `update(..., .userPaused)` | `.Paused` | `.paused` | `0.0` |
| Desired playing, render confirmed | `update(..., .playing)` | `.Playing` | `.playing` | `1.0` |
| Desired playing, within resume grace | `update(..., .awaitingRender)` | `.Playing` | `.playing` | `1.0` |
| Desired playing, buffering/preparing/retrying | `update(..., .buffering)` | `.Stalled` | `.playing` | `1.0` |
| Desired playing, unrecoverable graph/player failure | `update(..., .renderStoppedUnexpectedly)` | `.Stalled` | `.interrupted` | `0.0` |

The invariant is that one resolved intent drives app state, `MPNowPlayingInfoCenter.default().playbackState`, and `MPNowPlayingInfoPropertyPlaybackRate`. Media Center rate intentionally does not always mirror JS state: `.Stalled` can still use Media Center `.playing` with `rate = 1.0` when Relisten is buffering because the user asked playback to continue.

## Atomic Presentation Writer

`PlaybackPresentationController` should expose this single write surface:

```swift
struct Snapshot {
    var title: String
    var artist: String
    var album: String
    var duration: TimeInterval?
    var elapsed: TimeInterval?
    var rate: Float
    var artworkURL: URL?
    var mediaCenterPlaybackState: MPNowPlayingPlaybackState
}

func apply(_ snapshot: Snapshot?)
func freeze()
```

| Requirement | Implementation detail |
| --- | --- |
| Atomic clear | `apply(nil)` clears `nowPlayingInfo` and sets playback state to `.stopped` in one main-queue operation. |
| Atomic update | `apply(snapshot)` writes metadata, elapsed, duration, rate, artwork if available, and playback state together. |
| Revision safety | Metadata and playback state share one revision or paired revisions advanced under the same lock. |
| Elapsed anchoring | Every rate change includes the latest known elapsed value because iOS extrapolates elapsed from rate. |
| Buffering semantics | Buffering writes intentionally use `rate = 1.0` and `.playing`; later correction writes include elapsed if render did not advance. |
| Artwork safety | Artwork request IDs must still match the latest non-frozen snapshot before artwork is merged. |
| Write suppression | `freeze()` prevents delayed artwork or status writes from touching `MPNowPlayingInfoCenter`. |

Delete or make private the old split writer surface: `updateNowPlaying(...)`, `setPlaybackState(...)`, and direct backend `clearNowPlaying()` calls. Backend presentation should flow through `applyPresentation(for:)`.

## Audio Session Events

`AudioSessionController.configureSessionObservers(...)` should pass enough structured data for the backend to classify behavior without overfitting.

| Event | Data to pass | Backend use |
| --- | --- | --- |
| Interruption | type, options, reason if present, `secondaryAudioShouldBeSilencedHint` | Distinguish temporary interruption, should-resume, and possible external takeover. |
| Silence-secondary-audio hint | begin/end, current `secondaryAudioShouldBeSilencedHint` | Evidence that another app's primary audio started or stopped. |
| Route change | reason, previous outputs, current outputs | Pause for old-device-unavailable; log/refresh otherwise. |
| Media services lost/reset | notification kind | Reinstall handlers and rebuild or clear presentation. |

Suggested event structs:

```swift
struct AudioInterruptionEvent {
    var type: AVAudioSession.InterruptionType
    var options: AVAudioSession.InterruptionOptions
    var reason: AVAudioSession.InterruptionReason?
    var secondaryAudioShouldBeSilenced: Bool
}

struct RouteChangeEvent {
    var reason: AVAudioSession.RouteChangeReason
    var previousOutputs: [AudioRouteOutput]
    var currentOutputs: [AudioRouteOutput]
}

struct SilenceSecondaryAudioHintEvent {
    var type: AVAudioSession.SilenceSecondaryAudioHintType
    var secondaryAudioShouldBeSilenced: Bool
}
```

## Event Handling Policy

| Event | Desired backend behavior |
| --- | --- |
| Interruption began while playing/stalled | Record `wasPlayingWhenInterrupted`, pause/suspend the graph, set `systemSuspension = .temporaryInterruption`, set write mode to `.frozen`, optionally publish one final interrupted snapshot, and do not call normal user `pauseOnQueue()`. |
| Interruption ended with `.shouldResume` | Resume only when `wasPlayingWhenInterrupted == true`, `desiredTransport == .playing`, and external media is not still active. |
| Interruption ended without resume or with secondary audio still silenced | Classify as external media, suppress/clear Relisten Media Center once, and do not auto-resume. |
| Silence hint begin | Treat as evidence that another primary audio app started. If already interrupted or not rendering, move toward external suppression; otherwise log and wait for confirming session/route events. |
| Silence hint end | Clear only the external-media hint. Do not auto-resume solely from this event. |
| Explicit Relisten play/resume | Clear external suspension, set write mode active, and resume through the normal presentation path. |
| Old device unavailable | Treat as route-loss pause: set desired transport paused and keep Relisten metadata visible as paused. |
| New device available / category change / route config change | Log route details, refresh status, do not change desired transport, and preserve Media Center playing intent if this is only active buffering. |
| Media services reset with metadata | Publish complete interrupted/stalled metadata, reprepare, seek to last elapsed, and resume only if desired transport is still playing. |
| Media services reset without metadata | Atomically clear. |

For phone-call-style interruptions, keeping Relisten visible as interrupted/paused is acceptable. For Spotify-style external takeover, the target is to yield lock-screen ownership. When classification is uncertain at interruption begin, freeze immediately, then suppress once iOS does not grant resume or secondary audio remains silenced.

## Remote Command Policy

| Command | Owner | Behavior |
| --- | --- | --- |
| `playCommand` / resume | Native | Reactivate Relisten if externally suspended, then resume if current media exists. If no resumable media exists, return failure or consistent no-op. |
| `pauseCommand` | Native | Set user intent paused and keep Media Center paused with metadata. |
| `togglePlayPauseCommand` | Native | Decide from resolved app state, not raw phase alone. |
| `changePlaybackPositionCommand` | Native | Use `positionTime`; reject synchronously when no current streamable or duration exists. |
| `nextTrackCommand` | JS | Forward event only; JS owns queue policy. |
| `previousTrackCommand` | JS | Forward event only; JS owns queue policy. |
| Unsupported commands | Disabled | Keep stop, rate, skip, repeat, shuffle, rating, feedback, and language commands disabled unless explicitly implemented. |

## Transition, Seek, and Completion Policy

| Path | Required behavior |
| --- | --- |
| Automatic gapless transition | Resolve native current source to a Relisten streamable before clearing next metadata. Apply new metadata, elapsed, duration, rate, and state in one presentation snapshot. |
| Unmapped transition current source | Log an invariant violation and stop or suppress presentation. Never publish active playback with nil current metadata. |
| Manual next | Can clear next metadata before explicit `playOnQueue` because it starts a new play request. |
| `setNextOnQueue` | Preserve desired-next during async native `setNext`; commit `nextStreamable` only after generation and desired identity still match. |
| `seekToPercent(1.0)` | Preserve current behavior of advancing to next via JS remote command. |
| Other seek requests | Require duration for percent seek and current streamable for time seek. Invalid lock-screen seek returns `.commandFailed`. |
| End of queue | Atomically clear metadata and stopped state. |
| Boundary near next track | Never leave previous duration/elapsed at 100 percent while presenting the next track. |

## Investigation Before Implementation

Add temporary structured logs before changing behavior. The purpose is to identify the exact event ordering for Spotify takeover and validate whether secondary-audio hints arrive before or after interruption notifications on a real device.

| Boundary | Fields to log |
| --- | --- |
| Presentation decision | intent, reason, app state, Media Center state, rate, write mode, suspension, desired transport, render status, source id, elapsed, duration, generation, session id |
| Remote command | method, command result, resolved app state, desired transport, suspension, generation |
| Interruption | type, options, reason, shouldResume, secondary audio hint, previous state, desired transport, write mode |
| Silence hint | begin/end, secondary audio hint, current write mode, desired transport |
| Route change | reason, previous outputs, current outputs, app state, desired transport |
| Status application | raw phase, `status.isPlaying`, current source id, resolved streamable id, app state, Media Center state, rate |
| Track transition | native previous/current ids, resolved previous/current streamables, next/desired-next before and after |
| Artwork completion | URL, request id, applied/discarded/frozen |

Run the investigation matrix once before implementing. If the Spotify sequence differs from the assumptions above, update this plan before patching.

| Scenario | What to confirm |
| --- | --- |
| Lock-screen pause, wait, resume | No stale rate, no rewind, elapsed anchored. |
| Control Center pause/resume loop | Native command path only, no duplicate JS play/pause. |
| AirPods play/pause | Same native command path as lock screen. |
| Spotify takeover | Event order for interruption, silence hint, route/category changes, and Media Center suppression. |
| Phone-call-style interruption | Context preserved and resume gated by `.shouldResume`. |
| Headphones unplugged | Route-loss pause keeps Relisten visible and paused. |
| Gapless transition | New metadata/duration/elapsed publish together. |
| Seek 15 seconds before end | No previous-track 100 percent presentation on next track. |
| Media services reset | Complete metadata if resumable; clear if not. |

## Implementation Plan

| Phase | Files | Work | Focused tests |
| --- | --- | --- | --- |
| 1. Atomic presentation writer | `PlaybackPresentationController.swift`, `GaplessMP3PlayerBackend.swift` | Add `Snapshot`, `apply(_:)`, `freeze()`, paired revision gating, artwork safety, and replace split backend writes. | Stale artwork cannot resurrect rate; older revision cannot overwrite newer state; `apply(nil)` clears atomically. |
| 2. Presentation intent | `GaplessMP3PlayerBackend.swift`; optional `BackendSupport/MediaCenterPresentationIntent.swift`; support tests | Add suspension/write-mode/grace fields, resolve app state and Media Center state separately, keep buffering as Media Center playing with rate `1.0`. | Missing metadata clears; user pause uses `.paused`/`0`; buffering uses app `.Stalled` + Media Center `.playing`/`1.0`; render failure uses `.interrupted`/`0`. |
| 3. Interruption and external media | `AudioSessionController.swift`, `GaplessMP3PlayerBackend.swift` | Pass interruption and silence-hint data, replace normal interruption pause with suspension, freeze/suppress writes, resume only when valid. | Interruption does not set user pause; user pause during interruption prevents auto-resume; external media suppresses writes; silence hint moves interrupted session toward suppression. |
| 4. Remote commands | `GaplessMP3PlayerBackend.swift`, `NativeRemoteControlForwardingPolicy.swift`, support tests | Keep play/pause/toggle/seek native, next/previous JS, reject invalid seek, make explicit play clear external suspension. | Native commands are not forwarded; next/previous are forwarded; invalid seek fails; play from suppression reactivates. |
| 5. Transition and completion | `GaplessMP3PlayerBackend.swift`, support tests where useful | Resolve transition metadata before clearing next fields, stop/suppress unmapped native current source, clear atomically on finish. | Unresolved transition never publishes active nil metadata; successful transition clears desired-next; finish clears presentation. |
| 6. Route and reset hardening | `AudioSessionController.swift`, `GaplessMP3PlayerBackend.swift`; `PCMOutputGraph.swift` only if logs prove it is needed | Forward all route changes, pause for old-device-unavailable, refresh/log other changes, keep reset presentation coherent. | Route loss pauses with metadata; other routes preserve transport; reset with metadata publishes interrupted snapshot; reset without metadata clears. |

## Verification

Automated commands:

```bash
swift test --package-path modules/relisten-audio-player
yarn lint
yarn ts:check
```

Native build:

```bash
xcodebuild -workspace ios/Relisten.xcworkspace -scheme Relisten -configuration Debug -destination 'generic/platform=iOS Simulator' build > /tmp/relisten-xcodebuild.log 2>&1
rg -n "error:|\\*\\* BUILD" /tmp/relisten-xcodebuild.log
```

If new Swift files are added under `modules/relisten-audio-player/ios`, the podspec already includes `**/*.swift`. Run `yarn pods` if CocoaPods has not picked up the new pod-visible sources. Do not run `npx expo prebuild` just to add Swift source files unless generated project state is known to be stale.

Manual verification should happen on a physical iPhone with AirPods or another Bluetooth remote device.

| Scenario | Steps | Expected result |
| --- | --- | --- |
| Lock screen and Control Center | Play, lock, pause, wait 60 seconds, resume, repeat. | No rewind, stale icon, blank metadata, or elapsed drift. |
| Buffering / network stall | Throttle network and force buffering before or during playback. | Relisten remains Media Center item with `.playing`/rate `1.0`; app may show stalled; unrecoverable failure stops pretending. |
| Spotify takeover | Play Relisten, start Spotify, lock screen. | Spotify owns Media Center; Relisten does not reappear until explicit Relisten resume. |
| Phone/system interruption | Trigger phone call, Siri, alarm, or equivalent; end interruption. | Relisten context preserved; auto-resume only when iOS says should resume and user did not pause. |
| AirPods/Bluetooth | Play, pause/resume from AirPods, disconnect, reconnect, resume explicitly. | Remote controls work; disconnect pauses; reconnect does not auto-resume by itself. |
| Gapless transition | Queue next track, seek to 15 seconds before end, wait through transition on lock screen. | Next title/duration/elapsed publish together; previous track does not stick at 100 percent. |
| Seek rejection | Simulate no duration/current metadata and trigger lock-screen seek. | Command fails and no blank active Media Center tile appears. |
| Media services reset | Trigger or simulate reset path. | With metadata, publish complete interrupted/stalled metadata; without metadata, clear; resume goes through unified decision. |

## Acceptance Criteria

| Area | Pass condition |
| --- | --- |
| Presentation writes | All Media Center writes go through the atomic writer. No backend path writes metadata and playback state separately. |
| App state | JS/app `.Playing` means render confirmed or resume grace window. |
| Buffering | Media Center uses `.playing` and `MPNowPlayingInfoPropertyPlaybackRate = 1.0` during active desired-play buffering. |
| Elapsed accuracy | Every rate transition includes an elapsed anchor. |
| External media | Status polling and artwork callbacks cannot reassert Relisten during suppression. |
| Interruptions | Temporary interruptions preserve Relisten context and do not become user pauses. |
| Remote commands | Play/pause/toggle/seek are native-only; next/previous remain JS queue commands. |
| Transitions | Active playback is never published without current streamable metadata. |
| Verification | Automated checks pass or unrelated failures are documented; physical device matrix passes. |

## Suggested Commit Plan

| Commit | Scope |
| --- | --- |
| `fix(playback): apply media center snapshots atomically` | Atomic writer and backend migration away from split presentation writes. |
| `fix(playback): derive media center state from transport intent` | Presentation intent, render-confirmed app state, buffering-as-playing Media Center rate, resume grace window. |
| `fix(playback): handle interruptions without stealing media center` | Interruption suspension, silence hints, external-media suppression. |
| `fix(playback): tighten remote command state handling` | Seek rejection, toggle behavior, explicit resume from suppression. |
| `fix(playback): publish coherent gapless transitions` | Transition metadata ordering and completion clearing. |
| `fix(playback): harden route and reset presentation` | Route-change coverage and media-services reset consistency. |

Each commit should include focused Swift tests where possible. Run `swift test --package-path modules/relisten-audio-player` after every native-support commit, then `yarn lint` and `yarn ts:check` before the final commit.
