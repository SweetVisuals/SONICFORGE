
import React, { useState, useRef, useEffect } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  label: string;
  unit?: string;
  color?: string;
  size?: number;
  variant?: string; // 'classic' | 'soft' | 'tech' | 'cyber' | 'ring' | 'analog'
}

export const Knob: React.FC<KnobProps> = ({ 
  value, min, max, onChange, label, unit, 
  color = '#3b82f6', size = 56, variant = 'classic' 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startValue = useRef(0);
  
  // Use ref for onChange to keep useEffect dependencies stable
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clampedValue = Math.min(max, Math.max(min, value));
  const percentage = (clampedValue - min) / (max - min);
  
  const startAngle = -135;
  const endAngle = 135;
  const angleRange = endAngle - startAngle;
  const currentAngle = startAngle + (percentage * angleRange);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      const deltaValue = (deltaY / 150) * range; 
      let newValue = startValue.current + deltaValue;
      newValue = Math.min(max, Math.max(min, newValue));
      
      if (min < 0 && max > 0 && Math.abs(newValue) < range * 0.02) {
          newValue = 0;
      }
      // Use ref to call latest callback without re-binding listeners
      onChangeRef.current(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, max, min]); // onChange removed from dependency array

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  }

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
      const start = polarToCartesian(x, y, radius, endAngle);
      const end = polarToCartesian(x, y, radius, startAngle);
      const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
      return [
          "M", start.x, start.y, 
          "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
      ].join(" ");
  }

  // Dimensions
  const cx = size / 2;
  const cy = size / 2;
  
  // Variant Configurations
  let trackWidth = size * 0.08;
  let trackRadius = (size / 2) - trackWidth;
  let knobSize = size * 0.6;
  
  if (variant === 'ring') {
      trackWidth = size * 0.08;
      trackRadius = (size/2) - 4;
      knobSize = size * 0.55;
  } else if (variant === 'analog') {
      trackWidth = 2;
      trackRadius = (size / 2) - 6;
      knobSize = size * 0.8;
  } else if (variant === 'cyber') {
      trackWidth = 4;
      trackRadius = (size / 2) - 4;
      knobSize = size * 0.7;
  }

  return (
    <div className="flex flex-col items-center space-y-1 group">
      <div 
        ref={knobRef}
        onMouseDown={handleMouseDown}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="relative cursor-ns-resize outline-none select-none transition-transform active:scale-95"
        style={{ width: size, height: size }}
      >
        {/* SVG Layer for Arc */}
        <svg width={size} height={size} className="absolute top-0 left-0 pointer-events-none overflow-visible">
            {/* Track Background */}
            {variant !== 'analog' && (
                 <path 
                    d={describeArc(cx, cy, trackRadius, startAngle, endAngle)} 
                    fill="none" 
                    stroke={variant === 'cyber' ? '#1a1a1a' : '#27272a'} 
                    strokeWidth={trackWidth} 
                    strokeLinecap="round"
                />
            )}

            {/* Value Arc */}
            {variant !== 'analog' && (
                <path 
                    d={describeArc(cx, cy, trackRadius, startAngle, currentAngle)} 
                    fill="none" 
                    stroke={color} 
                    strokeWidth={trackWidth} 
                    strokeLinecap={variant === 'cyber' ? 'butt' : 'round'}
                    className="transition-all duration-75"
                    style={{ 
                        filter: variant === 'cyber' || variant === 'ring' ? `drop-shadow(0 0 4px ${color})` : 'none',
                        strokeOpacity: variant === 'tech' ? 0.5 : 1
                    }}
                />
            )}

            {/* Analog Ticks */}
            {variant === 'analog' && (
                 Array.from({ length: 11 }).map((_, i) => {
                     const angle = startAngle + (i * (angleRange / 10));
                     const pos1 = polarToCartesian(cx, cy, size/2, angle);
                     const pos2 = polarToCartesian(cx, cy, size/2 - 4, angle);
                     return (
                         <line key={i} x1={pos1.x} y1={pos1.y} x2={pos2.x} y2={pos2.y} stroke="#52525b" strokeWidth={1} />
                     )
                 })
            )}
        </svg>
        
        {/* Knob Body */}
        <div 
            className={`absolute rounded-full flex items-center justify-center transition-shadow
              ${variant === 'soft' ? 'bg-zinc-800' : ''}
              ${variant === 'tech' ? 'bg-black border border-white/10' : ''}
              ${variant === 'classic' ? 'bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.5)]' : ''}
              ${variant === 'ring' ? 'bg-[#09090b] border border-white/5 shadow-inner' : ''}
              ${variant === 'cyber' ? 'bg-black border border-neutral-800' : ''}
              ${variant === 'analog' ? 'bg-gradient-to-br from-neutral-200 to-neutral-400 shadow-[0_4px_8px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.5)]' : ''}
            `}
            style={{ 
              width: knobSize, 
              height: knobSize, 
              left: (size - knobSize) / 2,
              top: (size - knobSize) / 2,
              transform: `rotate(${currentAngle}deg)`
            }}
        >
             {/* Indicator */}
            {variant === 'tech' || variant === 'cyber' ? (
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}></div>
            ) : variant === 'ring' ? (
               <div className="absolute top-1 w-1 h-1 rounded-full bg-white opacity-80"></div>
            ) : variant === 'analog' ? (
               <div className="absolute top-2 w-0.5 h-3 bg-black/60 rounded-full"></div>
            ) : (
              <div 
                className={`absolute rounded-full ${variant === 'soft' ? 'bg-zinc-400' : 'bg-white shadow-[0_0_2px_rgba(255,255,255,0.5)]'}`}
                style={{ width: 2, height: knobSize * 0.3, top: knobSize * 0.1 }}
              />
            )}
        </div>
      </div>
      
      <div className="text-center flex flex-col items-center pointer-events-none">
        <span className={`text-[9px] font-bold uppercase tracking-wider leading-tight mb-0.5 ${variant === 'tech' ? 'font-mono' : ''} text-zinc-500`}>{label}</span>
        <span className={`text-[10px] font-mono text-zinc-400 group-hover:text-white transition-colors ${isDragging ? 'text-' + color : ''}`}>
            {value.toFixed(unit === 'Hz' ? 0 : 1)}{unit}
        </span>
      </div>
    </div>
  );
};
