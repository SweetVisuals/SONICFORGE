
export enum PluginType {
  VISUAL_EQ = 'Parametric EQ 2',
  MULTIBAND = 'Pro Multiband',
  COMPRESSOR = 'Compressor',
  SATURATION = 'Saturation',
  REVERB = 'Reverb',
  DELAY = 'Delay',
  OSCILLATOR = 'Oscillator',
  SHINE = 'Shine Processor',
  HYBRID_EQ_DYN = 'Smart Hybrid'
}

export enum PluginLayer {
  EQ = 'EQ',
  DYNAMICS = 'DYN',
  SATURATION = 'SAT',
  SHINE = 'SHINE',
  REVERB = 'VERB',
  DELAY = 'ECHO'
}

export type SaturationMode = 'TUBE' | 'TAPE' | 'DIGITAL' | 'FUZZ' | 'RECTIFY';
export type ShineMode = 'AIR' | 'CRYSTAL' | 'SHIMMER' | 'GLOSS' | 'ANGELIC';

export type VisualizerMode = 'SPECTRUM' | 'WAVEFORM' | 'SPECTROGRAM';

export interface AudioParamConfig {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hidden?: boolean; // For params controlled solely via graph
}

export type UIComponentType = 'KNOB' | 'HEADER' | 'SPACER';

export interface UIComponent {
  id: string;
  type: UIComponentType;
  label: string;
  paramId?: string; // For KNOB type
  color?: string;
  size?: number; // For knobs (px) or text (rem/px)
  style?: 'classic' | 'soft' | 'tech';
  visibleOnLayer?: PluginLayer; // Only show if activeLayer matches
}

export interface PluginModuleState {
  id: string;
  type: PluginType;
  enabled: boolean;
  params: Record<string, number>;
  color: string; 
  collapsed?: boolean;
  selected?: boolean; // For combining modules
  nestedModules?: PluginType[]; // Tracks what is combined inside
  activeLayer?: PluginLayer; // Tracks which tab is active in hybrid mode
  saturationMode?: SaturationMode;
  shineMode?: ShineMode;
  title?: string; // Custom name for the module header
  innerLabel?: string; // Custom text for the visualizer overlay
  layout?: UIComponent[]; // Custom UI layout
}

export interface GemimiCodeResponse {
  cppCode: string;
  headerCode: string;
  explanation: string;
}