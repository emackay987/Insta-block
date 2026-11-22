# Insta-Block

A browser extension that blocks the **Reels** section on instagram.com.

## What it does

- **Redirects Reels pages** (`/reels/`, `/reel/<id>/`, `/<user>/reels/`) to your home feed, whether you open them directly or navigate there inside Instagram.
- **Hides Reels links**: the Reels item in the sidebar / bottom nav, the Reels tab on profiles, and reel tiles in Explore, search and profile grids.
- **Hides reel posts** in your home feed.
- **On/off switch** in the toolbar popup.

## Install

### Chrome / Edge / Brave
1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension/` folder.

### Firefox (121+)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `extension/manifest.json`.
   (Temporary add-ons are removed when Firefox restarts. To keep it installed, sign it through addons.mozilla.org.)

## Notes

- This works on Instagram **in a web browser** only. A browser extension can't change the Instagram phone app.
- Instagram changes its page markup often. The extension matches on link URLs (`/reel/`, `/reels/`), which change much less often than class names, but if something slips through, open an issue.
