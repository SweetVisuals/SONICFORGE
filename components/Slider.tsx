
import React, { useState, useRef, useEffect } from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  label: string;
  unit?: string;
  color?: string;
  orientation?: 'vertical' | 'horizontal';
  style?: string; // 'classic' | 'cyber' | 'analog'
}

export const Slider: React.FC<SliderProps> = ({ 
  value, min, max, onChange, label, unit, 
  color = '#3b82f6', orientation = 'vertical', style = 'classic' 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  
  const range = max - min;
  const percentage = Math.min(1, Math.max(0, (value - min) / range));
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    updateValueFromMouse(e.clientX, e.clientY);
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (isDragging) {
              updateValueFromMouse(e.clientX, e.clientY);
          }
      };
      const handleMouseUp = () => setIsDragging(false);
      
      if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging, min, max, orientation]);

  const updateValueFromMouse = (clientX: number, clientY: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let pct = 0;
      
      if (orientation === 'vertical') {
          pct = 1 - ((clientY - rect.top) / rect.height);
      } else {
          pct = (clientX - rect.left) / rect.width;
      }
      
      pct = Math.min(1, Math.max(0, pct));
      const newValue = min + (pct * (max - min));
      onChange(newValue);
  };

  const isVertical = orientation === 'vertical';
  const containerClass = isVertical ? 'flex-col h-32 w-10' : 'flex-row w-full h-10';
  
  // --- STYLES ---

  // 1. CYBER: Neon bar, minimal handle
  if (style === 'cyber') {
      return (
          <div className={`flex ${containerClass} items-center justify-center group relative`}>
              <div 
                  ref={trackRef}
                  onMouseDown={handleMouseDown}
                  className={`relative cursor-pointer bg-black border border-white/10 rounded shadow-inner overflow-hidden
                      ${isVertical ? 'w-3 h-full' : 'h-3 w-full'}
                  `}
              >
                   {/* Background Grid Pattern */}
                   <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '4px 4px' }}></div>

                   {/* Active Fill */}
                   <div 
                        className={`absolute bg-current shadow-[0_0_10px_currentColor] transition-all duration-75`}
                        style={{ 
                            color: color,
                            backgroundColor: color,
                            left: 0, bottom: 0,
                            width: isVertical ? '100%' : `${percentage * 100}%`,
                            height: isVertical ? `${percentage * 100}%` : '100%'
                        }}
                   />
              </div>

              {/* Label */}
              <div className={`absolute pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-1 rounded text-[9px] font-mono font-bold text-white
                  ${isVertical ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-1' : 'left-0 top-1/2 -translate-y-1/2 -translate-x-full mr-2'}
              `}>
                  {value.toFixed(1)}
              </div>
          </div>
      )
  }

  // 2. ANALOG: Realistic cap, slotted track
  if (style === 'analog') {
      const trackLength = isVertical ? 'h-full' : 'w-full';
      return (
          <div className={`flex ${containerClass} items-center justify-center group`}>
             <div 
                ref={trackRef}
                onMouseDown={handleMouseDown}
                className={`relative ${trackLength} flex items-center justify-center cursor-pointer`}
             >
                 {/* Slot Track */}
                 <div className={`bg-black shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] rounded-full border border-white/5
                     ${isVertical ? 'w-1.5 h-full' : 'h-1.5 w-full'}
                 `}></div>
                 
                 {/* Realistic Cap */}
                 <div 
                    className={`absolute shadow-[0_4px_8px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.3)] bg-gradient-to-b from-[#333] to-[#111] border border-black rounded-sm flex items-center justify-center
                        ${isVertical ? 'w-6 h-10' : 'h-6 w-10'}
                    `}
                    style={{
                        left: isVertical ? '50%' : `${percentage * 100}%`,
                        top: isVertical ? `${(1 - percentage) * 100}%` : '50%',
                        transform: 'translate(-50%, -50%)'
                    }}
                 >
                     {/* Cap Grip Lines */}
                     <div className={`border-neutral-600 ${isVertical ? 'w-full border-t border-b h-1/3' : 'h-full border-l border-r w-1/3'}`}></div>
                     {/* Indicator Line */}
                     <div className={`absolute bg-white opacity-80 shadow-[0_0_2px_white] ${isVertical ? 'w-full h-[1px]' : 'h-full w-[1px]'}`}></div>
                 </div>
             </div>
          </div>
      );
  }

  // 3. CLASSIC: Standard
  const trackSize = isVertical ? 'w-1.5 h-full' : 'w-full h-1.5';
  return (
    <div className={`flex ${containerClass} items-center justify-center gap-2 group`}>
       <div 
          ref={trackRef}
          onMouseDown={handleMouseDown}
          className={`relative ${isVertical ? 'w-8 h-full' : 'w-full h-8'} flex items-center justify-center cursor-pointer`}
       >
           {/* Track Rail */}
           <div className={`rounded-full bg-neutral-900 shadow-inner border border-white/5 ${trackSize}`}></div>

           {/* Thumb */}
           <div 
              className={`absolute shadow-lg rounded bg-neutral-400 border border-white/20
                 ${isVertical ? 'w-8 h-4' : 'h-8 w-4'}
              `}
              style={{
                  left: isVertical ? '50%' : `${percentage * 100}%`,
                  top: isVertical ? `${(1 - percentage) * 100}%` : '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: '#52525b'
              }}
           >
              <div className={`absolute bg-white/50 ${isVertical ? 'left-0 right-0 top-1/2 h-px -translate-y-1/2' : 'top-0 bottom-0 left-1/2 w-px -translate-x-1/2'}`}></div>
           </div>
       </div>
    </div>
  );
};
