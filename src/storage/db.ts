/**
 * IndexedDB database setup for LogicSim
 * Provides local persistence for circuits and IC library
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { LogicNode, Wire, Viewport, IOMap, ICInternals } from '../engine/types';

// Database schema
interface LogicSimDB extends DBSchema {
  circuits: {
    key: string;
    value: {
      id: string;
      name: string;
      nodes: LogicNode[];
      wires: Wire[];
      viewport: Viewport;
      createdAt: number;
      updatedAt: number;
    };
    indexes: { 'by-updated': number };
  };
  library: {
    key: string;
    value: {
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
    };
    indexes: { 'by-name': string; 'by-created': number };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: unknown;
    };
  };
}

const DB_NAME = 'logic-sim-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<LogicSimDB> | null = null;

/**
 * Get or create the database instance
 */
export async function getDB(): Promise<IDBPDatabase<LogicSimDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LogicSimDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Circuits store
      if (!db.objectStoreNames.contains('circuits')) {
        const circuitStore = db.createObjectStore('circuits', { keyPath: 'id' });
        circuitStore.createIndex('by-updated', 'updatedAt');
      }

      // Library store
      if (!db.objectStoreNames.contains('library')) {
        const libraryStore = db.createObjectStore('library', { keyPath: 'id' });
        libraryStore.createIndex('by-name', 'name');
        libraryStore.createIndex('by-created', 'createdAt');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
    blocked() {
      console.warn('Database upgrade blocked. Please close other tabs.');
    },
    blocking() {
      // Close connection when another tab tries to upgrade
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    }
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Export types for use in other modules
export type { LogicSimDB };
