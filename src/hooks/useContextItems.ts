import { useState, useCallback, useRef, useEffect } from "react";
import { contextApi, type NoteContext } from "../api/context";
import type { ContextSetItem } from "../api/context-sets";

/** A context item that could be from a note or from a matched set */
export interface MergedContextItem {
  id: string;
  type: string;
  reference: string;
  label: string;
  content_cache: string | null;
  sort_order: number;
  /** If from a context set, the set name (for whisper label) */
  fromSet?: string;
  /** If from a context set, the set ID */
  fromSetId?: string;
}

/**
 * Hook to manage context items for the active note.
 * Loads items from SQLite, supports add/remove/reorder.
 * Accepts optional set items to merge (from useContextSets).
 */
export function useContextItems(
  noteId: string | undefined,
  setItems?: Array<{ set: { id: string; name: string }; items: ContextSetItem[] }>,
) {
  const [items, setNoteItems] = useState<NoteContext[]>([]);
  const [loading, setLoading] = useState(false);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Load items when noteId changes
  useEffect(() => {
    if (!noteId) {
      setNoteItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    contextApi.listNoteContext(noteId).then((result) => {
      if (!cancelled) {
        setNoteItems(result);
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

        setNoteItems((prev) => [...prev, item]);
      } catch (err) {
        console.error("Failed to add file context:", err);
      }
    },
    [items.length],
  );

  const remove = useCallback(async (id: string) => {
    try {
      await contextApi.removeNoteContext(id);
      setNoteItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Failed to remove context:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    const nid = noteIdRef.current;
    if (!nid) return;
    try {
      const result = await contextApi.listNoteContext(nid);
      setNoteItems(result);
    } catch {
      // ignore
    }
  }, []);

  // Merge note-specific items with set items
  const mergedItems: MergedContextItem[] = [
    // Set items first (muted, with set name)
    ...(setItems ?? []).flatMap(({ set, items: sItems }) =>
      sItems.map((si) => ({
        id: si.id,
        type: si.type,
        reference: si.reference,
        label: si.label,
        content_cache: null as string | null,
        sort_order: si.sort_order,
        fromSet: set.name,
        fromSetId: set.id,
      })),
    ),
    // Note-specific items after
    ...items.map((ni) => ({
      id: ni.id,
      type: ni.type,
      reference: ni.reference,
      label: ni.label,
      content_cache: ni.content_cache,
      sort_order: ni.sort_order,
    })),
  ];

  return {
    items,
    mergedItems,
    loading,
    addFile,
    remove,
    refresh,
    count: mergedItems.length,
    noteCount: items.length,
  };
}
