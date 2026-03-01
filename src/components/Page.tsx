/**
 * The Page — the single surface where everything happens.
 * Writing, conversing, gathering, navigating, shipping.
 * No toolbar, no status bar, no menu bar. The window is the document.
 */
export function Page({ ready }: { ready: boolean }) {
  return (
    <main className="flex-1 flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-2xl flex-1 flex flex-col px-[var(--spacing-page-x)] py-[var(--spacing-page-y)]">
        {/* Editor will mount here (mood-editor-1k1) */}
        <div className="flex-1 flex items-start">
          <p className="text-text-tertiary text-sm select-none">
            {ready ? "Ready to write." : "Starting…"}
          </p>
        </div>

        {/* Word count / reading time whisper — appears on pause */}
        <div className="h-8 flex items-center justify-center">
          <span className="text-text-tertiary text-xs opacity-0 transition-opacity duration-[var(--transition-normal)]">
            0 words · &lt;1 min
          </span>
        </div>
      </div>

      {/* Context tray indicator — tiny count at bottom */}
      <div className="h-6 flex items-center justify-center">
        <span className="text-text-tertiary text-[10px] opacity-40">
          0
        </span>
      </div>
    </main>
  );
}
