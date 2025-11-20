
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { PluginModuleState, PluginType, PluginLayer } from '../types';
import { audioEngine } from '../services/audioEngine';
import { BAND_COLORS } from '../constants';

interface VisualEQProps {
  module: PluginModuleState;
  onChangeParam: (paramId: string, val: number) => void;
  onLayerChange?: (layer: PluginLayer) => void;
}

// --- Math Helpers ---
const minFreq = 20;
const maxFreq = 20000;
const minLog = Math.log10(minFreq);
const maxLog = Math.log10(maxFreq);
const scale = (maxLog - minLog);

const getX = (freq: number, width: number) => {
    if (!width) return 0;
    const f = Math.max(minFreq, Math.min(maxFreq, freq));
    return ((Math.log10(f) - minLog) / scale) * width;
};

const getFreqFromX = (x: number, width: number) => {
    if (!width) return 1000;
    const fraction = x / width;
    return Math.pow(10, minLog + (fraction * scale));
};

const getY = (db: number, height: number) => {
    if (!height) return 0;
    const range = 36; // -18 to +18
    const center = height / 2;
    const pxPerDb = height / range;
    return center - (db * pxPerDb);
};

const getSafeY = (db: number, height: number) => {
    const y = getY(db, height);
    // Increased margin to 14px (radius is 12px when active) to prevent clipping at edges
    return Math.max(14, Math.min(height - 14, y));
};

const getDbFromY = (y: number, height: number) => {
    if (!height) return 0;
    const range = 36;
    const center = height / 2;
    const pxPerDb = height / range;
    return (center - y) / pxPerDb;
};

// Helper to get frequency for a band, decoupling Shine from EQ
const getBandFreq = (layer: PluginLayer, index: number, params: any, module: any) => {
    const band = index + 1;
    const safeParam = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);
    
    // Shine Layer uses separate frequencies if available, or defaults
    if (layer === PluginLayer.SHINE) {
        const shineFreq = params[`b${band}ShineFreq`];
        // Use the specific Shine frequency if it exists (e.g. in Hybrid mode after merging)
        if (typeof shineFreq === 'number' && Number.isFinite(shineFreq)) {
             return shineFreq;
        }
        
        // Fallback defaults if not set
        const defaults = [60, 130, 300, 800, 2000, 5000, 10000];
        return defaults[index] || 10000;
    }
    
    // Default / EQ Layer tracks parameters
    return safeParam(params[`b${band}Freq`], 1000);
};

export const VisualEQ: React.FC<VisualEQProps> = ({ module, onChangeParam, onLayerChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  
  const { params, type, nestedModules, activeLayer, id: moduleId } = module;
  
  // Use ref for params to avoid stale closures
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Use ref for module state
  const moduleRef = useRef(module);
  moduleRef.current = module;

  const onChangeParamRef = useRef(onChangeParam);
  onChangeParamRef.current = onChangeParam;

  const onLayerChangeRef = useRef(onLayerChange);
  onLayerChangeRef.current = onLayerChange;

  const currentLayer = activeLayer || PluginLayer.EQ;
  const currentLayerRef = useRef(currentLayer);
  currentLayerRef.current = currentLayer;

  const isHybrid = type === PluginType.HYBRID_EQ_DYN;
  
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

  useEffect(() => {
      if (!availableLayers.includes(currentLayer) && onLayerChange) {
          onLayerChange(PluginLayer.EQ);
      }
  }, [availableLayers, currentLayer, onLayerChange]);

  const ctxMock = useMemo(() => {
      try {
          return new OfflineAudioContext(1, 1, 44100);
      } catch (e) {
          return new (window.AudioContext || (window as any).webkitAudioContext)();
      }
  }, []);
  
  const filters = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
        const f = ctxMock.createBiquadFilter();
        if (i === 0) f.type = 'lowshelf';
        else if (i === 6) f.type = 'highshelf';
        else f.type = 'peaking';
        return f;
    });
  }, [ctxMock]);

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

  // Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let widthInt = 0;
    let frequencies: Float32Array;
    let magResponse: Float32Array;
    let phaseResponse: Float32Array;
    let curvePoints: Float32Array;

    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
      }
      
      if (width === 0 || height === 0) return;

      if (Math.ceil(width) !== widthInt) {
          widthInt = Math.ceil(width);
          frequencies = new Float32Array(widthInt);
          magResponse = new Float32Array(widthInt);
          phaseResponse = new Float32Array(widthInt);
          curvePoints = new Float32Array(widthInt);
          for (let i = 0; i < widthInt; i++) {
              frequencies[i] = getFreqFromX(i, width);
          }
      }

      const currentParams = paramsRef.current;
      const curLayer = currentLayerRef.current;
      const currentModule = moduleRef.current;
      const safeParam = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);
      const analyzer = audioEngine.getAnalyzer();
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Clear
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#18181b';
      ctx.beginPath();
      for (let db = -12; db <= 12; db += 6) {
          const y = getY(db, height);
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
          const x = getX(f, width);
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.fillStyle = '#52525b';
          ctx.font = '9px Inter';
          ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x + 2, height - 4);
      });
      ctx.stroke();

      // Spectrum
      analyzer.getByteFrequencyData(dataArray);
      ctx.fillStyle = 'rgba(63, 63, 70, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height);

      const sampleRate = 44100;
      const nyquist = sampleRate / 2;

      for (let x = 0; x < width; x += 2) {
          const freq = getFreqFromX(x, width);
          const fraction = freq / nyquist;
          const index = Math.floor(fraction * bufferLength);
          const val = dataArray[index] || 0;
          const h = (val / 255) * height * 0.85;
          ctx.lineTo(x, height - h);
      }
      ctx.lineTo(width, height);
      ctx.fill();

      // Render Layers
      availableLayers.forEach(layer => {
          const isLayerActive = layer === curLayer;
          const config = getLayerConfig(layer);

          // Configure Filters for this layer
          filters.forEach((filter, i) => {
              const band = i + 1;
              
              // Use decoupled frequency logic
              const freq = getBandFreq(layer, i, currentParams, currentModule);
              let Q = safeParam(currentParams[`b${band}Q`], 1.0);
              let type: BiquadFilterType = 'peaking';
              
              if (i === 0) type = 'lowshelf';
              else if (i === 6) type = 'highshelf';

              // Adjust filter topology for Shine Mode visualization
              if (layer === PluginLayer.SHINE) {
                  const sMode = currentModule.shineMode || 'AIR';
                  // Apply mild Q/Type visual tweaks, but stick to param freq
                  if (freq >= 5000 || i >= 4) {
                      if (sMode === 'GLOSS') {
                          type = 'peaking';
                      } else {
                          // Only the last band is shelf, others peaking
                          if (i === 6) type = 'highshelf';
                          else type = 'peaking';
                      }
                      Q = 0.7; 
                  }
              }

              filter.frequency.value = freq;
              filter.Q.value = Q;
              filter.type = type;

              let gainVal = 0;
              if (layer === PluginLayer.EQ) gainVal = safeParam(currentParams[`b${band}Gain`], 0);
              else if (layer === PluginLayer.DYNAMICS) gainVal = safeParam(currentParams[`b${band}Dyn`], 0);
              else if (layer === PluginLayer.SATURATION) gainVal = safeParam(currentParams[`b${band}Sat`], 0);
              else if (layer === PluginLayer.SHINE) gainVal = safeParam(currentParams[`b${band}Shine`], 0);
              else if (layer === PluginLayer.REVERB) gainVal = safeParam(currentParams[`b${band}Verb`], 0);
              else if (layer === PluginLayer.DELAY) gainVal = safeParam(currentParams[`b${band}Delay`], 0);
              
              filter.gain.value = gainVal;
          });

          // Calculate Curve
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
          
          // Fill Active
          if (isLayerActive) {
            ctx.beginPath();
            ctx.moveTo(0, getSafeY(curvePoints[0], height));
            for (let i = 1; i < widthInt; i += 2) {
                ctx.lineTo(i, getSafeY(curvePoints[i], height));
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

          // Stroke Curve
          ctx.beginPath();
          ctx.moveTo(0, getSafeY(curvePoints[0], height));
          for (let i = 1; i < widthInt; i++) {
              ctx.lineTo(i, getSafeY(curvePoints[i], height));
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

      // Draw Handles (Active Layer Only)
      for (let i = 1; i <= 7; i++) {
          const idx = i - 1;
          const f = getBandFreq(curLayer, idx, currentParams, currentModule);

          let g = 0;
          if (curLayer === PluginLayer.EQ) g = safeParam(currentParams[`b${i}Gain`], 0);
          else if (curLayer === PluginLayer.DYNAMICS) g = safeParam(currentParams[`b${i}Dyn`], 0);
          else if (curLayer === PluginLayer.SATURATION) g = safeParam(currentParams[`b${i}Sat`], 0);
          else if (curLayer === PluginLayer.SHINE) g = safeParam(currentParams[`b${i}Shine`], 0);
          else if (curLayer === PluginLayer.REVERB) g = safeParam(currentParams[`b${i}Verb`], 0);
          else if (curLayer === PluginLayer.DELAY) g = safeParam(currentParams[`b${i}Delay`], 0);

          const x = getX(f, width);
          const y = getSafeY(g, height);
          
          const isActive = draggingRef.current === i;
          const layerCfg = getLayerConfig(curLayer);
          const color = curLayer === PluginLayer.EQ ? BAND_COLORS[idx] : layerCfg.color;

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

    return () => {
        cancelAnimationFrame(animationId);
    };

  }, [filters, availableLayers]); 

  // --- EVENT HANDLERS ---
  
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const currentParams = paramsRef.current;
      const curLayer = currentLayerRef.current;
      const currentModule = moduleRef.current;
      const safeParam = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);

      let closestDist = 30; 
      let closestBand = null;

      for (let i = 1; i <= 7; i++) {
          const idx = i - 1;
          const f = getBandFreq(curLayer, idx, currentParams, currentModule);
          const bx = getX(f, rect.width);
          
          let val = 0;
          if (curLayer === PluginLayer.EQ) val = safeParam(currentParams[`b${i}Gain`], 0);
          else if (curLayer === PluginLayer.DYNAMICS) val = safeParam(currentParams[`b${i}Dyn`], 0);
          else if (curLayer === PluginLayer.SATURATION) val = safeParam(currentParams[`b${i}Sat`], 0);
          else if (curLayer === PluginLayer.SHINE) val = safeParam(currentParams[`b${i}Shine`], 0);
          else if (curLayer === PluginLayer.REVERB) val = safeParam(currentParams[`b${i}Verb`], 0);
          else if (curLayer === PluginLayer.DELAY) val = safeParam(currentParams[`b${i}Delay`], 0);
          
          const by = getSafeY(val, rect.height);
          
          const dist = Math.sqrt(Math.pow(x - bx, 2) + Math.pow(y - by, 2));
          if (dist < closestDist) {
              closestDist = dist;
              closestBand = i;
          }
      }

      if (closestBand) {
          draggingRef.current = closestBand;
          (e.target as Element).setPointerCapture(e.pointerId);
      }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = e.clientY - rect.top;
      
      const freq = getFreqFromX(x, rect.width);
      const val = getDbFromY(y, rect.height);
      
      if (!Number.isFinite(freq) || !Number.isFinite(val)) return;

      const clampedVal = Math.max(-18, Math.min(18, val));
      const clampedFreq = Math.max(20, Math.min(20000, freq));

      const curLayer = currentLayerRef.current;
      
      // Handle Frequency updates based on layer
      if (curLayer === PluginLayer.EQ) {
          onChangeParamRef.current(`b${draggingRef.current}Freq`, clampedFreq);
      } else if (curLayer === PluginLayer.SHINE) {
          onChangeParamRef.current(`b${draggingRef.current}ShineFreq`, clampedFreq);
      }

      if (curLayer === PluginLayer.EQ) onChangeParamRef.current(`b${draggingRef.current}Gain`, clampedVal);
      else if (curLayer === PluginLayer.DYNAMICS) onChangeParamRef.current(`b${draggingRef.current}Dyn`, clampedVal);
      else if (curLayer === PluginLayer.SATURATION) onChangeParamRef.current(`b${draggingRef.current}Sat`, clampedVal);
      else if (curLayer === PluginLayer.SHINE) onChangeParamRef.current(`b${draggingRef.current}Shine`, clampedVal);
      else if (curLayer === PluginLayer.REVERB) onChangeParamRef.current(`b${draggingRef.current}Verb`, clampedVal);
      else if (curLayer === PluginLayer.DELAY) onChangeParamRef.current(`b${draggingRef.current}Delay`, clampedVal);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggingRef.current !== null) {
          draggingRef.current = null;
          try {
            (e.target as Element).releasePointerCapture(e.pointerId);
          } catch (err) {
             // Ignore error if capture was lost
          }
      }
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full h-full bg-neutral-950 rounded-lg border shadow-xl overflow-hidden group transition-colors border-neutral-800`}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {isHybrid && (
          <div className="flex bg-[#0a0a0a] border-b border-white/5 overflow-x-auto no-scrollbar">
              {availableLayers.map(layer => (
                  <button
                    key={layer}
                    onClick={() => onLayerChangeRef.current && onLayerChangeRef.current(layer)}
                    className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors relative whitespace-nowrap
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

      <div className="h-full relative">
        <canvas 
            ref={canvasRef} 
            className="w-full h-full cursor-crosshair touch-none"
            style={{ touchAction: 'none' }} 
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        />
        
        <div className="absolute top-3 left-3 flex flex-col space-y-1 pointer-events-none opacity-50">
           <span className={`text-[10px] font-mono tracking-widest bg-black/50 px-2 py-1 rounded ${isHybrid ? 'text-yellow-500' : 'text-white'}`}>
               {module.innerLabel || (currentLayer === PluginLayer.EQ ? 'PARAMETRIC EQ' : `HYBRID ${currentLayer} LAYER`)}
           </span>
           {isHybrid && currentLayer === PluginLayer.SHINE && (
               <span className="text-[9px] font-mono tracking-tight text-cyan-400 bg-black/50 px-2 py-0.5 rounded self-start">
                   MODE: {module.shineMode || 'AIR'}
               </span>
           )}
        </div>
      </div>
    </div>
  );
};
