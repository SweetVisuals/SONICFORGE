

export enum PluginType {
  VISUAL_EQ = 'Parametric EQ 2',
  MULTIBAND = 'Pro Multiband',
  COMPRESSOR = 'Compressor',
  SATURATION = 'Saturation',
  REVERB = 'Reverb',
  DELAY = 'Delay',
  OSCILLATOR = 'Oscillator',
  SHINE = 'Shine Processor',
  HYBRID_EQ_DYN = 'Smart Hybrid',
  STEREO_IMAGER = 'Stereo Imager',
  CHORUS = 'Chorus',
  DOUBLER = 'Doubler',
  FLANGER = 'Flanger'
}

export enum PluginLayer {
  EQ = 'EQ',
  DYNAMICS = 'DYN',
  SATURATION = 'SAT',
  SHINE = 'SHINE',
  REVERB = 'VERB',
  DELAY = 'ECHO',
  IMAGER = 'WIDTH',
  MODULATION = 'MOD'
}

export type SaturationMode = 'TUBE' | 'TAPE' | 'DIGITAL' | 'FUZZ' | 'RECTIFY';
export type ShineMode = 'AIR' | 'CRYSTAL' | 'SHIMMER' | 'GLOSS' | 'ANGELIC';
export type MultibandStyle = 'CLEAN' | 'PUNCHY' | 'SMOOTH' | 'CRUSH' | 'OPTO';

export type VisualizerMode = 'SPECTRUM' | 'WAVEFORM' | 'SPECTROGRAM' | 'VECTORSCOPE';

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

export type UIComponentType = 'KNOB' | 'SLIDER' | 'SWITCH' | 'SECTION' | 'SPACER' | 'BRANDING' | 'SCREW' | 'RACK' | 'VISUALIZER' | 'DROPDOWN' | 'STEREO_BAR' | 'MULTIBAND_CONTROLS';

export type SectionVariant = 'simple' | 'card' | 'solid' | 'minimal' | 'glass_row';
export type RackVariant = 'basic' | 'industrial' | 'metal' | 'framed' | 'cyber';

export interface UIComponent {
  id: string;
  type: UIComponentType;
  label: string;
  paramId?: string; // For KNOB/SLIDER/SWITCH type
  color?: string;
  size?: number; // For knobs (px) or text (rem/px)
  height?: number; // For Spacer/Branding/Rack (px)
  colSpan?: number; // 1 to 4 (Grid system)
  style?: 'classic' | 'soft' | 'tech' | 'cyber' | 'ring' | 'analog';
  
  // Section / Rack
  children?: UIComponent[]; // Nested components
  sectionVariant?: SectionVariant;
  rackSplits?: number; // 1 to 6, defines grid rows for Rack
  rackVariant?: RackVariant;

  // New Layout Props
  gridCols?: number; // For SECTION: Number of columns (default 4)
  layoutDirection?: 'row' | 'column'; // For container flow

  // Layout & Alignment
  justify?: 'start' | 'center' | 'end' | 'stretch' | 'between'; // Horizontal alignment in Rack/Section
  align?: 'start' | 'center' | 'end' | 'stretch'; // Vertical alignment

  // Branding
  imageUrl?: string;
  alignment?: 'left' | 'center' | 'right';
  fontSize?: number;

  // Slider
  orientation?: 'vertical' | 'horizontal';

  visibleOnLayer?: PluginLayer; // Only show if activeLayer matches

  // Visualizer Specific
  visualizerMode?: VisualizerMode;
}

export interface PluginModuleState {
  id: string;
  type: PluginType;
  enabled: boolean;
  params: Record<string, number>;
  color: string; 
  collapsed?: boolean;
  selected?: boolean; // For combining modules
  selectedBand?: number; // For Multiband/EQ
  nestedModules?: PluginType[]; // Tracks what is combined inside
  activeLayer?: PluginLayer; // Tracks which tab is active in hybrid mode
  saturationMode?: SaturationMode;
  shineMode?: ShineMode;
  multibandStyle?: MultibandStyle;
  title?: string; // Custom name for the module header
  innerLabel?: string; // Custom text for the visualizer overlay
  layout?: UIComponent[]; // Custom UI layout
}

export interface GemimiCodeResponse {
  cppCode: string;
  headerCode: string;
  explanation: string;
}