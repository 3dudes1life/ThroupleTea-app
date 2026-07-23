# A Little Throuple Tea — Superman UX 7.8.1

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


## UX 6 — Digital Bowl of Chaos

The app now includes a complete app-exclusive Bowl of Chaos game.

### Launch rules

- 2–9 players
- Optional player names
- No accounts or login
- Pick one pack or mix multiple packs
- Tap the bowl or enable shake-to-draw on an iPhone
- Pass-the-phone turns rotate automatically
- Cards do not repeat during a game
- Complete draw history
- Save favorite cards
- End-game summary and native sharing
- Play again with the same setup or change players/packs

### Launch packs

- Classic Chaos
- Most Likely To
- Would You Rather
- Red Flag or Just Gay?
- Astrology Chaos

The bundled launch contains 150 cards. `live-data/bowl-packs.json` is fetched remotely, so future packs and cards can be added through GitHub without requiring an App Store update.

The Throuple Hotline remains available from Home and More. The center navigation tab is now the Bowl.


## UX 7 — Throuple Tea Watch Party

UX7 adds a native iOS SharePlay experience for Shorts and full video episodes.

### Included

- Watch Party buttons on the featured video, Shorts, and full episodes
- Native SharePlay invitation through FaceTime
- Group Activities entitlement configured automatically during the build
- Session joining and participant counts
- Synchronized play, pause, seek, and periodic playback position
- Catch-up sync when another participant joins
- Live floating reactions:
  - Team William
  - Team Daniel
  - Team Caleb
  - Red Flag
  - Relatable
  - WTF
- Leave-party handling
- Normal solo playback remains unchanged
- The hosted YouTube wrapper now uses the YouTube IFrame API for playback control

### Important testing requirements

SharePlay cannot be tested meaningfully in the iOS Simulator. Use two physical iPhones:

1. Both devices need the UX7 build installed.
2. Sign into FaceTime on both devices.
3. Start a Watch Party from one phone.
4. Invite the second phone.
5. Accept the FaceTime call and SharePlay invitation.
6. Verify play, pause, seeking, participant count, and reactions.

The build script now runs `scripts/configure-shareplay-ios.py` automatically after Capacitor sync.


## UX 7.1 Bowl display fix

- Prevents iOS from zooming after editing player names.
- Player-name inputs now use iPhone-safe 16px text.
- Disables accidental double-tap zoom inside the Bowl.
- Forces the app and Bowl screens to remain within the device width.
- Stacks the Save and Pass buttons on narrow iPhones so nothing is clipped.
- Blurs the keyboard input and resets scroll before starting a game.


## UX 7.2

- Uses the uploaded official Bowl of Chaos logo and real mosaic bowl.
- The logo and bowl are separated into transparent app assets.
- The generated pink bowl is removed from setup and gameplay.
- The Bowl heading hides once gameplay starts to maximize usable screen space.
- The full UX6 Watch page is restored exactly, including the featured upload, Shorts rail, full episodes, Play and Share buttons.
- Normal videos and Shorts again use the proven UX6 player.
- SharePlay uses a separate `/player-party/` player only after Watch Party starts.
- Watch Party remains available inside the in-app video player.


## UX 7.3 — full YouTube catalog restoration

- Keeps the preferred UX6 Watch design.
- Pulls up to 75 Shorts and 75 full videos from the YouTube channel.
- Tries both the channel ID and `@ThroupleTea` channel routes.
- Merges the latest Atom-feed uploads as a safety net.
- Uses YouTube oEmbed dimensions to identify vertical Shorts when the tab pull is unavailable.
- Writes refreshed data to both the GitHub live-data endpoint and the app's bundled fallback.
- The local build command refreshes YouTube before syncing into Xcode.
- Clears the old one-video cache.
- Refuses to let a stale or degraded remote response replace a healthy catalog.
- Refresh feedback reports the actual Shorts and full-video totals.
- SharePlay Watch Party remains available inside the video player.


## UX 7.4 — Bowl logo crop fix

- Adds transparent breathing room around the official Bowl of Chaos logo.
- The left side of the C is no longer flush against the image boundary.
- Keeps the real bowl completely out of the logo asset.
- Prevents the Bowl page title container from clipping the logo or drop shadow.
- Preserves all UX7.3 YouTube catalog, Bowl, zoom, and Watch Party code.


## UX 7.5 — Watch page + Watch Party together

- Preserves the complete YouTube Watch page:
  - featured latest video
  - horizontal Shorts rail
  - full video episode catalog
  - Play and Share buttons
- Adds a compact note near the top:
  - **Turn any episode into a Watch Party**
  - tells users to tap Play and then Start Watch Party
- Watch Party controls remain inside the video player, where they make sense.
- Includes the UX7.4 Bowl logo crop fix and all previous Bowl, YouTube, and SharePlay work.


## UX 7.6 — Superman Stability Pass

No redesign. This release hardens the launch build.

### Bowl

- Correct singular/plural grammar for card, player, and pack counts.
- Saved Bowl cards now appear in **More → Saved Bowl cards**.
- Saved cards can be removed from the gallery.
- Simulator identifies itself and disables Shake to Draw with a clear physical-iPhone note.
- Physical iPhones retain shake, haptics, pass-the-phone turns, and all five launch packs.

### Listen

- Continue Listening is ordered by the episode played most recently.
- Listening timestamps persist separately from progress positions.
- Audio play/pause no longer rebuilds the 75-video Watch page.
- Progress writes are deduplicated instead of firing repeatedly at five-second marks.

### Watch

- Full episode cards load in batches of 12.
- Shorts remain swipeable.
- Failed YouTube thumbnails fall back to official podcast artwork.
- Watch Party visibly explains that everyone starts from 0:00.
- The preferred UX7.5 Watch design and SharePlay controls remain unchanged.

### Live data and offline safety

- Website archive, podcast RSS, YouTube full videos, YouTube Shorts, and Atom fallback are isolated.
- One failed source cannot stop the others from updating.
- Fresh RSS entries preserve saved website labels, summaries, artwork, and episode-page URLs when the archive is temporarily down.
- Concurrent refresh requests collapse into one request.
- Background refreshes use a two-minute cooldown.
- Manual Refresh remains immediate.
- Refresh preserves the user’s scroll position.
- Corrupted local-storage values are discarded safely instead of blanking the app.
- The build refuses to bundle fewer than five YouTube videos.

### Native/App Store hardening

- SharePlay now merges into `App.entitlements` rather than replacing the file.
- Future OneSignal/APNs entitlements will be preserved.
- Direct Capacitor versions are exact rather than floating ranges.
- `package-lock.json` is retained and no longer deleted during builds.
- Added the Capacitor Device plugin for reliable Simulator detection.


## UX 7.6.1 — certificate-safe local build

The first UX7.6 build correctly detected that only one fallback video was
available, but it stopped the build. William's older Python 3.7 certificate
store also prevented the local YouTube updater from reaching HTTPS sources.

This maintenance release:

- does not run yt-dlp or Python web requests during a local Xcode build
- automatically recovers the healthy full catalog from the previous UX7.5
  folder in Downloads
- otherwise downloads the current GitHub catalog with macOS `curl`
- continues to Xcode even when live catalog refresh is temporarily unavailable
- keeps the in-app live-data refresh, GitHub Action updater, Watch layout,
  SharePlay, Bowl fixes, saved cards, and all UX7.6 stability upgrades


## UX 7.7 — native show pages and episode details

- Replaces the browser versions of **Meet William, Caleb + Daniel** and
  **Throuple FAQ** with polished, full-screen native app pages.
- Adds structured `info-content.json` to both the bundled app and `live-data`,
  so About/FAQ copy can be edited from GitHub without a new App Store build.
- Removes **Be a guest** from the More menu.
- Changes Home → Start Here to open the native Meet page.
- Replaces every audio episode **Details / Episode page** button with a native
  episode-detail screen.
- Native episode detail includes artwork, season/episode/date/duration chips,
  full description, play/resume, favorite, and share.
- Removes the ugly website archive button because the complete feed is already
  available inside the app.
- Updates the live-data generator to store full RSS episode descriptions while
  retaining short card summaries.
- External platform links and the optional main website link still open outside
  the app by design.


## UX 7.8 — clean native episode details

- Removes unsupported RSS symbols, replacement boxes, invisible characters,
  raw links, and social/promotional boilerplate from native episode details.
- Converts long descriptions into readable two-sentence paragraphs.
- Converts the RSS `Plus:` area into a polished **Also on the table** topic list.
- Keeps full episode information while avoiding a giant wall of text.
- Moves Play/Resume and Share directly beneath metadata in normal document
  flow; the controls no longer float over or hide description text.
- Adds a true bottom-of-content marker and extra scroll breathing room.
- Removes duplicate metadata chips such as simultaneous `S2 Ep26`,
  `Season 2`, and `Episode 26`.
- Keeps artwork, native pages, progress, favorites, sharing, Watch Party,
  the full YouTube catalog, Bowl of Chaos, and every UX7.7/UX7.6 fix.


## UX 7.8.1 — preserve the full description

UX7.8 cleaned the RSS copy too aggressively and cut off valid episode details.

This patch:

- always preserves the full RSS episode description when one exists
- only removes unsupported replacement characters and invisible junk
- no longer truncates at promotional phrases
- formats intro copy, topic lines, and promo/footer lines into separate sections
- keeps Play/Resume and Share in normal flow above the description
- preserves all UX7.8 native layout and every prior app feature
