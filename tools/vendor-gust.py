#!/usr/bin/env python3
"""Vendor GUST (nautilus-os/GUST) as Kermit's proxy engine page, /proxy.html.

Kermit's browser (assets/js/slidesfunctions.js) drives its engine through a
four-line contract: the engine page answers ``window.WispProxy.{navigate,state}``
and posts ``{source:"wisp-engine",type:"state"}`` to its parent. GUST is a
complete single-file browser that has none of that - and deliberately keeps its
internals private - so this script takes GUST's ``index.html`` verbatim and adds
the adapter that translates between the two:

  * ``?embed=1``  hides GUST's own chrome, so Kermit's tab strip and address bar
                  are the only ones on screen and the page fills the tab frame.
  * ``?wisp=``    pins the Wisp relay Kermit selected.
  * ``?url=``     the page the tab should open.

/GUST itself is otherwise untouched: ``/proxy.html`` opened without ``embed=1``
is still stock GUST.

Usage:
    git clone --depth 1 https://github.com/nautilus-os/GUST /tmp/gust
    python3 tools/vendor-gust.py /tmp/gust

Re-run it whenever GUST is updated; the replacements below fail loudly if GUST's
markup ever stops matching, rather than silently shipping a broken engine.
"""

import argparse
import datetime
import hashlib
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = "/tmp/gust"
OUTPUT = ROOT / "proxy.html"

KERMIT_TITLE = "Kermit (RTPK) Network | proxy"
KERMIT_HEAD = (
    '    <link rel="shortcut icon" href="assets/img/fav.png" type="image/png">\n'
    '    <meta name="description" content="Kermit (RTPK) Network proxy">\n'
    '    <meta name="robots" content="noindex, nofollow">\n'
)

# ── The head adapter: runs before GUST's own script ─────────────────────────
HEAD_BLOCK = """    <!-- ── Kermit (RTPK) Network: engine adapter ─────────────────────────────
         GUST ships as one self-contained page and is used here as the proxy
         ENGINE behind Kermit's own tab strip and address bar, not as a browser
         of its own. This block and the bridge at the end of <body> are the only
         additions made to the vendored file, and both are inert unless the page
         is opened with ?embed=1 - so /proxy.html on its own is still stock GUST. -->
    <style id="kermit-embed-style">
        html[data-kermit-embed] .titlebar,
        html[data-kermit-embed] .navbar,
        html[data-kermit-embed] .bookmarks-bar-wrap,
        html[data-kermit-embed] #newtab,
        html[data-kermit-embed] #settingsPage,
        html[data-kermit-embed] #tutorialOverlay {
            display: none !important;
        }

        /* The page should meet every edge of the Kermit tab frame. */
        html[data-kermit-embed] main {
            padding: 0 !important;
            gap: 0 !important;
        }

        html[data-kermit-embed] .view {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
        }
    </style>
    <script id="kermit-embed-boot">
        /* Runs before GUST's own script: pin the relay Kermit picked, and drop
           any tab cache a previous visit left behind, so a Kermit tab always
           starts from one clean GUST tab rather than somebody's last session. */
        (function () {
            "use strict";

            var params;
            try { params = new URLSearchParams(window.location.search); } catch (e) { return; }

            if (params.get("embed") !== "1" && params.get("embed") !== "true") return;

            document.documentElement.setAttribute("data-kermit-embed", "1");

            try {
                localStorage.removeItem("gust:tabs:v1");

                var wisp = (params.get("wisp") || "").trim();
                if (/^wss?:\\/\\/./i.test(wisp)) localStorage.setItem("gust:wisp:v1", wisp);
            } catch (e) { }
        })();
    </script>
"""

# ── The body bridge: GUST's own controls, driven for Kermit ─────────────────
BODY_BLOCK = """    <!-- ── Kermit (RTPK) Network: engine bridge ──────────────────────────────
         GUST keeps its internals private (one IIFE, nothing on window), so the
         bridge drives it the way a person would: it writes the address into
         GUST's own omnibox and presses GUST's own Go button. State comes back
         the same way, out of the address box and the tab title. Nothing here
         reaches inside GUST. -->
    <script id="kermit-engine-bridge">
        (function () {
            "use strict";

            if (document.documentElement.getAttribute("data-kermit-embed") !== "1") return;

            var START = "gust://newtab";
            var POLL_MS = 400;
            var SETTLE_MS = 2500;
            var READY_TIMEOUT_MS = 40000;

            function byId(id) { return document.getElementById(id); }

            function address() {
                var input = byId("url");
                return input && typeof input.value === "string" ? input.value : "";
            }

            function title() {
                var tab = byId("tabTitle");
                var text = tab && tab.textContent ? tab.textContent.trim() : "";
                if (text && text !== "New Tab") return text;
                try {
                    return new URL(address()).hostname.replace(/^www\\./, "") || text;
                } catch (e) {
                    return text || address();
                }
            }

            function state() {
                return { url: address(), title: title(), engine: "gust" };
            }

            /* GUST navigates by reading its omnibox in the Go handler, so this is
               the very same call its own button makes. */
            function navigate(url) {
                var input = byId("url");
                if (!url || !input) return state();

                wanted = String(url);
                input.value = wanted;

                var go = byId("go");
                if (go) { try { go.click(); } catch (e) { } }
                return state();
            }

            function press(id) {
                var el = byId(id);
                if (el && !el.disabled) { try { el.click(); } catch (e) { } }
            }

            window.WispProxy = {
                engine: "gust",
                navigate: navigate,
                state: state,
                back: function () { press("back"); return state(); },
                forward: function () { press("fwd"); return state(); },
                reload: function () { press("reload"); return state(); },
                stop: function () { press("stop"); }
            };

            /* ── state reporting ─────────────────────────────────────────────
               GUST never changes its own location, so Kermit cannot read the
               page on screen from the frame's URL. It learns it from these
               messages instead, plus state() whenever it asks. */
            var lastSent = "";

            function announce() {
                var now = state();
                var key = now.url + "\\n" + now.title;
                if (key === lastSent) return;
                lastSent = key;

                /* Kermit falls back to the frame document's title on load. */
                try {
                    document.title = now.title
                        ? now.title + " - Kermit (RTPK) Network"
                        : "Kermit (RTPK) Network | proxy";
                } catch (e) { }

                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            source: "wisp-engine",
                            type: "state",
                            url: now.url,
                            title: now.title
                        }, "*");
                    }
                } catch (e) { }
            }

            /* ── opening the requested page ──────────────────────────────────
               The address goes into the omnibox as soon as this script runs,
               which is before GUST's async boot reaches its first navigation -
               so GUST opens the requested page itself. The check below only
               covers the case where GUST went somewhere else anyway (a tab it
               restored), it runs once, and it leaves a real page alone so a
               redirect is never fought. */
            var wanted = null;
            var checked = false;

            function scheduleCheck() {
                if (checked) return;
                checked = true;

                setTimeout(function () {
                    if (!wanted) return;
                    var now = address();
                    if (now === wanted) return;                       // it landed
                    if (now !== START && now !== "") return;          // a real page: don't fight it
                    navigate(wanted);
                }, SETTLE_MS);
            }

            var gustReady = window._onLibcurlInitDone;
            window._onLibcurlInitDone = function () {
                try { if (typeof gustReady === "function") gustReady.apply(this, arguments); } catch (e) { }
                scheduleCheck();
            };
            setTimeout(scheduleCheck, READY_TIMEOUT_MS);

            /* ── boot ─────────────────────────────────────────────────────── */
            var params = new URLSearchParams(window.location.search);
            var target = params.get("url");
            if (target) {
                wanted = target;
                var input = byId("url");
                if (input) input.value = target;
            }

            setInterval(announce, POLL_MS);
            announce();
        })();
    </script>
"""


def fail(message):
    print("error: " + message, file=sys.stderr)
    sys.exit(1)


def replace_once(text, old, new, what):
    if text.count(old) != 1:
        fail("%s: expected exactly one match, found %d" % (what, text.count(old)))
    return text.replace(old, new)


def gust_revision(source):
    try:
        sha = subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
        date = subprocess.check_output(
            ["git", "-C", str(source), "log", "-1", "--format=%cs"], stderr=subprocess.DEVNULL
        ).decode().strip()
        return sha, date
    except (subprocess.CalledProcessError, OSError):
        return "unknown", "unknown"


def build(source):
    index = source / "index.html"
    if not index.is_file():
        fail("no index.html in %s (clone https://github.com/nautilus-os/GUST there first)" % source)

    text = index.read_text(encoding="utf-8", errors="replace")
    sha, date = gust_revision(source)

    if not text.lstrip().lower().startswith("<!doctype html>"):
        fail("%s does not look like a GUST index.html" % index)

    # 1. Kermit's own head, in place of GUST's browser title/icon/description.
    text = replace_once(text, "<title>GUST Browser</title>", "<title>%s</title>" % KERMIT_TITLE, "title")

    icon_start = text.index('    <link rel="icon" type="image/svg+xml"')
    icon_end = text.index("\n", icon_start) + 1
    text = text[:icon_start] + KERMIT_HEAD + text[icon_end:]

    desc = '    <meta name="description" content="GUST: A service worker -less web browser-in-a-browser" />\n'
    text = replace_once(text, desc, "", "description meta")

    # 2. Adapter blocks. GUST builds error pages inside its own scripts, so the
    #    real </head> is the first one and the real </body> is the last one.
    provenance = (
        "    <!--\n"
        "        Vendored from https://github.com/nautilus-os/GUST (commit %s, %s).\n"
        "        Generated by tools/vendor-gust.py on %s - edit the script, not this file.\n"
        "        GUST is a complete browser on its own; everything in the two adapter\n"
        "        blocks below exists only so Kermit can use it as the engine behind\n"
        "        Kermit's own tab strip and address bar (?embed=1).\n"
        "    -->\n"
    ) % (sha, date, datetime.date.today().isoformat())

    head_at = text.index("</head>")
    text = text[:head_at] + provenance + HEAD_BLOCK + text[head_at:]

    body_at = text.rindex("</body>")
    text = text[:body_at] + BODY_BLOCK + text[body_at:]

    return text


def main():
    parser = argparse.ArgumentParser(description="Vendor GUST as /proxy.html")
    parser.add_argument("source", nargs="?", default=DEFAULT_SOURCE, help="GUST checkout (default %s)" % DEFAULT_SOURCE)
    parser.add_argument("-o", "--output", default=str(OUTPUT), help="output file (default proxy.html)")
    args = parser.parse_args()

    source = pathlib.Path(args.source).expanduser().resolve()
    html = build(source)

    out = pathlib.Path(args.output)
    out.write_text(html, encoding="utf-8")

    digest = hashlib.sha256(html.encode("utf-8")).hexdigest()
    print("wrote %s (%d bytes, sha256 %s)" % (out, len(html.encode("utf-8")), digest[:16]))


if __name__ == "__main__":
    main()
