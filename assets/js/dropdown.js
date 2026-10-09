// thanks to https://waves.lat for custom dropdowns || https://gitlab.com/waveslab/waves

// "Fog" (the old Vanta/three.js effect) was removed: it pulled two large
// libraries down and was the one backdrop that could not be kept readable.
const allBackgroundOptions = [
  "Rain",
  "Terminal",
  "Grid",
  "Dots",
  "None",
];

// A background saved before "Fog" was retired (or any other stale value) would
// otherwise show as the selected label while a different effect actually
// played, so the stored value is normalised to the option list here. This sits
// above appFolders because that reads it while the file is being evaluated.
const storedBackground = (
  localStorage.getItem("kermit_background") || "rain"
).toLowerCase();
const knownBackgrounds = allBackgroundOptions.map((option) =>
  option.toLowerCase()
);

const appFolders = {
  backend: localStorage.getItem("kermit_backend") || "Scramjet",
  searchEngine: localStorage.getItem("kermit_searchEngine") || "DuckDuckGo",
  decoy: localStorage.getItem("decoy") || "None",
  wisp: localStorage.getItem("kermit_wispUrlSelected") || "Mercury Workshop",
  theme: localStorage.getItem("kermit_theme") || "default",
  background: knownBackgrounds.indexOf(storedBackground) === -1 ? "rain" : storedBackground,
  toolbarPos: localStorage.getItem("kermit_toolbarPos") || "bottom",
};

// A page only carries the selectors for the settings it shows. The browser page
// is proxy-only and every other page hides the proxy controls (see
// assets/js/folders.js), so a missing selector must be skipped instead of
// throwing and taking the rest of this file down with it.
function wireSelector(
  selectorType,
  allOptions,
  currentVal,
  storageKey,
  eventName,
  successMsg
) {
  const root = document.querySelector(`.${selectorType}-selector`);
  if (!root) return;

  createSelector(
    selectorType,
    root.querySelector(`.${selectorType}-selected`),
    root.querySelector(`.${selectorType}-options`),
    allOptions,
    currentVal,
    storageKey,
    eventName,
    successMsg
  );
}

const decoyPresets = {
  Google: {
    title: "Google",
    icon: "https://www.google.com/favicon.ico",
  },
  "Google Docs": {
    title: "Untitled document - Google Docs",
    icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico",
  },
  Youtube: {
    title: "YouTube",
    icon: "https://www.youtube.com/s/desktop/014dbbed/img/favicon_32x32.png",
  },
  "Google Drive": {
    title: "Home - Google Drive",
    // Local copy of the Drive logo, so the tab cloaking works without a network.
    icon: "/assets/img/drive.svg",
  },
  "Khan Acadamy": {
    title: "Khan Academy | Free Online Courses",
    icon: "https://www.khanacademy.org/favicon.ico",
  },
  Canvas: {
    title: "Dashboard | Canvas",
    icon: "https://community.canvaslms.com/favicon.ico",
  },
  "Google Classroom": {
    title: "Classroom",
    icon: "https://ssl.gstatic.com/classroom/favicon.png",
  },
  "Delta Math": {
    title: "Delta Math - Assignment",
    icon: "https://www.google.com/s2/favicons?domain=deltamath.com&sz=256",
  },
  Microsoft: {
    title: "Microsoft 365",
    icon: "https://www.microsoft.com/favicon.ico",
  },
  Scratch: {
    title: "Scratch - Imagine, Program, Share",
    icon: "https://scratch.mit.edu/favicon.ico",
  },
  Billibilli: {
    title: "Bilibili - Video Sharing Platform",
    icon: "https://www.bilibili.com/favicon.ico",
  },
  Schoology: {
    title: "Home | Schoology",
    icon: "https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico",
  },
};


function closeAllSelectors() {
  document
    .querySelectorAll(
      ".backend-show, .transport-show, .search-engine-show, .decoy-show, .cloak-link-show, .wisp-show, .theme-show, .store-show, .background-show, .toolbar-show"
    )
    .forEach((el) =>
      el.classList.remove(
        "backend-show",
        "transport-show",
        "search-engine-show",
        "decoy-show",
        "cloak-link-show",
        "wisp-show",
        "theme-show",
        "store-show",
        "background-show",
        "toolbar-show"
      )
    );
  document
    .querySelectorAll(
      ".backend-arrow-active, .transport-arrow-active, .search-engine-arrow-active, .decoy-arrow-active, .cloak-link-arrow-active, .wisp-arrow-active, .theme-arrow-active, .store-arrow-active, .background-arrow-active, .toolbar-arrow-active"
    )
    .forEach((el) =>
      el.classList.remove(
        "backend-arrow-active",
        "transport-arrow-active",
        "search-engine-arrow-active",
        "decoy-arrow-active",
        "cloak-link-arrow-active",
        "wisp-arrow-active",
        "theme-arrow-active",
        "store-show",
        "background-arrow-active",
        "toolbar-arrow-active"
      )
    );
}

const defaultWispUrl = `${
  window.location.protocol === "https:" ? "wss" : "ws"
}://${window.location.host}/w/`;
// There is no backend or transport selector any more: the proxy is one page
// (the GUST engine over the Wisp tunnel), so the only networking choice left to
// make is which Wisp server to use.
const allSearchEngineOptions = [
  "DuckDuckGo",
  "Brave",
  "Qwant",
  "Google",
  "Bing",
  "Startpage",
];
const allDecoyOptions = [
  "None",
  "Google",
  "Google Docs",
  "Youtube",
  "Google Drive",
  "Khan Acadamy",
  "Canvas",
  "Google Classroom",
  "Delta Math",
  "Microsoft",
  "Scratch",
  "Billibilli",
];

// An older built-in default no longer resolves at all, which left the browser
// unable to load a single page. These two were verified to accept a websocket
// connection.
const wispPresets = {
  "Mercury Workshop": { url: "wss://wisp.mercurywork.shop/" },
  Terbium: { url: "wss://terbiumon.top/wisp/" },
};

const allWispOptions = [
  "Mercury Workshop",
  "Terbium",
];

const allToolbarOptions = [
  "Top",
  "Left",
  "Bottom",
];

const allThemeOptions = [
  "default",
  "aurora",
  "ember",
  "horizon",
  "orchid",
  "tide",
  "void",
];

function createSelector(
  selectorType,
  selectedEl,
  optionsEl,
  allOptions,
  currentVal,
  storageKey,
  eventName,
  successMsg
) {
  selectedEl.textContent = currentVal;

  selectedEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = optionsEl.classList.contains(`${selectorType}-show`);
    closeAllSelectors();

    if (!wasOpen) {
      optionsEl.innerHTML = "";
      allOptions.forEach((optionText) => {
        if (optionText !== selectedEl.textContent) {
          const div = document.createElement("div");
          div.textContent = optionText;
          div.addEventListener("click", function (e) {
            e.stopPropagation();
            const val = this.textContent;
            selectedEl.textContent = val;

            // Positions/backends are stored lower case so the readers can compare
            // them directly instead of guessing which casing was saved.
            const storageVal =
              storageKey === "backend" ||
              storageKey === "transport" ||
              storageKey === "kermit_toolbarPos"
                ? val.toLowerCase()
                : val;

            appFolders[storageKey] = storageVal;
            localStorage.setItem(storageKey, storageVal);
            closeAllSelectors();
            if (eventName)
              document.dispatchEvent(
                new CustomEvent(eventName, {
                  detail: storageVal,
                })
              );
            // The subpages do not load the toast helper, so keep this optional.
            if (successMsg && typeof window.showToast === "function")
              window.showToast("success", successMsg, "fas fa-check-circle");

            if (storageKey === "cloakLink") {
              runMenuCloak();
            }
          });
          optionsEl.appendChild(div);
        }
      });
      optionsEl.classList.add(`${selectorType}-show`);
      selectedEl.classList.add(`${selectorType}-arrow-active`);
    }
  });
}

// Remember what the page was called before any cloak was applied, so "None"
// restores the page's own title/icon instead of blanking it out.
const originalTitle = document.title;
const originalIconLink = document.querySelector("link[rel*='icon']");
const originalIcon = originalIconLink ? originalIconLink.href : "/assets/img/fav.png";

function applyDecoy(s) {
  const selected = decoyPresets[s];
  let favicon = document.querySelector("link[rel*='icon']");

  if (!favicon) return;

  if (s === "None" || !selected) {
    console.log(
      "Stayed as " +
        favicon.href +
        " " +
        document.title +
        " and " +
        s +
        " was selected"
    );
    document.title = originalTitle;
    favicon.href = originalIcon;
    return;
  } else {
    document.title = selected.title;
    favicon.href = selected.icon;
    console.log("Set to " + favicon.href + " " + document.title);
  }
}

wireSelector(
  "search-engine",
  allSearchEngineOptions,
  appFolders.searchEngine,
  "kermit_searchEngine",
  null,
  "Successfully updated Search Engine!"
);

wireSelector(
  "decoy",
  allDecoyOptions,
  appFolders.decoy,
  "decoy",
  "decoyUpdated",
  "Successfully updated cloak!"
);

wireSelector(
  "theme",
  allThemeOptions,
  appFolders.theme,
  "kermit_theme",
  "themeUpdated",
  "Successfully updated theme! Refresh to see background change."
);

wireSelector(
  "background",
  allBackgroundOptions,
  appFolders.background.charAt(0).toUpperCase() + appFolders.background.slice(1),
  "kermit_background",
  "backgroundUpdated",
  "Successfully updated the background!"
);

// The stored position is lower case ("top"/"left"/"bottom") and the option
// labels are capitalised, so map between the two; anything unrecognised falls
// back to the default dock.
const toolbarPosLabel = ["top", "left", "bottom"].includes(
  String(appFolders.toolbarPos).toLowerCase()
)
  ? String(appFolders.toolbarPos).charAt(0).toUpperCase() +
    String(appFolders.toolbarPos).slice(1).toLowerCase()
  : "Bottom";

wireSelector(
  "toolbar",
  allToolbarOptions,
  toolbarPosLabel,
  "kermit_toolbarPos",
  "toolbarUpdated",
  "Successfully updated the toolbar position!"
);

wireSelector(
  "wisp",
  allWispOptions,
  appFolders.wisp,
  "kermit_wispUrlSelected",
  "wispUpdated",
  "Successfully updated the Wisp server! Refresh to use it."
);

document.addEventListener("decoyUpdated", (e) => applyDecoy(e.detail));
document.addEventListener("themeUpdated", (e) => {
  const link = document.getElementById("css-theme-link");
  let theme = e.detail ?? "default";

  // Only a theme that actually ships is applied; anything else falls back to
  // the default palette. Keeps the stylesheet in step with the option list.
  if (theme !== "default" && allThemeOptions.indexOf(theme) === -1) theme = "default";

  if (link) {
    link.href = theme === "default"
      ? "/assets/css/colors.css"
      : `/assets/css/themes/${theme}.css`;
  }

  // Let the background / glow effects re-read the new accent without a reload.
  document.dispatchEvent(new CustomEvent("themeChanged", { detail: theme }));
});
document.addEventListener("backgroundUpdated", (e) => {
  if (window.setBackground) window.setBackground(String(e.detail).toLowerCase());
});

document.addEventListener("toolbarUpdated", (e) => {
  if (window.setToolbarPos) window.setToolbarPos(String(e.detail).toLowerCase());
});

document.addEventListener("wispUpdated", (e) => {
  const wisp = wispPresets[e.detail];
  if (!wisp) return;

  localStorage.setItem("kermit_wispUrl", wisp.url);
  console.log("Wisp server set to " + wisp.url);
});
window.addEventListener("load", () => {
  // Only rewrite the tab when a cloak is actually chosen: "None" (the default)
  // must leave each page's own title and icon alone.
  const decoy = localStorage.getItem("decoy");

  if (decoy && decoy !== "None") {
    applyDecoy(decoy);
    console.log("Cloaked as " + decoy);
  } else {
    console.log("No cloak selected");
  }
});
