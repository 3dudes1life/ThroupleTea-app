Pod::Spec.new do |s|
  s.name = 'ThroupleWatchParty'
  s.version = '1.0.0'
  s.summary = 'Native SharePlay bridge for A Little Throuple Tea.'
  s.license = { :type => 'Proprietary', :text => 'Private project code.' }
  s.homepage = 'https://throupletea.com'
  s.author = { '3Dudes1Life Creative' => 'throupletea@gmail.com' }
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,mm}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.frameworks = 'GroupActivities', 'UIKit', 'Combine'
  s.dependency 'Capacitor'
end
