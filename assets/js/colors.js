const link = document.getElementById('css-theme-link');

// The themes that ship with the site. A stored value that is not one of these - 
// for example a theme that has since been removed - falls back to the default
// palette instead of linking a stylesheet that no longer exists.
const KNOWN_THEMES = ['aurora', 'ember', 'horizon', 'orchid', 'tide', 'void'];

function applyTheme(theme) {
    if (theme !== 'default' && KNOWN_THEMES.indexOf(theme) === -1) {
        theme = 'default';
        try { localStorage.setItem('kermit_theme', 'default'); } catch (e) { }
    }

    if (link) {
        link.href = theme === 'default'
            ? 'assets/css/colors.css'
            : `assets/css/themes/${theme}.css`;
    }

    // Lets the background (assets/js/background.js) re-read its accent colour
    // without a reload, in this document.
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
}

applyTheme(localStorage.getItem('kermit_theme') ?? 'default');

// A theme picked in another tab follows along immediately instead of waiting
// for a refresh.
window.addEventListener('storage', (e) => {
    if (e.key !== 'kermit_theme') return;
    applyTheme(e.newValue ?? 'default');
});