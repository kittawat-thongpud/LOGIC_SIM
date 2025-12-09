/**
 * Canvas component - Main viewport for the circuit
 */

import { useRef, useLayoutEffect, useCallback } from 'react';
import type { CircuitEngine } from '../engine/CircuitEngine';
import type { LogicNode, ToolType } from '../engine/types';
import { generateId } from '../engine/utils';

interface CanvasProps {
  engine: CircuitEngine;
  tool: ToolType;
  activeTemplate: Partial<LogicNode> | null;
  tickCount: number;
  onContextMenu: (x: number, y: number) => void;
  onTickUpdate: (count: number) => void;
  onToolReset: () => void;
}

export function Canvas({
  engine,
  tool,
  activeTemplate,
  tickCount,
  onContextMenu,
  onTickUpdate,
  onToolReset
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation loop
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const loop = (time: number) => {
      const parent = canvas.parentElement;
      if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }

      engine.tick(time);
      
      // Update tick display periodically
      if (engine.tickCount % 5 === 0 && engine.tickCount !== tickCount) {
        onTickUpdate(engine.tickCount);
      }
      
      engine.render(ctx, canvas.width, canvas.height);
      animId = requestAnimationFrame(loop);
    };
    
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [engine, tickCount, onTickUpdate]);

  // Pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Middle mouse -> Pan
    if (e.button === 1) {
      engine.interactionMode = 'PAN';
      engine.dragStart = { x, y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 2) return;

    canvas.setPointerCapture(e.pointerId);

    const worldPos = engine.screenToWorld(x, y);

    // Check pin
    const pin = engine.findPinAt(worldPos);
    if (pin) {
      if (pin.type === 'output') {
        engine.wiringStart = pin;
        engine.interactionMode = 'WIRING';
        return;
      }
    }

    // Check node
    const nodeId = engine.findNodeAt(worldPos);
    if (nodeId) {


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


    // Check wire
    const wireId = engine.findWireAt(worldPos);
    if (wireId) {
      if (e.shiftKey) {
        if (engine.selectedWireIds.has(wireId)) {
          engine.selectedWireIds.delete(wireId);
        } else {
          engine.selectedWireIds.add(wireId);
        }
      } else {
        engine.selectedNodeIds.clear();
        engine.selectedWireIds.clear();
        engine.selectedWireIds.add(wireId);
      }
      engine.triggerUpdate();
      return;
    }

    // Add node or select
    if (tool !== 'SELECT') {
      engine.addNode(tool, worldPos, tool === 'IC' && activeTemplate ? activeTemplate : undefined);
      onToolReset();
    } else {
      if (e.shiftKey || tool === 'SELECT') {
        engine.interactionMode = 'SELECT_AREA';
        engine.selectionStart = worldPos;
        engine.selectionCurrent = worldPos;
        engine.selectedNodeIds.clear();
        engine.selectedWireIds.clear();
      } else {
        engine.interactionMode = 'PAN';
        engine.dragStart = { x, y };
      }
      engine.triggerUpdate();
    }
  }, [engine, tool, activeTemplate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
    } else if (engine.interactionMode === 'SELECT_AREA') {
      engine.selectionCurrent = worldPos;
    } else if (engine.interactionMode === 'PAN') {
      const dx = x - engine.dragStart.x;
      const dy = y - engine.dragStart.y;
      engine.viewport.x += dx;
      engine.viewport.y += dy;
      engine.dragStart = { x, y };
    }
  }, [engine]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (canvasRef.current) canvasRef.current.releasePointerCapture(e.pointerId);

    if (engine.interactionMode === 'DRAG_NODE') {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldPos = engine.screenToWorld(x, y);
      
      const dist = Math.hypot(worldPos.x - engine.dragStart.x, worldPos.y - engine.dragStart.y);
      if (dist < 5) {
         if (engine.selectedNodeIds.size === 1) {
             const id = engine.selectedNodeIds.values().next().value;
             if (id) {
               const node = engine.nodes.get(id);
               if (node && node.type === 'SWITCH') {
                   engine.toggleSwitch(id);
               }
             }
         }
      }
      engine.saveState();
    }

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
        engine.saveState();
        engine.tick(-1);
      }
      engine.wiringStart = null;
    } else if (engine.interactionMode === 'SELECT_AREA') {
      const x1 = Math.min(engine.selectionStart.x, engine.selectionCurrent.x);
      const y1 = Math.min(engine.selectionStart.y, engine.selectionCurrent.y);
      const x2 = Math.max(engine.selectionStart.x, engine.selectionCurrent.x);
      const y2 = Math.max(engine.selectionStart.y, engine.selectionCurrent.y);

      engine.selectedNodeIds.clear();
      engine.selectedWireIds.clear();
      engine.nodes.forEach(node => {
        if (
          node.position.x >= x1 &&
          node.position.x <= x2 &&
          node.position.y >= y1 &&
          node.position.y <= y2
        ) {
          engine.selectedNodeIds.add(node.id);
        }
      });
      engine.triggerUpdate();
    }

    engine.interactionMode = 'NONE';
  }, [engine]);

  const handleContextMenuEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = engine.screenToWorld(x, y);

    const nodeId = engine.findNodeAt(worldPos);
    if (nodeId) {
      if (!engine.selectedNodeIds.has(nodeId)) {
        engine.selectedNodeIds.clear();
        engine.selectedNodeIds.add(nodeId);
        engine.triggerUpdate();
      }

    } else {
      const wireId = engine.findWireAt(worldPos);
      if (wireId) {
        if (!engine.selectedWireIds.has(wireId)) {
          engine.selectedNodeIds.clear();
          engine.selectedWireIds.clear();
          engine.selectedWireIds.add(wireId);
          engine.triggerUpdate();
        }
      }
    }

    onContextMenu(e.clientX, e.clientY);
  }, [engine, onContextMenu]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const zoomSensitivity = 0.001;
    engine.viewport.zoom = Math.max(0.2, Math.min(3, engine.viewport.zoom - e.deltaY * zoomSensitivity));
  }, [engine]);

  return (
    <div className="flex-1 relative cursor-crosshair">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenuEvent}
        onWheel={handleWheel}
      />
      <div className="absolute bottom-4 left-4 text-xs font-mono text-gray-500 bg-black/40 px-2 py-1 rounded pointer-events-none">
        TICK: {tickCount}
      </div>
    </div>
  );
}
