// ==UserScript==
// @name         Insta-Block: Hide Reels
// @description  Blocks the Reels section on instagram.com. Hides Reels links, feed reels and the Reels tab, and sends Reels pages back to your feed. Reels friends send you in DMs still open, but you can't scroll from them to other reels.
// @version      1.3.0
// @match        *://*.instagram.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const HOME = "/";
  // /reels/, /reels/<id>/, /reel/<id>/, /<user>/reels/
  const REELS_PATH = /^\/(reels?|[^/]+\/reels?)(\/|$)/;
  // The id of a single reel: /reel/<id>/ or /reels/<id>/
  const REEL_ID = /^\/reels?\/([A-Za-z0-9_-]+)/;
  const DM_PATH = /^\/direct(\/|$)/;

  const isReelsPath = (pathname) => REELS_PATH.test(pathname);
  const isDmPath = (pathname) => DM_PATH.test(pathname);
  const reelId = (pathname) => (pathname.match(REEL_ID) || [])[1] || null;
  // <html> may not exist yet at document-start, so look it up when needed.
  const root = () => document.documentElement;

  // ---- Remember which reel was opened from DMs -----------------------------
  // Stored per tab, so it survives Instagram doing a full page load.
  const store = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch {}
    },
    del(key) {
      try { sessionStorage.removeItem(key); } catch {}
    },
  };
  const ALLOWED = "ib-allowed-reel"; // id of the one reel you may watch
  const RETURN = "ib-return-url"; // the DM chat to go back to
  const LAST_DM = "ib-last-dm"; // "<timestamp>|<url>" of the last DM page

  // ---- Hide Reels with CSS -------------------------------------------------
  // html.ib-dm is set on DM pages, so reels friends send you stay visible.
  const css = `
    a[href="/reels/"],
    a[href^="/reels/"],
    a[href$="/reels/"],
    a[href*="/reels/?"],
    html:not(.ib-dm) a[href*="/reel/"],
    article:has(a[href*="/reel/"]),
    article:has(a[href*="/reels/audio/"]) {
      display: none !important;
    }
    html.ib-redirecting body { visibility: hidden !important; }

    /* Watching a reel from DMs: no scrolling to the next one. Covers the
       page, the main column and pop-up viewers drawn over the chat. */
    html.ib-reel-lock,
    html.ib-reel-lock body,
    html.ib-reel-lock main,
    html.ib-reel-lock main *,
    html.ib-reel-lock [role="dialog"],
    html.ib-reel-lock [role="dialog"] *,
    html.ib-reel-lock [role="presentation"] * {
      overflow: hidden !important;
      overscroll-behavior: none !important;
      scroll-snap-type: none !important;
    }
    html.ib-reel-lock body,
    html.ib-reel-lock body * { touch-action: none !important; }
  `;
  function addStyle() {
    if (document.getElementById("insta-block-style")) return;
    const style = document.createElement("style");
    style.id = "insta-block-style";
    style.textContent = css;
    const parent = document.head || root();
    if (!parent) return;
    parent.appendChild(style);
  }

  // ---- Scroll lock while watching a reel from DMs --------------------------
  // Two reasons to lock:
  //  - reelPageLock: you're on /reel/<id>/ after tapping it in a chat
  //  - dmViewerLock: a full-screen video is open on top of a chat (Instagram
  //    sometimes plays shared reels there without changing the address)
  let reelPageLock = false;
  let dmViewerLock = false;
  let locked = false;

  // 1) Swallow swipe and scroll gestures before Instagram's own handlers see
  //    them. Taps still work (play/pause, sound, close), since a tap doesn't
  //    fire touchmove/pointermove.
  const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "j", "k"]);
  function blockGesture(event) {
    if (!locked) return;
    if (event.type === "keydown") {
      const t = event.target;
      const typing = t instanceof Element && t.closest("input, textarea, [contenteditable]");
      if (typing || !SCROLL_KEYS.has(event.key)) return;
    }
    if (event.type === "pointermove" && event.pointerType === "mouse") return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const type of ["touchmove", "pointermove", "wheel", "keydown"]) {
    window.addEventListener(type, blockGesture, { capture: true, passive: false });
  }

  // 2) If something still scrolls while you're touching the screen (or for a
  //    moment after, while momentum carries on), put it straight back.
  //    Scrolls Instagram makes by itself, like jumping to the shared reel
  //    when the viewer opens, are remembered as the starting point.
  let gestureUntil = 0;
  function markGesture() {
    if (locked) gestureUntil = Date.now() + 1500;
  }
  for (const type of ["touchstart", "touchmove", "touchend", "wheel", "keydown"]) {
    window.addEventListener(type, markGesture, { capture: true, passive: true });
  }
  let baseline = new WeakMap();
  function onScroll(event) {
    if (!locked) return;
    const el =
      event.target === document || event.target === document.documentElement
        ? document.scrollingElement
        : event.target;
    if (!(el instanceof Element)) return;
    const saved = baseline.get(el);
    if (Date.now() > gestureUntil || !saved) {
      baseline.set(el, { top: el.scrollTop, left: el.scrollLeft });
      return;
    }
    if (el.scrollTop !== saved.top || el.scrollLeft !== saved.left) {
      el.scrollTop = saved.top;
      el.scrollLeft = saved.left;
    }
  }
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });

  // A video taking up most of the screen = a reel viewer is open.
  function bigVideoOpen() {
    const minHeight = window.innerHeight * 0.6;
    for (const video of document.getElementsByTagName("video")) {
      const box = video.getBoundingClientRect();
      if (box.height >= minHeight && box.bottom > 0 && box.top < window.innerHeight) return true;
    }
    return false;
  }

  // Keep the page classes in sync. Called often, because <html> may not
  // exist yet the first time the script runs.
  function syncClasses() {
    const r = root();
    if (!r) return;
    r.classList.toggle("ib-dm", isDmPath(location.pathname));
    r.classList.toggle("ib-reel-lock", locked);
  }

  function updateLock() {
    dmViewerLock = isDmPath(location.pathname) && bigVideoOpen();
    const now = reelPageLock || dmViewerLock;
    if (now && !locked) {
      baseline = new WeakMap();
      gestureUntil = 0;
    }
    locked = now;
    syncClasses();
  }

  function setLock(on) {
    reelPageLock = on;
    updateLock();
  }

  function leave(url) {
    setLock(false);
    root()?.classList.add("ib-redirecting");
    location.replace(url);
  }

  // ---- Decide what to do with the current page -----------------------------
  // Instagram is a single-page app, so watch the URL for in-app navigation.
  let lastHref = "";
  function checkLocation() {
    if (location.href === lastHref) return;
    const previous = lastHref;
    lastHref = location.href;
    const path = location.pathname;

    syncClasses();

    if (isDmPath(path)) {
      store.set(LAST_DM, Date.now() + "|" + location.href);
      store.del(ALLOWED);
      store.del(RETURN);
      setLock(false);
      return;
    }

    if (!isReelsPath(path)) {
      store.del(ALLOWED);
      store.del(RETURN);
      store.del(LAST_DM); // left DMs for somewhere else
      setLock(false);
      return;
    }

    // On a Reels page.
    const id = reelId(path);
    const allowed = store.get(ALLOWED);

    if (id && allowed === id) {
      setLock(true); // the reel you opened from DMs
      return;
    }

    if (allowed) {
      // Scrolled away from the DM reel: back to the chat.
      const back = store.get(RETURN) || HOME;
      store.del(ALLOWED);
      store.del(RETURN);
      leave(back);
      return;
    }

    // Just came from a DM chat? Then this is the reel a friend sent.
    const fromDm = previous ? new URL(previous).pathname : "";
    const [stamp, dmUrl] = (store.get(LAST_DM) || "").split(/\|(.*)/);
    const recentDm = stamp && Date.now() - Number(stamp) < 15000;
    if (id && (isDmPath(fromDm) || (!previous && recentDm))) {
      store.set(ALLOWED, id);
      store.set(RETURN, isDmPath(fromDm) ? previous : dmUrl);
      setLock(true);
      return;
    }

    leave(HOME);
  }

  // ---- Stop taps on Reels links before Instagram's router sees them --------
  function linkIsReels(a) {
    try {
      const url = new URL(a.getAttribute("href"), location.href);
      return /(^|\.)instagram\.com$/.test(url.hostname) && isReelsPath(url.pathname);
    } catch {
      return false;
    }
  }

  function onClick(event) {
    const link = event.target instanceof Element && event.target.closest("a[href]");
    if (!link || !linkIsReels(link)) return;
    // A single reel sent in a DM may be opened; everything else is blocked.
    const path = new URL(link.getAttribute("href"), location.href).pathname;
    if (isDmPath(location.pathname) && reelId(path)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // ---- Hide every link that points at Reels --------------------------------
  // Works for relative ("/reels/") and absolute
  // ("https://www.instagram.com/reels/") hrefs, and hides the wrapper too so
  // it doesn't leave a gap.
  function hide(el) {
    el.style.setProperty("display", "none", "important");
  }

  function sweep() {
    updateLock();
    if (!document.body) return;
    addStyle(); // re-add if Instagram rebuilt <head>
    const inDm = isDmPath(location.pathname);
    document.querySelectorAll("a[href]:not([data-ib-checked])").forEach((a) => {
      if (!linkIsReels(a)) {
        a.setAttribute("data-ib-checked", "");
        return;
      }
      const path = new URL(a.getAttribute("href"), location.href).pathname;
      if (inDm && reelId(path)) return; // a reel shared in a chat: leave it
      a.setAttribute("data-ib-checked", "");
      hide(a);
      // A feed post that links to a reel is a reel: hide the whole post.
      const post = a.closest("article");
      if (post) {
        hide(post);
        return;
      }
      // Nav items are usually wrapped in a few single-child divs.
      let node = a;
      for (let i = 0; i < 3; i++) {
        const parent = node.parentElement;
        if (!parent || parent === document.body || parent.children.length !== 1) break;
        node = parent;
      }
      if (node !== a) hide(node);
    });
  }

  // ---- Small badge so you can tell the script is running -------------------
  function showBadge() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", showBadge, { once: true });
      return;
    }
    const badge = document.createElement("div");
    badge.textContent = "Reels blocked";
    badge.setAttribute(
      "style",
      "position:fixed;top:calc(env(safe-area-inset-top) + 8px);left:50%;transform:translateX(-50%);" +
        "z-index:2147483647;background:#e1306c;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;" +
        "padding:6px 12px;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;" +
        "transition:opacity .4s"
    );
    document.body.appendChild(badge);
    setTimeout(() => (badge.style.opacity = "0"), 2500);
    setTimeout(() => badge.remove(), 3000);
  }

  // ---- Wire it up -----------------------------------------------------------
  let sweepQueued = false;
  new MutationObserver(() => {
    checkLocation();
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(() => {
      sweepQueued = false;
      sweep();
    });
  }).observe(document, { childList: true, subtree: true });

  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", checkLocation);
  setInterval(() => {
    checkLocation();
    updateLock();
  }, 500);

  addStyle();
  checkLocation();
  showBadge();
})();
