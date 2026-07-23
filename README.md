# A Little Throuple Tea — Capacitor iOS App

This folder is ready to become the separate `ThroupleTea-App` GitHub repository.

## First launch on the Mac

1. Unzip this folder.
2. Double-click `BUILD_AND_OPEN_IOS.command`.
3. The script installs the required packages, creates `ios/`, syncs the complete website from `www/`, and opens Xcode.
4. Select an iPhone simulator and press Play.

## Later website/app updates

Edit or replace files inside `www/`, then double-click:

`SYNC_AND_OPEN_IOS.command`

## GitHub

Upload the entire project folder to the new repository after the first build. Include:
- `www/`
- `ios/`
- `package.json`
- `package-lock.json`
- `capacitor.config.json`
- the two `.command` files
- `.gitignore`

Do not upload `node_modules/`.

## What was fixed

- The current uploaded Throuple Tea website is correctly placed inside `www/`.
- Internal pages and buttons remain inside the packaged app.
- External podcast/social links open outside the app.
- The old unrelated landing-page bundle is not included.
- GitHub Pages-only deployment files were removed from the app bundle.
