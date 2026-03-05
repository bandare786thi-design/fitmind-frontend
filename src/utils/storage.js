const KEYS = {
  theme: "fitmind_theme",
  profilePrefs: "fitmind_profile_prefs",
  sidebarCollapsed: "fitmind_sidebar_collapsed"
};

export function getThemePref() {
  return localStorage.getItem(KEYS.theme);
}

export function setThemePref(theme) {
  localStorage.setItem(KEYS.theme, theme);
}

export function getProfilePrefs() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.profilePrefs) || "{}");
  } catch {
    return {};
  }
}

export function setProfilePrefs(data) {
  localStorage.setItem(KEYS.profilePrefs, JSON.stringify(data));
}

export function getSidebarCollapsed() {
  return localStorage.getItem(KEYS.sidebarCollapsed) === "1";
}

export function setSidebarCollapsed(value) {
  localStorage.setItem(KEYS.sidebarCollapsed, value ? "1" : "0");
}