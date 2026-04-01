import AudioToolbox

extension MP3FrameDecoder {
    func callbackHandleProperty(_ propertyID: AudioFileStreamPropertyID) {
        do {
            try handleProperty(propertyID)
        } catch {
            callbackError = error
        }
    }

    func callbackHandlePackets(
        numberBytes: UInt32,
        numberPackets: UInt32,
        inputData: UnsafeRawPointer,
        descriptions: UnsafeMutablePointer<AudioStreamPacketDescription>
    ) {
        handlePackets(numberBytes: numberBytes, numberPackets: numberPackets, inputData: inputData, descriptions: descriptions)
    }

    func callbackProvideInput(
        ioNumberDataPackets: UnsafeMutablePointer<UInt32>,
        ioData: UnsafeMutablePointer<AudioBufferList>,
        outDataPacketDescription: UnsafeMutablePointer<UnsafeMutablePointer<AudioStreamPacketDescription>?>?
    ) -> OSStatus {
        provideInput(
            ioNumberDataPackets: ioNumberDataPackets,
            ioData: ioData,
            outDataPacketDescription: outDataPacketDescription
        )
    }
}

let audioFileStreamPropertyProc: AudioFileStream_PropertyListenerProc = { clientData, _, propertyID, _ in
    let decoder = Unmanaged<MP3FrameDecoder>.fromOpaque(clientData).takeUnretainedValue()
    decoder.callbackHandleProperty(propertyID)
}

let audioFileStreamPacketsProc: AudioFileStream_PacketsProc = { clientData, numberBytes, numberPackets, inputData, packetDescriptions in
    guard let packetDescriptions else { return }
    let decoder = Unmanaged<MP3FrameDecoder>.fromOpaque(clientData).takeUnretainedValue()
    decoder.callbackHandlePackets(
        numberBytes: numberBytes,
        numberPackets: numberPackets,
        inputData: inputData,
        descriptions: packetDescriptions
    )
}

let audioConverterInputProc: AudioConverterComplexInputDataProc = { _, ioNumberDataPackets, ioData, outPacketDescription, userData in
    let decoder = Unmanaged<MP3FrameDecoder>.fromOpaque(userData!).takeUnretainedValue()
    return decoder.callbackProvideInput(
        ioNumberDataPackets: ioNumberDataPackets,
        ioData: ioData,
        outDataPacketDescription: outPacketDescription
    )
}
