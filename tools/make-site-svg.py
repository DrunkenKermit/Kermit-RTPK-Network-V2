#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .svg file that opens the site.

One URL, the whole site. The file points an ``<iframe>`` at the site's own
``index.html`` on the host that serves the site as real HTML (``SITE_BASE`` in
tools/wrapper_boot.py), so the Drive decoy shows first and every page after it
is the site's own page.

Why the SVG matters
-------------------
CDNs serve image types with their real MIME type, and jsDelivr / statically.io
deliberately serve ``.html`` as ``text/plain`` (anti-phishing), which makes an
HTML file show up as source code there. ``.svg`` is served as
``image/svg+xml`` everywhere, so this file runs on those CDNs, and it works just
as well on hosts that serve HTML properly. What it opens is a *hosted* copy of
the site, not the tree next to the file, so the pages it navigates to are
documents wherever this file itself is served from - that is why it needs no
worker and no MIME repair.

Because ``.svg`` runs, this file is also the way to reach the site when the page
you pasted only allows an image. Note that an SVG only runs its script when it
is the document, i.e. opened directly or in an <iframe>. Embedded with <img>,
<object> data or as a CSS background it renders as a picture with no script at
all - that is the SVG specification, not this file.

Where the site is
-----------------
By default the frame opens ``SITE_BASE`` - the deployed copy of the site. Pass
``--base`` to point it somewhere else:

    python3 tools/make-site-svg.py --base https://example.com/kermit/
    python3 tools/make-site-svg.py --base .        # site tree beside this file

``--base .`` is the mirror layout: the file assumes the site sits in its own
directory, which is right when science.svg is deployed *inside* the site tree
and that tree is served with correct content types.

Append ``?app=1`` (also ``?launch=1``) to skip the decoy and open the app
directly.

Usage:
    python3 tools/make-site-svg.py [source.html] [output.svg] [--base URL]

Defaults: index.html -> science.svg, site root SITE_BASE
"""

import html
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urljoin

from wrapper_boot import BOOT_SCRIPT, SITE_BASE

XHTML = "http://www.w3.org/1999/xhtml"
USAGE = "usage: make-site-svg.py [source.html] [output.svg] [--base URL]"


def parse_args(argv):
    """Positional source/output, plus --base URL (also accepts --base=URL)."""
    positional = []
    base = SITE_BASE
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


def main():
    src, out, base = parse_args(sys.argv[1:])

    # The page's own markup is not embedded any more - the frame loads it from
    # the site - so this is only read to prove the source file is there and to
    # report its size.
    with open(src, encoding="utf-8") as fh:
        page = fh.read()

    data_base = ' data-base="%s"' % html.escape(base, quote=True)
    # The boot script is XML text content, so the XML-significant characters
    # have to be escaped (it contains a regex with '&').
    boot = html.escape(BOOT_SCRIPT, quote=False)

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n'
        '  <title>Kermit (RTPK) Network</title>\n'
        '  <foreignObject x="0" y="0" width="100%" height="100%">\n'
        '    <div xmlns="' + XHTML + '" style="width:100%;height:100%;margin:0;padding:0;background:#000">\n'
        # The frame has no src in the markup: the boot script below sets it, so
        # the decoy is decided in one place. Every attribute needs a value here:
        # XML, unlike HTML, has no valueless attributes, so "allowfullscreen"
        # has to be spelled out in full.
        '      <iframe id="kermit-frame" title="Kermit (RTPK) Network" allowfullscreen="allowfullscreen" '
        'allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"' + data_base +
        ' style="border:0;width:100%;height:100%;display:block;background:#000"></iframe>\n'
        '    </div>\n'
        '  </foreignObject>\n'
        # After the frame, so the script can find it.
        '  <script>' + boot + '</script>\n'
        '</svg>\n'
    )

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(svg)

    # Fail loudly if the result is not well-formed XML, and check the frame is
    # wired up the way the boot script expects.
    root = ET.fromstring(svg)
    iframe = root.find(".//{%s}iframe" % XHTML)
    assert iframe is not None, "no iframe element was produced"
    assert iframe.get("data-base") == base, "the site root does not round-trip"
    assert iframe.get("data-srcdoc") is None, "the wrapper must not carry the site's markup"
    assert iframe.get("src") is None, "the frame's target is set by the boot script"
    assert "serviceWorker" not in svg, "the wrapper must not need a service worker"

    print("wrote %s (%d bytes) from %s (%d bytes)" % (out, len(svg.encode("utf-8")), src, len(page.encode("utf-8"))))
    print("site root: %s" % base)


if __name__ == "__main__":
    main()
