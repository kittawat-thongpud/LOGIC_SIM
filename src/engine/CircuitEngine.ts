/**
 * CircuitEngine - Core logic simulation engine
 * Manages nodes, wires, simulation, and rendering
 */

import type {
  LogicNode,
  Wire,
  Pin,
  Vector2,
  Viewport,
  NodeType,
  InteractionMode,
  OnUpdateUICallback,
  OnSelectionChangeCallback
} from './types';
import {
  COLORS,
  GRID_SIZE,
  DEF_GATE_W,
  DEF_GATE_H,
  PIN_RADIUS,
  HIT_RADIUS,
  MINIMAP_WIDTH,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN
} from './constants';
import { generateId, deepClone } from './utils';

export class CircuitEngine {
  // Graph data
  nodes: Map<string, LogicNode> = new Map();
  wires: Wire[] = [];
  
  // Viewport
  viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  
  // Selection
  selectedNodeIds: Set<string> = new Set();
  hoveredPin: Pin | null = null;
  
  // Interaction state
  interactionMode: InteractionMode = 'NONE';
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
  
  // Function cache for compiled ICs
  fnCache: Map<string, Function> = new Map();

  // Clipboard & History
  clipboard: { nodes: LogicNode[]; wires: Wire[] } | null = null;
  historyStack: string[] = [];
  redoStack: string[] = [];
  maxHistory = 50;
  isRestoringHistory = false;
  
  // Callbacks
  onUpdateUI: OnUpdateUICallback = () => {};
  onSelectionChange: OnSelectionChangeCallback = () => {};

  constructor() {
    // Start with demo circuit
    this.addNode('SWITCH', { x: 100, y: 100 });
    this.addNode('SWITCH', { x: 100, y: 200 });
    this.addNode('AND', { x: 300, y: 150 });
    this.addNode('LIGHT', { x: 500, y: 150 });
    this.saveState();
  }

  // ==================== History ====================

  saveState(): void {
    if (this.isRestoringHistory) return;
    
    const state = JSON.stringify(this.serialize());
    // Don't save if identical to last state
    if (this.historyStack.length > 0 && this.historyStack[this.historyStack.length - 1] === state) {
      return;
    }
    
    this.historyStack.push(state);
    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
    }
    this.redoStack = [];
  }

  undo(): void {
    if (this.historyStack.length <= 1) return;
    
    const current = this.historyStack.pop();
    if (current) this.redoStack.push(current);
    
    const prev = this.historyStack[this.historyStack.length - 1];
    this.isRestoringHistory = true;
    this.deserialize(JSON.parse(prev));
    this.isRestoringHistory = false;
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    
    const next = this.redoStack.pop();
    if (next) {
      this.historyStack.push(next);
      this.isRestoringHistory = true;
      this.deserialize(JSON.parse(next));
      this.isRestoringHistory = false;
    }
  }

  // ==================== Clipboard ====================

  copy(): void {
    if (this.selectedNodeIds.size === 0) return;
    
    const nodes: LogicNode[] = [];
    this.selectedNodeIds.forEach(id => {
      const n = this.nodes.get(id);
      if (n) nodes.push(deepClone(n));
    });
    
    const wires = this.wires.filter(w => 
      this.selectedNodeIds.has(w.sourceNodeId) && 
      this.selectedNodeIds.has(w.targetNodeId)
    ).map(w => deepClone(w));
    
    this.clipboard = { nodes, wires };
  }

  cut(): void {
    this.copy();
    this.deleteSelected();
  }

  paste(): void {
    if (!this.clipboard) return;
    
    this.saveState();
    
    const idMap = new Map<string, string>();
    const newNodes: LogicNode[] = [];
    const offset = { x: 20, y: 20 };
    
    // Paste at mouse position if available, otherwise offset from original
    // For now, simple offset
    
    this.clipboard.nodes.forEach(n => {
      const newId = generateId();
      idMap.set(n.id, newId);
      const clone = deepClone(n);
      clone.id = newId;
      clone.position.x += offset.x;
      clone.position.y += offset.y;
      clone.groupId = undefined; // Detach from old groups unless group is also pasted
      newNodes.push(clone);
    });
    
    // Re-link groups if parent group is also in clipboard
    newNodes.forEach(n => {
      if (n.groupId && idMap.has(n.groupId)) {
        n.groupId = idMap.get(n.groupId);
      } else {
        n.groupId = undefined;
      }
    });
    
    const newWires: Wire[] = [];
    this.clipboard.wires.forEach(w => {
      if (idMap.has(w.sourceNodeId) && idMap.has(w.targetNodeId)) {
        const clone = deepClone(w);
        clone.id = generateId();
        clone.sourceNodeId = idMap.get(w.sourceNodeId)!;
        clone.targetNodeId = idMap.get(w.targetNodeId)!;
        newWires.push(clone);
      }
    });
    
    this.selectedNodeIds.clear();
    newNodes.forEach(n => {
      this.nodes.set(n.id, n);
      this.selectedNodeIds.add(n.id);
    });
    this.wires.push(...newWires);
    
    this.triggerUpdate();
    this.saveState();
  }

  // ==================== Graph Operations ====================

  addNode(type: NodeType, pos: Vector2, template?: Partial<LogicNode>): string {
    this.saveState();
    const id = generateId();
    
    const inCount = template ? this.getInputCount(type, template as LogicNode) : this.getInputCount(type);
    const outCount = template ? this.getOutputCount(type, template as LogicNode) : this.getOutputCount(type);

    const newNode: LogicNode = {
      id,
      type,
      position: pos,
      inputs: new Array(inCount).fill(false),
      outputs: new Array(outCount).fill(false),
      ...template
    };

    // Deep clone nested properties to prevent shared references
    if (template) {
      if (newNode.internals) newNode.internals = deepClone(newNode.internals);
      if (newNode.truthTable) newNode.truthTable = deepClone(newNode.truthTable);
      if (newNode.ioMap) newNode.ioMap = deepClone(newNode.ioMap);
      if (newNode.equations) newNode.equations = [...newNode.equations];
    }

    this.nodes.set(id, newNode);
    this.triggerUpdate();
    return id;
  }

  updateNodeData(id: string, data: Partial<LogicNode>): void {
    const node = this.nodes.get(id);
    if (node) {
      // Only save state if data actually changes something visual/structural
      // Avoid saving state on every keystroke of label editing if possible, 
      // but for simplicity we save here. Could optimize by debounce in UI.
      this.saveState(); 
      Object.assign(node, data);
      if (node.type === 'IC' && data.compiledFunction) {
        this.fnCache.delete(node.id);
      }
      this.triggerUpdate();
    }
  }

  // ... (existing code)

  // Wire selection
  selectedWireIds: Set<string> = new Set();

  // ... (existing code)

  deleteSelected(): void {
    if (this.selectedNodeIds.size === 0 && this.selectedWireIds.size === 0) return;
    this.saveState();
    
    this.selectedNodeIds.forEach(id => {
      this.nodes.delete(id);
      this.wires = this.wires.filter(w => w.sourceNodeId !== id && w.targetNodeId !== id);
      this.nodes.forEach(n => {
        if (n.groupId === id) n.groupId = undefined;
      });
      this.fnCache.delete(id);
    });
    
    if (this.selectedWireIds.size > 0) {
      this.wires = this.wires.filter(w => !this.selectedWireIds.has(w.id));
    }

    this.selectedNodeIds.clear();
    this.selectedWireIds.clear();
    this.triggerUpdate();
  }

  // ... (existing code)

  private drawWires(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    this.wires.forEach(wire => {
      const source = this.nodes.get(wire.sourceNodeId);
      const target = this.nodes.get(wire.targetNodeId);
      if (!source || !target) return;
      
      const p1 = this.getPinPos(source, wire.sourcePinIndex, 'output');
      const p2 = this.getPinPos(target, wire.targetPinIndex, 'input');
      const onColor = source.color || COLORS.wireOn;
      const offColor = source.color || COLORS.wireOff;
      const isSelected = this.selectedWireIds.has(wire.id);
      
      ctx.lineWidth = isSelected ? 6 : 4;
      ctx.strokeStyle = isSelected ? COLORS.nodeSelected : (wire.state ? onColor : offColor);
      ctx.globalAlpha = (wire.state || !source.color || isSelected) ? 1.0 : 0.3;
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      
      // Improved curvature
      const dist = Math.abs(p2.x - p1.x);
      const cp1x = p1.x + Math.max(dist * 0.67, 50);
      const cp2x = p2.x - Math.max(dist * 0.67, 50);
      
      ctx.bezierCurveTo(cp1x, p1.y, cp2x, p2.y, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  }

  private drawTempWire(ctx: CanvasRenderingContext2D): void {
    if (this.interactionMode !== 'WIRING' || !this.wiringStart) return;
    
    const startNode = this.nodes.get(this.wiringStart.nodeId);
    if (!startNode) return;
    
    const startPos = this.getPinPos(startNode, this.wiringStart.index, this.wiringStart.type);
    let endPos = this.mouseWorld;
    
    if (this.hoveredPin && this.hoveredPin.type !== this.wiringStart.type && this.hoveredPin.nodeId !== this.wiringStart.nodeId) {
      const endNode = this.nodes.get(this.hoveredPin.nodeId);
      if (endNode) endPos = this.getPinPos(endNode, this.hoveredPin.index, this.hoveredPin.type);
    }
    
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    
    const dist = Math.abs(endPos.x - startPos.x);
    const cp1x = startPos.x + Math.max(dist * 0.67, 50);
    const cp2x = endPos.x - Math.max(dist * 0.67, 50);
    
    ctx.bezierCurveTo(cp1x, startPos.y, cp2x, endPos.y, endPos.x, endPos.y);
    
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ... (existing code)

  findWireAt(pos: Vector2): string | null {
    for (const wire of this.wires) {
      const source = this.nodes.get(wire.sourceNodeId);
      const target = this.nodes.get(wire.targetNodeId);
      if (!source || !target) continue;
      
      const p1 = this.getPinPos(source, wire.sourcePinIndex, 'output');
      const p2 = this.getPinPos(target, wire.targetPinIndex, 'input');
      
      const dist = Math.abs(p2.x - p1.x);
      const cp1x = p1.x + Math.max(dist * 0.67, 50);
      const cp2x = p2.x - Math.max(dist * 0.67, 50);
      
      if (this.isPointNearBezier(pos, p1, {x: cp1x, y: p1.y}, {x: cp2x, y: p2.y}, p2)) {
        return wire.id;
      }
    }
    return null;
  }

  private isPointNearBezier(pt: Vector2, p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, threshold: number = 5): boolean {
    // Sample points along the curve
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
      
      const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
      const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
      
      const dist = Math.hypot(pt.x - x, pt.y - y);
      if (dist < threshold) return true;
    }
    return false;
  }

  triggerUpdate(): void {
    this.onUpdateUI();
    // Only show properties if a single node is selected AND no wires are selected
    if (this.selectedNodeIds.size === 1 && this.selectedWireIds.size === 0) {
      const id = this.selectedNodeIds.values().next().value;
      if (id) {
        const node = this.nodes.get(id);
        this.onSelectionChange(node || null);
      } else {
        this.onSelectionChange(null);
      }
    } else {
      this.onSelectionChange(null);
    }
  }

  deserialize(data: { nodes: LogicNode[]; wires: Wire[]; viewport: Viewport }): void {
    this.nodes.clear();
    this.fnCache.clear();
    this.selectedNodeIds.clear();
    this.selectedWireIds.clear();
    
    data.nodes.forEach(n => this.nodes.set(n.id, n));
    this.wires = data.wires;
    this.viewport = data.viewport;
    
    this.triggerUpdate();
  }

  duplicateSelected(): void {
    if (this.selectedNodeIds.size === 0) return;
    this.saveState();

    const idMap = new Map<string, string>();
    const newNodes: LogicNode[] = [];
    const offset = { x: 20, y: 20 };

    this.selectedNodeIds.forEach(id => {
      const node = this.nodes.get(id);
      if (node) {
        const newId = generateId();
        idMap.set(id, newId);
        const clone = deepClone(node);
        clone.id = newId;
        clone.position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
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

  createGroupFromSelection(): void {
    if (this.selectedNodeIds.size === 0) return;
    this.saveState();
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    this.selectedNodeIds.forEach(id => {
      const n = this.nodes.get(id);
      if (n && n.type !== 'GROUP') {
        const dims = this.getNodeDimensions(n);
        minX = Math.min(minX, n.position.x - dims.w / 2);
        minY = Math.min(minY, n.position.y - dims.h / 2);
        maxX = Math.max(maxX, n.position.x + dims.w / 2);
        maxY = Math.max(maxY, n.position.y + dims.h / 2);
      }
    });

    if (minX === Infinity) return;
    
    const padding = 30;
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;
    const centerX = minX - padding + width / 2;
    const centerY = minY - padding + height / 2;

    const groupId = generateId();
    this.nodes.set(groupId, {
      id: groupId,
      type: 'GROUP',
      position: { x: centerX, y: centerY },
      width,
      height,
      inputs: [],
      outputs: [],
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

  ungroupSelected(): void {
    const groupsToUngroup = new Set<string>();
    this.selectedNodeIds.forEach(id => {
      const n = this.nodes.get(id);
      if (n && n.type === 'GROUP') groupsToUngroup.add(n.id);
    });
    
    if (groupsToUngroup.size === 0) return;
    this.saveState();
    
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

  packGroupToIC(): void {
    const groupId = Array.from(this.selectedNodeIds).find(id => this.nodes.get(id)?.type === 'GROUP');
    if (!groupId) return;
    
    const groupNode = this.nodes.get(groupId);
    if (!groupNode) return;

    const internals = Array.from(this.nodes.values()).filter(n => n.groupId === groupId);
    const inputs = internals.filter(n => n.type === 'SWITCH').sort((a, b) => a.position.y - b.position.y);
    const outputs = internals.filter(n => n.type === 'LIGHT').sort((a, b) => a.position.y - b.position.y);

    if (inputs.length === 0 && outputs.length === 0) {
      console.warn("Group must contain Switches (Inputs) and Lights (Outputs) to convert.");
      return;
    }

    this.saveState();

    // Identify stateful nodes (everything except inputs)
    const stateNodes = internals.filter(n => n.type !== 'SWITCH');
    const varMap = new Map<string, string>();
    stateNodes.forEach(n => varMap.set(n.id, `v_${n.id.replace(/-/g, '_')}`));

    const lines: string[] = [];

    // Inject nested IC functions
    const nestedICs = internals.filter(n => n.type === 'IC');
    nestedICs.forEach(ic => {
        const funcName = `func_${ic.id.replace(/-/g, '_')}`;
        if (ic.compiledFunction) {
            lines.push(`const ${funcName} = (inputs, state) => {`);
            lines.push(ic.compiledFunction);
            lines.push(`};`);
        } else {
            const outCount = ic.outputCount || 0;
            lines.push(`const ${funcName} = (inputs, state) => ({ outputs: new Array(${outCount}).fill(0), state: state || [] });`);
        }
    });

    lines.push(`// Unpack state`);
    stateNodes.forEach((n, i) => {
      const v = varMap.get(n.id);
      if (n.type === 'IC') {
          lines.push(`let ${v}_state = state[${i}] !== undefined ? state[${i}] : [];`);
          lines.push(`let ${v}_out = new Array(${n.outputCount || 0}).fill(0);`);
      } else {
          lines.push(`let ${v} = state[${i}] !== undefined ? state[${i}] : 0;`);
      }
    });

    lines.push(`for(let iter=0; iter<10; iter++) {`);
    
    const internalWires = this.wires.filter(w => internals.some(n => n.id === w.sourceNodeId) && internals.some(n => n.id === w.targetNodeId));

    stateNodes.forEach(n => {
      const v = varMap.get(n.id);
      const myInWires = internalWires.filter(w => w.targetNodeId === n.id).sort((a, b) => a.targetPinIndex - b.targetPinIndex);
      
      const getInVal = (idx: number) => {
        const w = myInWires.find(wi => wi.targetPinIndex === idx);
        if (w) {
          const src = internals.find(x => x.id === w.sourceNodeId);
          if (src?.type === 'SWITCH') return `(inputs[${inputs.indexOf(src)}] ? 1 : 0)`;
          if (src?.type === 'IC') return `${varMap.get(src.id)}_out[${w.sourcePinIndex}]`;
          return varMap.get(w.sourceNodeId) || '0';
        }
        return '0';
      };

      if (n.type === 'IC') {
          const inputExprs: string[] = [];
          for(let k=0; k < (n.inputCount || 0); k++) {
              inputExprs.push(getInVal(k));
          }
          const funcName = `func_${n.id.replace(/-/g, '_')}`;
          lines.push(`  const res_${v} = ${funcName}([${inputExprs.join(', ')}], ${v}_state);`);
          lines.push(`  ${v}_state = res_${v}.state;`);
          lines.push(`  ${v}_out = res_${v}.outputs;`);
      } else {
          let expr = '0';
          switch (n.type) {
            case 'AND': expr = `((${getInVal(0)} + ${getInVal(1)}) == 2 ? 1 : 0)`; break;
            case 'OR': expr = `((${getInVal(0)} + ${getInVal(1)}) > 0 ? 1 : 0)`; break;
            case 'NOT': expr = `(${getInVal(0)} == 0 ? 1 : 0)`; break;
            case 'NAND': expr = `((${getInVal(0)} + ${getInVal(1)}) < 2 ? 1 : 0)`; break;
            case 'XOR': expr = `(${getInVal(0)} != ${getInVal(1)} ? 1 : 0)`; break;
            case 'BUFFER': expr = `${getInVal(0)}`; break;
            default: expr = '0';
          }
          lines.push(`  ${v} = ${expr};`);
      }
    });
    lines.push(`}`);

    // Pack state
    lines.push(`const newState = [${stateNodes.map(n => {
        const v = varMap.get(n.id);
        return n.type === 'IC' ? `${v}_state` : v;
    }).join(', ')}];`);

    const outList = outputs.map(o => {
      const w = internalWires.find(wi => wi.targetNodeId === o.id);
      if (w) {
        const src = internals.find(x => x.id === w.sourceNodeId);
        if (src?.type === 'SWITCH') return `(inputs[${inputs.indexOf(src)}] ? 1 : 0)`;
        if (src?.type === 'IC') return `${varMap.get(src.id)}_out[${w.sourcePinIndex}]`;
        return varMap.get(w.sourceNodeId) || '0';
      }
      return '0';
    });
    lines.push(`return { outputs: [${outList.join(', ')}], state: newState };`);
    const compiledFnBody = lines.join('\n');

    // Create IC node
    const storedNodes = internals.map(n => ({
      ...n,
      position: { x: n.position.x - groupNode.position.x, y: n.position.y - groupNode.position.y },
      groupId: undefined
    }));
    const storedWires = this.wires.filter(w => internals.some(n => n.id === w.sourceNodeId) && internals.some(n => n.id === w.targetNodeId));

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
      internalState: stateNodes.map(n => {
          if (n.type === 'IC') return n.internalState ? JSON.parse(JSON.stringify(n.internalState)) : [];
          return 0;
      }),
      inputMapping: inputs.map((_, i) => i),
      outputMapping: outputs.map((_, i) => i),
      equations: [],
      internals: { nodes: storedNodes, wires: storedWires }
    };

    internals.forEach(n => this.nodes.delete(n.id));
    this.nodes.delete(groupId);
    this.wires = this.wires.filter(w => !internals.some(n => n.id === w.sourceNodeId) && !internals.some(n => n.id === w.targetNodeId));

    this.nodes.set(icNode.id, icNode);
    this.selectedNodeIds.clear();
    this.selectedNodeIds.add(icNode.id);
    this.triggerUpdate();
  }

  unpackICToGroup(): void {
    const icId = Array.from(this.selectedNodeIds).find(id => this.nodes.get(id)?.type === 'IC');
    if (!icId) return;
    
    const icNode = this.nodes.get(icId);
    if (!icNode || !icNode.internals) return;

    this.saveState();

    const { nodes: storedNodes, wires: storedWires } = icNode.internals;
    const groupId = generateId();
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    storedNodes.forEach(n => {
      const dims = this.getNodeDimensions(n);
      minX = Math.min(minX, n.position.x - dims.w / 2);
      minY = Math.min(minY, n.position.y - dims.h / 2);
      maxX = Math.max(maxX, n.position.x + dims.w / 2);
      maxY = Math.max(maxY, n.position.y + dims.h / 2);
    });
    
    const groupPadding = 40;
    const groupW = (maxX - minX) + groupPadding * 2;
    const groupH = (maxY - minY) + groupPadding * 2;

    this.nodes.set(groupId, {
      id: groupId,
      type: 'GROUP',
      position: icNode.position,
      width: groupW,
      height: groupH,
      inputs: [],
      outputs: [],
      label: icNode.label || 'Unpacked'
    });

    const idMap = new Map<string, string>();
    storedNodes.forEach(n => {
      const newId = generateId();
      idMap.set(n.id, newId);
      this.nodes.set(newId, {
        ...n,
        id: newId,
        groupId: groupId,
        position: { x: icNode.position.x + n.position.x, y: icNode.position.y + n.position.y },
        inputs: [...n.inputs],
        outputs: [...n.outputs]
      });
    });

    storedWires.forEach(w => {
      if (idMap.has(w.sourceNodeId) && idMap.has(w.targetNodeId)) {
        this.wires.push({
          ...w,
          id: generateId(),
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



  // ==================== Simulation ====================

  getInputCount(type: NodeType, node?: LogicNode): number {
    if (type === 'IC' && node && node.inputCount !== undefined) return node.inputCount;
    switch (type) {
      case 'NOT':
      case 'BUFFER':
      case 'LIGHT':
        return 1;
      case 'SWITCH':
      case 'CLOCK':
      case 'GROUP':
        return 0;
      default:
        return 2;
    }
  }

  getOutputCount(type: NodeType, node?: LogicNode): number {
    if (type === 'IC' && node && node.outputCount !== undefined) return node.outputCount;
    return (type === 'LIGHT' || type === 'GROUP') ? 0 : 1;
  }

  tick(timestamp: number): void {
    if (!this.isRunning && timestamp !== -1) return;
    if (timestamp !== -1 && timestamp - this.lastTick < this.tickRate) return;
    this.lastTick = timestamp;
    this.tickCount++;

    // Update clocks
    this.nodes.forEach(node => {
      if (node.type === 'CLOCK') node.outputs[0] = Math.floor(this.tickCount / 5) % 2 === 0;
    });

    // Reset inputs
    this.nodes.forEach(node => {
      if (node.type !== 'SWITCH' && node.type !== 'CLOCK') node.inputs.fill(false);
    });

    // Propagate wire states
    this.wires.forEach(wire => {
      const source = this.nodes.get(wire.sourceNodeId);
      const target = this.nodes.get(wire.targetNodeId);
      if (source && target) {
        const val = source.outputs[wire.sourcePinIndex] || false;
        wire.state = val;
        target.inputs[wire.targetPinIndex] = val;
      }
    });

    // Compute logic
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
              try {
                fn = new Function('inputs', 'state', node.compiledFunction) as Function;
                this.fnCache.set(node.id, fn);
              } catch (e) {
                console.error('IC compilation error:', e);
              }
            }
            if (fn) {
              // Map pins to ports
              const mappedInputs = new Array(node.inputCount || 0);
              if (node.inputMapping) {
                  node.inputMapping.forEach((portIdx, pinIdx) => {
                      mappedInputs[portIdx] = i[pinIdx];
                  });
              } else {
                  for(let k=0; k<i.length; k++) mappedInputs[k] = i[k];
              }

              const result = fn(mappedInputs, node.internalState || []);
              
              if (Array.isArray(result)) {
                node.outputs = result.map((v: number) => v === 1);
              } else if (result && result.outputs) {
                // Map ports to pins
                const mappedOutputs = new Array(node.outputCount || 0);
                if (node.outputMapping) {
                    node.outputMapping.forEach((portIdx, pinIdx) => {
                        mappedOutputs[pinIdx] = result.outputs[portIdx];
                    });
                } else {
                    for(let k=0; k<result.outputs.length; k++) mappedOutputs[k] = result.outputs[k];
                }

                node.outputs = mappedOutputs.map((v: number) => v === 1);
                node.internalState = result.state;
              }
            }
          } else if (node.truthTable) {
            const key = i.map(b => b ? '1' : '0').join('');
            if (node.truthTable[key]) {
              node.outputs = node.truthTable[key].map(bit => bit === 1);
            }
          }
          break;
        }
      }
    });
  }

  toggleSwitch(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node && node.type === 'SWITCH') {
      node.outputs[0] = !node.outputs[0];
      if (this.isRunning) {
        this.tick(-1);
      }
    }
  }

  updateIOMapping(nodeId: string, type: 'input' | 'output', pinIndex: number, portIndex: number): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'IC') return;
    
    this.saveState();
    
    if (type === 'input') {
        if (!node.inputMapping) node.inputMapping = new Array(node.inputCount || 0).fill(0).map((_, i) => i);
        
        const oldPort = node.inputMapping[pinIndex];
        const otherPinIndex = node.inputMapping.indexOf(portIndex);
        
        if (otherPinIndex !== -1 && otherPinIndex !== pinIndex) {
            node.inputMapping[otherPinIndex] = oldPort;
        }
        node.inputMapping[pinIndex] = portIndex;
    } else {
        if (!node.outputMapping) node.outputMapping = new Array(node.outputCount || 0).fill(0).map((_, i) => i);
        
        const oldPort = node.outputMapping[pinIndex];
        const otherPinIndex = node.outputMapping.indexOf(portIndex);
        
        if (otherPinIndex !== -1 && otherPinIndex !== pinIndex) {
            node.outputMapping[otherPinIndex] = oldPort;
        }
        node.outputMapping[pinIndex] = portIndex;
    }
    
    this.triggerUpdate();
  }

  // ==================== Rendering ====================

  getNodeDimensions(node: LogicNode): { w: number; h: number } {
    if (node.type === 'BUFFER' || node.type === 'NOT') return { w: 40, h: 30 };
    if (node.type === 'GROUP' || node.type === 'IC') return { w: node.width || 100, h: node.height || 100 };
    return { w: DEF_GATE_W, h: DEF_GATE_H };
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
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

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { x, y, zoom } = this.viewport;
    const startX = Math.floor(-x / zoom / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(-y / zoom / GRID_SIZE) * GRID_SIZE;
    const endX = startX + (width / zoom) + GRID_SIZE;
    const endY = startY + (height / zoom) + GRID_SIZE;
    
    ctx.beginPath();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1 / zoom;
    
    for (let gx = startX; gx < endX; gx += GRID_SIZE) {
      ctx.moveTo(gx, startY);
      ctx.lineTo(gx, endY);
    }
    for (let gy = startY; gy < endY; gy += GRID_SIZE) {
      ctx.moveTo(startX, gy);
      ctx.lineTo(endX, gy);
    }
    ctx.stroke();
  }



  private drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const mapW = MINIMAP_WIDTH;
    const mapH = MINIMAP_HEIGHT;
    const margin = MINIMAP_MARGIN;
    const mapX = w - mapW - margin;
    const mapY = h - mapH - margin;
    
    ctx.fillStyle = COLORS.minimapBg;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeRect(mapX, mapY, mapW, mapH);
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x);
      maxY = Math.max(maxY, n.position.y);
    });
    
    const pad = 500;
    minX = Math.min(minX - pad, -this.viewport.x / this.viewport.zoom);
    minY = Math.min(minY - pad, -this.viewport.y / this.viewport.zoom);
    maxX = Math.max(maxX + pad, (-this.viewport.x + w) / this.viewport.zoom);
    maxY = Math.max(maxY + pad, (-this.viewport.y + h) / this.viewport.zoom);
    
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const scale = Math.min(mapW / worldW, mapH / worldH);
    
    const transformToMap = (wx: number, wy: number) => ({
      x: mapX + (wx - minX) * scale + (mapW - worldW * scale) / 2,
      y: mapY + (wy - minY) * scale + (mapH - worldH * scale) / 2
    });
    
    ctx.fillStyle = COLORS.minimapNode;
    this.nodes.forEach(n => {
      const p = transformToMap(n.position.x, n.position.y);
      ctx.fillRect(p.x - 2, p.y - 1, 4, 3);
    });
    
    const vx = -this.viewport.x / this.viewport.zoom;
    const vy = -this.viewport.y / this.viewport.zoom;
    const vw = w / this.viewport.zoom;
    const vh = h / this.viewport.zoom;
    const vp1 = transformToMap(vx, vy);
    const vp2 = transformToMap(vx + vw, vy + vh);
    
    ctx.fillStyle = COLORS.minimapView;
    ctx.strokeStyle = COLORS.nodeSelected;
    ctx.lineWidth = 1;
    ctx.fillRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y);
    ctx.strokeRect(vp1.x, vp1.y, vp2.x - vp1.x, vp2.y - vp1.y);
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: LogicNode): void {
    const { x, y } = node.position;
    const isSelected = this.selectedNodeIds.has(node.id);
    const dims = this.getNodeDimensions(node);
    const w = dims.w;
    const h = dims.h;

    ctx.save();
    ctx.translate(x, y);

    if (node.type === 'GROUP') {
      ctx.fillStyle = COLORS.groupBody;
      ctx.strokeStyle = isSelected ? COLORS.nodeSelected : COLORS.groupBorder;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isSelected ? COLORS.nodeSelected : '#666';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label || 'Group', -w / 2 + 10, -h / 2 + 10);
      ctx.restore();
      return;
    }

    if (node.type === 'IC') {
      if (isSelected) {
        ctx.strokeStyle = COLORS.nodeSelected;
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      }
      ctx.fillStyle = COLORS.icBody;
      ctx.strokeStyle = COLORS.icBorder;
      ctx.lineWidth = 2;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label || 'IC', 0, -h / 2 + 5);
      this.drawPins(ctx, node);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#aaa';
      if (node.ioMap) {
        for(let i=0; i < (node.inputCount || 0); i++) {
          const portIdx = node.inputMapping ? node.inputMapping[i] : i;
          const lbl = node.ioMap.inputs[portIdx];
          const p = this.getPinLocalPos(i, node.inputCount!, 'input', node);
          ctx.textAlign = 'left';
          ctx.fillText(lbl, p.x + 8, p.y + 3);
        }
        for(let i=0; i < (node.outputCount || 0); i++) {
          const portIdx = node.outputMapping ? node.outputMapping[i] : i;
          const lbl = node.ioMap.outputs[portIdx];
          const p = this.getPinLocalPos(i, node.outputCount!, 'output', node);
          ctx.textAlign = 'right';
          ctx.fillText(lbl, p.x - 8, p.y + 3);
        }
      }
      ctx.restore();
      return;
    }

    if (isSelected) {
      ctx.strokeStyle = COLORS.nodeSelected;
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
    }
    ctx.fillStyle = COLORS.nodeBody;
    ctx.strokeStyle = COLORS.nodeBorder;
    ctx.lineWidth = 2;
    this.drawShape(ctx, node);
    ctx.fill();
    ctx.stroke();
    this.drawPins(ctx, node);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    if (node.type === 'SWITCH' || node.type === 'LIGHT' || node.type === 'BUFFER' || node.type === 'NOT') {
      ctx.textBaseline = 'bottom';
      ctx.fillText(node.type, 0, -h / 2 - 5);
    } else {
      ctx.textBaseline = 'middle';
      ctx.fillText(node.type, 0, 0);
    }
    
    if (node.label) {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#e5e7eb';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, 0, h / 2 + 5);
    }
    
    if (node.type === 'LIGHT') {
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = node.inputs[0] ? '#ff4444' : '#330000';
      ctx.fill();
      if (node.inputs[0]) {
        ctx.strokeStyle = '#ff8888';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    
    if (node.type === 'SWITCH') {
      ctx.fillStyle = node.outputs[0] ? '#4ade80' : '#111';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -8, 16, 16);
    }
    
    ctx.restore();
  }

  private drawShape(ctx: CanvasRenderingContext2D, node: LogicNode): void {
    const dims = this.getNodeDimensions(node);
    const w = dims.w;
    const h = dims.h;
    const hw = w / 2;
    const hh = h / 2;
    
    ctx.beginPath();
    switch (node.type) {
      case 'AND':
      case 'NAND':
        ctx.moveTo(-hw, -hh);
        ctx.lineTo(0, -hh);
        ctx.arc(0, 0, hh, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
        if (node.type === 'NAND') {
          ctx.moveTo(hw + 5, 0);
          ctx.arc(hw + 5, 0, 3, 0, Math.PI * 2);
        }
        break;
      case 'OR':
      case 'XOR':
        ctx.moveTo(-hw, -hh);
        ctx.quadraticCurveTo(0, -hh, hw, 0);
        ctx.quadraticCurveTo(0, hh, -hw, hh);
        ctx.quadraticCurveTo(-hw / 2, 0, -hw, -hh);
        ctx.closePath();
        break;
      case 'NOT':
      case 'BUFFER':
        ctx.moveTo(-hw, -hh);
        ctx.lineTo(hw, 0);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
        if (node.type === 'NOT') {
          ctx.moveTo(hw + 5, 0);
          ctx.arc(hw + 5, 0, 3, 0, Math.PI * 2);
        }
        break;
      default:
        ctx.rect(-hw, -hh, w, h);
    }
  }

  private drawPins(ctx: CanvasRenderingContext2D, node: LogicNode): void {
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

  private drawSinglePin(ctx: CanvasRenderingContext2D, x: number, y: number, nodeId: string, index: number, type: 'input' | 'output'): void {
    ctx.beginPath();
    ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
    
    const isHovered = this.hoveredPin && this.hoveredPin.nodeId === nodeId && this.hoveredPin.index === index && this.hoveredPin.type === type;
    const isSnapTarget = this.interactionMode === 'WIRING' && this.wiringStart && this.wiringStart.nodeId !== nodeId && this.wiringStart.type !== type && isHovered;
    
    if (isHovered || isSnapTarget) {
      ctx.fillStyle = COLORS.pinHover;
      ctx.strokeStyle = COLORS.wireOn;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.pin;
      ctx.fill();
    }
  }

  // ==================== Coordinate Helpers ====================

  screenToWorld(x: number, y: number): Vector2 {
    return {
      x: (x - this.viewport.x) / this.viewport.zoom,
      y: (y - this.viewport.y) / this.viewport.zoom
    };
  }

  getPinLocalPos(index: number, count: number, type: 'input' | 'output', node?: LogicNode): Vector2 {
    const dims = node ? this.getNodeDimensions(node) : { w: DEF_GATE_W, h: DEF_GATE_H };
    const w = dims.w;
    const h = dims.h;
    const y = ((index + 1) / (count + 1)) * h - h / 2;
    const x = type === 'input' ? -w / 2 : w / 2;
    return { x, y };
  }

  getPinPos(node: LogicNode, index: number, type: 'input' | 'output'): Vector2 {
    const count = type === 'input' ? this.getInputCount(node.type, node) : this.getOutputCount(node.type, node);
    const local = this.getPinLocalPos(index, count, type, node);
    return { x: node.position.x + local.x, y: node.position.y + local.y };
  }

  findPinAt(pos: Vector2): Pin | null {
    let closest: Pin | null = null;
    let minDst = HIT_RADIUS;
    
    this.nodes.forEach(node => {
      const inCount = this.getInputCount(node.type, node);
      for (let i = 0; i < inCount; i++) {
        const p = this.getPinPos(node, i, 'input');
        const dst = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (dst < minDst) {
          minDst = dst;
          closest = { id: `${node.id}-in-${i}`, nodeId: node.id, type: 'input', index: i, value: false };
        }
      }
      const outCount = this.getOutputCount(node.type, node);
      for (let i = 0; i < outCount; i++) {
        const p = this.getPinPos(node, i, 'output');
        const dst = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (dst < minDst) {
          minDst = dst;
          closest = { id: `${node.id}-out-${i}`, nodeId: node.id, type: 'output', index: i, value: false };
        }
      }
    });
    
    return closest;
  }

  findNodeAt(pos: Vector2): string | null {
    const nodes = Array.from(this.nodes.values()).reverse();
    for (const node of nodes) {
      const dims = this.getNodeDimensions(node);
      const w = dims.w;
      const h = dims.h;
      if (pos.x >= node.position.x - w / 2 && pos.x <= node.position.x + w / 2 &&
          pos.y >= node.position.y - h / 2 && pos.y <= node.position.y + h / 2) {
        return node.id;
      }
    }
    return null;
  }



  // ==================== Serialization ====================

  serialize(): { nodes: LogicNode[]; wires: Wire[]; viewport: Viewport } {
    return {
      nodes: Array.from(this.nodes.values()),
      wires: this.wires,
      viewport: this.viewport
    };
  }


}
