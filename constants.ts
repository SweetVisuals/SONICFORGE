
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
        // Defaulting to 0 (Center/Flat) instead of -18 (Bottom)
        // Dynamics: Value represents compression intensity/threshold shift
        params.push({ id: `b${i}Dyn`, name: `Band ${i} Dyn`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        // Saturation: Value represents drive intensity
        params.push({ id: `b${i}Sat`, name: `Band ${i} Sat`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        // Shine: Value represents polish/excite amount
        params.push({ id: `b${i}Shine`, name: `Band ${i} Shine`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        // Reverb: Value represents send amount
        params.push({ id: `b${i}Verb`, name: `Band ${i} Verb`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
        // Delay: Value represents feedback/mix
        params.push({ id: `b${i}Delay`, name: `Band ${i} Delay`, value: 0, min: -18, max: 18, step: 0.1, unit: '', hidden: true });
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
    description: "Multi-band compression with adjustable crossovers.",
    defaultColor: "#f43f5e",
    icon: "activity",
    params: [
      { id: 'lowSplit', name: 'Low X-Over', value: 200, min: 50, max: 500, step: 10, unit: 'Hz' },
      { id: 'highSplit', name: 'High X-Over', value: 3000, min: 1000, max: 10000, step: 10, unit: 'Hz' },
      { id: 'lowThresh', name: 'Low Thr', value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
      { id: 'midThresh', name: 'Mid Thr', value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
      { id: 'highThresh', name: 'High Thr', value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
      { id: 'ratio', name: 'Ratio', value: 4, min: 1, max: 10, step: 0.1, unit: ':1' }
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
  }
};

// Helper to map layers to potential source plugins for parameter retrieval
export const LAYER_TO_PLUGIN_TYPE: Record<PluginLayer, PluginType[]> = {
    [PluginLayer.EQ]: [PluginType.VISUAL_EQ],
    [PluginLayer.DYNAMICS]: [PluginType.COMPRESSOR, PluginType.MULTIBAND],
    [PluginLayer.SATURATION]: [PluginType.SATURATION],
    [PluginLayer.SHINE]: [PluginType.SHINE],
    [PluginLayer.REVERB]: [PluginType.REVERB],
    [PluginLayer.DELAY]: [PluginType.DELAY]
};

export const createDefaultLayout = (type: PluginType, defaultColor: string, nestedModules?: PluginType[]): UIComponent[] => {
    const layout: UIComponent[] = [];
    const params = PLUGIN_DEFINITIONS[type].params;
    
    const isHybrid = type === PluginType.HYBRID_EQ_DYN;

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
             
             // Filter out params for layers that aren't active in the nest
             if (visibleOnLayer && visibleOnLayer !== PluginLayer.EQ) {
                  const requiredTypes = LAYER_TO_PLUGIN_TYPE[visibleOnLayer];
                  const hasRequired = nestedModules?.some(nm => requiredTypes.includes(nm));
                  if (!hasRequired && !p.id.startsWith('smart')) return; 
             }
        }

        layout.push({
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

    return layout;
};
