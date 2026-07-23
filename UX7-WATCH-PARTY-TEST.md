# UX7.9.7 Watch Party Test

## Required setup

- Two physical iPhones signed into FaceTime
- UX7.9.7 / TestFlight build 3 installed on both
- Group Activities enabled for `com.throupletea.app`

## Terminal confirmation

The build must print all three lines:

- `Group Activities entitlement configured and verified.`
- `Throuple Tea Watch Party native bridge ready.`
- `Branded icon and splash screen are packaged.`

## Real-device test

1. Start a FaceTime call between both phones.
2. On phone A, open Throuple Tea → Watch.
3. Open a full episode and tap **Start Watch Party**.
4. Accept SharePlay on phone B.
5. Confirm both phones open the same video at 0:00.
6. Play/pause on phone A and verify phone B follows.
7. Seek on phone B and verify phone A catches up.
8. Confirm participant count updates.
9. Test Team William, Team Daniel, Team Caleb, Red Flag, Relatable, and WTF reactions.
10. Leave on one phone and confirm solo playback remains stable.

SharePlay cannot be meaningfully validated in the Simulator. YouTube supplies the stream; the app synchronizes playback state and reactions using Apple Group Activities.
