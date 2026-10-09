#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .html file.

Companion to tools/make-site-svg.py: instead of an SVG, this writes a plain
HTML document whose only content is an ``<iframe srcdoc>`` holding the page's
full source (markup, styles and scripts). Opening the file runs the whole site,
and because the embedded document shares the file's origin, the site's absolute
``/assets``, ``/pages`` and ``/styles`` paths resolve to the deployed copy - so
the site still has to be hosted at the same origin; this file is not a copy of
the asset tree.

Usage:
    python3 tools/make-site-html.py [source.html] [output.html]

Defaults: index.html -> science.html
"""
import html
import sys
from html.parser import HTMLParser

SRC = sys.argv[1] if len(sys.argv) > 1 else "index.html"
OUT = sys.argv[2] if len(sys.argv) > 2 else "science.html"

with open(SRC, encoding="utf-8") as fh:
    page = fh.read()

# The page goes in an attribute value, so only the attribute-significant
# characters (the quotes and the ampersand) need escaping. Newlines survive in
# an HTML attribute value, unlike XML, so the page's line structure is kept
# exactly as written.
srcdoc = html.escape(page, quote=True)

doc = (
    '<!DOCTYPE html>\n'
    '<html lang="en">\n'
    '<head>\n'
    '<meta charset="UTF-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<title>Kermit (RTPK) Network</title>\n'
    '<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}'
    'iframe{border:0;width:100%;height:100%;display:block}</style>\n'
    '</head>\n'
    '<body>\n'
    '<iframe title="Kermit (RTPK) Network" allowfullscreen '
    'allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" '
    'srcdoc="' + srcdoc + '"></iframe>\n'
    '</body>\n'
    '</html>\n'
)

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(doc)


# Prove the page survives the round trip: parse the output the way a browser
# would and check the iframe's srcdoc against the original file.
class Iframe(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.srcdoc = None

    def handle_starttag(self, tag, attrs):
        if tag == "iframe" and self.srcdoc is None:
            self.srcdoc = dict(attrs).get("srcdoc")


parser = Iframe()
parser.feed(doc)
assert parser.srcdoc is not None, "no iframe srcdoc was produced"
assert parser.srcdoc == page, "the embedded page does not round-trip"

print("wrote %s (%d bytes) from %s (%d bytes)"
      % (OUT, len(doc.encode("utf-8")), SRC, len(page.encode("utf-8"))))
