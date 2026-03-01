import { useState, useCallback, useRef, useEffect } from "react";

export type TrayState = "closed" | "opening" | "open" | "closing";

interface ContextTrayProps {
  /** Whether the tray is open */
  open: boolean;
  /** Called when the tray should close */
  onClose: () => void;
  /** Number of context items attached */
  contextCount: number;
  /** Children rendered inside the tray panel */
  children?: React.ReactNode;
}

const TRAY_HEIGHT = 320; // px — height of the tray panel
const DRAG_THRESHOLD = 60; // px — minimum drag distance to dismiss
const ANIMATION_MS = 180; // transition duration

/**
 * Context Tray — slides up from the bottom of the window.
 * Like iOS Control Center: translucent overlay, drag down to dismiss.
 * Shows attached context items for the current note/conversation.
 */
export function ContextTray({
  open,
  onClose,
  contextCount,
  children,
}: ContextTrayProps) {
  const [trayState, setTrayState] = useState<TrayState>("closed");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isDragging = useRef(false);
  const trayRef = useRef<HTMLDivElement>(null);

  // Sync open prop → tray state transitions
  useEffect(() => {
    if (open) {
      setTrayState("opening");
      // Force reflow then animate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTrayState("open");
        });
      });
    } else if (trayState === "open" || trayState === "opening") {
      setTrayState("closing");
      const timer = setTimeout(() => {
        setTrayState("closed");
        setDragOffset(0);
      }, ANIMATION_MS);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key dismisses
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // ── Drag-to-dismiss ──────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only on the tray handle / header area
    dragStartY.current = e.clientY;
    isDragging.current = false;
    setDragOffset(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) {
      isDragging.current = true;
      setDragOffset(delta);
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (dragStartY.current === null) return;
    const wasDragging = isDragging.current;
    const offset = dragOffset;
    dragStartY.current = null;
    isDragging.current = false;

    if (wasDragging && offset > DRAG_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  // Overlay click dismisses
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (trayState === "closed") return null;

  const isVisible = trayState === "open";
  const translateY = isDragging.current
    ? `${dragOffset}px`
    : isVisible
      ? "0"
      : "100%";

  return (
    <div
      className={`fixed inset-0 z-40 transition-colors ${
        isVisible && !isDragging.current
          ? "duration-[var(--transition-normal)]"
          : ""
      }`}
      style={{
        backgroundColor: isVisible
          ? "rgba(26, 26, 46, 0.5)"
          : "rgba(26, 26, 46, 0)",
      }}
      onClick={handleOverlayClick}
      data-testid="context-tray-overlay"
    >
      <div
        ref={trayRef}
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-accent-muted/30"
        style={{
          height: `${TRAY_HEIGHT}px`,
          transform: `translateY(${translateY})`,
          transition: isDragging.current
            ? "none"
            : `transform ${ANIMATION_MS}ms ease`,
          backgroundColor: "rgba(37, 37, 56, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="context-tray-panel"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div
            className="w-10 h-1 rounded-full bg-text-tertiary/40"
            data-testid="context-tray-handle"
          />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between">
          <span className="text-text-secondary text-xs font-medium tracking-wide uppercase">
            Context
          </span>
          <span className="text-text-tertiary text-xs">
            {contextCount} item{contextCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Content area */}
        <div
          className="flex-1 overflow-y-auto px-5 pb-4"
          style={{ maxHeight: `${TRAY_HEIGHT - 72}px` }}
          data-testid="context-tray-content"
        >
          {children ?? (
            <p className="text-text-tertiary text-sm text-center py-8 select-none">
              No context attached
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Context Badge ────────────────────────────────────────────────────

interface ContextBadgeProps {
  count: number;
  onClick: () => void;
}

/**
 * Tiny context count badge in the bottom margin.
 * Shows the number of attached context items.
 */
export function ContextBadge({ count, onClick }: ContextBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none tabular-nums"
      data-testid="context-badge"
      title="Context tray"
    >
      {count}
    </button>
  );
}
