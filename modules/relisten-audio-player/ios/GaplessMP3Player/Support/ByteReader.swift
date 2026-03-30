import Foundation

/// Small big-endian reader used by the metadata parser.
///
/// The parser works directly on partial file prefixes, so these helpers return `nil`
/// instead of trapping when a field crosses the current data boundary. That keeps
/// "need more bytes" distinct from "invalid MP3".
struct ByteReader {
    let data: Data

    func readUInt32BE(at offset: Int) -> UInt32? {
        guard offset >= 0, offset + 4 <= data.count else { return nil }
        return data[offset ..< offset + 4].reduce(0) { ($0 << 8) | UInt32($1) }
    }

    func readUInt24BE(at offset: Int) -> UInt32? {
        guard offset >= 0, offset + 3 <= data.count else { return nil }
        return data[offset ..< offset + 3].reduce(0) { ($0 << 8) | UInt32($1) }
    }

    func readUInt16BE(at offset: Int) -> UInt16? {
        guard offset >= 0, offset + 2 <= data.count else { return nil }
        return data[offset ..< offset + 2].reduce(0) { ($0 << 8) | UInt16($1) }
    }

    func readSynchsafeInt(at offset: Int) -> Int? {
        guard offset >= 0, offset + 4 <= data.count else { return nil }
        let bytes = Array(data[offset ..< offset + 4])
        // ID3 stores sizes in 7-bit chunks so sync words cannot appear inside the tag.
        return Int(bytes[0] & 0x7F) << 21
            | Int(bytes[1] & 0x7F) << 14
            | Int(bytes[2] & 0x7F) << 7
            | Int(bytes[3] & 0x7F)
    }
}
