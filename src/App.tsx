/**
 * LogicSim - Main Application Component
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Toolbar,
  Header,
  LibraryDrawer,
  ContextMenu,
  PropertiesPanel,
  EmptyPropertiesPanel,
  Canvas,
  PWAInstallPrompt
} from './components';
import { useEngine, useLibrary } from './hooks';
import { libraryItemToNodeTemplate, type LibraryItem, exportLibraryToJSON, importLibraryFromJSON } from './storage';
import type { LogicNode, ToolType } from './engine/types';

function App() {
  // Engine hook
  const { engine, state, toggleSimulation, setTickRate } = useEngine();

  // UI state
  const [tool, setTool] = useState<ToolType>('SELECT');
  const [speed, setSpeed] = useState(100);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<Partial<LogicNode> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [tickCount, setTickCount] = useState(0);

  // Library hook
  const { items: libraryItems, saveIC, deleteItem: deleteLibraryItem, refresh: refreshLibrary } = useLibrary();

  // Sync speed with engine
  useEffect(() => {
    setTickRate(speed);
  }, [speed, setTickRate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        engine.deleteSelected();
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        setTool('SELECT');
        setActiveTemplate(null);
      }
      
      // Clipboard
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') {
          e.preventDefault();
          engine.copy();
        }
        if (e.key === 'v') {
          e.preventDefault();
          engine.paste();
        }
        if (e.key === 'x') {
          e.preventDefault();
          engine.cut();
        }
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            engine.redo();
          } else {
            engine.undo();
          }
        }
        if (e.key === 'y') {
          e.preventDefault();
          engine.redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  // Close context menu on click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Tool change handler
  const handleToolChange = useCallback((newTool: ToolType) => {
    setTool(newTool);
    if (newTool !== 'IC') {
      setActiveTemplate(null);
    }
  }, []);

  // Library item selection
  const handleSelectFromLibrary = useCallback((item: LibraryItem) => {
    const template = libraryItemToNodeTemplate(item);
    setActiveTemplate(template);
    setTool('IC');
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleDelete = useCallback(() => {
    engine.deleteSelected();
    setContextMenu(null);
  }, [engine]);

  const handleDuplicate = useCallback(() => {
    engine.duplicateSelected();
    setContextMenu(null);
  }, [engine]);

  const handleGroup = useCallback(() => {
    engine.createGroupFromSelection();
    setContextMenu(null);
  }, [engine]);

  const handleUngroup = useCallback(() => {
    engine.ungroupSelected();
    setContextMenu(null);
  }, [engine]);

  const handlePack = useCallback(() => {
    engine.packGroupToIC();
    setContextMenu(null);
  }, [engine]);

  const handleUnpack = useCallback(() => {
    engine.unpackICToGroup();
    setContextMenu(null);
  }, [engine]);

  const handleSaveToLibrary = useCallback(async () => {
    if (state.selectedNode && state.selectedNode.type === 'IC') {
      await saveIC(state.selectedNode);
      setIsLibraryOpen(true);
    }
    setContextMenu(null);
  }, [state.selectedNode, saveIC]);

  // Properties panel handlers
  const handleLabelChange = useCallback((label: string) => {
    if (state.selectedNode) {
      engine.updateNodeData(state.selectedNode.id, { label });
    }
  }, [engine, state.selectedNode]);

  const handleColorChange = useCallback((color: string) => {
    if (state.selectedNode) {
      engine.updateNodeData(state.selectedNode.id, { color });
    }
  }, [engine, state.selectedNode]);

  const handleIOLabelChange = useCallback((type: 'input' | 'output', index: number, value: string) => {
    if (state.selectedNode && state.selectedNode.ioMap) {
      const map = { ...state.selectedNode.ioMap };
      if (type === 'input') map.inputs[index] = value;
      else map.outputs[index] = value;
      engine.updateNodeData(state.selectedNode.id, { ioMap: map });
    }
  }, [engine, state.selectedNode]);

  const handleCloseProperties = useCallback(() => {
    engine.selectedNodeIds.clear();
    engine.triggerUpdate();
  }, [engine]);

  const handleExportLibrary = useCallback(async () => {
    try {
      const json = await exportLibraryToJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logic-sim-library-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export library:', err);
      alert('Failed to export library');
    }
  }, []);

  const handleImportLibrary = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const count = await importLibraryFromJSON(text);
      alert(`Successfully imported ${count} items to library.`);
      refreshLibrary();
    } catch (err) {
      console.error('Failed to import library:', err);
      alert('Failed to import library. Invalid file format?');
    }
  }, [refreshLibrary]);

  // Check for group/IC in selection
  const hasGroup = Array.from(engine.selectedNodeIds).some(
    id => engine.nodes.get(id)?.type === 'GROUP'
  );
  const isIC = Array.from(engine.selectedNodeIds).some(
    id => engine.nodes.get(id)?.type === 'IC'
  );

  return (
    <div 
      className="flex h-screen bg-[#111] text-gray-100 font-sans overflow-hidden select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Left Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={handleToolChange}
        isLibraryOpen={isLibraryOpen}
        onLibraryToggle={() => setIsLibraryOpen(!isLibraryOpen)}
      />

      {/* Library Drawer */}
      {isLibraryOpen && (
        <LibraryDrawer
          items={libraryItems}
          activeItemName={activeTemplate?.label}
          onSelect={handleSelectFromLibrary}
          onDelete={deleteLibraryItem}
          onExport={handleExportLibrary}
          onImport={handleImportLibrary}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-[#0f0f0f]">
        {/* Header */}
        <Header
          isPlaying={state.isRunning}
          onPlayToggle={toggleSimulation}
          speed={speed}
          onSpeedChange={setSpeed}
          nodeCount={state.nodeCount}
          onDelete={() => engine.deleteSelected()}
          activeTemplateName={tool === 'IC' && activeTemplate ? activeTemplate.label : undefined}
        />

        {/* Canvas */}
        <Canvas
          engine={engine}
          tool={tool}
          activeTemplate={activeTemplate}
          tickCount={tickCount}
          onContextMenu={handleContextMenu}
          onTickUpdate={setTickCount}
          onToolReset={() => {
            setTool('SELECT');
            setActiveTemplate(null);
          }}
        />

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            hasSelection={engine.selectedNodeIds.size > 0}
            hasGroup={hasGroup}
            isIC={isIC}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
            onPack={handlePack}
            onUnpack={handleUnpack}
            onSaveToLibrary={handleSaveToLibrary}
          />
        )}
      </div>

      {/* Right Properties Panel */}
      {state.selectedNode ? (
        <PropertiesPanel
          node={state.selectedNode}
          onLabelChange={handleLabelChange}
          onColorChange={handleColorChange}
          onIOLabelChange={handleIOLabelChange}
          onIOMappingChange={(type, pinIndex, portIndex) => {
            if (state.selectedNode) {
              if (typeof engine.updateIOMapping === 'function') {
                engine.updateIOMapping(state.selectedNode.id, type, pinIndex, portIndex);
              } else {
                alert("Please refresh the page to load the new engine features.");
              }
            }
          }}
          onClose={handleCloseProperties}
        />
      ) : (
        <EmptyPropertiesPanel />
      )}

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}

export default App;
