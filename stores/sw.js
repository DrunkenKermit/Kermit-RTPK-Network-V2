/*
 * Progress saver for the game stores.
 *
 * The GN-Math games are YouTube Playables ports: every page loads the Playables
 * SDK from jsDelivr. `ytgame.js` starts with
 *
 *     var ne = window !== window.parent;              // "am I embedded?"
 *     ... if (ne) {
 *         Object.defineProperty(window, "localStorage",  { value: null, writable: false }),
 *         Object.defineProperty(window, "sessionStorage",{ value: null, writable: false }),
 *         Object.defineProperty(window, "indexedDB",     { value: null, writable: false }),
 *         Object.defineProperty(window, "caches",        { value: null, writable: false }),
 *         Object.defineProperty(document, "cookie",      { value: null, writable: false })
 *     }
 *
 * Because the game player shows every game in an iframe, that branch always
 * runs here: the games were handed a null localStorage, so nothing they saved
 * survived a reload (and games that touch it unguarded threw outright).
 *
 * A service worker with the /stores/ scope can rewrite the store pages before
 * their own scripts run, prepending a script that ignores exactly those
 * defineProperty calls. The document keeps its real URL, origin and storage, so
 * nothing else about how a game loads changes.
 *
 * Registered from pages/play.html. If the worker cannot run (insecure origin,
 * worker support disabled, first paint before activation), games load exactly
 * as they did before: no regression, just no save.
 *
 * This worker also rewrites the asset host of the blocked orgs below while it
 * has the page open for the shim, so the fix applies to every store page without
 * editing each game. See BLOCKED_ASSET_HOSTS.
 */

const SHIM = `<script data-kermit-storage="1">(function () {
    var STORAGE_API = { localStorage: 1, sessionStorage: 1, indexedDB: 1, caches: 1 };

    function isStorageKill(target, key, descriptor) {
        if (!descriptor || descriptor.value !== null) return false;
        if (key === "cookie") return target === document;
        if (!STORAGE_API[key]) return false;
        return target === window || target === self || target === globalThis;
    }

    var realDefineProperty = Object.defineProperty;
    Object.defineProperty = function (target, key, descriptor) {
        if (isStorageKill(target, key, descriptor)) return target;
        return realDefineProperty.apply(this, arguments);
    };

    var realDefineProperties = Object.defineProperties;
    Object.defineProperties = function (target, properties) {
        var kept = {};
        Object.keys(properties).forEach(function (key) {
            if (!isStorageKill(target, key, properties[key])) kept[key] = properties[key];
        });
        return realDefineProperties.call(this, target, kept);
    };

    if (self.Reflect && Reflect.defineProperty) {
        var realReflectDefineProperty = Reflect.defineProperty;
        Reflect.defineProperty = function (target, key, descriptor) {
            if (isStorageKill(target, key, descriptor)) return true;
            return realReflectDefineProperty.apply(this, arguments);
        };
    }

    // The copied game pages ship ad containers; the worker strips their markup
    // before the page parses (see stripAds) and blocks any ad request that still
    // gets made, and this hides whatever empty box is left behind.
    var style = document.createElement("style");
    style.textContent = ".adsbygoogle,[data-ad-slot],[data-ad-client],ins[data-ad-client]{display:none !important}";
    (document.head || document.documentElement).appendChild(style);
})();<\/script>`;

// jsDelivr blocks some of the GitHub orgs the games keep their assets in
// (HTTP 403, "User <org> is blocked"), which silently broke every game whose
// <base> pointed there. rawcdn.githack.com serves the same GitHub content, so
// route those orgs through it. Only the blocked orgs are rewritten; every other
// host, including working jsDelivr packages, is left exactly as the game wrote
// it.
// jsDelivr's @latest is a jsDelivr-only ref; githack needs a real branch, and
// these repos all use main.
var BLOCKED_ASSET_LATEST = /cdn\.jsdelivr\.net\/gh\/(gn-math|genizy)\/([A-Za-z0-9._-]+)@latest\//g;
var BLOCKED_ASSET_HOSTS = /cdn\.jsdelivr\.net\/gh\/(gn-math|genizy)\/([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)/g;
// Some references leave the branch implicit (jsDelivr defaults it); githack
// needs an explicit one, so those become @main.
var BLOCKED_ASSET_HOSTS_NO_REF = /cdn\.jsdelivr\.net\/gh\/(gn-math|genizy)\/([A-Za-z0-9._-]+)\//g;

function rewriteAssets(html) {
    return html
        .replace(BLOCKED_ASSET_LATEST, "rawcdn.githack.com/$1/$2/main/")
        .replace(BLOCKED_ASSET_HOSTS, "rawcdn.githack.com/$1/$2/$3")
        .replace(BLOCKED_ASSET_HOSTS_NO_REF, "rawcdn.githack.com/$1/$2/main/");
}

// The copied pages were built with the ad markup they shipped with: the Google
// AdSense loader, <ins class="adsbygoogle"> containers, the push() that fills
// them and, on some pages, a "backfill" script that swaps an unfilled slot for a
// third-party ad iframe (serve.playsaurus.com). Strip all of it from the HTML
// before the page parses it, so nothing ad-related reaches the DOM or triggers a
// request. The host block below cannot catch the backfill iframe on its own: a
// cross-origin frame navigation is not a request of this worker's client. To
// allow ads again, return html unchanged here and empty AD_HOSTS.
//
// The tempered "not crossing </script>" form stops a match from starting at an
// earlier, unrelated <script> and swallowing the code in between.
var AD_SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:adsbygoogle\.js|googlesyndication|doubleclick|playsaurus)[^"']*["'][^>]*>\s*<\/script>/gi;
var AD_INS = /<ins\b[^>]*\bclass\s*=\s*["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi;
var AD_SCRIPT_ADS = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:adsbygoogle|playsaurus)(?:(?!<\/script>)[\s\S])*?<\/script>/gi;
// The Playsaurus banner is a plain <a id="plad"> that the (now removed) script
// above used to fill, plus its HTML comment. Drop both so no empty ad shell is
// left behind.
var AD_BANNER = /<a\b[^>]*\bid\s*=\s*["']plad["'][^>]*>[\s\S]*?<\/a>|<![^>]*(?:playsaurus|ad slot|adslot)[^>]*>/gi;

function stripAds(html) {
    return html
        .replace(AD_SCRIPT_TAG, "")
        .replace(AD_INS, "")
        .replace(AD_SCRIPT_ADS, "")
        .replace(AD_BANNER, "");
}

function injectShim(html) {
    if (html.indexOf("data-kermit-storage") !== -1) return html;

    // Insert as early as possible, but never before the doctype or the <html>
    // element: that would drop the page into quirks mode.
    var anchors = [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i];

    for (var i = 0; i < anchors.length; i++) {
        var match = anchors[i].exec(html);
        if (match) {
            var at = match.index + match[0].length;
            return html.slice(0, at) + SHIM + html.slice(at);
        }
    }

    return SHIM + html;
}

async function withShim(request) {
    var response = await fetch(request);

    if (!response.ok) return response;

    var type = response.headers.get("content-type") || "";
    if (type && type.indexOf("html") === -1) return response;

    var html = await response.text();

    return new Response(injectShim(rewriteAssets(stripAds(html))), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// The game pages are copied from their upstream repos and ship the ad markup
// those pages came with (Google AdSense `<ins class="adsbygoogle">` plus the
// pagead2.googlesyndication.com loader, and others). Every /stores/ page is in
// this worker's scope, so its requests - including the cross-origin ad script -
// reach here before they are sent, and can be answered with an empty response.
// To allow ads again, empty AD_HOSTS.
var AD_HOSTS = [
    "googlesyndication.com",
    "doubleclick.net",
    "2mdn.net",
    "googleadservices.com",
    "googletagservices.com",
    "adsterra.com",
    "propellerads.com",
    "propellerpops.com",
    "popads.net",
    "monetag.com",
    "adcash.com",
    "pubmatic.com",
    "adnxs.com",
    "amazon-adsystem.com",
    "rubiconproject.com",
    "criteo.com",
    "taboola.com",
    "outbrain.com",
    "playsaurus.com",
    "playsaurusstats.com",
    "adsafeprotected.com",
    "moatads.com",
    "yieldmo.com",
    "smaato.net",
    "smartadserver.com",
    "33across.com",
    "sharethrough.com",
    "triplelift.com",
    "openx.net",
    "teads.tv",
    "sovrn.com",
    "media.net",
    "adform.net",
    "casalemedia.com",
    "mgid.com",
    "revcontent.com",
    "zergnet.com",
    "bidvertiser.com",
    "infolinks.com",
    "adroll.com",
    "gumgum.com",
    "rhythmone.com",
    "spotxchange.com",
    "lijit.com",
    "bidswitch.net",
    "districtm.io",
    "quantserve.com",
];

function isAdRequest(url) {
    var host = url.hostname.toLowerCase();
    for (var i = 0; i < AD_HOSTS.length; i++) {
        var domain = AD_HOSTS[i];
        if (host === domain || host.slice(-domain.length - 1) === "." + domain) return true;
    }
    return false;
}

self.addEventListener("fetch", (event) => {
    var request = event.request;

    var url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Advertising: answer with an empty script so nothing renders and the ad
    // request never leaves the browser.
    if (url.origin !== self.location.origin && isAdRequest(url)) {
        event.respondWith(new Response("", {
            status: 200,
            headers: { "Content-Type": "application/javascript" },
        }));
        return;
    }

    if (request.mode !== "navigate") return;
    if (url.origin !== self.location.origin) return;
    // The worker can be registered from any URL prefix (a sub-path deploy
    // or a CDN path), so the store directory comes from its own scope.
    var storeScope = (self.registration && self.registration.scope)
        ? new URL(self.registration.scope).pathname
        : "/stores/";
    if (!url.pathname.startsWith(storeScope)) return;
    if (!/\.html?$/i.test(url.pathname)) return;

    event.respondWith(withShim(request));
});
