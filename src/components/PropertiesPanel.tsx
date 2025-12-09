/**
 * Properties panel - Right sidebar for editing selected node
 */

import { Settings, X, Type, Palette, Terminal } from 'lucide-react';
import type { LogicNode } from '../engine/types';
import { COLORS } from '../engine/constants';

interface PropertiesPanelProps {
  node: LogicNode;
  onLabelChange: (label: string) => void;
  onColorChange: (color: string) => void;
  onIOLabelChange: (type: 'input' | 'output', index: number, label: string) => void;
  onIOMappingChange: (type: 'input' | 'output', pinIndex: number, portIndex: number) => void;
  onClose: () => void;
}

function LogicEquation({ node }: { node: LogicNode }) {
  // ... (keep existing LogicEquation)
  const i = node.inputs;
  const o = node.outputs;
  const toBit = (b: boolean) => b ? '1' : '0';
  const color = (b: boolean) => b ? 'text-green-400' : 'text-gray-500';

  let equation: React.ReactNode = <div>Unknown</div>;

  switch (node.type) {
    // ... (keep existing switch cases)
    case 'AND':
      equation = (
        <div className="font-mono text-lg">
          <span className={color(i[0])}>{toBit(i[0])}</span> &amp;{' '}
          <span className={color(i[1])}>{toBit(i[1])}</span> ={' '}
          <span className={color(o[0])}>{toBit(o[0])}</span>
        </div>
      );
      break;
    case 'OR':
      equation = (
        <div className="font-mono text-lg">
          <span className={color(i[0])}>{toBit(i[0])}</span> |{' '}
          <span className={color(i[1])}>{toBit(i[1])}</span> ={' '}
          <span className={color(o[0])}>{toBit(o[0])}</span>
        </div>
      );
      break;
    case 'NOT':
      equation = (
        <div className="font-mono text-lg">
          ! <span className={color(i[0])}>{toBit(i[0])}</span> ={' '}
          <span className={color(o[0])}>{toBit(o[0])}</span>
        </div>
      );
      break;
    case 'XOR':
      equation = (
        <div className="font-mono text-lg">
          <span className={color(i[0])}>{toBit(i[0])}</span> ^{' '}
          <span className={color(i[1])}>{toBit(i[1])}</span> ={' '}
          <span className={color(o[0])}>{toBit(o[0])}</span>
        </div>
      );
      break;
    case 'NAND':
      equation = (
        <div className="font-mono text-lg">
          !(<span className={color(i[0])}>{toBit(i[0])}</span> &amp;{' '}
          <span className={color(i[1])}>{toBit(i[1])}</span>) ={' '}
          <span className={color(o[0])}>{toBit(o[0])}</span>
        </div>
      );
      break;
    case 'SWITCH':
      equation = (
        <div className="font-mono text-lg">
          STATE: <span className={color(o[0])}>{o[0] ? 'ON' : 'OFF'}</span>
        </div>
      );
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
              IN: {i.map(toBit).join('')} → OUT: {o.map(toBit).join('')}
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
            <span className="text-gray-500"> → </span>
            <span className={o.some(x => x) ? 'text-green-400' : 'text-gray-500'}>
              OUT[{outputBits}]
            </span>
          </div>
        );
      }
      break;
    default:
      equation = (
        <div className="font-mono text-sm text-gray-500">
          I: {JSON.stringify(i.map(toBit))} <br />
          O: {JSON.stringify(o.map(toBit))}
        </div>
      );
  }

  return (
    <div className="bg-black/40 p-3 rounded-lg border border-gray-800">
      <div className="text-xs text-gray-500 mb-2 flex items-center">
        <Terminal size={12} className="mr-1" />
        DEBUG STATE
      </div>
      {equation}
    </div>
  );
}

export function PropertiesPanel({
  node,
  onLabelChange,
  onColorChange,
  onIOMappingChange,
  onClose
}: PropertiesPanelProps) {
  return (
    <div className="w-72 bg-[#18181a] border-l border-gray-800 flex flex-col p-6 z-20 shadow-xl overflow-y-auto">
      <div className="flex items-center mb-6 text-gray-200">
        <Settings size={18} className="mr-2 text-blue-500" />
        <span className="font-bold text-lg">PROPERTIES</span>
        <button className="ml-auto hover:text-white text-gray-500" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="mb-6">
        <label className="text-xs font-bold text-gray-500 mb-2 flex items-center">
          <Type size={12} className="mr-1" />
          LABEL
        </label>
        <input
          type="text"
          value={node.label || ''}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Enter name..."
          className="w-full bg-[#0f0f0f] border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
        />
      </div>

      {node.type !== 'GROUP' && node.type !== 'IC' && (
        <div className="mb-6">
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center">
            <Palette size={12} className="mr-1" />
            WIRE COLOR
          </label>
          <div className="flex items-center space-x-3 bg-[#0f0f0f] p-2 rounded border border-gray-700">
            <input
              type="color"
              value={node.color || COLORS.wireOn}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
            />
            <span className="text-xs text-gray-400 font-mono">
              {node.color || COLORS.wireOn}
            </span>
          </div>
        </div>
      )}

      {node.type === 'IC' && node.ioMap && (
        <div className="mb-6 border-t border-gray-800 pt-4">
          <label className="text-xs font-bold text-gray-500 mb-2 flex items-center">
            IO CONFIGURATION
          </label>
          <div className="space-y-2">
            {Array.from({ length: node.inputCount || 0 }).map((_, pinIndex) => {
                const portIndex = node.inputMapping ? node.inputMapping[pinIndex] : pinIndex;
                return (
                  <div key={`in-${pinIndex}`} className="flex items-center space-x-2">
                    <span className="text-xs text-blue-400 font-mono w-6">PIN{pinIndex}</span>
                    <select
                        className="bg-[#0f0f0f] border border-gray-700 rounded px-1 py-1 text-xs text-gray-300 flex-1"
                        value={portIndex}
                        onChange={(e) => onIOMappingChange('input', pinIndex, parseInt(e.target.value))}
                    >
                        {node.ioMap?.inputs.map((lbl, idx) => (
                            <option key={idx} value={idx}>{lbl}</option>
                        ))}
                    </select>
                  </div>
                );
            })}
            <div className="h-px bg-gray-800 my-2" />
            {Array.from({ length: node.outputCount || 0 }).map((_, pinIndex) => {
                const portIndex = node.outputMapping ? node.outputMapping[pinIndex] : pinIndex;
                return (
                  <div key={`out-${pinIndex}`} className="flex items-center space-x-2">
                    <span className="text-xs text-green-400 font-mono w-6">PIN{pinIndex}</span>
                    <select
                        className="bg-[#0f0f0f] border border-gray-700 rounded px-1 py-1 text-xs text-gray-300 flex-1"
                        value={portIndex}
                        onChange={(e) => onIOMappingChange('output', pinIndex, parseInt(e.target.value))}
                    >
                        {node.ioMap?.outputs.map((lbl, idx) => (
                            <option key={idx} value={idx}>{lbl}</option>
                        ))}
                    </select>
                  </div>
                );
            })}
          </div>
        </div>
      )}

      <div className="mb-auto">
        <LogicEquation node={node} />
      </div>

      <div className="mt-6 pt-6 border-t border-gray-800 text-xs text-gray-600">
        ID: {node.id} <br />
        TYPE: {node.type} <br />
        {node.groupId && `GROUP: ${node.groupId}`}
      </div>
    </div>
  );
}

export function EmptyPropertiesPanel() {
  return (
    <div className="hidden w-72 bg-[#18181a] border-l border-gray-800 lg:flex flex-col items-center justify-center text-gray-600 p-6 z-20">
      <Settings size={48} className="mb-4 opacity-20" />
      <div className="text-sm text-center">
        Select a node to<br />view its properties
      </div>
    </div>
  );
}
