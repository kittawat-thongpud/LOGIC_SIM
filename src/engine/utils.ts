/**
 * Utility functions for the Logic Simulator
 */

import type { Vector2 } from './types';

/**
 * Generate a random ID string
 */
export const generateId = (): string => 
  Math.random().toString(36).substr(2, 9);

/**
 * Calculate distance between two points
 */
export const distance = (p1: Vector2, p2: Vector2): number =>
  Math.hypot(p1.x - p2.x, p1.y - p2.y);

/**
 * Snap a position to the grid
 */
export const snapToGrid = (pos: Vector2, gridSize: number = 10): Vector2 => ({
  x: Math.round(pos.x / gridSize) * gridSize,
  y: Math.round(pos.y / gridSize) * gridSize
});

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Deep clone an object using JSON serialization
 * Handles undefined values by stripping them
 */
export const deepClone = <T>(obj: T): T =>
  JSON.parse(JSON.stringify(obj));

/**
 * Generate a hash string from an object for caching
 */
export const hashObject = (obj: unknown): string => {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
};
