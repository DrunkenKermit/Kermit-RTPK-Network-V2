/*
 * Cursor from Kermit (RTPK) Network.
 *
 * Replaces the old DOM "blob" cursor: this builds a real CSS arrow cursor
 * from the site's accent colour, so it picks up whatever theme is active.
 * Storage reuses the existing "cherri_customCursor" key so the Settings
 * toggle keeps working.
 */
const CURSOR_KEY = "cherri_customCursor";
const DEFAULT_ACCENT = "#63ff93";

function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToRgb(h, s, l) {
  h = h / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return [f(0), f(8), f(4)];
}

function rgbToCss(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function getCurrentAccent() {
  const styles = getComputedStyle(document.documentElement);
  const value = (
    styles.getPropertyValue("--accent") ||
    styles.getPropertyValue("--current-accent") ||
    ""
  ).trim();
  return value || DEFAULT_ACCENT;
}

function buildSpaceCursorSVG(accent) {
  const rgb = hexToRgb(accent);
  const filled = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const darkOutline = `rgb(${Math.max(rgb[0] - 90, 0)},${Math.max(rgb[1] - 90, 0)},${Math.max(rgb[2] - 90, 0)})`;

  // Derive deeper, mid, and lighter gradation from the accent
  const temp = document.createElement('div');
  temp.style.color = accent;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const match = computed.match(/rgb\(([\d]+),([\d]+),([\d]+)\)/);
  let h = 0, s = 0, l = 50;
  if (match) {
    const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rr: h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6; break;
        case gg: h = ((bb - rr) / d + 2) / 6; break;
        case bb: h = ((rr - gg) / d + 4) / 6; break;
      }
    }
    l = (max + min) / 2;
  }
  h = ((h * 360) + 10) % 360;
  s = Math.min(s * 100 + 10, 90);
  l = Math.max(l * 100 - 8, 15);

  const deepH = h;
  const deepS = Math.max(s - 10, 40);
  const deepL = Math.max(l - 22, 8);
  const deep = rgbToCss(hslToRgb(deepH, deepS, deepL));

  const midH = (h + 10) % 360;
  const midS = Math.min(s + 5, 85);
  const midL = Math.max(l - 10, 20);
  const mid = rgbToCss(hslToRgb(midH, midS, midL));

  const lightH = (h + 22) % 360;
  const lightS = Math.min(s + 12, 100);
  const lightL = Math.min(l + 28, 78);
  const light = rgbToCss(hslToRgb(lightH, lightS, lightL));

  const shineH = (h + 28) % 360;
  const shineS = Math.min(s + 18, 100);
  const shineL = Math.min(l + 42, 88);
  const shine = rgbToCss(hslToRgb(shineH, shineS, shineL));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${deep}"/>
      <stop offset="38%" stop-color="${filled}"/>
      <stop offset="68%" stop-color="${mid}"/>
      <stop offset="92%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${shine}"/>
    </linearGradient>
  </defs>
  <!-- Arrow cursor shape -->
  <path d="M4 2 L4 26 L10 20 L15 30 L19.5 28 L14.5 18 L24 18 Z"
        fill="url(#grad)"
        stroke="${darkOutline}"
        stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>

  <!-- Stronger inner shadow -->
  <path d="M10 20 L15 30 L19.5 28"
        fill="none"
        stroke="${darkOutline}"
        stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        opacity="0.8"/>
</svg>`;
}

function makeCursorURL(svgString, hotX, hotY) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}") ${hotX} ${hotY}, auto`;
}

const CURSORS = {
  custom: { label: "Custom", build: () => makeCursorURL(buildSpaceCursorSVG(getCurrentAccent()), 4, 2) },
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
