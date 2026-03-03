/**
 * Font options for the editor content area.
 * UI chrome (panels, buttons) always uses Inter.
 */

export interface FontOption {
  id: string;
  name: string;
  family: string;
  style: "sans" | "serif" | "mono";
  /** Google Fonts URL to load, if not a system font */
  url?: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "inter",
    name: "Inter",
    family: '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    style: "sans",
  },
  {
    id: "literata",
    name: "Literata",
    family: '"Literata", Georgia, "Times New Roman", serif',
    style: "serif",
    url: "https://fonts.googleapis.com/css2?family=Literata:ital,wght@0,400;0,600;0,700;1,400&display=swap",
  },
  {
    id: "ia-writer-quattro",
    name: "iA Writer Quattro",
    family: '"iA Writer Quattro S", "iA Writer Quattro", "JetBrains Mono", ui-monospace, monospace',
    style: "mono",
    url: "https://fonts.googleapis.com/css2?family=iA+Writer+Quattro+S:ital,wght@0,400;0,700;1,400&display=swap",
  },
];

export const DEFAULT_FONT = FONT_OPTIONS[0];

export function findFont(id: string): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? DEFAULT_FONT;
}

/** Load a Google Font by injecting a <link> tag. Idempotent. */
export function loadFont(font: FontOption): void {
  if (!font.url) return;

  const linkId = `font-${font.id}`;
  if (document.getElementById(linkId)) return;

  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = font.url;
  document.head.appendChild(link);
}

/** Apply font to the editor content area via CSS variable override. */
export function applyEditorFont(font: FontOption): void {
  document.documentElement.style.setProperty("--font-editor", font.family);
}
