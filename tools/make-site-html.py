#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .html file that opens the site.

One URL, the whole site: the file points an ``<iframe>`` at the site's own
``index.html`` on the host that serves the site as real HTML (``SITE_BASE`` in
tools/wrapper_boot.py), so the Drive decoy shows first and every page after it
is the site's own page. It is the HTML twin of science.svg (see tools/
make-site-svg.py); both boot with the same script (tools/wrapper_boot.py).

It opens a *hosted* copy of the site rather than the tree beside the file, so
the pages it navigates to are documents wherever this file is served from: it
does not matter whether the host serving this file labels ``.html`` as
``text/html`` or, like jsDelivr and statically.io, as ``text/plain``. On those
CDNs this file itself still has to be reached some other way - the host will
show it as source code, which no script can fix - so share ``science.svg``
there.

Where the site is
-----------------
By default the frame opens ``SITE_BASE`` - the deployed copy of the site. Pass
``--base`` to point it somewhere else:

    python3 tools/make-site-html.py --base https://example.com/kermit/
    python3 tools/make-site-html.py --base .        # site tree beside this file

``--base .`` is the mirror layout: the file assumes the site sits in its own
directory, which is right when science.html is deployed *inside* the site tree
and that tree is served with correct content types.

The site shows a "Google Drive" decoy page on a first visit and only boots the
app once index.html's gate is satisfied. That is kept here: this file opens the
site the way the site opens, cloak and all. Append ``?app=1`` (also
``?launch=1``) to skip the decoy.

Usage:
    python3 tools/make-site-html.py [source.html] [output.html] [--base URL]

Defaults: index.html -> science.html, site root SITE_BASE
"""

import html
import sys
from html.parser import HTMLParser
from urllib.parse import urljoin

from wrapper_boot import BOOT_SCRIPT, SITE_BASE

USAGE = "usage: make-site-html.py [source.html] [output.html] [--base URL]"

STYLE = ("html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}"
         "iframe{border:0;width:100%;height:100%;display:block}")


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
    out = positional[1] if len(positional) > 1 else "science.html"

    if base:
        # A site root, so that a path passed instead of a directory (or a URL
        # without the trailing slash) still resolves "assets/x" correctly.
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

    # The site root the frame opens. Without it the frame would open the tree
    # beside this file - the mirror case.
    data_base = ' data-base="%s"' % html.escape(base, quote=True)

    doc = (
        '<!DOCTYPE html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>Kermit (RTPK) Network</title>\n'
        '<style>' + STYLE + '</style>\n'
        '</head>\n'
        '<body>\n'
        # No src in the markup: the boot script below points the frame at the
        # site, so the decoy is decided in one place.
        '<iframe id="kermit-frame" title="Kermit (RTPK) Network" allowfullscreen '
        'allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"'
        + data_base + '></iframe>\n'
        # After the frame, so the script can find it.
        '<script>\n' + BOOT_SCRIPT + '\n</script>\n'
        '</body>\n'
        '</html>\n'
    )

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(doc)

    # Prove the frame is wired up the way the boot script expects, parsing the
    # output the way a browser would.
    class Iframe(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.seen = False
            self.base = None

        def handle_starttag(self, tag, attrs):
            if tag == "iframe" and not self.seen:
                self.seen = True
                values = dict(attrs)
                self.base = values.get("data-base")
                assert values.get("data-srcdoc") is None, "the wrapper must not carry the site's markup"
                assert values.get("src") is None, "the frame's target is set by the boot script"

    parser = Iframe()
    parser.feed(doc)
    assert parser.seen, "no iframe was produced"
    assert parser.base == base, "the site root does not round-trip"
    assert "serviceWorker" not in doc, "the wrapper must not need a service worker"

    print("wrote %s (%d bytes) from %s (%d bytes)" % (out, len(doc.encode("utf-8")), src, len(page.encode("utf-8"))))
    print("site root: %s" % base)


if __name__ == "__main__":
    main()
