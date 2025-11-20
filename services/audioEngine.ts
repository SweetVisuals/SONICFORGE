

import { PluginModuleState, PluginType, SaturationMode, ShineMode } from '../types';

class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private analyzer: AnalyserNode;
  
  // Stereo Analysis
  private splitter: ChannelSplitterNode;
  private analyzerL: AnalyserNode;
  private analyzerR: AnalyserNode;

  private sourceNode: MediaElementAudioSourceNode | OscillatorNode | null = null;
  private pluginNodes: Map<string, AudioNode[]> = new Map();
  private currentModules: PluginModuleState[] = [];
  
  // Reverb Impulse
  private impulseBuffer: AudioBuffer | null = null;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.analyzer = this.context.createAnalyser();
    
    // Stereo Analysis Chain
    this.splitter = this.context.createChannelSplitter(2);
    this.analyzerL = this.context.createAnalyser();
    this.analyzerR = this.context.createAnalyser();
    
    this.masterGain.gain.value = 0.8;
    
    // Mono Mix Analyzer for Spectrum
    this.analyzer.fftSize = 4096; 
    this.analyzer.smoothingTimeConstant = 0.8;

    // Stereo Analyzers for Vectorscope
    this.analyzerL.fftSize = 2048;
    this.analyzerR.fftSize = 2048;
    this.analyzerL.smoothingTimeConstant = 0.8;
    this.analyzerR.smoothingTimeConstant = 0.8;
    
    this.masterGain.connect(this.analyzer);
    this.analyzer.connect(this.context.destination);

    // Connect Stereo Analyzers
    this.masterGain.connect(this.splitter);
    this.splitter.connect(this.analyzerL, 0);
    this.splitter.connect(this.analyzerR, 1);
    
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
    const k = (typeof amount === 'number' && isFinite(amount)) ? amount : 0;
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
        // For standard linear chains:
        if (module.type === PluginType.STEREO_IMAGER) {
             // Input -> Splitter (Node 0)
             // Output -> OutputGain (Last Node)
             const inputNode = nodes[0];
             const outputNode = nodes[nodes.length - 1];
             previousNode.connect(inputNode);
             previousNode = outputNode;
        } else if (module.type === PluginType.CHORUS || module.type === PluginType.FLANGER || module.type === PluginType.DOUBLER) {
            // Input must split to dry and wet paths
            // Node 0 is InputGain/Splitter
            previousNode.connect(nodes[0]);
            previousNode = nodes[nodes.length - 1]; // Output Mix
        } else {
            previousNode.connect(nodes[0]);
            // Connect internal nodes
            for (let i = 0; i < nodes.length - 1; i++) {
              nodes[i].connect(nodes[i+1]);
            }
            previousNode = nodes[nodes.length - 1];
        }
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

    // Safe Param Access for initialization
    const v = (key: string, def: number) => {
        const val = params[key];
        return (typeof val === 'number' && Number.isFinite(val)) ? val : def;
    };

    switch (type) {
      case PluginType.VISUAL_EQ:
      case PluginType.SHINE:
      case PluginType.HYBRID_EQ_DYN: {
        // 1. Filters
        for (let i = 1; i <= 7; i++) {
            const filter = this.context.createBiquadFilter();
            
            if (type === PluginType.SHINE) {
                 if (i === 1) filter.type = 'lowshelf';
                 else if (i === 7) filter.type = 'highshelf';
                 else filter.type = 'peaking';
            } else {
                if (i === 1) filter.type = 'lowshelf';
                else if (i === 7) filter.type = 'highshelf';
                else filter.type = 'peaking';
            }
            
            filter.frequency.value = v(`b${i}Freq`, 1000);
            filter.gain.value = v(`b${i}Gain`, 0);
            filter.Q.value = v(`b${i}Q`, 1.0);
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
        gain.gain.value = Math.pow(10, v('output', 0) / 20);
        nodes.push(gain);

        // Connect linear chain
        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].connect(nodes[i+1]);
        }
        
        return [nodes[0], ...nodes.slice(1)];
      }
      
      case PluginType.MULTIBAND: {
          const comp = this.context.createDynamicsCompressor();
          comp.threshold.value = v('midThresh', -20);
          comp.ratio.value = v('ratio', 4);
          return [comp];
      }

      case PluginType.COMPRESSOR: {
        const comp = this.context.createDynamicsCompressor();
        comp.threshold.value = v('threshold', -24);
        comp.ratio.value = v('ratio', 4);
        comp.attack.value = v('attack', 0.003);
        comp.release.value = v('release', 0.25);
        
        const makeup = this.context.createGain();
        makeup.gain.value = Math.pow(10, v('makeup', 0) / 20);
        
        comp.connect(makeup);
        return [comp, makeup];
      }

      case PluginType.SATURATION: {
          const shaper = this.context.createWaveShaper();
          shaper.curve = this.makeDistortionCurve(v('drive', 20), module.saturationMode || 'TUBE');
          shaper.oversample = '4x';
          
          const gain = this.context.createGain();
          gain.gain.value = Math.pow(10, v('output', 0) / 20);
          
          shaper.connect(gain);
          return [shaper, gain];
      }

      case PluginType.DELAY: {
        const delay = this.context.createDelay(5.0);
        delay.delayTime.value = v('time', 0.3);
        const feedback = this.context.createGain();
        feedback.gain.value = v('feedback', 0.4);
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
          gain.gain.value = v('gain', 0.5);
          return [gain];
      }

      case PluginType.STEREO_IMAGER: {
          // Complex M/S Imager Graph with Rotation and Asymmetry
          
          // INPUT
          const inputNode = this.context.createGain();
          const splitter = this.context.createChannelSplitter(2);
          inputNode.connect(splitter);

          // 1. ENCODE (L/R -> M/S)
          // Mid = 0.5 * (L + R)
          // Side = 0.5 * (L - R)
          
          const midEncode = this.context.createGain(); midEncode.gain.value = 0.5;
          const sideEncode = this.context.createGain(); sideEncode.gain.value = 0.5;
          const sideInvert = this.context.createGain(); sideInvert.gain.value = -1;
          
          splitter.connect(midEncode, 0); // L -> Mid
          splitter.connect(midEncode, 1); // R -> Mid
          
          splitter.connect(sideEncode, 0); // L -> Side
          splitter.connect(sideInvert, 1); // R -> Invert -> Side
          sideInvert.connect(sideEncode);

          // 2. ROTATION & ASYMMETRY (Matrix on M/S)
          // Rotation mixes M into S and S into M
          // Asymmetry mixes M into S (skew)
          
          // Nodes for Rotation Matrix
          const midToMid = this.context.createGain();
          const midToSide = this.context.createGain();
          const sideToMid = this.context.createGain();
          const sideToSide = this.context.createGain();
          
          // Connect Encode to Matrix
          midEncode.connect(midToMid);
          midEncode.connect(midToSide);
          sideEncode.connect(sideToMid);
          sideEncode.connect(sideToSide);
          
          // Matrix Summation Points
          const midSum = this.context.createGain();
          const sideSum = this.context.createGain();
          
          midToMid.connect(midSum);
          sideToMid.connect(midSum);
          
          midToSide.connect(sideSum);
          sideToSide.connect(sideSum);

          // 3. PROCESSING ON SIDE CHANNEL
          
          // Bass Mono (HPF on Side)
          const sideHpf = this.context.createBiquadFilter();
          sideHpf.type = 'highpass';
          sideHpf.frequency.value = v('bassMono', 100);
          
          sideSum.connect(sideHpf);
          
          // Stereoize (Delay based Haas effect)
          const stereoDelay = this.context.createDelay(0.1);
          stereoDelay.delayTime.value = 0.008;
          const stereoHp = this.context.createBiquadFilter();
          stereoHp.type = 'highpass';
          stereoHp.frequency.value = 200;
          const stereoGain = this.context.createGain();
          
          // Inject Mid into Side for Stereoize (creates fake side content)
          midSum.connect(stereoDelay);
          stereoDelay.connect(stereoHp);
          stereoHp.connect(stereoGain);
          
          // Combine processed Side + Stereoize
          const sideFinalMix = this.context.createGain();
          sideHpf.connect(sideFinalMix);
          stereoGain.connect(sideFinalMix);
          
          // Width Control (Gain on Final Side)
          const widthGain = this.context.createGain();
          sideFinalMix.connect(widthGain);

          // 4. DECODE (M/S -> L/R)
          // L = M + S
          // R = M - S
          const outL = this.context.createGain();
          const outR = this.context.createGain();
          
          midSum.connect(outL);
          midSum.connect(outR);
          
          widthGain.connect(outL); // + Side
          const sideOutInvert = this.context.createGain();
          sideOutInvert.gain.value = -1;
          widthGain.connect(sideOutInvert);
          sideOutInvert.connect(outR); // - Side

          // 5. OUTPUT STAGE (Pan & Gain)
          const merger = this.context.createChannelMerger(2);
          outL.connect(merger, 0, 0);
          outR.connect(merger, 0, 1);
          
          const panner = this.context.createStereoPanner();
          const outGain = this.context.createGain();
          
          merger.connect(panner);
          panner.connect(outGain);

          // Store nodes for updates
          // [0] Input
          // [1] sideHpf (Bass Mono)
          // [2] widthGain (Width)
          // [3] stereoGain (Stereoize Amt)
          // [4] panner (Pan)
          // [5] outGain (Output)
          // [6-9] Matrix Gains: midToMid, midToSide, sideToMid, sideToSide (Rotation/Asymmetry)
          // [10] Output Node
          
          return [inputNode, sideHpf, widthGain, stereoGain, panner, outGain, midToMid, midToSide, sideToMid, sideToSide, outGain];
      }

      case PluginType.CHORUS: {
          const dry = this.context.createGain();
          const wet = this.context.createGain();
          const inputNode = this.context.createGain(); // Split point
          
          const delay = this.context.createDelay(1.0);
          delay.delayTime.value = 0.03;
          
          const osc = this.context.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = v('rate', 1.5);
          
          const oscGain = this.context.createGain();
          oscGain.gain.value = v('depth', 0.002);
          
          osc.connect(oscGain);
          oscGain.connect(delay.delayTime);
          osc.start();
          
          // Routing
          inputNode.connect(dry);
          inputNode.connect(delay);
          delay.connect(wet);
          
          const output = this.context.createGain();
          dry.connect(output);
          wet.connect(output);
          
          const mix = v('mix', 0.5);
          dry.gain.value = 1 - mix;
          wet.gain.value = mix;

          return [inputNode, delay, osc, oscGain, dry, wet, output];
      }

      case PluginType.FLANGER: {
          const dry = this.context.createGain();
          const wet = this.context.createGain();
          const inputNode = this.context.createGain();
          
          const delay = this.context.createDelay(1.0);
          delay.delayTime.value = 0.005; // Shorter delay for flanger
          
          const feedback = this.context.createGain();
          feedback.gain.value = v('feedback', 0.5);
          
          const osc = this.context.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = v('rate', 0.5);
          
          const oscGain = this.context.createGain();
          oscGain.gain.value = v('depth', 0.002);
          
          osc.connect(oscGain);
          oscGain.connect(delay.delayTime);
          osc.start();
          
          // Routing
          inputNode.connect(dry);
          inputNode.connect(delay);
          delay.connect(wet);
          
          // Feedback Loop
          delay.connect(feedback);
          feedback.connect(delay);
          
          const output = this.context.createGain();
          dry.connect(output);
          wet.connect(output);
          
          const mix = v('mix', 0.5);
          dry.gain.value = 1 - mix;
          wet.gain.value = mix;

          return [inputNode, delay, osc, oscGain, feedback, dry, wet, output];
      }

      case PluginType.DOUBLER: {
          const inputNode = this.context.createGain();
          const output = this.context.createGain();
          const dry = this.context.createGain();
          
          // Split for Stereo widening
          const merger = this.context.createChannelMerger(2);

          // Left Delay Path
          const delayL = this.context.createDelay(1.0);
          delayL.delayTime.value = v('spread', 0.02);
          const oscL = this.context.createOscillator();
          oscL.frequency.value = 0.1; // Slow drift
          const oscLGain = this.context.createGain();
          oscLGain.gain.value = v('detune', 0.001); // Subtle detune
          oscL.connect(oscLGain);
          oscLGain.connect(delayL.delayTime);
          oscL.start();
          
          // Right Delay Path
          const delayR = this.context.createDelay(1.0);
          delayR.delayTime.value = v('spread', 0.02) * 1.5;
          const oscR = this.context.createOscillator();
          oscR.frequency.value = 0.13; // Different rate
          const oscRGain = this.context.createGain();
          oscRGain.gain.value = v('detune', 0.001);
          oscR.connect(oscRGain);
          oscRGain.connect(delayR.delayTime);
          oscR.start();
          
          const wetL = this.context.createGain();
          const wetR = this.context.createGain();
          
          inputNode.connect(delayL);
          inputNode.connect(delayR);
          inputNode.connect(dry);
          
          delayL.connect(wetL);
          delayR.connect(wetR);
          
          // Connect to stereo channels
          // Dry Center
          dry.connect(merger, 0, 0);
          dry.connect(merger, 0, 1);
          
          // Wets Hard Panned
          wetL.connect(merger, 0, 0);
          wetR.connect(merger, 0, 1);
          
          merger.connect(output);
          
          const mix = v('mix', 0.5);
          dry.gain.value = 1 - mix;
          wetL.gain.value = mix;
          wetR.gain.value = mix;
          
          // Return array order important for updateParams?
          // Doubler: [input, delayL, delayR, oscL, oscR, oscLGain, oscRGain, wetL, wetR, dry, output]
          return [inputNode, delayL, delayR, oscL, oscR, oscLGain, oscRGain, wetL, wetR, dry, output];
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

     // Helper to safe guard params against NaN or Undefined
     const v = (val: any, def: number) => (typeof val === 'number' && Number.isFinite(val) ? val : def);

     if (module.type === PluginType.VISUAL_EQ || module.type === PluginType.HYBRID_EQ_DYN || module.type === PluginType.SHINE) {
        // Apply filter params (First 7 nodes are filters)
        for (let i = 0; i < 7; i++) {
            if (nodes[i] instanceof BiquadFilterNode) {
                const bandNum = i + 1;
                const filter = nodes[i] as BiquadFilterNode;
                
                filter.frequency.setTargetAtTime(v(p[`b${bandNum}Freq`], 1000), t, 0.05);
                
                let gain = v(p[`b${bandNum}Gain`], 0);
                if (module.type === PluginType.SHINE) {
                    gain = v(p[`b${bandNum}Gain`], 0);
                }
                
                filter.gain.setTargetAtTime(gain, t, 0.05);
                filter.Q.setTargetAtTime(v(p[`b${bandNum}Q`], 1.0), t, 0.05);
            }
        }

        // Hybrid Logic
        if (module.type === PluginType.HYBRID_EQ_DYN) {
            // Smart Knobs allow Global Scaling
            const smartDriveScale = v(p.smartDrive, 50) / 50; // 0..2
            const smartDynScale = v(p.smartDyn, 50) / 50;   // 0..2

            // Calculate Aggregate Layer Values from Curves
            let avgDyn = 0;
            let avgSat = 0;
            let avgVerb = 0;
            let avgDelay = 0;
            let avgShine = 0;

            for (let i = 1; i <= 7; i++) {
                const d = Math.max(0, v(p[`b${i}Dyn`], 0)) / 18; 
                const s = Math.max(0, v(p[`b${i}Sat`], 0)) / 18; 
                const v_ = Math.max(0, v(p[`b${i}Verb`], 0)) / 18;
                const dl = Math.max(0, v(p[`b${i}Delay`], 0)) / 18;
                const sh = Math.max(0, v(p[`b${i}Shine`], 0)) / 18;
                avgDyn += d;
                avgSat += s;
                avgVerb += v_;
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
                    const baseDrive = v(p.drive, 0);
                    const drive = (baseDrive + (avgSat * 100)) * smartDriveScale; 
                    (node as any).curve = this.makeDistortionCurve(Math.min(100, drive), module.saturationMode);
                }
                // Compressor
                if (node instanceof DynamicsCompressorNode) {
                    const baseThresh = v(p.threshold, -10);
                    const baseRatio = v(p.ratio, 1);
                    
                    const thresh = Math.max(-60, baseThresh - (avgDyn * 40 * smartDynScale)); 
                    const ratio = Math.min(20, baseRatio + (avgDyn * 8 * smartDynScale)); 

                    (node as DynamicsCompressorNode).threshold.setTargetAtTime(thresh, t, 0.1);
                    (node as DynamicsCompressorNode).ratio.setTargetAtTime(ratio, t, 0.1);
                    
                    if (p.attack !== undefined) (node as DynamicsCompressorNode).attack.setTargetAtTime(v(p.attack, 0.003), t, 0.1);
                    if (p.release !== undefined) (node as DynamicsCompressorNode).release.setTargetAtTime(v(p.release, 0.25), t, 0.1);
                }
                // Delay
                if (node instanceof DelayNode) {
                    const baseTime = v(p.time, 0.2);
                    (node as DelayNode).delayTime.setTargetAtTime(baseTime + (avgDelay * 0.3), t, 0.1);
                }
                // Shine (Exciter Filter)
                if (node instanceof BiquadFilterNode && (node as BiquadFilterNode).frequency.value === 8000) {
                     let shineBoost = avgShine * 20; // map 0..1 to 0..20dB
                     if (module.type === PluginType.SHINE) {
                         shineBoost = 2; 
                     }
                     
                     const sMode = module.shineMode || 'AIR';
                     if (sMode === 'AIR') { (node as BiquadFilterNode).frequency.setTargetAtTime(12000, t, 0.1); shineBoost *= 1.2; }
                     else if (sMode === 'CRYSTAL') { (node as BiquadFilterNode).frequency.setTargetAtTime(5000, t, 0.1); shineBoost *= 0.8; }
                     else if (sMode === 'SHIMMER') { (node as BiquadFilterNode).frequency.setTargetAtTime(8000, t, 0.1); shineBoost *= 1.0; }
                     else if (sMode === 'GLOSS') { (node as BiquadFilterNode).type = 'peaking'; (node as BiquadFilterNode).Q.value = 0.5; shineBoost *= 1.5; }
                     
                     (node as BiquadFilterNode).gain.setTargetAtTime(shineBoost, t, 0.1);
                }
            });
        }
        // Pure Shine Type Logic
        else if (module.type === PluginType.SHINE) {
             nodes.forEach(node => {
                 if (node instanceof BiquadFilterNode && (node as BiquadFilterNode).frequency.value >= 5000) {
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
             const val = Math.pow(10, v(p.output, 0) / 20);
             lastNode.gain.setTargetAtTime(val, t, 0.05);
        }

     }
     else if (module.type === PluginType.SATURATION) {
         const shaper = nodes[0] as WaveShaperNode;
         (shaper as any).curve = this.makeDistortionCurve(v(p.drive, 0), module.saturationMode);
         
         const gain = nodes[1] as GainNode;
         gain.gain.setTargetAtTime(Math.pow(10, v(p.output, 0) / 20), t, 0.1);
     } 
     else if (module.type === PluginType.COMPRESSOR) {
         const comp = nodes[0] as DynamicsCompressorNode;
         comp.threshold.setTargetAtTime(v(p.threshold, -24), t, 0.1);
         comp.ratio.setTargetAtTime(v(p.ratio, 4), t, 0.1);
         comp.attack.setTargetAtTime(v(p.attack, 0.003), t, 0.1);
         comp.release.setTargetAtTime(v(p.release, 0.25), t, 0.1);
         if (nodes[1] instanceof GainNode) {
             nodes[1].gain.setTargetAtTime(Math.pow(10, v(p.makeup, 0) / 20), t, 0.1);
         }
     }
     else if (module.type === PluginType.DELAY) {
         const delay = nodes[0] as DelayNode;
         delay.delayTime.setTargetAtTime(v(p.time, 0.3), t, 0.1);
     }
     else if (module.type === PluginType.OSCILLATOR) {
         if (this.sourceNode instanceof OscillatorNode) {
             this.sourceNode.frequency.setTargetAtTime(v(p.frequency, 440), t, 0.1);
             this.sourceNode.detune.setTargetAtTime(v(p.detune, 0), t, 0.1);
         }
         const gain = nodes[0] as GainNode;
         gain.gain.setTargetAtTime(v(p.gain, 0.5), t, 0.1);
     }
     else if (module.type === PluginType.STEREO_IMAGER) {
         // Nodes: [inputNode, sideHpf, widthGain, stereoGain, panner, outGain, midToMid, midToSide, sideToMid, sideToSide, outGain]
         const sideHpf = nodes[1] as BiquadFilterNode;
         const widthGain = nodes[2] as GainNode;
         const stereoGain = nodes[3] as GainNode;
         const panner = nodes[4] as StereoPannerNode;
         const outGain = nodes[5] as GainNode;
         
         const midToMid = nodes[6] as GainNode;
         const midToSide = nodes[7] as GainNode;
         const sideToMid = nodes[8] as GainNode;
         const sideToSide = nodes[9] as GainNode;

         const width = v(p.width, 100) / 100;
         widthGain.gain.setTargetAtTime(width, t, 0.1);

         const bassMonoFreq = v(p.bassMono, 100);
         sideHpf.frequency.setTargetAtTime(bassMonoFreq, t, 0.1);

         const stereoAmt = v(p.stereoize, 0) / 100;
         stereoGain.gain.setTargetAtTime(stereoAmt, t, 0.1);

         const pan = v(p.pan, 0) / 100;
         panner.pan.setTargetAtTime(pan, t, 0.1);

         outGain.gain.setTargetAtTime(Math.pow(10, v(p.output, 0) / 20), t, 0.1);
         
         // Matrix Calculations for Rotation and Asymmetry
         const deg = v(p.rotation, 0);
         const rad = (deg * Math.PI) / 180;
         const asym = v(p.asymmetry, 0) / 100; // -1 to 1

         // Basic Rotation:
         // M' = M cos - S sin
         // S' = M sin + S cos
         
         // Asymmetry effectively adds M to S (skew) or modifies balance
         // Let's apply Asymmetry as a simple leak factor of Mid into Side *after* rotation, or just modify S gain balance? 
         // S1 Asymmetry typically shifts the center. S = S + (Asym * M).
         
         // Combined Matrix:
         // M_out = M * cos(rad) - S * sin(rad)
         // S_temp = M * sin(rad) + S * cos(rad)
         // S_out = S_temp + (M_out * asym)  <-- Simplified approach for visual center shifting
         
         // Let's simplify to just Rotation matrix + Asymmetry Term on M->S
         // midToMid = cos
         // sideToMid = -sin
         // midToSide = sin + (asym * cos)  <-- Asym applied to M component
         // sideToSide = cos - (asym * sin) <-- Asym applied to S component? No usually Asym depends on M.
         
         // Standard rotation first:
         const cos = Math.cos(rad);
         const sin = Math.sin(rad);
         
         midToMid.gain.setTargetAtTime(cos, t, 0.1);
         sideToMid.gain.setTargetAtTime(-sin, t, 0.1);
         
         // Apply Asymmetry: Add a portion of Mid to Side
         // S_new = S_rot + (asym * M_rot)
         // This effectively pans the center channel without panning the hard L/R bounds as much
         midToSide.gain.setTargetAtTime(sin + (asym * 0.5), t, 0.1); 
         sideToSide.gain.setTargetAtTime(cos, t, 0.1);
     }
     else if (module.type === PluginType.CHORUS) {
         // [inputNode, delay, osc, oscGain, dry, wet, output]
         const delay = nodes[1] as DelayNode;
         const osc = nodes[2] as OscillatorNode;
         const oscGain = nodes[3] as GainNode;
         const dry = nodes[4] as GainNode;
         const wet = nodes[5] as GainNode;

         osc.frequency.setTargetAtTime(v(p.rate, 1.5), t, 0.1);
         oscGain.gain.setTargetAtTime(v(p.depth, 0.002), t, 0.1);
         
         const mix = v(p.mix, 0.5);
         dry.gain.setTargetAtTime(1 - mix, t, 0.1);
         wet.gain.setTargetAtTime(mix, t, 0.1);
     }
     else if (module.type === PluginType.FLANGER) {
         // [inputNode, delay, osc, oscGain, feedback, dry, wet, output]
         const osc = nodes[2] as OscillatorNode;
         const oscGain = nodes[3] as GainNode;
         const feedback = nodes[4] as GainNode;
         const dry = nodes[5] as GainNode;
         const wet = nodes[6] as GainNode;

         osc.frequency.setTargetAtTime(v(p.rate, 0.5), t, 0.1);
         oscGain.gain.setTargetAtTime(v(p.depth, 0.002), t, 0.1);
         feedback.gain.setTargetAtTime(v(p.feedback, 0.5), t, 0.1);
         
         const mix = v(p.mix, 0.5);
         dry.gain.setTargetAtTime(1 - mix, t, 0.1);
         wet.gain.setTargetAtTime(mix, t, 0.1);
     }
     else if (module.type === PluginType.DOUBLER) {
        // [inputNode, delayL, delayR, oscL, oscR, oscLGain, oscRGain, wetL, wetR, dry, output]
        const delayL = nodes[1] as DelayNode;
        const delayR = nodes[2] as DelayNode;
        const oscLGain = nodes[5] as GainNode;
        const oscRGain = nodes[6] as GainNode;
        const wetL = nodes[7] as GainNode;
        const wetR = nodes[8] as GainNode;
        const dry = nodes[9] as GainNode;

        const spread = v(p.spread, 20) / 1000;
        delayL.delayTime.setTargetAtTime(spread, t, 0.1);
        delayR.delayTime.setTargetAtTime(spread * 1.5, t, 0.1);
        
        // Simulate detune by modulating delay slightly
        const detuneAmt = v(p.detune, 10) / 10000;
        oscLGain.gain.setTargetAtTime(detuneAmt, t, 0.1);
        oscRGain.gain.setTargetAtTime(detuneAmt, t, 0.1);
        
        const mix = v(p.mix, 0.5);
        dry.gain.setTargetAtTime(1 - mix, t, 0.1);
        wetL.gain.setTargetAtTime(mix, t, 0.1);
        wetR.gain.setTargetAtTime(mix, t, 0.1);
     }
  }

  getAnalyzer() {
    return this.analyzer;
  }
  
  getStereoAnalyzers() {
      return { l: this.analyzerL, r: this.analyzerR };
  }
  
  getContext() {
      return this.context;
  }
}

export const audioEngine = new AudioEngine();