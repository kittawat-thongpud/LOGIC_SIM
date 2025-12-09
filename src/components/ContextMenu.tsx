/**
 * Context menu - Right-click menu for node operations
 */

import {
  Trash2,
  Files,
  BoxSelect,
  Ungroup,
  Package,
  Box,
  Save
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  hasGroup: boolean;
  isIC: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onPack: () => void;
  onUnpack: () => void;
  onSaveToLibrary: () => void;
}

export function ContextMenu({
  x,
  y,
  hasSelection,
  hasGroup,
  isIC,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  onPack,
  onUnpack,
  onSaveToLibrary
}: ContextMenuProps) {
  return (
    <div
      className="fixed bg-[#1f2937] border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col w-48 overflow-hidden"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onDuplicate}
        disabled={!hasSelection}
        className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50"
      >
        <Files size={14} className="mr-2" />
        Duplicate
      </button>

      <div className="h-px bg-gray-700 my-1" />

      <button
        onClick={onGroup}
        disabled={!hasSelection}
        className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50"
      >
        <BoxSelect size={14} className="mr-2" />
        Group Selection
      </button>
      <button
        onClick={onUngroup}
        disabled={!hasGroup}
        className="flex items-center px-4 py-2 hover:bg-blue-600 hover:text-white text-gray-300 text-sm text-left disabled:opacity-50"
      >
        <Ungroup size={14} className="mr-2" />
        Ungroup
      </button>

      <button
        onClick={onPack}
        disabled={!hasGroup}
        className="flex items-center px-4 py-2 hover:bg-purple-600 hover:text-white text-purple-300 text-sm text-left disabled:opacity-50"
      >
        <Package size={14} className="mr-2" />
        Pack to Component
      </button>

      <button
        onClick={onUnpack}
        disabled={!isIC}
        className="flex items-center px-4 py-2 hover:bg-purple-600 hover:text-white text-purple-300 text-sm text-left disabled:opacity-50"
      >
        <Box size={14} className="mr-2" />
        Unpack Component
      </button>

      <button
        onClick={onSaveToLibrary}
        disabled={!isIC}
        className="flex items-center px-4 py-2 hover:bg-green-600 hover:text-white text-green-400 text-sm text-left disabled:opacity-50"
      >
        <Save size={14} className="mr-2" />
        Save to Library
      </button>

      <div className="h-px bg-gray-700 my-1" />

      <button
        onClick={onDelete}
        className="flex items-center px-4 py-2 hover:bg-red-600 hover:text-white text-red-400 text-sm text-left"
      >
        <Trash2 size={14} className="mr-2" />
        Delete
      </button>
    </div>
  );
}
