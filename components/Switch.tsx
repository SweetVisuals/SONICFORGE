
import React from 'react';

interface SwitchProps {
  value: number;
  onChange: (val: number) => void;
  label: string;
  color?: string;
  style?: string; // 'classic' | 'cyber' | 'analog' | 'flat'
}

export const Switch: React.FC<SwitchProps> = ({ 
  value, onChange, label, color = '#3b82f6', style = 'classic' 
}) => {
  const isActive = value > 0; 

  // 1. CYBER: Rectangular Glowing Button
  if (style === 'cyber') {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full p-2">
            <button
                onClick={() => onChange(isActive ? 0 : 1)}
                className={`relative w-full h-8 max-w-[60px] rounded border flex items-center justify-center transition-all duration-200 overflow-hidden
                    ${isActive 
                        ? `bg-black text-white shadow-[0_0_15px_${color}]` 
                        : 'bg-[#0a0a0a] border-white/10 text-neutral-600'}
                `}
                style={{ 
                    borderColor: isActive ? color : undefined,
                    textShadow: isActive ? `0 0 8px ${color}` : 'none'
                }}
            >
                {isActive && <div className="absolute inset-0 opacity-20" style={{ backgroundColor: color }}></div>}
                <span className="relative z-10 text-[9px] font-bold tracking-widest uppercase">
                    {isActive ? 'ON' : 'OFF'}
                </span>
            </button>
            <span className="text-[8px] text-neutral-600 font-mono uppercase mt-1.5 tracking-tight">{label}</span>
        </div>
      );
  }

  // 2. ANALOG: Metal Toggle Switch
  if (style === 'analog') {
      return (
          <div className="flex flex-col items-center justify-center w-full h-full">
              <div 
                onClick={() => onChange(isActive ? 0 : 1)}
                className="relative w-8 h-14 cursor-pointer"
              >
                  {/* Base Plate */}
                  <div className="absolute inset-0 bg-[#18181b] rounded-full border border-black shadow-lg"></div>
                  <div className="absolute inset-[2px] bg-[#27272a] rounded-full border border-white/5"></div>
                  
                  {/* Nut */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-[#52525b] bg-gradient-to-br from-neutral-600 to-neutral-800 shadow-md z-10"></div>
                  
                  {/* Lever Shadow */}
                  <div 
                      className={`absolute left-1/2 w-3 h-6 bg-black/50 blur-sm rounded-full transition-all duration-150
                         ${isActive ? 'top-2' : 'bottom-2'}
                      `}
                      style={{ transform: 'translateX(-50%)' }}
                  ></div>

                  {/* Lever */}
                  <div 
                      className={`absolute left-1/2 w-2.5 h-7 bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-300 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-all duration-150 ease-out origin-center z-20
                         ${isActive ? 'top-1 -translate-x-1/2' : 'bottom-1 -translate-x-1/2'}
                      `}
                  ></div>
              </div>
              <div className="flex items-center mt-2 space-x-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-[#121212] border border-white/10'}`}></div>
                  <span className="text-[8px] font-bold uppercase text-neutral-500">{label}</span>
              </div>
          </div>
      )
  }

  // 3. FLAT / MODERN
  if (style === 'soft') {
      return (
          <div className="flex flex-col items-center justify-center w-full h-full p-1">
              <div className="flex items-center justify-between w-full bg-black/40 rounded p-1 border border-white/5 cursor-pointer" onClick={() => onChange(isActive ? 0 : 1)}>
                 <span className="text-[8px] font-bold uppercase text-neutral-400 pl-1">{label}</span>
                 <div className={`w-8 h-4 rounded-full relative transition-colors ${isActive ? 'bg-neutral-700' : 'bg-neutral-900'}`}>
                     <div 
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-current shadow-sm transition-all ${isActive ? 'left-[18px]' : 'left-0.5'}`}
                        style={{ color: isActive ? color : '#52525b' }}
                     ></div>
                 </div>
              </div>
          </div>
      )
  }

  // 4. CLASSIC: Simple Toggle
  return (
    <div className="flex flex-col items-center justify-center w-full h-full space-y-2">
      <button
        onClick={() => onChange(isActive ? 0 : 1)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ease-in-out focus:outline-none border border-transparent
           ${isActive ? 'bg-[#1a1a1a]' : 'bg-[#09090b]'}
        `}
        style={{ 
            backgroundColor: isActive ? '#18181b' : '#050505',
            borderColor: isActive ? color : '#27272a'
        }}
      >
         <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full shadow-sm transition-transform duration-200 ease-out
             ${isActive ? 'translate-x-4 bg-current' : 'translate-x-0 bg-neutral-600'}
         `}
         style={{ color: isActive ? color : undefined }}
         ></div>
      </button>
      <span className="text-[8px] font-bold uppercase text-neutral-500 tracking-wider">{label}</span>
    </div>
  );
};