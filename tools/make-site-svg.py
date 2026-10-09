#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .svg file.

One file, the whole site: the page's markup, styles and scripts travel in an
``<iframe srcdoc>`` inside an SVG ``<foreignObject>``, so a browser renders the
site itself - toolbar, tabs, the GUST proxy engine, games, movies, AI, accounts
and the folders overlay - from a single URL.

Why the SVG matters
-------------------
CDNs serve image types with their real MIME type, and jsDelivr / statically.io
deliberately serve ``.html`` as ``text/plain`` (anti-phishing), which makes an
HTML file show up as source code there. ``.svg`` is served as
``image/svg+xml`` everywhere, so this file is the one that renders on those
CDNs, and it works just as well on hosts that serve HTML properly
(raw.githack.com, rawcdn.githack.com, GitHub Pages, Cloudflare Pages, Firebase
Hosting, a plain domain).

How it finds the site
---------------------
The site links its assets relative to its root and works the root out at
runtime (tools/make-portable.py). A ``srcdoc`` frame inherits the base URL of
the document that created it, so inside the frame ``assets/js/t.js`` resolves
next to this file:

    https://cdn.jsdelivr.net/gh/USER/REPO@main/science.svg
      -> https://cdn.jsdelivr.net/gh/USER/REPO@main/assets/js/t.js
    https://USER.github.io/REPO/science.svg       (GitHub Pages project site)
      -> https://USER.github.io/REPO/assets/js/t.js

which is exactly how the rest of the repo is reachable from a CDN mirror. Where
the tree is *not* beside this file (a lone upload, a host that only serves the
one file), pass ``--base`` to bake in a site root - normally the public jsDelivr
path of this repo - and every asset resolves from there:

    python3 tools/make-site-svg.py --base https://cdn.jsdelivr.net/gh/USER/REPO@main/

Also worth knowing: an SVG only runs its script when it is the document, i.e.
opened directly or in an <iframe>. Embedded with <img>, <object> data or as a
CSS background it renders as a picture with no script at all - that is the SVG
specification, not this file.

The site shows a "Google Drive" decoy on a first visit and only boots the app
once index.html's gate is satisfied; the wrapper satisfies it up front so the
file opens straight into the app. Append ``?decoy=1`` for decoy-first instead.

Usage:
    python3 tools/make-site-svg.py [source.html] [output.svg] [--base URL]

Defaults: index.html -> science.svg
"""

import html
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urljoin

XHTML = "http://www.w3.org/1999/xhtml"
USAGE = "usage: make-site-svg.py [source.html] [output.svg] [--base URL]"


def parse_args(argv):
    """Positional source/output, plus --base URL (also accepts --base=URL)."""
    positional = []
    base = ""
    rest = list(argv)
    while rest:
        arg = rest.pop(0)
        if arg == "--base":
            if not rest:
                sys.exit("error: --base needs a URL\n" + USAGE)
            base = rest.pop(0)
        elif arg.startswith("--base="):
            base = arg.split("=", 1)[1]
        elif arg.startswith("-"):
            sys.exit("error: unknown option %r\n%s" % (arg, USAGE))
        else:
            positional.append(arg)

    if len(positional) > 2:
        sys.exit("error: too many arguments\n" + USAGE)
    src = positional[0] if positional else "index.html"
    out = positional[1] if len(positional) > 1 else "science.svg"

    if base:
        normalized = urljoin(base, ".")
        if not normalized.endswith("/"):
            normalized += "/"
        base = normalized
    return src, out, base


# Satisfies index.html's first-visit gate so the file opens into the app.
# Escaped as XML text when it is written into the SVG.
GATE_SCRIPT = """    (function () {
        // A single file is meant to open straight into the site. The site's own
        // decoy (index.html -> pages/drive.html) exists for links pasted into
        // chat apps; here it would hand the frame off to another URL, so the
        // gate index.html?launch=1 would set is set up front instead. Add
        // ?decoy=1 to this file's URL for the decoy-first behaviour.
        // sessionStorage is per-origin and shared with the frame, which is what
        // makes this reach across the document boundary.
        try {
            if (!/[?&]decoy=1\\b/.test(location.search)) {
                sessionStorage.setItem("kermit_launched", "yes");
            }
        } catch (e) { }
    })();"""


def main():
    src, out, base = parse_args(sys.argv[1:])

    with open(src, encoding="utf-8") as fh:
        page = fh.read()

    # The page goes inside an XML attribute. html.escape(quote=True) handles the
    # characters that are special in an attribute (& < > " '), and the whitespace
    # characters have to become character references: an XML parser collapses a
    # literal newline/tab in an attribute value to a single space, which would
    # join every JavaScript line comment onto the following line. A numeric
    # reference survives that normalisation, so it reaches the browser as a real
    # newline.
    srcdoc = html.escape(page, quote=True)
    srcdoc = (
        srcdoc.replace("\r\n", "&#13;&#10;")
        .replace("\r", "&#13;")
        .replace("\n", "&#10;")
        .replace("\t", "&#9;")
    )

    data_base = (' data-base="%s"' % html.escape(base, quote=True)) if base else ""
    # The gate script is XML text content, so the XML-significant characters
    # have to be escaped (it contains "&&"-free logic, but it does contain a
    # regex with '&' and a '<' in the comment).
    gate = html.escape(GATE_SCRIPT, quote=False)

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n'
        '  <title>Kermit (RTPK) Network</title>\n'
        '  <script>' + gate + '</script>\n'
        '  <foreignObject x="0" y="0" width="100%" height="100%">\n'
        '    <div xmlns="' + XHTML + '" style="width:100%;height:100%;margin:0;padding:0">\n'
        # Every attribute needs a value here: XML, unlike HTML, has no valueless
        # attributes, so "allowfullscreen" has to be spelled out in full.
        '      <iframe title="Kermit (RTPK) Network" allowfullscreen="allowfullscreen" '
        'allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"' + data_base +
        ' style="border:0;width:100%;height:100%;display:block" srcdoc="' + srcdoc + '"></iframe>\n'
        '    </div>\n'
        '  </foreignObject>\n'
        '</svg>\n'
    )

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(svg)

    # Fail loudly if the result is not well-formed XML, and prove the page
    # survives the round trip (the parser resolves the character references).
    root = ET.fromstring(svg)
    iframe = root.find(".//{%s}iframe" % XHTML)
    assert iframe is not None, "no iframe element was produced"
    assert iframe.get("srcdoc") == page, "the embedded page does not round-trip"
    assert iframe.get("data-base") == (base or None), "the baked site root does not round-trip"

    print("wrote %s (%d bytes) from %s (%d bytes)" % (out, len(svg.encode("utf-8")), src, len(page.encode("utf-8"))))
    print("site root: %s" % (base or "this file's own directory (mirror-relative)"))


if __name__ == "__main__":
    main()
