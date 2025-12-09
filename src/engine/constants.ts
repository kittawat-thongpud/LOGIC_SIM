/**
 * Constants for the Logic Simulator
 */

// Grid and sizing
export const GRID_SIZE = 20;
export const DEF_GATE_W = 60;
export const DEF_GATE_H = 40;
export const PIN_RADIUS = 6;
export const HIT_RADIUS = 25;

// Color palette
export const COLORS = {
  bg: '#1e1e1e',
  grid: '#2a2a2a',
  wireOff: '#4b5563',
  wireOn: '#4ade80',
  nodeBody: '#374151',
  nodeBorder: '#9ca3af',
  nodeSelected: '#60a5fa',
  text: '#e5e7eb',
  pin: '#9ca3af',
  pinHover: '#ffffff',
  selectionFill: 'rgba(96, 165, 250, 0.2)',
  selectionBorder: '#60a5fa',
  minimapBg: '#111111',
  minimapNode: '#555555',
  minimapView: 'rgba(255, 255, 255, 0.1)',
  groupBody: 'rgba(255, 255, 255, 0.05)',
  groupBorder: 'rgba(255, 255, 255, 0.2)',
  icBody: '#111827',
  icBorder: '#3b82f6'
} as const;

// Simulation defaults
export const DEFAULT_TICK_RATE = 100;
export const STABILITY_LOOP_ITERATIONS = 3;

// Minimap dimensions
export const MINIMAP_WIDTH = 150;
export const MINIMAP_HEIGHT = 100;
export const MINIMAP_MARGIN = 20;
