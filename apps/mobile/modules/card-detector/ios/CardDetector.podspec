Pod::Spec.new do |s|
  s.name           = 'CardDetector'
  s.version        = '1.0.0'
  s.summary        = 'Finds one card in the camera preview and takes its photo.'
  s.author         = 'mtgscan'
  s.homepage       = 'https://github.com/Reilley64/mtgscan'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '6.0'
  s.source         = { git: 'https://github.com/Reilley64/mtgscan.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreVideo', 'Vision'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_OPTIMIZATION_LEVEL' => '-O'
  }
end
