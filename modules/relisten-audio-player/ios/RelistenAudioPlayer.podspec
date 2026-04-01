Pod::Spec.new do |s|
  s.name           = 'RelistenAudioPlayer'
  s.version        = '2.4.0'
  s.summary        = 'An Expo module wrapping a custom gapless audio player on iOS and ExoPlayer on Android'
  s.description    = 'An Expo module wrapping a custom gapless audio player on iOS and ExoPlayer on Android.'
  s.author         = 'Alec Gorge <alecgorge@gmail.com>'
  s.homepage       = 'https://github.com/relistennet/relisten-mobile'
  s.platform       = :ios, '18.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = "AVFoundation", "AudioToolbox", "AVFAudio", "MediaPlayer"

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.swift"
  s.exclude_files = "Tests/**/*.swift"
end
