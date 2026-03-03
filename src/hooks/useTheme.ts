import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting } from "../api/settings";

export type Theme = "dark" | "light";

/**
 * Theme hook — reads preference from SQLite on mount,
 * applies .theme-light class to body, persists changes.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [loaded, setLoaded] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    getSetting("theme")
      .then((value) => {
        const saved = value === "light" ? "light" : "dark";
        setThemeState(saved);
        applyThemeClass(saved);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyThemeClass(next);
      setSetting("theme", next).catch(() => {});
      return next;
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyThemeClass(t);
    setSetting("theme", t).catch(() => {});
  }, []);

  return { theme, toggle, setTheme, loaded };
}

/** Apply or remove .theme-light on the body element. */
function applyThemeClass(theme: Theme) {
  if (theme === "light") {
    document.body.classList.add("theme-light");
  } else {
    document.body.classList.remove("theme-light");
  }
}
