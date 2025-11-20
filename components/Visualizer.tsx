

import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';
import { VisualizerMode } from '../types';

interface VisualizerProps {
    mode: VisualizerMode;
}

export const Visualizer: React.FC<VisualizerProps> = ({ mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null); // For spectrogram shifting

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Ensure temp canvas exists for spectrogram
    if (!tempCanvasRef.current) {
        tempCanvasRef.current = document.createElement('canvas');
    }

    const analyzer = audioEngine.getAnalyzer();
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Stereo Arrays for Vectorscope
    const { l: analyzerL, r: analyzerR } = audioEngine.getStereoAnalyzers();
    const dataArrayL = new Uint8Array(analyzerL.frequencyBinCount);
    const dataArrayR = new Uint8Array(analyzerR.frequencyBinCount);

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      // Handle Resize
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      // Only resize if dimensions change to avoid clearing canvas unnecessarily in spectrogram mode
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
      }
      
      // Logic Switch
      if (mode === 'SPECTRUM') {
          analyzer.getByteFrequencyData(dataArray);
          
          // Clear
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, rect.width, rect.height);

          const barWidth = (rect.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * rect.height;
            
            const hue = (i / bufferLength) * 260 + 180; // Blue to Purple range
            const gradient = ctx.createLinearGradient(0, rect.height, 0, rect.height - barHeight);
            gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(x, rect.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
          }
          
      } else if (mode === 'WAVEFORM') {
          analyzer.getByteTimeDomainData(dataArray);

          // Clear
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, rect.width, rect.height);

          ctx.lineWidth = 2;
          ctx.strokeStyle = '#22d3ee'; // Cyan
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#22d3ee';
          ctx.beginPath();

          const sliceWidth = rect.width * 1.0 / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * rect.height) / 2;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
          }

          ctx.lineTo(rect.width, rect.height / 2);
          ctx.stroke();
          ctx.shadowBlur = 0;

      } else if (mode === 'SPECTROGRAM') {
          analyzer.getByteFrequencyData(dataArray);
          
          const tempCtx = tempCanvasRef.current?.getContext('2d');
          if (tempCtx && tempCanvasRef.current) {
              if (tempCanvasRef.current.width !== canvas.width) {
                   tempCanvasRef.current.width = canvas.width;
                   tempCanvasRef.current.height = canvas.height;
              }
              tempCtx.drawImage(canvas, 0, 0);
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.drawImage(tempCanvasRef.current, -2 * dpr, 0);
              ctx.restore();
          }

          const colWidth = 2;
          const x = rect.width - colWidth;
          
          for (let i = 0; i < bufferLength; i++) {
              const value = dataArray[i];
              const hue = 240 - (value / 255) * 240;
              const alpha = value / 255;
              
              if (value > 10) {
                  ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
                  ctx.fillRect(x, rect.height - (i * (rect.height/128)), colWidth, (rect.height/128) + 1);
              }
          }
      } else if (mode === 'VECTORSCOPE') {
          analyzerL.getByteTimeDomainData(dataArrayL);
          analyzerR.getByteTimeDomainData(dataArrayR);
          
          // Fade for trail
          ctx.fillStyle = 'rgba(5, 5, 5, 0.25)';
          ctx.fillRect(0, 0, rect.width, rect.height);

          // Center
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const radius = Math.min(rect.width, rect.height) * 0.4;

          // Grid
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          
          // Concentric Circles
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
          ctx.arc(cx, cy, radius * 0.33, 0, Math.PI * 2);
          ctx.stroke();
          
          // Crosshairs / Diagonals
          ctx.beginPath();
          ctx.moveTo(cx - radius, cy + radius); // 45 deg lines
          ctx.lineTo(cx + radius, cy - radius);
          ctx.moveTo(cx - radius, cy - radius);
          ctx.lineTo(cx + radius, cy + radius);
          
          ctx.moveTo(cx, cy - radius); // Vertical
          ctx.lineTo(cx, cy + radius);
          ctx.stroke();
          
          // Labels
          ctx.fillStyle = '#52525b';
          ctx.font = '9px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('L', cx - radius - 10, cy - radius + 10);
          ctx.fillText('R', cx + radius + 10, cy - radius + 10);
          ctx.fillText('M', cx, cy - radius - 5);
          ctx.fillText('S', cx + radius + 5, cy);

          // Draw Scope
          ctx.lineWidth = 1.5;
          // Using lighter blend mode for glowing intersection
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = '#8b5cf6'; // Violet matches the plugin color
          
          ctx.beginPath();
          
          // Optimized drawing
          const scale = radius;
          
          for (let i = 0; i < analyzerL.frequencyBinCount; i += 2) {
              const l = (dataArrayL[i] - 128) / 128.0;
              const r = (dataArrayR[i] - 128) / 128.0;
              
              // Goniometer Projection
              // X = Side = (L - R) * 0.707 
              // Y = Mid  = (L + R) * 0.707
              // But screen Y is inverted
              
              const side = (l - r) * 0.707;
              const mid = (l + r) * 0.707;
              
              const x = cx + side * scale;
              const y = cy - mid * scale;
              
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
          
          // Second brighter pass for core
          ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          ctx.globalCompositeOperation = 'source-over';
      }
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [mode]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full rounded-lg bg-[#050505] shadow-inner"
    />
  );
};