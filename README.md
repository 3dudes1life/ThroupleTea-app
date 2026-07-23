# A Little Throuple Tea — Live Dynamic Capacitor App

This version is configured to load the current production website:

`https://throupletea.com`

That means the Friday episode-page automation continues to update the app automatically. A new App Store version is **not** required every Friday.

## First build

1. Download or clone this repository.
2. Double-click `BUILD_LIVE_APP_AND_OPEN_XCODE.command`.
3. Select an iPhone simulator in Xcode.
4. Press Play.

## Normal website updates

Keep updating the regular `ThroupleTea` website repository exactly as you do now. Once GitHub Pages deploys the website update, the app displays it automatically.

You do not need to edit this app repository or resubmit to Apple for:
- new episodes
- Friday-generated episode pages
- updated homepage copy
- ordinary website content changes

## When an App Store update is needed

Update and resubmit the native app only for changes such as:
- native push notifications
- app icon or launch screen
- new native permissions or plugins
- major native navigation
- Apple-required maintenance

## Two configurations included

- `capacitor.config.live.json` — current default; loads the live site.
- `capacitor.config.bundled.json` — keeps a packaged `www/` copy for later App Store hardening or offline support.

To return to live mode and open Xcode:

`npm run live:ios`

## Important App Store note

This live version is ideal for development and TestFlight prototyping. Before final public App Store submission, add native value such as native push notifications, sharing, saved episodes, or a native Hotline screen so the app is more than a simple website wrapper.
