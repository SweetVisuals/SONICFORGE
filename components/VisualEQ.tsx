
import React, { useEffect, useRef, useMemo } from 'react';
import { PluginModuleState, PluginType, PluginLayer } from '../types';
import { audioEngine } from '../services/audioEngine';
import { BAND_COLORS } from '../constants';

interface VisualEQProps {
  module: PluginModuleState;
  onChangeParam: (paramId: string, val: number) => void;
  onLayerChange?: (layer: PluginLayer) => void;
}

export const VisualEQ: React.FC<VisualEQProps> = ({ module, onChangeParam, onLayerChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const { params, type, nestedModules, activeLayer } = module;
  
  // Default to EQ if undefined
  const currentLayer = activeLayer || PluginLayer.EQ;

  const isHybrid = type === PluginType.HYBRID_EQ_DYN;
  
  // Determine available layers based on nested modules
  const availableLayers = useMemo(() => {
      const layers = [PluginLayer.EQ];
      if (isHybrid && nestedModules) {
          if (nestedModules.includes(PluginType.COMPRESSOR) || nestedModules.includes(PluginType.MULTIBAND)) {
              layers.push(PluginLayer.DYNAMICS);
          }
          if (nestedModules.includes(PluginType.SATURATION)) {
              layers.push(PluginLayer.SATURATION);
          }
          if (nestedModules.includes(PluginType.SHINE)) {
              layers.push(PluginLayer.SHINE);
          }
          if (nestedModules.includes(PluginType.REVERB)) layers.push(PluginLayer.REVERB);
          if (nestedModules.includes(PluginType.DELAY)) layers.push(PluginLayer.DELAY);
      }
      return layers;
  }, [isHybrid, nestedModules]);

  // Reset to EQ if active layer is no longer available
  useEffect(() => {
      if (!availableLayers.includes(currentLayer) && onLayerChange) {
          onLayerChange(PluginLayer.EQ);
      }
  }, [availableLayers, currentLayer, onLayerChange]);

  // Audio Context for calculating frequency curves math
  const ctxMock = useMemo(() => new (window.AudioContext || (window as any).webkitAudioContext)(), []);
  
  // Initialize Filters for Curve Calculation (math only)
  const filters = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
        const f = ctxMock.createBiquadFilter();
        if (i === 0) f.type = 'lowshelf';
        else if (i === 6) f.type = 'highshelf';
        else f.type = 'peaking';
        return f;
    });
  }, [ctxMock]);

  // Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    
    const analyzer = audioEngine.getAnalyzer();
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // --- Coordinate Helpers ---
    const minFreq = 20;
    const maxFreq = 20000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);
    const scale = (maxLog - minLog);

    const getX = (freq: number) => {
        const f = Math.max(minFreq, Math.min(maxFreq, freq));
        return ((Math.log10(f) - minLog) / scale) * width;
    };
    
    const getFreqFromX = (x: number) => {
        const fraction = x / width;
        return Math.pow(10, minLog + (fraction * scale));
    };

    const getY = (db: number) => {
        // Range: -18dB to +18dB
        const range = 36; 
        const center = height / 2;
        const pxPerDb = height / range;
        return center - (db * pxPerDb);
    };

    const getSafeY = (db: number) => {
        const y = getY(db);
        return Math.max(2, Math.min(height - 2, y));
    };

    const getDbFromY = (y: number) => {
        const range = 36;
        const center = height / 2;
        const pxPerDb = height / range;
        return (center - y) / pxPerDb;
    };

    const widthInt = Math.ceil(width);
    const frequencies = new Float32Array(widthInt);
    const magResponse = new Float32Array(widthInt);
    const phaseResponse = new Float32Array(widthInt);
    const curvePoints = new Float32Array(widthInt);

    for (let i = 0; i < widthInt; i++) {
        frequencies[i] = getFreqFromX(i);
    }

    const getLayerConfig = (layer: PluginLayer) => {
        switch(layer) {
            case PluginLayer.DYNAMICS: return { color: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)' };
            case PluginLayer.SATURATION: return { color: '#f97316', fill: 'rgba(249, 115, 22, 0.15)' };
            case PluginLayer.SHINE: return { color: '#22d3ee', fill: 'rgba(34, 211, 238, 0.15)' };
            case PluginLayer.REVERB: return { color: '#d946ef', fill: 'rgba(217, 70, 239, 0.15)' };
            case PluginLayer.DELAY: return { color: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' };
            case PluginLayer.EQ: default: return { color: '#3b82f6', fill: 'rgba(59, 130, 246, 0.15)' };
        }
    };

    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      
      // 1. Clear
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);

      // 2. Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#18181b';
      
      ctx.beginPath();
      for (let db = -12; db <= 12; db += 6) {
          const y = getY(db);
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
      }
      ctx.stroke();
      
      ctx.strokeStyle = '#27272a';
      ctx.beginPath();
      ctx.moveTo(0, height/2);
      ctx.lineTo(width, height/2);
      ctx.stroke();

      ctx.beginPath();
      [60, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => {
          const x = getX(f);
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          
          ctx.fillStyle = '#52525b';
          ctx.font = '9px Inter';
          ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x + 2, height - 4);
      });
      ctx.stroke();

      // 3. Spectrum
      analyzer.getByteFrequencyData(dataArray);
      ctx.fillStyle = 'rgba(63, 63, 70, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height);

      const sampleRate = 44100;
      const nyquist = sampleRate / 2;

      for (let x = 0; x < width; x += 2) {
          const freq = frequencies[x];
          const fraction = freq / nyquist;
          const index = Math.floor(fraction * bufferLength);
          const val = dataArray[index] || 0;
          const h = (val / 255) * height * 0.85;
          ctx.lineTo(x, height - h);
      }
      ctx.lineTo(width, height);
      ctx.fill();

      // 4. Render ALL Layers
      availableLayers.forEach(layer => {
          const isLayerActive = layer === currentLayer;
          const config = getLayerConfig(layer);

          filters.forEach((filter, i) => {
              const band = i + 1;
              filter.frequency.value = params[`b${band}Freq`];
              filter.Q.value = params[`b${band}Q`] || 1.0;

              let gainVal = 0;
              if (layer === PluginLayer.EQ) gainVal = params[`b${band}Gain`];
              else if (layer === PluginLayer.DYNAMICS) gainVal = params[`b${band}Dyn`];
              else if (layer === PluginLayer.SATURATION) gainVal = params[`b${band}Sat`];
              else if (layer === PluginLayer.SHINE) gainVal = params[`b${band}Shine`];
              else if (layer === PluginLayer.REVERB) gainVal = params[`b${band}Verb`];
              else if (layer === PluginLayer.DELAY) gainVal = params[`b${band}Delay`];
              
              filter.gain.value = gainVal;
          });

          curvePoints.fill(0);
          filters.forEach(filter => {
              filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);
              for(let i=0; i < widthInt; i++) {
                  const mag = magResponse[i] < 0.0001 ? 0.0001 : magResponse[i];
                  const db = 20 * Math.log10(mag);
                  curvePoints[i] += db;
              }
          });

          ctx.save();
          
          if (isLayerActive) {
            ctx.beginPath();
            ctx.moveTo(0, getSafeY(curvePoints[0]));
            for (let i = 1; i < widthInt; i += 2) {
                ctx.lineTo(i, getSafeY(curvePoints[i]));
            }
            ctx.lineTo(width, height);
            ctx.lineTo(0, height);
            ctx.closePath();
            
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, config.fill);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.moveTo(0, getSafeY(curvePoints[0]));
          for (let i = 1; i < widthInt; i++) {
              ctx.lineTo(i, getSafeY(curvePoints[i]));
          }
          
          ctx.lineJoin = 'round';
          ctx.lineWidth = isLayerActive ? 2 : 1.5;
          ctx.strokeStyle = config.color;
          ctx.globalAlpha = isLayerActive ? 1.0 : 0.3;
          
          if (isLayerActive) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = config.color;
          }
          
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1.0;
          ctx.restore();
      });

      // 5. Draw Handles
      for (let i = 1; i <= 7; i++) {
          const f = params[`b${i}Freq`];
          
          let g = 0;
          if (currentLayer === PluginLayer.EQ) g = params[`b${i}Gain`];
          else if (currentLayer === PluginLayer.DYNAMICS) g = params[`b${i}Dyn`];
          else if (currentLayer === PluginLayer.SATURATION) g = params[`b${i}Sat`];
          else if (currentLayer === PluginLayer.SHINE) g = params[`b${i}Shine`];
          else if (currentLayer === PluginLayer.REVERB) g = params[`b${i}Verb`];
          else if (currentLayer === PluginLayer.DELAY) g = params[`b${i}Delay`];

          const x = getX(f);
          const y = getSafeY(g);
          
          const isActive = draggingRef.current === i;
          const layerCfg = getLayerConfig(currentLayer);
          const color = currentLayer === PluginLayer.EQ ? BAND_COLORS[i-1] : layerCfg.color;

          if (isActive) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x, height);
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.setLineDash([2, 4]);
              ctx.stroke();
              ctx.setLineDash([]);
          }

          ctx.beginPath();
          ctx.arc(x, y, isActive ? 12 : 6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
      }
    };

    render();
    
    const handleMouseDown = (e: MouseEvent) => {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        let closestDist = 100;
        let closestBand = null;

        for (let i = 1; i <= 7; i++) {
            const bx = getX(params[`b${i}Freq`]);
            
            let val = 0;
            if (currentLayer === PluginLayer.EQ) val = params[`b${i}Gain`];
            else if (currentLayer === PluginLayer.DYNAMICS) val = params[`b${i}Dyn`];
            else if (currentLayer === PluginLayer.SATURATION) val = params[`b${i}Sat`];
            else if (currentLayer === PluginLayer.SHINE) val = params[`b${i}Shine`];
            else if (currentLayer === PluginLayer.REVERB) val = params[`b${i}Verb`];
            else if (currentLayer === PluginLayer.DELAY) val = params[`b${i}Delay`];
            
            const by = getSafeY(val);
            
            const dist = Math.sqrt(Math.pow(x - bx, 2) + Math.pow(y - by, 2));
            if (dist < 15 && dist < closestDist) {
                closestDist = dist;
                closestBand = i;
            }
        }
        
        if (closestBand) {
            draggingRef.current = closestBand;
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (draggingRef.current === null) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(width, e.clientX - rect.left));
        const y = e.clientY - rect.top;
        const freq = getFreqFromX(x);
        const val = getDbFromY(y);
        const clampedVal = Math.max(-18, Math.min(18, val));
        const clampedFreq = Math.max(20, Math.min(20000, freq));

        onChangeParam(`b${draggingRef.current}Freq`, clampedFreq);

        if (currentLayer === PluginLayer.EQ) onChangeParam(`b${draggingRef.current}Gain`, clampedVal);
        else if (currentLayer === PluginLayer.DYNAMICS) onChangeParam(`b${draggingRef.current}Dyn`, clampedVal);
        else if (currentLayer === PluginLayer.SATURATION) onChangeParam(`b${draggingRef.current}Sat`, clampedVal);
        else if (currentLayer === PluginLayer.SHINE) onChangeParam(`b${draggingRef.current}Shine`, clampedVal);
        else if (currentLayer === PluginLayer.REVERB) onChangeParam(`b${draggingRef.current}Verb`, clampedVal);
        else if (currentLayer === PluginLayer.DELAY) onChangeParam(`b${draggingRef.current}Delay`, clampedVal);
    };

    const handleMouseUp = () => draggingRef.current = null;

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
        cancelAnimationFrame(animationId);
        canvas.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

  }, [params, filters, module.id, isHybrid, currentLayer, availableLayers, onChangeParam]);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full bg-neutral-950 rounded-lg border shadow-xl overflow-hidden group transition-colors border-neutral-800`}
      onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
      }}
    >
      {isHybrid && (
          <div className="flex bg-[#0a0a0a] border-b border-white/5">
              {availableLayers.map(layer => (
                  <button
                    key={layer}
                    onClick={() => onLayerChange && onLayerChange(layer)}
                    className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors relative
                        ${currentLayer === layer ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}
                    `}
                  >
                      {layer}
                      {currentLayer === layer && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-current shadow-[0_0_8px_currentColor]"></div>
                      )}
                  </button>
              ))}
          </div>
      )}

      <div className="h-72 relative">
        <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
        
        <div className="absolute top-3 left-3 flex flex-col space-y-1 pointer-events-none opacity-50">
           <span className={`text-[10px] font-mono tracking-widest bg-black/50 px-2 py-1 rounded ${isHybrid ? 'text-yellow-500' : 'text-white'}`}>
               {module.innerLabel || (currentLayer === PluginLayer.EQ ? 'PARAMETRIC EQ' : `HYBRID ${currentLayer} LAYER`)}
           </span>
        </div>
      </div>
    </div>
  );
};