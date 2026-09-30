/*
 * Kermit (RTPK) Network toolbar behaviour.
 *
 * The main toolbar is one long line at the top of the page by default; it can
 * also be docked down the left side or along the bottom, and it can be hidden
 * entirely (a small handle brings it back). Both choices are saved and restored
 * on the next visit.
 *
 * Only pages that opt in with <nav data-toolbar="main"> are affected; the small
 * menu bar on the subpages keeps its own behaviour.
 */
(function () {
    "use strict";

    var POS_KEY = "cherri_toolbarPos";
    var HIDE_KEY = "cherri_hideToolbar";
    var POSITIONS = ["top", "left", "bottom"];

    function read(key, fallback) {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) { }
    }

    function position() {
        var saved = String(read(POS_KEY, "top")).toLowerCase();
        return POSITIONS.indexOf(saved) === -1 ? "top" : saved;
    }

    function hidden() {
        return String(read(HIDE_KEY, "no")).toLowerCase() === "yes";
    }

    function toolbar() {
        return document.querySelector('nav[data-toolbar]');
    }

    // The little eye button that sits in the corner while the toolbar is away.
    function handle() {
        var el = document.getElementById("toolbarHandle");
        if (el) return el;

        el = document.createElement("button");
        el.id = "toolbarHandle";
        el.type = "button";
        el.title = "Show toolbar";
        el.setAttribute("aria-label", "Show toolbar");
        el.innerHTML = '<i class="ri-eye-line"></i>';
        el.addEventListener("click", function () {
            setHidden(false);
            if (typeof window.showToast === "function") {
                window.showToast("success", "Toolbar is back!", "fas fa-check-circle");
            }
        });

        (document.body || document.documentElement).appendChild(el);
        return el;
    }

    function apply() {
        var pos = position();
        var isHidden = hidden();
        var root = document.documentElement;

        root.classList.toggle("toolbar-left", !isHidden && pos === "left");
        root.classList.toggle("toolbar-bottom", !isHidden && pos === "bottom");
        root.classList.toggle("toolbar-hidden", isHidden);

        if (isHidden) {
            handle();
        } else {
            var el = document.getElementById("toolbarHandle");
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }

        reserveSpace();

        // Keep the settings switch in sync (the overlay may not exist yet).
        var toggle = document.getElementById("toolbar-toggle");
        if (toggle) toggle.checked = isHidden;
    }

    // The toolbar is fixed, so the page underneath has to be told how much room
    // it takes up. Without this the bar sat on top of the first ~80px of every
    // page it does not own (the subpages all render inside #contentFrame), and
    // the left/bottom variants relied on hard-coded offsets that only happened
    // to be right at one window size. Measuring also copes with the bar growing
    // a row taller when the icon font loads or the viewport narrows.
    function reserveSpace() {
        var root = document.documentElement;
        var el = toolbar();
        var top = 0;
        var bottom = 0;
        var left = 0;

        if (el && !hidden()) {
            var rect = el.getBoundingClientRect();
            var pos = position();

            if (pos === "bottom") bottom = Math.ceil(window.innerHeight - rect.top + 8);
            else if (pos === "left") left = Math.ceil(rect.right + 8);
            else top = Math.ceil(rect.bottom + 8);
        }

        // Consumed by #contentFrame and #homeContent in styles/index.css.
        root.style.setProperty("--toolbar-top-space", top + "px");
        root.style.setProperty("--toolbar-bottom-space", bottom + "px");
        root.style.setProperty("--toolbar-left-space", left + "px");
    }

    function announce() {
        document.dispatchEvent(new CustomEvent("toolbarChanged", {
            detail: { position: position(), hidden: hidden() }
        }));
    }

    function setPosition(next) {
        next = String(next || "").toLowerCase();
        write(POS_KEY, POSITIONS.indexOf(next) === -1 ? "top" : next);
        if (hidden()) write(HIDE_KEY, "no");
        apply();
        announce();
    }

    function setHidden(next) {
        write(HIDE_KEY, next ? "yes" : "no");
        apply();
        announce();
    }

    function wire() {
        // Any element can opt into choosing the toolbar position.
        document.querySelectorAll("[data-toolbar-position]").forEach(function (el) {
            el.addEventListener("click", function (event) {
                event.preventDefault();
                setPosition(el.getAttribute("data-toolbar-position"));
            });
        });

        // Ctrl/Cmd + M toggles the toolbar anywhere on the page.
        document.addEventListener("keydown", function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
                event.preventDefault();
                setHidden(!hidden());
            }
        });
    }

    window.setToolbarPos = setPosition;
    window.getToolbarPos = position;
    window.setToolbarHidden = setHidden;
    window.getToolbarHidden = hidden;
    window.updateToolbarVisibility = function () {
        var toggle = document.getElementById("toolbar-toggle");
        setHidden(toggle ? toggle.checked : !hidden());
    };

    function boot() {
        if (!toolbar()) return;
        apply();
        wire();

        window.addEventListener("resize", reserveSpace);
        window.addEventListener("load", reserveSpace);

        // The bar is sized by the icon font, which may still be loading when the
        // first measurement is taken.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(reserveSpace).catch(function () { });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
