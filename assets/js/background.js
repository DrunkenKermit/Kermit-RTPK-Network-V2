/*
 * Shared Kermit (RTPK) Network background.
 *
 * One place decides what the animated backdrop is, so the Settings picker can
 * offer several looks without every page having its own effects code:
 *
 *     none | rain (default) | terminal | grid | dots
 *
 * Stored in localStorage as "kermit_background". The old on/off key
 * ("kermit_particlesOn") is kept in sync so anything still reading it agrees.
 *
 * Every animated mode paints behind a themed scrim (see startCanvas), so a
 * backdrop can never wash out the text sitting on top of it.
 */
(function () {
    "use strict";

    var KEY = "kermit_background";
    var LEGACY_KEY = "kermit_particlesOn";
    var DEFAULT_MODE = "rain";
    var MODES = ["none", "rain", "terminal", "grid", "dots"];
    var CONTAINER_ID = "kermit-background";
    var VEIL_ID = "kermit-background-veil";
    var GLYPHS = "01\u30a2\u30a4\u30a6\u30a8\u30aa\u30ab\u30ad\u30af\u30b1\u30b3\u30b5\u30b7\u30b9\u30bb\u30bd\u30bf\u30c1\u30c4\u30c6\u30c8\u30ca\u30cb\u30cc\u30cd\u30ce\u30cf\u30d2\u30d5\u30d8\u30db\u30de\u30df\u30e0\u30e1\u30e2\u30e4\u30e6\u30e8\u30e9\u30ea\u30eb\u30ec\u30ed\u30ef#$%&@*+=-<>/\\";

    var mode = null;
    var canvas = null;
    var ctx = null;
    var raf = null;
    var items = [];
    var scroll = 0;
    var lastTime = 0;
    var dpr = 1;
    var accent = "99,255,147";
    var veilEl = null;

    function cssVar(name, fallback) {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
        } catch (e) {
            return fallback;
        }
    }

    // Canvas wants "r,g,b"; the theme can hand back hex, rgb() or color-mix().
    function toRgb(color, fallback) {
        color = (color || "").trim();

        var hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            var h = hex[1];
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            return parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16);
        }

        var rgb = color.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
        if (rgb) return Math.round(rgb[1]) + "," + Math.round(rgb[2]) + "," + Math.round(rgb[3]);

        return fallback;
    }

    function readMode() {
        try {
            var stored = String(localStorage.getItem(KEY) || "").toLowerCase();
            if (stored && MODES.indexOf(stored) !== -1) return stored;
            if (localStorage.getItem(LEGACY_KEY) === "no") return "none";
        } catch (e) { }
        return DEFAULT_MODE;
    }

    function reducedMotion() {
        try {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) {
            return false;
        }
    }

    function sizeCanvas() {
        var width = window.innerWidth || 1024;
        var height = window.innerHeight || 768;

        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (mode === "rain") seedRain(width, height, true);
        if (mode === "terminal") seedTerminal(width, height);
        if (mode === "grid") scroll = 0;
        if (mode === "dots") seedDots(width, height);
    }

    /* ── rain ────────────────────────────────────────────────────────────── */

    function newDrop(width, height, anywhere) {
        return {
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : -40 - Math.random() * height * 0.25,
            length: 20 + Math.random() * 56,
            speed: 150 + Math.random() * 360,
            alpha: 0.26 + Math.random() * 0.5
        };
    }

    function seedRain(width, height, anywhere) {
        var count = Math.max(70, Math.min(340, Math.round(width / 4.2)));
        items = [];
        for (var i = 0; i < count; i++) items.push(newDrop(width, height, anywhere));
    }

    function drawRain(dt, width, height) {
        ctx.lineWidth = 1.9;
        ctx.lineCap = "round";

        for (var i = 0; i < items.length; i++) {
            var drop = items[i];
            drop.y += drop.speed * dt;
            if (drop.y - drop.length > height) items[i] = drop = newDrop(width, height, false);

            ctx.strokeStyle = "rgba(" + accent + "," + drop.alpha + ")";
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y - drop.length);
            ctx.lineTo(drop.x, drop.y);
            ctx.stroke();
        }
    }

    /* ── terminal (falling glyph columns) ────────────────────────────────── */

    function seedTerminal(width, height) {
        var columns = Math.max(20, Math.min(130, Math.round(width / 15)));
        var step = 18;
        items = [];

        for (var i = 0; i < columns; i++) {
            var rows = [];
            for (var r = 0; r < Math.ceil(height / step) + 6; r++) {
                rows.push(GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)));
            }
            items.push({
                x: i * (width / columns) + 4,
                head: Math.random() * height,
                speed: 60 + Math.random() * 190,
                step: step,
                rows: rows,
                flip: Math.random() < 0.35
            });
        }
    }

    function drawTerminal(dt, width, height) {
        var tail = 14;
        ctx.font = "15px 'Courier New', monospace";
        ctx.textBaseline = "top";

        for (var i = 0; i < items.length; i++) {
            var col = items[i];
            col.head += col.speed * dt * (col.flip ? -0.6 : 1);
            if (col.head - tail * col.step > height) col.head = -Math.random() * 300;

            for (var row = 0; row < tail; row++) {
                var y = col.head - row * col.step;
                if (y < -col.step || y > height) continue;

                var fade = 1 - row / tail;
                ctx.fillStyle = row === 0
                    ? "rgba(255,255,255,0.75)"
                    : "rgba(" + accent + "," + (fade * 0.72).toFixed(3) + ")";

                var glyph = col.rows[(Math.floor(col.head / col.step) + row) % col.rows.length];
                ctx.fillText(glyph, col.x, y);
            }

            if (Math.random() < 0.02) {
                col.rows[Math.floor(Math.random() * col.rows.length)] =
                    GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
            }
        }
    }

    /* ── grid (slowly panning technical grid) ───────────────────────────── */

    function drawGrid(dt, width, height) {
        var gap = 64;
        scroll = (scroll + dt * 26) % gap;

        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "rgba(" + accent + ",0.42)";
        ctx.beginPath();
        for (var x = -gap + scroll; x < width + gap; x += gap) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (var y = -gap + scroll; y < height + gap; y += gap) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // A brighter sweep makes the movement readable.
        var sweep = (scroll / gap) * height;
        var glow = ctx.createLinearGradient(0, sweep - 90, 0, sweep + 90);
        glow.addColorStop(0, "rgba(" + accent + ",0)");
        glow.addColorStop(0.5, "rgba(" + accent + ",0.28)");
        glow.addColorStop(1, "rgba(" + accent + ",0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, sweep - 90, width, 180);
    }

    /* ── dots (drifting particles) ───────────────────────────────────────── */

    function seedDots(width, height) {
        var count = Math.max(45, Math.min(260, Math.round((width * height) / 13000)));
        items = [];
        for (var i = 0; i < count; i++) {
            items.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 26,
                vy: (Math.random() - 0.5) * 26,
                r: 1.4 + Math.random() * 2.9,
                alpha: 0.38 + Math.random() * 0.58,
                twinkle: Math.random() * Math.PI * 2
            });
        }
    }

    function drawDots(dt, width, height) {
        for (var i = 0; i < items.length; i++) {
            var dot = items[i];
            dot.x += dot.vx * dt;
            dot.y += dot.vy * dt;
            dot.twinkle += dt * 1.6;

            if (dot.x < -10) dot.x = width + 10;
            if (dot.x > width + 10) dot.x = -10;
            if (dot.y < -10) dot.y = height + 10;
            if (dot.y > height + 10) dot.y = -10;

            var alpha = dot.alpha * (0.6 + 0.4 * Math.sin(dot.twinkle));
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + accent + "," + alpha.toFixed(3) + ")";
            ctx.fill();
        }
    }

    /* ── canvas lifecycle ────────────────────────────────────────────────── */

    function draw(timestamp) {
        raf = requestAnimationFrame(draw);

        var width = window.innerWidth;
        var height = window.innerHeight;
        var dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
        lastTime = timestamp;

        if (document.hidden) return;

        ctx.clearRect(0, 0, width, height);

        if (mode === "rain") drawRain(dt, width, height);
        else if (mode === "terminal") drawTerminal(dt, width, height);
        else if (mode === "grid") drawGrid(dt, width, height);
        else if (mode === "dots") drawDots(dt, width, height);
    }

    function startCanvas() {
        if (!canvas) {
            canvas = document.getElementById(CONTAINER_ID);
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.id = CONTAINER_ID;
                canvas.setAttribute("aria-hidden", "true");
                document.body.appendChild(canvas);
            }
            // The mask fades the effect out toward the edges so it blends with the
            // themed backdrop instead of ending on a hard rectangle.
            canvas.style.cssText =
                "position:fixed;left:0;top:0;width:100%;height:100%;" +
                "z-index:-1;opacity:.7;pointer-events:none;" +
                "-webkit-mask-image:radial-gradient(circle at 50% 46%, #000 58%, transparent 100%);" +
                "mask-image:radial-gradient(circle at 50% 46%, #000 58%, transparent 100%);";
            ctx = canvas.getContext("2d");
        }

        ensureVeil();

        sizeCanvas();
        lastTime = 0;
        if (!raf) raf = requestAnimationFrame(draw);

        if (!window.__kermitBgResize) {
            window.__kermitBgResize = true;
            window.addEventListener("resize", function () {
                if (canvas && (mode === "rain" || mode === "terminal" || mode === "grid" || mode === "dots")) sizeCanvas();
            });
        }
    }

    /* A themed veil between the animation and the page.

       The effect is only decoration: the text on top of it is what has to stay
       readable, and some modes (the terminal's white glyphs) or a bright theme
       accent can eat into that. The veil is a fixed, fully transparent-to-clicks
       layer one z-index step above the canvas, so whatever the backdrop does,
       there is always a consistent slab of the theme's own background colour
       behind the copy. It lives in the same negative-z level as the canvas and
       is appended after it, so it paints on top of the effect but still below
       every bit of page content (negative z-index paints under the in-flow
       layer, where the text lives). */
    function ensureVeil() {
        if (!veilEl) veilEl = document.getElementById(VEIL_ID);
        if (!veilEl) {
            veilEl = document.createElement("div");
            veilEl.id = VEIL_ID;
            veilEl.setAttribute("aria-hidden", "true");
        }
        // The rgba line is the fallback for browsers without color-mix(); where
        // it is supported the declaration after it wins and the veil follows the
        // active theme instead of being a fixed dark tint.
        veilEl.style.cssText =
            "position:fixed;inset:0;z-index:-1;pointer-events:none;" +
            "background:rgba(4,10,7,.45);" +
            "background:color-mix(in srgb, var(--bg, #07140b) 45%, transparent);";
        // Always last in the body, so it stays above the canvas.
        document.body.appendChild(veilEl);
    }

    function stopCanvas() {
        if (raf) {
            cancelAnimationFrame(raf);
            raf = null;
        }
        items = [];
        if (canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.remove();
            canvas = null;
            ctx = null;
        }
        // Both layers go together: with no animation there is nothing to veil,
        // and leaving it behind would darken the plain themed backdrop.
        if (veilEl) {
            veilEl.remove();
            veilEl = null;
        }
    }

    /* ── public API ─────────────────────────────────────────────────────── */

    function boot() {
        accent = toRgb(cssVar("--accent", "#63ff93"), "99,255,147");
        mode = reducedMotion() ? "none" : readMode();

        if (mode !== "none") startCanvas();
    }

    function start() {
        if (mode !== "none") startCanvas();
    }

    function stop() {
        stopCanvas();
    }

    window.setBackground = function (next) {
        if (MODES.indexOf(next) === -1) next = DEFAULT_MODE;
        if (next === mode) return mode;

        stop();

        mode = next;
        try {
            localStorage.setItem(KEY, mode);
            localStorage.setItem(LEGACY_KEY, mode === "none" ? "no" : "yes");
        } catch (e) { }

        start();
        document.dispatchEvent(new CustomEvent("backgroundChanged", { detail: mode }));
        return mode;
    };

    window.getBackground = function () {
        return mode || readMode();
    };

    window.KERMIT_BACKGROUNDS = MODES;

    /* ── live updates ─────────────────────────────────────────────────── */

    // One tab changes the backdrop (or the theme that colours it): follow
    // along here without a reload. storage events only reach *other*
    // documents, so the theme also announces itself with a custom event for
    // the document that changed it (see colors.js / forms.js).
    function syncFromElsewhere(themeOnly) {
        accent = toRgb(cssVar("--accent", "#63ff93"), "99,255,147");

        var next = reducedMotion() ? "none" : readMode();

        if (next !== mode) {
            stop();
            mode = next;
            start();
            document.dispatchEvent(new CustomEvent("backgroundChanged", { detail: mode }));
            return;
        }

        // Same mode, new theme: restart so the colours are re-read.
        if (themeOnly && mode !== "none") {
            stop();
            start();
        }
    }

    window.addEventListener("storage", function (e) {
        if (!e || !e.key) return;
        if (e.key === KEY || e.key === LEGACY_KEY) syncFromElsewhere(false);
        else if (e.key === "kermit_theme") syncFromElsewhere(true);
    });

    document.addEventListener("themeChanged", function () {
        syncFromElsewhere(true);
    });

    // Swapping the theme <link> is asynchronous: the event above arrives before
    // the new palette is actually applied, so the accent would still read as the
    // previous theme and the backdrop would keep painting the old colour over
    // the new one. Re-read once the new stylesheet has loaded (same trick the
    // cursor uses), which also covers the very first paint on a themed page.
    var themeLink = document.getElementById("css-theme-link");
    if (themeLink) {
        themeLink.addEventListener("load", function () {
            syncFromElsewhere(true);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
