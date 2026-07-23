# Throuple Tea — TestFlight Build 3

This package is prepared as App Store version **1.0**, build **3**, with bundle ID `com.throupletea.app`.

## Before uploading

1. Run `BUILD_UX7.9.7_AND_OPEN_XCODE.command` from this exact folder.
2. Confirm Xcode target → Signing & Capabilities:
   - Team: OutAt Inc.
   - Automatically manage signing: On
   - Bundle ID: `com.throupletea.app`
   - Group Activities: enabled
3. Run on a physical iPhone.
4. Confirm the Home Screen label is **Throuple Tea**.
5. Confirm the supplied app icon and splash screen appear.
6. Test Watch Party with two physical iPhones in FaceTime.
7. Select **Any iOS Device (arm64)** → Product → Archive → Distribute App → App Store Connect → Upload.

Builds 1 and 2 can remain in App Store Connect. Select build 3 for testing and eventual review.
