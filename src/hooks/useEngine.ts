/**
 * Custom hook for managing the CircuitEngine instance
 */

import { useRef, useCallback, useSyncExternalStore } from 'react';
import { CircuitEngine } from '../engine/CircuitEngine';
import type { LogicNode } from '../engine/types';

interface EngineState {
  nodeCount: number;
  tickCount: number;
  selectedNode: LogicNode | null;
  isRunning: boolean;
}

export function useEngine() {
  const engineRef = useRef<CircuitEngine | null>(null);
  const listenerRef = useRef<Set<() => void>>(new Set());
  const stateRef = useRef<EngineState>({
    nodeCount: 0,
    tickCount: 0,
    selectedNode: null,
    isRunning: false
  });

  // Lazy initialization
  if (!engineRef.current) {
    engineRef.current = new CircuitEngine();
    
    // Wire up callbacks
    engineRef.current.onUpdateUI = () => {
      stateRef.current = {
        ...stateRef.current,
        nodeCount: engineRef.current!.nodes.size
      };
      listenerRef.current.forEach(listener => listener());
    };
    
    engineRef.current.onSelectionChange = (node) => {
      stateRef.current = {
        ...stateRef.current,
        selectedNode: node ? { ...node } : null
      };
      listenerRef.current.forEach(listener => listener());
    };
  }

  // Subscribe to engine state changes
  const subscribe = useCallback((callback: () => void) => {
    listenerRef.current.add(callback);
    return () => listenerRef.current.delete(callback);
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Engine actions
  const toggleSimulation = useCallback(() => {
    const engine = engineRef.current!;
    engine.isRunning = !engine.isRunning;
    stateRef.current = {
      ...stateRef.current,
      isRunning: engine.isRunning
    };
    listenerRef.current.forEach(listener => listener());
  }, []);

  const setTickRate = useCallback((rate: number) => {
    engineRef.current!.tickRate = rate;
  }, []);

  const updateTickCount = useCallback(() => {
    stateRef.current = {
      ...stateRef.current,
      tickCount: engineRef.current!.tickCount
    };
  }, []);

  const refreshSelectedNode = useCallback(() => {
    const engine = engineRef.current!;
    if (engine.selectedNodeIds.size === 1) {
      const id = Array.from(engine.selectedNodeIds)[0];
      const node = engine.nodes.get(id);
      stateRef.current = {
        ...stateRef.current,
        selectedNode: node ? { ...node } : null
      };
      listenerRef.current.forEach(listener => listener());
    }
  }, []);

  return {
    engine: engineRef.current!,
    state,
    toggleSimulation,
    setTickRate,
    updateTickCount,
    refreshSelectedNode
  };
}
