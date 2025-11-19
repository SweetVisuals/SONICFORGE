
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
  variant?: 'classic' | 'soft' | 'tech';
}

export const Knob: React.FC<KnobProps> = ({ 
  value, min, max, onChange, label, unit, 
  color = '#3b82f6', size = 56, variant = 'classic' 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startValue = useRef(0);

  // Ensure range clamping
  const clampedValue = Math.min(max, Math.max(min, value));
  const percentage = (clampedValue - min) / (max - min);
  
  // -135 to 135 degrees
  const startAngle = -135;
  const endAngle = 135;
  const angleRange = endAngle - startAngle;
  const currentAngle = startAngle + (percentage * angleRange);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      // Sensitivity
      const deltaValue = (deltaY / 150) * range; 
      let newValue = startValue.current + deltaValue;
      newValue = Math.min(max, Math.max(min, newValue));
      
      // Snap to 0 if close for bipolar params
      if (min < 0 && max > 0 && Math.abs(newValue) < range * 0.02) {
          newValue = 0;
      }
      
      onChange(newValue);
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
  }, [isDragging, max, min, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation to parent draggable
    e.preventDefault(); // Prevent text selection or defaults
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };

  // Polar to Cartesian
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

  const strokeWidth = variant === 'tech' ? 2 : size * 0.08;
  const radius = (size / 2) - strokeWidth;
  const cx = size / 2;
  const cy = size / 2;

  // Inner knob size
  const innerSize = variant === 'tech' ? size * 0.7 : size * 0.6;

  return (
    <div className="flex flex-col items-center space-y-1 group">
      <div 
        ref={knobRef}
        onMouseDown={handleMouseDown}
        onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        className="relative cursor-ns-resize outline-none select-none transition-transform active:scale-95"
        style={{ width: size, height: size }}
      >
        {/* Background Track */}
        <svg width={size} height={size} className="absolute top-0 left-0 pointer-events-none">
            {/* Shadow Circle */}
            {variant !== 'tech' && (
              <circle cx={cx} cy={cy} r={radius - 2} fill="#18181b" stroke="#27272a" strokeWidth={1} />
            )}
            
            {/* Track Arc */}
            <path 
                d={describeArc(cx, cy, radius, startAngle, endAngle)} 
                fill="none" 
                stroke={variant === 'soft' ? '#27272a' : '#27272a'} 
                strokeWidth={strokeWidth} 
                strokeLinecap={variant === 'tech' ? 'butt' : 'round'}
                strokeOpacity={variant === 'tech' ? 0.5 : 1}
            />
            
            {/* Value Arc */}
            <path 
                d={describeArc(cx, cy, radius, startAngle, currentAngle)} 
                fill="none" 
                stroke={color} 
                strokeWidth={strokeWidth} 
                strokeLinecap={variant === 'tech' ? 'butt' : 'round'}
                className="drop-shadow-md transition-all duration-75"
                style={{ filter: `drop-shadow(0 0 ${variant === 'tech' ? '4px' : '2px'} ${color})` }}
            />
        </svg>
        
        {/* Inner Knob */}
        <div 
            className={`absolute rounded-full flex items-center justify-center
              ${variant === 'soft' ? 'bg-zinc-800' : variant === 'tech' ? 'bg-black border border-white/10' : 'bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.5)]'}
            `}
            style={{ 
              width: innerSize, 
              height: innerSize, 
              left: (size - innerSize) / 2,
              top: (size - innerSize) / 2,
              transform: `rotate(${currentAngle}deg)`
            }}
        >
             {/* Indicator */}
            {variant === 'tech' ? (
              <div className="w-1 h-1 rounded-full bg-white shadow-[0_0_5px_white]"></div>
            ) : (
              <div 
                className={`absolute rounded-full ${variant === 'soft' ? 'bg-zinc-400' : 'bg-white shadow-[0_0_2px_rgba(255,255,255,0.5)]'}`}
                style={{
                  width: 2,
                  height: innerSize * 0.3,
                  left: (innerSize - 2) / 2,
                  top: innerSize * 0.1
                }}
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