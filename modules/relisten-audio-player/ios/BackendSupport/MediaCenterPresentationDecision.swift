import Foundation

enum MediaCenterDesiredTransport: String {
    case playing
    case paused
    case stopped
}

enum MediaCenterSystemSuspension: String {
    case none
    case temporaryInterruption
    case externalMedia
}

enum MediaCenterWriteMode: String {
    // Normal presentation writes are allowed.
    case active
    // Existing lock-screen ownership is left untouched. Used for ambiguous
    // interruptions while iOS is deciding whether Relisten should resume.
    case frozen
    // Relisten has yielded Media Center ownership to another app. Status
    // polling and artwork callbacks must not recreate a Relisten tile.
    case suppressed
}

enum MediaCenterRenderStatus: String {
    case stopped
    case preparing
    case paused
    case playing
    case failed
}

enum MediaCenterAppState: String {
    case stopped
    case playing
    case paused
    case stalled
}

enum MediaCenterPlaybackState: String {
    case stopped
    case playing
    case paused
    case interrupted
}

enum MediaCenterPresentationReason: String {
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

struct MediaCenterPresentationUpdate: Equatable {
    let reason: MediaCenterPresentationReason
    let appState: MediaCenterAppState
    let mediaCenterPlaybackState: MediaCenterPlaybackState
    let playbackRate: Float
}

enum MediaCenterPresentationDecision: Equatable {
    case clear(reason: MediaCenterPresentationReason)
    case freeze(reason: MediaCenterPresentationReason)
    case update(MediaCenterPresentationUpdate)

    var reason: MediaCenterPresentationReason {
        switch self {
        case .clear(let reason), .freeze(let reason):
            return reason
        case .update(let update):
            return update.reason
        }
    }
}

struct MediaCenterPresentationInput {
    let hasCurrentMetadata: Bool
    let desiredTransport: MediaCenterDesiredTransport
    let systemSuspension: MediaCenterSystemSuspension
    let writeMode: MediaCenterWriteMode
    let renderStatus: MediaCenterRenderStatus
    let renderIsPlaying: Bool
    let isWithinResumeGraceWindow: Bool

    func resolve() -> MediaCenterPresentationDecision {
        // Write mode is resolved first because it is about ownership, not
        // transport. Suppression must win even if stale renderer status still
        // says a Relisten source is prepared or playing.
        switch writeMode {
        case .suppressed:
            return .clear(reason: .externalMedia)
        case .frozen:
            return .freeze(reason: freezeReason)
        case .active:
            break
        }

        switch desiredTransport {
        case .stopped:
            return .clear(reason: .stopped)
        case .paused:
            guard hasCurrentMetadata else {
                return .clear(reason: .missingMetadata)
            }
            if systemSuspension == .externalMedia {
                return .clear(reason: .externalMedia)
            }
            if systemSuspension == .temporaryInterruption {
                return .update(
                    MediaCenterPresentationUpdate(
                        reason: .temporaryInterruption,
                        appState: .paused,
                        mediaCenterPlaybackState: .interrupted,
                        playbackRate: 0.0
                    )
                )
            }
            return .update(
                MediaCenterPresentationUpdate(
                    reason: .userPaused,
                    appState: .paused,
                    mediaCenterPlaybackState: .paused,
                    playbackRate: 0.0
                )
            )
        case .playing:
            guard hasCurrentMetadata else {
                return .clear(reason: .missingMetadata)
            }
            if systemSuspension == .externalMedia {
                return .clear(reason: .externalMedia)
            }
            if systemSuspension == .temporaryInterruption {
                return .update(
                    MediaCenterPresentationUpdate(
                        reason: .temporaryInterruption,
                        appState: .stalled,
                        mediaCenterPlaybackState: .interrupted,
                        playbackRate: 0.0
                    )
                )
            }
            return resolveDesiredPlayback()
        }
    }

    private var freezeReason: MediaCenterPresentationReason {
        switch systemSuspension {
        case .externalMedia:
            return .externalMedia
        case .temporaryInterruption:
            return .temporaryInterruption
        case .none:
            return hasCurrentMetadata ? .awaitingRender : .missingMetadata
        }
    }

    private func resolveDesiredPlayback() -> MediaCenterPresentationDecision {
        // GaplessPlaybackPhase.playing only means the native engine has entered
        // its playback phase. The output graph can still be silent while startup
        // buffering catches up, so renderIsPlaying is the only render-confirmed
        // signal for JS-visible .Playing.
        if renderIsPlaying {
            return .update(
                MediaCenterPresentationUpdate(
                    reason: .playing,
                    appState: .playing,
                    mediaCenterPlaybackState: .playing,
                    playbackRate: 1.0
                )
            )
        }

        if isWithinResumeGraceWindow {
            // A short startup grace window avoids flashing "stalled" while an
            // intentional play/resume is still crossing the native graph. After
            // the window expires, JS can show stalled while Media Center stays
            // playing because the user's transport intent is still playback.
            return .update(
                MediaCenterPresentationUpdate(
                    reason: .awaitingRender,
                    appState: .playing,
                    mediaCenterPlaybackState: .playing,
                    playbackRate: 1.0
                )
            )
        }

        switch renderStatus {
        case .preparing, .paused, .playing:
            // This is active desired-play buffering. The app can expose a
            // stalled state, but the lock screen should behave like a music app
            // that is still trying to play, so rate remains 1.0.
            return .update(
                MediaCenterPresentationUpdate(
                    reason: .buffering,
                    appState: .stalled,
                    mediaCenterPlaybackState: .playing,
                    playbackRate: 1.0
                )
            )
        case .failed, .stopped:
            return .update(
                MediaCenterPresentationUpdate(
                    reason: .renderStoppedUnexpectedly,
                    appState: .stalled,
                    mediaCenterPlaybackState: .interrupted,
                    playbackRate: 0.0
                )
            )
        }
    }
}
