/*
 * Kermit (RTPK) Network toolbar behaviour.
 *
 * The toolbar is a ChromeOS-shelf-style bar: it spans the full width and is
 * docked flush against the bottom edge of the window by default. The top and
 * left docks are still available from the settings overlay. Its own arrow folds
 * it away and the grip left behind on the same edge brings it back. The
 * position is saved and restored on the next visit.
 *
 * Only pages that opt in with <nav data-toolbar="main"> are affected; the small
 * menu bar on the subpages keeps its own behaviour.
 */
(function () {
    "use strict";

    var POS_KEY = "kermit_toolbarPos";
    var HIDE_KEY = "kermit_hideToolbar";
    var POSITIONS = ["bottom", "top", "left"];

    var SPACE_VARS = {
        top: "--toolbar-top-space",
        bottom: "--toolbar-bottom-space",
        left: "--toolbar-left-space",
    };

    // Which way each arrow points, per dock: the bar's own fold arrow, and the
    // grip's "bring it back" arrow on the edge the bar goes to.
    var DOCK = {
        bottom: { fold: "ri-arrow-down-s-line", unfold: "ri-arrow-up-s-line" },
        top: { fold: "ri-arrow-up-s-line", unfold: "ri-arrow-down-s-line" },
        left: { fold: "ri-arrow-left-s-line", unfold: "ri-arrow-right-s-line" },
    };

    // Set by the home page's navTo() while it has taken the bar off screen for a
    // full-screen store page.
    var barRemoved = false;

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
        var saved = String(read(POS_KEY, "bottom")).toLowerCase();
        return POSITIONS.indexOf(saved) === -1 ? "bottom" : saved;
    }

    function hidden() {
        return String(read(HIDE_KEY, "no")).toLowerCase() === "yes";
    }

    function toolbar() {
        return document.querySelector('nav[data-toolbar]');
    }

    // The grip that sits on the docked edge while the toolbar is away.
    function handle() {
        var el = document.getElementById("toolbarHandle");
        if (el) return el;

        el = document.createElement("button");
        el.id = "toolbarHandle";
        el.type = "button";
        el.title = "Show toolbar";
        el.setAttribute("aria-label", "Show toolbar");
        el.addEventListener("click", function () {
            setHidden(false);
            if (typeof window.showToast === "function") {
                window.showToast("success", "Toolbar is back!", "fas fa-check-circle");
            }
        });

        (document.body || document.documentElement).appendChild(el);
        return el;
    }

    // Point both arrows at the edge the bar is docked to. Runs on every apply(),
    // so switching dock in the settings overlay flips them without a reload.
    function paintDock() {
        var dock = DOCK[position()] || DOCK.bottom;
        var bar = toolbar();

        if (bar) {
            var arrow = bar.querySelector("li.toolbar-hide a i");
            if (arrow) arrow.className = dock.fold;
        }

        var grip = document.getElementById("toolbarHandle");
        if (grip) grip.innerHTML = '<i class="' + dock.unfold + '"></i>';
    }

    function apply() {
        var pos = position();
        var isHidden = hidden();
        var root = document.documentElement;

        // The dock class stays on even while the bar is folded away, so the grip
        // can sit on the edge that the bar will come back to.
        root.classList.toggle("toolbar-left", pos === "left");
        root.classList.toggle("toolbar-top", pos === "top");
        root.classList.toggle("toolbar-bottom", pos === "bottom");
        root.classList.toggle("toolbar-hidden", isHidden);

        // Keep the bar's own inline display in step with the hidden state. The
        // home page's navTo() writes `nav.style.display` directly, and an inline
        // style beats the .toolbar-hidden rule - so the arrow would say "hidden"
        // (and the grip would appear) while the bar stayed on screen. Forcing
        // the hidden value inline (and clearing it when shown again) makes the
        // stored state the single source of truth.
        var bar = toolbar();
        if (bar) {
            if (isHidden) {
                bar.style.setProperty("display", "none", "important");
            } else {
                bar.style.removeProperty("display");
                // navTo() fades the bar out for store pages; clear that too so a
                // bar brought back with the grip is never stuck at opacity 0.
                bar.style.removeProperty("opacity");
            }
        }

        if (isHidden) handle();

        paintDock();
        reserveSpace();
    }

    function setSpace(name, value) {
        document.documentElement.style.setProperty(SPACE_VARS[name], value + "px");
    }

    // The toolbar is fixed, so the page underneath has to be told how much room
    // it takes up. Without this the bar sat on top of the first ~48px of every
    // page it does not own (the subpages all render inside #contentFrame), and
    // the docks relied on hard-coded offsets that only happened to be right at
    // one window size. Measuring also copes with the bar growing a row taller
    // when the icon font loads or the viewport narrows.
    function reserveSpace() {
        var el = toolbar();

        if (barRemoved) {
            // navTo() has taken the bar off screen for a full-screen store page:
            // the page gets the whole window back instead of keeping an empty
            // strip where the bar was.
            setSpace("top", 0);
            setSpace("bottom", 0);
            setSpace("left", 0);
            return;
        }

        if (hidden()) {
            // Folded away, the page takes the whole window and the grip floats
            // over it: nothing is reserved for a bar that is not on screen.
            setSpace("top", 0);
            setSpace("bottom", 0);
            setSpace("left", 0);
            return;
        }

        if (!el) return;

        var rect = el.getBoundingClientRect();
        // A bar that is not being rendered measures as empty; keeping the values
        // already set beats reserving the whole window for a bar nobody sees.
        if (!rect.width || !rect.height) return;

        var pos = position();

        // Exact measured edges: the page has to meet the bar with nothing in
        // between. The few pixels of padding this used to add left a strip of
        // bare background along the bar, which is what made the toolbar look
        // like it was tearing away from the page.
        setSpace("top", pos === "top" ? Math.ceil(rect.bottom) : 0);
        setSpace("bottom", pos === "bottom" ? Math.ceil(window.innerHeight - rect.top) : 0);
        setSpace("left", pos === "left" ? Math.ceil(rect.right) : 0);
    }

    function announce() {
        document.dispatchEvent(new CustomEvent("toolbarChanged", {
            detail: { position: position(), hidden: hidden() }
        }));
    }

    function setPosition(next) {
        next = String(next || "").toLowerCase();
        write(POS_KEY, POSITIONS.indexOf(next) === -1 ? "bottom" : next);
        if (hidden()) write(HIDE_KEY, "no");
        barRemoved = false;
        apply();
        announce();
    }

    function setHidden(next) {
        write(HIDE_KEY, next ? "yes" : "no");
        barRemoved = false;
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
    // One call for the toolbar's own arrow, the grip and the Ctrl/Cmd+M key.
    window.toggleToolbar = function () {
        setHidden(!hidden());
    };
    // Used by the home page's navTo() around full-screen store pages, which hide
    // the bar itself rather than folding it away.
    window.collapseToolbarSpace = function (collapsed) {
        barRemoved = !!collapsed;
        reserveSpace();
    };

    function boot() {
        if (!toolbar()) return;
        apply();
        wire();

        // A position or hidden state chosen in another tab (or restored by the
        // account sync) follows along here without a reload.
        window.addEventListener("storage", function (e) {
            if (e.key !== POS_KEY && e.key !== HIDE_KEY) return;
            apply();
            announce();
        });

        window.addEventListener("resize", reserveSpace);
        window.addEventListener("load", reserveSpace);
        // The bar can also move because the page around it did, not just because
        // the window was resized.
        window.addEventListener("orientationchange", reserveSpace);

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
