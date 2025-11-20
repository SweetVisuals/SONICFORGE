import { PluginType, AudioParamConfig, PluginLayer, UIComponent } from './types';

// Band Colors matching Fruity PEQ2 / FabFilter style
export const BAND_COLORS = [
  '#8b5cf6', // Purple (Sub) - Band 1
  '#ec4899', // Pink (Bass) - Band 2
  '#f97316', // Orange (Low Mid) - Band 3
  '#eab308', // Yellow (Mid) - Band 4
  '#22c55e', // Green (High Mid) - Band 5
  '#06b6d4', // Cyan (Presence) - Band 6
  '#3b82f6'  // Blue (Treble) - Band 7
];

const generateEqParams = () => {
    const params: AudioParamConfig[] = [];
    const freqs = [60, 130, 300, 800, 2000, 5000, 10000];
    
    for (let i = 1; i <= 7; i++) {
        // Main EQ Params
        params.push(
            { id: `b${i}Freq`, name: `Band ${i} Freq`, value: freqs[i-1], min: 20, max: 20000, step: 1, unit: 'Hz', hidden: true },
            { id: `b${i}Gain`, name: `Band ${i} Gain`, value: 0, min: -18, max: 18, step: 0.1, unit: 'dB', hidden: true },
            { id: `b${i}Q`, name: `Band ${i} Q`, value: 1.0, min: 0.1, max: 10, step: 0.1, unit: '', hidden: true }
        );

        // Layer Params (Hidden by default, used when layers active)
        // Dynamics: Value represents compression intensity/threshold shift
        params.push({ id: `b${i}Dyn`, name: `Band ${i} Dyn`, value: 0, min: -60, max: 0, step: 0.5, unit: 'dB', hidden: true });
        // Saturation: Value represents drive intensity
        params.push({ id: `b${i}Sat`, name: `Band ${i} Sat`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        
        // Shine: Value represents polish/excite amount + Frequency control for separation
        params.push({ id: `b${i}Shine`, name: `Band ${i} Shine`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        params.push({ id: `b${i}ShineFreq`, name: `Band ${i} Shine Freq`, value: freqs[i-1], min: 20, max: 20000, step: 1, unit: 'Hz', hidden: true });

        // Reverb: Value represents send amount
        params.push({ id: `b${i}Verb`, name: `Band ${i} Verb`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        // Delay: Value represents feedback/mix
        params.push({ id: `b${i}Delay`, name: `Band ${i} Delay`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        
        // Extra Dynamics Params per band (For Multiband)
        params.push(
            { id: `b${i}Ratio`, name: `Band ${i} Ratio`, value: 4, min: 1, max: 20, step: 0.1, unit: ':1', hidden: true },
            { id: `b${i}Attack`, name: `Band ${i} Attack`, value: 0.01, min: 0, max: 0.2, step: 0.001, unit: 's', hidden: true },
            { id: `b${i}Release`, name: `Band ${i} Release`, value: 0.1, min: 0.01, max: 1, step: 0.01, unit: 's', hidden: true }
        );
    }
    
    params.push({ id: 'output', name: 'Output', value: 0, min: -24, max: 24, step: 0.1, unit: 'dB' });
    return params;
};

export const EQ_PARAMS = generateEqParams();

export const PLUGIN_DEFINITIONS: Record<PluginType, { params: AudioParamConfig[], description: string, defaultColor: string, icon: string }> = {
  [PluginType.VISUAL_EQ]: {
    description: "7-Band Parametric EQ with real-time spectral analysis.",
    defaultColor: "#3b82f6",
    icon: "waves",
    params: EQ_PARAMS
  },
  [PluginType.SHINE]: {
      description: "High-frequency polisher and spectral enhancer.",
      defaultColor: "#22d3ee", // Cyan
      icon: "sparkles",
      params: EQ_PARAMS
  },
  [PluginType.HYBRID_EQ_DYN]: {
    description: "Smart Channel Strip. EQ moves drive Saturation & Compression.",
    defaultColor: "#eab308", // Gold
    icon: "layers",
    params: [
        ...EQ_PARAMS,
        { id: 'smartDrive', name: 'Smart Drive', value: 50, min: 0, max: 100, step: 1, unit: '%' },
        { id: 'smartDyn', name: 'Smart Dyn', value: 50, min: 0, max: 100, step: 1, unit: '%' }
    ]
  },
  [PluginType.MULTIBAND]: {
    description: "Multi-band compression with visual spectral control.",
    defaultColor: "#f43f5e",
    icon: "activity",
    params: [
      ...EQ_PARAMS, // Uses EQ bands but mapped to parallel compression
    ]
  },
  [PluginType.COMPRESSOR]: {
    description: "VCA style dynamics processor.",
    defaultColor: "#ef4444", // Red
    icon: "zap",
    params: [
      { id: 'threshold', name: 'Threshold', value: -24, min: -60, max: 0, step: 1, unit: 'dB' },
      { id: 'ratio', name: 'Ratio', value: 4, min: 1, max: 20, step: 0.5, unit: ':1' },
      { id: 'attack', name: 'Attack', value: 0.003, min: 0, max: 1, step: 0.001, unit: 's' },
      { id: 'release', name: 'Release', value: 0.25, min: 0, max: 1, step: 0.01, unit: 's' },
      { id: 'makeup', name: 'Make Up', value: 0, min: 0, max: 24, step: 0.1, unit: 'dB' }
    ]
  },
  [PluginType.SATURATION]: {
    description: "Warm analog-style tube saturation.",
    defaultColor: "#f97316", // Orange
    icon: "flame",
    params: [
      { id: 'drive', name: 'Drive', value: 20, min: 0, max: 100, step: 1, unit: '%' },
      { id: 'output', name: 'Output', value: 0, min: -24, max: 6, step: 0.1, unit: 'dB' }
    ]
  },
  [PluginType.REVERB]: {
    description: "Algorithmic Hall Reverb.",
    defaultColor: "#a855f7", // Purple
    icon: "aperture",
    params: [
      { id: 'mix', name: 'Wet/Dry', value: 0.3, min: 0, max: 1, step: 0.01, unit: '' },
      { id: 'decay', name: 'Decay', value: 2.0, min: 0.1, max: 10, step: 0.1, unit: 's' },
      { id: 'size', name: 'Room Size', value: 0.8, min: 0, max: 1, step: 0.01, unit: '' }
    ]
  },
  [PluginType.DELAY]: {
    description: "Stereo Delay with Ping Pong.",
    defaultColor: "#10b981", // Emerald
    icon: "clock",
    params: [
      { id: 'time', name: 'Time', value: 0.3, min: 0, max: 1, step: 0.01, unit: 's' },
      { id: 'feedback', name: 'Feedback', value: 0.4, min: 0, max: 0.9, step: 0.01, unit: '' },
      { id: 'mix', name: 'Mix', value: 0.5, min: 0, max: 1, step: 0.01, unit: '' }
    ]
  },
  [PluginType.OSCILLATOR]: {
    description: "Signal Generator (Saw/Sine).",
    defaultColor: "#f59e0b", // Amber
    icon: "music",
    params: [
      { id: 'frequency', name: 'Freq', value: 440, min: 50, max: 2000, step: 1, unit: 'Hz' },
      { id: 'detune', name: 'Detune', value: 0, min: -100, max: 100, step: 1, unit: 'cts' },
      { id: 'gain', name: 'Level', value: 0.5, min: 0, max: 1, step: 0.01, unit: '' },
    ]
  },
  [PluginType.STEREO_IMAGER]: {
    description: "Professional M/S Imaging Processor.",
    defaultColor: "#8b5cf6", // Violet
    icon: "move",
    params: [
      { id: 'width', name: 'Width', value: 100, min: 0, max: 250, step: 1, unit: '%' },
      { id: 'asymmetry', name: 'Asymmetry', value: 0, min: -100, max: 100, step: 1, unit: '%' },
      { id: 'rotation', name: 'Rotation', value: 0, min: -45, max: 45, step: 1, unit: '°' },
      { id: 'pan', name: 'Pan', value: 0, min: -100, max: 100, step: 1, unit: 'L/R' },
      { id: 'bassMono', name: 'Bass Mono', value: 100, min: 20, max: 500, step: 1, unit: 'Hz' },
      { id: 'stereoize', name: 'Stereoize', value: 0, min: 0, max: 100, step: 1, unit: '%' },
      { id: 'output', name: 'Output', value: 0, min: -24, max: 12, step: 0.1, unit: 'dB' }
    ]
  },
  [PluginType.CHORUS]: {
    description: "Modulated delay line for thickness.",
    defaultColor: "#3b82f6", // Blue
    icon: "copy",
    params: [
      { id: 'rate', name: 'Rate', value: 1.5, min: 0.1, max: 10, step: 0.1, unit: 'Hz' },
      { id: 'depth', name: 'Depth', value: 0.002, min: 0, max: 0.01, step: 0.0001, unit: 's' },
      { id: 'mix', name: 'Mix', value: 0.5, min: 0, max: 1, step: 0.01, unit: '' }
    ]
  },
  [PluginType.DOUBLER]: {
    description: "Stereo widening double tracker.",
    defaultColor: "#14b8a6", // Teal
    icon: "layers",
    params: [
      { id: 'spread', name: 'Spread', value: 20, min: 0, max: 50, step: 1, unit: 'ms' },
      { id: 'detune', name: 'Detune', value: 10, min: 0, max: 50, step: 1, unit: 'cts' },
      { id: 'mix', name: 'Mix', value: 0.5, min: 0, max: 1, step: 0.01, unit: '' }
    ]
  },
  [PluginType.FLANGER]: {
    description: "Jet plane comb filtering effect.",
    defaultColor: "#f43f5e", // Rose
    icon: "wind",
    params: [
      { id: 'rate', name: 'Rate', value: 0.5, min: 0.1, max: 5, step: 0.1, unit: 'Hz' },
      { id: 'depth', name: 'Depth', value: 0.005, min: 0, max: 0.02, step: 0.0001, unit: 's' },
      { id: 'feedback', name: 'Feedback', value: 0.5, min: 0, max: 0.95, step: 0.01, unit: '' },
      { id: 'mix', name: 'Mix', value: 0.5, min: 0, max: 1, step: 0.01, unit: '' }
    ]
  }
};

// Helper to map layers to potential source plugins for parameter retrieval
export const LAYER_TO_PLUGIN_TYPE: Record<PluginLayer, PluginType[]> = {
    [PluginLayer.EQ]: [PluginType.VISUAL_EQ],
    [PluginLayer.DYNAMICS]: [PluginType.COMPRESSOR, PluginType.MULTIBAND],
    [PluginLayer.SATURATION]: [PluginType.SATURATION],
    [PluginLayer.SHINE]: [PluginType.SHINE],
    [PluginLayer.REVERB]: [PluginType.REVERB],
    [PluginLayer.DELAY]: [PluginType.DELAY],
    [PluginLayer.IMAGER]: [PluginType.STEREO_IMAGER],
    [PluginLayer.MODULATION]: [PluginType.CHORUS, PluginType.DOUBLER, PluginType.FLANGER]
};

export const createDefaultLayout = (type: PluginType, defaultColor: string, nestedModules?: PluginType[]): UIComponent[] => {
    const layout: UIComponent[] = [];
    const params = PLUGIN_DEFINITIONS[type].params;
    
    const isHybrid = type === PluginType.HYBRID_EQ_DYN;

    // 1. Add Branding Header
    layout.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'BRANDING',
        label: type,
        color: defaultColor,
        colSpan: 4,
        alignment: 'left',
        fontSize: 18,
        height: 40
    });
    
    // 1.5 Add Stereo Bar if Hybrid (Positioned above visualizer)
    if (isHybrid && nestedModules?.includes(PluginType.STEREO_IMAGER)) {
        layout.push({
            id: Math.random().toString(36).substring(2, 9),
            type: 'STEREO_BAR',
            label: 'Stereo Field',
            colSpan: 4,
            height: 32 
        });
    }
    
    // 2. Add Visualizer
    if (type === PluginType.VISUAL_EQ || type === PluginType.HYBRID_EQ_DYN || type === PluginType.SHINE || type === PluginType.MULTIBAND) {
        layout.push({
            id: Math.random().toString(36).substring(2, 9),
            type: 'VISUALIZER',
            label: 'Spectrum',
            colSpan: 4,
            height: 288
        });
    }

    // Controls Section construction
    const knobComponents: UIComponent[] = [];

    // Add Mode Selectors
    if (type === PluginType.SATURATION || (isHybrid && nestedModules?.includes(PluginType.SATURATION))) {
         knobComponents.push({
             id: Math.random().toString(36).substring(2, 9),
             type: 'DROPDOWN',
             label: 'Mode',
             paramId: 'saturationMode',
             color: '#f97316',
             colSpan: 2,
             visibleOnLayer: isHybrid ? PluginLayer.SATURATION : undefined,
             style: 'classic'
         });
    }
    
    if (type === PluginType.SHINE || (isHybrid && nestedModules?.includes(PluginType.SHINE))) {
         knobComponents.push({
             id: Math.random().toString(36).substring(2, 9),
             type: 'DROPDOWN',
             label: 'Mode',
             paramId: 'shineMode',
             color: '#22d3ee',
             colSpan: 2,
             visibleOnLayer: isHybrid ? PluginLayer.SHINE : undefined,
             style: 'classic'
         });
    }
    
    // 3a. Process Standard Params
    params.forEach(p => {
        if (p.hidden) return;
        
        let visibleOnLayer: PluginLayer | undefined = undefined;
        let color = defaultColor;

        if (isHybrid) {
             if (p.id.endsWith('Sat')) { visibleOnLayer = PluginLayer.SATURATION; color = '#f97316'; }
             else if (p.id.endsWith('Dyn')) { visibleOnLayer = PluginLayer.DYNAMICS; color = '#ef4444'; }
             else if (p.id.endsWith('Verb')) { visibleOnLayer = PluginLayer.REVERB; color = '#d946ef'; }
             else if (p.id.endsWith('Delay')) { visibleOnLayer = PluginLayer.DELAY; color = '#10b981'; }
             else if (p.id.endsWith('Shine')) { visibleOnLayer = PluginLayer.SHINE; color = '#22d3ee'; }
             else if (p.id.startsWith('smart')) { visibleOnLayer = undefined; color = defaultColor; } // Always visible
             else if (p.id === 'output') { visibleOnLayer = undefined; color = defaultColor; }
             else { visibleOnLayer = PluginLayer.EQ; color = '#3b82f6'; } // Default bands
             
             if (visibleOnLayer && visibleOnLayer !== PluginLayer.EQ) {
                  const requiredTypes = LAYER_TO_PLUGIN_TYPE[visibleOnLayer];
                  const hasRequired = nestedModules?.some(nm => requiredTypes.includes(nm));
                  if (!hasRequired && !p.id.startsWith('smart')) return; 
             }
        }
        
        // Multiband Specific Visibility
        if (type === PluginType.MULTIBAND) {
             if (p.id === 'output') {
                 // Global output allowed
             } else {
                 return; // Skip params, handled by MULTIBAND_CONTROLS
             }
        }

        knobComponents.push({
            id: Math.random().toString(36).substring(2, 9),
            type: 'KNOB',
            label: p.name,
            paramId: p.id,
            color: color,
            size: 56,
            style: 'classic',
            visibleOnLayer
        });
    });

    // 3b. Process Extra Nested Modules 
    if (isHybrid && nestedModules) {
        nestedModules.forEach(subType => {
            if ([PluginType.VISUAL_EQ, PluginType.COMPRESSOR, PluginType.MULTIBAND, PluginType.SATURATION, PluginType.SHINE, PluginType.REVERB, PluginType.DELAY].includes(subType)) return;
            
            let targetLayer = PluginLayer.EQ;
            if (subType === PluginType.STEREO_IMAGER) targetLayer = PluginLayer.IMAGER;
            else if ([PluginType.CHORUS, PluginType.DOUBLER, PluginType.FLANGER].includes(subType)) targetLayer = PluginLayer.MODULATION;

            // --- CUSTOM LAYOUT: STEREO IMAGER ---
            if (subType === PluginType.STEREO_IMAGER) {
                 knobComponents.push({
                    id: Math.random().toString(36).substring(2, 9),
                    type: 'SECTION',
                    label: 'Stereo Processor',
                    colSpan: 4,
                    sectionVariant: 'solid',
                    visibleOnLayer: PluginLayer.IMAGER,
                    layoutDirection: 'column',
                    children: [
                        {
                            id: Math.random().toString(36).substring(2, 9),
                            type: 'SECTION',
                            label: 'Core',
                            colSpan: 4,
                            sectionVariant: 'minimal',
                            layoutDirection: 'row',
                            children: [
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'KNOB',
                                    label: 'Bass Mono',
                                    paramId: 'bassMono',
                                    color: '#a78bfa',
                                    size: 56,
                                    style: 'tech'
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'SPACER', 
                                    label: '',
                                    colSpan: 1
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'KNOB',
                                    label: 'Width',
                                    paramId: 'width',
                                    color: '#8b5cf6',
                                    size: 80, 
                                    style: 'cyber'
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'SPACER',
                                    label: '',
                                    colSpan: 1
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'KNOB',
                                    label: 'Stereoize',
                                    paramId: 'stereoize',
                                    color: '#a78bfa',
                                    size: 56,
                                    style: 'tech'
                                }
                            ]
                        },
                        {
                            id: Math.random().toString(36).substring(2, 9),
                            type: 'SECTION',
                            label: 'Geometry',
                            colSpan: 4,
                            sectionVariant: 'glass_row',
                            layoutDirection: 'row',
                            children: [
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'KNOB',
                                    label: 'Pan',
                                    paramId: 'pan',
                                    color: '#94a3b8',
                                    size: 42,
                                    style: 'soft'
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'SLIDER',
                                    label: 'Asymmetry',
                                    paramId: 'asymmetry',
                                    color: '#8b5cf6',
                                    orientation: 'horizontal',
                                    style: 'cyber'
                                },
                                {
                                    id: Math.random().toString(36).substring(2, 9),
                                    type: 'KNOB',
                                    label: 'Rotation',
                                    paramId: 'rotation',
                                    color: '#94a3b8',
                                    size: 42,
                                    style: 'soft'
                                }
                            ]
                        }
                    ]
                 });
                 return; 
            }

            const subParams = PLUGIN_DEFINITIONS[subType].params;
            subParams.forEach(p => {
                 if (p.id === 'output') return; 

                 let type: any = 'KNOB';
                 if (p.id === 'width' || p.id === 'asymmetry' || p.id === 'rotation') type = 'SLIDER';
                 if (p.id === 'stereoize' || p.id === 'bassMono') type = 'KNOB';
                 
                 knobComponents.push({
                     id: Math.random().toString(36).substring(2, 9),
                     type,
                     label: p.name,
                     paramId: p.id,
                     color: PLUGIN_DEFINITIONS[subType].defaultColor,
                     size: type === 'KNOB' ? 56 : undefined,
                     colSpan: type === 'SLIDER' ? 1 : 1,
                     orientation: 'vertical',
                     style: 'classic',
                     visibleOnLayer: targetLayer
                 });
            });
        });
    }
    
    // Special Logic for MULTIBAND CONTROLS
    if (type === PluginType.MULTIBAND) {
         layout.push({
             id: Math.random().toString(36).substring(2, 9),
             type: 'SECTION',
             label: 'Controls',
             colSpan: 4,
             sectionVariant: 'solid', // Use solid background for better contrast
             children: [
                 // Style Dropdown Row
                 {
                     id: Math.random().toString(36).substring(2, 9),
                     type: 'SECTION',
                     label: 'Top',
                     colSpan: 4,
                     sectionVariant: 'minimal',
                     layoutDirection: 'row',
                     children: [
                         {
                             id: Math.random().toString(36).substring(2, 9),
                             type: 'DROPDOWN',
                             label: 'Style',
                             paramId: 'multibandStyle',
                             color: '#f43f5e',
                             colSpan: 3,
                             style: 'classic'
                         },
                         {
                             id: Math.random().toString(36).substring(2, 9),
                             type: 'KNOB',
                             label: 'Output',
                             paramId: 'output',
                             color: defaultColor,
                             size: 48,
                             style: 'classic',
                             colSpan: 1
                         }
                     ]
                 },
                 // Per-Band Controls handled by custom component that reads selectedBand state
                 {
                     id: Math.random().toString(36).substring(2, 9),
                     type: 'MULTIBAND_CONTROLS',
                     label: 'Band Settings',
                     colSpan: 4,
                     height: 140 // Explicit height for the panel
                 }
             ]
         });
         return layout;
    }

    // 4. Wrap Knobs
    layout.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'SECTION',
        label: 'Controls',
        children: knobComponents,
        colSpan: 4,
        sectionVariant: 'card',
        color: '#ffffff'
    });

    // Special layout for Standalone Imager
    if (type === PluginType.STEREO_IMAGER) {
         return [
            {
                id: Math.random().toString(36).substring(2, 9),
                type: 'BRANDING',
                label: type,
                color: defaultColor,
                colSpan: 4,
                alignment: 'left',
                fontSize: 18,
                height: 40
            },
            {
                id: Math.random().toString(36).substring(2, 9),
                type: 'SECTION',
                label: 'Goniometer',
                colSpan: 4,
                sectionVariant: 'solid',
                children: [{
                    id: Math.random().toString(36).substring(2, 9),
                    type: 'VISUALIZER',
                    label: 'Vectorscope',
                    visualizerMode: 'VECTORSCOPE',
                    height: 300,
                    colSpan: 4
                }]
            },
            {
                 id: Math.random().toString(36).substring(2, 9),
                 type: 'SECTION',
                 label: 'Parameters',
                 colSpan: 4,
                 sectionVariant: 'card',
                 gridCols: 4,
                 children: knobComponents 
            }
         ];
    }

    return layout;
};