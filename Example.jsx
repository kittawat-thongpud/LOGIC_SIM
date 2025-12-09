import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { 
  Play, Pause, Plus, Minus, MousePointer2, 
  Trash2, Cpu, ToggleLeft, Lightbulb, Activity, ArrowRight,
  Maximize, X, Settings, Type, Palette, Terminal, Copy, Files,
  BoxSelect, Ungroup, Package, Box, Book, Save, Download
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, setDoc } from 'firebase/firestore';

// --- ROBUST TAILWIND POLYFILL ---
// Ensures 'tailwind' exists on window to prevent ReferenceErrors from external scripts or runtime wrappers
try {
  if (typeof window !== 'undefined') {
    (window as any).tailwind = (window as any).tailwind || { config: {} };
  }
} catch (e) {
  console.warn("Tailwind polyfill failed", e);
}

// --- FIREBASE SETUP ---
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';

/**
 * ==========================================
 * TYPE DEFINITIONS & CONSTANTS
 * ==========================================
 */

type NodeType = 'AND' | 'OR' | 'NOT' | 'XOR' | 'NAND' | 'SWITCH' | 'LIGHT' | 'CLOCK' | 'BUFFER' | 'GROUP' | 'IC';

interface Vector2 {
  x: number;
  y: number;
}

interface Pin {
  id: string; 
  nodeId: string;
  type: 'input' | 'output';
  index: number;
  value: boolean;
}

interface LogicNode {
  id: string;
  type: NodeType;
  position: Vector2;
  inputs: boolean[];
  outputs: boolean[];
  label?: string;      
  color?: string;      
  
  groupId?: string;    
  width?: number;      
  height?: number;     

  // IC Properties
  inputCount?: number;
  outputCount?: number;
  truthTable?: Record<string, number[]>; 
  ioMap?: { inputs: string[], outputs: string[] }; 
  
  compiledFunction?: string; 
  equations?: string[]; 
  
  internals?: {
      nodes: LogicNode[];
      wires: Wire[];
  };
}

interface Wire {
  id: string;
  sourceNodeId: string;
  sourcePinIndex: number;
  targetNodeId: string;
  targetPinIndex: number;
  state: boolean;
}

const GRID_SIZE = 20;
const DEF_GATE_W = 60;
const DEF_GATE_H = 40;
const PIN_RADIUS = 6;
const HIT_RADIUS = 25;

const COLORS = {
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
};

const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * ==========================================
 * LOGIC ENGINE
 * ==========================================
 */
class CircuitEngine {
  nodes: Map<string, LogicNode> = new Map();
  wires: Wire[] = [];
  viewport = { x: 0, y: 0, zoom: 1 };
  
  // Interaction
  selectedNodeIds: Set<string> = new Set();
  hoveredPin: Pin | null = null;
  
  interactionMode: 'NONE' | 'DRAG_NODE' | 'SELECT_AREA' | 'WIRING' | 'PAN' = 'NONE';
  
  dragStart: Vector2 = { x: 0, y: 0 };
  dragOffset: Map<string, Vector2> = new Map();
  
  selectionStart: Vector2 = { x: 0, y: 0 };
  selectionCurrent: Vector2 = { x: 0, y: 0 };
  
  wiringStart: Pin | null = null;
  mouseWorld: Vector2 = { x: 0, y: 0 };

  // Simulation
  isRunning = false;
  tickRate = 100;
  lastTick = 0;
  tickCount = 0;

  fnCache: Map<string, Function> = new Map();

  onUpdateUI: () => void = () => {};
  onSelectionChange: (node: LogicNode | null) => void = () => {};

  constructor() {
    this.addNode('SWITCH', { x: 100, y: 100 });
    this.addNode('SWITCH', { x: 100, y: 200 });
    this.addNode('AND', { x: 300, y: 150 });
    this.addNode('LIGHT', { x: 500, y: 150 });
  }

  // --- Graph ---

  addNode(type: NodeType, pos: Vector2, template?: Partial<LogicNode>) {
    const id = generateId();
    
    // Calculate IO counts based on template if available
    const inCount = template ? this.getInputCount(type, template as LogicNode) : this.getInputCount(type);
    const outCount = template ? this.getOutputCount(type, template as LogicNode) : this.getOutputCount(type);

    const newNode: LogicNode = {
      id,
      type,
      position: pos,
      inputs: new Array(inCount).fill(false),
      outputs: new Array(outCount).fill(false),
      ...template // Merge template properties
    };

    // Deep clone logic properties to prevent shared references
    if (template) {
        if(newNode.internals) newNode.internals = JSON.parse(JSON.stringify(newNode.internals));
        if(newNode.truthTable) newNode.truthTable = JSON.parse(JSON.stringify(newNode.truthTable));
        if(newNode.ioMap) newNode.ioMap = JSON.parse(JSON.stringify(newNode.ioMap));
        if(newNode.equations) newNode.equations = [...newNode.equations];
    }

    this.nodes.set(id, newNode);
    this.triggerUpdate();
    return id;
  }

  updateNodeData(id: string, data: Partial<LogicNode>) {
    const node = this.nodes.get(id);
    if (node) {
      Object.assign(node, data);
      if (node.type === 'IC' && data.compiledFunction) {
          this.fnCache.delete(node.id);
      }
      this.triggerUpdate();
    }
  }

  deleteSelected() {
    this.selectedNodeIds.forEach(id => {
      this.nodes.delete(id);
      this.wires = this.wires.filter(w => w.sourceNodeId !== id && w.targetNodeId !== id);
      this.nodes.forEach(n => {
          if (n.groupId === id) n.groupId = undefined;
      });
      this.fnCache.delete(id);
    });
    this.selectedNodeIds.clear();
    this.triggerUpdate();
  }

  duplicateSelected() {
    if (this.selectedNodeIds.size === 0) return;

    const idMap = new Map<string, string>();
    const newNodes: LogicNode[] = [];
    const offset = { x: 20, y: 20 };

    this.selectedNodeIds.forEach(id => {
      const node = this.nodes.get(id);
      if (node) {
        const newId = generateId();
        idMap.set(id, newId);
        // Deep copy internals
        const clone = JSON.parse(JSON.stringify(node));
        clone.id = newId;
        clone.position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
        // Reset state
        clone.inputs = new Array(node.inputs.length).fill(false);
        clone.outputs = new Array(node.outputs.length).fill(false);
        newNodes.push(clone);
      }
    });

    const newWires: Wire[] = [];
    this.wires.forEach(w => {
      if (idMap.has(w.sourceNodeId) && idMap.has(w.targetNodeId)) {
        newWires.push({
          id: generateId(),
          sourceNodeId: idMap.get(w.sourceNodeId)!,
          sourcePinIndex: w.sourcePinIndex,
          targetNodeId: idMap.get(w.targetNodeId)!,
          targetPinIndex: w.targetPinIndex,
          state: w.state
        });
      }
    });

    this.selectedNodeIds.clear();
    newNodes.forEach(n => {
        if (n.groupId && !idMap.has(n.groupId)) n.groupId = undefined;
        if (n.groupId && idMap.has(n.groupId)) n.groupId = idMap.get(n.groupId);
        this.nodes.set(n.id, n);
        this.selectedNodeIds.add(n.id);
    });
    this.wires.push(...newWires);
    
    this.triggerUpdate();
  }

  // --- Grouping Logic ---

  createGroupFromSelection() {
      if (this.selectedNodeIds.size === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      this.selectedNodeIds.forEach(id => {
          const n = this.nodes.get(id);
          if (n && n.type !== 'GROUP') { 
             const dims = this.getNodeDimensions(n);
             minX = Math.min(minX, n.position.x - dims.w/2);
             minY = Math.min(minY, n.position.y - dims.h/2);
             maxX = Math.max(maxX, n.position.x + dims.w/2);
             maxY = Math.max(maxY, n.position.y + dims.h/2);
          }
      });

      if (minX === Infinity) return;
      const padding = 30;
      const width = (maxX - minX) + padding * 2;
      const height = (maxY - minY) + padding * 2;
      const centerX = minX - padding + width/2;
      const centerY = minY - padding + height/2;

      const groupId = generateId();
      this.nodes.set(groupId, {
          id: groupId,
          type: 'GROUP',
          position: { x: centerX, y: centerY },
          width, height,
          inputs: [], outputs: [],
          label: 'Group'
      });

      this.selectedNodeIds.forEach(id => {
          const n = this.nodes.get(id);
          if (n && n.type !== 'GROUP') n.groupId = groupId;
      });

      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(groupId);
      this.nodes.forEach(n => { if (n.groupId === groupId) this.selectedNodeIds.add(n.id); });
      this.triggerUpdate();
  }

  ungroupSelected() {
      const groupsToUngroup = new Set<string>();
      this.selectedNodeIds.forEach(id => {
          const n = this.nodes.get(id);
          if (n && n.type === 'GROUP') groupsToUngroup.add(n.id);
      });
      if (groupsToUngroup.size === 0) return;
      groupsToUngroup.forEach(gid => {
          this.nodes.delete(gid);
          this.selectedNodeIds.delete(gid);
      });
      this.nodes.forEach(n => {
          if (n.groupId && groupsToUngroup.has(n.groupId)) {
              n.groupId = undefined;
              this.selectedNodeIds.add(n.id);
          }
      });
      this.triggerUpdate();
  }

  // --- PACKING / UNPACKING ---

  packGroupToIC() {
      const groupId = Array.from(this.selectedNodeIds).find(id => this.nodes.get(id)?.type === 'GROUP');
      if (!groupId) return;
      const groupNode = this.nodes.get(groupId);
      if (!groupNode) return;

      const internals = Array.from(this.nodes.values()).filter(n => n.groupId === groupId);
      const inputs = internals.filter(n => n.type === 'SWITCH').sort((a,b) => a.position.y - b.position.y);
      const outputs = internals.filter(n => n.type === 'LIGHT').sort((a,b) => a.position.y - b.position.y);

      if (inputs.length === 0 && outputs.length === 0) {
          alert("Group must contain Switches (Inputs) and Lights (Outputs) to convert.");
          return;
      }

      // Generate Logic Code
      const varMap = new Map<string, string>();
      internals.forEach(n => varMap.set(n.id, `v_${n.id.replace(/-/g, '_')}`));
      const lines: string[] = [];
      
      lines.push(`// Init`);
      internals.forEach(n => { if (n.type !== 'SWITCH') lines.push(`let ${varMap.get(n.id)} = 0;`); });
      lines.push(`for(let iter=0; iter<3; iter++) {`); // Stability Loop
      const internalWires = this.wires.filter(w => varMap.has(w.sourceNodeId) && varMap.has(w.targetNodeId));

      internals.forEach(n => {
          const v = varMap.get(n.id);
          if (n.type !== 'SWITCH') {
              const myInWires = internalWires.filter(w => w.targetNodeId === n.id).sort((a,b) => a.targetPinIndex - b.targetPinIndex);
              const getInVal = (idx: number) => {
                 const w = myInWires.find(wi => wi.targetPinIndex === idx);
                 if (w) {
                     const src = internals.find(x => x.id === w.sourceNodeId);
                     if (src?.type === 'SWITCH') return `(inputs[${inputs.indexOf(src)}] ? 1 : 0)`;
                     return varMap.get(w.sourceNodeId) || '0';
                 }
                 return '0';
              };

              let expr = '0';
              switch(n.type) {
                  case 'AND': expr = `((${getInVal(0)} + ${getInVal(1)}) == 2 ? 1 : 0)`; break; 
                  case 'OR':  expr = `((${getInVal(0)} + ${getInVal(1)}) > 0 ? 1 : 0)`; break; 
                  case 'NOT': expr = `(${getInVal(0)} == 0 ? 1 : 0)`; break;
                  case 'NAND':expr = `((${getInVal(0)} + ${getInVal(1)}) < 2 ? 1 : 0)`; break;
                  case 'XOR': expr = `(${getInVal(0)} != ${getInVal(1)} ? 1 : 0)`; break;
                  case 'BUFFER': expr = `${getInVal(0)}`; break;
                  case 'IC': expr = '0'; break; // Simplified for this request
                  default: expr = '0';
              }
              lines.push(`  ${v} = ${expr};`);
          }
      });
      lines.push(`}`); 

      const outList = outputs.map(o => {
          const w = internalWires.find(wi => wi.targetNodeId === o.id);
          if (w) {
              const src = internals.find(x => x.id === w.sourceNodeId);
               if (src?.type === 'SWITCH') return `(inputs[${inputs.indexOf(src)}] ? 1 : 0)`;
               return varMap.get(w.sourceNodeId) || '0';
          }
          return '0';
      });
      lines.push(`return [${outList.join(', ')}];`);
      const compiledFnBody = lines.join('\n');

      // Generate Equations
      const equations: string[] = [];
      const buildExpr = (node: LogicNode, visited: Set<string>): string => {
          if (visited.has(node.id)) return `[LOOP]`; 
          visited.add(node.id);
          if (node.type === 'SWITCH') return `IN${inputs.indexOf(node)}`;

          const myInWires = internalWires.filter(w => w.targetNodeId === node.id).sort((a,b) => a.targetPinIndex - b.targetPinIndex);
          const getSrcExpr = (idx: number) => {
              const w = myInWires.find(wi => wi.targetPinIndex === idx);
              if (!w) return '0';
              const src = internals.find(n => n.id === w.sourceNodeId);
              if (!src) return '0';
              return buildExpr(src, new Set(visited));
          };

          if (node.type === 'AND') return `((${getSrcExpr(0)} + ${getSrcExpr(1)}) == 2)`;
          if (node.type === 'OR') return `((${getSrcExpr(0)} + ${getSrcExpr(1)}) > 0)`;
          if (node.type === 'NOT') return `~${getSrcExpr(0)}`;
          if (node.type === 'XOR') return `(${getSrcExpr(0)} ^ ${getSrcExpr(1)})`;
          if (node.type === 'NAND') return `~((${getSrcExpr(0)} + ${getSrcExpr(1)}) == 2)`;
          if (node.type === 'BUFFER') return `${getSrcExpr(0)}`;
          return '?';
      };

      outputs.forEach((o, i) => {
         const w = internalWires.find(wi => wi.targetNodeId === o.id);
         let rhs = '0';
         if (w) {
             const src = internals.find(n => n.id === w.sourceNodeId);
             if (src) rhs = buildExpr(src, new Set());
         }
         equations.push(`OUT${i} = ${rhs}`);
      });

      // Create IC Node
      const storedNodes = internals.map(n => ({
          ...n,
          position: { x: n.position.x - groupNode.position.x, y: n.position.y - groupNode.position.y },
          groupId: undefined
      }));
      const storedWires = this.wires.filter(w => varMap.has(w.sourceNodeId) && varMap.has(w.targetNodeId));

      const icNode: LogicNode = {
          id: groupId,
          type: 'IC',
          position: groupNode.position,
          width: 100,
          height: Math.max(inputs.length, outputs.length) * 20 + 40,
          inputCount: inputs.length,
          outputCount: outputs.length,
          inputs: new Array(inputs.length).fill(false),
          outputs: new Array(outputs.length).fill(false),
          label: groupNode.label || 'Chip',
          ioMap: {
              inputs: inputs.map((n, i) => n.label || `In ${i}`),
              outputs: outputs.map((n, i) => n.label || `Out ${i}`)
          },
          compiledFunction: compiledFnBody,
          equations: equations,
          internals: { nodes: storedNodes, wires: storedWires }
      };

      internals.forEach(n => this.nodes.delete(n.id));
      this.nodes.delete(groupId);
      this.wires = this.wires.filter(w => !varMap.has(w.sourceNodeId) && !varMap.has(w.targetNodeId));

      this.nodes.set(icNode.id, icNode);
      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(icNode.id);
      this.triggerUpdate();
  }

  unpackICToGroup() {
      const icId = Array.from(this.selectedNodeIds).find(id => this.nodes.get(id)?.type === 'IC');
      if (!icId) return;
      const icNode = this.nodes.get(icId);
      if (!icNode || !icNode.internals) return;

      const { nodes: storedNodes, wires: storedWires } = icNode.internals;
      const groupId = generateId();
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      storedNodes.forEach(n => {
          const dims = this.getNodeDimensions(n);
          minX = Math.min(minX, n.position.x - dims.w/2);
          minY = Math.min(minY, n.position.y - dims.h/2);
          maxX = Math.max(maxX, n.position.x + dims.w/2);
          maxY = Math.max(maxY, n.position.y + dims.h/2);
      });
      const groupPadding = 40;
      const groupW = (maxX - minX) + groupPadding*2;
      const groupH = (maxY - minY) + groupPadding*2;

      this.nodes.set(groupId, {
          id: groupId, type: 'GROUP',
          position: icNode.position,
          width: groupW, height: groupH,
          inputs: [], outputs: [],
          label: icNode.label || 'Unpacked'
      });

      const idMap = new Map<string, string>();
      storedNodes.forEach(n => {
          const newId = generateId();
          idMap.set(n.id, newId);
          this.nodes.set(newId, {
              ...n, id: newId, groupId: groupId,
              position: { x: icNode.position.x + n.position.x, y: icNode.position.y + n.position.y },
              inputs: [...n.inputs], outputs: [...n.outputs]
          });
      });

      storedWires.forEach(w => {
          if (idMap.has(w.sourceNodeId) && idMap.has(w.targetNodeId)) {
              this.wires.push({
                  ...w, id: generateId(),
                  sourceNodeId: idMap.get(w.sourceNodeId)!,
                  targetNodeId: idMap.get(w.targetNodeId)!,
                  state: false
              });
          }
      });

      this.nodes.delete(icId);
      this.fnCache.delete(icId);
      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(groupId);
      this.nodes.forEach(n => { if (n.groupId === groupId) this.selectedNodeIds.add(n.id); });
      this.triggerUpdate();
  }

  triggerUpdate() {
    this.onUpdateUI();
    if (this.selectedNodeIds.size === 1) {
      const id = this.selectedNodeIds.values().next().value;
      this.onSelectionChange(this.nodes.get(id) || null);
    } else {
      this.onSelectionChange(null);
    }
  }

  // --- Simulation & Rendering ---
  
  getInputCount(type: NodeType, node?: LogicNode): number {
    if (type === 'IC' && node && node.inputCount !== undefined) return node.inputCount;
    switch(type) {
      case 'NOT': case 'BUFFER': case 'LIGHT': return 1;
      case 'SWITCH': case 'CLOCK': return 0;
      case 'GROUP': return 0;
      default: return 2;
    }
  }

  getOutputCount(type: NodeType, node?: LogicNode): number {
    if (type === 'IC' && node && node.outputCount !== undefined) return node.outputCount;
    return (type === 'LIGHT' || type === 'GROUP') ? 0 : 1;
  }

  tick(timestamp: number) {
    if (!this.isRunning && timestamp !== -1) return;
    if (timestamp !== -1 && timestamp - this.lastTick < this.tickRate) return;
    this.lastTick = timestamp;
    this.tickCount++;

    this.nodes.forEach(node => {
      if (node.type === 'CLOCK') node.outputs[0] = Math.floor(this.tickCount / 5) % 2 === 0;
    });
    this.nodes.forEach(node => {
      if (node.type !== 'SWITCH' && node.type !== 'CLOCK') node.inputs.fill(false);
    });
    this.wires.forEach(wire => {
      const source = this.nodes.get(wire.sourceNodeId);
      const target = this.nodes.get(wire.targetNodeId);
      if (source && target) {
        const val = source.outputs[wire.sourcePinIndex] || false;
        wire.state = val;
        target.inputs[wire.targetPinIndex] = val;
      }
    });
    this.nodes.forEach(node => {
      const i = node.inputs;
      switch (node.type) {
        case 'AND': node.outputs[0] = i[0] && i[1]; break;
        case 'OR': node.outputs[0] = i[0] || i[1]; break;
        case 'NOT': node.outputs[0] = !i[0]; break;
        case 'NAND': node.outputs[0] = !(i[0] && i[1]); break;
        case 'XOR': node.outputs[0] = (!!i[0] !== !!i[1]); break;
        case 'BUFFER': node.outputs[0] = i[0]; break;
        case 'IC': {
            if (node.compiledFunction) {
                let fn = this.fnCache.get(node.id);
                if (!fn) {
                    try { fn = new Function('inputs', node.compiledFunction); this.fnCache.set(node.id, fn); } 
                    catch (e) { console.error(e); }
                }
                if (fn) node.outputs = fn(i).map((v: number) => v === 1);
            } else if (node.truthTable) {
                const key = i.map(b => b ? '1' : '0').join('');
                if(node.truthTable[key]) node.outputs = node.truthTable[key].map(bit => bit === 1);
            }
            break;
        }
      }
    });
  }

  toggleSwitch(nodeId: string) {
    const node = this.nodes.get(nodeId);
    if (node && node.type === 'SWITCH') {
      node.outputs[0] = !node.outputs[0];
      this.tick(-1); 
    }
  }

  getNodeDimensions(node: LogicNode) {
     if (node.type === 'BUFFER' || node.type === 'NOT') return { w: 40, h: 30 };
     if (node.type === 'GROUP' || node.type === 'IC') return { w: node.width || 100, h: node.height || 100 };
     return { w: DEF_GATE_W, h: DEF_GATE_H };
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(this.viewport.x, this.viewport.y);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);

    this.drawGrid(ctx, width, height);
    this.nodes.forEach(node => { if (node.type === 'GROUP') this.drawNode(ctx, node); });
    this.drawWires(ctx);
    this.drawTempWire(ctx);
    this.nodes.forEach(node => { if (node.type !== 'GROUP') this.drawNode(ctx, node); });

    if (this.interactionMode === 'SELECT_AREA') {
        const x = Math.min(this.selectionStart.x, this.selectionCurrent.x);
        const y = Math.min(this.selectionStart.y, this.selectionCurrent.y);
        const w = Math.abs(this.selectionStart.x - this.selectionCurrent.x);
        const h = Math.abs(this.selectionStart.y - this.selectionCurrent.y);
        ctx.fillStyle = COLORS.selectionFill;
        ctx.strokeStyle = COLORS.selectionBorder;
        ctx.lineWidth = 1 / this.viewport.zoom;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }

    ctx.restore();
    this.drawMinimap(ctx, width, height);
  }

  drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number) {
     const mapW = 150; const mapH = 100; const margin = 20;
     const mapX = w - mapW - margin; const mapY = h - mapH - margin;
     ctx.fillStyle = COLORS.minimapBg; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
     ctx.fillRect(mapX, mapY, mapW, mapH); ctx.strokeRect(mapX, mapY, mapW, mapH);
     let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
     this.nodes.forEach(n => {
         minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
         maxX = Math.max(maxX, n.position.x); maxY = Math.max(maxY, n.position.y);
     });
     const pad = 500; 
     minX = Math.min(minX - pad, -this.viewport.x / this.viewport.zoom);
     minY = Math.min(minY - pad, -this.viewport.y / this.viewport.zoom);
     maxX = Math.max(maxX + pad, (-this.viewport.x + w) / this.viewport.zoom);
     maxY = Math.max(maxY + pad, (-this.viewport.y + h) / this.viewport.zoom);
     const worldW = maxX - minX; const worldH = maxY - minY;
     const scale = Math.min(mapW / worldW, mapH / worldH);
     const transformToMap = (wx: number, wy: number) => ({
         x: mapX + (wx - minX) * scale + (mapW - worldW * scale) / 2,
         y: mapY + (wy - minY) * scale + (mapH - worldH * scale) / 2
     });
     ctx.fillStyle = COLORS.minimapNode;
     this.nodes.forEach(n => { const p = transformToMap(n.position.x, n.position.y); ctx.fillRect(p.x - 2, p.y - 1, 4, 3); });
     const vx = -this.viewport.x / this.viewport.zoom; const vy = -this.viewport.y / this.viewport.zoom;
     const vw = w / this.viewport.zoom; const vh = h / this.viewport.zoom;
     const vp1 = transformToMap(vx, vy); const vp2 = transformToMap(vx + vw, vy + vh); 
     ctx.fillStyle = COLORS.minimapView; ctx.strokeStyle = COLORS.nodeSelected; ctx.lineWidth = 1;
     ctx.fillRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y); ctx.strokeRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y);
  }

  drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const { x, y, zoom } = this.viewport;
    const startX = Math.floor(-x / zoom / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(-y / zoom / GRID_SIZE) * GRID_SIZE;
    const endX = startX + (width / zoom) + GRID_SIZE;
    const endY = startY + (height / zoom) + GRID_SIZE;
    ctx.beginPath(); ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / zoom;
    for (let gx = startX; gx < endX; gx += GRID_SIZE) { ctx.moveTo(gx, startY); ctx.lineTo(gx, endY); }
    for (let gy = startY; gy < endY; gy += GRID_SIZE) { ctx.moveTo(startX, gy); ctx.lineTo(endX, gy); }
    ctx.stroke();
  }

  drawWires(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    this.wires.forEach(wire => {
      const source = this.nodes.get(wire.sourceNodeId);
      const target = this.nodes.get(wire.targetNodeId);
      if (!source || !target) return;
      const p1 = this.getPinPos(source, wire.sourcePinIndex, 'output');
      const p2 = this.getPinPos(target, wire.targetPinIndex, 'input');
      const onColor = source.color || COLORS.wireOn;
      const offColor = source.color || COLORS.wireOff;
      ctx.strokeStyle = wire.state ? onColor : offColor;
      ctx.globalAlpha = (wire.state || !source.color) ? 1.0 : 0.3;
      ctx.beginPath();
      const midX = (p1.x + p2.x) / 2;
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(midX, p1.y, midX, p2.y, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  }

  drawTempWire(ctx: CanvasRenderingContext2D) {
    if (this.interactionMode !== 'WIRING' || !this.wiringStart) return;
    const startNode = this.nodes.get(this.wiringStart.nodeId);
    if (!startNode) return;
    const startPos = this.getPinPos(startNode, this.wiringStart.index, this.wiringStart.type);
    let endPos = this.mouseWorld;
    if (this.hoveredPin && this.hoveredPin.type !== this.wiringStart.type && this.hoveredPin.nodeId !== this.wiringStart.nodeId) {
       const endNode = this.nodes.get(this.hoveredPin.nodeId);
       if (endNode) endPos = this.getPinPos(endNode, this.hoveredPin.index, this.hoveredPin.type);
    }
    ctx.beginPath(); ctx.moveTo(startPos.x, startPos.y);
    const midX = (startPos.x + endPos.x) / 2;
    ctx.bezierCurveTo(midX, startPos.y, midX, endPos.y, endPos.x, endPos.y);
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  drawNode(ctx: CanvasRenderingContext2D, node: LogicNode) {
    const { x, y } = node.position;
    const isSelected = this.selectedNodeIds.has(node.id);
    const dims = this.getNodeDimensions(node);
    const w = dims.w; const h = dims.h;

    ctx.save(); ctx.translate(x, y);

    if (node.type === 'GROUP') {
        ctx.fillStyle = COLORS.groupBody; ctx.strokeStyle = isSelected ? COLORS.nodeSelected : COLORS.groupBorder;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isSelected ? COLORS.nodeSelected : '#666';
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(node.label || 'Group', -w/2 + 10, -h/2 + 10);
        ctx.restore(); return;
    }

    if (node.type === 'IC') {
        if (isSelected) { ctx.strokeStyle = COLORS.nodeSelected; ctx.lineWidth = 3; ctx.strokeRect(-w/2 - 4, -h/2 - 4, w + 8, h + 8); }
        ctx.fillStyle = COLORS.icBody; ctx.strokeStyle = COLORS.icBorder; ctx.lineWidth = 2;
        ctx.fillRect(-w/2, -h/2, w, h); ctx.strokeRect(-w/2, -h/2, w, h);
        ctx.fillStyle = COLORS.text; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(node.label || 'IC', 0, -h/2 + 5);
        this.drawPins(ctx, node);
        ctx.font = '10px monospace'; ctx.fillStyle = '#aaa';
        if (node.ioMap) {
            node.ioMap.inputs.forEach((lbl, i) => {
                const p = this.getPinLocalPos(i, node.inputCount!, 'input', node);
                ctx.textAlign = 'left'; ctx.fillText(lbl, p.x + 8, p.y + 3);
            });
            node.ioMap.outputs.forEach((lbl, i) => {
                const p = this.getPinLocalPos(i, node.outputCount!, 'output', node);
                ctx.textAlign = 'right'; ctx.fillText(lbl, p.x - 8, p.y + 3);
            });
        }
        ctx.restore(); return;
    }

    if (isSelected) { ctx.strokeStyle = COLORS.nodeSelected; ctx.lineWidth = 3; ctx.strokeRect(-w/2 - 5, -h/2 - 5, w + 10, h + 10); }
    ctx.fillStyle = COLORS.nodeBody; ctx.strokeStyle = COLORS.nodeBorder; ctx.lineWidth = 2;
    this.drawShape(ctx, node); ctx.fill(); ctx.stroke();
    this.drawPins(ctx, node);

    ctx.fillStyle = COLORS.text; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    if (node.type === 'SWITCH' || node.type === 'LIGHT' || node.type === 'BUFFER' || node.type === 'NOT') {
        ctx.textBaseline = 'bottom'; ctx.fillText(node.type, 0, -h/2 - 5);
    } else {
        ctx.textBaseline = 'middle'; ctx.fillText(node.type, 0, 0);
    }
    
    if (node.label) {
        ctx.font = '10px sans-serif'; ctx.fillStyle = '#e5e7eb'; ctx.textBaseline = 'top'; ctx.fillText(node.label, 0, h/2 + 5);
    }
    if (node.type === 'LIGHT') {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = node.inputs[0] ? '#ff4444' : '#330000'; ctx.fill();
      if (node.inputs[0]) { ctx.strokeStyle = '#ff8888'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (node.type === 'SWITCH') {
      ctx.fillStyle = node.outputs[0] ? '#4ade80' : '#111';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.strokeRect(-8, -8, 16, 16);
    }
    ctx.restore();
  }

  drawShape(ctx: CanvasRenderingContext2D, node: LogicNode) {
    const dims = this.getNodeDimensions(node);
    const w = dims.w; const h = dims.h;
    const hw = w/2; const hh = h/2;
    ctx.beginPath();
    switch (node.type) {
      case 'AND': case 'NAND':
        ctx.moveTo(-hw, -hh); ctx.lineTo(0, -hh); ctx.arc(0, 0, hh, -Math.PI/2, Math.PI/2); ctx.lineTo(-hw, hh); ctx.closePath();
        if (node.type === 'NAND') { ctx.moveTo(hw+5,0); ctx.arc(hw+5,0,3,0,Math.PI*2); }
        break;
      case 'OR': case 'XOR':
        ctx.moveTo(-hw, -hh); ctx.quadraticCurveTo(0, -hh, hw, 0); ctx.quadraticCurveTo(0, hh, -hw, hh); ctx.quadraticCurveTo(-hw/2, 0, -hw, -hh); ctx.closePath();
        break;
      case 'NOT': case 'BUFFER':
        ctx.moveTo(-hw, -hh); ctx.lineTo(hw, 0); ctx.lineTo(-hw, hh); ctx.closePath();
        if (node.type === 'NOT') { ctx.moveTo(hw+5,0); ctx.arc(hw+5,0,3,0,Math.PI*2); }
        break;
      default: ctx.rect(-hw, -hh, w, h);
    }
  }

  drawPins(ctx: CanvasRenderingContext2D, node: LogicNode) {
    const inCount = this.getInputCount(node.type, node);
    const outCount = this.getOutputCount(node.type, node);
    for (let i = 0; i < inCount; i++) {
      const p = this.getPinLocalPos(i, inCount, 'input', node);
      this.drawSinglePin(ctx, p.x, p.y, node.id, i, 'input');
    }
    for (let i = 0; i < outCount; i++) {
      const p = this.getPinLocalPos(i, outCount, 'output', node);
      this.drawSinglePin(ctx, p.x, p.y, node.id, i, 'output');
    }
  }

  drawSinglePin(ctx: CanvasRenderingContext2D, x: number, y: number, nodeId: string, index: number, type: 'input'|'output') {
    ctx.beginPath(); ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
    const isHovered = this.hoveredPin && this.hoveredPin.nodeId === nodeId && this.hoveredPin.index === index && this.hoveredPin.type === type;
    const isSnapTarget = this.interactionMode === 'WIRING' && this.wiringStart && this.wiringStart.nodeId !== nodeId && this.wiringStart.type !== type && isHovered;
    if (isHovered || isSnapTarget) { ctx.fillStyle = COLORS.pinHover; ctx.strokeStyle = COLORS.wireOn; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); } 
    else { ctx.fillStyle = COLORS.pin; ctx.fill(); }
  }

  screenToWorld(x: number, y: number): Vector2 {
    return { x: (x - this.viewport.x) / this.viewport.zoom, y: (y - this.viewport.y) / this.viewport.zoom };
  }

  getPinLocalPos(index: number, count: number, type: 'input'|'output', node?: LogicNode): Vector2 {
    const dims = node ? this.getNodeDimensions(node) : { w: DEF_GATE_W, h: DEF_GATE_H };
    const w = dims.w; const h = dims.h;
    const y = ((index + 1) / (count + 1)) * h - h/2;
    const x = type === 'input' ? -w/2 : w/2;
    return { x, y };
  }

  getPinPos(node: LogicNode, index: number, type: 'input'|'output'): Vector2 {
    const count = type === 'input' ? this.getInputCount(node.type, node) : this.getOutputCount(node.type, node);
    const local = this.getPinLocalPos(index, count, type, node);
    return { x: node.position.x + local.x, y: node.position.y + local.y };
  }

  findPinAt(pos: Vector2): Pin | null {
    let closest: Pin | null = null; let minDst = HIT_RADIUS; 
    this.nodes.forEach(node => {
      const inCount = this.getInputCount(node.type, node);
      for(let i=0; i<inCount; i++) {
        const p = this.getPinPos(node, i, 'input');
        const dst = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (dst < minDst) { minDst = dst; closest = { id: `${node.id}-in-${i}`, nodeId: node.id, type: 'input', index: i, value: false }; }
      }
      const outCount = this.getOutputCount(node.type, node);
      for(let i=0; i<outCount; i++) {
        const p = this.getPinPos(node, i, 'output');
        const dst = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (dst < minDst) { minDst = dst; closest = { id: `${node.id}-out-${i}`, nodeId: node.id, type: 'output', index: i, value: false }; }
      }
    });
    return closest;
  }

  findNodeAt(pos: Vector2): string | null {
    const nodes = Array.from(this.nodes.values()).reverse();
    for (const node of nodes) {
      const dims = this.getNodeDimensions(node);
      const w = dims.w; const h = dims.h;
      if (pos.x >= node.position.x - w/2 && pos.x <= node.position.x + w/2 && pos.y >= node.position.y - h/2 && pos.y <= node.position.y + h/2) return node.id;
    }
    return null;
  }
}

/**
 * ==========================================
 * REACT UI COMPONENTS
 * ==========================================
 */

const ToolbarBtn = ({ icon: Icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`p-3 rounded-xl mb-3 flex flex-col items-center justify-center w-16 h-16 transition-all ${active ? 'bg-blue-600 shadow-lg shadow-blue-900/50 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
    <Icon size={24} strokeWidth={1.5} />
    <span className="text-[10px] mt-1 font-medium text-center leading-tight">{label}</span>
  </button>
);

const LogicEquation = ({ node }: { node: LogicNode }) => {
  const i = node.inputs;
  const o = node.outputs;
  const toBit = (b: boolean) => b ? '1' : '0';
  const color = (b: boolean) => b ? 'text-green-400' : 'text-gray-500';

  let equation = <div>Unknown</div>;

  switch(node.type) {
    case 'AND': 
        equation = <div className="font-mono text-lg"><span className={color(i[0])}>{toBit(i[0])}</span> & <span className={color(i[1])}>{toBit(i[1])}</span> = <span className={color(o[0])}>{toBit(o[0])}</span></div>;
        break;
    case 'OR':
        equation = <div className="font-mono text-lg"><span className={color(i[0])}>{toBit(i[0])}</span> | <span className={color(i[1])}>{toBit(i[1])}</span> = <span className={color(o[0])}>{toBit(o[0])}</span></div>;
        break;
    case 'NOT':
        equation = <div className="font-mono text-lg">! <span className={color(i[0])}>{toBit(i[0])}</span> = <span className={color(o[0])}>{toBit(o[0])}</span></div>;
        break;
    case 'XOR':
        equation = <div className="font-mono text-lg"><span className={color(i[0])}>{toBit(i[0])}</span> ^ <span className={color(i[1])}>{toBit(i[1])}</span> = <span className={color(o[0])}>{toBit(o[0])}</span></div>;
        break;
    case 'SWITCH':
        equation = <div className="font-mono text-lg">STATE: <span className={color(o[0])}>{o[0] ? 'ON' : 'OFF'}</span></div>;
        break;
    case 'GROUP':
        equation = <div className="font-mono text-sm text-gray-400">Container Group</div>;
        break;
    case 'IC':
        if (node.equations && node.equations.length > 0) {
            equation = (
                <div className="font-mono text-xs overflow-auto max-h-40">
                    <div className="text-blue-400 mb-1">OPTIMIZED EQUATIONS</div>
                    {node.equations.map((eq, idx) => (
                        <div key={idx} className="whitespace-pre-wrap mb-1 text-gray-300">{eq}</div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-gray-700 text-gray-500">
                        IN: {i.map(toBit).join('')} &rarr; OUT: {o.map(toBit).join('')}
                    </div>
                </div>
            );
        } else {
            const inputBits = i.map(toBit).join('');
            const outputBits = o.map(toBit).join('');
            equation = (
                <div className="font-mono text-base">
                    <div className="text-gray-500 text-xs mb-1">TRUTH TABLE LOOKUP</div>
                    <span className="text-blue-400">IN[{inputBits}]</span>
                    <span className="text-gray-500"> &rarr; </span>
                    <span className={o.some(x=>x) ? 'text-green-400' : 'text-gray-500'}>OUT[{outputBits}]</span>
                </div>
            );
        }
        break;
    default:
        equation = <div className="font-mono text-sm text-gray-500">I: {JSON.stringify(i.map(toBit))} <br/> O: {JSON.stringify(o.map(toBit))}</div>
  }

  return (
    <div className="bg-black/40 p-3 rounded-lg border border-gray-800">
        <div className="text-xs text-gray-500 mb-2 flex items-center"><Terminal size={12} className="mr-1"/> DEBUG STATE</div>
        {equation}
    </div>
  );
}

const ContextMenu = ({ x, y, onDelete, onDuplicate, onGroup, onUngroup, onPack, onUnpack, onSaveToLibrary, hasSelection, hasGroup, isIC }: any) => {
  return (
    <div 
      className="fixed bg-[#1f2937] border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col w-48 overflow-hidden"
      style={{ left: x, top: y }}
    >
      <button onClick={onDuplicate} disabled={!hasSelection} className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50">
        <Files size={14} className="mr-2"/> Duplicate
      </button>
      
      <div className="h-px bg-gray-700 my-1"/>
      
      <button onClick={onGroup} disabled={!hasSelection} className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50">
        <BoxSelect size={14} className="mr-2"/> Group Selection
      </button>
      <button onClick={onUngroup} disabled={!hasGroup} className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50">
        <Ungroup size={14} className="mr-2"/> Ungroup
      </button>

      <button onClick={onPack} disabled={!hasGroup} className="flex items-center px-4 py-2 hover:bg-purple-600 hover:text-white text-purple-300 text-sm text-left disabled:opacity-50">
        <Package size={14} className="mr-2"/> Pack to Component
      </button>
      
      <button onClick={onUnpack} disabled={!isIC} className="flex items-center px-4 py-2 hover:bg-purple-600 hover:text-white text-purple-300 text-sm text-left disabled:opacity-50">
        <Box size={14} className="mr-2"/> Unpack Component
      </button>
      
      <button onClick={onSaveToLibrary} disabled={!isIC} className="flex items-center px-4 py-2 hover:bg-green-600 hover:text-white text-green-400 text-sm text-left disabled:opacity-50">
        <Save size={14} className="mr-2"/> Save to Library
      </button>

      <div className="h-px bg-gray-700 my-1"/>

      <button onClick={onDelete} className="flex items-center px-4 py-2 hover:bg-red-600 hover:text-white text-red-400 text-sm text-left">
        <Trash2 size={14} className="mr-2"/> Delete
      </button>
    </div>
  );
}

export default function LogicSimApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CircuitEngine>(new CircuitEngine());
  
  // Tailwind Loader - Polyfill & CDN
  useLayoutEffect(() => {
    // 1. Ensure global tailwind object exists immediately
    if (typeof window !== 'undefined' && !(window as any).tailwind) {
        (window as any).tailwind = { config: {} };
    }
    // 2. Load CDN if missing
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // --- FIREBASE STATE ---
  const [user, setUser] = useState<any>(null);
  const [library, setLibrary] = useState<any[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<Partial<LogicNode> | null>(null);

  // 1. Auth
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Fetch Library
  useEffect(() => {
    if (!user || !db) return;
    // We store components in a private collection for the user
    // Path: artifacts/{appId}/users/{uid}/components
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'components'));
    
    // Safety check for errors
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLibrary(items);
    }, (error) => {
        console.error("Library sync error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Save Function
  const saveToLibrary = async (node: LogicNode) => {
      if (!user || !db) {
          alert("Storage not available");
          return;
      }
      
      const rawData = {
          name: node.label || 'Untitled Chip',
          createdAt: Date.now(),
          // Store all properties needed to reconstruct
          inputCount: node.inputCount ?? 0, // Fallback to 0 or null to avoid undefined
          outputCount: node.outputCount ?? 0,
          width: node.width ?? 100,
          height: node.height ?? 100,
          truthTable: node.truthTable || null,
          ioMap: node.ioMap || null,
          compiledFunction: node.compiledFunction || null,
          equations: node.equations || null,
          internals: node.internals || null 
      };

      // CRITICAL: Firestore crashes if any value is explicitly `undefined`.
      // JSON.stringify strips undefined keys, making it safe for Firestore.
      const componentData = JSON.parse(JSON.stringify(rawData));

      try {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'components'), componentData);
          setIsLibraryOpen(true); // Open panel to confirm
      } catch (e) {
          console.error("Save error", e);
          alert("Failed to save to library. Check console for details.");
      }
  };

  const deleteFromLibrary = async (id: string) => {
      if (!user || !db) return;
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'components', id));
  };


  const [tool, setTool] = useState<NodeType | 'SELECT'>('SELECT');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(100);
  const [stats, setStats] = useState({ nodes: 0, tick: 0 });
  const [selectedNode, setSelectedNode] = useState<LogicNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    engineRef.current.onUpdateUI = () => setStats(prev => ({ ...prev, nodes: engineRef.current.nodes.size }));
    engineRef.current.onSelectionChange = (node) => setSelectedNode(node ? { ...node } : null);
    engineRef.current.triggerUpdate();
  }, []);

  useEffect(() => {
    engineRef.current.isRunning = isPlaying;
    engineRef.current.tickRate = speed;
  }, [isPlaying, speed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        engineRef.current.deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const engine = engineRef.current;

    const loop = (time: number) => {
      const parent = canvas.parentElement;
      if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }

      engine.tick(time);
      if (engine.tickCount % 5 === 0) {
         setStats(s => ({ ...s, tick: engine.tickCount }));
         if (engine.selectedNodeIds.size === 1) {
             const id = engine.selectedNodeIds.values().next().value;
             setSelectedNode(prev => prev ? { ...engine.nodes.get(id)! } : null);
         }
      }
      engine.render(ctx, canvas.width, canvas.height);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // --- Interaction Handlers ---

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const engine = engineRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setContextMenu(null); 
    
    // Middle Mouse -> Pan
    if (e.button === 1) {
      engine.interactionMode = 'PAN';
      engine.dragStart = { x, y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    
    if (e.button === 2) return;

    canvas.setPointerCapture(e.pointerId);
    
    const worldPos = engine.screenToWorld(x, y);

    // 1. Check Pin
    const pin = engine.findPinAt(worldPos);
    if (pin) {
      if (pin.type === 'output') {
        engine.wiringStart = pin;
        engine.interactionMode = 'WIRING';
        return;
      }
    }

    // 2. Check Node
    const nodeId = engine.findNodeAt(worldPos);
    if (nodeId) {
      if (engine.nodes.get(nodeId)?.type === 'SWITCH') {
        engine.toggleSwitch(nodeId);
        return;
      }

      if (!e.shiftKey && !engine.selectedNodeIds.has(nodeId)) {
        engine.selectedNodeIds.clear();
      }
      engine.selectedNodeIds.add(nodeId);
      
      const clickedNode = engine.nodes.get(nodeId);
      if (clickedNode?.type === 'GROUP') {
          engine.nodes.forEach(n => {
              if (n.groupId === nodeId) engine.selectedNodeIds.add(n.id);
          });
      }

      engine.interactionMode = 'DRAG_NODE';
      engine.dragStart = worldPos;
      
      engine.dragOffset.clear();
      engine.selectedNodeIds.forEach(id => {
        const n = engine.nodes.get(id);
        if (n) {
          engine.dragOffset.set(id, { x: n.position.x - worldPos.x, y: n.position.y - worldPos.y });
        }
      });
      engine.triggerUpdate();
      return;
    }

    // 3. Add / Pan / Select
    if (tool !== 'SELECT') {
      // Pass activeTemplate if inserting IC
      engine.addNode(tool, worldPos, tool === 'IC' && activeTemplate ? activeTemplate : undefined);
      
      // If we just placed a template, maybe deselect it to return to normal select? 
      // Or keep placing? Let's keep placing.
    } else {
      if (e.shiftKey || tool === 'SELECT') {
          engine.interactionMode = 'SELECT_AREA';
          engine.selectionStart = worldPos;
          engine.selectionCurrent = worldPos;
          engine.selectedNodeIds.clear();
      } else {
          engine.interactionMode = 'PAN';
          engine.dragStart = { x, y };
      }
      engine.triggerUpdate();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = engine.screenToWorld(x, y);

    engine.mouseWorld = worldPos;
    engine.hoveredPin = engine.findPinAt(worldPos);

    if (engine.interactionMode === 'DRAG_NODE') {
        engine.selectedNodeIds.forEach(id => {
          const node = engine.nodes.get(id);
          const offset = engine.dragOffset.get(id);
          if (node && offset) {
             let nx = worldPos.x + offset.x;
             let ny = worldPos.y + offset.y;
             nx = Math.round(nx / 10) * 10;
             ny = Math.round(ny / 10) * 10;
             node.position = { x: nx, y: ny };
          }
        });
    }
    else if (engine.interactionMode === 'SELECT_AREA') {
        engine.selectionCurrent = worldPos;
    }
    else if (engine.interactionMode === 'PAN') {
        const dx = x - engine.dragStart.x;
        const dy = y - engine.dragStart.y;
        engine.viewport.x += dx;
        engine.viewport.y += dy;
        engine.dragStart = { x, y };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    if(canvasRef.current) canvasRef.current.releasePointerCapture(e.pointerId);

    if (engine.interactionMode === 'WIRING' && engine.wiringStart) {
       const target = engine.hoveredPin;
       if (target && target.type === 'input' && target.nodeId !== engine.wiringStart.nodeId) {
         engine.wires.push({
           id: generateId(),
           sourceNodeId: engine.wiringStart.nodeId,
           sourcePinIndex: engine.wiringStart.index,
           targetNodeId: target.nodeId,
           targetPinIndex: target.index,
           state: false
         });
         engine.tick(-1);
       }
       engine.wiringStart = null;
    }
    else if (engine.interactionMode === 'SELECT_AREA') {
        const x1 = Math.min(engine.selectionStart.x, engine.selectionCurrent.x);
        const y1 = Math.min(engine.selectionStart.y, engine.selectionCurrent.y);
        const x2 = Math.max(engine.selectionStart.x, engine.selectionCurrent.x);
        const y2 = Math.max(engine.selectionStart.y, engine.selectionCurrent.y);
        
        engine.selectedNodeIds.clear();
        engine.nodes.forEach(node => {
            if (node.position.x >= x1 && node.position.x <= x2 &&
                node.position.y >= y1 && node.position.y <= y2) {
                engine.selectedNodeIds.add(node.id);
            }
        });
        engine.triggerUpdate();
    }
    
    engine.interactionMode = 'NONE';
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = engineRef.current.screenToWorld(x, y);
    
    const nodeId = engineRef.current.findNodeAt(worldPos);
    if (nodeId) {
       if (!engineRef.current.selectedNodeIds.has(nodeId)) {
           engineRef.current.selectedNodeIds.clear();
           engineRef.current.selectedNodeIds.add(nodeId);
           engineRef.current.triggerUpdate();
       }
    }
    
    let hasGroup = false;
    let isIC = false;
    engineRef.current.selectedNodeIds.forEach(id => {
        const type = engineRef.current.nodes.get(id)?.type;
        if(type === 'GROUP') hasGroup = true;
        if(type === 'IC') isIC = true;
    });

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const engine = engineRef.current;
    const zoomSensitivity = 0.001;
    engine.viewport.zoom = Math.max(0.2, Math.min(3, engine.viewport.zoom - e.deltaY * zoomSensitivity));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedNode) {
        engineRef.current.updateNodeData(selectedNode.id, { label: e.target.value });
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedNode) {
        engineRef.current.updateNodeData(selectedNode.id, { color: e.target.value });
    }
  };

  const handleIOLabelChange = (type: 'input'|'output', index: number, value: string) => {
      if (selectedNode && selectedNode.ioMap) {
          const map = { ...selectedNode.ioMap };
          if (type === 'input') map.inputs[index] = value;
          else map.outputs[index] = value;
          engineRef.current.updateNodeData(selectedNode.id, { ioMap: map });
      }
  }

  // Handle Save
  const handleSaveNode = () => {
      if(selectedNode) saveToLibrary(selectedNode);
      setContextMenu(null);
  }

  // Handle Select from Library
  const handleSelectFromLibrary = (item: any) => {
      // Map item back to LogicNode partial
      const template: Partial<LogicNode> = {
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
      setActiveTemplate(template);
      setTool('IC');
  }

  return (
    <div className="flex h-screen bg-[#111] text-gray-100 font-sans overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      
      {/* LEFT TOOLBAR */}
      <div className="w-24 bg-[#18181a] border-r border-gray-800 flex flex-col items-center py-6 overflow-y-auto scrollbar-none shadow-xl z-10">
        <div className="mb-6 font-black text-2xl tracking-tighter text-blue-500">SIM</div>
        
        <ToolbarBtn icon={MousePointer2} label="Select" active={tool === 'SELECT'} onClick={() => { setTool('SELECT'); setActiveTemplate(null); }} />
        <div className="w-12 h-px bg-gray-700 my-4" />
        
        <ToolbarBtn icon={Book} label="Library" active={isLibraryOpen} onClick={() => setIsLibraryOpen(!isLibraryOpen)} />

        <div className="w-12 h-px bg-gray-700 my-4" />

        <ToolbarBtn icon={ToggleLeft} label="Switch" active={tool === 'SWITCH'} onClick={() => setTool('SWITCH')} />
        <ToolbarBtn icon={Lightbulb} label="Light" active={tool === 'LIGHT'} onClick={() => setTool('LIGHT')} />
        <ToolbarBtn icon={Activity} label="Clock" active={tool === 'CLOCK'} onClick={() => setTool('CLOCK')} />
        
        <div className="w-12 h-px bg-gray-700 my-4" />
        
        <ToolbarBtn icon={Cpu} label="AND" active={tool === 'AND'} onClick={() => setTool('AND')} />
        <ToolbarBtn icon={Cpu} label="OR" active={tool === 'OR'} onClick={() => setTool('OR')} />
        <ToolbarBtn icon={Cpu} label="NOT" active={tool === 'NOT'} onClick={() => setTool('NOT')} />
        <ToolbarBtn icon={ArrowRight} label="Buffer" active={tool === 'BUFFER'} onClick={() => setTool('BUFFER')} />
      </div>

      {/* LIBRARY DRAWER */}
      {isLibraryOpen && (
          <div className="w-64 bg-[#18181a] border-r border-gray-800 flex flex-col p-4 shadow-xl z-20 overflow-y-auto">
              <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center"><Book size={16} className="mr-2"/> SAVED CHIPS</h2>
              {library.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-8">Library is empty.<br/>Right-click a packed chip to save it.</div>
              ) : (
                  <div className="space-y-2">
                      {library.map((item) => (
                          <div key={item.id} 
                               className={`p-3 rounded bg-gray-800 border hover:border-blue-500 cursor-pointer group flex items-center justify-between ${activeTemplate?.label === item.name && tool === 'IC' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700'}`}
                               onClick={() => handleSelectFromLibrary(item)}>
                              <div>
                                  <div className="font-bold text-sm text-gray-200">{item.name}</div>
                                  <div className="text-xs text-gray-500">{item.inputCount} IN / {item.outputCount} OUT</div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteFromLibrary(item.id); }}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1"
                              >
                                  <Trash2 size={14}/>
                              </button>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )}

      {/* CANVAS */}
      <div className="flex-1 flex flex-col relative bg-[#0f0f0f]">
        
        {/* HEADER */}
        <div className="h-16 bg-[#18181a]/90 backdrop-blur border-b border-gray-800 flex items-center justify-between px-6 shadow-sm z-10">
           <div className="flex items-center space-x-6">
             <button 
               onClick={() => setIsPlaying(!isPlaying)}
               className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg font-bold transition-all active:scale-95 ${isPlaying ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
             >
               {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
               <span>{isPlaying ? 'PAUSE' : 'SIMULATE'}</span>
             </button>

             <div className="h-8 w-px bg-gray-700" />

             <div className="flex items-center space-x-3 bg-gray-800/50 rounded-lg p-1.5">
                <button onClick={() => setSpeed(s => Math.max(10, s - 10))} className="p-1 hover:bg-gray-700 rounded"><Minus size={16} /></button>
                <span className="text-xs font-mono w-20 text-center text-gray-400">{speed}ms / tick</span>
                <button onClick={() => setSpeed(s => Math.min(500, s + 10))} className="p-1 hover:bg-gray-700 rounded"><Plus size={16} /></button>
             </div>
           </div>

           <div className="flex items-center text-sm text-gray-500 space-x-4">
             {tool === 'IC' && activeTemplate && <div className="text-blue-400 text-xs font-bold px-3 py-1 bg-blue-900/30 rounded border border-blue-900">PLACING: {activeTemplate.label}</div>}
             <div className="font-mono">NODES: {stats.nodes}</div>
             <button onClick={() => engineRef.current.deleteSelected()} className="p-2 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={20} /></button>
           </div>
        </div>

        {/* VIEWPORT */}
        <div className="flex-1 relative cursor-crosshair">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
          />
          <div className="absolute bottom-4 left-4 text-xs font-mono text-gray-500 bg-black/40 px-2 py-1 rounded pointer-events-none">
             TICK: {stats.tick}
          </div>
          
          {/* CONTEXT MENU */}
          {contextMenu && (
             <ContextMenu 
                x={contextMenu.x} 
                y={contextMenu.y} 
                hasSelection={engineRef.current.selectedNodeIds.size > 0}
                hasGroup={Array.from(engineRef.current.selectedNodeIds).some(id => engineRef.current.nodes.get(id)?.type === 'GROUP')}
                isIC={Array.from(engineRef.current.selectedNodeIds).some(id => engineRef.current.nodes.get(id)?.type === 'IC')}
                onDelete={() => { engineRef.current.deleteSelected(); setContextMenu(null); }}
                onDuplicate={() => { engineRef.current.duplicateSelected(); setContextMenu(null); }}
                onGroup={() => { engineRef.current.createGroupFromSelection(); setContextMenu(null); }}
                onUngroup={() => { engineRef.current.ungroupSelected(); setContextMenu(null); }}
                onPack={() => { engineRef.current.packGroupToIC(); setContextMenu(null); }}
                onUnpack={() => { engineRef.current.unpackICToGroup(); setContextMenu(null); }}
                onSaveToLibrary={handleSaveNode}
             />
          )}
        </div>
      </div>

      {/* RIGHT SETTINGS PANEL */}
      {selectedNode ? (
          <div className="w-72 bg-[#18181a] border-l border-gray-800 flex flex-col p-6 z-20 shadow-xl overflow-y-auto">
              <div className="flex items-center mb-6 text-gray-200">
                  <Settings size={18} className="mr-2 text-blue-500"/>
                  <span className="font-bold text-lg">PROPERTIES</span>
                  <button className="ml-auto hover:text-white text-gray-500" onClick={() => { engineRef.current.selectedNodeIds.clear(); engineRef.current.triggerUpdate(); }}><X size={16}/></button>
              </div>
              
              <div className="mb-6">
                 <label className="text-xs font-bold text-gray-500 mb-2 flex items-center"><Type size={12} className="mr-1"/> LABEL</label>
                 <input 
                    type="text" 
                    value={selectedNode.label || ''} 
                    onChange={handleNameChange}
                    placeholder="Enter name..."
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                 />
              </div>

              {selectedNode.type !== 'GROUP' && selectedNode.type !== 'IC' && (
              <div className="mb-6">
                 <label className="text-xs font-bold text-gray-500 mb-2 flex items-center"><Palette size={12} className="mr-1"/> WIRE COLOR</label>
                 <div className="flex items-center space-x-3 bg-[#0f0f0f] p-2 rounded border border-gray-700">
                    <input 
                        type="color" 
                        value={selectedNode.color || COLORS.wireOn}
                        onChange={handleColorChange}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                    />
                    <span className="text-xs text-gray-400 font-mono">{selectedNode.color || COLORS.wireOn}</span>
                 </div>
              </div>
              )}

              {selectedNode.type === 'IC' && selectedNode.ioMap && (
                 <div className="mb-6 border-t border-gray-800 pt-4">
                     <label className="text-xs font-bold text-gray-500 mb-2 flex items-center">IO CONFIGURATION</label>
                     <div className="space-y-2">
                        {selectedNode.ioMap.inputs.map((lbl, i) => (
                            <div key={`in-${i}`} className="flex items-center space-x-2">
                                <span className="text-xs text-blue-400 font-mono w-6">IN{i}</span>
                                <input 
                                    className="flex-1 bg-[#0f0f0f] border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                                    value={lbl}
                                    onChange={(e) => handleIOLabelChange('input', i, e.target.value)}
                                />
                            </div>
                        ))}
                        <div className="h-px bg-gray-800 my-2"/>
                        {selectedNode.ioMap.outputs.map((lbl, i) => (
                            <div key={`out-${i}`} className="flex items-center space-x-2">
                                <span className="text-xs text-green-400 font-mono w-6">OUT{i}</span>
                                <input 
                                    className="flex-1 bg-[#0f0f0f] border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                                    value={lbl}
                                    onChange={(e) => handleIOLabelChange('output', i, e.target.value)}
                                />
                            </div>
                        ))}
                     </div>
                 </div>
              )}

              <div className="mb-auto">
                 <LogicEquation node={selectedNode} />
              </div>

              <div className="mt-6 pt-6 border-t border-gray-800 text-xs text-gray-600">
                  ID: {selectedNode.id} <br/>
                  TYPE: {selectedNode.type} <br/>
                  {selectedNode.groupId && `GROUP: ${selectedNode.groupId}`}
              </div>
          </div>
      ) : (
         <div className="hidden w-72 bg-[#18181a] border-l border-gray-800 lg:flex flex-col items-center justify-center text-gray-600 p-6 z-20">
             <MousePointer2 size={48} className="mb-4 opacity-20"/>
             <span className="text-sm">Select a component to edit</span>
         </div>
      )}

    </div>
  );
}