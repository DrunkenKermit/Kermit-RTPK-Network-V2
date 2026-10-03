/*
 * Firebase configuration for Kermit (RTPK) Network accounts.
 * ----------------------------------------------------------
 * This is the only file that has to be filled in before cloud accounts work.
 * Everything else (the Account page, saving game progress, saving settings)
 * already reads these values.
 *
 * How to get them:
 *   1. https://console.firebase.google.com  ->  Add project
 *   2. Build > Authentication > Sign-in method -> enable "Email/Password" and
 *      "Google". For Google, Firebase walks you through creating the OAuth
 *      client - you do not need to touch Google Cloud yourself.
 *   2b. Authentication > Settings > Authorized domains -> add the site's domain
 *      (e.g. kermitrtpknetwork.freebuff.app) and localhost. Without this the
 *      Google popup fails with auth/unauthorized-domain.
 *   3. Project settings > Your apps > Web app (> "</>" ) -> copy the config.
 *   4. Build > Firestore Database -> Create database (production mode).
 *
 * Paste the values below. Firebase web keys are *public by design* - they
 * identify your project, they do not grant access on their own. Security comes
 * from the Firestore rules (see the Account page notes), not from hiding them.
 *
 * Until every value is filled in, the site runs in local-only mode: your icon
 * and username still save on this device, and nothing else changes.
 */
window.__KERMIT_FIREBASE_CONFIG__ = {
    apiKey: "AIzaSyDi6dPsR1Oibzy7SiS-PF8_8XraJzjxHZs",
    authDomain: "kermit-rtpk-network.firebaseapp.com",
    projectId: "kermit-rtpk-network",
    appId: "1:1046415301832:web:e05a197ba2b25fa7c599fd",
    messagingSenderId: "1046415301832",
    storageBucket: "kermit-rtpk-network.firebasestorage.app"
};

/* True only when the config looks like a real one (not blank, not a
   left-over "PASTE-YOUR-..." placeholder). */
window.__kermitFirebaseConfigured = function () {
    var c = window.__KERMIT_FIREBASE_CONFIG__ || {};

    if (!c.apiKey || !c.authDomain || !c.projectId) return false;
    if (/paste|your[-_ ]|xxxx|changeme|<.*>/i.test(c.apiKey + c.authDomain + c.projectId)) {
        return false;
    }
    return true;
};
