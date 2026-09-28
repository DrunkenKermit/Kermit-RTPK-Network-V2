/*
 * Kermit (RTPK) Network settings overlay.
 *
 * The overlay used to be hard-coded inside index.html, so every page with a
 * Settings link had to send you back to the home page before you could change
 * anything. This module injects the overlay into whatever page loads it (paired
 * with assets/css/settings.css), so settings now open on the page you are
 * actually on and pick up that page's theme.
 *
 * Load order on a page that wants it:
 *   <link rel="stylesheet" href="/assets/css/settings.css">
 *   ...
 *   <script src="/assets/js/settings.js"></script>   <!-- before dropdown.js -->
 *   <script src="/assets/js/dropdown.js"></script>
 *
 * dropdown.js queries the selector markup as soon as it runs, so settings.js
 * has to inject that markup first.
 */
(function () {
    "use strict";

    if (document.querySelector(".settings-container")) return;

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
            console.log("[settings] " + type + ": " + message);
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
        '<div class="settings-container settings-hidden">' +
        '<div class="container">' +
        '<div class="settings-sidebar vflex">' +
        '<div class="settings-section active" data-target="general" onclick="switchSettingsPage(\'general\')">' +
        '<i class="ri-settings-3-line"></i>General</div>' +
        '<div class="settings-section" data-target="cloaking" onclick="switchSettingsPage(\'cloaking\')">' +
        '<i class="ri-spy-line"></i>Cloaking</div>' +
        '<div class="settings-section" data-target="proxy" onclick="switchSettingsPage(\'proxy\')">' +
        '<i class="ri-global-line"></i>Proxy</div>' +
        '</div>' +

        '<div class="settings-content-container">' +
        '<div id="settings-general" class="settings-page settings-active">' +
        '<h2>Theme</h2>' +
        '<p>The color scheme used across the whole site. Some changes might not happen instantly, so refresh to see those take place.</p>' +
        selector("theme", "default") +

        '<h2>Background</h2>' +
        '<p>What animates behind the site. Rain is the default, and "None" is the lightest option on slower machines.</p>' +
        selector("background", "Rain") +

        '<h2>Toolbar</h2>' +
        '<p>Keep the toolbar as one long line across the top, dock it down the left side, or sit it along the bottom.</p>' +
        selector("toolbar", "Top") +

        '<h2>Hide Toolbar</h2>' +
        '<p>Move the toolbar out of the way completely and leave just a small handle in the top-left corner. Press the handle (or <b>Ctrl / ⌘ + M</b>) whenever you want it back.</p>' +
        toggleSwitch("toolbar-toggle", read("cherri_hideToolbar", "no") === "yes", "updateToolbarVisibility()") +
        '<br><br>' +

        '<h2>Custom Cursor</h2>' +
        '<p>Enable or disable the ZXS cursor, which could also improve performance.</p>' +
        toggleSwitch("cursor-toggle", read("cherri_customCursor", "yes") === "yes", "updateCur()") +
        '<br><br>' +

        '<h2>Game Overlay</h2>' +
        '<p>Enable or disable the game overlay, which provides useful tools while gaming such as a browser, recording tools, etc. Turn off if you\'re experiencing performance issues.</p>' +
        toggleSwitch("overlay-toggle", read("cherri_useOverlay", "yes") === "yes", "updateOverlaySettings()") +
        '<br><br><br>' +
        '</div>' +

        '<div id="settings-cloaking" class="settings-page">' +
        '<h2>Tab Cloak</h2>' +
        '<p>How your tab will appear in history, on filtering extensions, and more.</p>' +
        selector("decoy", "None") +

        '<h2>about:blank</h2>' +
        '<p>Create a new about:blank tab to hide Kermit (RTPK) Network from your history and filter.</p>' +
        '<button class="button" onclick="openAB()"><i class="ri-external-link-line"></i>&nbsp;Open in about:blank</button>' +
        '<br><br>' +

        '<h2>Auto Cloak</h2>' +
        '<p>If this toggle is switched on, then as soon as the page loads, it will immediately open the about:blank cloaked page and redirect the main page to Google. Off by default.</p>' +
        toggleSwitch("cloak-toggle", read("cherri_autoAB", "no") === "yes", "updateABSettings()") +
        '<br><br>' +

        '<h2>Confirm Leave</h2>' +
        '<p>This setting is useful if teachers are trying to close your tab. When the tab is closed, it will show an "Are you sure you want to leave this site?" popup to prevent tab closing.</p>' +
        toggleSwitch("confirm-leave-toggle", read("cherri_confirmLeave", "no") === "yes", "updateCLSettings()") +
        '<br><br><br>' +
        '</div>' +

        '<div id="settings-proxy" class="settings-page">' +
        '<h2>Wisp</h2>' +
        '<p>Websocket all content will be transferred through. Make sure the one in use is not blocked, or else it will not function! <b>The server you use must start with ws(s):// and end with a /.</b></p>' +
        '<div class="hcontainer">' +
        '<input class="wispInput" type="text" placeholder="wss://domain.tld/wisp/">' +
        '<button class="button" onclick="setWisp(document.querySelector(\'.wispInput\').value)">Set</button>' +
        '</div>' +
        '<br>' +
        '<p>Or pick one that is known to be reachable. The old default (wisp.rhw.one) no longer resolves, which is why proxied pages could not load at all.</p>' +
        selector("wisp", "Mercury Workshop") +
        '<br>' +

        '<h2>Backend</h2>' +
        '<p>The main proxy service. Scramjet is newer but more experimental, while Ultraviolet is older but less advanced.</p>' +
        selector("backend", "Scramjet") +

        '<h2>Search Engine</h2>' +
        '<p>This is the search engine that the proxy will use with search queries.</p>' +
        selector("search-engine", "DuckDuckGo") +

        '<br><br><br>' +
        '</div>' +
        '</div>' +

        '<p class="version-tag">Kermit (RTPK) Network ' +
        '<a href="https://github.com/DrunkenKermit/Kermit-RTPK-Network" target="_blank">stable v1.1.1</a></p>' +
        '</div>' +
        '</div>';

    function mount() {
        if (document.querySelector(".settings-container")) return;

        var holder = document.createElement("div");
        holder.innerHTML = markup;
        document.body.appendChild(holder.firstChild);

        var wispInput = document.querySelector(".settings-container .wispInput");
        if (wispInput) wispInput.value = read("cherri_wispUrl", "");
    }

    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);

    // ── Overlay behaviour ────────────────────────────────────────────────────

    function settingsHolder() {
        return document.querySelector(".settings-container");
    }

    window.switchSettingsPage = function (target) {
        document.querySelectorAll(".settings-page").forEach(function (page) {
            page.classList.toggle("settings-active", page.id === "settings-" + target);
        });

        document.querySelectorAll(".settings-section").forEach(function (button) {
            button.classList.toggle("active", button.getAttribute("data-target") === target);
        });
    };

    window.closeOverlays = function () {
        document.querySelectorAll(".blurOverlay").forEach(function (o) { o.remove(); });

        var holder = settingsHolder();
        if (!holder) return;

        holder.classList.remove("settings-shown");
        holder.classList.add("settings-hidden");
    };

    window.openOverlay = function (holder) {
        window.closeOverlays();
        if (!holder) return;

        var blur = document.createElement("div");
        blur.classList.add("blurOverlay");
        document.body.appendChild(blur);
        blur.addEventListener("click", window.closeOverlays);

        holder.classList.remove("settings-hidden");
        holder.classList.add("settings-shown");
    };

    window.toggleSettings = function () {
        var holder = settingsHolder();
        var wasOpen = holder.classList.contains("settings-shown");

        window.closeOverlays();
        if (!wasOpen) window.openOverlay(holder);
    };

    // ── General tab ──────────────────────────────────────────────────────────

    window.updateCur = function () {
        var toggle = document.getElementById("cursor-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("cherri_customCursor", "yes");
            if (typeof window.applyKermitCursor === "function") window.applyKermitCursor("custom");
            toast("success", "Custom cursor is now on!", "fas fa-check-circle");
        } else {
            write("cherri_customCursor", "no");
            if (typeof window.applyKermitCursor === "function") window.applyKermitCursor("default");
            toast("success", "Custom cursor is now off!", "fas fa-check-circle");
        }
    };

    window.updateOverlaySettings = function () {
        var toggle = document.getElementById("overlay-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("cherri_useOverlay", "yes");
            toast("success", "Game overlay is now on!", "fas fa-check-circle");
        } else {
            write("cherri_useOverlay", "no");
            toast("success", "Game overlay is now off!", "fas fa-check-circle");
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

    window.updateABSettings = function () {
        var toggle = document.getElementById("cloak-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("cherri_autoAB", "yes");
            toast("success", "Auto cloaking is now on!", "fas fa-check-circle");
        } else {
            write("cherri_autoAB", "no");
            toast("success", "Auto cloaking is now off!", "fas fa-check-circle");
        }
    };

    window.updateCLSettings = function () {
        var toggle = document.getElementById("confirm-leave-toggle");
        if (!toggle) return;

        if (toggle.checked) {
            write("cherri_confirmLeave", "yes");
            toast("success", "Confirm leave is now on!", "fas fa-check-circle");
        } else {
            write("cherri_confirmLeave", "no");
            toast("success", "Confirm leave is now off!", "fas fa-check-circle");
        }
    };

    window.addEventListener("beforeunload", function (e) {
        if (read("cherri_confirmLeave", "no") === "yes") {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    // Auto cloak only makes sense on the page you land on, not on every subpage
    // you happen to open while it is switched on.
    var isHome = /^\/(index\.html)?$/.test(window.location.pathname);
    if (isHome && read("cherri_autoAB", "no") === "yes") window.openAB();

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

        write("cherri_wispUrl", url);
        toast("success", "Wisp server updated! Do<b> ⌘⇧R</b>  to see changes.", "fas fa-check-circle");
    };
})();
