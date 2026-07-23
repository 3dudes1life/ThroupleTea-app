# A Little Throuple Tea — Superman App

This is a dedicated app experience. It does **not** modify or visually reuse the podcast website.

## What is built

- App-only Home, Listen, Watch, Hotline, and More tabs
- Fixed native-style bottom navigation
- Inline SVG icons, eliminating the missing phone/menu glyphs visible in the prior simulator build
- Full in-app podcast audio player
- Resume listening positions
- Lock-screen / Control Center media metadata where supported
- Episode search
- Saved episode and video favorites
- In-app YouTube player
- Native-style share actions with web fallbacks
- Offline cached data
- Automatic refresh when the app launches, returns to the foreground, reconnects, or remains open
- Live JSON content updates without modifying `throupletea.com`
- GitHub Action refreshing RSS + website episode metadata + YouTube uploads every two hours
- Dedicated Hotline composer that opens a prefilled email
- Exact locked podcast artwork and branding

## The update system

The bundled app code stays reviewed and self-contained.

The app downloads only JSON content from:

`https://raw.githubusercontent.com/3dudes1life/ThroupleTea-app/main/live-data/`

The workflow `.github/workflows/refresh-live-data.yml` refreshes that JSON every two hours. New episodes and YouTube uploads can therefore appear without a weekly Xcode/App Store rebuild.

## First run on the Mac

After replacing the repository contents with this package:

```bash
cd ~/Documents/ThroupleTea-app
chmod +x BUILD_SUPERMAN_AND_OPEN_XCODE.command
./BUILD_SUPERMAN_AND_OPEN_XCODE.command
```

If your local folder is connected to GitHub, pull or replace the files there first.

## Run the live-data workflow once

On GitHub:

1. Open **Actions**
2. Open **Refresh Live App Data**
3. Click **Run workflow**

The scheduled two-hour refreshes begin automatically after the workflow is on the `main` branch.

## Native push notifications

The UI and repository are ready for the next step, but Apple push still requires:

- OneSignal Capacitor SDK
- Apple/APNs credentials
- Push Notifications capability
- Background Modes → Remote notifications
- Notification Service Extension

Those are intentionally not faked in this package.
