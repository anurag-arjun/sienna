import { useState, useCallback } from "react";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { stripMarkdown, suggestFilename } from "../lib/ship";
import { githubApi } from "../api/github";

interface ShipSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current document content (Markdown) */
  content: string;
  /** Note title for filename suggestion */
  title: string;
  /** Note tag for filename extension */
  tag?: string;
}

type ShipStatus = "idle" | "saving" | "success" | "error";

/**
 * Ship Sheet — drops from the top on Ctrl+E.
 * Four destinations: save to file, copy markdown, copy text, push to GitHub.
 */
export function ShipSheet({
  open,
  onClose,
  content,
  title,
  tag,
}: ShipSheetProps) {
  const [status, setStatus] = useState<ShipStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [ghOwner, setGhOwner] = useState("");
  const [ghRepo, setGhRepo] = useState("");
  const [ghPath, setGhPath] = useState(() => suggestFilename(title, tag));
  const [ghBranch, setGhBranch] = useState("main");
  const [ghMessage, setGhMessage] = useState(() => `Add ${suggestFilename(title, tag)}`);

  const showStatus = useCallback((msg: string, type: ShipStatus = "success") => {
    setStatus(type);
    setStatusMessage(msg);
    if (type === "success") {
      setTimeout(() => {
        setStatus("idle");
        setStatusMessage("");
      }, 2000);
    }
  }, []);

  const handleSaveToFile = useCallback(async () => {
    try {
      setStatus("saving");
      const path = await saveFileDialog({
        defaultPath: suggestFilename(title, tag),
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Text", extensions: ["txt"] },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (!path) {
        setStatus("idle");
        return;
      }
      // Write via Tauri fs
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, content);
      showStatus(`Saved to ${path}`);
    } catch (err) {
      showStatus(`Save failed: ${err}`, "error");
    }
  }, [content, title, tag, showStatus]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      showStatus("Copied as Markdown");
    } catch (err) {
      showStatus(`Copy failed: ${err}`, "error");
    }
  }, [content, showStatus]);

  const handleCopyText = useCallback(async () => {
    try {
      const plain = stripMarkdown(content);
      await navigator.clipboard.writeText(plain);
      showStatus("Copied as plain text");
    } catch (err) {
      showStatus(`Copy failed: ${err}`, "error");
    }
  }, [content, showStatus]);

  const handlePushToGitHub = useCallback(async () => {
    if (!ghOwner || !ghRepo || !ghPath || !ghMessage) {
      showStatus("Fill in all fields", "error");
      return;
    }
    try {
      setStatus("saving");
      const commitUrl = await githubApi.pushFile(
        ghOwner,
        ghRepo,
        ghPath,
        ghBranch,
        content,
        ghMessage,
      );
      showStatus(`Pushed → ${commitUrl}`);
    } catch (err) {
      showStatus(`Push failed: ${err}`, "error");
    }
  }, [ghOwner, ghRepo, ghPath, ghBranch, ghMessage, content, showStatus]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        data-testid="ship-backdrop"
      />

      {/* Sheet — drops from top */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 p-4"
        data-testid="ship-sheet"
      >
        <div className="bg-surface-2 rounded-xl border border-accent-muted/20 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <span className="text-text-secondary text-xs uppercase tracking-wide select-none">
              Ship
            </span>
            <button
              onClick={onClose}
              className="text-text-tertiary text-xs hover:text-text-secondary transition-colors cursor-pointer select-none"
            >
              ✕
            </button>
          </div>

          {/* Quick actions */}
          <div className="px-5 pb-3 flex gap-2">
            <ShipButton
              label="Save to file"
              icon="💾"
              onClick={handleSaveToFile}
              disabled={status === "saving"}
              testId="ship-save"
            />
            <ShipButton
              label="Copy MD"
              icon="📋"
              onClick={handleCopyMarkdown}
              disabled={status === "saving"}
              testId="ship-copy-md"
            />
            <ShipButton
              label="Copy text"
              icon="📝"
              onClick={handleCopyText}
              disabled={status === "saving"}
              testId="ship-copy-text"
            />
          </div>

          {/* GitHub push */}
          <div className="px-5 pb-4 border-t border-accent-muted/10 pt-3">
            <div className="text-text-tertiary text-[10px] uppercase tracking-wide mb-2 select-none">
              Push to GitHub
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={ghOwner}
                onChange={(e) => setGhOwner(e.target.value)}
                placeholder="owner"
                className="flex-1 bg-surface-1/80 text-text-primary text-xs rounded px-2 py-1.5 border border-accent-muted/20 focus:border-accent-blue/40 focus:outline-none placeholder:text-text-tertiary"
                data-testid="ship-gh-owner"
              />
              <span className="text-text-tertiary text-xs self-center">/</span>
              <input
                type="text"
                value={ghRepo}
                onChange={(e) => setGhRepo(e.target.value)}
                placeholder="repo"
                className="flex-1 bg-surface-1/80 text-text-primary text-xs rounded px-2 py-1.5 border border-accent-muted/20 focus:border-accent-blue/40 focus:outline-none placeholder:text-text-tertiary"
                data-testid="ship-gh-repo"
              />
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={ghPath}
                onChange={(e) => setGhPath(e.target.value)}
                placeholder="path/to/file.md"
                className="flex-[2] bg-surface-1/80 text-text-primary text-xs rounded px-2 py-1.5 border border-accent-muted/20 focus:border-accent-blue/40 focus:outline-none placeholder:text-text-tertiary"
                data-testid="ship-gh-path"
              />
              <input
                type="text"
                value={ghBranch}
                onChange={(e) => setGhBranch(e.target.value)}
                placeholder="branch"
                className="flex-1 bg-surface-1/80 text-text-primary text-xs rounded px-2 py-1.5 border border-accent-muted/20 focus:border-accent-blue/40 focus:outline-none placeholder:text-text-tertiary"
                data-testid="ship-gh-branch"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={ghMessage}
                onChange={(e) => setGhMessage(e.target.value)}
                placeholder="Commit message"
                className="flex-1 bg-surface-1/80 text-text-primary text-xs rounded px-2 py-1.5 border border-accent-muted/20 focus:border-accent-blue/40 focus:outline-none placeholder:text-text-tertiary"
                data-testid="ship-gh-message"
              />
              <button
                onClick={handlePushToGitHub}
                disabled={status === "saving" || !ghOwner || !ghRepo}
                className="bg-accent-blue/20 text-accent-blue text-xs rounded px-3 py-1.5 hover:bg-accent-blue/30 transition-colors disabled:opacity-40 cursor-pointer select-none"
                data-testid="ship-gh-push"
              >
                Push
              </button>
            </div>
          </div>

          {/* Status bar */}
          {statusMessage && (
            <div
              className={`px-5 py-2 text-xs border-t border-accent-muted/10 ${
                status === "error"
                  ? "text-red-400"
                  : status === "success"
                    ? "text-accent-green"
                    : "text-text-tertiary"
              }`}
              data-testid="ship-status"
            >
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Ship Button ────────────────────────────────────────────────────────

function ShipButton({
  label,
  icon,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-surface-3/40 hover:bg-surface-3/70 transition-colors disabled:opacity-40 cursor-pointer select-none"
      data-testid={testId}
    >
      <span className="text-base">{icon}</span>
      <span className="text-text-secondary text-[10px]">{label}</span>
    </button>
  );
}
