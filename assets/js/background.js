/*
 * Shared Kermit (RTPK) Network background.
 *
 * One place decides what the animated backdrop is, so the Settings picker can
 * offer several looks without every page having its own effects code:
 *
 *     none | fog | rain (default) | terminal | grid | dots
 *
 * Stored in localStorage as "cherri_background". The old on/off key
 * ("cherri_particlesOn") is kept in sync so anything still reading it agrees,
 * and "fog" reuses the Vanta/three.js fog the site already had (both libraries
 * are fetched on demand, so they never block a page's first paint).
 */
(function () {
    "use strict";

    var KEY = "cherri_background";
    var LEGACY_KEY = "cherri_particlesOn";
    var DEFAULT_MODE = "rain";
    var MODES = ["none", "fog", "rain", "terminal", "grid", "dots"];
    var CONTAINER_ID = "kermit-background";
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
    var fogEl = null;

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

    function toNumber(rgb) {
        var parts = String(rgb).split(",");
        return (parseInt(parts[0], 10) << 16) + (parseInt(parts[1], 10) << 8) + parseInt(parts[2], 10);
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
            length: 14 + Math.random() * 40,
            speed: 140 + Math.random() * 340,
            alpha: 0.10 + Math.random() * 0.32
        };
    }

    function seedRain(width, height, anywhere) {
        var count = Math.max(40, Math.min(220, Math.round(width / 7)));
        items = [];
        for (var i = 0; i < count; i++) items.push(newDrop(width, height, anywhere));
    }

    function drawRain(dt, width, height) {
        ctx.lineWidth = 1.2;
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
        var columns = Math.max(14, Math.min(90, Math.round(width / 22)));
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
        ctx.font = "14px 'Courier New', monospace";
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
                    : "rgba(" + accent + "," + (fade * 0.42).toFixed(3) + ")";

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

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(" + accent + ",0.20)";
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
        glow.addColorStop(0.5, "rgba(" + accent + ",0.14)");
        glow.addColorStop(1, "rgba(" + accent + ",0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, sweep - 90, width, 180);
    }

    /* ── dots (drifting particles) ───────────────────────────────────────── */

    function seedDots(width, height) {
        var count = Math.max(30, Math.min(160, Math.round((width * height) / 22000)));
        items = [];
        for (var i = 0; i < count; i++) {
            items.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 26,
                vy: (Math.random() - 0.5) * 26,
                r: 1 + Math.random() * 2.2,
                alpha: 0.2 + Math.random() * 0.5,
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
            canvas.style.cssText =
                "position:fixed;left:0;top:0;width:100%;height:100%;" +
                "z-index:-1;opacity:.55;pointer-events:none;";
            ctx = canvas.getContext("2d");
        }

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
    }

    /* ── fog (Vanta / three.js, loaded on demand) ────────────────────────── */

    function loadScript(src, done) {
        var script = document.createElement("script");
        script.src = src;
        script.onload = done;
        script.onerror = done;
        document.head.appendChild(script);
    }

    function startFog() {
        if (!window.VANTA || !window.VANTA.FOG) {
            loadScript("/assets/js/lib/three.min.js", function () {
                loadScript("/assets/js/lib/vanta.fog.min.js", startFog);
            });
            return;
        }

        if (!fogEl) {
            fogEl = document.getElementById(CONTAINER_ID);
            if (!fogEl) {
                fogEl = document.createElement("div");
                fogEl.id = CONTAINER_ID;
                document.body.appendChild(fogEl);
            }
            fogEl.style.cssText =
                "position:fixed;left:0;top:0;width:100%;height:100%;" +
                "z-index:-1;opacity:.45;pointer-events:none;";
        }

        window.VANTA.FOG({
            el: "#" + CONTAINER_ID,
            mouseControls: true,
            touchControls: false,
            gyroControls: false,
            minHeight: 200.0,
            minWidth: 200.0,
            highlightColor: toNumber(toRgb(cssVar("--accent", "#63ff93"), "99,255,147")),
            midtoneColor: toNumber(toRgb(cssVar("--bg-2", "#0b1a10"), "11,26,16")),
            lowlightColor: toNumber(toRgb(cssVar("--bg-5", "#050e09"), "5,14,9")),
            baseColor: toNumber(toRgb(cssVar("--bg", "#07140b"), "7,20,11")),
            blurFactor: 0.9,
            speed: 1
        });
    }

    function stopFog() {
        try {
            if (fogEl && window.VANTA && window.VANTA.current) window.VANTA.current.destroy();
        } catch (e) { }
        if (fogEl) {
            fogEl.remove();
            fogEl = null;
        }
    }

    /* ── public API ─────────────────────────────────────────────────────── */

    function boot() {
        accent = toRgb(cssVar("--accent", "#63ff93"), "99,255,147");
        mode = reducedMotion() ? "none" : readMode();

        if (mode === "fog") startFog();
        else if (mode !== "none") startCanvas();
    }

    function start() {
        if (mode === "fog") startFog();
        else if (mode !== "none") startCanvas();
    }

    function stop() {
        stopCanvas();
        stopFog();
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

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
