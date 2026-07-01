import ExpoModulesCore

struct RelistenAudioAdjustmentConfiguration: Record {
    @Field
    var specVersion: Int = AudioAdjustmentConfiguration.specVersion

    @Field
    var enabled: Bool = false

    @Field
    var bandGainsDb: [Double] = []

    @Field
    var extraVolumeReductionDb: Double = 0

    func validatedConfiguration() throws -> AudioAdjustmentConfiguration {
        try AudioAdjustmentConfiguration.validated(
            specVersion: specVersion,
            enabled: enabled,
            bandGainsDb: bandGainsDb,
            extraVolumeReductionDb: extraVolumeReductionDb
        )
    }
}
