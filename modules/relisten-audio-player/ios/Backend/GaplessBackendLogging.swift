import Foundation

let backendCommandLog = RelistenPlaybackLogger(layer: .backend, category: .command)
let backendLifecycleLog = RelistenPlaybackLogger(layer: .backend, category: .lifecycle)
let backendNetworkLog = RelistenPlaybackLogger(layer: .backend, category: .network)
let backendStateLog = RelistenPlaybackLogger(layer: .backend, category: .state)
let backendErrorLog = RelistenPlaybackLogger(layer: .backend, category: .error)
let resumePresentationGraceInterval: TimeInterval = 1.0
