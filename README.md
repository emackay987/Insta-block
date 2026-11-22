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

## iPhone / iPad (Safari)

The Instagram app can't be modified, but Instagram in Safari can. Use the script in `userscript/` with the free **Userscripts** app.

1. Install **Userscripts** from the App Store and open it once. It asks you to pick a folder for scripts (for example `iCloud Drive/Userscripts`).
2. Copy `userscript/insta-block-reels.user.js` into that folder (from the Files app, AirDrop from a computer, or download it from GitHub on the phone).
3. Turn the extension on: **Settings → Apps → Safari → Extensions → Userscripts**. Turn it on and set **instagram.com** (or All Websites) to **Allow**.
4. Open instagram.com in Safari and log in. A pink "Reels blocked" badge flashes at the top when the script is running, and Reels should be gone.

Reels a friend sends you in DMs still open, but scrolling is locked so you can't move on to other reels. If you swipe to another reel anyway, you're sent back to the chat.

### Home screen shortcut

Safari extensions only run in Safari itself, **not** in home-screen web apps. Make sure your shortcut opens Safari:

- **Shortcuts app:** New shortcut → **Open URLs** → `https://www.instagram.com/` → Share → **Add to Home Screen**. This always opens in Safari.
- **Or from Safari:** Share → **Add to Home Screen**, and turn **off** "Open as Web App".

Then delete the Instagram app (or lock it with a Screen Time limit) so you use the Safari version.

## Notes

- This works on Instagram **in a web browser** only (including Safari on iPhone, above). Nothing can change the Instagram phone app itself.
- Instagram changes its page markup often. The extension matches on link URLs (`/reel/`, `/reels/`), which change much less often than class names, but if something slips through, open an issue.
