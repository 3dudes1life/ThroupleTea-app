# A Little Throuple Tea — Superman UX 5

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


## UX 2 fixes

- Removed the YouTube iframe that caused Error 153.
- Video buttons now open YouTube in Capacitor's secure in-app browser.
- Replaced the confusing app-only Hotline fields with the existing secure Wix Hotline form.
- Hotline submissions continue emailing `throupletea@gmail.com`, preserving the dashboard workflow.
- Added a regular-email fallback.
- Increased top and bottom safe spacing so headings and buttons are not covered.
- Tightened the Home hero crop, title sizing, and action-button layout.
- Strips unsupported leading emoji from visible episode/video titles while preserving source data.


## UX 3 fixes

- Hotline now opens a direct email to `throupletea@gmail.com`.
- Hotline subject is prefilled exactly as `Throuple Tea Submission`.
- Email body includes prompts for nickname, anonymity, and the listener's story.
- Removed the incorrect Wix email-signup form from the Hotline.
- Mini player now always displays the bundled official podcast artwork.
- Added a visible X button that closes the mini player while preserving listening progress.
- Rebuilt the header refresh button so the icon is precisely centered inside its box.


## UX 4 launch upgrades

- Restored the complete Watch page with separate **Shorts** and **Full Video Episodes** sections.
- Shorts use a swipeable vertical-video rail.
- Full episodes use large binge-friendly cards.
- Playback stays inside the app in a fullscreen player.
- Added an HTTPS GitHub Pages player wrapper to provide YouTube's required referrer identity.
- The updater collects up to 50 Shorts and 50 full videos from the channel.
- Added **Continue Listening** to Home.
- Added a fun **Surprise Me** episode button.
- Added new-video badges, duration labels, sharing, and favorites.
- Removed the unsupported question-mark symbol from the audio player title.

### After uploading UX4

1. Upload the UX4 files and folders to `ThroupleTea-app`.
2. Keep GitHub Pages enabled for the repository.
3. Run **Actions → Refresh Live App Data → Run workflow** once.
4. After it succeeds, tap Refresh inside the app.


## UX 5 refinements

- Changed every Watch action from **Play in app** to simply **Play**.
- Home hero episode artwork now displays the complete square episode flyer instead of cropping it.
- Episode cards, Continue Listening, and starter cards now display the full flyer artwork.
- Added a subtle branded backdrop behind square artwork so the complete flyer still feels intentional inside each card.
- Watch thumbnails remain optimized for their landscape and vertical formats.
