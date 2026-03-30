import Foundation

extension MP3GaplessMetadataParser {
    /// Splits the specific multi-field ID3 text payload shapes used by iTunSMPB frames.
    ///
    /// This stays parser-local because the encoding rules are tied to the MP3 metadata
    /// contract rather than being a general-purpose string utility.
    func splitEncodedStrings(_ data: Data, encoding: UInt8, expectedParts: Int) -> [String] {
        let terminator: [UInt8]
        let stringEncoding: String.Encoding

        switch encoding {
        case 1, 2:
            terminator = [0, 0]
            stringEncoding = .utf16
        case 3:
            terminator = [0]
            stringEncoding = .utf8
        default:
            terminator = [0]
            stringEncoding = .isoLatin1
        }

        var parts: [String] = []
        var cursor = 0
        let bytes = Array(data)

        while cursor <= bytes.count, parts.count < expectedParts {
            if let range = bytes[cursor...].windows(ofCount: terminator.count).first(where: { Array($0) == terminator }) {
                let end = range.startIndex
                let segment = Data(bytes[cursor ..< end])
                parts.append(String(data: segment, encoding: stringEncoding) ?? "")
                cursor = end + terminator.count
            } else {
                let segment = Data(bytes[cursor...])
                parts.append(String(data: segment, encoding: stringEncoding) ?? "")
                cursor = bytes.count + 1
            }
        }

        return parts
    }

    func parseITunSMPB(_ value: String) -> (Int, Int)? {
        let pattern = #"^ [0-9a-fA-F]{8} ([0-9a-fA-F]{8}) ([0-9a-fA-F]{8})"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(value.startIndex..., in: value)
        guard let match = regex.firstMatch(in: value, range: range),
              let delayRange = Range(match.range(at: 1), in: value),
              let paddingRange = Range(match.range(at: 2), in: value),
              let delay = Int(value[delayRange], radix: 16),
              let padding = Int(value[paddingRange], radix: 16),
              delay > 0 || padding > 0 else {
            return nil
        }

        return (delay, padding)
    }

    func readLatin1CString(_ bytes: [UInt8], offset: inout Int) -> String? {
        guard offset <= bytes.count else { return nil }
        let start = offset
        while offset < bytes.count, bytes[offset] != 0 {
            offset += 1
        }
        guard offset <= bytes.count else { return nil }
        let string = String(data: Data(bytes[start ..< offset]), encoding: .isoLatin1)
        offset = min(offset + 1, bytes.count)
        return string
    }

    func readEncodedCString(_ bytes: [UInt8], offset: inout Int, encoding: UInt8) -> String? {
        let terminatorLength = (encoding == 1 || encoding == 2) ? 2 : 1
        let start = offset
        while offset + terminatorLength <= bytes.count {
            if terminatorLength == 2 {
                if bytes[offset] == 0, bytes[offset + 1] == 0 {
                    let string = decodeEncodedString(Data(bytes[start ..< offset]), encoding: encoding)
                    offset = min(offset + 2, bytes.count)
                    return string
                }
                offset += 2
            } else {
                if bytes[offset] == 0 {
                    let string = decodeEncodedString(Data(bytes[start ..< offset]), encoding: encoding)
                    offset = min(offset + 1, bytes.count)
                    return string
                }
                offset += 1
            }
        }
        let string = decodeEncodedString(Data(bytes[start...]), encoding: encoding)
        offset = bytes.count
        return string
    }

    func decodeEncodedString(_ data: Data, encoding: UInt8) -> String {
        switch encoding {
        case 1, 2:
            return String(data: data, encoding: .utf16)
                ?? String(data: data, encoding: .utf16LittleEndian)
                ?? String(data: data, encoding: .utf16BigEndian)
                ?? ""
        case 3:
            return String(data: data, encoding: .utf8) ?? ""
        default:
            return String(data: data, encoding: .isoLatin1) ?? ""
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        guard indices.contains(index) else { return nil }
        return self[index]
    }
}

extension ArraySlice where Element == UInt8 {
    func windows(ofCount count: Int) -> [ArraySlice<UInt8>] {
        guard count > 0, self.count >= count else { return [] }
        return (0 ... self.count - count).map { index in
            let start = self.index(self.startIndex, offsetBy: index)
            let end = self.index(start, offsetBy: count)
            return self[start ..< end]
        }
    }
}
