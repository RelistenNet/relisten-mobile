Pod::Spec.new do |s|
  s.name           = 'RelistenAudioPlayer'
  s.version        = '2.4.0'
  s.summary        = 'An Expo module wrapping un4seen''s BASS audio player'
  s.description    = 'An Expo module wrapping un4seen''s BASS audio player.'
  s.author         = 'Alec Gorge <alecgorge@gmail.com>'
  s.homepage       = 'https://github.com/relistennet/relisten-mobile'
  s.platform       = :ios, '13.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = "AVFoundation", "Accelerate", "CFNetwork", "SystemConfiguration", "AudioToolbox"
  s.library = ['c++']

  s.exclude_files = ["vendor/*.xcframework/**/*.h"]
  s.ios.vendored_frameworks = [
    'vendor/bass.xcframework',
    'vendor/bassflac.xcframework',
    'vendor/bassmix.xcframework',
    'vendor/bass_fx.xcframework',
  ]
  s.preserve_paths = [
    "vendor/*.xcframework",
    "**/*.h",
    "vendor/*.xcframework/**/*.h",
#     'bass.modulemap',
  ]
#   s.module_map = 'bass.modulemap'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'ENABLE_BITCODE' => 'NO'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
