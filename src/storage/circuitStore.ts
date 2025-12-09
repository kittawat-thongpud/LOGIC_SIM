/**
 * Circuit persistence operations
 * Save/load circuits to/from IndexedDB
 */

import { getDB } from './db';
import type { LogicNode, Wire, Viewport } from '../engine/types';
import { generateId } from '../engine/utils';

export interface SavedCircuit {
  id: string;
  name: string;
  nodes: LogicNode[];
  wires: Wire[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

/**
 * Save a circuit to the database
 */
export async function saveCircuit(
  name: string,
  nodes: LogicNode[],
  wires: Wire[],
  viewport: Viewport,
  existingId?: string
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  
  const circuit: SavedCircuit = {
    id: existingId || generateId(),
    name,
    nodes,
    wires,
    viewport,
    createdAt: existingId ? (await db.get('circuits', existingId))?.createdAt || now : now,
    updatedAt: now
  };

  await db.put('circuits', circuit);
  return circuit.id;
}

/**
 * Load a circuit from the database
 */
export async function loadCircuit(id: string): Promise<SavedCircuit | undefined> {
  const db = await getDB();
  return db.get('circuits', id);
}

/**
 * List all saved circuits
 */
export async function listCircuits(): Promise<SavedCircuit[]> {
  const db = await getDB();
  return db.getAllFromIndex('circuits', 'by-updated');
}

/**
 * Delete a circuit from the database
 */
export async function deleteCircuit(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('circuits', id);
}

/**
 * Get the most recently updated circuit (for auto-load)
 */
export async function getLastCircuit(): Promise<SavedCircuit | undefined> {
  const db = await getDB();
  const circuits = await db.getAllFromIndex('circuits', 'by-updated');
  return circuits.length > 0 ? circuits[circuits.length - 1] : undefined;
}

/**
 * Export circuit as JSON string for file download
 */
export function exportCircuitToJSON(circuit: SavedCircuit): string {
  return JSON.stringify(circuit, null, 2);
}

/**
 * Import circuit from JSON string
 */
export function importCircuitFromJSON(json: string): SavedCircuit {
  const circuit = JSON.parse(json) as SavedCircuit;
  // Assign new ID to avoid conflicts
  circuit.id = generateId();
  circuit.createdAt = Date.now();
  circuit.updatedAt = Date.now();
  return circuit;
}
