/*
 * Kermit (RTPK) Network settings overlay.
 *
 * The overlay used to be hard-coded inside index.html, so every page with a
 * Settings link had to send you back to the home page before you could change
 * anything. This module injects the overlay into whatever page loads it (paired
 * with assets/css/folders.css), so settings now open on the page you are
 * actually on and pick up that page's theme.
 *
 * Load order on a page that wants it:
 *   <link rel="stylesheet" href="assets/css/folders.css">
 *   ...
 *   <script src="assets/js/folders.js"></script>   <!-- before dropdown.js -->
 *   <script src="assets/js/dropdown.js"></script>
 *
 * dropdown.js queries the selector markup as soon as it runs, so folders.js
 * has to inject that markup first.
 */
(function () {
    "use strict";

    if (document.querySelector(".folders-container")) return;

    var CROSS = '<svg class="cross" viewBox="0 0 365.696 365.696" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="currentColor" d="M243.188 182.86 356.32 69.726c12.5-12.5 12.5-32.766 0-45.247L341.238 9.398c-12.504-12.503-32.77-12.503-45.25 0L182.86 122.528 69.727 9.374c-12.5-12.5-32.766-12.5-45.247 0L9.375 24.457c-12.5 12.504-12.5 32.77 0 45.25l113.152 113.152L9.398 295.99c-12.503 12.503-12.503 32.769 0 45.25L24.48 356.32c12.5 12.5 32.766 12.5 45.247 0l113.132-113.132L295.99 356.32c12.503 12.5 32.769 12.5 45.25 0l15.081-15.082c12.5-12.504 12.5-32.77 0-45.25zm0 0"/></svg>';

    var CHECK = '<svg class="checkmark" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="currentColor" d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z"/></svg>';

    function read(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) { }
    }

    function toast(type, message, icon) {
        if (typeof window.showToast === "function") {
            window.showToast(type, message, icon || "fas fa-check-circle");
        } else {
            console.log("[folders] " + type + ": " + message);
        }
    }

    // One switch, matching the markup the home page used to carry inline.
    function toggleSwitch(id, checked, onchange) {
        return '<label class="switch">' +
            '<input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') +
            ' onchange="' + onchange + '">' +
            '<div class="slider"><div class="circle">' + CROSS + CHECK + '</div></div>' +
            '</label>';
    }

    function selector(kind, label) {
        return '<div class="' + kind + '-selector">' +
            '<div class="' + kind + '-selected">' + label + '</div>' +
            '<div class="' + kind + '-options"></div>' +
            '</div>';
    }

    var markup =
        '<div class="folders-container folders-hidden">' +
        '<div class="container">' +
        '<div class="folders-sidebar vflex">' +
        '<div class="folders-section active" data-target="general" onclick="switchFoldersPage(\'general\')">' +
        '<i class="ri-settings-3-line"></i>General</div>' +
        '<div class="folders-section" data-target="cloaking" onclick="switchFoldersPage(\'cloaking\')">' +
        '<i class="ri-spy-line"></i>Cloaking</div>' +
        '<div class="folders-section" data-target="proxy" onclick="switchFoldersPage(\'proxy\')">' +
        '<i class="ri-global-line"></i>Proxy</div>' +
        '<div class="folders-section" data-target="diagnostics" onclick="switchFoldersPage(\'diagnostics\')">' +
        '<i class="ri-pulse-line"></i>Diagnostics</div>' +
        '</div>' +

        '<div class="folders-content-container">' +
        '<div id="folders-general" class="folders-page folders-active">' +
        '<h2>Theme</h2>' +
        '<p>The color scheme used across the whole site. Some changes might not happen instantly, so refresh to see those take place.</p>' +
        selector("theme", "default") +

        '<h2>Background</h2>' +
        '<p>What animates behind the site. Rain is the default, and "None" is the lightest option on slower machines.</p>' +
        selector("background", "Rain") +

        '<h2>Toolbar</h2>' +
        '<p>The toolbar is a bar along the bottom edge of the window by default, and can also be docked along the top or down the left side. The arrow on it folds it away, and the grip left behind on that edge brings it back.</p>' +
        selector("toolbar", "Bottom") +
        '<br><br>' +

        '<h2>Custom Cursor</h2>' +
        '<p>Enable or disable the ZXS cursor, which could also improve performance.</p>' +
        toggleSwitch("cursor-toggle", read("kermit_customCursor", "yes") === "yes", "updateCur()") +
        '<br><br>' +

        '<br><br><br>' +
        '</div>' +

        '<div id="folders-cloaking" class="folders-page">' +
        '<h2>Tab Cloak</h2>' +
        '<p>How your tab will appear in history, on filtering extensions, and more.</p>' +
        selector("decoy", "None") +

        '<h2>about:blank</h2>' +
        '<p>Create a new about:blank tab to hide Kermit (RTPK) Network from your history and filter.</p>' +
        '<button class="button" onclick="openAB()"><i class="ri-external-link-line"></i>&nbsp;Open in about:blank</button>' +
        '<br><br>' +

        '<h2>Auto Cloak</h2>' +
        '<p>If this toggle is switched on, then as soon as the page loads, it will immediately open the about:blank cloaked page and redirect the main page to Google. Off by default.</p>' +
        toggleSwitch("cloak-toggle", read("kermit_autoAB", "no") === "yes", "updateABFolders()") +
        '<br><br>' +

        '<h2>Confirm Leave</h2>' +
        '<p>This setting is useful if teachers are trying to close your tab. When the tab is closed, it will show an "Are you sure you want to leave this site?" popup to prevent tab closing.</p>' +
        toggleSwitch("confirm-leave-toggle", read("kermit_confirmLeave", "no") === "yes", "updateCLFolders()") +
        '<br><br><br>' +
        '</div>' +

        '<div id="folders-proxy" class="folders-page">' +
        '<h2>Wisp</h2>' +
        '<p>Websocket all content will be transferred through. Make sure the one in use is not blocked, or else it will not function! <b>The server you use must start with ws(s):// and end with a /.</b></p>' +
        '<div class="hcontainer">' +
        '<input class="wispInput" type="text" placeholder="wss://domain.tld/wisp/">' +
        '<button class="button" onclick="setWisp(document.querySelector(\'.wispInput\').value)">Set</button>' +
        '</div>' +
        '<br>' +
        '<p>Or pick one that is known to be reachable. An older built-in default no longer resolves, which is why proxied pages could not load at all.</p>' +
        selector("wisp", "Mercury Workshop") +
        '<br>' +

        '<h2>Backend</h2>' +
        '<p>The engine is <b>GUST</b> (<a href="https://github.com/nautilus-os/GUST" target="_blank" rel="noopener">nautilus-os/GUST</a>), running as one self-contained page - /proxy.html - that reaches the web through the Wisp server above. It is a real HTTP stack plus a page rewriter, tunneled over a WebSocket, so there is no Service Worker and no second backend to pick between.</p>' +
        '<p>Because nothing is registered on this origin, the engine can be opened from a static host, an iframe, a blob: URL or a plain local file.</p>' +
        '<br>' +

        '<h2>Search Engine</h2>' +
        '<p>This is the search engine that the proxy will use with search queries.</p>' +
        selector("search-engine", "DuckDuckGo") +

        '<br><br><br>' +
        '</div>' +

        '<div id="folders-diagnostics" class="folders-page">' +
        '<h2>Proxy check</h2>' +
        '<p>What the proxy actually needs, read from this page. The check is read-only and changes nothing.</p>' +
        '<div class="diag-report" id="diag-report">' +
        '<div class="diag-row"><span class="diag-label">Opening the check…</span></div>' +
        '</div>' +
        '<div id="diag-hints"></div>' +
        '<button class="button" onclick="runDiagnostics()"><i class="ri-refresh-line"></i>&nbsp;Run check again</button>' +
        '<br>' +

        '<h2>Registered workers</h2>' +
        '<div class="diag-report" id="diag-workers"></div>' +

        '<h2>Cache Storage</h2>' +
        '<div class="diag-report" id="diag-caches"></div>' +
        '<br>' +

        '<h2>Reset</h2>' +
        '<p>Unregisters every service worker and empties Cache Storage for this site, then reloads. Use it when the browser keeps serving an older build of the proxy. Nothing else is cleared, so your theme, backend and Wisp choice are kept.</p>' +
        '<button class="button" onclick="resetProxyState()"><i class="ri-restart-line"></i>&nbsp;Reset workers &amp; caches</button>' +
        '<br><br>' +
        '<p>If the check reports the backend as <b>Ultraviolet</b>, that is why a proxied page will not load: this build only routes Scramjet through its worker. Switch it back to Scramjet under Proxy.</p>' +
        '<button class="button" onclick="resetProxyDefaults()"><i class="ri-eraser-line"></i>&nbsp;Reset backend &amp; Wisp to defaults</button>' +
        '<br><br><br>' +
        '</div>' +
        '</div>' +

        '</div>' +
        '</div>';

    function mount() {
        if (document.querySelector(".folders-container")) return;

        var holder = document.createElement("div");
        holder.innerHTML = markup;
        document.body.appendChild(holder.firstChild);

        applyScope();

        var wispInput = document.querySelector(".folders-container .wispInput");
        if (wispInput) wispInput.value = read("kermit_wispUrl", "");
    }

    // Which panels a page shows. The proxy/network options and the Diagnostics
    // check belong to the browser page's own Settings icon, so the site-wide
    // Settings keeps only the general options. <html data-folders="proxy">
    // marks the browser page. Only panels are moved: the values, storage keys and
    // handlers behind them (kermit_wispUrl, kermit_searchEngine) are untouched.
    function applyScope() {
        var scope = (document.documentElement.getAttribute("data-folders") || "site").toLowerCase();
        var keep = scope === "proxy" ? ["proxy", "diagnostics"] : ["general", "cloaking"];

        ["general", "cloaking", "proxy", "diagnostics"].forEach(function (id) {
            if (keep.indexOf(id) !== -1) return;

            var page = document.getElementById("folders-" + id);
            var tab = document.querySelector('.folders-section[data-target="' + id + '"]');

            if (page && page.parentNode) page.parentNode.removeChild(page);
            if (tab && tab.parentNode) tab.parentNode.removeChild(tab);
        });

        // Whichever tab survived becomes the one that is open.
        document.querySelectorAll(".folders-section").forEach(function (tab, i) {
            tab.classList.toggle("active", i === 0);
        });
        document.querySelectorAll(".folders-page").forEach(function (page, i) {
            page.classList.toggle("folders-active", i === 0);
        });
    }

    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);

    // ── Overlay behaviour ────────────────────────────────────────────────────

    function foldersHolder() {
        return document.querySelector(".folders-container");
    }

    window.switchFoldersPage = function (target) {
        document.querySelectorAll(".folders-page").forEach(function (page) {
            page.classList.toggle("folders-active", page.id === "folders-" + target);
        });

        document.querySelectorAll(".folders-section").forEach(function (button) {
            button.classList.toggle("active", button.getAttribute("data-target") === target);
        });

        // Re-run the check on open so it never shows stale numbers.
        if (target === "diagnostics") runDiagnostics();
    };

    window.closeOverlays = function () {
        document.querySelectorAll(".blurOverlay").forEach(function (o) { o.remove(); });

        var holder = foldersHolder();
        if (!holder) return;

        holder.classList.remove("folders-shown");
        holder.classList.add("folders-hidden");
    };

    window.openOverlay = function (holder) {
        window.closeOverlays();
        if (!holder) return;

        var blur = document.createElement("div");
        blur.classList.add("blurOverlay");
        document.body.appendChild(blur);
        blur.addEventListener("click", window.closeOverlays);

        holder.classList.remove("folders-hidden");
        holder.classList.add("folders-shown");
    };

    window.toggleFolders = function () {
        var holder = foldersHolder();
        var wasOpen = holder.classList.contains("folders-shown");

        window.closeOverlays();
        if (!wasOpen) window.openOverlay(holder);
    };

    // ── General tab ──────────────────────────────────────────────────────────

    window.updateCur = function () {
        var toggle = document.getElementById("cursor-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("kermit_customCursor", "yes");
            if (typeof window.applyKermitCursor === "function") window.applyKermitCursor("custom");
            toast("success", "Custom cursor is now on!", "fas fa-check-circle");
        } else {
            write("kermit_customCursor", "no");
            if (typeof window.applyKermitCursor === "function") window.applyKermitCursor("default");
            toast("success", "Custom cursor is now off!", "fas fa-check-circle");
        }
    };

    // ── Cloaking tab ─────────────────────────────────────────────────────────

    window.openAB = function () {
        if (window.self !== window.top) return;

        var win = window.open();
        if (!win) return;

        var url = window.location.href;
        var iframe = win.document.createElement("iframe");
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.border = "none";
        win.document.body.style.margin = "0";
        iframe.src = url;
        win.document.body.appendChild(iframe);
        window.location.href = "https://google.com/";
    };

    window.updateABFolders = function () {
        var toggle = document.getElementById("cloak-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("kermit_autoAB", "yes");
            toast("success", "Auto cloaking is now on!", "fas fa-check-circle");
        } else {
            write("kermit_autoAB", "no");
            toast("success", "Auto cloaking is now off!", "fas fa-check-circle");
        }
    };

    window.updateCLFolders = function () {
        var toggle = document.getElementById("confirm-leave-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("kermit_confirmLeave", "yes");
            toast("success", "Confirm leave is now on!", "fas fa-check-circle");
        } else {
            write("kermit_confirmLeave", "no");
            toast("success", "Confirm leave is now off!", "fas fa-check-circle");
        }
    };

    window.addEventListener("beforeunload", function (e) {
        if (read("kermit_confirmLeave", "no") === "yes") {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    // Auto cloak only makes sense on the page you land on, not on every subpage
    // you happen to open while it is switched on.
    var isHome = /^\/(index\.html)?$/.test(window.location.pathname);
    if (isHome && read("kermit_autoAB", "no") === "yes") window.openAB();

    // ── Proxy tab ────────────────────────────────────────────────────────────

    window.setWisp = function (url) {
        if (!url) return;

        if (!url.endsWith("/")) {
            toast("error", "Wisp server must end with a slash!", "fas fa-times-circle");
            return;
        }
        if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
            toast("error", "Wisp server must start with ws(s)://", "fas fa-times-circle");
            return;
        }
        if (url.includes(" ")) {
            toast("error", "Wisp server must not contain space!", "fas fa-times-circle");
            return;
        }

        write("kermit_wispUrl", url);
        toast("success", "Wisp server updated! Do<b> ⌘⇧R</b>  to see changes.", "fas fa-check-circle");
    };

    // ── Diagnostics tab ──────────────────────────────────────────────────────
    //
    // Read-only reporting, plus a reset of slides-side state. None of this
    // edits the proxy's configuration or engine code, so it can explain a
    // "the proxy stopped loading" without being able to cause one.

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "-" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function diagRow(label, value, ok) {
        var mark = ok === undefined ? "" : ok ? "&#10003; " : "&#10007; ";
        var cls = ok === undefined ? "" : ok ? " diag-ok" : " diag-bad";

        return '<div class="diag-row"><span class="diag-label">' + escapeHtml(label) +
            '</span><span class="diag-value' + cls + '">' + mark + escapeHtml(value) + "</span></div>";
    }

    function pathOf(url) {
        try {
            return new URL(url, window.location.href).pathname;
        } catch (e) {
            return url;
        }
    }

    // The default Wisp lives in slidesfunctions.js; read it from there when that
    // script is on the page so the two cannot drift apart.
    function defaultWisp() {
        try {
            return typeof DEFAULT_WISP !== "undefined" ? DEFAULT_WISP : "wss://wisp.mercurywork.shop/";
        } catch (e) {
            return "wss://wisp.mercurywork.shop/";
        }
    }

    // Opening the same websocket the transport uses is the one check that really
    // answers "why is nothing loading" — it is read-only and sends nothing.
    function checkWisp(url) {
        return new Promise(function (resolve) {
            var socket;

            try {
                socket = new WebSocket(url);
            } catch (e) {
                return resolve({ ok: false, detail: "not a usable websocket URL" });
            }

            var done = false;
            var timer = setTimeout(function () { finish(false, "timed out after 5s"); }, 5000);

            function finish(ok, detail) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                try { socket.close(); } catch (e) { }
                resolve({ ok: ok, detail: detail });
            }

            socket.onopen = function () { finish(true, "reachable"); };
            socket.onerror = function () { finish(false, "could not connect (blocked or offline)"); };
        });
    }

    window.runDiagnostics = function () {
        var out = document.getElementById("diag-report");
        var workersOut = document.getElementById("diag-workers");
        var cachesOut = document.getElementById("diag-caches");
        var hints = document.getElementById("diag-hints");

        if (!out) return;

        if (hints) hints.innerHTML = "";
        if (workersOut) workersOut.innerHTML = "";
        if (cachesOut) cachesOut.innerHTML = "";

        var secure = window.isSecureContext === true;
        var supported = "serviceWorker" in navigator;
        var controller = supported && navigator.serviceWorker.controller
            ? navigator.serviceWorker.controller.scriptURL
            : null;

        // There is exactly one backend now: GUST over the Wisp tunnel, in a single
        // page that registers nothing. The old kermit_backend key is dead.
        var wisp = read("kermit_wispUrl", defaultWisp());

        // Rows are built twice: immediately, then again once the async parts
        // (registered workers, cache names, a Wisp probe) have come back.
        function rows(wispProbe) {
            var wispRow = wispProbe
                ? diagRow("Wisp reachable", wispProbe.detail || "unknown", wispProbe.ok === true)
                : diagRow("Checking Wisp…", "…");

            return diagRow("Page", window.location.origin + window.location.pathname) +
                diagRow("HTTPS / secure context", secure ? "yes" : "no", secure) +
                diagRow("Backend", "GUST engine over Wisp (one page, no worker)", true) +
                // The proxy installs nothing, so a worker here is left over from the
                // old Scramjet/Ultraviolet build - shown so it can be cleared.
                diagRow("Service workers", supported ? "not used by the proxy" : "not supported", true) +
                diagRow("Controlling worker", controller ? pathOf(controller) + " - left over from the old build" : "none, as intended", !controller) +
                diagRow("Wisp in use", wisp) +
                wispRow +
                diagRow("Search engine", read("kermit_searchEngine", "DuckDuckGo (default)"));
        }

        out.innerHTML = rows(null);

        Promise.all([
            supported ? navigator.serviceWorker.getRegistrations() : Promise.resolve([]),
            window.caches ? caches.keys() : Promise.resolve([]),
            checkWisp(wisp)
        ]).then(function (results) {
            var registrations = results[0] || [];
            var cacheNames = results[1] || [];
            var probe = results[2] || {};

            out.innerHTML = rows(probe);

            if (workersOut) {
                workersOut.innerHTML = registrations.length
                    ? registrations.map(function (registration) {
                        var worker = registration.active || registration.waiting || registration.installing;
                        return diagRow(worker ? pathOf(worker.scriptURL) : "none", "scope " + pathOf(registration.scope));
                    }).join("")
                    : diagRow("none registered", "nothing is registered on this origin");
            }

            if (cachesOut) {
                cachesOut.innerHTML = cacheNames.length
                    ? cacheNames.map(function (name) { return diagRow(name, "cached"); }).join("")
                    : diagRow("empty", "nothing cached");
            }

            // A missing controller is normal on a first load, so it only becomes a
            // hint when there is nothing registered to take over either.
            if (hints && !controller) {
                hints.innerHTML = registrations.length
                    ? "<p>Nothing controls this page yet. Reload once and the registered worker takes over.</p>"
                    : "<p>No worker is registered, so nothing can rewrite requests. A reload should register them; if this stays empty, service workers are blocked on this origin.</p>";
            }
        }).catch(function (e) {
            out.innerHTML += "<p>Could not finish the check: " + escapeHtml(e && e.message) + "</p>";
        });
    };

    window.resetProxyState = function () {
        toast("info", "Resetting service workers and caches…", "fas fa-info-circle");

        var unregistered = 0;
        var cleared = 0;

        Promise.resolve()
            .then(function () {
                if (!("serviceWorker" in navigator)) return null;
                return navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    return Promise.all(registrations.map(function (registration) {
                        unregistered++;
                        return registration.unregister();
                    }));
                });
            })
            .then(function () {
                if (!window.caches) return null;
                return caches.keys().then(function (names) {
                    return Promise.all(names.map(function (name) {
                        cleared++;
                        return caches.delete(name);
                    }));
                });
            })
            .then(function () {
                toast("success", "Removed " + unregistered + " worker(s) and " + cleared + " cache(s). Reloading…", "fas fa-check-circle");
            })
            .catch(function (e) {
                toast("error", "Reset failed: " + (e && e.message), "fas fa-times-circle");
            })
            .then(function () {
                setTimeout(function () { window.location.reload(); }, 900);
            });
    };

    window.resetProxyDefaults = function () {
        // These three decide which engine loads and where it talks to; clearing
        // them restores the values this build ships with.
        ["kermit_backend", "kermit_wispUrl", "kermit_wispUrlSelected"].forEach(function (key) {
            try {
                localStorage.removeItem(key);
            } catch (e) { }
        });

        toast("success", "Backend and Wisp reset to defaults. Reloading…", "fas fa-check-circle");
        setTimeout(function () { window.location.reload(); }, 900);
    };
})();
