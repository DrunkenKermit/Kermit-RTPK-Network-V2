const link = document.getElementById('css-theme-link');

function applyTheme(theme) {
    if (link) {
        if (theme !== 'default') {
            link.href = `/assets/css/themes/${theme}.css`;
        } else {
            link.href = '/assets/css/colors.css';
        }
    }

    // Lets the background (assets/js/background.js) re-read its accent colour
    // without a reload, in this document.
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
}

applyTheme(localStorage.getItem('cherri_theme') ?? 'default');

// A theme picked in another tab follows along immediately instead of waiting
// for a refresh.
window.addEventListener('storage', (e) => {
    if (e.key !== 'cherri_theme') return;
    applyTheme(e.newValue ?? 'default');
});