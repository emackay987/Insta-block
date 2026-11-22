(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const HOME = "/";
  // /reels/, /reels/<id>/, /reel/<id>/, /<user>/reels/
  const REELS_PATH = /^\/(reels?|[^/]+\/reels?)(\/|$)/;

  let enabled = true;
  const root = document.documentElement;

  function isReelsPath(pathname) {
    return REELS_PATH.test(pathname);
  }

  function applyState() {
    root.classList.toggle("ib-on", enabled);
    if (enabled) {
      checkLocation();
      sweep();
    } else {
      root.classList.remove("ib-redirecting");
    }
  }

  // Instagram is a single-page app, so in-app navigation never hits the
  // network-level redirect. Watch the URL and bounce off Reels pages.
  let lastHref = "";
  function checkLocation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (enabled && isReelsPath(location.pathname)) {
      root.classList.add("ib-redirecting");
      location.replace(HOME);
    }
  }

  // Stop clicks on Reels links before Instagram's router sees them.
  function onClick(event) {
    if (!enabled) return;
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

  // Hide the wrappers around Reels links (nav items, grid tiles) so they
  // don't leave empty gaps. CSS already hides the links themselves.
  function sweep() {
    if (!enabled || !document.body) return;
    document
      .querySelectorAll('a[href="/reels/"], a[href$="/reels/"]')
      .forEach((a) => {
        // Nav items are usually wrapped in a couple of single-child divs.
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
  const observer = new MutationObserver(() => {
    checkLocation();
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(() => {
      sweepQueued = false;
      sweep();
    });
  });

  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", checkLocation);
  setInterval(checkLocation, 500); // fallback for pushState navigations
  observer.observe(root, { childList: true, subtree: true });

  root.classList.add("ib-on"); // default on until storage answers
  checkLocation();

  api.storage.sync.get({ enabled: true }, (data) => {
    enabled = data.enabled !== false;
    applyState();
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      lastHref = "";
      applyState();
    }
  });
})();
