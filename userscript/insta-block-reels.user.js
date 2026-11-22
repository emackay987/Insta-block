// ==UserScript==
// @name         Insta-Block: Hide Reels
// @description  Blocks the Reels section on instagram.com. Hides Reels links, feed reels and the Reels tab, and sends Reels pages back to your feed. Reels friends send you in DMs still open, but you can't scroll from them to other reels.
// @version      1.6.0
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
  const REEL_ID = /^\/reels?\/(?!audio\/)([A-Za-z0-9_-]+)/;
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
    /* Reels links outside feed posts (nav, profile tab, grids, search).
       Links inside posts are left in place so post sizes never change. */
    a[href="/reels/"]:not(article a),
    a[href^="/reels/"]:not(article a),
    a[href$="/reels/"]:not(article a),
    a[href*="/reels/?"]:not(article a),
    html:not(.ib-dm) a[href*="/reel/"]:not(article a) {
      display: none !important;
    }

    /* Reel posts in the feed keep their exact size; only what's inside is
       blanked out. Instagram's feed tracks post heights to decide what to
       draw and when to load more, so changing a post's size makes it jump
       to the top or stop loading. */
    article.ib-reel-post,
    article:has(a[href*="/reel/"]) {
      position: relative !important;
      pointer-events: none !important;
    }
    article.ib-reel-post *,
    article:has(a[href*="/reel/"]) * {
      visibility: hidden !important;
    }
    article.ib-reel-post::after,
    article:has(a[href*="/reel/"])::after {
      content: "Reel hidden";
      visibility: visible;
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8e8e8e;
      font: 13px -apple-system, system-ui, sans-serif;
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
  //  - you're on /reel/<id>/ after tapping that reel in a chat
  //  - a full-screen video viewer is open on top of a chat (Instagram
  //    sometimes plays shared reels there without changing the address)
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

  // A reel viewer drawn on top of a chat: a video taking up most of the
  // screen inside a pop-up layer (a dialog, or something pinned in place).
  // Videos that are just part of the page, like previews in the chat, don't
  // count.
  function inPopup(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.getAttribute("role") === "dialog" || node.getAttribute("aria-modal") === "true") return true;
      if (getComputedStyle(node).position === "fixed") return true;
    }
    return false;
  }
  function popupVideoOpen() {
    const minHeight = window.innerHeight * 0.6;
    for (const video of document.getElementsByTagName("video")) {
      const box = video.getBoundingClientRect();
      if (box.height >= minHeight && box.bottom > 0 && box.top < window.innerHeight && inPopup(video)) {
        return true;
      }
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

  // Decide from scratch, from the current address, whether to lock. Nothing
  // is carried over, so the lock can never follow you to the home feed.
  function updateLock() {
    const path = location.pathname;
    const id = reelId(path);
    const onSharedReel = Boolean(id) && isReelsPath(path) && store.get(ALLOWED) === id;
    const overChat = isDmPath(path) && popupVideoOpen();
    const now = onSharedReel || overChat;
    if (now && !locked) {
      baseline = new WeakMap();
      gestureUntil = 0;
    }
    locked = now;
    syncClasses();
  }

  function setLock() {
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
    // Hidden reel posts shouldn't keep playing out of sight.
    document
      .querySelectorAll("article.ib-reel-post video")
      .forEach((v) => {
        v.muted = true;
        if (!v.paused) v.pause();
      });
    const inDm = isDmPath(location.pathname);
    document.querySelectorAll("a[href]:not([data-ib-checked])").forEach((a) => {
      if (!linkIsReels(a)) {
        a.setAttribute("data-ib-checked", "");
        return;
      }
      const path = new URL(a.getAttribute("href"), location.href).pathname;
      if (inDm && reelId(path)) return; // a reel shared in a chat: leave it
      a.setAttribute("data-ib-checked", "");
      // Inside a feed post, never hide or resize anything (that makes the
      // feed jump). If the post is a reel, blank it out instead (see CSS).
      const post = a.closest("article");
      if (post) {
        if (reelId(path)) post.classList.add("ib-reel-post");
        return;
      }
      hide(a);
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
  // Safari can restore a page from its back/forward cache with old state.
  window.addEventListener("pageshow", () => {
    lastHref = "";
    checkLocation();
    updateLock();
  });
  setInterval(() => {
    checkLocation();
    updateLock();
  }, 500);

  addStyle();
  checkLocation();
  showBadge();
})();
