
import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export const StereoBar: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { l: analyzerL, r: analyzerR } = audioEngine.getStereoAnalyzers();
    const bufferLength = analyzerL.frequencyBinCount;
    const dataL = new Uint8Array(bufferLength);
    const dataR = new Uint8Array(bufferLength);

    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      
      // Handle Resize
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
      }

      const width = rect.width;
      const height = rect.height;

      // Calc RMS-ish amplitude
      analyzerL.getByteTimeDomainData(dataL);
      analyzerR.getByteTimeDomainData(dataR);

      let sumL = 0;
      let sumR = 0;
      
      // Use a subset of samples for performance if needed, or full buffer
      for(let i = 0; i < bufferLength; i += 4) {
          sumL += Math.abs(dataL[i] - 128);
          sumR += Math.abs(dataR[i] - 128);
      }
      
      const avgL = sumL / (bufferLength / 4);
      const avgR = sumR / (bufferLength / 4);
      
      // Normalize (empirically scaled for visual impact)
      const valL = Math.min(1, avgL / 40); 
      const valR = Math.min(1, avgR / 40);

      const cx = width / 2;

      ctx.clearRect(0, 0, width, height);
      
      // Background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0,0,width,height);
      
      // Container Border/Track
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, width, height);
      
      // Center Line
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.lineTo(cx, height - 2);
      ctx.stroke();
      
      // Bars dimensions
      const barH = height * 0.6;
      const y = (height - barH) / 2;
      const wL = valL * (width / 2 - 4); // leave padding
      const wR = valR * (width / 2 - 4);

      // Left Bar (Cyan)
      // Gradient
      const gradL = ctx.createLinearGradient(cx, 0, cx - wL, 0);
      gradL.addColorStop(0, '#22d3ee');
      gradL.addColorStop(1, 'rgba(34, 211, 238, 0.2)');
      
      ctx.fillStyle = gradL;
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(34, 211, 238, 0.3)';
      ctx.fillRect(cx - wL, y, wL, barH);
      
      // Right Bar (Cyan)
      const gradR = ctx.createLinearGradient(cx, 0, cx + wR, 0);
      gradR.addColorStop(0, '#22d3ee');
      gradR.addColorStop(1, 'rgba(34, 211, 238, 0.2)');

      ctx.fillStyle = gradR;
      ctx.fillRect(cx, y, wR, barH);
      
      ctx.shadowBlur = 0;
      
      // Center Point Highlight
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, height/2, 1.5, 0, Math.PI*2);
      ctx.fill();
      
      // Labels (L / R)
      ctx.fillStyle = '#52525b';
      ctx.font = '8px Inter';
      ctx.fillText('L', 4, height/2 + 3);
      ctx.fillText('R', width - 8, height/2 + 3);

    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full rounded bg-[#050505] border border-white/5 shadow-inner" />;
};
