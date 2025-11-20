
import React from 'react';
import { RackVariant } from '../types';
import { Screw } from './Screw';

interface RackProps {
  label?: string;
  splits: number;
  children?: React.ReactNode;
  variant?: RackVariant;
  onDropIndex?: (index: number) => void;
  editMode?: boolean;
  itemsCount?: number;
  height?: number;
}

export const Rack: React.FC<RackProps> = ({ 
  label, splits = 4, children, variant = 'basic', onDropIndex, editMode = false, itemsCount = 0, height
}) => {
  
  // Variants
  const getContainerStyle = () => {
      switch (variant) {
          case 'industrial':
              return 'bg-[#1a1a1a] border border-neutral-800 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]';
          case 'metal':
               return 'bg-zinc-900 bg-[linear-gradient(180deg,#27272a_0%,#18181b_100%)] border border-white/10 shadow-2xl';
          case 'framed':
              return 'bg-[#09090b] border-[3px] border-[#27272a] rounded-lg shadow-inner';
          case 'cyber':
              return 'bg-black border border-cyan-900/50 shadow-[0_0_15px_rgba(8,145,178,0.1),inset_0_0_20px_rgba(8,145,178,0.05)]';
          default: // basic
              return 'bg-[#0c0c0c] border-r border-white/5';
      }
  };

  const gridStyle = {
      display: 'grid',
      gridTemplateRows: `repeat(${Math.max(1, splits)}, 1fr)`,
      gap: '1px',
      height: '100%'
  };

  return (
    <div className={`w-full flex flex-col relative group overflow-hidden select-none ${getContainerStyle()}`} style={{ height: height || 400 }}>
        
        {/* Textures & Details */}
        {variant === 'industrial' && (
            <>
                <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), repeating-linear-gradient(45deg, #000 25%, #222 25%, #222 75%, #000 75%, #000)', backgroundSize: '4px 4px', backgroundPosition: '0 0, 2px 2px'}}></div>
                <div className="absolute top-1.5 left-1.5 pointer-events-none"><Screw size={12} color="#333" /></div>
                <div className="absolute top-1.5 right-1.5 pointer-events-none"><Screw size={12} color="#333" /></div>
                <div className="absolute bottom-1.5 left-1.5 pointer-events-none"><Screw size={12} color="#333" /></div>
                <div className="absolute bottom-1.5 right-1.5 pointer-events-none"><Screw size={12} color="#333" /></div>
            </>
        )}
        
        {variant === 'metal' && (
             <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')]"></div>
        )}

        {variant === 'cyber' && (
             <>
                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-500"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-500"></div>
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-500"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-500"></div>
             </>
        )}

        {/* Label */}
        {label && (
            <div className="absolute top-0 inset-x-0 flex justify-center -mt-2 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                 <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest bg-black/80 backdrop-blur px-3 py-1 rounded-b border border-t-0 border-white/10 shadow-lg">{label}</span>
            </div>
        )}

        {/* Grid Content */}
        <div className="flex-1 w-full relative" style={gridStyle}>
             {/* Separators */}
             {Array.from({ length: splits - 1 }).map((_, i) => (
                 <div 
                    key={`sep-${i}`} 
                    className={`absolute left-0 w-full h-px pointer-events-none z-0
                        ${variant === 'cyber' ? 'bg-cyan-900/30 shadow-[0_0_5px_rgba(6,182,212,0.2)]' : 'bg-black shadow-[0_1px_0_rgba(255,255,255,0.05)]'}
                    `}
                    style={{ top: `${((i + 1) / splits) * 100}%` }}
                 ></div>
             ))}
             
             {children}
        </div>
    </div>
  );
};