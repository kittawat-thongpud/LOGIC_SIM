/**
 * IC Library persistence operations
 * Save/load custom IC components to/from IndexedDB
 */

import { getDB } from './db';
import type { LogicNode, IOMap, ICInternals } from '../engine/types';
import { generateId } from '../engine/utils';

export interface LibraryItem {
  id: string;
  name: string;
  inputCount: number;
  outputCount: number;
  width: number;
  height: number;
  truthTable?: Record<string, number[]>;
  ioMap?: IOMap;
  compiledFunction?: string;
  equations?: string[];
  internals?: ICInternals;
  createdAt: number;
}

/**
 * Save an IC component to the library
 */
export async function saveToLibrary(node: LogicNode): Promise<string> {
  if (node.type !== 'IC') {
    throw new Error('Only IC nodes can be saved to the library');
  }

  const db = await getDB();
  
  const item: LibraryItem = {
    id: generateId(),
    name: node.label || 'Untitled Chip',
    inputCount: node.inputCount ?? 0,
    outputCount: node.outputCount ?? 0,
    width: node.width ?? 100,
    height: node.height ?? 100,
    truthTable: node.truthTable,
    ioMap: node.ioMap,
    compiledFunction: node.compiledFunction,
    equations: node.equations,
    internals: node.internals,
    createdAt: Date.now()
  };

  await db.put('library', item);
  return item.id;
}

/**
 * Load all items from the library
 */
export async function loadLibrary(): Promise<LibraryItem[]> {
  const db = await getDB();
  return db.getAllFromIndex('library', 'by-created');
}

/**
 * Get a specific item from the library
 */
export async function getLibraryItem(id: string): Promise<LibraryItem | undefined> {
  const db = await getDB();
  return db.get('library', id);
}

/**
 * Delete an item from the library
 */
export async function deleteFromLibrary(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('library', id);
}

/**
 * Search library items by name
 */
export async function searchLibrary(query: string): Promise<LibraryItem[]> {
  const db = await getDB();
  const all = await db.getAll('library');
  const lowerQuery = query.toLowerCase();
  return all.filter(item => item.name.toLowerCase().includes(lowerQuery));
}

/**
 * Create a LogicNode template from a library item
 * Used when placing an IC from the library
 */
export function libraryItemToNodeTemplate(item: LibraryItem): Partial<LogicNode> {
  return {
    label: item.name,
    inputCount: item.inputCount,
    outputCount: item.outputCount,
    width: item.width,
    height: item.height,
    truthTable: item.truthTable,
    ioMap: item.ioMap,
    compiledFunction: item.compiledFunction,
    equations: item.equations,
    internals: item.internals
  };
}

/**
 * Export library as JSON string for backup
 */
export async function exportLibraryToJSON(): Promise<string> {
  const items = await loadLibrary();
  return JSON.stringify(items, null, 2);
}

/**
 * Import library items from JSON string
 */
export async function importLibraryFromJSON(json: string): Promise<number> {
  const items = JSON.parse(json) as LibraryItem[];
  const db = await getDB();
  
  let imported = 0;
  for (const item of items) {
    // Assign new ID to avoid conflicts
    item.id = generateId();
    item.createdAt = Date.now();
    await db.put('library', item);
    imported++;
  }
  
  return imported;
}
