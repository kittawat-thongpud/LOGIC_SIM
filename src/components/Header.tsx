/**
 * Header component - Top bar with simulation controls
 */

import { Play, Pause, Plus, Minus, Trash2, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks';

interface HeaderProps {
  isPlaying: boolean;
  onPlayToggle: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  nodeCount: number;
  onDelete: () => void;
  activeTemplateName?: string;
}

export function Header({
  isPlaying,
  onPlayToggle,
  speed,
  onSpeedChange,
  nodeCount,
  onDelete,
  activeTemplateName
}: HeaderProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className="h-16 bg-[#18181a]/90 backdrop-blur border-b border-gray-800 flex items-center justify-between px-6 shadow-sm z-10">
      <div className="flex items-center space-x-6">
        <button
          onClick={onPlayToggle}
          className={`
            flex items-center space-x-2 px-5 py-2.5 rounded-lg font-bold transition-all active:scale-95
            ${isPlaying
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}
          `}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          <span>{isPlaying ? 'PAUSE' : 'SIMULATE'}</span>
        </button>

        <div className="h-8 w-px bg-gray-700" />

        <div className="flex items-center space-x-3 bg-gray-800/50 rounded-lg p-1.5">
          <button
            onClick={() => onSpeedChange(Math.max(10, speed - 10))}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <Minus size={16} />
          </button>
          <span className="text-xs font-mono w-20 text-center text-gray-400">
            {speed}ms / tick
          </span>
          <button
            onClick={() => onSpeedChange(Math.min(500, speed + 10))}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center text-sm text-gray-500 space-x-4">
        {!isOnline && (
          <div className="flex items-center text-amber-400 text-xs">
            <WifiOff size={14} className="mr-1" />
            Offline
          </div>
        )}
        
        {activeTemplateName && (
          <div className="text-blue-400 text-xs font-bold px-3 py-1 bg-blue-900/30 rounded border border-blue-900">
            PLACING: {activeTemplateName}
          </div>
        )}
        
        <div className="font-mono">NODES: {nodeCount}</div>
        
        <button
          onClick={onDelete}
          className="p-2 hover:text-red-400 transition-colors"
          title="Delete Selected"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
