
import { PluginModuleState, PluginType, SaturationMode, ShineMode } from '../types';

class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private analyzer: AnalyserNode;
  private sourceNode: MediaElementAudioSourceNode | OscillatorNode | null = null;
  private pluginNodes: Map<string, AudioNode[]> = new Map();
  private currentModules: PluginModuleState[] = [];
  
  // Reverb Impulse
  private impulseBuffer: AudioBuffer | null = null;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.analyzer = this.context.createAnalyser();
    
    this.masterGain.gain.value = 0.8;
    this.analyzer.fftSize = 4096; // Higher res for better visualizer
    this.analyzer.smoothingTimeConstant = 0.8;
    
    this.masterGain.connect(this.analyzer);
    this.analyzer.connect(this.context.destination);
    
    this.generateImpulseResponse();
  }

  private generateImpulseResponse() {
    const rate = this.context.sampleRate;
    const length = rate * 2.0; // 2 seconds
    const decay = 2.0;
    const impulse = this.context.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    this.impulseBuffer = impulse;
  }

  // Create a distortion curve based on mode
  private makeDistortionCurve(amount: number, mode: SaturationMode = 'TUBE') {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      
      switch (mode) {
          case 'DIGITAL': // Hard Clipping
             if (x < -0.5) curve[i] = -0.5;
             else if (x > 0.5) curve[i] = 0.5;
             else curve[i] = x;
             curve[i] *= (1 + k/100); // Gain scaling
             break;

          case 'TAPE': // Asymmetric Soft
             const y = (x + 0.2 * x * x * x); // Bias
             curve[i] = Math.tanh(y * (1 + k/50));
             break;

          case 'FUZZ': // High Gain into Hard Clip
             const gain = 1 + (k/5);
             const z = x * gain;
             curve[i] = Math.max(-0.8, Math.min(0.8, z));
             break;

          case 'RECTIFY': // Absolute
             curve[i] = Math.abs(x) * (1 + k/100) - 0.2; 
             break;

          case 'TUBE':
          default: // Soft Clipping (Standard)
             curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
             break;
      }
    }
    return curve;
  }

  async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  loadSource(element: HTMLAudioElement) {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    this.sourceNode = this.context.createMediaElementSource(element);
    this.reconnectChain();
  }

  startOscillator() {
      if (this.sourceNode) {
          try { this.sourceNode.disconnect(); } catch(e) {}
      }
      const osc = this.context.createOscillator();
      osc.type = 'sawtooth';
      osc.start();
      this.sourceNode = osc;
      this.reconnectChain();
  }

  private reconnectChain() {
    this.updatePluginChain(this.currentModules);
  }

  updatePluginChain(modules: PluginModuleState[]) {
    this.currentModules = modules;
    // 1. Disconnect existing chain
    if (this.sourceNode) this.sourceNode.disconnect();
    this.pluginNodes.forEach(nodes => nodes.forEach(n => n.disconnect()));
    this.pluginNodes.clear();

    let previousNode: AudioNode | null = this.sourceNode;

    // 2. Create nodes for each module
    modules.forEach(module => {
      if (!module.enabled) return;

      const nodes = this.createNodesForModule(module);
      this.pluginNodes.set(module.id, nodes);

      if (nodes.length > 0 && previousNode) {
        previousNode.connect(nodes[0]);
        // Connect internal nodes
        for (let i = 0; i < nodes.length - 1; i++) {
          nodes[i].connect(nodes[i+1]);
        }
        previousNode = nodes[nodes.length - 1];
      }
    });

    // 3. Connect last to master
    if (previousNode) {
      previousNode.connect(this.masterGain);
    }
  }

  private createNodesForModule(module: PluginModuleState): AudioNode[] {
    const { type, params, nestedModules } = module;
    const nodes: AudioNode[] = [];

    switch (type) {
      case PluginType.VISUAL_EQ:
      case PluginType.SHINE:
      case PluginType.HYBRID_EQ_DYN: {
        // 1. Filters
        for (let i = 1; i <= 7; i++) {
            const filter = this.context.createBiquadFilter();
            
            if (type === PluginType.SHINE) {
                 // Shine tweaks: Higher Qs, shelves are steeper?
                 // For now, standard EQ filters are used but frequencies can be biased by params
                 if (i === 1) filter.type = 'lowshelf';
                 else if (i === 7) filter.type = 'highshelf';
                 else filter.type = 'peaking';
            } else {
                if (i === 1) filter.type = 'lowshelf';
                else if (i === 7) filter.type = 'highshelf';
                else filter.type = 'peaking';
            }
            
            filter.frequency.value = params[`b${i}Freq`];
            filter.gain.value = params[`b${i}Gain`];
            filter.Q.value = params[`b${i}Q`] || 1.0;
            nodes.push(filter);
        }

        const isHybrid = type === PluginType.HYBRID_EQ_DYN;
        const isShine = type === PluginType.SHINE;

        // Check for modules in nest
        const hasSat = isHybrid && nestedModules && nestedModules.includes(PluginType.SATURATION);
        const hasComp = isHybrid && (!nestedModules || nestedModules.includes(PluginType.COMPRESSOR) || nestedModules.includes(PluginType.MULTIBAND));
        const hasReverb = isHybrid && nestedModules?.includes(PluginType.REVERB);
        const hasDelay = isHybrid && nestedModules?.includes(PluginType.DELAY);
        const hasShine = isHybrid && nestedModules?.includes(PluginType.SHINE);

        // 2. Dynamics (Saturation + Compression) or Shine Exciter
        
        if (hasSat) {
            const shaper = this.context.createWaveShaper();
            shaper.curve = this.makeDistortionCurve(0, module.saturationMode || 'TUBE'); 
            shaper.oversample = '4x';
            nodes.push(shaper);
        }

        if (isShine || hasShine) {
            // Shine Logic: Add subtle harmonics or air
            // We can implement this as a parallel high shelf saturator?
            // For simplicity in this linear chain, we'll add a high-shelf exciter filter
            const exciter = this.context.createBiquadFilter();
            exciter.type = 'highshelf';
            exciter.frequency.value = 8000;
            exciter.gain.value = 0; // Controlled by params
            nodes.push(exciter);
        }

        if (hasComp) {
            const comp = this.context.createDynamicsCompressor();
            comp.threshold.value = -24;
            comp.ratio.value = 1;
            nodes.push(comp);
        }

        // 3. Time Based Effects
        if (hasDelay) {
            const delay = this.context.createDelay(5.0);
            delay.delayTime.value = 0.3;
            const fb = this.context.createGain();
            fb.gain.value = 0.3;
            delay.connect(fb);
            fb.connect(delay);
            nodes.push(delay);
        }

        if (hasReverb) {
            const convolver = this.context.createConvolver();
            if (this.impulseBuffer) convolver.buffer = this.impulseBuffer;
            nodes.push(convolver);
        }
        
        // 4. Output Gain
        const gain = this.context.createGain();
        gain.gain.value = Math.pow(10, params.output / 20);
        nodes.push(gain);

        // Connect linear chain
        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].connect(nodes[i+1]);
        }
        
        return [nodes[0], ...nodes.slice(1)];
      }
      
      case PluginType.MULTIBAND: {
          const comp = this.context.createDynamicsCompressor();
          comp.threshold.value = params.midThresh;
          comp.ratio.value = params.ratio;
          return [comp];
      }

      case PluginType.COMPRESSOR: {
        const comp = this.context.createDynamicsCompressor();
        comp.threshold.value = params.threshold;
        comp.ratio.value = params.ratio;
        comp.attack.value = params.attack;
        comp.release.value = params.release;
        
        const makeup = this.context.createGain();
        makeup.gain.value = Math.pow(10, params.makeup / 20);
        
        comp.connect(makeup);
        return [comp, makeup];
      }

      case PluginType.SATURATION: {
          const shaper = this.context.createWaveShaper();
          shaper.curve = this.makeDistortionCurve(params.drive, module.saturationMode || 'TUBE');
          shaper.oversample = '4x';
          
          const gain = this.context.createGain();
          gain.gain.value = Math.pow(10, params.output / 20);
          
          shaper.connect(gain);
          return [shaper, gain];
      }

      case PluginType.DELAY: {
        const delay = this.context.createDelay(5.0);
        delay.delayTime.value = params.time;
        const feedback = this.context.createGain();
        feedback.gain.value = params.feedback;
        delay.connect(feedback);
        feedback.connect(delay);
        return [delay];
      }

      case PluginType.REVERB: {
        const convolver = this.context.createConvolver();
        if (this.impulseBuffer) convolver.buffer = this.impulseBuffer;
        return [convolver];
      }
      
      case PluginType.OSCILLATOR: {
          const gain = this.context.createGain();
          gain.gain.value = params.gain;
          return [gain];
      }

      default:
        return [];
    }
  }
  
  updateParams(module: PluginModuleState) {
     const nodes = this.pluginNodes.get(module.id);
     if (!nodes) return;
     
     const p = module.params;
     const t = this.context.currentTime;

     if (module.type === PluginType.VISUAL_EQ || module.type === PluginType.HYBRID_EQ_DYN || module.type === PluginType.SHINE) {
        // Apply filter params (First 7 nodes are filters)
        for (let i = 0; i < 7; i++) {
            if (nodes[i] instanceof BiquadFilterNode) {
                const bandNum = i + 1;
                const filter = nodes[i] as BiquadFilterNode;
                
                // If strictly Shine module, we might adjust standard EQ behavior based on Shine Mode
                // But to keep VisualEQ sync, we rely on the params.
                
                filter.frequency.setTargetAtTime(p[`b${bandNum}Freq`], t, 0.05);
                
                let gain = p[`b${bandNum}Gain`];
                if (module.type === PluginType.SHINE) {
                    // Shine module uses "Gain" params directly? Or should it use "Shine" params?
                    // If it is type SHINE, standard knobs control `bXGain`.
                    // If Hybrid, `bXShine` is used.
                    gain = p[`b${bandNum}Gain`];
                }
                
                filter.gain.setTargetAtTime(gain, t, 0.05);
                filter.Q.setTargetAtTime(p[`b${bandNum}Q`] || 1.0, t, 0.05);
            }
        }

        // Hybrid Logic
        if (module.type === PluginType.HYBRID_EQ_DYN) {
            // Smart Knobs allow Global Scaling
            const smartDriveScale = (p.smartDrive ?? 50) / 50; // 0..2
            const smartDynScale = (p.smartDyn ?? 50) / 50;   // 0..2

            // Calculate Aggregate Layer Values from Curves
            let avgDyn = 0;
            let avgSat = 0;
            let avgVerb = 0;
            let avgDelay = 0;
            let avgShine = 0;

            for (let i = 1; i <= 7; i++) {
                const d = Math.max(0, p[`b${i}Dyn`]) / 18; 
                const s = Math.max(0, p[`b${i}Sat`]) / 18; 
                const v = Math.max(0, p[`b${i}Verb`]) / 18;
                const dl = Math.max(0, p[`b${i}Delay`]) / 18;
                const sh = Math.max(0, p[`b${i}Shine`]) / 18;
                avgDyn += d;
                avgSat += s;
                avgVerb += v;
                avgDelay += dl;
                avgShine += sh;
            }
            // Average across 7 bands
            avgDyn /= 7;
            avgSat /= 7;
            avgVerb /= 7;
            avgDelay /= 7;
            avgShine /= 7;

            // Iterate through nodes to find effects and apply params
            nodes.forEach(node => {
                // Saturation (WaveShaper)
                if (node instanceof WaveShaperNode) {
                    const baseDrive = p.drive !== undefined ? p.drive : 0;
                    const drive = (baseDrive + (avgSat * 100)) * smartDriveScale; 
                    (node as any).curve = this.makeDistortionCurve(Math.min(100, drive), module.saturationMode);
                }
                // Compressor
                if (node instanceof DynamicsCompressorNode) {
                    const baseThresh = p.threshold !== undefined ? p.threshold : -10;
                    const baseRatio = p.ratio !== undefined ? p.ratio : 1;
                    
                    const thresh = Math.max(-60, baseThresh - (avgDyn * 40 * smartDynScale)); 
                    const ratio = Math.min(20, baseRatio + (avgDyn * 8 * smartDynScale)); 

                    (node as DynamicsCompressorNode).threshold.setTargetAtTime(thresh, t, 0.1);
                    (node as DynamicsCompressorNode).ratio.setTargetAtTime(ratio, t, 0.1);
                    
                    if (p.attack !== undefined) (node as DynamicsCompressorNode).attack.setTargetAtTime(p.attack, t, 0.1);
                    if (p.release !== undefined) (node as DynamicsCompressorNode).release.setTargetAtTime(p.release, t, 0.1);
                }
                // Delay
                if (node instanceof DelayNode) {
                    const baseTime = p.time !== undefined ? p.time : 0.2;
                    (node as DelayNode).delayTime.setTargetAtTime(baseTime + (avgDelay * 0.3), t, 0.1);
                }
                // Shine (Exciter Filter) - Found as HighShelf usually towards the end of filters or explicitly added
                // In createNodes, if isShine or hasShine, we pushed a Biquad 'highshelf' at 8k
                if (node instanceof BiquadFilterNode && (node as BiquadFilterNode).frequency.value === 8000) {
                     // This is our mock exciter node
                     let shineBoost = avgShine * 20; // map 0..1 to 0..20dB
                     if (module.type === PluginType.SHINE) {
                         // If pure Shine module, maybe base it on aggregate gain?
                         // Actually for SHINE type, the bXGain handles the main EQ.
                         // This extra node adds "Mode" flavor.
                         shineBoost = 2; // Default subtle boost
                     }
                     
                     // Mode Influence
                     const sMode = module.shineMode || 'AIR';
                     if (sMode === 'AIR') { (node as BiquadFilterNode).frequency.value = 12000; shineBoost *= 1.2; }
                     else if (sMode === 'CRYSTAL') { (node as BiquadFilterNode).frequency.value = 5000; shineBoost *= 0.8; }
                     else if (sMode === 'SHIMMER') { (node as BiquadFilterNode).frequency.value = 8000; shineBoost *= 1.0; }
                     else if (sMode === 'GLOSS') { (node as BiquadFilterNode).type = 'peaking'; (node as BiquadFilterNode).Q.value = 0.5; shineBoost *= 1.5; }
                     
                     (node as BiquadFilterNode).gain.setTargetAtTime(shineBoost, t, 0.1);
                }
            });
        }
        // Pure Shine Type Logic
        else if (module.type === PluginType.SHINE) {
             // Update the extra exciter node if present
             nodes.forEach(node => {
                 if (node instanceof BiquadFilterNode && (node as BiquadFilterNode).frequency.value >= 5000) {
                      // Mode check
                     const sMode = module.shineMode || 'AIR';
                     let freq = 10000;
                     let type: BiquadFilterType = 'highshelf';
                     
                     if (sMode === 'AIR') freq = 15000;
                     if (sMode === 'CRYSTAL') freq = 8000;
                     if (sMode === 'SHIMMER') freq = 6000;
                     if (sMode === 'ANGELIC') freq = 12000;
                     if (sMode === 'GLOSS') { freq = 9000; type = 'peaking'; }
                     
                     (node as BiquadFilterNode).type = type;
                     (node as BiquadFilterNode).frequency.setTargetAtTime(freq, t, 0.1);
                 }
             });
        }

        // Output Gain (Last node)
        const lastNode = nodes[nodes.length - 1];
        if (lastNode instanceof GainNode) {
             const val = Math.pow(10, p.output / 20);
             lastNode.gain.setTargetAtTime(val, t, 0.05);
        }

     }
     else if (module.type === PluginType.SATURATION) {
         const shaper = nodes[0] as WaveShaperNode;
         (shaper as any).curve = this.makeDistortionCurve(p.drive, module.saturationMode);
         
         const gain = nodes[1] as GainNode;
         gain.gain.setTargetAtTime(Math.pow(10, p.output / 20), t, 0.1);
     } 
     else if (module.type === PluginType.COMPRESSOR) {
         const comp = nodes[0] as DynamicsCompressorNode;
         comp.threshold.setTargetAtTime(p.threshold, t, 0.1);
         comp.ratio.setTargetAtTime(p.ratio, t, 0.1);
         comp.attack.setTargetAtTime(p.attack, t, 0.1);
         comp.release.setTargetAtTime(p.release, t, 0.1);
         if (nodes[1] instanceof GainNode) {
             nodes[1].gain.setTargetAtTime(Math.pow(10, p.makeup / 20), t, 0.1);
         }
     }
     else if (module.type === PluginType.DELAY) {
         const delay = nodes[0] as DelayNode;
         delay.delayTime.setTargetAtTime(p.time, t, 0.1);
     }
     else if (module.type === PluginType.OSCILLATOR) {
         if (this.sourceNode instanceof OscillatorNode) {
             this.sourceNode.frequency.setTargetAtTime(p.frequency, t, 0.1);
             this.sourceNode.detune.setTargetAtTime(p.detune, t, 0.1);
         }
         const gain = nodes[0] as GainNode;
         gain.gain.setTargetAtTime(p.gain, t, 0.1);
     }
  }

  getAnalyzer() {
    return this.analyzer;
  }
  
  getContext() {
      return this.context;
  }
}

export const audioEngine = new AudioEngine();