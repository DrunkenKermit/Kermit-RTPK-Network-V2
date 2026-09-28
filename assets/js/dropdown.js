// thanks to https://waves.lat for custom dropdowns || https://gitlab.com/waveslab/waves
const appSettings = {
  backend: localStorage.getItem("cherri_backend") || "Scramjet",
  searchEngine: localStorage.getItem("cherri_searchEngine") || "DuckDuckGo",
  decoy: localStorage.getItem("decoy") || "None",
  wisp: localStorage.getItem("cherri_wispUrlSelected") || "Mercury Workshop",
  theme: localStorage.getItem("cherri_theme") || "default",
  background: (localStorage.getItem("cherri_background") || "rain").toLowerCase(),
  toolbarPos: localStorage.getItem("cherri_toolbarPos") || "top",
};

const searchEngineSelector = document.querySelector(".search-engine-selector");
const searchEngineSelected = searchEngineSelector.querySelector(
  ".search-engine-selected"
);
const searchEngineOptions = searchEngineSelector.querySelector(
  ".search-engine-options"
);

const decoySelector = document.querySelector(".decoy-selector");
const decoySelected = decoySelector.querySelector(".decoy-selected");
const decoyOptions = decoySelector.querySelector(".decoy-options");

const backendSelector = document.querySelector(".backend-selector");
const backendSelected = backendSelector.querySelector(".backend-selected");
const backendOptions = backendSelector.querySelector(".backend-options");

const themeSelector = document.querySelector(".theme-selector");
const themeSelected = themeSelector.querySelector(".theme-selected");
const themeOptions = themeSelector.querySelector(".theme-options");

const backgroundSelector = document.querySelector(".background-selector");
const backgroundSelected = backgroundSelector.querySelector(".background-selected");
const backgroundOptions = backgroundSelector.querySelector(".background-options");

const toolbarSelector = document.querySelector(".toolbar-selector");
const toolbarSelected = toolbarSelector.querySelector(".toolbar-selected");
const toolbarOptions = toolbarSelector.querySelector(".toolbar-options");

const wispSelector = document.querySelector(".wisp-selector");
const wispSelected = wispSelector.querySelector(".wisp-selected");
const wispOptions = wispSelector.querySelector(".wisp-options");

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
const allBackendOptions = ["Ultraviolet", "Scramjet"];
const allTransportOptions = ["Epoxy", "Libcurl"];
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

// The old default, wss://wisp.rhw.one/, no longer resolves at all, which left the
// browser unable to load a single page. These two were verified to accept a
// websocket connection.
const wispPresets = {
  "Mercury Workshop": { url: "wss://wisp.mercurywork.shop/" },
  Terbium: { url: "wss://terbiumon.top/wisp/" },
  rhw: { url: "wss://wisp.rhw.one/" },
  
};

const allWispOptions = [
  "Mercury Workshop",
  "Terbium",
  "rhw",
];

const allBackgroundOptions = [
  "Rain",
  "Fog",
  "Terminal",
  "Grid",
  "Dots",
  "None",
];

const allToolbarOptions = [
  "Top",
  "Left",
  "Bottom",
];

const allThemeOptions = [
  "default",
  "void",
  "ocean",
  "forest",
  "ember",
  "dunes",
  "lavendar",
  "midnight",
  "coral",
  "golden",
  "lime",
  "magenta",
  "neon",
  "royal blue",
  "sea",
  "violet",
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
              storageKey === "cherri_toolbarPos"
                ? val.toLowerCase()
                : val;

            appSettings[storageKey] = storageVal;
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

createSelector(
  "search-engine",
  searchEngineSelected,
  searchEngineOptions,
  allSearchEngineOptions,
  appSettings.searchEngine,
  "cherri_searchEngine",
  null,
  "Successfully updated Search Engine!"
);

createSelector(
  "decoy",
  decoySelected,
  decoyOptions,
  allDecoyOptions,
  appSettings.decoy,
  "decoy",
  "decoyUpdated",
  "Successfully updated cloak!"
);

createSelector(
  "backend",
  backendSelected,
  backendOptions,
  allBackendOptions,
  appSettings.backend,
  "cherri_backend",
  "backendUpdated",
  "Successfully updated backend!"
);

createSelector(
  "theme",
  themeSelected,
  themeOptions,
  allThemeOptions,
  appSettings.theme,
  "cherri_theme",
  "themeUpdated",
  "Successfully updated theme! Refresh to see background change."
);

createSelector(
  "background",
  backgroundSelected,
  backgroundOptions,
  allBackgroundOptions,
  appSettings.background.charAt(0).toUpperCase() + appSettings.background.slice(1),
  "cherri_background",
  "backgroundUpdated",
  "Successfully updated the background!"
);

createSelector(
  "toolbar",
  toolbarSelected,
  toolbarOptions,
  allToolbarOptions,
  ["left", "bottom"].includes(String(appSettings.toolbarPos).toLowerCase())
    ? String(appSettings.toolbarPos).charAt(0).toUpperCase() + String(appSettings.toolbarPos).slice(1).toLowerCase()
    : "Top",
  "cherri_toolbarPos",
  "toolbarUpdated",
  "Successfully updated the toolbar position!"
);

createSelector(
  "wisp",
  wispSelected,
  wispOptions,
  allWispOptions,
  appSettings.wisp,
  "cherri_wispUrlSelected",
  "wispUpdated",
  "Successfully updated the Wisp server! Refresh to use it."
);

document.addEventListener("decoyUpdated", (e) => applyDecoy(e.detail));
document.addEventListener("themeUpdated", (e) => {
  const link = document.getElementById("css-theme-link");
  const theme = e.detail ?? "default";

  if (theme !== "default") {
    link.href = `/assets/css/themes/${theme}.css`;
  } else {
    link.href = "/assets/css/colors.css";
  }
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

  localStorage.setItem("cherri_wispUrl", wisp.url);
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
