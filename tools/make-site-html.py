#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .html file.

The result is the whole site in one file: the page's markup, styles and scripts
are embedded verbatim in an ``<iframe srcdoc>``, so opening the file runs the
site itself - toolbar, tabs, the GUST proxy engine, games, movies, AI, accounts
and the folders overlay - not a screenshot or a copy of the markup.

Why it survives being hosted anywhere
-------------------------------------
The site is written to work from *any* URL prefix: pages link their assets
relative to the site root and the root is worked out at runtime (see
tools/make-portable.py), including inside this wrapper's frame. A ``srcdoc``
frame inherits the base URL of the document that created it, so inside the
frame ``assets/js/t.js`` resolves next to the wrapper file:

    https://cdn.jsdelivr.net/gh/USER/REPO@main/science.html
      -> https://cdn.jsdelivr.net/gh/USER/REPO@main/assets/js/t.js
    https://USER.github.io/REPO/science.html      (GitHub Pages project site)
      -> https://USER.github.io/REPO/assets/js/t.js
    https://usecherri.pages.dev/science.html      (domain root)
      -> https://usecherri.pages.dev/assets/js/t.js

so the same file works on jsDelivr, statically.io, raw.githack.com, GitHub
Pages, Cloudflare Pages, Firebase Hosting (Google) and plain domain hosting -
anywhere the rest of the repo sits beside it at that path prefix.

Two platform facts to know before picking a host
------------------------------------------------
* jsDelivr and statically.io serve ``.html`` as ``text/plain`` on purpose
  (anti-phishing), so a browser shows these files as source code there - that
  is the host's decision, not something the file can change. On those hosts use
  ``science.svg``, which is served as ``image/svg+xml`` and renders normally.
* raw.githack.com / rawcdn.githack.com, GitHub Pages, Cloudflare Pages and
  Firebase Hosting serve ``.html`` as ``text/html``, so this file renders there.

If the single file has to live somewhere that cannot serve the site tree at all
(a gist, a Drive upload, an arbitrary host), pass ``--base`` to bake in a site
root - typically the public jsDelivr path of this repo - and every asset is
resolved from there instead:

    python3 tools/make-site-html.py --base https://cdn.jsdelivr.net/gh/USER/REPO@main/

The site shows a "Google Drive" decoy page on a first visit and only boots the
app once index.html's gate is satisfied. The wrapper satisfies it up front, so
the file opens straight into the app; append ``?decoy=1`` to get the decoy-first
behaviour instead.

Usage:
    python3 tools/make-site-html.py [source.html] [output.html] [--base URL]

Defaults: index.html -> science.html
"""

import html
import sys
from html.parser import HTMLParser
from urllib.parse import urljoin

USAGE = "usage: make-site-html.py [source.html] [output.html] [--base URL]"


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
    out = positional[1] if len(positional) > 1 else "science.html"

    if base:
        # A site root, so that a path passed instead of a directory (or a URL
        # without the trailing slash) still resolves "assets/x" correctly.
        normalized = urljoin(base, ".")
        if not normalized.endswith("/"):
            normalized += "/"
        base = normalized
    return src, out, base


# Satisfies index.html's first-visit gate so the file opens into the app.
# Kept free of "</script" so it can be embedded as-is.
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

STYLE = ("html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000}"
         "iframe{border:0;width:100%;height:100%;display:block}")

IFRAME_ATTRS = ("title=\"Kermit (RTPK) Network\" allowfullscreen "
                "allow=\"fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture\"")


def main():
    src, out, base = parse_args(sys.argv[1:])

    with open(src, encoding="utf-8") as fh:
        page = fh.read()

    # The page goes in an attribute value, so only the attribute-significant
    # characters (the quotes and the ampersand) need escaping. Newlines survive
    # in an HTML attribute value, unlike XML, so the page's line structure is
    # kept exactly as written.
    srcdoc = html.escape(page, quote=True)

    # The baked site root, when one was asked for. Without it the frame falls
    # back to its own base URI, which is this file's URL - the mirror case.
    data_base = ' data-base="%s"' % html.escape(base, quote=True) if base else ""

    doc = (
        '<!DOCTYPE html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>Kermit (RTPK) Network</title>\n'
        '<style>' + STYLE + '</style>\n'
        '<script>\n' + GATE_SCRIPT + '\n</script>\n'
        '</head>\n'
        '<body>\n'
        '<iframe ' + IFRAME_ATTRS + data_base + ' srcdoc="' + srcdoc + '"></iframe>\n'
        '</body>\n'
        '</html>\n'
    )

    with open(out, "w", encoding="utf-8") as fh:
        fh.write(doc)

    # Prove the page survives the round trip: parse the output the way a browser
    # would and check the iframe's srcdoc against the original file.
    class Iframe(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.srcdoc = None
            self.base = None

        def handle_starttag(self, tag, attrs):
            if tag == "iframe" and self.srcdoc is None:
                values = dict(attrs)
                self.srcdoc = values.get("srcdoc")
                self.base = values.get("data-base")

    parser = Iframe()
    parser.feed(doc)
    assert parser.srcdoc is not None, "no iframe srcdoc was produced"
    assert parser.srcdoc == page, "the embedded page does not round-trip"
    assert parser.base == (base or None), "the baked site root does not round-trip"

    print("wrote %s (%d bytes) from %s (%d bytes)" % (out, len(doc.encode("utf-8")), src, len(page.encode("utf-8"))))
    print("site root: %s" % (base or "this file's own directory (mirror-relative)"))


if __name__ == "__main__":
    main()
