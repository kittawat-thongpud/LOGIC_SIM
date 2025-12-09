/**
 * Library drawer - Side panel showing saved IC components
 */

import { Book, Trash2, Download, Upload } from 'lucide-react';
import type { LibraryItem } from '../storage';

interface LibraryDrawerProps {
  items: LibraryItem[];
  activeItemName?: string;
  onSelect: (item: LibraryItem) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function LibraryDrawer({ items, activeItemName, onSelect, onDelete, onExport, onImport }: LibraryDrawerProps) {
  return (
    <div className="w-64 bg-[#18181a] border-r border-gray-800 flex flex-col p-4 shadow-xl z-20 overflow-y-auto">
      <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center">
        <Book size={16} className="mr-2" />
        SAVED CHIPS
      </h2>
      
      <div className="flex-1 overflow-y-auto mb-4">
        {items.length === 0 ? (
          <div className="text-xs text-gray-600 text-center py-8">
            Library is empty.<br />
            Right-click a packed chip to save it.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`
                  p-3 rounded bg-gray-800 border hover:border-blue-500 cursor-pointer group flex items-center justify-center
                  ${activeItemName === item.name ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700'}
                `}
                onClick={() => onSelect(item)}
              >
                <div className="flex-1">
                  <div className="font-bold text-sm text-gray-200">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.inputCount} IN / {item.outputCount} OUT
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-800 flex space-x-2">
        <button 
            onClick={onExport}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 py-2 rounded flex items-center justify-center transition-colors"
            title="Export Library to JSON"
        >
            <Download size={14} className="mr-2" /> Export
        </button>
        <label className="flex-1 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 py-2 rounded flex items-center justify-center cursor-pointer transition-colors" title="Import Library from JSON">
            <Upload size={14} className="mr-2" /> Import
            <input 
                type="file" 
                className="hidden" 
                accept=".json"
                onChange={(e) => {
                    if (e.target.files?.[0]) {
                        onImport(e.target.files[0]);
                        e.target.value = ''; // Reset input
                    }
                }}
            />
        </label>
      </div>
    </div>
  );
}
