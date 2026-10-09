/*
 * Kermit (RTPK) Network accounts.
 * ----------------------------------------------------------
 * One module shared by the home toolbar and pages/forms.html:
 *
 *   - Sign up / sign in with email + password, or Google (Firebase Auth).
 *   - Profile: username + icon, stored locally (kermit_profile) and on the
 *     account document, painted onto the toolbar account button.
 *   - Sync: every user setting and any localStorage save data is snapshotted
 *     to Firestore (users/{uid}) and can be restored on another device. That
 *     covers the proxy/browser settings (backend, Wisp, search engine, tab
 *     cloaking), the site settings (theme, background, toolbar) and the
 *     browser favourites plus game progress. Changes made in one tab are
 *     pushed automatically, so two open tabs stay in step.
 *   - Local-only mode: when assets/js/firebase-config.js has not been filled
 *     in, everything still works on this device - only the cloud parts pause.
 *
 * Firebase is loaded lazily (only when an account feature is actually used or
 * the config exists), so pages that never touch accounts stay light.
 */
(function () {
    "use strict";

    var PROFILE_KEY = "kermit_profile";
    var META_KEY = "kermit_syncMeta";
    var SETTING_PREFIX = "kermit_";

    var DEFAULT_ICON = "ri-user-line";
    var ICON_RE = /^ri-[a-z0-9-]+-(fill|line)$/;
    // A profile icon can also be a picture the user uploaded, stored inline as
    // a data URL. 120k characters is roughly a 90 KB image - far more than the
    // downscaled 128px square the account page produces, but still small enough
    // to sync to Firestore with the rest of the profile.
    var IMAGE_ICON_RE = /^data:image\/[a-z0-9.+-]+[;,]/i;
    var MAX_ICON_LEN = 120000;
    var MAX_USERNAME = 24;

    // Firestore documents cap at 1MB; keep the snapshot comfortably under it.
    var MAX_VALUE = 350 * 1024;   // never store a single value above this
    var MAX_TOTAL = 800 * 1024;   // budget for the whole snapshot
    var PUSH_DEBOUNCE = 1500;
    var AUTO_SYNC_GAP = 30000;    // throttle the automatic pull+push on load

    // Browser/proxy plumbing, not user data - never leaves the device.
    var SKIP_KEYS = {
        "kermit_syncMeta": true,
        "bare-mux-path": true
    };
    var SKIP_PREFIXES = [
        "uv-", "uv_", "uv:", "__uv",
        "scramjet", "sj-", "sj_", "__scramjet",
        "bare-mux", "firebase"
    ];

    var FB_BASE = "https://www.gstatic.com/firebasejs/10.12.5/";

    var fbAuth = null;
    var fbDb = null;
    var sdkPromise = null;

    var state = {
        configured: false,
        signedIn: false,
        user: null,
        profile: { username: "", icon: DEFAULT_ICON },
        lastSync: 0,
        busy: false
    };

    var listeners = [];
    var pushTimer = null;
    var channel = null;
    // Last cloud problem, in plain words, so the account page can show why a
    // sync failed instead of leaving the user guessing.
    var lastError = "";

    // Resolved once the first auth state is known and the matching sync (if
    // any) has finished. Game pages await it before starting a game so the
    // cloud copy of the saves is already in localStorage when the game reads it.
    var firstAuthDone = false;
    var resolveFirstAuth = null;
    var firstAuth = new Promise(function (resolve) { resolveFirstAuth = resolve; });
    var pendingSync = null;

    function finishFirstAuth() {
        if (firstAuthDone) return;
        firstAuthDone = true;
        resolveFirstAuth();
    }

    try {
        channel = new BroadcastChannel("kermit-account");
    } catch (e) {
        channel = null;
    }

    /* ── storage helpers ─────────────────────────────────────────────────── */

    function read(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function parseJSON(text, fallback) {
        try {
            var value = JSON.parse(text);
            return value === null || value === undefined ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function getMeta() {
        var meta = parseJSON(read(META_KEY, ""), null) || {};
        return {
            lastSync: typeof meta.lastSync === "number" ? meta.lastSync : 0,
            count: typeof meta.count === "number" ? meta.count : 0
        };
    }

    function setMeta(lastSync, count) {
        write(META_KEY, JSON.stringify({ lastSync: lastSync, count: count }));
    }

    function configured() {
        if (typeof window.__kermitFirebaseConfigured !== "function") return false;
        try {
            return window.__kermitFirebaseConfigured() === true;
        } catch (e) {
            return false;
        }
    }

    function usableKey(key) {
        if (!key || SKIP_KEYS[key]) return false;
        for (var i = 0; i < SKIP_PREFIXES.length; i++) {
            if (key.indexOf(SKIP_PREFIXES[i]) === 0) return false;
        }
        return true;
    }

    /* ── profile ─────────────────────────────────────────────────────────── */

    function isImageIcon(value) {
        return typeof value === "string" &&
            value.length <= MAX_ICON_LEN &&
            IMAGE_ICON_RE.test(value);
    }

    // Either a Remixicon class or an uploaded picture.
    function isIconValue(value) {
        return typeof value === "string" &&
            (ICON_RE.test(value) || isImageIcon(value));
    }

    // Paint a profile icon onto any element: a Remixicon class, or an uploaded
    // picture drawn as a round background. Shared so the toolbar, the account
    // avatar and the picker chips all render a custom icon the same way.
    function applyIcon(el, icon) {
        if (!el) return;

        if (isImageIcon(icon)) {
            el.className = "";
            el.textContent = "";
            el.style.display = "inline-block";
            el.style.width = "1em";
            el.style.height = "1em";
            el.style.borderRadius = "50%";
            el.style.backgroundImage = "url(\"" + icon + "\")";
            el.style.backgroundSize = "cover";
            el.style.backgroundPosition = "center";
            el.style.backgroundRepeat = "no-repeat";
        } else {
            el.style.backgroundImage = "";
            el.style.backgroundSize = "";
            el.style.backgroundPosition = "";
            el.style.backgroundRepeat = "";
            el.style.width = "";
            el.style.height = "";
            el.style.borderRadius = "";
            el.style.display = "";
            el.className = isIconValue(icon) ? icon : DEFAULT_ICON;
        }
    }

    function loadProfile() {
        var stored = parseJSON(read(PROFILE_KEY, ""), null) || {};

        state.profile.username = typeof stored.username === "string"
            ? stored.username.slice(0, MAX_USERNAME)
            : "";
        state.profile.icon = isIconValue(stored.icon) ? stored.icon : DEFAULT_ICON;
    }

    function saveProfile(patch) {
        if (patch && typeof patch.username === "string") {
            state.profile.username = patch.username.trim().slice(0, MAX_USERNAME);
        }
        if (patch && isIconValue(patch.icon)) {
            state.profile.icon = patch.icon;
        }

        write(PROFILE_KEY, JSON.stringify(state.profile));
        paintToolbar();
        emit();

        if (channel) {
            try { channel.postMessage({ type: "profile" }); } catch (e) { }
        }

        // When signed in, the profile belongs to the account too.
        if (state.signedIn) {
            push().catch(function () { });
        }

        return state.profile;
    }

    // The toolbar account button shows the chosen icon (and username in its
    // tooltip). Safe to call anywhere - it no-ops without the toolbar.
    function paintToolbar() {
        var glyph = document.querySelector('nav[data-toolbar] a[data-page="forms"] i');
        if (!glyph) return;

        applyIcon(glyph, state.profile.icon);

        var link = glyph.parentNode;
        if (link) {
            link.title = state.profile.username
                ? "Account \u2014 " + state.profile.username
                : "Account";
        }
    }

    /* ── snapshot of this device ────────────────────────────────────────── */

    // Everything worth taking to another device: all kermit_* settings plus any
    // localStorage a game wrote for its progress. Smallest values are kept
    // first, so a huge save blob never pushes the real settings out.
    function collect() {
        var pairs = [];
        var i, key, value;

        try {
            for (i = 0; i < localStorage.length; i++) {
                key = localStorage.key(i);
                if (!key || !usableKey(key)) continue;
                value = localStorage.getItem(key);
                if (typeof value === "string") pairs.push([key, value]);
            }
        } catch (e) { }

        pairs.sort(function (a, b) { return a[1].length - b[1].length; });

        var data = {};
        var total = 0;
        var dropped = 0;

        for (i = 0; i < pairs.length; i++) {
            var len = pairs[i][1].length;
            if (len > MAX_VALUE || total + len > MAX_TOTAL) {
                dropped++;
                continue;
            }
            data[pairs[i][0]] = pairs[i][1];
            total += len;
        }

        return { data: data, count: pairs.length, saved: pairs.length - dropped, dropped: dropped };
    }

    // Apply a cloud snapshot to this device. Values that already match are not
    // rewritten, so no storage events (and no sync ping-pong) are generated.
    function applyData(map) {
        var changed = {};
        var applied = 0;
        var key;

        for (key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
            if (!usableKey(key)) continue;

            var value = map[key];
            if (typeof value !== "string") value = String(value);
            if (read(key, null) === value) continue;

            if (write(key, value)) {
                changed[key] = value;
                applied++;
            }
        }

        if (applied) applyKnown(changed);
        return applied;
    }

    // storage events only reach *other* documents, so the document doing the
    // applying has to update its own visible state (background, theme).
    function applyKnown(changed) {
        if ("kermit_theme" in changed) {
            applyTheme(changed.kermit_theme);
        }
        if ("kermit_background" in changed || "kermit_particlesOn" in changed) {
            applyBackground();
        }
        paintToolbar();
        emit();
    }

    // The themes that ship with the site. A cloud copy naming a theme that has
    // since been removed falls back to the default palette rather than linking
    // a stylesheet that no longer exists.
    var KNOWN_THEMES = ["aurora", "ember", "horizon", "orchid", "tide", "void"];

    function applyTheme(theme) {
        var link = document.getElementById("css-theme-link");
        if (!link) return;
        if (theme !== "default" && KNOWN_THEMES.indexOf(theme) === -1) theme = "default";
        link.href = (theme === "default")
            ? "/assets/css/colors.css"
            : "/assets/css/themes/" + theme + ".css";
        document.dispatchEvent(new CustomEvent("themeChanged", { detail: theme }));
    }

    function applyBackground() {
        if (typeof window.setBackground !== "function") return;

        var stored = String(read("kermit_background", "") || "").toLowerCase();
        var modes = window.KERMIT_BACKGROUNDS || ["none", "rain", "terminal", "grid", "dots"];
        var next = stored && modes.indexOf(stored) !== -1 ? stored : "rain";
        if (read("kermit_particlesOn", "yes") === "no") next = "none";

        window.setBackground(next);
    }

    /* ── Firebase (loaded on demand) ────────────────────────────────────── */

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = function () {
                reject(new Error("Could not load " + src));
            };
            document.head.appendChild(script);
        });
    }

    function sdk() {
        if (!configured()) {
            return Promise.reject(Object.assign(
                new Error("Cloud accounts are not set up on this site yet."),
                { code: "kermit/not-configured" }
            ));
        }
        if (fbAuth && fbDb) return Promise.resolve({ auth: fbAuth, db: fbDb });
        if (sdkPromise) return sdkPromise;

        sdkPromise = Promise.all([
            loadScript(FB_BASE + "firebase-app-compat.js"),
            loadScript(FB_BASE + "firebase-auth-compat.js"),
            loadScript(FB_BASE + "firebase-firestore-compat.js")
        ]).then(function () {
            if (!window.firebase) throw new Error("The sign-in library did not load.");

            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(window.__KERMIT_FIREBASE_CONFIG__);
            }
            fbAuth = window.firebase.auth();
            fbDb = window.firebase.firestore();
            fbAuth.onAuthStateChanged(handleAuth);

            return { auth: fbAuth, db: fbDb };
        }).catch(function (e) {
            sdkPromise = null;
            throw e;
        });

        return sdkPromise;
    }

    /* ── auth ───────────────────────────────────────────────────────────── */

    function handleAuth(user) {
        var hadUser = state.user;
        state.user = user || null;
        state.signedIn = !!user;

        emit();

        if (user && !hadUser) {
            // Signed in (or restored on page load): merge both ways, throttled
            // so opening ten tabs does not fire ten syncs.
            var meta = getMeta();
            if (Date.now() - meta.lastSync > AUTO_SYNC_GAP) {
                pendingSync = sync().catch(function () { });
            } else if (!pendingSync) {
                pendingSync = Promise.resolve();
            }
        }

        finishFirstAuth();

        if (channel) {
            try { channel.postMessage({ type: "auth", signedIn: !!user }); } catch (e) { }
        }
    }

    function signUp(email, password) {
        return sdk().then(function (h) {
            return h.auth.createUserWithEmailAndPassword(String(email).trim(), password)
                .then(function (cred) {
                    if (!state.profile.username) {
                        var name = String(email).split("@")[0].replace(/[^\w.-]/g, "").slice(0, MAX_USERNAME);
                        saveProfile({ username: name });
                    }
                    return cred;
                });
        });
    }

    function signInEmail(email, password) {
        return sdk().then(function (h) {
            return h.auth.signInWithEmailAndPassword(String(email).trim(), password);
        });
    }

    function signInGoogle() {
        return sdk().then(function (h) {
            var provider = new window.firebase.auth.GoogleAuthProvider();
            return h.auth.signInWithPopup(provider);
        });
    }

    function signOut() {
        return sdk().then(function (h) {
            return h.auth.signOut();
        }).then(function () {
            state.user = null;
            state.signedIn = false;
            lastError = "";
            emit();
        });
    }

    /* ── sync ───────────────────────────────────────────────────────────── */

    function requireUser(h) {
        var user = h.auth.currentUser;
        if (!user) {
            throw Object.assign(new Error("Sign in first."), { code: "kermit/signed-out" });
        }
        return user;
    }

    // Upload this device's settings + progress to the account.
    function push() {
        return sdk().then(function (h) {
            var user = requireUser(h);
            var snap = collect();
            var now = Date.now();

            var payload = {
                username: state.profile.username,
                icon: state.profile.icon,
                email: user.email || "",
                provider: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || "password",
                updatedAt: now,
                data: snap.data
            };

            return h.db.collection("users").doc(user.uid).set(payload).then(function () {
                lastError = "";
                setMeta(now, snap.saved);
                state.lastSync = now;
                emit();
                if (channel) {
                    try { channel.postMessage({ type: "sync", at: now, count: snap.saved }); } catch (e) { }
                }
                return { saved: snap.saved, dropped: snap.dropped };
            }).catch(function (err) {
                lastError = friendlyError(err);
                emit();
                throw err;
            });
        });
    }

    // Restore the account's snapshot onto this device (only when the cloud copy
    // is newer than what this device last synced).
    function pull() {
        return sdk().then(function (h) {
            var user = requireUser(h);
            var meta = getMeta();

            return h.db.collection("users").doc(user.uid).get().then(function (doc) {
                lastError = "";
                if (!doc.exists) return { applied: 0, empty: true };

                var cloud = doc.data() || {};
                if ((cloud.updatedAt || 0) <= meta.lastSync) {
                    state.lastSync = meta.lastSync;
                    emit();
                    return { applied: 0, upToDate: true };
                }

                var applied = applyData(cloud.data || {});

                saveProfileSilently({
                    username: typeof cloud.username === "string" ? cloud.username : undefined,
                    icon: typeof cloud.icon === "string" ? cloud.icon : undefined
                });

                setMeta(cloud.updatedAt, Object.keys(cloud.data || {}).length);
                state.lastSync = cloud.updatedAt;
                emit();
                return { applied: applied };
            });
        }).catch(function (err) {
            lastError = friendlyError(err);
            emit();
            throw err;
        });
    }

    // Profile fields arriving with a snapshot: store them without triggering
    // another upload round-trip (push is already part of sync()).
    function saveProfileSilently(patch) {
        var touched = false;

        if (patch && typeof patch.username === "string" && patch.username !== state.profile.username) {
            state.profile.username = patch.username.slice(0, MAX_USERNAME);
            touched = true;
        }
        // Accept both a Remixicon class and an uploaded picture, so a custom
        // profile image restores on other devices too.
        if (patch && typeof patch.icon === "string" && isIconValue(patch.icon) && patch.icon !== state.profile.icon) {
            state.profile.icon = patch.icon;
            touched = true;
        }

        if (touched) {
            write(PROFILE_KEY, JSON.stringify(state.profile));
            paintToolbar();
            emit();
        }
    }

    // Two-way merge: apply the cloud copy when it is newer, then upload.
    function sync() {
        state.busy = true;
        emit();

        return pull()
            .then(function (pulled) {
                return push().then(function (pushed) {
                    return { pulled: pulled, pushed: pushed };
                });
            })
            .finally(function () {
                state.busy = false;
                emit();
            });
    }

    function schedulePush() {
        if (!configured()) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(function () {
            pushTimer = null;
            if (state.signedIn && state.user) {
                push().catch(function () { });
            }
        }, PUSH_DEBOUNCE);
    }

    /* ── UI plumbing ────────────────────────────────────────────────────── */

    function snapshotUI() {
        var meta = getMeta();
        return {
            configured: state.configured,
            signedIn: state.signedIn,
            user: state.user,
            profile: { username: state.profile.username, icon: state.profile.icon },
            lastSync: state.lastSync || meta.lastSync,
            savedCount: meta.count,
            busy: state.busy,
            error: lastError
        };
    }

    function emit() {
        var ui = snapshotUI();
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](ui); } catch (e) { }
        }
    }

    function friendlyError(err) {
        var code = (err && err.code) || "";
        var map = {
            "kermit/not-configured": "Cloud accounts are not set up on this site yet \u2014 your profile still saves on this device.",
            "kermit/signed-out": "Sign in first.",
            "auth/invalid-email": "That email address doesn't look right.",
            "auth/missing-email": "Enter your email address.",
            "auth/missing-password": "Enter your password.",
            "auth/weak-password": "Password must be at least 6 characters.",
            "auth/email-already-in-use": "That email is already registered \u2014 switch to Log in.",
            "auth/user-not-found": "No account uses that email address.",
            "auth/wrong-password": "Wrong email or password.",
            "auth/invalid-credential": "Wrong email or password.",
            "auth/invalid-login-credentials": "Wrong email or password.",
            "auth/too-many-requests": "Too many attempts \u2014 wait a minute and try again.",
            "auth/network-request-failed": "Network error \u2014 check your connection.",
            "auth/popup-blocked": "Your browser blocked the sign-in popup \u2014 allow popups and try again.",
            "auth/popup-closed-by-user": "Sign-in was cancelled.",
            "auth/cancelled-popup-request": "Sign-in was cancelled.",
            "auth/configuration-not-found": "Google sign-in is not enabled yet \u2014 turn it on in the Firebase console.",
            "auth/operation-not-allowed": "That sign-in method is not enabled yet in the Firebase console.",
            // Firestore (the cloud side of sync) either is not created yet or
            // its rules do not allow the signed-in user to read/write.
            "permission-denied": "Cloud sync is blocked. In the Firebase console \u2192 Firestore Database, create the database and publish rules that let a signed-in user read and write their own document. Until then, everything still saves on this device.",
            "failed-precondition": "Cloud sync needs Firestore turned on. Open the Firebase console \u2192 Firestore Database and click Create database, then try Sync now again.",
            "not-found": "The Firestore database hasn't been created yet. Open the Firebase console \u2192 Firestore Database and click Create database, then try Sync now again.",
            "unavailable": "Couldn't reach the cloud just now \u2014 check your connection and press Sync now again.",
            "deadline-exceeded": "The cloud took too long to answer \u2014 press Sync now to try again.",
            "resource-exhausted": "This account's cloud save is too large to sync in one go."
        };

        if (map[code]) return map[code];

        // Firestore phrases a missing database in its message rather than a
        // dedicated code, so catch that wording too.
        if (err && err.message && /does not exist|has not been used|not been enabled|create.*database/i.test(err.message)) {
            return "Cloud sync needs Firestore turned on. Open the Firebase console \u2192 Firestore Database and click Create database, then press Sync now again.";
        }

        // Google (OAuth) sign-in only works from domains listed in the Firebase
        // project, so name the exact address that has to be added.
        if (code === "auth/unauthorized-domain") {
            var host = "";
            try { host = location.hostname; } catch (e) { }
            return "Google sign-in is blocked: this site's address" +
                (host ? " (" + host + ")" : "") +
                " isn't allowed in Firebase yet. Add " + (host || "this domain") +
                " in Firebase \u2192 Authentication \u2192 Settings \u2192 Authorized domains.";
        }

        if (err && err.message && /Could not load/.test(err.message)) {
            return "Couldn't load the sign-in library \u2014 you may be offline or it is blocked.";
        }
        return (err && err.message) || "Something went wrong. Try again.";
    }

    /* ── events ─────────────────────────────────────────────────────────── */

    // Settings are written by whichever document the user is on (the toolbar's
    // own page, a subpage, the settings overlay inside an iframe), and a
    // document never receives a storage event for its own writes - so watch
    // writes here as well and push them to the account.
    (function patchWrites() {
        var raw = localStorage.setItem;
        localStorage.setItem = function (key, value) {
            var result = raw.call(localStorage, key, value);

            if (typeof key === "string") {
                if (key === PROFILE_KEY) {
                    loadProfile();
                    paintToolbar();
                    emit();
                } else if (key !== META_KEY && usableKey(key)) {
                    // Any user data worth syncing: kermit_* settings, the proxy /
                    // browser preferences, the favourites list and game progress
                    // all land here, not just the kermit_* keys.
                    schedulePush();
                }
            }

            return result;
        };
    })();

    // Another tab changed a setting or (via its account page) the cloud copy:
    // keep this device's account data up to date without fighting over it.
    window.addEventListener("storage", function (e) {
        if (!e || !e.key) return;

        if (e.key === PROFILE_KEY) {
            loadProfile();
            paintToolbar();
            emit();
            return;
        }
        if (e.key === META_KEY) return;
        if (!usableKey(e.key)) return;

        schedulePush();
    });

    // Closing the last visible tab flushes whatever changed seconds ago.
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && state.signedIn && configured()) {
            if (pushTimer) {
                clearTimeout(pushTimer);
                pushTimer = null;
                push().catch(function () { });
            }
        }
    });

    if (channel && channel.addEventListener) {
        channel.addEventListener("message", function (e) {
            var msg = e && e.data;
            if (!msg) return;

            if (msg.type === "profile") {
                loadProfile();
                paintToolbar();
            }
            emit();
        });
    }

    /* ── public API ─────────────────────────────────────────────────────── */

    window.KERMIT_ACCOUNT = {
        configured: function () { return configured(); },
        profile: function () { return { username: state.profile.username, icon: state.profile.icon }; },
        setProfile: saveProfile,
        user: function () { return state.user; },
        status: snapshotUI,
        on: function (cb) {
            if (typeof cb !== "function") return function () { };
            listeners.push(cb);
            cb(snapshotUI());
            return function () {
                var i = listeners.indexOf(cb);
                if (i !== -1) listeners.splice(i, 1);
            };
        },
        signUp: signUp,
        signInEmail: signInEmail,
        signInGoogle: signInGoogle,
        signOut: signOut,
        push: push,
        pull: pull,
        sync: sync,
        friendlyError: friendlyError,
        paintToolbar: paintToolbar,
        applyIcon: applyIcon,
        // Resolves after the session is known and the first sync has settled,
        // but never blocks longer than `timeout` (default 3s) so a slow or
        // unreachable backend cannot hold up a page that is waiting on it.
        whenReady: function (timeout) {
            var limit = typeof timeout === "number" ? timeout : 3000;
            var ready = firstAuth.then(function () {
                return pendingSync || Promise.resolve();
            });
            var timer = new Promise(function (resolve) { setTimeout(resolve, limit); });
            return Promise.race([ready, timer]);
        },
        // Used by pages/forms.html before the SDK is loaded.
        ensureSDK: sdk
    };

    /* ── boot ───────────────────────────────────────────────────────────── */

    function boot() {
        state.configured = configured();
        loadProfile();
        paintToolbar();
        emit();

        // Restore the session and start syncing as soon as there is something
        // to restore. When unconfigured, nothing is fetched at all.
        if (state.configured) {
            sdk().catch(function () { finishFirstAuth(); });
        } else {
            finishFirstAuth();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
