/*
 * Cursor from Kermit (RTPK) Network.
 *
 * Replaces the old DOM "blob" cursor: this builds a real CSS arrow cursor
 * as a bare outline with a soft glowing halo in the site's accent colour,
 * so it picks up whatever theme is active.
 * Storage reuses the existing "kermit_customCursor" key so the Settings
 * toggle keeps working.
 */
const CURSOR_KEY = "kermit_customCursor";
const DEFAULT_ACCENT = "#63ff93";

function getCurrentAccent() {
  const styles = getComputedStyle(document.documentElement);
  const value = (
    styles.getPropertyValue("--accent") ||
    styles.getPropertyValue("--current-accent") ||
    ""
  ).trim();
  return value || DEFAULT_ACCENT;
}

/* A bare arrow outline with a layered, blurred halo behind it. The whole
   thing is drawn in the theme accent, so the glow changes with the theme. */
function buildSpaceCursorSVG(accent) {
  // Classic pointer shape, kept small and inset so the glow has room to bloom.
  const arrow = "M4 2 L4 26 L10 20 L15 30 L19.5 28 L14.5 18 L24 18 Z";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <defs>
    <filter id="kglow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="1.6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g transform="translate(5,4) scale(0.86)">
    <!-- Glowing halo: a wide, soft stroke of the accent colour -->
    <path d="${arrow}" fill="none" stroke="${accent}" stroke-width="3.2"
          stroke-linejoin="round" stroke-linecap="round"
          opacity="0.55" filter="url(#kglow)"/>
    <!-- Crisp outline on top so the arrow stays readable -->
    <path d="${arrow}" fill="none" stroke="${accent}" stroke-width="1.7"
          stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;
}

function makeCursorURL(svgString, hotX, hotY) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}") ${hotX} ${hotY}, auto`;
}

const CURSORS = {
  custom: { label: "Custom", build: () => makeCursorURL(buildSpaceCursorSVG(getCurrentAccent()), 8, 6) },
  default: { label: "Default", build: () => "auto" },
};

function applyCursor(key) {
  if (key === "yes" || key === "frog") key = "custom";
  if (key === "no") key = "default";
  if (!CURSORS[key]) key = "custom";

  const style = document.getElementById("kermit-cursor-style") || (() => {
    const s = document.createElement("style");
    s.id = "kermit-cursor-style";
    document.head.appendChild(s);
    return s;
  })();

  const cur = CURSORS[key].build();
  style.textContent = cur === "auto"
    ? ""
    : `*, *::before, *::after { cursor: ${cur} !important; }`;

  try { localStorage.setItem(CURSOR_KEY, key === "custom" ? "yes" : "no"); } catch (e) { }
}

function getCursor() {
  try {
    const stored = localStorage.getItem(CURSOR_KEY) ?? "yes";
    return stored === "no" ? "default" : "custom";
  } catch (e) {
    return "custom";
  }
}

function refreshCursor() {
  applyCursor(getCursor());
}

document.addEventListener("DOMContentLoaded", refreshCursor);
window.addEventListener("load", refreshCursor);

// Re-draw when the theme stylesheet swaps (the arrow follows --accent)
const cursorThemeLink = document.getElementById("css-theme-link");
if (cursorThemeLink) {
  cursorThemeLink.addEventListener("load", refreshCursor);
}

window.kermitCursors = CURSORS;
window.applyKermitCursor = applyCursor;
window.getKermitCursorStyle = getCursor;
