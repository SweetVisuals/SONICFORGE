
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
          
          // 1. Shift existing canvas content 1px to the left
          // We use drawImage with the canvas itself. 
          // Note: We are drawing unscaled pixels for the shift to be crisp, then mapping to rect.
          
          // Use the temp canvas to buffer the current state
          const tempCtx = tempCanvasRef.current?.getContext('2d');
          if (tempCtx && tempCanvasRef.current) {
              // Sync temp canvas size
              if (tempCanvasRef.current.width !== canvas.width) {
                   tempCanvasRef.current.width = canvas.width;
                   tempCanvasRef.current.height = canvas.height;
              }
              
              // Copy current canvas to temp
              tempCtx.drawImage(canvas, 0, 0);
              
              // Draw temp back to canvas, shifted left
              // We need to bypass the scale(dpr, dpr) for direct pixel manipulation, 
              // so we reset transform, draw, then re-apply scale.
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.drawImage(tempCanvasRef.current, -2 * dpr, 0); // Shift speed
              ctx.restore();
          }

          // 2. Draw new column at the right edge
          const colWidth = 2;
          const x = rect.width - colWidth;
          
          // Draw frequency bins vertically
          // We effectively need to squash the bufferLength into rect.height
          const binHeight = rect.height / bufferLength;
          
          // Optimization: Draw smaller chunks to avoid thousands of rect calls?
          // Actually, simpler to draw a gradient strip
          
          // Let's construct an ImageData or just draw rects. Rects are easier for React.
          for (let i = 0; i < bufferLength; i++) {
              const value = dataArray[i];
              const y = rect.height - (i * (rect.height / bufferLength)); // Low freq at bottom
              
              // Color Map: Black -> Blue -> Purple -> Orange -> White
              const hue = 240 - (value / 255) * 240; // Blue(240) to Red(0)
              const lightness = (value / 255) * 50;
              const alpha = value / 255;
              
              if (value > 10) {
                  ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
                  ctx.fillRect(x, rect.height - (i * (rect.height/128)), colWidth, (rect.height/128) + 1);
              }
          }
      }
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [mode]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-48 rounded-lg border border-gray-800 bg-[#050505] shadow-inner"
    />
  );
};
