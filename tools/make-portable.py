#!/usr/bin/env python3
"""Make the Kermit site run from any URL prefix, not just the domain root.

Why
---
Every page used to link its assets with a hard-coded origin path
(``/assets/js/t.js``). That only resolves when the site is served from the root
of a domain. It breaks everywhere else, which is exactly where a single-file
copy is useful:

  * ``https://cdn.jsdelivr.net/gh/USER/REPO@main/...``  (jsDelivr mirrors the repo
    under a path, so ``/assets/...`` resolves to ``cdn.jsdelivr.net/assets/...``)
  * ``https://USER.github.io/REPO/...``                 (GitHub Pages project site)
  * any host that serves the site from a sub-directory

What it does
------------
1. Rewrites every internal origin path to a *root-relative* one (``/assets/x``
   becomes ``assets/x``, ``/pages/x.html`` becomes ``pages/x.html``).
2. Puts a ``<base>`` at the top of ``<head>`` on every page (except the Drive
   decoy, see below). It is *static* and one level up (``../`` on pages/, ``./``
   at the root), so a page-relative asset link resolves to the site root on any
   host and at any page depth:

       page  <root>/pages/docs.html + <base href="../"> + "assets/a.css"
       ->    <root>/assets/a.css

   It is written into the markup, not injected at runtime, because the
   browser's speculative preload scanner honours a static ``<base href>``: a
   base created by script is invisible to the scanner, which then requests every
   head resource twice - once against the wrong root.

   Inside the single-file wrappers the pages are a ``srcdoc`` frame, whose base
   URI is the wrapper's own URL; ``../`` there would climb out of the folder the
   site tree lives in, so the injected script honours a ``data-base`` attribute
   set by ``science.html`` / ``science.svg`` (present when they were built with
   ``--base``, for hosts that cannot serve the site tree beside the file), and
   points the ``<base>`` element at it.
3. Keeps ``href="#"`` anchors working. With a ``<base>`` in place a bare ``#``
   would resolve to the base URL (the site root) instead of the current
   document, so the injected script drops the default navigation for exactly
   those anchors - their ``onclick`` handlers still run.
4. Fixes the few places that navigate with a plain path string (``location.href
   = "pages/x"``), because whether ``location`` honours ``<base>`` is not a
   thing worth betting on: they go through the injected ``window.kermitUrl()``
   helper instead, which resolves against the base explicitly.
5. CSS is resolved by a stylesheet against *its own* URL, not the document
   base, so ``url(/assets/fonts/x.ttf)`` in ``assets/css/*.css`` becomes
   ``url(../fonts/x.ttf)``.
6. Rewrites the store service worker's hard-coded ``/stores/`` scope test to
   read its own registration scope, and the decoy's ``origin + "/"`` hand-off
   to a relative one, so both survive a sub-path deploy.

The Drive decoy (``pages/drive.html``) is the one page that gets *no* ``<base>``:
it references symbols in its own document (``<use href="#ic-help">``) and is
built to look inert. It gets explicit ``../`` paths and a relative hand-off
instead.

Idempotent: run it twice and the second run reports "already portable".

Usage:
    python3 tools/make-portable.py           # rewrite
    python3 tools/make-portable.py --check   # report only, exit 1 if changes needed
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = "kermit:portable-root"

# The block that anchors a page to the site root: a *static* depth-relative
# <base> plus a small script.
#
# The base is relative (and therefore identical on every page of a given depth)
# on purpose: a page that lives one level down gets "../", which resolves to the
# site root whether the site is served from a domain root, a GitHub Pages
# project path or a CDN path like jsDelivr's. It is written into the markup
# rather than injected by script because the browser's speculative preload
# scanner reads a static <base href> and starts the head's stylesheets and
# scripts against it; a base created at runtime is invisible to the scanner, so
# every head resource would be requested twice - once against the wrong root.
#
# The script only does the two things a static base cannot:
#   * honour a site root handed over by a single-file wrapper (science.html /
#     science.svg set data-base when they were built with --base, for hosts that
#     have no copy of the site tree beside the file), and
#   * keep href="#" anchors pointing at the current document instead of the base.
#
# Written as a raw string so the JS keeps the single backslashes it wants, and
# kept free of origin paths so re-running the tool is a no-op.
ROOT_BLOCK = r"""<!-- kermit:portable-root - the site can be served from the domain root, a
     sub-path (GitHub Pages project sites) or a CDN path (jsDelivr), so no page
     hard-codes where it lives: internal links stay relative to the site root
     and this <base> pins that root for every page depth. -->
<base href="__DEPTH__">
<script>
    (function () {
        // Inside science.html / science.svg this document is a srcdoc frame: the
        // wrapper may hand over a site root for hosts that cannot serve the site
        // tree next to the file (built with --base). Everything else is already
        // handled by the <base> above.
        var override = null;
        try {
            override = window.frameElement && window.frameElement.getAttribute("data-base");
        } catch (e) { }

        if (override) {
            var base = document.querySelector("base");
            if (base) {
                try { base.href = new URL(override, document.baseURI).href; }
                catch (e) { base.href = override; }
            }
        }

        // Resolve a site path against the base, for the calls that must not rely
        // on <base> (location assignments, and anything cross-document).
        window.kermitUrl = function (path) {
            try { return new URL(path, document.baseURI).href; }
            catch (e) { return path; }
        };

        // A bare "#" would otherwise resolve to the base (the site root) and
        // navigate away. The click handlers on these links still run.
        document.addEventListener("click", function (e) {
            var el = e.target;
            while (el && el !== document) {
                if (el.tagName === "A" && el.getAttribute && el.getAttribute("href") === "#") {
                    e.preventDefault();
                    return;
                }
                el = el.parentNode;
            }
        }, true);
    })();
</script>
"""

# Root pages sit at the site root, pages/ is one level down.
DEPTH = {"root": "./", "pages": "../"}

# Directories that make up the site, as origin paths.
PREFIXES = ["assets", "styles", "fa", "pages", "stores", "isolate"]

HTML_PAGES = ["index.html", "newtab.html", "404.html"]
JS_FILES = [
    "assets/js/colors.js",
    "assets/js/dropdown.js",
    "assets/js/folders.js",
    "assets/js/forms.js",
    "assets/js/slidesfunctions.js",
]
JSON_FILES = ["assets/json/gn-math.json"]
CSS_FILES = ["assets/css/font.css", "assets/css/elements.css"]

# Pages that get the base script. The decoy is excluded on purpose: it uses
# fragment-only references (<use href="#ic-help">) that a <base> would break.
NO_BASE = {"pages/drive.html"}
DRIVE_HTML = "pages/drive.html"

# Straight string swaps, applied after the generic rewrite. Each entry is
# (path, old, new); a missing match is an error, so a silent no-op cannot pass.
SWAPS = [
    # location assignments: resolve through the helper instead of trusting that
    # the location setter honours <base>.
    ("index.html",
     'window.location.replace("pages/drive.html")',
     'window.location.replace(window.kermitUrl("pages/drive.html"))'),
    ("newtab.html",
     'window.location.href = "pages/slides.html";',
     'window.location.href = window.kermitUrl("pages/slides.html");'),
    ("pages/docs.html",
     'window.location.href = "pages/play.html?launch=" + tile.dataset.url;',
     'window.location.href = window.kermitUrl("pages/play.html?launch=" + tile.dataset.url);'),
    ("pages/play.html",
     'window.location.href = "pages/docs.html";',
     'window.location.href = window.kermitUrl("pages/docs.html");'),
    # the always-on-top chat window lives in its own document (Document PiP), so
    # it gets an absolute URL rather than a path that document cannot resolve.
    ("pages/vids.html",
     'const FLOAT_URL = "pages/vids.html?float=1";',
     'const FLOAT_URL = window.kermitUrl("pages/vids.html?float=1");'),
    # the decoy keeps no <base>, so it navigates with an explicit relative URL.
    ("pages/drive.html", 'window.location.replace(window.location.origin + "/?launch=1")',
     'window.location.replace(new URL("../index.html?launch=1", document.baseURI).href)'),
    # The two root-level pages the browser uses. These are swapped by hand
    # rather than by the generic rule: "/index.html" also appears appended to
    # *remote* game URLs (docs.html), where the leading slash is not ours to
    # touch. Neither of these names is used as an HTML attribute.
    ("assets/js/slidesfunctions.js",
     'const ENGINE_PATH = "/proxy.html";',
     'const ENGINE_PATH = "proxy.html";'),
    ("assets/js/slidesfunctions.js",
     'tabFrame.src = "/newtab.html";',
     'tabFrame.src = "newtab.html";'),
    # The one page-relative link in the site. It used to resolve against
    # /pages/ (where the page lives); with the base in place it must be measured
    # from the root like every other link.
    ("pages/sheets.html",
     "'watch.html?id='",
     "'pages/watch.html?id='"),
]


def fail(message):
    print("error: " + message, file=sys.stderr)
    sys.exit(1)


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


# ── rewrites ────────────────────────────────────────────────────────────────

def strip_origin_paths(text):
    """``"/assets/x"`` -> ``"assets/x"`` (quote, apostrophe or backtick)."""
    text = re.sub(
        r"""(["'`])/(%s)/""" % "|".join(PREFIXES),
        r"\1\2/", text)
    # A bare origin root in a link (only in that position: "/" is also a string
    # that code splits on, and that must not become "./").
    text = re.sub(r"""(href=)(["'])/(["'])""", r"\1\2./\3", text)
    return text


def rewrite_css(text):
    """CSS URLs resolve against the stylesheet's own URL, not the base.

    Every stylesheet here lives in assets/css/, so ``/assets/x`` is ``../x``.
    """
    return re.sub(r"""url\((['"]?)/assets/""", r"url(\1../", text)


def inject_base_script(path, text):
    depth = DEPTH["pages" if path.startswith("pages/") else "root"]
    block = ROOT_BLOCK.replace("__DEPTH__", depth)

    if MARK in text:
        # Replace the block already there (this is what makes the tool a no-op on
        # a second run, and lets an older version of the block be upgraded).
        text, count = re.subn(
            r"<!-- kermit:portable-root.*?</script>\n", block, text, count=1, flags=re.DOTALL)
        if count != 1:
            fail("%s has the portable-root marker but no complete block" % path)
        return text

    if not text.lstrip().lower().startswith("<!doctype html>"):
        fail("%s does not start with a doctype" % path)
    heads = re.findall(r"<head[\s>]", text, re.IGNORECASE)
    if len(heads) != 1:
        fail("%s has %d <head> tags" % (path, len(heads)))
    match = re.search(r"<head[^>]*>", text, re.IGNORECASE)
    if not match:
        fail("%s has no <head> to inject the base block into" % path)
    at = match.end()
    return text[:at] + "\n" + block + text[at:]


def fix_meta_paths(path, text):
    """Link-preview images resolve against the page URL, not <base>.

    Crawlers that build a preview card read the meta tags straight out of the
    HTML without running the script that writes the <base>, so those two image
    URLs are written relative to the page instead. index.html lives at the root
    and needs nothing.
    """
    if path.startswith("pages/") and path != DRIVE_HTML:
        text = text.replace('content="assets/', 'content="../assets/')
    return text


def port_html(path, text):
    text = strip_origin_paths(text)
    text = fix_meta_paths(path, text)
    if path not in NO_BASE:
        text = inject_base_script(path, text)
    return text


def patch_drive(text):
    """The decoy: no <base>, explicit ../ paths, relative hand-off.

    Runs on already-stripped text, so its links read "assets/..." and have to
    become "../assets/..." - it lives in pages/.
    """
    for attr in ("href", "src"):
        text = text.replace('%s="assets/' % attr, '%s="../assets/' % attr)
        text = text.replace("%s='assets/" % attr, "%s='../assets/" % attr)
    if '"/assets/' in text or "'/assets/" in text:
        fail("pages/drive.html still has an origin path")
    return text


def patch_sw(text):
    """The store worker finds its own scope instead of assuming /stores/."""
    old = 'if (!url.pathname.startsWith("/stores/")) return;'
    new = ('// The worker can be registered from any URL prefix (a sub-path deploy\n'
           '    // or a CDN path), so the store directory comes from its own scope.\n'
           '    var storeScope = (self.registration && self.registration.scope)\n'
           '        ? new URL(self.registration.scope).pathname\n'
           '        : "/stores/";\n'
           '    if (!url.pathname.startsWith(storeScope)) return;')
    if old not in text:
        if "storeScope" in text:
            return text
        fail("stores/sw.js: scope check not found")
    return text.replace(old, new)


def apply_swaps():
    for path, old, new in SWAPS:
        text = read(path)
        if new in text:
            continue
        if text.count(old) != 1:
            fail("%s: expected exactly one %r, found %d" % (path, old, text.count(old)))
        write(path, text.replace(old, new))
        print("patched %s" % path)


def main():
    check = "--check" in sys.argv
    pages = HTML_PAGES + sorted(
        str(p.relative_to(ROOT)).replace("\\", "/")
        for p in (ROOT / "pages").glob("*.html"))
    texts = [(p, read(p)) for p in pages] + \
            [(p, read(p)) for p in JS_FILES + JSON_FILES]

    changed = []
    for path, text in texts:
        if path.endswith(".html"):
            new = port_html(path, text)
        else:
            new = strip_origin_paths(text)

        if path == DRIVE_HTML:
            new = patch_drive(new)

        if new != text:
            changed.append(path)
            if not check:
                write(path, new)

    for path in CSS_FILES:
        text = read(path)
        new = rewrite_css(text)
        if new != text:
            changed.append(path)
            if not check:
                write(path, new)

    sw = read("stores/sw.js")
    sw_new = patch_sw(sw)
    if sw_new != sw:
        changed.append("stores/sw.js")
        if not check:
            write("stores/sw.js", sw_new)

    # proxy.html is generated by tools/vendor-gust.py, so its favicon is fixed
    # there as well; both are updated, keeping the two in step. (The file has an
    # unrelated "/assets/" inside a GUST comment about SVG sprite <use> proxying,
    # which is not a site path and is left alone.)
    proxy = read("proxy.html")
    proxy_new = proxy.replace('href="/assets/img/fav.png"', 'href="assets/img/fav.png"')
    if proxy_new != proxy:
        changed.append("proxy.html")
        if not check:
            write("proxy.html", proxy_new)

    vendor = read("tools/vendor-gust.py")
    vendor_new = vendor.replace('href="/assets/img/fav.png"',
                                'href="assets/img/fav.png"')
    if vendor_new != vendor:
        changed.append("tools/vendor-gust.py")
        if not check:
            write("tools/vendor-gust.py", vendor_new)

    if not check:
        apply_swaps()

    if check:
        if changed:
            print("needs portability rewrite: " + ", ".join(changed))
            sys.exit(1)
        print("already portable")
        return

    print("rewrote %d file(s): %s" % (len(changed), ", ".join(changed) or "none"))
    print("\nNext: regenerate the single files:")
    print("  python3 tools/make-site-html.py && python3 tools/make-site-svg.py")


if __name__ == "__main__":
    main()
