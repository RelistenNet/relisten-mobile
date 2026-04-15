import Foundation

struct NativeRemoteControlForwardingPolicy {
    static func shouldForwardToJavaScript(_ method: String) -> Bool {
        switch method {
        // The MPRemoteCommandCenter play/pause handlers already mutate the native
        // player. Forwarding these to JS would let JS issue a second command
        // against a lock-screen snapshot that may be behind the actual audio graph.
        case "pause", "resume", "play":
            return false
        default:
            return true
        }
    }
}
