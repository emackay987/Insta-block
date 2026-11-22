// ==UserScript==
// @name         Insta-Block: Hide Reels
// @description  Blocks the Reels section on instagram.com. Hides Reels links, feed reels and the Reels tab, and sends Reels pages back to your feed.
// @version      1.0.0
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

  // Hide the wrappers around Reels nav items so they don't leave gaps.
  function sweep() {
    if (!document.body) return;
    addStyle(); // re-add if Instagram rebuilt <head>
    document.querySelectorAll('a[href="/reels/"], a[href$="/reels/"]').forEach((a) => {
      let node = a;
      for (let i = 0; i < 3; i++) {
        const parent = node.parentElement;
        if (!parent || parent === document.body || parent.children.length !== 1) break;
        node = parent;
      }
      if (node !== a) node.style.setProperty("display", "none", "important");
    });
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
})();
