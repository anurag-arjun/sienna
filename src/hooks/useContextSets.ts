import { useState, useCallback, useRef, useEffect } from "react";
import {
  contextSetsApi,
  type ContextSet,
  type ContextSetItem,
  type AssembledContext,
} from "../api/context-sets";

export interface ContextSetWithItems {
  set: ContextSet;
  items: ContextSetItem[];
}

/**
 * Hook to manage context sets and tag-triggered auto-loading.
 * When noteTags change, finds matching context sets and loads their items.
 */
export function useContextSets(noteTags: string[]) {
  const [matchedSets, setMatchedSets] = useState<ContextSetWithItems[]>([]);
  const [loading, setLoading] = useState(false);
  const noteTagsRef = useRef(noteTags);
  noteTagsRef.current = noteTags;

  // Stable serialization for dependency tracking
  const tagsKey = noteTags.slice().sort().join(",");

  // Load matching context sets when tags change
  useEffect(() => {
    if (noteTags.length === 0) {
      setMatchedSets([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const sets = await contextSetsApi.findContextSetsByTags(noteTags);
        if (cancelled) return;

        // Load items for each set
        const setsWithItems: ContextSetWithItems[] = await Promise.all(
          sets.map(async (set) => {
            const items = await contextSetsApi.listContextSetItems(set.id);
            return { set, items };
          }),
        );

        if (!cancelled) {
          setMatchedSets(setsWithItems);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tagsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Assemble all context content for pi injection
  const assembleContent = useCallback(async (): Promise<AssembledContext[]> => {
    const tags = noteTagsRef.current;
    if (tags.length === 0) return [];
    return contextSetsApi.assembleContextForTags(tags);
  }, []);

  return {
    matchedSets,
    loading,
    assembleContent,
    /** Total number of items across all matched sets */
    totalItems: matchedSets.reduce((sum, s) => sum + s.items.length, 0),
  };
}
