
import React from 'react';

export const Screw: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#3f3f46' }) => {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r="48" fill="url(#screwGradient)" stroke="#18181b" strokeWidth="2" />
        <defs>
            <linearGradient id="screwGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#52525b" />
                <stop offset="100%" stopColor="#27272a" />
            </linearGradient>
        </defs>
        {/* Phillips Head */}
        <path d="M35 50 L65 50 M50 35 L50 65" stroke="#18181b" strokeWidth="8" strokeLinecap="round" style={{ transformOrigin: 'center', transform: `rotate(${Math.random() * 360}deg)` }} />
        <circle cx="50" cy="50" r="48" fill="black" fillOpacity="0.2" className="pointer-events-none" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1" />
      </svg>
    </div>
  );
};
