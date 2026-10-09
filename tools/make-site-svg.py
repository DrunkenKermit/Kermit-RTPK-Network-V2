#!/usr/bin/env python3
"""Wrap a page of the Kermit site inside a single .svg file.

The SVG carries the page's full HTML (markup, styles and scripts) in an iframe
``srcdoc``, so the whole site can be opened from one .svg URL. The embedded
document shares the SVG's origin, which means the site's absolute ``/assets``,
``/pages`` and ``/styles`` paths resolve to the deployed copy - every client
feature (toolbar, tabs, the GUST proxy engine, movies, AI, accounts and the
folders overlay) then runs exactly as it does on index.html.

The site therefore still has to be deployed at the same origin: the SVG only
replaces the entry URL, it is not a copy of the whole asset tree.

Usage:
    python3 tools/make-site-svg.py [source.html] [output.svg]

Defaults: index.html -> science.svg
"""
import html
import sys
import xml.etree.ElementTree as ET

SRC = sys.argv[1] if len(sys.argv) > 1 else "index.html"
OUT = sys.argv[2] if len(sys.argv) > 2 else "science.svg"

with open(SRC, encoding="utf-8") as fh:
    page = fh.read()

# The page goes inside an XML attribute. html.escape(quote=True) handles the
# characters that are special in an attribute (& < > " '), and the whitespace
# characters have to become character references: an XML parser collapses a
# literal newline/tab in an attribute value to a single space, which would join
# every JavaScript line comment onto the following line. A numeric reference
# survives that normalisation, so it reaches the browser as a real newline.
srcdoc = html.escape(page, quote=True)
srcdoc = (
    srcdoc.replace("\r\n", "&#13;&#10;")
    .replace("\r", "&#13;")
    .replace("\n", "&#10;")
    .replace("\t", "&#9;")
)

svg = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n'
    '  <title>Kermit (RTPK) Network</title>\n'
    '  <foreignObject x="0" y="0" width="100%" height="100%">\n'
    '    <div xmlns="http://www.w3.org/1999/xhtml" '
    'style="width:100%;height:100%;margin:0;padding:0">\n'
    '      <iframe title="Kermit (RTPK) Network" srcdoc="' + srcdoc + '" '
    'style="border:0;width:100%;height:100%;display:block"></iframe>\n'
    '    </div>\n'
    '  </foreignObject>\n'
    '</svg>\n'
)

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(svg)

# Fail loudly if the result is not well-formed XML, and prove the page survives
# the round trip (the parser resolves the character references for us).
root = ET.fromstring(svg)
iframe = root.find(".//{http://www.w3.org/1999/xhtml}iframe")
assert iframe is not None, "no iframe element was produced"
assert iframe.get("srcdoc") == page, "the embedded page does not round-trip"

print("wrote %s (%d bytes) from %s (%d bytes)"
      % (OUT, len(svg.encode("utf-8")), SRC, len(page.encode("utf-8"))))
