#!/usr/bin/env python3
"""The script both single-file wrappers (science.svg, science.html) boot with.

Kept in one place because the two wrappers are the same product in two
containers: they must open the site the same way and mirror the tab the same
way, or one of them quietly becomes the broken one.

What the script does, in order:

1. Points the frame at the site's own ``index.html`` on a host that serves the
   site's pages as real HTML (``SITE_BASE`` below, baked in with ``--base``).
   That is what makes the file behave like the site - the Drive decoy (the
   cloak) shows first, and every page after it is the site's own page, at its
   own URL, with its own history and storage.
2. Mirrors the frame's title into the wrapper document. The app runs in a frame
   here and a frame cannot retitle the tab, and the cloak is a tab-label
   feature - so without this the tab reads "Kermit (RTPK) Network" while the
   screen shows a Google Drive login. Read straight from the frame when the
   site is on this origin; otherwise the framed page announces its title (see
   the kermitTitle beacon in index.html and pages/drive.html).

There is deliberately no service worker here. A worker was only ever needed
because a CDN that serves ``.html`` as ``text/plain`` (jsDelivr, statically.io)
turns the site's own pages into source code, and a document served that way
cannot repair itself. The answer to that is the site being *hosted* on a real
HTML host and this file opening it there, which works from any origin the
wrapper itself is served from.

The two wrappers only differ in the attribute that carries the site root (an
XML attribute in the SVG, an HTML one in the .html file); the script reads it
either way.
"""

# The copy of the site that serves its pages as real HTML. Both generators bake
# this in unless another root is passed with --base, so the single-file exports
# always open the site at a URL where every page is a document and not a wall of
# source. Pass "--base ." to build the mirror layout instead (site tree sitting
# beside the file), or any other host that serves the site with correct types.
SITE_BASE = "https://kermitrtpknetwork.freebuff.app/"

BOOT_SCRIPT = r"""    (function () {
        "use strict";

        var frame = document.getElementById("kermit-frame");
        if (!frame) return;

        // The site root: baked in at build time (data-base), or this file's own
        // directory when the site tree was deployed beside it.
        var root = frame.getAttribute("data-base") || "";
        try {
            root = new URL(root || ".", location.href).href;
        } catch (e) {
            root = "./";
        }

        // ?app=1 (also ?launch=1) skips the decoy and opens the app directly.
        // The default is the decoy, exactly as a first visit to the site is:
        // that is the cloak this file is meant to show.
        var skipDecoy = /[?&](?:app|launch)=1\b/.test(location.search);

        // One navigation, into the site's own index.html. The host serves it as
        // a document, so the cloak shows and every page after it is the site's
        // own - there is nothing to probe and nothing to repair.
        frame.src = root + "index.html" + (skipDecoy ? "?launch=1" : "");

        // ── keeping the tab honest ──────────────────────────────────────────
        // The cloak - the Drive decoy, and the settings' "Tab Cloak" - is a tab
        // label, and a frame cannot set the tab. Mirroring the frame's title up
        // here is what makes the file look like Google Drive in the tab strip
        // while the decoy is on screen.
        var shownTitle = "";

        function showTitle(title) {
            if (!title || title === shownTitle) return;
            shownTitle = title;
            document.title = title;
        }

        // Where the site is on another origin the frame's document cannot be
        // read, so the framed page announces its title instead. Only the site
        // in the frame may rename this tab.
        window.addEventListener("message", function (event) {
            if (event.source !== frame.contentWindow) return;
            var data = event.data;
            if (!data || typeof data.kermitTitle !== "string") return;
            showTitle(data.kermitTitle);
        });

        setInterval(function () {
            var doc = null;
            try {
                doc = frame.contentDocument;
            } catch (e) { }

            if (!doc || !doc.title) return;
            showTitle(doc.title);
        }, 400);
    })();"""
