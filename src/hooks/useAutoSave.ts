import { useRef, useEffect, useCallback } from "react";

/**
 * Debounced auto-save hook.
 * Calls `save` after `delay` ms of inactivity.
 * Also flushes on unmount if there's a pending save.
 */
export function useAutoSave(
  save: () => Promise<void>,
  delay: number = 1000,
): { markDirty: () => void; flush: () => Promise<void> } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyRef.current) {
      dirtyRef.current = false;
      try {
        await saveRef.current();
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        saveRef.current().catch((err) =>
          console.error("Auto-save failed:", err),
        );
      }
    }, delay);
  }, [delay]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // Can't await in cleanup, fire-and-forget
      if (dirtyRef.current) {
        dirtyRef.current = false;
        saveRef.current().catch(() => {});
      }
    };
  }, []);

  return { markDirty, flush };
}
