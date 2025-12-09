/**
 * Custom hooks for storage operations
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  loadLibrary, 
  saveToLibrary, 
  deleteFromLibrary, 
  type LibraryItem 
} from '../storage';
import type { LogicNode } from '../engine/types';

/**
 * Hook for managing the IC library
 */
export function useLibrary() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load library on mount
  useEffect(() => {
    loadLibrary()
      .then(setItems)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  // Save IC to library
  const saveIC = useCallback(async (node: LogicNode) => {
    try {
      await saveToLibrary(node);
      const updated = await loadLibrary();
      setItems(updated);
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  }, []);

  // Delete from library
  const deleteItem = useCallback(async (id: string) => {
    try {
      await deleteFromLibrary(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  }, []);

  // Refresh library
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const updated = await loadLibrary();
      setItems(updated);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    items,
    loading,
    error,
    saveIC,
    deleteItem,
    refresh
  };
}
