# UX7 Watch Party Test

## Build

Run `BUILD_SUPERMAN_AND_OPEN_XCODE.command` or use the standard Terminal build block.

After sync, Terminal should show:

- `Group Activities entitlement configured.`
- `Throuple Tea Watch Party native bridge ready.`

## Xcode verification

Open the App target → Signing & Capabilities.

Confirm **Group Activities** appears. If Xcode does not show the visual capability card but the project builds, open `App/App.entitlements` and confirm:

`com.apple.developer.group-session = YES`

Automatic signing must be enabled.

## Real-device test

SharePlay requires physical Apple devices and FaceTime.

1. Install UX7 on two iPhones.
2. Open FaceTime on both.
3. In the app, open Watch.
4. Tap **Party** on a full episode.
5. Invite the second phone.
6. Accept the FaceTime and SharePlay prompts.
7. Confirm both phones open the same video.
8. Pause on phone A; phone B should pause.
9. Seek on phone B; phone A should catch up.
10. Tap all six reactions and confirm they float on both phones.
11. Leave from one phone and verify the other remains stable.

## Known boundary

YouTube supplies the actual video stream. UX7 synchronizes playback commands and position through Apple's Group Activities framework; it does not redistribute or proxy the video.
