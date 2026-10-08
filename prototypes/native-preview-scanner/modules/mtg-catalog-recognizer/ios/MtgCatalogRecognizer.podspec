Pod::Spec.new do |s|
  s.name           = 'MtgCatalogRecognizer'
  s.version        = '0.0.0'
  s.summary        = 'Throwaway on-device catalog recognizer for the mtgscan native preview prototype'
  s.description    = 'Feature-print shortlist and collector line reading for Magic cards'
  s.author         = ''
  s.homepage       = 'https://github.com/Reilley64/mtgscan'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Accelerate', 'CoreImage', 'Vision'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_OPTIMIZATION_LEVEL' => '-O'
  }
  s.source_files = '*.swift', 'shared/*.swift'
end
