import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting } from "../api/settings";
import {
  findFont,
  loadFont,
  applyEditorFont,
  DEFAULT_FONT,
  type FontOption,
} from "../lib/fonts";

/**
 * Hook for editor font selection.
 * Loads saved preference, applies CSS var, handles Google Font loading.
 */
export function useEditorFont() {
  const [font, setFontState] = useState<FontOption>(DEFAULT_FONT);

  // Load saved preference on mount
  useEffect(() => {
    getSetting("editor_font")
      .then((savedId) => {
        if (savedId) {
          const f = findFont(savedId);
          setFontState(f);
          loadFont(f);
          applyEditorFont(f);
        }
      })
      .catch(() => {});
  }, []);

  const setFont = useCallback((fontId: string) => {
    const f = findFont(fontId);
    setFontState(f);
    loadFont(f);
    applyEditorFont(f);
    setSetting("editor_font", f.id).catch(() => {});
  }, []);

  return { font, setFont };
}
