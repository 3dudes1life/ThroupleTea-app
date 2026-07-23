# Watch Party Superman Fix — 3.0.8

## Fixed
- Start Watch Party no longer remains stuck on “Opening SharePlay…” after Apple’s sheet is canceled.
- A watchdog reconciles native SharePlay state and restores the button automatically.
- Repeated Start → Cancel → Start flows are supported.
- Ending or leaving a party clears stale playback synchronization state.
- “Back to Watch Party” reopens the active synchronized player instead of becoming a dead button.
- App foregrounding reconciles native SharePlay state.

## Identity lock
- Bundle identifier remains `com.throupletea.app`.
- Home Screen / App Store display name is explicitly locked to **Throuple Tea**.
- Podcast branding inside the app remains **A Little Throuple Tea**.
