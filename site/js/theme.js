/* js/theme.js */

/**
 * setTheme(themeName) sets a custom theme when a non-empty string is passed.
 * If no value is provided, it unsets the custom theme so the system preference is used.
 * It always calls applyTheme() to update the UI.
 */
function setTheme(themeName) {
  if (themeName) {
    localStorage.setItem("theme", themeName);
  } else {
    localStorage.removeItem("theme");
  }
  applyTheme(localStorage.getItem("theme"));
  updateSystemThemeListener();
}


const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let listenerAttached = false;
function updateSystemThemeListener() {
  const theme = localStorage.getItem("theme");
  if (theme) { // if theme is set by user, no need to watch system preferences for changes
    if (listenerAttached) {
      darkQuery.removeEventListener("change", updateSystemThemeListener);
      listenerAttached = false;
    }
  } else {
    if (!listenerAttached) {
      darkQuery.addEventListener("change", updateSystemThemeListener);
      listenerAttached = true;
    }
  }
}
// Ensure updateSystemThemeListener() is called at least once on load (e.g. if using system theme preference, watch it if it changes)
updateSystemThemeListener();

window.setTheme = setTheme;
