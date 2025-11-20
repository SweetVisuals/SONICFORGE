

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { PluginModuleState, PluginType, PluginLayer } from '../types';
import { audioEngine } from '../services/audioEngine';
import { BAND_COLORS } from '../constants';

interface VisualEQProps {
  module: PluginModuleState;
  onChangeParam: (paramId: string, val: number) => void;
  onLayerChange?: (layer: PluginLayer) => void;
  onUpdateModule?: (updates: Partial<PluginModuleState>) => void;
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
    return Math.max(16, Math.min(height - 16, y));
};

const getDbFromY = (y: number, height: number) => {
    if (!height) return 0;
    const range = 36;
    const center = height / 2;
    const pxPerDb = height / range;
    return (center - y) / pxPerDb;
};

const getBandFreq = (layer: PluginLayer, index: number, params: any, module: any) => {
    const band = index + 1;
    const safeParam = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);
    
    if (layer === PluginLayer.SHINE) {
        const shineFreq = params[`b${band}ShineFreq`];
        if (typeof shineFreq === 'number' && Number.isFinite(shineFreq)) {
             return shineFreq;
        }
        const defaults = [60, 130, 300, 800, 2000, 5000, 10000];
        return defaults[index] || 10000;
    }
    return safeParam(params[`b${band}Freq`], 1000);
};

export const VisualEQ: React.FC<VisualEQProps> = ({ module, onChangeParam, onLayerChange, onUpdateModule }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  
  const { params, type, nestedModules, activeLayer, id: moduleId } = module;
  
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const moduleRef = useRef(module);
  moduleRef.current = module;

  const onChangeParamRef = useRef(onChangeParam);
  onChangeParamRef.current = onChangeParam;

  const onLayerChangeRef = useRef(onLayerChange);
  onLayerChangeRef.current = onLayerChange;
  
  const onUpdateModuleRef = useRef(onUpdateModule);
  onUpdateModuleRef.current = onUpdateModule;

  // Determine Default Layer correctly
  const isHybrid = type === PluginType.HYBRID_EQ_DYN;
  const isMultiband = type === PluginType.MULTIBAND;
  
  const defaultLayer = isMultiband ? PluginLayer.DYNAMICS : PluginLayer.EQ;
  const currentLayer = activeLayer || defaultLayer;
  
  const currentLayerRef = useRef(currentLayer);
  currentLayerRef.current = currentLayer;

  const availableLayers = useMemo(() => {
      const layers: PluginLayer[] = [];
      
      if (isHybrid && nestedModules) {
          if (nestedModules.includes(PluginType.VISUAL_EQ)) layers.push(PluginLayer.EQ);
          if (nestedModules.includes(PluginType.COMPRESSOR)) layers.push(PluginLayer.DYNAMICS);
          if (nestedModules.includes(PluginType.SATURATION)) layers.push(PluginLayer.SATURATION);
          if (nestedModules.includes(PluginType.SHINE)) layers.push(PluginLayer.SHINE);
          if (nestedModules.includes(PluginType.REVERB)) layers.push(PluginLayer.REVERB);
          if (nestedModules.includes(PluginType.DELAY)) layers.push(PluginLayer.DELAY);
          if (nestedModules.includes(PluginType.STEREO_IMAGER)) layers.push(PluginLayer.IMAGER);
          if (nestedModules.includes(PluginType.DOUBLER) || nestedModules.includes(PluginType.CHORUS) || nestedModules.includes(PluginType.FLANGER)) layers.push(PluginLayer.MODULATION);

          if (layers.length === 0) layers.push(PluginLayer.EQ);
      } else {
          // Standalone
          if (type === PluginType.MULTIBAND) layers.push(PluginLayer.DYNAMICS);
          else if (type === PluginType.SHINE) layers.push(PluginLayer.SHINE); // Could also show EQ but Shine is primary
          else layers.push(PluginLayer.EQ); 
      }
      return layers;
  }, [isHybrid, nestedModules, type]);

  useEffect(() => {
      if (availableLayers.length > 0 && !availableLayers.includes(currentLayer) && onLayerChange) {
          // Only switch if the current layer is truly invalid for this module type
          // For Multiband, we want DYNAMICS active by default, but user might want to see EQ curve
          if (type === PluginType.MULTIBAND && currentLayer === PluginLayer.EQ) return; 
          
          onLayerChange(availableLayers[0]);
      }
  }, [availableLayers, currentLayer, onLayerChange, type]);

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
        case PluginLayer.IMAGER: return { color: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.15)' };
        case PluginLayer.MODULATION: return { color: '#14b8a6', fill: 'rgba(20, 184, 166, 0.15)' };
        case PluginLayer.EQ: default: return { color: '#3b82f6', fill: 'rgba(59, 130, 246, 0.15)' };
    }
  };

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
    
    // Data arrays for Vectorscope
    const { l: analyzerL, r: analyzerR } = audioEngine.getStereoAnalyzers();
    const dataArrayL = new Uint8Array(analyzerL.frequencyBinCount);
    const dataArrayR = new Uint8Array(analyzerR.frequencyBinCount);

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

      const curLayer = currentLayerRef.current;

      // --- VECTORSCOPE MODE ---
      if (curLayer === PluginLayer.IMAGER) {
          ctx.fillStyle = '#09090b';
          ctx.fillRect(0, 0, width, height);
          
          analyzerL.getByteTimeDomainData(dataArrayL);
          analyzerR.getByteTimeDomainData(dataArrayR);
          
          const cx = width / 2;
          const cy = height / 2;
          const radius = Math.min(width, height) * 0.4;

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
          ctx.moveTo(cx - radius, cy + radius);
          ctx.lineTo(cx + radius, cy - radius);
          ctx.moveTo(cx - radius, cy - radius);
          ctx.lineTo(cx + radius, cy + radius);
          ctx.stroke();

          ctx.fillStyle = '#52525b';
          ctx.font = '9px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('M', cx, cy - radius - 5);
          ctx.fillText('S', cx + radius + 5, cy);

          ctx.lineWidth = 1.5;
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = '#8b5cf6'; 
          
          ctx.beginPath();
          const scale = radius;
          
          for (let i = 0; i < analyzerL.frequencyBinCount; i += 3) {
              const l = (dataArrayL[i] - 128) / 128.0;
              const r = (dataArrayR[i] - 128) / 128.0;
              const side = (l - r) * 0.707;
              const mid = (l + r) * 0.707;
              const x = cx + side * scale;
              const y = cy - mid * scale;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          return;
      }

      // --- SPECTRUM / EQ MODE ---
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
      const currentModule = moduleRef.current;
      const safeParam = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);
      const analyzer = audioEngine.getAnalyzer();
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

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

      // Draw EQ Curves
      availableLayers.forEach(layer => {
          if (layer === PluginLayer.IMAGER || layer === PluginLayer.MODULATION) return;

          const isLayerActive = layer === curLayer;
          const config = getLayerConfig(layer);

          // Configure Filter States from params
          filters.forEach((filter, i) => {
              const band = i + 1;
              const freq = getBandFreq(layer, i, currentParams, currentModule);
              let Q = safeParam(currentParams[`b${band}Q`], 1.0);
              let type: BiquadFilterType = 'peaking';
              
              if (i === 0) type = 'lowshelf';
              else if (i === 6) type = 'highshelf';

              if (layer === PluginLayer.SHINE) {
                  const sMode = currentModule.shineMode || 'AIR';
                  if (sMode === 'GLOSS') { type = 'peaking'; Q = 0.5; } 
                  else { type = i === 6 ? 'highshelf' : 'peaking'; Q = 0.7; }
              }

              filter.frequency.value = freq;
              filter.Q.value = Q;
              filter.type = type;

              let gainVal = 0;
              if (layer === PluginLayer.EQ) gainVal = safeParam(currentParams[`b${band}Gain`], 0);
              else if (layer === PluginLayer.DYNAMICS) {
                  // Scale dynamics value (-60 to 0) to fit visually within +/- 18 range somewhat
                  gainVal = safeParam(currentParams[`b${band}Dyn`], 0) * 0.3;
              }
              else if (layer === PluginLayer.SATURATION) gainVal = safeParam(currentParams[`b${band}Sat`], 0);
              else if (layer === PluginLayer.SHINE) gainVal = safeParam(currentParams[`b${band}Shine`], 0);
              else if (layer === PluginLayer.REVERB) gainVal = safeParam(currentParams[`b${band}Verb`], 0);
              else if (layer === PluginLayer.DELAY) gainVal = safeParam(currentParams[`b${band}Delay`], 0);
              
              filter.gain.value = gainVal;
          });

          // SPECIAL CASE: Multiband Dynamics Layer - Draw separate curves per band
          if (isMultiband && layer === PluginLayer.DYNAMICS) {
              filters.forEach((filter, i) => {
                   filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);
                   
                   // Calculate dB for this specific filter only
                   for(let k=0; k < widthInt; k++) {
                       const mag = magResponse[k] < 0.0001 ? 0.0001 : magResponse[k];
                       curvePoints[k] = 20 * Math.log10(mag);
                   }

                   const bandColor = BAND_COLORS[i];
                   const isBandSelected = currentModule.selectedBand === (i + 1);
                   const zeroY = getY(0, height);
                   
                   ctx.save();
                   ctx.beginPath();
                   ctx.moveTo(0, zeroY); // Fill from center/0dB line, not bottom, so cuts look like dips
                   for (let k = 0; k < widthInt; k++) {
                       ctx.lineTo(k, getSafeY(curvePoints[k], height));
                   }
                   ctx.lineTo(width, zeroY);
                   ctx.closePath();

                   const grad = ctx.createLinearGradient(0, 0, 0, height);
                   grad.addColorStop(0, bandColor + (isBandSelected ? '55' : '22')); 
                   grad.addColorStop(1, bandColor + '00');
                   
                   ctx.fillStyle = grad;
                   ctx.fill();

                   ctx.beginPath();
                   for (let k = 0; k < widthInt; k++) {
                       const y = getSafeY(curvePoints[k], height);
                       if (k===0) ctx.moveTo(k, y);
                       else ctx.lineTo(k, y);
                   }
                   ctx.lineWidth = isBandSelected ? 2 : 1;
                   ctx.strokeStyle = bandColor;
                   ctx.globalAlpha = isBandSelected ? 1.0 : 0.6;
                   ctx.stroke();
                   ctx.restore();
              });
              return; // Skip standard summing logic
          }

          // Standard Logic: Sum curves
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

      // Draw Handles
      if (curLayer !== PluginLayer.MODULATION) {
          for (let i = 1; i <= 7; i++) {
              const idx = i - 1;
              const f = getBandFreq(curLayer, idx, currentParams, currentModule);
              let g = 0;
              if (curLayer === PluginLayer.EQ) g = safeParam(currentParams[`b${i}Gain`], 0);
              else if (curLayer === PluginLayer.DYNAMICS) g = safeParam(currentParams[`b${i}Dyn`], 0) * 0.3; // Scaled for visual
              else if (curLayer === PluginLayer.SATURATION) g = safeParam(currentParams[`b${i}Sat`], 0);
              else if (curLayer === PluginLayer.SHINE) g = safeParam(currentParams[`b${i}Shine`], 0);
              else if (curLayer === PluginLayer.REVERB) g = safeParam(currentParams[`b${i}Verb`], 0);
              else if (curLayer === PluginLayer.DELAY) g = safeParam(currentParams[`b${i}Delay`], 0);

              const x = getX(f, width);
              const y = getSafeY(g, height);
              
              const isSelected = currentModule.selectedBand === i;
              const isActive = draggingRef.current === i;
              const layerCfg = getLayerConfig(curLayer);
              
              // Multiband uses distinct band colors for dynamics handles too
              const color = (curLayer === PluginLayer.EQ || (isMultiband && curLayer === PluginLayer.DYNAMICS)) ? BAND_COLORS[idx] : layerCfg.color;

              if (isActive || isSelected) {
                  ctx.beginPath();
                  ctx.moveTo(x, y);
                  ctx.lineTo(x, height);
                  ctx.strokeStyle = color;
                  ctx.lineWidth = 1;
                  ctx.setLineDash([2, 4]);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  
                  if (isSelected) {
                      ctx.beginPath();
                      ctx.arc(x, y, 16, 0, Math.PI*2);
                      ctx.fillStyle = color;
                      ctx.globalAlpha = 0.2;
                      ctx.fill();
                      ctx.globalAlpha = 1.0;
                  }
              }

              ctx.beginPath();
              ctx.arc(x, y, isActive || isSelected ? 8 : 6, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
              
              // White center dot
              ctx.beginPath();
              ctx.arc(x, y, 2, 0, Math.PI*2);
              ctx.fillStyle = '#fff';
              ctx.fill();
          }
      }
    };

    render();

    return () => {
        cancelAnimationFrame(animationId);
    };

  }, [filters, availableLayers]); 

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();
      
      const curLayer = currentLayerRef.current;
      if (curLayer === PluginLayer.IMAGER || curLayer === PluginLayer.MODULATION) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const currentParams = paramsRef.current;
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
          else if (curLayer === PluginLayer.DYNAMICS) val = safeParam(currentParams[`b${i}Dyn`], 0) * 0.3; // Scaled check
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
          if (onUpdateModuleRef.current) onUpdateModuleRef.current({ selectedBand: closestBand });
          (e.target as Element).setPointerCapture(e.pointerId);
      }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      
      const curLayer = currentLayerRef.current;
      if (curLayer === PluginLayer.IMAGER || curLayer === PluginLayer.MODULATION) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = e.clientY - rect.top;
      
      const freq = getFreqFromX(x, rect.width);
      const val = getDbFromY(y, rect.height);
      
      if (!Number.isFinite(freq) || !Number.isFinite(val)) return;

      let minDb = -18;
      let maxDb = 18;
      let valueToSet = val;
      
      if (curLayer === PluginLayer.DYNAMICS) {
          minDb = -60; 
          maxDb = 0;
          // Inverse scaling: Visual / 0.3 = Param
          valueToSet = val / 0.3;
      }

      const clampedVal = Math.max(minDb, Math.min(maxDb, valueToSet));
      const clampedFreq = Math.max(20, Math.min(20000, freq));
      
      if (curLayer === PluginLayer.EQ) {
          onChangeParamRef.current(`b${draggingRef.current}Freq`, clampedFreq);
      } else if (curLayer === PluginLayer.SHINE) {
          onChangeParamRef.current(`b${draggingRef.current}ShineFreq`, clampedFreq);
      } else if (curLayer === PluginLayer.DYNAMICS) {
          onChangeParamRef.current(`b${draggingRef.current}Freq`, clampedFreq);
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
          }
      }
  }, []);
  
  const labelText = module.innerLabel || (
      currentLayer === PluginLayer.EQ ? 'PARAMETRIC EQ' : 
      currentLayer === PluginLayer.DYNAMICS && isMultiband ? 'MULTIBAND DYNAMICS' :
      `${isMultiband ? 'MULTIBAND' : 'HYBRID'} ${currentLayer} LAYER`
  );

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full h-full bg-neutral-950 rounded-lg border shadow-xl overflow-hidden group transition-colors border-neutral-800`}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Layer Tabs: Show if Hybrid OR if Multiband (Standalone which acts like hybrid layer) */}
      {(isHybrid || isMultiband) && (
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
           <span className={`text-[10px] font-mono tracking-widest bg-black/50 px-2 py-1 rounded ${isHybrid || isMultiband ? 'text-yellow-500' : 'text-white'}`}>
               {labelText}
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