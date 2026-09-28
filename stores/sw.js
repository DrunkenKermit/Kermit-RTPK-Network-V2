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
})();<\/script>`;

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

    return new Response(injectShim(html), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    var request = event.request;

    if (request.mode !== "navigate") return;

    var url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    if (url.origin !== self.location.origin) return;
    if (!url.pathname.startsWith("/stores/")) return;
    if (!/\.html?$/i.test(url.pathname)) return;

    event.respondWith(withShim(request));
});
