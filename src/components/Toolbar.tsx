/**
 * Toolbar component - Left sidebar with tools and gates
 */

import {
  MousePointer2,
  ToggleLeft,
  Lightbulb,
  Activity,
  Cpu,
  ArrowRight,
  Book,
  type LucideIcon
} from 'lucide-react';
import type { ToolType } from '../engine/types';

interface ToolbarBtnProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToolbarBtn({ icon: Icon, label, active, onClick }: ToolbarBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`
        p-3 rounded-xl mb-3 flex flex-col items-center justify-center w-16 h-16 transition-all
        ${active 
          ? 'bg-blue-600 shadow-lg shadow-blue-900/50 text-white' 
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}
      `}
    >
      <Icon size={24} strokeWidth={1.5} />
      <span className="text-[10px] mt-1 font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

interface ToolbarProps {
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  isLibraryOpen: boolean;
  onLibraryToggle: () => void;
}

export function Toolbar({ tool, onToolChange, isLibraryOpen, onLibraryToggle }: ToolbarProps) {
  return (
    <div className="w-24 bg-[#18181a] border-r border-gray-800 flex flex-col items-center py-6 overflow-y-auto scrollbar-none shadow-xl z-10">
      <div className="mb-6 font-black text-2xl tracking-tighter text-blue-500">SIM</div>
      
      <ToolbarBtn
        icon={MousePointer2}
        label="Select"
        active={tool === 'SELECT'}
        onClick={() => onToolChange('SELECT')}
      />
      
      <div className="w-12 h-px bg-gray-700 my-4" />
      
      <ToolbarBtn
        icon={Book}
        label="Library"
        active={isLibraryOpen}
        onClick={onLibraryToggle}
      />
      
      <div className="w-12 h-px bg-gray-700 my-4" />
      
      <ToolbarBtn
        icon={ToggleLeft}
        label="Switch"
        active={tool === 'SWITCH'}
        onClick={() => onToolChange('SWITCH')}
      />
      <ToolbarBtn
        icon={Lightbulb}
        label="Light"
        active={tool === 'LIGHT'}
        onClick={() => onToolChange('LIGHT')}
      />
      <ToolbarBtn
        icon={Activity}
        label="Clock"
        active={tool === 'CLOCK'}
        onClick={() => onToolChange('CLOCK')}
      />
      
      <div className="w-12 h-px bg-gray-700 my-4" />
      
      <ToolbarBtn
        icon={Cpu}
        label="AND"
        active={tool === 'AND'}
        onClick={() => onToolChange('AND')}
      />
      <ToolbarBtn
        icon={Cpu}
        label="OR"
        active={tool === 'OR'}
        onClick={() => onToolChange('OR')}
      />
      <ToolbarBtn
        icon={Cpu}
        label="NOT"
        active={tool === 'NOT'}
        onClick={() => onToolChange('NOT')}
      />
      <ToolbarBtn
        icon={Cpu}
        label="NAND"
        active={tool === 'NAND'}
        onClick={() => onToolChange('NAND')}
      />
      <ToolbarBtn
        icon={Cpu}
        label="XOR"
        active={tool === 'XOR'}
        onClick={() => onToolChange('XOR')}
      />
      <ToolbarBtn
        icon={ArrowRight}
        label="Buffer"
        active={tool === 'BUFFER'}
        onClick={() => onToolChange('BUFFER')}
      />
    </div>
  );
}
