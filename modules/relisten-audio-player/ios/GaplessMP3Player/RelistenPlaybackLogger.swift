import Foundation
import OSLog

enum RelistenPlaybackLogLayer: String {
    case backend
    case player
    case coordinator
    case source
}

enum RelistenPlaybackLogCategory: String {
    case command
    case lifecycle
    case preload
    case network
    case state
    case error
}

struct RelistenPlaybackLogger {
    private static let subsystem = "net.relisten.ios.relisten-audio-player"

    private let logger: Logger
    private let layer: RelistenPlaybackLogLayer

    init(layer: RelistenPlaybackLogLayer, category: RelistenPlaybackLogCategory) {
        self.logger = Logger(subsystem: Self.subsystem, category: category.rawValue)
        self.layer = layer
    }

    func debug(_ verb: String, _ context: String? = nil, _ fields: String...) {
#if DEBUG
        let message = composeMessage(verb: verb, context: context, fields: fields)
        logger.debug("\(message, privacy: .public)")
#endif
    }

    func info(_ verb: String, _ context: String? = nil, _ fields: String...) {
        let message = composeMessage(verb: verb, context: context, fields: fields)
        logger.info("\(message, privacy: .public)")
    }

    func warn(_ verb: String, _ context: String? = nil, _ fields: String...) {
        let message = composeMessage(verb: verb, context: context, fields: fields)
        logger.notice("\(message, privacy: .public)")
    }

    func error(_ verb: String, _ context: String? = nil, _ fields: String...) {
        let message = composeMessage(verb: verb, context: context, fields: fields)
        logger.error("\(message, privacy: .public)")
    }

    private func composeMessage(verb: String, context: String?, fields: [String]) -> String {
        let contextPart = context?.isEmpty == false ? " \(context!)" : ""
        let fieldPart = fields.filter { !$0.isEmpty }.joined(separator: " ")
        let suffix = fieldPart.isEmpty ? "" : " \(fieldPart)"
        return "[\(layer.rawValue)] \(verb)\(contextPart)\(suffix)"
    }
}

func playbackLogField(_ key: String, _ value: String?) -> String {
    "\(key)=\(value ?? "none")"
}

func playbackLogBoolField(_ key: String, _ value: Bool) -> String {
    "\(key)=\(value ? "true" : "false")"
}

func playbackLogIntegerField<T: BinaryInteger>(_ key: String, _ value: T) -> String {
    "\(key)=\(value)"
}

func playbackLogDoubleField(_ key: String, _ value: Double) -> String {
    "\(key)=\(value)"
}

func playbackLogDurationField(_ key: String = "dur", _ value: TimeInterval) -> String {
    "\(key)=\(String(format: "%.1fs", value))"
}

func playbackLogDelayField(_ value: TimeInterval?) -> String {
    if let value {
        return "delay=\(String(format: "%.1fs", value))"
    }
    return "delay=none"
}

func playbackLogPathField(_ key: String, _ value: URL?) -> String {
    playbackLogField(key, value?.path)
}

func playbackLogErrorField(_ value: String) -> String {
    let normalized = value
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\t", with: "\\t")
    return "error=\"\(normalized)\""
}
