
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface TransportProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onRestart: () => void;
}

export const Transport: React.FC<TransportProps> = ({
  isPlaying, currentTime, duration, onPlayPause, onSeek, onRestart
}) => {
  // Format time helper
  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-16 bg-[#050505] border-t border-white/5 flex items-center px-6 space-x-6 select-none z-30 shrink-0">
       {/* Controls */}
       <div className="flex items-center space-x-3">
          <button onClick={onRestart} className="p-2 text-neutral-500 hover:text-white transition-colors">
             <RotateCcw size={16} />
          </button>
          <button onClick={onPlayPause} className="p-2.5 bg-cyan-900/20 text-cyan-400 rounded-full border border-cyan-500/30 hover:bg-cyan-900/40 hover:border-cyan-500/50 transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)]">
             {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
       </div>
       
       {/* Track / Timeline */}
       <div className="flex-1 flex items-center space-x-4">
          <span className="text-[10px] font-mono text-neutral-500 w-8 text-right">{fmt(currentTime)}</span>
          
          <div 
            className="flex-1 h-8 bg-[#0a0a0a] border border-white/5 rounded relative cursor-pointer group overflow-hidden"
            onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const x = e.clientX - rect.left;
               const pct = x / rect.width;
               onSeek(pct * duration);
            }}
          >
             {/* Fake Waveform Pattern */}
             <div className="absolute inset-0 opacity-20" 
                  style={{backgroundImage: 'linear-gradient(90deg, #3f3f46 1px, transparent 1px)', backgroundSize: '4px 100%'}}>
             </div>
             
             {/* Progress Fill */}
             <div 
                className="absolute top-0 left-0 h-full bg-cyan-500/20 border-r border-cyan-500/50 transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
             ></div>
             
             {/* Hover Effect */}
             <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          </div>
          
          <span className="text-[10px] font-mono text-neutral-500 w-8">{fmt(duration)}</span>
       </div>
    </div>
  );
};
