import { useState, useRef, useEffect } from "react";
import { FONT_OPTIONS, type FontOption } from "../lib/fonts";

interface FontPickerProps {
  currentFontId: string;
  onSelect: (fontId: string) => void;
}

/**
 * Minimal font picker dropdown for the footer bar.
 * Groups fonts by style (sans/serif/mono).
 */
export function FontPicker({ currentFontId, onSelect }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentFont = FONT_OPTIONS.find((f) => f.id === currentFontId) ?? FONT_OPTIONS[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const styleLabels: Record<string, string> = {
    sans: "Sans",
    serif: "Serif",
    mono: "Mono",
  };

  // Group by style
  const grouped = new Map<string, FontOption[]>();
  for (const font of FONT_OPTIONS) {
    const group = grouped.get(font.style) ?? [];
    group.push(font);
    grouped.set(font.style, group);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none"
        title="Editor font"
        data-testid="font-picker"
      >
        {currentFont.name}
      </button>

      {open && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface-2 border border-accent-muted rounded-lg shadow-lg py-1 min-w-[160px] z-50"
          data-testid="font-picker-dropdown"
        >
          {[...grouped.entries()].map(([style, fonts]) => (
            <div key={style}>
              <div className="text-text-tertiary text-[9px] uppercase tracking-wider px-3 py-1 opacity-60">
                {styleLabels[style] ?? style}
              </div>
              {fonts.map((font) => (
                <button
                  key={font.id}
                  onClick={() => {
                    onSelect(font.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                    font.id === currentFontId
                      ? "text-accent-warm bg-surface-3"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
                  }`}
                  style={{ fontFamily: font.family }}
                  data-testid={`font-option-${font.id}`}
                >
                  {font.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
