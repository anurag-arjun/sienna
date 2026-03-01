import { useState, useCallback, useRef, useEffect } from "react";
import { contextApi, type NoteContext } from "../api/context";

/**
 * Hook to manage context items for the active note.
 * Loads items from SQLite, supports add/remove/reorder.
 */
export function useContextItems(noteId: string | undefined) {
  const [items, setItems] = useState<NoteContext[]>([]);
  const [loading, setLoading] = useState(false);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Load items when noteId changes
  useEffect(() => {
    if (!noteId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    contextApi.listNoteContext(noteId).then((result) => {
      if (!cancelled) {
        setItems(result);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [noteId]);

  const addFile = useCallback(
    async (path: string) => {
      const nid = noteIdRef.current;
      if (!nid) return;

      try {
        const [meta, content] = await Promise.all([
          contextApi.getFileMeta(path),
          contextApi.readFileContent(path),
        ]);

        const item = await contextApi.addNoteContext({
          note_id: nid,
          type: "local",
          reference: path,
          label: meta.name,
          content_cache: content,
          sort_order: items.length,
        });

        setItems((prev) => [...prev, item]);
      } catch (err) {
        console.error("Failed to add file context:", err);
      }
    },
    [items.length],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await contextApi.removeNoteContext(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Failed to remove context:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    const nid = noteIdRef.current;
    if (!nid) return;
    try {
      const result = await contextApi.listNoteContext(nid);
      setItems(result);
    } catch {
      // ignore
    }
  }, []);

  return { items, loading, addFile, remove, refresh, count: items.length };
}
