Pod::Spec.new do |s|
  s.name           = 'CardRecognizer'
  s.version        = '1.0.0'
  s.summary        = 'Recognizes a card printing from a photo of one card.'
  s.author         = 'mtgscan'
  s.homepage       = 'https://github.com/Reilley64/mtgscan'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '6.0'
  s.source         = { git: 'https://github.com/Reilley64/mtgscan.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.frameworks = 'Accelerate', 'CoreImage', 'Vision'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_OPTIMIZATION_LEVEL' => '-O'
  }
end
