import AudioToolbox
import Foundation

/// The decoder reports starvation explicitly so the source layer can distinguish
/// "wait for more network bytes" from a true terminal end-of-stream.
enum MP3DecodeReadResult {
    case chunk(PCMChunk)
    case needMoreData
    case endOfStream
}

/// Thin wrapper around `AudioFileStream` + `AudioConverter`.
///
/// Responsibilities are deliberately narrow:
/// - packetize incoming MP3 bytes
/// - decode packet queues into a fixed Float32 PCM shape
/// - surface starvation vs EOF
/// - restart cleanly after seek
///
/// The player recreates this type on seek instead of trying to surgically rewind
/// `AudioConverter` state, which keeps correctness simpler than preserving decoder
/// internals across discontinuities.
final class MP3FrameDecoder {
    private struct CompressedPacket {
        var data: Data
        var description: AudioStreamPacketDescription
    }

    private static let starvationStatus = OSStatus(-22221)

    let metadata: MP3TrackMetadata

    private var streamID: AudioFileStreamID?
    private var converter: AudioConverterRef?
    private var sourceFormat = AudioStreamBasicDescription()
    private var outputFormat: AudioStreamBasicDescription?
    private var packetQueue: [CompressedPacket] = []
    private var queuedPacketIndex = 0
    private var inputEnded = false
    var callbackError: Error?
    private var activePacketAllocations: [UnsafeMutableRawPointer] = []
    private var activeDescriptionAllocations: [UnsafeMutablePointer<AudioStreamPacketDescription>] = []

    init(metadata: MP3TrackMetadata) throws {
        self.metadata = metadata

        let clientData = Unmanaged.passUnretained(self).toOpaque()
        let status = AudioFileStreamOpen(clientData, audioFileStreamPropertyProc, audioFileStreamPacketsProc, kAudioFileMP3Type, &streamID)
        guard status == noErr else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not open AudioFileStream: \(status)")
        }
    }

    deinit {
        if let converter {
            AudioConverterDispose(converter)
        }
        if let streamID {
            AudioFileStreamClose(streamID)
        }
    }

    var sampleRate: Double {
        outputFormat?.mSampleRate ?? Double(metadata.sampleRate)
    }

    var channelCount: Int {
        Int(outputFormat?.mChannelsPerFrame ?? UInt32(metadata.channelCount))
    }

    /// Feeds newly available MP3 bytes into the packetizer.
    ///
    /// `isDiscontinuous` should be true only for the first feed after a seek/reset so
    /// `AudioFileStream` can drop any sync assumptions from the previous byte stream.
    func feed(_ data: Data, isDiscontinuous: Bool) throws {
        guard !data.isEmpty else { return }
        try throwIfCallbackFailed()
        guard let streamID else {
            throw GaplessMP3PlayerError.unsupportedFormat("AudioFileStream is unavailable")
        }

        let flags: AudioFileStreamParseFlags = isDiscontinuous ? .discontinuity : []
        let status = data.withUnsafeBytes { rawBuffer -> OSStatus in
            guard let baseAddress = rawBuffer.baseAddress else { return noErr }
            return AudioFileStreamParseBytes(streamID, UInt32(rawBuffer.count), baseAddress, flags)
        }

        guard status == noErr else {
            throw GaplessMP3PlayerError.invalidMP3("AudioFileStreamParseBytes failed with status \(status)")
        }
    }

    func markEndOfStream() {
        inputEnded = true
    }

    /// Pulls the next available decoded PCM chunk.
    ///
    /// This method is intentionally pull-based because the coordinator needs to pace
    /// decode against output-buffer depth and current playback time. Returning
    /// `needMoreData` instead of blocking keeps that control in the coordinator.
    func readChunk(maxFrames: Int? = nil) throws -> MP3DecodeReadResult {
        try throwIfCallbackFailed()
        guard let converter, let outputFormat else {
            return inputEnded ? .endOfStream : .needMoreData
        }

        if queuedPacketIndex >= packetQueue.count {
            return inputEnded ? .endOfStream : .needMoreData
        }

        let requestedFrames = UInt32(max(maxFrames ?? metadata.samplesPerFrame, metadata.samplesPerFrame))
        let bytesPerFrame = Int(outputFormat.mBytesPerFrame)
        let outputByteCount = Int(requestedFrames) * bytesPerFrame
        let outputBufferMemory = UnsafeMutableRawPointer.allocate(
            byteCount: outputByteCount,
            alignment: MemoryLayout<Float>.alignment
        )
        defer { outputBufferMemory.deallocate() }

        releaseActiveInputAllocations()

        let buffer = AudioBuffer(
            mNumberChannels: outputFormat.mChannelsPerFrame,
            mDataByteSize: UInt32(outputByteCount),
            mData: outputBufferMemory
        )
        var bufferList = AudioBufferList(mNumberBuffers: 1, mBuffers: buffer)
        var outputFrameCount = requestedFrames

        let status = AudioConverterFillComplexBuffer(
            converter,
            audioConverterInputProc,
            Unmanaged.passUnretained(self).toOpaque(),
            &outputFrameCount,
            &bufferList,
            nil
        )

        releaseConsumedPackets()

        if status != noErr && status != Self.starvationStatus {
            throw GaplessMP3PlayerError.unsupportedFormat("AudioConverterFillComplexBuffer failed with status \(status)")
        }

        let frameCount = Int(outputFrameCount)
        guard frameCount > 0 else {
            if status == Self.starvationStatus {
                return .needMoreData
            }
            return (inputEnded && queuedPacketIndex >= packetQueue.count) ? .endOfStream : .needMoreData
        }

        let floatCount = frameCount * Int(outputFormat.mChannelsPerFrame)
        let floatPointer = outputBufferMemory.assumingMemoryBound(to: Float.self)
        let samples = Array(UnsafeBufferPointer(start: floatPointer, count: floatCount))
        return .chunk(
            PCMChunk(
                sampleRate: outputFormat.mSampleRate,
                channels: deinterleave(samples: samples, channelCount: Int(outputFormat.mChannelsPerFrame))
            )
        )
    }

    /// Reads stream properties as `AudioFileStream` discovers them.
    func handleProperty(_ propertyID: AudioFileStreamPropertyID) throws {
        guard let streamID else { return }

        if propertyID == kAudioFileStreamProperty_DataFormat {
            var format = AudioStreamBasicDescription()
            var propertySize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            let status = AudioFileStreamGetProperty(streamID, propertyID, &propertySize, &format)
            guard status == noErr else {
                throw GaplessMP3PlayerError.invalidMP3("Could not read stream data format: \(status)")
            }
            sourceFormat = format
        }

        if propertyID == kAudioFileStreamProperty_ReadyToProducePackets {
            try makeConverterIfNeeded()
        }
    }

    /// Copies compressed packet payloads out of the parser callback so the decoder can
    /// own their lifetime independently of AudioToolbox callback buffers.
    func handlePackets(
        numberBytes: UInt32,
        numberPackets: UInt32,
        inputData: UnsafeRawPointer,
        descriptions: UnsafeMutablePointer<AudioStreamPacketDescription>
    ) {
        let packetData = Data(bytes: inputData, count: Int(numberBytes))
        packetQueue.reserveCapacity(packetQueue.count + Int(numberPackets))

        for packetIndex in 0 ..< Int(numberPackets) {
            let description = descriptions[packetIndex]
            let startOffset = Int(description.mStartOffset)
            let endOffset = startOffset + Int(description.mDataByteSize)
            let compressedData = packetData.subdata(in: startOffset ..< endOffset)
            packetQueue.append(
                CompressedPacket(
                    data: compressedData,
                    description: AudioStreamPacketDescription(
                        mStartOffset: 0,
                        mVariableFramesInPacket: description.mVariableFramesInPacket,
                        mDataByteSize: description.mDataByteSize
                    )
                )
            )
        }
    }

    /// Lazily constructs the PCM converter once the source format is fully known.
    private func makeConverterIfNeeded() throws {
        guard converter == nil else { return }
        let channels = sourceFormat.mChannelsPerFrame
        guard channels > 0 else {
            throw GaplessMP3PlayerError.unsupportedFormat("Invalid source channel count")
        }

        var source = sourceFormat
        var destination = AudioStreamBasicDescription(
            mSampleRate: source.mSampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
            mBytesPerPacket: channels * 4,
            mFramesPerPacket: 1,
            mBytesPerFrame: channels * 4,
            mChannelsPerFrame: channels,
            mBitsPerChannel: 32,
            mReserved: 0
        )

        let status = AudioConverterNew(&source, &destination, &converter)
        guard status == noErr else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not create audio converter: \(status)")
        }

        outputFormat = destination
    }

    /// Supplies one compressed packet at a time to the AudioConverter input callback.
    ///
    /// Returning the custom starvation status is what lets the runtime wait for more
    /// progressive-download data without treating temporary network starvation as EOF.
    func provideInput(
        ioNumberDataPackets: UnsafeMutablePointer<UInt32>,
        ioData: UnsafeMutablePointer<AudioBufferList>,
        outDataPacketDescription: UnsafeMutablePointer<UnsafeMutablePointer<AudioStreamPacketDescription>?>?
    ) -> OSStatus {
        guard queuedPacketIndex < packetQueue.count else {
            ioNumberDataPackets.pointee = 0
            ioData.pointee.mNumberBuffers = 0
            return inputEnded ? noErr : Self.starvationStatus
        }

        let packet = packetQueue[queuedPacketIndex]
        queuedPacketIndex += 1

        let packetMemory = UnsafeMutableRawPointer.allocate(byteCount: packet.data.count, alignment: 1)
        activePacketAllocations.append(packetMemory)
        packet.data.copyBytes(to: packetMemory.assumingMemoryBound(to: UInt8.self), count: packet.data.count)

        let descriptionPointer = UnsafeMutablePointer<AudioStreamPacketDescription>.allocate(capacity: 1)
        descriptionPointer.initialize(to: packet.description)
        activeDescriptionAllocations.append(descriptionPointer)

        ioData.pointee.mNumberBuffers = 1
        ioData.pointee.mBuffers = AudioBuffer(
            mNumberChannels: sourceFormat.mChannelsPerFrame,
            mDataByteSize: UInt32(packet.data.count),
            mData: packetMemory
        )
        outDataPacketDescription?.pointee = descriptionPointer
        ioNumberDataPackets.pointee = 1
        return noErr
    }

    /// After a successful decode call, all packets up to `queuedPacketIndex` have been
    /// consumed and can be dropped from the in-memory queue.
    private func releaseConsumedPackets() {
        if queuedPacketIndex > 0 {
            packetQueue.removeFirst(queuedPacketIndex)
            queuedPacketIndex = 0
        }
    }

    /// AudioConverter input buffers must outlive the callback. We allocate them per
    /// decode call and release them immediately afterwards to keep ownership explicit.
    private func releaseActiveInputAllocations() {
        activePacketAllocations.forEach { $0.deallocate() }
        activePacketAllocations.removeAll(keepingCapacity: true)

        activeDescriptionAllocations.forEach {
            $0.deinitialize(count: 1)
            $0.deallocate()
        }
        activeDescriptionAllocations.removeAll(keepingCapacity: true)
    }

    /// AudioConverter emits interleaved PCM but the rest of the engine prefers planar
    /// channels for trimming and test determinism.
    private func deinterleave(samples: [Float], channelCount: Int) -> [[Float]] {
        guard channelCount > 0 else { return [] }
        let frameCount = samples.count / channelCount
        var channels = Array(
            repeating: Array(repeating: Float.zero, count: frameCount),
            count: channelCount
        )

        for frameIndex in 0 ..< frameCount {
            for channelIndex in 0 ..< channelCount {
                channels[channelIndex][frameIndex] = samples[(frameIndex * channelCount) + channelIndex]
            }
        }

        return channels
    }

    /// AudioToolbox failures are captured inside callbacks and re-thrown on the public
    /// API boundary where async callers can handle them sanely.
    private func throwIfCallbackFailed() throws {
        if let callbackError {
            self.callbackError = nil
            throw callbackError
        }
    }
}
