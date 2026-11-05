# Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode).
require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BuffersolHotrailUpdater'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://hotrail.buffersoltech.com'
  s.author = 'BufferSol'
  s.source = { :git => 'https://github.com/ahmadkhancodes/hotrail.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/HotrailUpdaterPlugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
