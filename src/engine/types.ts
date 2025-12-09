/**
 * Core type definitions for the Logic Simulator
 */

// Node types available in the simulator
export type NodeType = 
  | 'AND' 
  | 'OR' 
  | 'NOT' 
  | 'XOR' 
  | 'NAND' 
  | 'SWITCH' 
  | 'LIGHT' 
  | 'CLOCK' 
  | 'BUFFER' 
  | 'GROUP' 
  | 'IC';

// 2D coordinate
export interface Vector2 {
  x: number;
  y: number;
}

// Connection point on a node
export interface Pin {
  id: string;
  nodeId: string;
  type: 'input' | 'output';
  index: number;
  value: boolean;
}

// Connection between two pins
export interface Wire {
  id: string;
  sourceNodeId: string;
  sourcePinIndex: number;
  targetNodeId: string;
  targetPinIndex: number;
  state: boolean;
}

// IO mapping for IC pins
export interface IOMap {
  inputs: string[];
  outputs: string[];
}

// Internal structure of an IC (packed circuit)
export interface ICInternals {
  nodes: LogicNode[];
  wires: Wire[];
}

// Base component in the circuit
export interface LogicNode {
  id: string;
  type: NodeType;
  position: Vector2;
  inputs: boolean[];
  outputs: boolean[];
  
  // Display properties
  label?: string;
  color?: string;
  
  // Group membership
  groupId?: string;
  
  // Dimensions (for GROUP/IC)
  width?: number;
  height?: number;
  
  // IC-specific properties
  inputCount?: number;
  outputCount?: number;
  truthTable?: Record<string, number[]>;
  ioMap?: IOMap;
  internalState?: any[];
  inputMapping?: number[];
  outputMapping?: number[];
  
  // Compiled logic (for performance)
  compiledFunction?: string;
  equations?: string[];
  
  // Nested circuit internals (for unpacking)
  internals?: ICInternals;
}

// Viewport state
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// Interaction modes
export type InteractionMode = 
  | 'NONE' 
  | 'DRAG_NODE' 
  | 'SELECT_AREA' 
  | 'WIRING' 
  | 'PAN';

// Serialized circuit for storage
export interface SerializedCircuit {
  id: string;
  name: string;
  nodes: LogicNode[];
  wires: Wire[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

// Library item (saved IC component)
export interface LibraryItem {
  id: string;
  name: string;
  inputCount: number;
  outputCount: number;
  width: number;
  height: number;
  truthTable?: Record<string, number[]>;
  ioMap?: IOMap;
  internalState?: any[];
  inputMapping?: number[];
  outputMapping?: number[];
  compiledFunction?: string;
  equations?: string[];
  internals?: ICInternals;
  createdAt: number;
}

// Tool selection type
export type ToolType = NodeType | 'SELECT';

// Engine callback types
export type OnUpdateUICallback = () => void;
export type OnSelectionChangeCallback = (node: LogicNode | null) => void;
