let aTab = 0;
let tabCounter = 1;
let bTabs = [];
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
// wss://wisp.rhw.one/ (the old default) no longer resolves at all, which left the
// browser unable to load anything. Known-dead servers are migrated on load.
const DEAD_WISPS = ["wss://wisp.rhw.one/", "wss://wisp.rhw.one"];
const DEFAULT_WISP = "wss://wisp.mercurywork.shop/";
const savedWisp = localStorage.getItem("cherri_wispUrl");
const wispUrl = !savedWisp || DEAD_WISPS.indexOf(savedWisp) !== -1 ? DEFAULT_WISP : savedWisp;
if (savedWisp !== wispUrl) {
  try {
    localStorage.setItem("cherri_wispUrl", wispUrl);
  } catch (e) { }
}
const bareUrl = "https://useclassplay.vercel.app/fq/";

let searchE;
const se = localStorage.getItem("cherri_searchEngine") || "DuckDuckGo";

if (se === "DuckDuckGo") {
  searchE = "https://duckduckgo.com/search?q=";
} else if (se === "Bing") {
  searchE = "https://bing.com/search?q=";
} else if (se === "Google") {
  searchE = "https://google.com/search?q=";
} else if (se === "Startpage") {
  searchE = "https://startpage.com/search?q=";
} else if (se === "Qwant") {
  searchE = "https://qwant.com/search?q=";
} else {
  searchE = "https://search.brave.com/search?q=";
}

connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);

const CONFIG = {
  files: {
    wasm: "/homework/history.wasm.wasm",
    all: "/homework/math.all.js",
    sync: "/homework/science.sync.js",
  },
};

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: CONFIG.files,
});
scramjet.init();

function newTab() {
  const tabCont = document.querySelector(".tabs");
  const nTab = {
    id: tabCounter++,
    title: "New Tab",
    url: "",
    history: [],
    historyIndex: -1,
  };

  bTabs.push(nTab);
  if (!tabCont) return;

  const ntBtn = document.querySelector(".newtab");

  const tabElement = document.createElement("div");
  tabElement.classList.add("tab", "hcontainer");
  tabElement.dataset.tabId = nTab.id;
  // The close button used to be `<i class="fas fa-times close-btn">`, but this
  // page only loads Remixicon, so the glyph rendered as nothing and the button
  // was invisible. It uses the icon font the page actually has now.
  tabElement.innerHTML = `
        <img src="/assets/img/fav.png" id="fav" data-fav-id="${nTab.id}" width="24" alt="">
            <span>
                New Tab
            </span>
        <i class="ri-close-line close-btn" title="Close tab" aria-label="Close tab"></i>
        `;

  tabElement.addEventListener("click", (e) => {
    if (!e.target.closest(".close-btn")) {
      switchTab(nTab.id);
    }
  });

  const closebtn = tabElement.querySelector(".close-btn");
  closebtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(nTab.id);
  });

  tabCont.insertBefore(tabElement, ntBtn);

  const tabFrame = document.createElement("iframe");
  tabFrame.classList.add("viewframe", "browser-frame");
  tabFrame.dataset.frameId = nTab.id;
  tabFrame.setAttribute("allowfullscreen", "true");
  tabFrame.src = "/newtab.html";

  document.body.appendChild(tabFrame);

  switchTab(nTab.id);
  refreshChrome();
}

function switchTab(tId) {
  aTab = tId;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", parseInt(tab.dataset.tabId) === tId);
  });

  document.querySelectorAll(".viewframe").forEach((frame) => {
    frame.classList.toggle("active", parseInt(frame.dataset.frameId) === tId);
  });

  const cTab = bTabs.find((t) => t.id === tId);
  if (cTab) {
    const input = document.getElementById("searchbar");
    if (input) input.value = cTab.url;
  }

  // The URL bar, the Back/Forward arrows and the bookmark star all describe the
  // tab that is in front, so they are refreshed together on every switch.
  refreshChrome();

  // Switching to a tab whose page is a challenge/empty should show its card.
  applyFrameNotice(activeFrame());
}

function closeTab(tId) {
  if (bTabs.length === 1) {
    showToast("error", "Cannot close last tab!", "fas fa-circle-xmark");
    return;
  }

  const tIndex = bTabs.findIndex((t) => t.id === tId);
  if (tIndex === -1) return;

  bTabs.splice(tIndex, 1);

  const tEl = document.querySelector(`.tab[data-tab-id="${tId}"]`);
  const frame = document.querySelector(`.viewframe[data-frame-id="${tId}"]`);

  if (tEl) tEl.remove();
  if (frame) frame.remove();

  if (aTab === tId) {
    const newATab = bTabs[Math.max(0, tIndex - 1)];
    if (newATab) {
      switchTab(newATab.id);
    }
  }

  refreshChrome();
}

// The backend choice defaults to Scramjet, and an unset/unknown key used to make
// Back/Forward read localStorage as null and throw before it navigated anywhere.
function backendName() {
  return String(localStorage.getItem("cherri_backend") || "scramjet").toLowerCase();
}

function encodeForBackend(url) {
  if (backendName().includes("ultraviolet") && typeof __uv$config !== "undefined") {
    return __uv$config.prefix + __uv$config.encodeUrl(url);
  }
  return scramjet.encodeUrl(url);
}

function nav(i) {
  console.log("e");
  if (!i.trim()) return;

  let url = i.trim();

  // App-store and app schemes (itms-appss://, mailto:, tel:, data:, ...) cannot
  // be fetched through the proxy, so they are refused up front instead of being
  // handed to the engine, which would answer with its own error page.
  // A scheme is only counted when nothing follows the colon that looks like a
  // port (`example.com:8080` is a host, not a scheme) and the input is not a
  // search query (which may contain a colon, e.g. "time: 5pm").
  const scheme = /\s/.test(url) ? null : url.match(/^([a-z][a-z0-9+.-]*):(?![0-9])/i);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    showToast("info", "That link can't be opened inside the proxy.", "fas fa-info-circle");
    return;
  }

  if (!url.includes(".") || url.includes(" ")) {
    url = searchE + encodeURIComponent(url);
  } else {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
  }

  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab) return;

  // Navigating away from a Back state starts a new branch: drop the forward
  // entries, otherwise Forward would replay pages the user has left behind.
  cTab.history = cTab.history.slice(0, cTab.historyIndex + 1);
  cTab.history.push(url);
  cTab.historyIndex = cTab.history.length - 1;

  cTab.url = url;

  go(encodeForBackend(url));
}

// An iframe's `src` attribute stays at whatever was last assigned, so after the
// user follows a link inside a proxied page it still describes the first page of
// that site. The frame's real current URL is on its own location object (the
// proxied document is served from this origin), which is what keeps the URL bar
// and, below, the arrow history in step with what is actually on screen.
function frameUrl(viewframe) {
  try {
    return viewframe.contentWindow.location.href;
  } catch (e) {
    return viewframe.src;
  }
}

// The engine's own URL prefix. A frame showing one of our own pages (the start
// page, about:blank, an engine error) has no prefix, and its URL must never end
// up in the address bar or the arrow history.
function enginePrefix() {
  if (backendName().includes("ultraviolet") && typeof __uv$config !== "undefined") {
    return __uv$config.prefix;
  }
  return "/scramjet/";
}

function decodeProxiedUrl(raw) {
  if (!raw) return null;

  try {
    const prefix = enginePrefix();
    const at = raw.indexOf(prefix);

    // Scramjet's decodeUrl blindly slices `location.origin + prefix` off the
    // front of whatever it is given, so a non-proxied URL has to be rejected
    // here instead of being decoded into garbage.
    if (at === -1) return null;

    let decoded;

    if (backendName().includes("ultraviolet") && typeof __uv$config !== "undefined") {
      decoded = __uv$config.decodeUrl(raw.slice(at + prefix.length));
    } else {
      decoded = scramjet.decodeUrl(raw);
    }

    // Anything that is not a plain page URL (about:blank, an engine error page,
    // a half-decoded string) must not reach the URL bar or the history.
    return decoded && /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch (e) {
    return null;
  }
}

// A link followed inside the proxied page loads a new document in the same frame
// and never touches our own history, so Back/Forward had nothing to walk and the
// arrows sat greyed out. Pages the user actually reached are recorded here.
function recordHistory(cTab, url) {
  if (cTab.navigating) return;
  if (cTab.history[cTab.historyIndex] === url) return;

  cTab.history = cTab.history.slice(0, cTab.historyIndex + 1);
  cTab.history.push(url);
  cTab.historyIndex = cTab.history.length - 1;
}

function updateUrlFromIframe(viewframe) {
  try {
    // Resolve the tab from the frame that actually loaded, not from whichever
    // tab happens to be in front. A background tab finishing its load used to
    // write its page into the front tab's URL bar and history.
    const tabId = parseInt(viewframe.dataset.frameId, 10);
    const cTab = bTabs.find((t) => t.id === tabId);
    if (!cTab) return;

    const decodedUrl = decodeProxiedUrl(frameUrl(viewframe));
    if (!decodedUrl || decodedUrl === cTab.url) return;

    cTab.url = decodedUrl;

    const favEl = document.querySelector(`#fav[data-fav-id="${tabId}"]`);
    if (favEl)
      favEl.src = `https://www.google.com/s2/favicons?domain=${decodedUrl}&sz=256`;

    recordHistory(cTab, decodedUrl);

    // Only the visible tab owns the address bar and the arrows.
    if (tabId === aTab) {
      const ubar = document.getElementById("searchbar");
      if (ubar) ubar.value = decodedUrl;
      refreshChrome();
    }
  } catch (e) {
    console.error("Error updating URL from iframe:", e);
  }
}

async function go(u) {
  if (!(await connection.getTransport())) {
    connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
  }

  console.log("a");
  const cTab = bTabs.find((t) => t.id === aTab);
  const favEl = document.querySelector(`#fav[data-fav-id="${aTab}"]`);
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  if (!viewframe) return;

  const ubar = document.getElementById("searchbar");

  const tabEl = document.querySelector(`.tab[data-tab-id="${aTab}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector("span");
    if (titleEl) titleEl.textContent = "Loading...";
  }

  // A card from the previous page must not sit over the one now loading, and a
  // dismissal only ever applies to the page it was made on.
  hideFrameNotice();
  if (cTab) {
    cTab.noticeDismissedFor = null;
    cTab.noticeHealthy = false;
    cTab.noticeUrl = null;
    cTab.blankStreak = 0;
  }

  if (ubar) ubar.value = cTab.url;
  const favUrl = cTab.url;
  if (favEl)
    favEl.src = `https://www.google.com/s2/favicons?domain=${favUrl}&sz=256`;

  try {
    // Marks this load as one we drove, so the onload handler records the page
    // only when the user navigated inside the framed site instead.
    if (cTab) cTab.navigating = true;

    viewframe.src = u;
    console.log("ooooo");

    viewframe.onload = () => {
      // The frame may belong to a tab that is no longer in front by the time the
      // load settles, so work off the frame's own id rather than the active tab.
      const tabId = parseInt(viewframe.dataset.frameId, 10);
      const tab = bTabs.find((t) => t.id === tabId) || cTab;
      const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
      const titleEl = tabEl ? tabEl.querySelector("span") : null;

      try {
        const iframeDoc =
          viewframe.contentDocument || viewframe.contentWindow.document;
        const title =
          iframeDoc.title || (tab && tab.url ? new URL(tab.url).hostname : "");
        if (titleEl && title) titleEl.textContent = title;
      } catch (e) {
        console.error("Error accessing iframe content:", e);
        if (titleEl && tab && tab.url) titleEl.textContent = new URL(tab.url).hostname;
      }

      updateUrlFromIframe(viewframe);
      applyFrameNotice(viewframe);

      if (tab) tab.navigating = false;
      refreshChrome();
    };
  } catch (e) {
    console.error("There was an error while loading the page:", e);
    showToast(
      "error",
      "There was a problem loading the page. Check the console for more info.",
      "fas fa-times-circle"
    );
  }

  refreshChrome();
}

function b() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab || cTab.historyIndex <= 0) return;

  cTab.historyIndex--;
  const u = cTab.history[cTab.historyIndex];
  cTab.url = u;

  go(encodeForBackend(u));
}

function f() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab) return;
  // Forward was happy to walk past the end of the history and load undefined.
  if (cTab.historyIndex + 1 >= cTab.history.length) return;

  cTab.historyIndex++;
  const u = cTab.history[cTab.historyIndex];
  cTab.url = u;

  go(encodeForBackend(u));
}

function r() {
  const cTab = currentTab();

  if (!activeFrame() || !cTab || !cTab.url) {
    showToast("info", "There is nothing to reload yet.", "fas fa-info-circle");
    return;
  }

  // Reload the page actually on screen, not `viewframe.src`: that attribute
  // still holds the URL the frame was FIRST pointed at, so after following a
  // link inside the site, reloading it jumped back to the older page and pushed
  // a bogus history entry. Going through go() with the current URL keeps the
  // encoding path exactly as it was.
  go(encodeForBackend(cTab.url));
}

// The Back/Forward/Reload/fullscreen buttons used to grab whatever iframe they
// found, so on a page with no tab yet they threw on `viewframe.src` of null.
// Everything goes through the active tab's own frame now.
function activeFrame() {
  return document.querySelector(`.viewframe[data-frame-id="${aTab}"]`);
}

// Sites that route with history.pushState (YouTube, TikTok, most dashboards)
// change the frame's URL without ever firing onload, so Back/Forward had
// nothing to walk and the address bar went stale. A light poll keeps the active
// tab's URL and history in step. It only reads the frame's location and the
// decoded URL - it never touches the request, the transport or the encoding.
function watchActiveFrame() {
  const viewframe = activeFrame();
  if (!viewframe) return;

  const cTab = bTabs.find((t) => t.id === aTab);
  // Never race a load we started ourselves; its onload handles the URL.
  if (!cTab || cTab.navigating) return;

  const decodedUrl = decodeProxiedUrl(frameUrl(viewframe));
  if (decodedUrl && decodedUrl !== cTab.url) {
    cTab.url = decodedUrl;

    const ubar = document.getElementById("searchbar");
    if (ubar) ubar.value = decodedUrl;

    const favEl = document.querySelector(`#fav[data-fav-id="${cTab.id}"]`);
    if (favEl)
      favEl.src = `https://www.google.com/s2/favicons?domain=${decodedUrl}&sz=256`;

    recordHistory(cTab, decodedUrl);
    refreshChrome();
  }

  // Keep the notice in step with what is actually on screen: show it for a
  // challenge or a genuinely empty render, clear it as soon as content appears.
  applyFrameNotice(viewframe);
}



// Fullscreen shows the browser chrome (tab strip + controls) with the page
// below it, and nothing else. Fullscreening the active page frame alone dropped
// the tabs, which is not what the fullscreen button is for. The page itself is
// the target instead: the tab frames are appended to <body> as siblings of the
// container, so only the whole document keeps the tabs and the pages together.
function full() {
  const target = document.documentElement;
  if (!target) return;

  // Fullscreen is only granted to an element whose own document allows it. The
  // site loads this page inside #contentFrame when you pick Browser from the
  // toolbar, so ask the (same-origin) host page to go fullscreen on that frame.
  // That frame is the whole browser page, so its tabs come along with it.
  const hostDoc = hostDocument();
  if (hostDoc !== document) {
    const hostFrame = hostFrameFor(hostDoc);
    if (hostFrame) {
      if (hostDoc.fullscreenElement) {
        exitFullscreen(hostDoc);
      } else {
        requestFullscreen(hostFrame);
      }
      refreshChrome();
      return;
    }
  }

  if (document.fullscreenElement) {
    exitFullscreen(document);
  } else {
    requestFullscreen(target);
  }

  refreshChrome();
}

function requestFullscreen(el) {
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;

  if (!request) {
    showToast("error", "Fullscreen is not available in this browser.", "fas fa-times-circle");
    return;
  }

  const result = request.call(el);
  if (result && typeof result.catch === "function") {
    result.catch(() =>
      showToast("error", "Fullscreen was blocked by the browser.", "fas fa-times-circle")
    );
  }
}

function exitFullscreen(doc) {
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
  if (!exit) return;

  const result = exit.call(doc);
  if (result && typeof result.catch === "function") result.catch(() => { });
}

// The top document when this page is embedded (same origin), otherwise ours.
function hostDocument() {
  try {
    return window.top.document;
  } catch (e) {
    return document;
  }
}

function hostFrameFor(hostDoc) {
  try {
    return Array.from(hostDoc.querySelectorAll("iframe")).find(
      (frame) => frame.contentWindow === window
    ) || null;
  } catch (e) {
    return null;
  }
}

function hideBrowser() {
  const b = document.querySelector(".browser-container");
  const frames = document.querySelectorAll(".viewframe");
  b.style.opacity = 0;
  frames.forEach((frame) => {
    frame.style.opacity = 0;
    frame.style.pointerEvents = "none";
  });
  b.style.pointerEvents = "none";
}

async function launchEruda() {
  if (typeof eruda === "undefined") {
    showToast("error", "Developer console is unavailable on this page.", "fas fa-times-circle");
    return;
  }

  try {
    if (!window.__kermitErudaReady) {
      eruda.init();
      window.__kermitErudaReady = true;
      showToast("success", "Developer console opened!", "fas fa-check-circle");
    } else {
      eruda.show();
      showToast("info", "Developer console is already running.", "fas fa-info-circle");
    }

    const btn = document.getElementById("eruda-toggle");
    if (btn) btn.classList.add("is-active");
  } catch (e) {
    showToast("error", "Failed to open the developer console.", "fas fa-times-circle");
  }
}

async function fixProxy() {
  await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);

  showToast("success", "Connection reset to Libcurl!", "fas fa-check-circle")
  console.log(
    "%c[SUCCESS]" + "%c Connection reset to Libcurl.",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );

  await navigator.serviceWorker.register("/sw.js")

  showToast("success", "Service workers reregistered. (1/2)", "fas fa-check-circle");
  console.log(
    "%c[SUCCESS]" + "%c Service workers reregistered. (1/2)",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );

  await navigator.serviceWorker.register("/uv/sw.js")

  showToast("success", "Service workers reregistered. (2/2)", "fas fa-check-circle");
  console.log(
    "%c[SUCCESS]" + "%c Service workers reregistered. (2/2)",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );
}

/* ── Browser chrome: tabs, bookmarks, layout ────────────────────────────────
   Presentation only. Nothing here touches the transport, the Wisp URL, the
   backend or the encoded proxy URLs: it reads one localStorage key for
   bookmarks and measures the toolbar so the page frame can sit below it. Every
   entry point is wrapped so a chrome hiccup can never interrupt navigation. */

const BOOKMARKS_KEY = "cherri_bookmarks";
const MAX_BOOKMARKS = 10;

// Chrome bookkeeping must never be able to break navigation, so all of it goes
// through this guard.
function refreshChrome() {
  try {
    renderChrome();
    layoutChrome();
  } catch (e) {
    console.error("Error refreshing browser chrome:", e);
  }
}

function getBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((b) => b && b.url) : [];
  } catch (e) {
    return [];
  }
}

function saveBookmarks(list) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  } catch (e) { }
}

function currentTab() {
  return bTabs.find((t) => t.id === aTab);
}

function tabTitle(cTab) {
  const label = document.querySelector(`.tab[data-tab-id="${cTab.id}"] span`);
  const text = label && label.textContent ? label.textContent.trim() : "";

  if (text && text !== "New Tab" && text !== "Loading...") return text;

  try {
    return new URL(cTab.url).hostname.replace(/^www\./, "");
  } catch (e) {
    return cTab.url;
  }
}

function renderChrome() {
  const cTab = currentTab();

  const back = document.querySelector('[data-nav="back"]');
  const forward = document.querySelector('[data-nav="forward"]');
  const reload = document.querySelector('[data-nav="reload"]');

  if (back) back.disabled = !cTab || cTab.historyIndex <= 0;
  if (forward) forward.disabled = !cTab || cTab.historyIndex + 1 >= cTab.history.length;
  if (reload) reload.disabled = !cTab || !cTab.url;

  const star = document.getElementById("bookmark-toggle");
  if (star) {
    const saved = !!(cTab && cTab.url) && getBookmarks().some((b) => b.url === cTab.url);
    star.classList.toggle("is-bookmarked", saved);
    star.title = saved ? "Remove from favourites" : "Add to favourites";

    const icon = star.querySelector("i");
    if (icon) icon.className = (saved ? "ri-star-fill" : "ri-star-line") + " ri";
  }
}

// The start page shows ten slots, so this keeps the list to ten and says so
// rather than silently ignoring the click.
function toggleBookmark() {
  const cTab = currentTab();
  if (!cTab || !cTab.url) {
    showToast("info", "Open a page before adding it to favourites.", "fas fa-info-circle");
    return;
  }

  const list = getBookmarks();
  const at = list.findIndex((b) => b.url === cTab.url);

  if (at !== -1) {
    list.splice(at, 1);
    showToast("success", "Removed from favourites.", "fas fa-check-circle");
  } else if (list.length >= MAX_BOOKMARKS) {
    showToast("error", "Favourites are full (" + MAX_BOOKMARKS + "). Remove one on the start page first.", "fas fa-times-circle");
    return;
  } else {
    list.push({ url: cTab.url, title: tabTitle(cTab) });
    showToast("success", "Added to favourites!", "fas fa-check-circle");
  }

  saveBookmarks(list);
  renderChrome();
}

// The page frame starts where the toolbar actually ends instead of at a fixed
// 114px, so a tab strip that wraps to a second row never covers the page.
function layoutChrome() {
  const bar = document.querySelector(".browser-controls");
  if (!bar) return;

  const height = Math.ceil(bar.getBoundingClientRect().height);
  if (height > 0) {
    document.documentElement.style.setProperty("--browser-chrome-h", height + "px");
  }
}

/* ── Bot-challenge / dead-page notice ───────────────────────────────────────
   A proxied page is served from this origin, so its document can be read. When
   a site answers with a bot challenge (Cloudflare and friends), a rate limit or
   an empty render, the frame would just look blank. This shows a friendly card
   over it instead. Read-only: it never touches the request, the transport, the
   Wisp URL or the encoded proxy URL. */

const CHALLENGE_MARKERS = [
  "just a moment",
  "checking your browser",
  "verify you are human",
  "verifying you are human",
  "attention required",
  "enable javascript and cookies to continue",
  "cf-browser-verification",
  "cf-chl",
  "unusual traffic",
  "too many requests",
  "rate limit",
  "you have been blocked",
  "access denied",
  "request blocked",
  "site blocked",
];

// Error pages a failed proxy request tends to leave behind. Only checked in
// short documents, so an article mentioning "500" is safe.
const ERROR_MARKERS = [
  "cannot get",
  "this site can't be reached",
  "this site can’t be reached",
  "err_connection",
  "err_name_not_resolved",
  "err_tunnel_connection_failed",
  "err_invalid_response",
  "err_failed",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "proxy error",
  "failed to fetch",
  "application error",
];

// How many consecutive empty checks (one per poll) before the card is worth
// showing. A page can look empty for a moment while it hydrates.
const BLANK_NOTICE_AFTER = 4;

function frameDoc(viewframe) {
  try {
    return viewframe.contentDocument || viewframe.contentWindow.document || null;
  } catch (e) {
    return null; // cross-origin: not ours to judge
  }
}

// Returns { kind, title, body } when the frame looks blocked, broken or empty.
function inspectFrameContent(viewframe) {
  const doc = frameDoc(viewframe);
  if (!doc) return null;

  const body = doc.body;
  const text = body ? body.innerText || body.textContent || "" : "";
  // Only inspect the body of small documents: a challenge page is tiny, so this
  // keeps an article that merely mentions "access denied" from tripping it.
  const hay = ((doc.title || "") + "\n" + (text.length < 5000 ? text : "")).toLowerCase();

  const marker = CHALLENGE_MARKERS.find((m) => hay.includes(m));
  if (marker) {
    if (marker === "site blocked") {
      return {
        kind: "adfilter",
        title: "Stopped by the ad filter",
        body: "This page matched an advertising or tracking rule, so the proxy blocked it before it loaded.",
      };
    }
    return {
      kind: "challenge",
      title: "The site is checking your browser",
      body: "This is a bot-protection page (usually Cloudflare). It can't be solved inside the proxy. Try again in a moment, or use another site.",
    };
  }

  if (ERROR_MARKERS.some((m) => hay.includes(m))) {
    return {
      kind: "error",
      title: "This page couldn't load",
      body: "The proxy or the site returned an error. Reload to try again, or try another address.",
    };
  }

  // Empty is judged very conservatively and never while the document is still
  // loading, so a script-only or not-yet-hydrated page is not mistaken for a
  // blank one. The periodic check (watchActiveFrame) also clears this again the
  // moment real content appears, so a slow page is never left covered.
  const empty = text.replace(/\s+/g, "").length === 0;
  const childless = !body || body.childElementCount === 0;
  if (empty && childless && doc.readyState === "complete") {
    return {
      kind: "blank",
      title: "The page didn't load anything",
      body: "It rendered empty. The site may be down, blocked, or refusing the proxy. Reload to try again.",
    };
  }

  return null;
}

function showFrameNotice(info) {
  const el = document.getElementById("frameNotice");
  if (!el) return;

  const title = el.querySelector(".frame-notice-title");
  const body = el.querySelector(".frame-notice-body");
  if (title) title.textContent = info.title;
  if (body) body.textContent = info.body;

  el.hidden = false;
}

function hideFrameNotice() {
  const el = document.getElementById("frameNotice");
  if (el) el.hidden = true;
}

// The card's Dismiss button: leave this page alone until it is navigated again.
function dismissFrameNotice() {
  const cTab = currentTab();
  if (cTab) {
    cTab.noticeDismissedFor = cTab.url;
    cTab.noticeHealthy = true;
    cTab.noticeUrl = cTab.url;
  }
  hideFrameNotice();
}

// Only ever describes the tab that is actually in front. Called on load and on
// every poll, so a notice both appears and clears itself as content changes.
// Reading the frame's text costs a layout, so a page already found healthy is
// not looked at again until it navigates - that is what keeps this cheap.
function applyFrameNotice(viewframe) {
  if (!viewframe) return;
  if (parseInt(viewframe.dataset.frameId, 10) !== aTab) return;

  const cTab = currentTab();
  if (!cTab) return;

  // This page has already been cleared and is still the one on screen.
  if (cTab.noticeHealthy && cTab.noticeUrl === cTab.url) return;

  const info = inspectFrameContent(viewframe);
  const dismissed = cTab.noticeDismissedFor === cTab.url;

  if (!info) {
    cTab.blankStreak = 0;
    // Only healthy once the document has finished loading, or a challenge that
    // renders a moment later would be missed.
    const doc = frameDoc(viewframe);
    if (doc && doc.readyState === "complete") {
      cTab.noticeHealthy = true;
      cTab.noticeUrl = cTab.url;
    }
    hideFrameNotice();
    return;
  }

  if (info.kind === "blank") {
    // A page can look empty for a moment while it hydrates, so complain only
    // once it has been empty for several checks in a row.
    cTab.blankStreak = (cTab.blankStreak || 0) + 1;
    if (cTab.blankStreak < BLANK_NOTICE_AFTER || dismissed) {
      hideFrameNotice();
      return;
    }
  } else if (dismissed) {
    hideFrameNotice();
    return;
  } else {
    cTab.blankStreak = 0;
  }

  showFrameNotice(info);
}

function bootBrowserChrome() {
  refreshChrome();

  // Only the browser page has tabs; elsewhere this stays unstarted.
  if (document.querySelector(".browser-container")) {
    setInterval(watchActiveFrame, 1200);
  }

  const bar = document.querySelector(".browser-controls");
  if (bar && typeof ResizeObserver === "function") {
    new ResizeObserver(layoutChrome).observe(bar);
  }

  window.addEventListener("resize", layoutChrome);
  document.addEventListener("fullscreenchange", layoutChrome);
  window.addEventListener("load", refreshChrome);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootBrowserChrome);
} else {
  bootBrowserChrome();
}
