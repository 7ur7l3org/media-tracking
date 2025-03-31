/* js/theme.js */

const themeLuminance = {
  light: 'light',
  dark: 'dark',
};

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let listenerAttached = false;

/**
 * updateTheme() applies the theme:
 * - Uses the custom theme from localStorage if present.
 * - Otherwise, uses the system preference.
 * It attaches or detaches the system preference listener accordingly.
 */
function updateTheme() {
  var theme = localStorage.getItem("theme");
  if (theme) {
    if (listenerAttached) {
      darkQuery.removeEventListener("change", updateTheme);
      listenerAttached = false;
    }
  } else {
    theme = darkQuery.matches ? "dark" : "light";
    if (!listenerAttached) {
      darkQuery.addEventListener("change", updateTheme);
      listenerAttached = true;
    }
  }

  document.documentElement.setAttribute("data-theme", theme);
  const scheme = themeLuminance[theme] || 'light';
  document.querySelector('meta[name="color-scheme"]').setAttribute('content', scheme);
}

/**
 * setTheme(themeName) sets a custom theme when a non-empty string is passed.
 * If no value is provided, it unsets the custom theme so the system preference is used.
 * It always calls updateTheme() to update the UI.
 */
function setTheme(themeName) {
  if (themeName) {
    localStorage.setItem("theme", themeName);
  } else {
    localStorage.removeItem("theme");
  }
  updateTheme();
}

// Ensure updateTheme() is called once on load.
if (!window.__themeInitialized) {
  updateTheme();
  window.__themeInitialized = true;
}

window.setTheme = setTheme;
window.updateTheme = updateTheme;
