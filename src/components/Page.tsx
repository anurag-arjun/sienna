import { useState, useCallback } from "react";
import { Editor } from "../editor";

/**
 * The Page — the single surface where everything happens.
 * Writing, conversing, gathering, navigating, shipping.
 * No toolbar, no status bar, no menu bar. The window is the document.
 */
export function Page({ ready }: { ready: boolean }) {
  const [wordCount, setWordCount] = useState(0);

  const handleChange = useCallback((content: string) => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, []);

  const readingTime = Math.max(1, Math.ceil(wordCount / 250));

  return (
    <main className="flex-1 flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-2xl flex-1 flex flex-col px-[var(--spacing-page-x)] py-[var(--spacing-page-y)]">
        {/* Editor surface */}
        <div className="flex-1 flex flex-col min-h-0">
          {ready ? (
            <Editor
              placeholder="Start writing…"
              onChange={handleChange}
              autoFocus
            />
          ) : (
            <p className="text-text-tertiary text-sm select-none">
              Starting…
            </p>
          )}
        </div>

        {/* Word count / reading time whisper */}
        <div className="h-8 flex items-center justify-center">
          <span
            className={`text-text-tertiary text-xs transition-opacity duration-200 ${
              wordCount > 0 ? "opacity-40" : "opacity-0"
            }`}
          >
            {wordCount} word{wordCount !== 1 ? "s" : ""} · {readingTime} min read
          </span>
        </div>
      </div>

      {/* Context tray indicator */}
      <div className="h-6 flex items-center justify-center">
        <span className="text-text-tertiary text-[10px] opacity-40">
          0
        </span>
      </div>
    </main>
  );
}
