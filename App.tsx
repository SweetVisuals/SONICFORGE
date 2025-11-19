
import React, { useState, useRef, useEffect } from 'react';
import { PluginType, PluginModuleState, GemimiCodeResponse, PluginLayer, VisualizerMode, AudioParamConfig, SaturationMode, ShineMode, UIComponent } from './types';
import { PLUGIN_DEFINITIONS, LAYER_TO_PLUGIN_TYPE, createDefaultLayout } from './constants';
import { Knob } from './components/Knob';
import { Visualizer } from './components/Visualizer';
import { VisualEQ } from './components/VisualEQ';
import { Transport } from './components/Transport';
import { audioEngine } from './services/audioEngine';
import { generatePluginCode } from './services/geminiService';
import { 
  Zap, Download, Code, Loader2, 
  X, GripVertical, Activity, PlayCircle, Check, Merge, 
  Cpu, Layers, PenTool, ChevronRight, Box, Terminal, GitMerge,
  Waves, Grid, Sparkles, Tag, Plus, Trash2, LayoutTemplate, ChevronLeft, List, Move
} from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2, 9);

type AppMode = 'ARCHITECT' | 'DESIGNER' | 'ENGINEER';

export default function App() {
  // State
  const [modules, setModules] = useState<PluginModuleState[]>([]);
  const [appMode, setAppMode] = useState<AppMode>('ARCHITECT');
  const [generatedCode, setGeneratedCode] = useState<GemimiCodeResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [draggedComponentId, setDraggedComponentId] = useState<string | null>(null);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Visualizer State
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('SPECTRUM');
  
  // Selection Tracking
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  // Configuration State
  const [pluginName, setPluginName] = useState("VisualEQ");
  const [userPrompt, setUserPrompt] = useState("");

  // Initialization
  const handleInitAudio = () => {
    audioEngine.resume();
  };

  // Module Management
  const addModule = (type: PluginType) => {
    handleInitAudio();
    const def = PLUGIN_DEFINITIONS[type];
    
    // Pre-calculate nested modules for hybrid to generate correct layout
    const nestedModules = type === PluginType.HYBRID_EQ_DYN ? [PluginType.VISUAL_EQ, PluginType.COMPRESSOR] : undefined;
    
    const newModule: PluginModuleState = {
      id: generateId(),
      type,
      enabled: true,
      color: def.defaultColor,
      collapsed: false,
      selected: false,
      nestedModules,
      params: def.params.reduce((acc, p) => ({ ...acc, [p.id]: p.value }), {}),
      activeLayer: PluginLayer.EQ,
      saturationMode: 'TUBE',
      shineMode: 'AIR',
      title: type, // Default Title
      layout: createDefaultLayout(type, def.defaultColor, nestedModules)
    };

    setModules(prev => [...prev, newModule]);
    if (type === PluginType.OSCILLATOR) {
        audioEngine.startOscillator();
    }
  };

  const removeModule = (id: string) => {
      setModules(prev => prev.filter(m => m.id !== id));
      if (selectedModuleId === id) setSelectedModuleId(null);
  };
  
  const unmergeModule = (moduleId: string, typeToRemove: PluginType) => {
      setModules(prev => prev.map(m => {
          if (m.id !== moduleId) return m;
          
          // Filter out the removed type
          const newNested = m.nestedModules?.filter(t => t !== typeToRemove) || [];
          
          const basicEqOnly = newNested.length === 0 || (newNested.length === 1 && newNested[0] === PluginType.VISUAL_EQ);
          
          if (basicEqOnly) {
             return {
                 ...m,
                 type: PluginType.VISUAL_EQ,
                 nestedModules: undefined,
                 color: PLUGIN_DEFINITIONS[PluginType.VISUAL_EQ].defaultColor,
                 title: PluginType.VISUAL_EQ,
                 layout: createDefaultLayout(PluginType.VISUAL_EQ, PLUGIN_DEFINITIONS[PluginType.VISUAL_EQ].defaultColor)
             };
          }
          
          return {
              ...m,
              nestedModules: newNested,
              // Regenerate layout to remove controls for removed module
              layout: createDefaultLayout(PluginType.HYBRID_EQ_DYN, m.color, newNested)
          };
      }));
  };
  
  const toggleBypass = (id: string) => {
      setModules(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };
  
  const toggleSelection = (id: string) => {
      setModules(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const selectForSidebar = (moduleId: string, componentId?: string) => {
      setSelectedModuleId(moduleId);
      if (componentId) setSelectedComponentId(componentId);
      else setSelectedComponentId(null);
  };

  const updateParam = (moduleId: string, paramId: string, value: number) => {
    setModules(prev => {
      const next = prev.map(m => {
        if (m.id === moduleId) {
          return { ...m, params: { ...m.params, [paramId]: value } };
        }
        return m;
      });
      const updatedModule = next.find(m => m.id === moduleId);
      if (updatedModule) audioEngine.updateParams(updatedModule);
      return next;
    });
  };

  const updateModuleState = (moduleId: string, updates: Partial<PluginModuleState>) => {
      setModules(prev => {
          const next = prev.map(m => m.id === moduleId ? { ...m, ...updates } : m);
          const updatedModule = next.find(m => m.id === moduleId);
          if (updatedModule) audioEngine.updateParams(updatedModule); // Ensure mode changes apply
          return next;
      });
  };

  // UI Layout Editing
  const addComponentToLayout = (moduleId: string, component: UIComponent) => {
      setModules(prev => prev.map(m => {
          if (m.id !== moduleId) return m;
          return { ...m, layout: [...(m.layout || []), component] };
      }));
      setSelectedComponentId(component.id);
  };

  const updateComponent = (moduleId: string, componentId: string, updates: Partial<UIComponent>) => {
      setModules(prev => prev.map(m => {
          if (m.id !== moduleId) return m;
          return { 
              ...m, 
              layout: m.layout?.map(c => c.id === componentId ? { ...c, ...updates } : c) 
          };
      }));
  };

  const removeComponent = (moduleId: string, componentId: string) => {
      setModules(prev => prev.map(m => {
          if (m.id !== moduleId) return m;
          return { ...m, layout: m.layout?.filter(c => c.id !== componentId) };
      }));
      if (selectedComponentId === componentId) {
          setSelectedComponentId(null);
      }
  };

  const handleComponentDragStart = (e: React.DragEvent, id: string) => {
      e.stopPropagation();
      setDraggedComponentId(id);
  };

  const handleComponentDragOver = (e: React.DragEvent, targetId: string, moduleId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedComponentId || draggedComponentId === targetId) return;

      setModules(prev => prev.map(m => {
          if (m.id !== moduleId || !m.layout) return m;
          
          const layout = [...m.layout];
          const dragIndex = layout.findIndex(c => c.id === draggedComponentId);
          const targetIndex = layout.findIndex(c => c.id === targetId);
          
          if (dragIndex === -1 || targetIndex === -1) return m;
          
          const [removed] = layout.splice(dragIndex, 1);
          layout.splice(targetIndex, 0, removed);
          
          return { ...m, layout };
      }));
  };

  const handleComponentDragEnd = () => {
      setDraggedComponentId(null);
  };

  // Combine Logic
  const selectedModules = modules.filter(m => m.selected);
  const canCombine = selectedModules.length >= 2;

  const combineSelected = () => {
      if (!canCombine) return;
      
      const def = PLUGIN_DEFINITIONS[PluginType.HYBRID_EQ_DYN];
      const hybrid: PluginModuleState = {
          id: generateId(),
          type: PluginType.HYBRID_EQ_DYN,
          enabled: true,
          color: def.defaultColor,
          selected: true,
          nestedModules: [],
          params: def.params.reduce((acc, p) => ({ ...acc, [p.id]: p.value }), {}),
          activeLayer: PluginLayer.EQ,
          saturationMode: 'TUBE',
          shineMode: 'AIR',
          title: 'Smart Hybrid'
      };

      selectedModules.forEach(m => {
          hybrid.params = { ...hybrid.params, ...m.params };
          if (m.nestedModules) hybrid.nestedModules?.push(...m.nestedModules);
          else hybrid.nestedModules?.push(m.type);
          
          if (m.type === PluginType.SATURATION) hybrid.saturationMode = m.saturationMode;
          if (m.type === PluginType.SHINE) hybrid.shineMode = m.shineMode;
      });
      
      hybrid.nestedModules = [...new Set(hybrid.nestedModules)];
      
      // Generate a fresh layout for the combined module
      hybrid.layout = createDefaultLayout(PluginType.HYBRID_EQ_DYN, def.defaultColor, hybrid.nestedModules);

      setModules(prev => {
          const remaining = prev.filter(m => !m.selected);
          return [...remaining, hybrid];
      });
      setSelectedModuleId(hybrid.id);
  };

  // Audio Chain Updates
  useEffect(() => {
    audioEngine.updatePluginChain(modules);
  }, [modules.length, modules.map(m => m.id).join(','), modules.map(m => m.enabled).join(','), modules.map(m => m.saturationMode).join(','), modules.map(m => m.shineMode).join(',')]);

  // Drag and Drop
  const handleDragStart = (index: number) => {
      setDraggedItemIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedItemIndex === null || draggedItemIndex === index) return;
      const newModules = [...modules];
      const draggedItem = newModules[draggedItemIndex];
      newModules.splice(draggedItemIndex, 1);
      newModules.splice(index, 0, draggedItem);
      setModules(newModules);
      setDraggedItemIndex(index);
  };

  const handleDragEnd = () => {
      setDraggedItemIndex(null);
  };

  // Code Generation
  const handleGenerateCode = async () => {
    setIsGenerating(true);
    const code = await generatePluginCode(modules, userPrompt, pluginName);
    setGeneratedCode(code);
    setAppMode('ENGINEER');
    setIsGenerating(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioFile(url);
      handleInitAudio();
    }
  };
  
  const handleDownloadVst = () => {
      if (!generatedCode) return;
      const element = document.createElement("a");
      const file = new Blob([generatedCode.cppCode], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = "PluginProcessor.cpp";
      document.body.appendChild(element);
      element.click();
  };
  
  // Transport Logic
  const togglePlay = () => {
      if (!audioRef.current) return;
      if (isPlaying) {
          audioRef.current.pause();
      } else {
          audioRef.current.play();
      }
  };
  
  const handleSeek = (time: number) => {
      if (audioRef.current) {
          audioRef.current.currentTime = time;
      }
  };
  
  const handleRestart = () => {
      if(audioRef.current) {
          audioRef.current.currentTime = 0;
          if (!isPlaying) audioRef.current.play();
      }
  };

  const handleTimeUpdate = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
      if (audioRef.current) {
          setDuration(audioRef.current.duration);
          audioEngine.loadSource(audioRef.current); 
      }
  };

  const handleAudioEnded = () => {
      setIsPlaying(false);
  };

  const activeModule = modules.find(m => m.id === selectedModuleId);
  const activeComponent = activeModule?.layout?.find(c => c.id === selectedComponentId);
  
  // Enum Lists
  const SAT_MODES: SaturationMode[] = ['TUBE', 'TAPE', 'DIGITAL', 'FUZZ', 'RECTIFY'];
  const SHINE_MODES: ShineMode[] = ['AIR', 'CRYSTAL', 'SHIMMER', 'GLOSS', 'ANGELIC'];

  return (
    <div className="flex h-screen w-full bg-[#020202] text-gray-100 font-sans overflow-hidden selection:bg-cyan-500/30">
      
      {/* --- LEFT SIDEBAR (Configuration) --- */}
      <div className="w-[480px] bg-[#050505] border-r border-white/5 flex flex-col z-30 shadow-2xl flex-shrink-0">
          
          {/* Header */}
          <div className="h-16 flex items-center px-6 border-b border-white/5">
            <div className="w-6 h-6 bg-cyan-500 rounded-sm flex items-center justify-center mr-3 shadow-[0_0_10px_rgba(34,211,238,0.4)]">
                <Zap size={14} className="text-black fill-current" />
            </div>
            <div>
                <h1 className="text-sm font-black tracking-tighter text-white leading-none">SONICFORGE</h1>
                <p className="text-[9px] text-cyan-500 font-bold tracking-[0.2em] opacity-80 mt-0.5">AI DSP WORKSTATION</p>
            </div>
          </div>

          {/* Config Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
            
            {/* --- ARCHITECT MODE CONTENT --- */}
            {appMode === 'ARCHITECT' && (
                <>
                    {/* Module Composition (Nested Plugins) */}
                    {activeModule && activeModule.nestedModules && activeModule.nestedModules.length > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-left-4">
                            <label className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest flex items-center">
                                <GitMerge size={12} className="mr-2"/> Active Composition
                            </label>
                            <div className="bg-[#0a0a0a] border border-cyan-900/30 rounded-sm p-4 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-0.5 h-full bg-cyan-500"></div>
                                <div className="space-y-2">
                                    {activeModule.nestedModules.map((type, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-neutral-300 bg-black/20 p-2 rounded border border-transparent hover:border-white/5 group transition-all">
                                            <div className="flex items-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 mr-2"></div>
                                                {type}
                                            </div>
                                            {type !== PluginType.VISUAL_EQ && (
                                                <button 
                                                    onClick={() => unmergeModule(activeModule.id, type)}
                                                    className="text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* --- GLOBAL MODULE IDENTITY --- */}
            <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Module Identity</label>
                <div className="relative group">
                    <input 
                      type="text" 
                      value={pluginName}
                      onChange={(e) => setPluginName(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm p-3 pl-4 text-xs font-mono text-cyan-400 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder-neutral-800"
                      placeholder="MyPluginName"
                    />
                    <span className="absolute right-3 top-3 text-neutral-700 font-mono text-xs pointer-events-none group-hover:text-neutral-500">_&gt;</span>
                </div>
            </div>

            {/* --- DESIGNER MODE CONTENT --- */}
            {appMode === 'DESIGNER' && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-8">
                     <div className="w-full h-px bg-white/5"></div>
                     
                     {selectedModuleId && activeModule ? (
                        <>
                            {activeComponent ? (
                                /* --- EDIT COMPONENT VIEW --- */
                                <div className="bg-[#0a0a0a] border border-white/10 rounded-sm p-4 space-y-4 relative animate-in slide-in-from-right-8">
                                    <button 
                                        onClick={() => setSelectedComponentId(null)}
                                        className="flex items-center space-x-1 text-neutral-500 hover:text-white text-[10px] font-bold uppercase tracking-wider mb-2"
                                    >
                                        <ChevronLeft size={12} />
                                        <span>Back to Layout</span>
                                    </button>
                                    
                                    <div className="flex items-center space-x-2 text-white mb-2 border-b border-white/5 pb-2">
                                        {activeComponent.type === 'KNOB' ? <Activity size={14} className="text-purple-500"/> : <Tag size={14} className="text-amber-500"/>}
                                        <span className="text-xs font-bold uppercase">Edit {activeComponent.type}</span>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Label</label>
                                            <input 
                                                type="text" 
                                                value={activeComponent.label}
                                                onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { label: e.target.value })}
                                                className="w-full bg-black border border-white/10 rounded p-2 text-xs text-white focus:border-purple-500/50 outline-none"
                                            />
                                        </div>
                                        
                                        {activeComponent.type === 'KNOB' && (
                                            <>
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Parameter Link</label>
                                                    <select 
                                                        value={activeComponent.paramId}
                                                        onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { paramId: e.target.value })}
                                                        className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none focus:border-purple-500/50"
                                                    >
                                                        {PLUGIN_DEFINITIONS[activeModule.type].params.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Style</label>
                                                        <select 
                                                            value={activeComponent.style || 'classic'}
                                                            onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { style: e.target.value as any })}
                                                            className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none"
                                                        >
                                                            <option value="classic">Classic</option>
                                                            <option value="soft">Soft</option>
                                                            <option value="tech">Tech</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Color</label>
                                                        <input 
                                                            type="color" 
                                                            value={activeComponent.color || '#3b82f6'}
                                                            onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { color: e.target.value })}
                                                            className="w-full h-8 bg-black border border-white/10 rounded cursor-pointer"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        
                                        {activeComponent.type === 'HEADER' && (
                                             <div>
                                                <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Text Color</label>
                                                <input 
                                                    type="color" 
                                                    value={activeComponent.color || '#ffffff'}
                                                    onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { color: e.target.value })}
                                                    className="w-full h-8 bg-black border border-white/10 rounded cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-2 border-t border-white/5">
                                        <button 
                                            onClick={() => removeComponent(activeModule.id, activeComponent.id)}
                                            className="w-full flex items-center justify-center space-x-2 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded text-xs font-bold transition-colors"
                                        >
                                            <Trash2 size={12} />
                                            <span>Delete Component</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* --- LAYOUT OVERVIEW --- */
                                <div className="space-y-6 animate-in slide-in-from-left-4">
                                     
                                     {/* Module Labels */}
                                     <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center text-cyan-500">
                                                <LayoutTemplate size={12} className="mr-2" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Module Settings</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block">Header Title</label>
                                                <input 
                                                    type="text" 
                                                    value={activeModule.title || ''}
                                                    onChange={(e) => updateModuleState(activeModule.id, { title: e.target.value })}
                                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm p-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block">Inner Label</label>
                                                <input 
                                                    type="text" 
                                                    value={activeModule.innerLabel || ''}
                                                    placeholder="Dynamic"
                                                    onChange={(e) => updateModuleState(activeModule.id, { innerLabel: e.target.value })}
                                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm p-2 text-xs text-white focus:border-cyan-500/50 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Element List */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block flex items-center">
                                            <List size={12} className="mr-2" /> Interface Structure
                                        </label>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar border border-white/10 rounded bg-[#0a0a0a]">
                                            {activeModule.layout?.map((comp, i) => (
                                                <div 
                                                    key={comp.id}
                                                    className="flex items-center justify-between p-2 border-b border-white/5 last:border-0 hover:bg-white/5 group transition-colors cursor-pointer"
                                                    onClick={() => setSelectedComponentId(comp.id)}
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <span className="text-[9px] text-neutral-600 font-mono">{i + 1}</span>
                                                        {comp.type === 'KNOB' && <Activity size={12} className="text-purple-500" />}
                                                        {comp.type === 'HEADER' && <Tag size={12} className="text-amber-500" />}
                                                        {comp.type === 'SPACER' && <Box size={12} className="text-neutral-500" />}
                                                        <span className="text-xs text-neutral-300 truncate w-32">{comp.label}</span>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); removeComponent(activeModule.id, comp.id); }}
                                                        className="text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            {(!activeModule.layout || activeModule.layout.length === 0) && (
                                                <div className="p-4 text-center text-neutral-600 text-xs italic">
                                                    No elements added.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                     {/* Add Buttons */}
                                     <div className="space-y-2">
                                         <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Add Elements</label>
                                         <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => addComponentToLayout(activeModule.id, {
                                                    id: generateId(),
                                                    type: 'KNOB',
                                                    label: 'New Knob',
                                                    paramId: 'output',
                                                    color: activeModule.color,
                                                    style: 'classic',
                                                    size: 56
                                                })}
                                                className="flex flex-col items-center justify-center p-4 bg-[#0a0a0a] border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 rounded transition-all group"
                                            >
                                                <Activity size={20} className="text-neutral-500 group-hover:text-purple-500 mb-2" />
                                                <span className="text-xs font-bold text-neutral-400 group-hover:text-white">Add Knob</span>
                                            </button>
                                            <button 
                                                onClick={() => addComponentToLayout(activeModule.id, {
                                                    id: generateId(),
                                                    type: 'HEADER',
                                                    label: 'Section Title',
                                                    color: '#ffffff',
                                                    size: 12
                                                })}
                                                className="flex flex-col items-center justify-center p-4 bg-[#0a0a0a] border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 rounded transition-all group"
                                            >
                                                <Tag size={20} className="text-neutral-500 group-hover:text-amber-500 mb-2" />
                                                <span className="text-xs font-bold text-neutral-400 group-hover:text-white">Add Header</span>
                                            </button>
                                            <button 
                                                onClick={() => addComponentToLayout(activeModule.id, {
                                                    id: generateId(),
                                                    type: 'SPACER',
                                                    label: 'Spacer',
                                                    size: 24
                                                })}
                                                className="flex flex-col items-center justify-center p-4 bg-[#0a0a0a] border border-white/10 hover:border-neutral-500 hover:bg-white/5 rounded transition-all group col-span-2"
                                            >
                                                <Box size={20} className="text-neutral-500 group-hover:text-white mb-2" />
                                                <span className="text-xs font-bold text-neutral-400 group-hover:text-white">Add Spacer</span>
                                            </button>
                                         </div>
                                    </div>
                                </div>
                            )}
                        </>
                     ) : (
                         <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
                             <p className="text-xs text-neutral-500">Select a module to edit design</p>
                         </div>
                     )}
                </div>
            )}

            {/* --- ARCHITECT MODE CONTENT (Templates & Prompt) --- */}
            {appMode === 'ARCHITECT' && (
                <>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Architecture Template</label>
                        
                        <div className="space-y-6">
                            <div>
                                <div className="flex items-center mb-2">
                                    <div className="w-1 h-1 bg-purple-500 rounded-full mr-2"></div>
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">FX Processors</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[PluginType.VISUAL_EQ, PluginType.MULTIBAND, PluginType.COMPRESSOR, PluginType.SATURATION, PluginType.SHINE, PluginType.HYBRID_EQ_DYN, PluginType.REVERB, PluginType.DELAY].map(type => (
                                        <button 
                                        key={type}
                                        onClick={() => addModule(type)}
                                        className="relative group overflow-hidden text-xs font-medium text-left px-3 py-3 bg-[#0a0a0a] border border-white/5 rounded-sm hover:border-cyan-500/30 hover:bg-[#0f0f0f] transition-all active:scale-[0.98]"
                                        >
                                            <span className="relative z-10 text-neutral-400 group-hover:text-cyan-400 transition-colors">{type.replace('Visual ', '')}</span>
                                            <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center mb-2">
                                    <div className="w-1 h-1 bg-amber-500 rounded-full mr-2"></div>
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Generators</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                    onClick={() => addModule(PluginType.OSCILLATOR)}
                                    className="relative group overflow-hidden text-xs font-medium text-left px-3 py-3 bg-[#0a0a0a] border border-white/5 rounded-sm hover:border-amber-500/30 hover:bg-[#0f0f0f] transition-all active:scale-[0.98]"
                                    >
                                        <span className="relative z-10 text-neutral-400 group-hover:text-amber-400 transition-colors">Oscillator</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Refinement Prompt</label>
                        <textarea 
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        className="w-full h-32 bg-[#0a0a0a] border border-white/10 rounded-sm p-3 text-xs font-mono text-gray-300 focus:border-cyan-500/50 focus:outline-none transition-all placeholder-neutral-800 resize-none leading-relaxed"
                        placeholder="Describe custom behavior...&#10;> 'Add saturation on high bands'&#10;> 'Make the compressor punchy'"
                        />
                    </div>
                </>
            )}

          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/5 bg-[#050505]">
              <button 
                  onClick={handleGenerateCode}
                  disabled={isGenerating || modules.length === 0}
                  className="relative w-full h-14 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 hover:from-cyan-900/40 hover:to-blue-900/40 border border-cyan-500/30 rounded-sm flex items-center justify-center space-x-3 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden shadow-lg"
              >
                  <div className="absolute inset-0 bg-cyan-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                  {isGenerating ? (
                      <Loader2 className="animate-spin text-cyan-400 relative z-10" size={20} />
                  ) : (
                      <Cpu className="text-cyan-400 relative z-10" size={20} />
                  )}
                  <span className="text-xs font-black text-cyan-100 uppercase tracking-[0.15em] relative z-10">
                      {isGenerating ? 'Compiling System...' : 'Generate Plugin Source'}
                  </span>
              </button>
          </div>
        </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#020202] relative">
        
        {/* Header (Navigation) */}
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#050505] flex-shrink-0 z-20">
            
            {/* Left: Audio Control */}
            <div className="flex items-center space-x-4 w-48">
                 <div className="relative group">
                    <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <button className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all ${audioFile ? 'bg-cyan-950/30 border-cyan-900 text-cyan-400' : 'bg-[#0a0a0a] border-white/5 text-neutral-500 hover:text-neutral-300 hover:border-white/10'}`}>
                        <PlayCircle size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{audioFile ? 'Source Loaded' : 'Load Audio'}</span>
                    </button>
                 </div>
                 {audioFile && (
                     <audio 
                        ref={audioRef} 
                        src={audioFile} 
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={handleAudioEnded}
                        className="hidden" 
                     />
                 )}
            </div>

            {/* Center: Mode Switcher */}
            <div className="flex items-center bg-[#0a0a0a] p-1 rounded-full border border-white/5">
                <button 
                    onClick={() => setAppMode('ARCHITECT')}
                    className={`flex items-center space-x-2 px-6 py-1.5 rounded-full transition-all ${appMode === 'ARCHITECT' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-400'}`}
                >
                    <Layers size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Architect</span>
                </button>
                
                <div className="w-px h-3 bg-white/5 mx-1"></div>

                <button 
                    onClick={() => setAppMode('DESIGNER')}
                    className={`flex items-center space-x-2 px-6 py-1.5 rounded-full transition-all ${appMode === 'DESIGNER' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-400'}`}
                >
                    <PenTool size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Designer</span>
                </button>

                <div className="w-px h-3 bg-white/5 mx-1"></div>

                <button 
                    onClick={() => setAppMode('ENGINEER')}
                    className={`flex items-center space-x-2 px-6 py-1.5 rounded-full transition-all ${appMode === 'ENGINEER' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-400'}`}
                >
                    <Terminal size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Engineer</span>
                </button>
            </div>
            
            {/* Right: Actions */}
            <div className="w-48 flex justify-end">
                {generatedCode && (
                    <button 
                    onClick={handleDownloadVst}
                    className="flex items-center space-x-2 text-neutral-500 hover:text-cyan-400 transition-colors group"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Export C++</span>
                        <div className="w-8 h-8 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center group-hover:border-cyan-500/50">
                            <Download size={14} />
                        </div>
                    </button>
                )}
            </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden bg-[#020202] flex flex-col">
            
            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none z-0" 
                style={{ 
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', 
                    backgroundSize: '50px 50px',
                    maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
                }}>
            </div>
            
            {/* Combine Floating Button */}
            {(appMode === 'ARCHITECT' || appMode === 'DESIGNER') && canCombine && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-top-4 fade-in">
                    <button 
                        onClick={combineSelected}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.4)] flex items-center space-x-2 transition-transform hover:scale-105"
                    >
                        <Merge size={16} />
                        <span className="text-xs uppercase tracking-wider">Combine {selectedModules.length} Modules</span>
                    </button>
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 relative z-10">
                
                {/* --- EMPTY STATE --- */}
                {(appMode === 'ARCHITECT' || appMode === 'DESIGNER') && modules.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center pb-20 select-none">
                        <div className="w-24 h-24 rounded-full bg-[#0a0a0a] border border-white/5 flex items-center justify-center mb-8 shadow-2xl relative group">
                            <div className="absolute inset-0 rounded-full border border-cyan-500/20 scale-110 opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                            <Box size={32} className="text-neutral-700 group-hover:text-cyan-500 transition-colors duration-500" />
                        </div>
                        <h2 className="text-xl font-black text-white tracking-tight mb-2">SYSTEM UNINITIALIZED</h2>
                        <p className="text-neutral-500 text-sm max-w-xs text-center leading-relaxed mb-8">
                            The DSP architecture is currently empty. Select a template from the sidebar to begin architecting your plugin.
                        </p>
                        {appMode === 'DESIGNER' && (
                            <button 
                                onClick={() => setAppMode('ARCHITECT')}
                                className="flex items-center space-x-2 text-cyan-500 text-xs font-bold uppercase tracking-widest hover:text-cyan-400"
                            >
                                <span>Open Architect Mode</span>
                                <ChevronRight size={12} />
                            </button>
                        )}
                    </div>
                )}

                {/* --- ARCHITECT / DESIGNER VIEW --- */}
                {(appMode === 'ARCHITECT' || appMode === 'DESIGNER') && modules.length > 0 && (
                    <div className={`max-w-6xl mx-auto space-y-8 pb-32 transition-all duration-500 ${appMode === 'DESIGNER' ? 'scale-100' : 'scale-100'}`}>
                         
                         {/* Master Visualizer */}
                         <div className="bg-[#050505] rounded-sm border border-white/5 shadow-2xl overflow-hidden relative group">
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50"></div>
                            <div className="p-4 relative z-10">
                                <div className="flex justify-between items-center mb-4 opacity-50">
                                    <div className="flex items-center space-x-2 text-cyan-500">
                                        <Activity size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Output Spectrum</span>
                                    </div>
                                    
                                    <div className="flex items-center space-x-1 bg-neutral-900 rounded-full p-0.5 border border-white/5">
                                        <button 
                                            onClick={() => setVisualizerMode('SPECTRUM')}
                                            className={`p-1 rounded-full transition-colors ${visualizerMode === 'SPECTRUM' ? 'bg-cyan-500/20 text-cyan-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                                        >
                                            <Activity size={12} />
                                        </button>
                                        <button 
                                            onClick={() => setVisualizerMode('WAVEFORM')}
                                            className={`p-1 rounded-full transition-colors ${visualizerMode === 'WAVEFORM' ? 'bg-cyan-500/20 text-cyan-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                                        >
                                            <Waves size={12} />
                                        </button>
                                        <button 
                                            onClick={() => setVisualizerMode('SPECTROGRAM')}
                                            className={`p-1 rounded-full transition-colors ${visualizerMode === 'SPECTROGRAM' ? 'bg-cyan-500/20 text-cyan-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                                        >
                                            <Grid size={12} />
                                        </button>
                                    </div>

                                    <span className="text-[10px] font-mono text-neutral-600">44.1kHz / 32-bit</span>
                                </div>
                                <Visualizer mode={visualizerMode} />
                            </div>
                         </div>

                         {/* Rack */}
                         <div className="space-y-4">
                            {modules.map((module, index) => (
                                <div 
                                    key={module.id} 
                                    draggable={appMode === 'ARCHITECT'}
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onClick={(e) => {
                                        if(!(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('select') && !(e.target as HTMLElement).closest('input')) {
                                            selectForSidebar(module.id);
                                        }
                                    }}
                                    className={`relative bg-[#080808] rounded-sm border transition-all duration-300 
                                        ${draggedItemIndex === index ? 'opacity-40' : ''} 
                                        ${!module.enabled ? 'opacity-60 grayscale' : ''}
                                        ${module.selected ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : (selectedModuleId === module.id ? 'border-cyan-500/30' : 'border-white/5 hover:border-white/10')}
                                        shadow-lg
                                    `}
                                >
                                    {/* Module Header */}
                                    <div className="h-9 flex items-center justify-between px-4 bg-white/[0.01] border-b border-white/[0.03]">
                                        <div className="flex items-center space-x-4">
                                            {appMode === 'ARCHITECT' && (
                                                <div className="cursor-grab active:cursor-grabbing text-neutral-700 hover:text-neutral-500">
                                                    <GripVertical size={12} />
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center space-x-3">
                                                <button 
                                                    onClick={() => toggleBypass(module.id)}
                                                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${module.enabled ? 'shadow-[0_0_8px_currentColor]' : 'bg-neutral-800 shadow-none'}`} 
                                                    style={{ backgroundColor: module.enabled ? module.color : '' }}
                                                />
                                                <span className="text-[11px] font-bold text-gray-300 tracking-widest uppercase">
                                                    {module.title || module.type}
                                                </span>
                                                
                                                {(module.type === PluginType.SATURATION || (module.nestedModules?.includes(PluginType.SATURATION))) && (
                                                    <div className="flex items-center space-x-1 ml-2 border-l border-white/10 pl-3">
                                                        <span className="text-[9px] text-neutral-600 font-bold uppercase">MODE:</span>
                                                        <select 
                                                            value={module.saturationMode || 'TUBE'}
                                                            onChange={(e) => updateModuleState(module.id, { saturationMode: e.target.value as any })}
                                                            className="bg-transparent text-[9px] font-mono text-orange-500 outline-none border-none cursor-pointer uppercase"
                                                        >
                                                            {SAT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                                
                                                {(module.type === PluginType.SHINE || (module.nestedModules?.includes(PluginType.SHINE))) && (
                                                    <div className="flex items-center space-x-1 ml-2 border-l border-white/10 pl-3">
                                                        <span className="text-[9px] text-neutral-600 font-bold uppercase">SHINE:</span>
                                                        <select 
                                                            value={module.shineMode || 'AIR'}
                                                            onChange={(e) => updateModuleState(module.id, { shineMode: e.target.value as any })}
                                                            className="bg-transparent text-[9px] font-mono text-cyan-400 outline-none border-none cursor-pointer uppercase"
                                                        >
                                                            {SHINE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            {(appMode === 'ARCHITECT' || appMode === 'DESIGNER') && (
                                                 <button 
                                                 onClick={(e) => { e.stopPropagation(); toggleSelection(module.id); }}
                                                 className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border transition-colors 
                                                    ${module.selected ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'border-transparent text-neutral-600 hover:text-neutral-400'}`}
                                                 >
                                                     {module.selected ? 'Selected' : 'Select'}
                                                 </button>
                                            )}
                                            
                                            {appMode === 'ARCHITECT' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); removeModule(module.id); }}
                                                    className="text-neutral-700 hover:text-red-500 transition-colors px-2"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Module Body */}
                                    <div className="p-6">
                                        {(module.type === PluginType.VISUAL_EQ || module.type === PluginType.HYBRID_EQ_DYN || module.type === PluginType.SHINE) && (
                                            <div className="mb-8">
                                                <VisualEQ 
                                                    module={module} 
                                                    onChangeParam={(p, v) => updateParam(module.id, p, v)}
                                                    onLayerChange={(layer) => updateModuleState(module.id, { activeLayer: layer })}
                                                />
                                            </div>
                                        )}
                                        
                                        {/* Params / Layout Grid */}
                                        <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
                                            {module.layout ? module.layout.map((component, compIndex) => {
                                                // Layer Visibility Check
                                                if (component.visibleOnLayer && component.visibleOnLayer !== module.activeLayer) return null;

                                                const isSelected = appMode === 'DESIGNER' && selectedComponentId === component.id;
                                                const isDragging = draggedComponentId === component.id;

                                                return (
                                                    <div 
                                                        key={component.id}
                                                        draggable={appMode === 'DESIGNER'}
                                                        onDragStart={(e) => handleComponentDragStart(e, component.id)}
                                                        onDragOver={(e) => handleComponentDragOver(e, component.id, module.id)}
                                                        onDragEnd={handleComponentDragEnd}
                                                        onClick={(e) => {
                                                            if (appMode === 'DESIGNER') {
                                                                e.stopPropagation();
                                                                selectForSidebar(module.id, component.id);
                                                            }
                                                        }}
                                                        className={`relative transition-all ${isSelected ? 'ring-1 ring-purple-500 rounded bg-purple-500/10' : ''} 
                                                            ${appMode === 'DESIGNER' ? 'hover:bg-white/5 cursor-grab active:cursor-grabbing p-2 -m-2 rounded' : ''}
                                                            ${isDragging ? 'opacity-30' : ''}
                                                        `}
                                                        style={component.type === 'HEADER' || component.type === 'SPACER' ? { width: '100%' } : {}}
                                                    >
                                                        {appMode === 'DESIGNER' && (
                                                            <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 text-neutral-600 pointer-events-none">
                                                                <Move size={10} />
                                                            </div>
                                                        )}

                                                        {component.type === 'KNOB' && component.paramId && (
                                                            <Knob
                                                                label={component.label}
                                                                value={module.params[component.paramId] !== undefined ? module.params[component.paramId] : 0}
                                                                min={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.min || 0}
                                                                max={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.max || 100}
                                                                unit={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.unit}
                                                                color={component.color}
                                                                size={component.size || 56}
                                                                variant={component.style}
                                                                onChange={(val) => component.paramId && updateParam(module.id, component.paramId, val)}
                                                            />
                                                        )}

                                                        {component.type === 'HEADER' && (
                                                            <div className="flex items-center space-x-2 border-b border-white/5 pb-2 mb-2">
                                                                <div className="h-1 w-1 bg-current rounded-full" style={{ color: component.color }}></div>
                                                                <h3 
                                                                    className="text-xs font-bold uppercase tracking-widest"
                                                                    style={{ color: component.color }}
                                                                >
                                                                    {component.label}
                                                                </h3>
                                                            </div>
                                                        )}

                                                        {component.type === 'SPACER' && (
                                                            <div style={{ height: component.size || 24 }}></div>
                                                        )}
                                                    </div>
                                                );
                                            }) : (
                                                <div className="w-full text-center text-neutral-500 text-xs">Layout Error: No Layout Data</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                         </div>
                    </div>
                )}

                {/* --- ENGINEER VIEW (Code) --- */}
                {appMode === 'ENGINEER' && (
                    <div className="max-w-6xl mx-auto h-full pb-20">
                        {!generatedCode ? (
                             <div className="flex flex-col items-center justify-center h-full text-neutral-600 select-none">
                                <Code size={48} className="mb-6 opacity-10" />
                                <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Source Not Compiled</h3>
                                <p className="text-xs mt-2 text-neutral-700">
                                    Return to Architect mode and click <span className="text-cyan-500">Generate Plugin</span>.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-8 animate-in fade-in zoom-in-95 duration-300">
                                {/* AI Explanation */}
                                <div className="bg-[#050505] border border-cyan-900/30 p-6 rounded-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                                    <h3 className="text-cyan-500 font-bold mb-3 flex items-center text-xs uppercase tracking-wider">
                                        <Zap size={12} className="mr-2" /> System Analysis
                                    </h3>
                                    <p className="text-gray-400 text-xs leading-relaxed font-mono">{generatedCode.explanation}</p>
                                </div>

                                {/* Code Editors */}
                                <div className="grid grid-cols-2 gap-6 h-[600px]">
                                    {/* Header File */}
                                    <div className="bg-[#080808] rounded-sm border border-white/5 flex flex-col overflow-hidden shadow-xl">
                                        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-neutral-400 font-mono uppercase">PluginProcessor.h</span>
                                            <div className="flex space-x-1">
                                                <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
                                                <div className="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                                                <div className="w-2 h-2 rounded-full bg-green-500/20"></div>
                                            </div>
                                        </div>
                                        <pre className="flex-1 overflow-auto p-4 text-[10px] leading-5 font-mono text-neutral-400 custom-scrollbar selection:bg-white/10">
                                            {generatedCode.headerCode}
                                        </pre>
                                    </div>

                                    {/* CPP File */}
                                    <div className="bg-[#080808] rounded-sm border border-white/5 flex flex-col overflow-hidden shadow-xl">
                                        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-neutral-400 font-mono uppercase">PluginProcessor.cpp</span>
                                            <div className="flex space-x-1">
                                                <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
                                                <div className="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                                                <div className="w-2 h-2 rounded-full bg-green-500/20"></div>
                                            </div>
                                        </div>
                                        <pre className="flex-1 overflow-auto p-4 text-[10px] leading-5 font-mono text-cyan-100/80 custom-scrollbar selection:bg-cyan-500/20">
                                            {generatedCode.cppCode}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* --- TRANSPORT BAR (Bottom) --- */}
            <Transport 
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                onPlayPause={togglePlay}
                onRestart={handleRestart}
                onSeek={handleSeek}
            />

        </div>
      </div>
    </div>
  );
}
