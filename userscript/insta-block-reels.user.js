// ==UserScript==
// @name         Insta-Block: Hide Reels
// @description  Blocks the Reels section on instagram.com. Hides Reels links, feed reels and the Reels tab, and sends Reels pages back to your feed.
// @version      1.1.0
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
  const isReelsPath = (pathname) => REELS_PATH.test(pathname);
  // <html> may not exist yet at document-start, so look it up when needed.
  const root = () => document.documentElement;

  // ---- Hide Reels with CSS -------------------------------------------------
  const css = `
    a[href="/reels/"],
    a[href^="/reels/"],
    a[href$="/reels/"],
    a[href*="/reels/?"],
    a[href*="/reel/"],
    article:has(a[href*="/reel/"]),
    article:has(a[href*="/reels/audio/"]) {
      display: none !important;
    }
    html.ib-redirecting body { visibility: hidden !important; }
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

  // ---- Leave Reels pages ---------------------------------------------------
  // Instagram is a single-page app, so watch the URL for in-app navigation.
  let lastHref = "";
  function checkLocation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (isReelsPath(location.pathname)) {
      root()?.classList.add("ib-redirecting");
      location.replace(HOME);
    }
  }

  // Stop taps on Reels links before Instagram's router sees them.
  function onClick(event) {
    const link = event.target instanceof Element && event.target.closest("a[href]");
    if (!link) return;
    let url;
    try {
      url = new URL(link.getAttribute("href"), location.href);
    } catch {
      return;
    }
    if (/(^|\.)instagram\.com$/.test(url.hostname) && isReelsPath(url.pathname)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  // Hide every link that points at Reels, whether its href is relative
  // ("/reels/") or absolute ("https://www.instagram.com/reels/"), plus the
  // wrapper around it so it doesn't leave a gap.
  function linkIsReels(a) {
    try {
      const url = new URL(a.getAttribute("href"), location.href);
      return /(^|\.)instagram\.com$/.test(url.hostname) && isReelsPath(url.pathname);
    } catch {
      return false;
    }
  }

  function hide(el) {
    el.style.setProperty("display", "none", "important");
  }

  function sweep() {
    if (!document.body) return;
    addStyle(); // re-add if Instagram rebuilt <head>
    document.querySelectorAll("a[href]:not([data-ib-checked])").forEach((a) => {
      a.setAttribute("data-ib-checked", "");
      if (!linkIsReels(a)) return;
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

  // Show a small badge for a few seconds so you can tell the script is running.
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
  setInterval(checkLocation, 500);

  addStyle();
  checkLocation();
  showBadge();
})();
