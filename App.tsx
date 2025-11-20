import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PluginType, PluginModuleState, GemimiCodeResponse, PluginLayer, VisualizerMode, AudioParamConfig, SaturationMode, ShineMode, UIComponent, UIComponentType, RackVariant, SectionVariant } from './types';
import { PLUGIN_DEFINITIONS, LAYER_TO_PLUGIN_TYPE, createDefaultLayout, BAND_COLORS } from './constants';
import { Knob } from './components/Knob';
import { Slider } from './components/Slider';
import { Switch } from './components/Switch';
import { Screw } from './components/Screw';
import { Rack } from './components/Rack';
import { Visualizer } from './components/Visualizer';
import { VisualEQ } from './components/VisualEQ';
import { StereoBar } from './components/StereoBar';
import { Transport } from './components/Transport';
import { audioEngine } from './services/audioEngine';
import { generatePluginCode } from './services/geminiService';
import { 
  Zap, Download, Code, Loader2, 
  X, GripVertical, Activity, PlayCircle, Check, Merge, 
  Cpu, Layers, PenTool, ChevronRight, Box, Terminal, GitMerge,
  Waves, Grid, Sparkles, Tag, Plus, Trash2, LayoutTemplate, ChevronLeft, List, Move,
  Maximize, Columns, Image as ImageIcon, Type, AlignLeft, AlignCenter, AlignRight, MousePointer2,
  CornerDownRight, FolderOpen, ToggleLeft, Sliders, Nut, Circle, Server, AlignJustify, ArrowLeftRight, ArrowUpDown, GripHorizontal, Flame,
  ChevronDown, Wind, Copy, Users, ArrowUpToLine, ArrowDownToLine
} from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2, 9);

type AppMode = 'ARCHITECT' | 'DESIGNER' | 'ENGINEER';

type DragPosition = 'left' | 'right' | 'top' | 'bottom' | 'inside' | 'inside-top' | 'inside-bottom' | 'inside-left' | 'inside-right';

// Helper component for styled color input
const ColorPicker = ({ value, onChange, label }: { value: string, onChange: (val: string) => void, label?: string }) => (
  <div className="w-full">
    {label && <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">{label}</label>}
    <div className="relative h-8 w-full rounded-sm border border-white/10 overflow-hidden group cursor-pointer">
      <div 
        className="absolute inset-0 transition-colors" 
        style={{ backgroundColor: value }}
      ></div>
      <div className="absolute inset-0 flex items-center justify-between px-2 bg-black/10 group-hover:bg-transparent transition-colors">
         <span className="text-[10px] font-mono font-bold text-white drop-shadow-md uppercase">{value}</span>
      </div>
      <input 
        type="color" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  </div>
);

// Recursive helpers for tree manipulation
const findComponent = (layout: UIComponent[], id: string): UIComponent | null => {
    for (const c of layout) {
        if (c.id === id) return c;
        if (c.children) {
            const found = findComponent(c.children, id);
            if (found) return found;
        }
    }
    return null;
};

const findParent = (layout: UIComponent[], id: string): UIComponent | null => {
    for (const c of layout) {
        if (c.children) {
             if (c.children.some(child => child.id === id)) return c;
             const found = findParent(c.children, id);
             if (found) return found;
        }
    }
    return null;
};

const removeNode = (nodes: UIComponent[], id: string): { node: UIComponent | null, newNodes: UIComponent[] } => {
    const index = nodes.findIndex(n => n.id === id);
    if (index !== -1) {
        const node = nodes[index];
        const newNodes = [...nodes];
        newNodes.splice(index, 1);
        return { node, newNodes };
    }
    
    const newNodes = [];
    let foundNode = null;

    for (const n of nodes) {
        if (n.children) {
            const result = removeNode(n.children, id);
            if (result.node) {
                foundNode = result.node;
                newNodes.push({ ...n, children: result.newNodes });
            } else {
                newNodes.push(n);
            }
        } else {
            newNodes.push(n);
        }
    }
    return { node: foundNode, newNodes };
};

const insertNode = (nodes: UIComponent[], targetId: string, nodeToInsert: UIComponent, position: 'before'|'after'|'inside'|'at_index', index?: number): UIComponent[] => {
    if (position === 'inside' || position === 'at_index') {
        const parentIdx = nodes.findIndex(n => n.id === targetId);
        if (parentIdx !== -1) {
            const parent = nodes[parentIdx];
            let newChildren = parent.children ? [...parent.children] : [];
            
            if (position === 'at_index' && typeof index === 'number') {
                // Fill with spacers if needed
                if (index > newChildren.length) {
                    const spacersNeeded = index - newChildren.length;
                    for(let i=0; i<spacersNeeded; i++) {
                        newChildren.push({
                            id: generateId(),
                            type: 'SPACER',
                            label: 'Spacer',
                            colSpan: 1
                        });
                    }
                }
                newChildren.splice(index, 0, nodeToInsert);
            } else {
                newChildren.push(nodeToInsert);
            }
            
            const newNodes = [...nodes];
            newNodes[parentIdx] = { ...parent, children: newChildren };
            return newNodes;
        }
    }

    const parentIdx = nodes.findIndex(n => n.id === targetId);
    if (parentIdx !== -1 && (position === 'before' || position === 'after')) {
        const newNodes = [...nodes];
        if (position === 'before') newNodes.splice(parentIdx, 0, nodeToInsert);
        else newNodes.splice(parentIdx + 1, 0, nodeToInsert);
        return newNodes;
    }

    return nodes.map(n => {
        if (n.children) {
            return { ...n, children: insertNode(n.children, targetId, nodeToInsert, position, index) };
        }
        return n;
    });
};

// Helper to replace a node directly (used for grouping)
const replaceNode = (nodes: UIComponent[], targetId: string, newNode: UIComponent): UIComponent[] => {
    return nodes.map(n => {
        if (n.id === targetId) return newNode;
        if (n.children) return { ...n, children: replaceNode(n.children, targetId, newNode) };
        return n;
    });
};

const updateNode = (nodes: UIComponent[], id: string, updates: Partial<UIComponent>): UIComponent[] => {
    return nodes.map(n => {
        if (n.id === id) return { ...n, ...updates };
        if (n.children) return { ...n, children: updateNode(n.children, id, updates) };
        return n;
    });
};

// Visual Drop Zone Component
const DropZone = ({ position }: { position: DragPosition }) => {
    return (
        <div 
            className={`
                absolute z-50 pointer-events-none animate-in fade-in zoom-in-95
                ${position === 'top' ? 'top-0 left-0 right-0 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_#22d3ee]' : ''}
                ${position === 'bottom' ? 'bottom-0 left-0 right-0 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_#22d3ee]' : ''}
                ${position === 'left' ? 'left-0 top-0 bottom-0 w-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_#22d3ee]' : ''}
                ${position === 'right' ? 'right-0 top-0 bottom-0 w-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_#22d3ee]' : ''}
                
                ${position === 'inside' ? 'inset-0 bg-cyan-500/20 border-2 border-cyan-400 border-dashed' : ''}
                
                ${position === 'inside-top' ? 'inset-x-0 top-0 h-1/2 bg-cyan-500/20 border-b-2 border-cyan-400 border-dashed' : ''}
                ${position === 'inside-bottom' ? 'inset-x-0 bottom-0 h-1/2 bg-cyan-500/20 border-t-2 border-cyan-400 border-dashed' : ''}
                ${position === 'inside-left' ? 'inset-y-0 left-0 w-1/2 bg-cyan-500/20 border-r-2 border-cyan-400 border-dashed' : ''}
                ${position === 'inside-right' ? 'inset-y-0 right-0 w-1/2 bg-cyan-500/20 border-l-2 border-cyan-400 border-dashed' : ''}
            `}
        >
            {position.toString().startsWith('inside') && (
                <div className="absolute inset-0 flex items-center justify-center">
                     {(position === 'inside-top' || position === 'inside-bottom') && <ArrowUpDown size={24} className="text-cyan-400 drop-shadow-lg" />}
                     {(position === 'inside-left' || position === 'inside-right') && <ArrowLeftRight size={24} className="text-cyan-400 drop-shadow-lg" />}
                     {position === 'inside' && <CornerDownRight size={24} className="text-cyan-400 drop-shadow-lg" />}
                </div>
            )}
        </div>
    );
};

// Context interface for cleaner prop passing to external components
interface DesignerContextProps {
  appMode: AppMode;
  selectedComponentId: string | null;
  draggedComponentId: string | null;
  dragOverInfo: { id: string, position: DragPosition } | null;
  actions: {
    handleDragStart: (e: React.DragEvent, id: string) => void;
    handleDrop: (e: React.DragEvent, targetId: string, moduleId: string, position: any, index?: number) => void;
    setDragOver: (info: { id: string, position: DragPosition } | null) => void;
    setDraggedId: (id: string | null) => void;
    selectComponent: (moduleId: string, componentId: string) => void;
    updateParam: (moduleId: string, paramId: string, val: number) => void;
    updateComponent: (moduleId: string, componentId: string, updates: Partial<UIComponent>) => void;
    removeComponent: (moduleId: string, componentId: string) => void;
    updateModule: (moduleId: string, updates: Partial<PluginModuleState>) => void;
    startRackResize: (e: React.MouseEvent, id: string, height: number) => void;
  }
}

// Extracted RenderSidebarTree
const RenderSidebarTree: React.FC<{ components: UIComponent[], depth?: number, moduleId: string, ctx: DesignerContextProps }> = ({ components, depth = 0, moduleId, ctx }) => {
    return (
        <div className="space-y-1">
            {components.map(comp => (
                <div key={comp.id}>
                    <div 
                        draggable={ctx.appMode === 'DESIGNER'}
                        onDragStart={(e) => ctx.appMode === 'DESIGNER' && ctx.actions.handleDragStart(e, comp.id)}
                        onDragOver={(e) => {
                              e.preventDefault(); 
                              e.stopPropagation();
                              if(ctx.draggedComponentId === comp.id) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const y = e.clientY - rect.top;
                              const pos = y < rect.height / 2 ? 'top' : 'bottom';
                              ctx.actions.setDragOver({ id: comp.id, position: pos });
                        }}
                        onDrop={(e) => {
                              if (ctx.appMode === 'DESIGNER') {
                                   const pos = ctx.dragOverInfo?.id === comp.id ? ctx.dragOverInfo.position : 'bottom'; 
                                   ctx.actions.handleDrop(e, comp.id, moduleId, pos);
                              }
                        }}
                        onClick={() => ctx.actions.selectComponent(moduleId, comp.id)}
                        className={`relative flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group transition-colors
                            ${ctx.selectedComponentId === comp.id ? 'bg-white/10 text-white' : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'}
                            ${ctx.draggedComponentId === comp.id ? 'opacity-40' : ''}
                        `}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    >
                        {ctx.dragOverInfo?.id === comp.id && (
                              <div className={`absolute left-0 right-0 h-0.5 bg-cyan-500 z-50 ${ctx.dragOverInfo.position === 'top' ? 'top-0' : 'bottom-0'}`} />
                        )}
                        
                        <div className="flex items-center space-x-2 overflow-hidden pointer-events-none">
                              {comp.type === 'SECTION' ? <Columns size={10} /> : 
                               comp.type === 'RACK' ? <Server size={10} /> :
                               comp.type === 'KNOB' ? <Activity size={10} /> :
                               comp.type === 'SLIDER' ? <Sliders size={10} /> :
                               comp.type === 'SWITCH' ? <ToggleLeft size={10} /> :
                               comp.type === 'BRANDING' ? <Tag size={10} /> :
                               comp.type === 'VISUALIZER' ? <Waves size={10} /> :
                               comp.type === 'DROPDOWN' ? <List size={10} /> :
                               comp.type === 'STEREO_BAR' ? <ArrowLeftRight size={10} /> :
                               <Box size={10} />}
                              <span className="text-[10px] font-medium truncate">{comp.label || comp.type}</span>
                        </div>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <GripHorizontal size={10} className="text-neutral-600 mr-1 cursor-grab" />
                            <button 
                                onClick={(e) => { e.stopPropagation(); ctx.actions.removeComponent(moduleId, comp.id); }}
                                className="p-1 hover:text-red-500 transition-colors"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    </div>
                    {comp.children && comp.children.length > 0 && (
                        <RenderSidebarTree components={comp.children} depth={depth + 1} moduleId={moduleId} ctx={ctx} />
                    )}
                </div>
            ))}
        </div>
    );
};

// Extracted RenderComponent
const RenderComponent: React.FC<{ component: UIComponent, module: PluginModuleState, index: number, parentLayout?: 'grid'|'flex', ctx: DesignerContextProps }> = ({ component, module, index, parentLayout, ctx }) => {
    if (component.visibleOnLayer && component.visibleOnLayer !== module.activeLayer) return null;
    
    const isSelected = ctx.appMode === 'DESIGNER' && ctx.selectedComponentId === component.id;
    const isDragging = ctx.draggedComponentId === component.id;
    
    const span = component.colSpan || 1;
    let colClass = '';
    if (parentLayout !== 'flex') {
        colClass = `col-span-${Math.min(4, Math.max(1, span))}`;
        if (['KNOB', 'SWITCH', 'SCREW', 'SLIDER'].includes(component.type) && !component.colSpan) colClass = 'col-span-1';
    }
    
    const alignClass = component.align === 'start' ? 'items-start' : component.align === 'end' ? 'items-end' : component.align === 'stretch' ? 'items-stretch' : 'items-center';
    const justifyClass = component.justify === 'start' ? 'justify-start' : component.justify === 'end' ? 'justify-end' : component.justify === 'between' ? 'justify-between' : 'justify-center';
    
    const isFlexChild = parentLayout === 'flex';
    const heightClass = component.height ? '' : (isFlexChild ? 'h-full' : 'h-auto');

    return (
        <div 
            key={component.id}
            onClick={(e) => {
                if (ctx.appMode === 'DESIGNER') {
                    e.stopPropagation();
                    ctx.actions.selectComponent(module.id, component.id);
                }
            }}
            draggable={ctx.appMode === 'DESIGNER'}
            onDragStart={(e) => {
                 if (ctx.appMode === 'DESIGNER') ctx.actions.handleDragStart(e, component.id);
            }}
            onDragEnd={() => {
                ctx.actions.setDraggedId(null);
                ctx.actions.setDragOver(null);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (ctx.draggedComponentId === component.id) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const w = rect.width;
                const h = rect.height;

                const edge = Math.min(15, Math.min(w, h) * 0.2); 
                
                let pos: DragPosition = 'inside';

                if (y < edge) pos = 'top';
                else if (y > h - edge) pos = 'bottom';
                else if (x < edge) pos = 'left';
                else if (x > w - edge) pos = 'right';
                else {
                    const nx = x / w;
                    const ny = y / h;
                    if (ny < nx && ny < 1 - nx) pos = 'inside-top';
                    else if (ny > nx && ny > 1 - nx) pos = 'inside-bottom';
                    else if (ny > nx && ny < 1 - nx) pos = 'inside-left';
                    else pos = 'inside-right';
                }

                if (ctx.dragOverInfo?.id !== component.id || ctx.dragOverInfo?.position !== pos) {
                    ctx.actions.setDragOver({ id: component.id, position: pos });
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (ctx.appMode === 'DESIGNER') {
                     if (component.type === 'RACK' && ctx.dragOverInfo?.position?.toString().startsWith('inside')) {
                          ctx.actions.handleDrop(e, component.id, module.id, 'inside');
                     } else {
                         const pos = ctx.dragOverInfo?.id === component.id && ctx.dragOverInfo?.position ? ctx.dragOverInfo.position : 'inside';
                         ctx.actions.handleDrop(e, component.id, module.id, pos);
                     }
                }
                ctx.actions.setDragOver(null);
            }}
            className={`relative transition-all duration-200 flex flex-col ${alignClass} ${justifyClass} ${heightClass}
                ${isSelected ? 'ring-1 ring-cyan-500/50 bg-cyan-500/5 rounded-sm' : ''} 
                ${ctx.appMode === 'DESIGNER' ? 'cursor-grab active:cursor-grabbing hover:bg-white/5 rounded-sm' : ''}
                ${isDragging ? 'opacity-40 scale-95' : ''}
                ${colClass}
                ${parentLayout === 'flex' ? 'flex-1 min-w-0' : ''}
            `}
            style={{ 
                height: component.type === 'VISUALIZER' || component.type === 'MULTIBAND_CONTROLS' ? (component.height || 280) : (component.type === 'SPACER' || component.type === 'BRANDING' || component.type === 'STEREO_BAR' ? (component.height || 24) : (component.type === 'RACK' ? 'auto' : undefined)),
            }}
        >
            {ctx.dragOverInfo?.id === component.id && (
                <DropZone position={ctx.dragOverInfo.position} />
            )}

            {component.type === 'KNOB' && component.paramId && (
                <div className={`p-1 ${ctx.appMode === 'DESIGNER' ? 'pointer-events-none' : ''}`}>
                  <Knob
                      label={component.label}
                      value={module.params[component.paramId] !== undefined ? module.params[component.paramId] : 0}
                      min={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.min || 0}
                      max={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.max || 100}
                      unit={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.unit}
                      color={component.color}
                      size={component.size || 56}
                      variant={component.style || 'classic'}
                      onChange={(val) => component.paramId && ctx.actions.updateParam(module.id, component.paramId, val)}
                  />
                </div>
            )}

            {component.type === 'SLIDER' && component.paramId && (
                <div className={`p-2 h-full flex items-center justify-center w-full ${ctx.appMode === 'DESIGNER' ? 'pointer-events-none' : ''}`}>
                  <Slider
                      label={component.label}
                      value={module.params[component.paramId] !== undefined ? module.params[component.paramId] : 0}
                      min={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.min || 0}
                      max={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.max || 100}
                      unit={PLUGIN_DEFINITIONS[module.type].params.find(p => p.id === component.paramId)?.unit}
                      color={component.color}
                      orientation={component.orientation || 'vertical'}
                      style={component.style || 'classic'}
                      onChange={(val) => component.paramId && ctx.actions.updateParam(module.id, component.paramId, val)}
                  />
                </div>
            )}

            {component.type === 'SWITCH' && component.paramId && (
                <div className={`p-1 w-full h-full flex items-center justify-center ${ctx.appMode === 'DESIGNER' ? 'pointer-events-none' : ''}`}>
                  <Switch
                      label={component.label}
                      value={module.params[component.paramId] !== undefined ? module.params[component.paramId] : 0}
                      color={component.color}
                      style={component.style || 'classic'}
                      onChange={(val) => component.paramId && ctx.actions.updateParam(module.id, component.paramId, val)}
                  />
                </div>
            )}

            {component.type === 'DROPDOWN' && (
                <div className="w-full h-full flex flex-col justify-center px-2">
                    <label className="text-[8px] font-bold uppercase text-neutral-500 mb-1 block">{component.label}</label>
                    <div className="relative">
                         <select 
                            value={
                                component.paramId === 'saturationMode' ? (module.saturationMode || 'TUBE') :
                                component.paramId === 'shineMode' ? (module.shineMode || 'AIR') : 
                                component.paramId === 'multibandStyle' ? (module.multibandStyle || 'CLEAN') : ''
                            }
                            onChange={(e) => {
                                if (component.paramId === 'saturationMode') ctx.actions.updateModule(module.id, { saturationMode: e.target.value as any });
                                if (component.paramId === 'shineMode') ctx.actions.updateModule(module.id, { shineMode: e.target.value as any });
                                if (component.paramId === 'multibandStyle') ctx.actions.updateModule(module.id, { multibandStyle: e.target.value as any });
                            }}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded p-1.5 text-[10px] font-bold uppercase text-white outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
                            style={{ color: component.color }}
                         >
                            {component.paramId === 'saturationMode' && (
                                <>
                                <option value="TUBE">Tube</option>
                                <option value="TAPE">Tape</option>
                                <option value="DIGITAL">Digital</option>
                                <option value="FUZZ">Fuzz</option>
                                <option value="RECTIFY">Rectify</option>
                                </>
                            )}
                            {component.paramId === 'shineMode' && (
                                <>
                                <option value="AIR">Air</option>
                                <option value="CRYSTAL">Crystal</option>
                                <option value="SHIMMER">Shimmer</option>
                                <option value="GLOSS">Gloss</option>
                                <option value="ANGELIC">Angelic</option>
                                </>
                            )}
                            {component.paramId === 'multibandStyle' && (
                                <>
                                <option value="CLEAN">Clean</option>
                                <option value="PUNCHY">Punchy</option>
                                <option value="SMOOTH">Smooth</option>
                                <option value="CRUSH">Crush</option>
                                <option value="OPTO">Opto</option>
                                </>
                            )}
                         </select>
                         {/* Custom Arrow */}
                         <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                            <ChevronDown size={10} />
                         </div>
                    </div>
                </div>
            )}
            
            {component.type === 'SCREW' && (
                <div className="p-1 pointer-events-none">
                    <Screw size={component.size || 14} />
                </div>
            )}

            {component.type === 'BRANDING' && (
                <div 
                    className={`w-full h-full flex items-center p-2 overflow-hidden rounded-sm border border-transparent
                        ${component.alignment === 'center' ? 'justify-center text-center' : component.alignment === 'right' ? 'justify-end text-right' : 'justify-start text-left'}
                    `}
                    style={{ 
                        backgroundColor: component.imageUrl ? 'transparent' : (component.color ? `${component.color}10` : 'transparent')
                    }}
                >
                    {component.imageUrl && (
                        <img src={component.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" alt="" />
                    )}
                    <div className="relative z-10 pointer-events-none" style={{ color: component.color || '#fff' }}>
                        <h3 className="font-black uppercase tracking-tighter leading-none" style={{ fontSize: component.fontSize || 18 }}>
                            {component.label}
                        </h3>
                    </div>
                </div>
            )}

            {component.type === 'STEREO_BAR' && (
                <div className="w-full h-full pointer-events-auto">
                    <StereoBar />
                </div>
            )}

            {component.type === 'MULTIBAND_CONTROLS' && (
                 <div className="w-full h-full pointer-events-auto p-2">
                    <div className="w-full h-full bg-[#080808] rounded-lg border border-white/5 relative overflow-hidden flex items-center justify-between px-6">
                        {/* Dynamic Background Tint */}
                        <div 
                            className="absolute inset-0 opacity-10 pointer-events-none transition-colors duration-300" 
                            style={{ backgroundColor: BAND_COLORS[(module.selectedBand || 1) - 1] }}
                        ></div>

                        {/* Left: Band Identity */}
                        <div className="flex flex-col justify-center z-10 border-r border-white/5 pr-6 h-2/3">
                            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Selected</span>
                            <div className="text-3xl font-black uppercase tracking-tighter leading-none transition-colors duration-300" style={{ color: BAND_COLORS[(module.selectedBand || 1) - 1] }}>
                                Band {module.selectedBand || 1}
                            </div>
                        </div>
                        
                        {/* Center: Main Power Knob */}
                        <div className="flex items-center z-10">
                             <Knob 
                                label="Ratio" 
                                value={module.params[`b${module.selectedBand || 1}Ratio`] || 4}
                                min={1} max={20} unit=":1"
                                size={64}
                                variant="cyber"
                                color={BAND_COLORS[(module.selectedBand || 1) - 1]}
                                onChange={(val) => ctx.actions.updateParam(module.id, `b${module.selectedBand || 1}Ratio`, val)}
                             />
                        </div>

                        {/* Right: Time Controls */}
                        <div className="flex items-center space-x-4 z-10 pl-6 border-l border-white/5 h-2/3">
                             <Knob 
                                label="Attack" 
                                value={module.params[`b${module.selectedBand || 1}Attack`] || 0.01}
                                min={0} max={0.2} unit="s"
                                size={48}
                                variant="tech"
                                color={BAND_COLORS[(module.selectedBand || 1) - 1]}
                                onChange={(val) => ctx.actions.updateParam(module.id, `b${module.selectedBand || 1}Attack`, val)}
                             />
                             <Knob 
                                label="Release" 
                                value={module.params[`b${module.selectedBand || 1}Release`] || 0.1}
                                min={0.01} max={1} unit="s"
                                size={48}
                                variant="tech"
                                color={BAND_COLORS[(module.selectedBand || 1) - 1]}
                                onChange={(val) => ctx.actions.updateParam(module.id, `b${module.selectedBand || 1}Release`, val)}
                             />
                        </div>
                    </div>
                 </div>
            )}

            {component.type === 'VISUALIZER' && (
                <div className="w-full h-full pointer-events-auto">
                    {component.visualizerMode === 'VECTORSCOPE' ? (
                        <Visualizer mode="VECTORSCOPE" />
                    ) : (
                        <VisualEQ 
                            module={module} 
                            onChangeParam={(p, v) => ctx.actions.updateParam(module.id, p, v)} 
                            onLayerChange={(layer) => ctx.actions.updateModule(module.id, { activeLayer: layer })} 
                            onUpdateModule={(updates) => ctx.actions.updateModule(module.id, updates)}
                        />
                    )}
                </div>
            )}

            {component.type === 'RACK' && (
                <div className="w-full flex flex-col items-center relative">
                    <Rack 
                      splits={component.rackSplits || 4} 
                      label={component.label}
                      variant={component.rackVariant}
                      editMode={ctx.appMode === 'DESIGNER'}
                      itemsCount={component.children ? component.children.length : 0}
                      height={component.height || 400}
                    >
                        {Array.from({ length: component.rackSplits || 4 }).map((_, slotIdx) => {
                            const child = component.children ? component.children[slotIdx] : undefined;
                            
                            return (
                                <div 
                                  key={slotIdx} 
                                  className="relative w-full h-full flex flex-col"
                                  onDragOver={(e) => {
                                      if (!child) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          ctx.actions.setDragOver({ id: `${component.id}-slot-${slotIdx}`, position: 'inside' });
                                      }
                                  }}
                                  onDrop={(e) => {
                                      if (ctx.appMode === 'DESIGNER' && !child) {
                                          ctx.actions.handleDrop(e, component.id, module.id, 'at_index', slotIdx);
                                      }
                                  }}
                                >
                                    {ctx.dragOverInfo?.id?.toString() === `${component.id}-slot-${slotIdx}` && (
                                        <div className="absolute inset-0 bg-cyan-500/20 z-20 flex items-center justify-center border-2 border-cyan-500/50 animate-pulse">
                                            <Plus size={24} className="text-cyan-400" />
                                        </div>
                                    )}

                                    {child ? (
                                        <div className="w-full h-full relative">
                                          <RenderComponent component={child} module={module} index={slotIdx} ctx={ctx} />
                                        </div>
                                    ) : (
                                        ctx.appMode === 'DESIGNER' && (
                                            <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity group/slot">
                                                <div className="w-4 h-4 border border-dashed border-white/20 rounded-full group-hover/slot:scale-125 transition-transform"></div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )
                        })}
                    </Rack>
                    {ctx.appMode === 'DESIGNER' && (
                        <div 
                            className="w-full h-3 bg-neutral-800/50 hover:bg-cyan-500/50 cursor-ns-resize flex items-center justify-center border-t border-white/5 mt-0.5 rounded-b"
                            onMouseDown={(e) => ctx.actions.startRackResize(e, component.id, component.height || 400)}
                        >
                            <GripVertical size={10} className="rotate-90 text-white/50" />
                        </div>
                    )}
                </div>
            )}

            {component.type === 'SECTION' && (
                <div className={`w-full relative h-full flex flex-col pointer-events-none
                    ${component.sectionVariant === 'card' ? 'bg-[#121212] border border-white/10 rounded p-3 shadow-lg' : ''}
                    ${component.sectionVariant === 'solid' ? 'bg-[#0a0a0a] rounded-sm' : ''}
                    ${component.sectionVariant === 'glass_row' ? 'bg-white/[0.03] border border-white/5 rounded-full px-2' : ''}
                `}>
                    {component.sectionVariant !== 'glass_row' && component.sectionVariant !== 'minimal' && (
                        <div 
                          className={`flex items-center mb-2 pointer-events-none shrink-0
                          ${component.sectionVariant === 'solid' ? 'p-2 bg-white/5 text-center justify-center' : ''} 
                          `}
                        >
                          {component.sectionVariant !== 'solid' && component.sectionVariant !== 'card' && (
                              <div className="h-1 w-1 bg-current rounded-full mr-2" style={{ color: component.color }}></div>
                          )}
                          <h3 
                              className="text-[9px] font-bold uppercase tracking-widest opacity-80"
                              style={{ color: component.color }}
                          >
                              {component.label}
                          </h3>
                        </div>
                    )}

                    <div 
                        className={`relative flex-1 pointer-events-auto
                            ${component.layoutDirection === 'row' ? 'flex flex-row items-stretch space-x-2' : 'grid gap-2'}
                        `}
                        style={component.layoutDirection !== 'row' ? {
                            gridTemplateColumns: `repeat(${component.gridCols || 4}, minmax(0, 1fr))`
                        } : {}}
                    >
                        {component.children && component.children.map((child, i) => (
                            <RenderComponent key={child.id} component={child} module={module} index={i} parentLayout={component.layoutDirection === 'row' ? 'flex' : 'grid'} ctx={ctx} />
                        ))}
                        
                        {ctx.appMode === 'DESIGNER' && (!component.children || component.children.length === 0) && (
                            <div className="col-span-full w-full h-full min-h-[32px] border border-dashed border-white/10 rounded flex items-center justify-center text-neutral-700 pointer-events-none">
                                <span className="text-[8px]">Container</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {component.type === 'SPACER' && (
                <div className={`w-full h-full flex items-center justify-center overflow-hidden min-h-[10px]
                   ${ctx.appMode === 'DESIGNER' ? 'border border-dashed border-white/5 bg-white/[0.02]' : ''}
                `}>
                </div>
            )}
        </div>
    );
};

export default function App() {
  // State
  const [modules, setModules] = useState<PluginModuleState[]>([]);
  const [appMode, setAppMode] = useState<AppMode>('ARCHITECT');
  const [generatedCode, setGeneratedCode] = useState<GemimiCodeResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioFile, setAudioFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Drag & Drop State
  const [draggedComponentId, setDraggedComponentId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string, position: DragPosition } | null>(null);
  
  // Resizing
  const [resizingRackId, setResizingRackId] = useState<string | null>(null);
  const resizingStartY = useRef<number>(0);
  const resizingStartHeight = useRef<number>(0);

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
    const nestedModules = type === PluginType.HYBRID_EQ_DYN ? [PluginType.VISUAL_EQ, PluginType.COMPRESSOR] : undefined;
    
    const newModule: PluginModuleState = {
      id: generateId(),
      type,
      enabled: true,
      color: def.defaultColor,
      collapsed: false,
      selected: false,
      selectedBand: 1, // Initialize band 1 as selected
      nestedModules,
      params: def.params.reduce((acc, p) => ({ ...acc, [p.id]: p.value }), {}),
      // Set Dynamics layer active for Multiband by default
      activeLayer: type === PluginType.MULTIBAND ? PluginLayer.DYNAMICS : PluginLayer.EQ,
      saturationMode: 'TUBE',
      shineMode: 'AIR',
      multibandStyle: 'CLEAN',
      title: type, 
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
  
  const toggleBypass = (id: string) => {
      setModules(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };
  
  const toggleSelection = (id: string) => {
      setModules(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const clearSelection = () => {
      setModules(prev => prev.map(m => ({ ...m, selected: false })));
  }

  const selectForSidebar = (moduleId: string, componentId?: string) => {
      setSelectedModuleId(moduleId);
      if (componentId) setSelectedComponentId(componentId);
      else setSelectedComponentId(null);
  };

  const updateParam = useCallback((moduleId: string, paramId: string, value: number) => {
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
  }, []);

  const updateModuleState = (moduleId: string, updates: Partial<PluginModuleState>) => {
      setModules(prev => {
          const next = prev.map(m => m.id === moduleId ? { ...m, ...updates } : m);
          const updatedModule = next.find(m => m.id === moduleId);
          if (updatedModule) audioEngine.updateParams(updatedModule);
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
          if (m.id !== moduleId || !m.layout) return m;
          return { ...m, layout: updateNode(m.layout, componentId, updates) };
      }));
      // Ensure vertical alignment propagates by forcing h-full/items-stretch if needed
      if (updates.justify) {
          // No special action needed as RenderComponent handles it
      }
  };

  const removeComponent = (moduleId: string, componentId: string) => {
      setModules(prev => prev.map(m => {
          if (m.id !== moduleId || !m.layout) return m;
          const { newNodes } = removeNode(m.layout, componentId);
          return { ...m, layout: newNodes };
      }));
      if (selectedComponentId === componentId) {
          setSelectedComponentId(null);
      }
  };

  const handleComponentDragStart = (e: React.DragEvent, id: string) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => setDraggedComponentId(id), 0);
  };

  const handleSidebarDragStart = (e: React.DragEvent, template: Partial<UIComponent>) => {
      e.dataTransfer.setData('application/vst-component', JSON.stringify(template));
      e.dataTransfer.effectAllowed = 'copy';
      setDraggedComponentId('__NEW_COMPONENT__');
  };

  const handleComponentDrop = (e: React.DragEvent, targetId: string, moduleId: string, position: DragPosition | 'at_index', index?: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverInfo(null);
      
      const sidebarData = e.dataTransfer.getData('application/vst-component');

      if (!sidebarData && (!draggedComponentId || draggedComponentId === targetId)) {
          setDraggedComponentId(null);
          return;
      }

      setModules(prev => prev.map(m => {
          if (m.id !== moduleId || !m.layout) return m;

          let node: UIComponent | null = null;
          let currentNodes = m.layout;

          if (sidebarData) {
               // Create New from Sidebar
               const template = JSON.parse(sidebarData);
               node = { ...template, id: generateId() };
          } else if (draggedComponentId && draggedComponentId !== '__NEW_COMPONENT__') {
               // Move Existing
               const { node: removedNode, newNodes } = removeNode(m.layout, draggedComponentId);
               if (!removedNode) return m;
               node = removedNode;
               currentNodes = newNodes;
          }

          if (!node) return m;

          // Handle Drop to Root of Empty Module
          if (targetId === 'ROOT') {
              return { ...m, layout: [...currentNodes, node] };
          }

          const targetNode = findComponent(currentNodes, targetId);
          const isTargetContainer = targetNode && (targetNode.type === 'SECTION' || targetNode.type === 'RACK');
          
          // Grouping Logic
          const isInsideDrop = position.toString().startsWith('inside');
          
          if (isInsideDrop && !isTargetContainer && targetNode) {
               // Determine direction based on inside position
               const isVertical = position === 'inside-top' || position === 'inside-bottom';
               const isFirst = position === 'inside-top' || position === 'inside-left';

               const firstNode = isFirst ? node : targetNode;
               const secondNode = isFirst ? targetNode : node;

               // Create Group wrapping both
               const newGroup: UIComponent = {
                   id: generateId(),
                   type: 'SECTION',
                   label: 'Group',
                   children: [firstNode!, secondNode!],
                   colSpan: targetNode.colSpan || 1,
                   sectionVariant: 'minimal',
                   layoutDirection: isVertical ? 'column' : 'row', 
                   gridCols: isVertical ? 1 : 4 // Create vertical stack by restricting to 1 column
               };
               
               const finalLayout = replaceNode(currentNodes, targetId, newGroup);
               return { ...m, layout: finalLayout };
          }

          const parent = findParent(currentNodes, targetId);
          const parentIsRack = parent?.type === 'RACK';
          
          // Auto-Grouping Logic for Racks (Side-by-side)
          if (parentIsRack && (position === 'left' || position === 'right')) {
               const swapNodes = (list: UIComponent[]): UIComponent[] => {
                   return list.map(n => {
                       if (n.id === targetId) {
                           if (n.type === 'SECTION' && n.layoutDirection === 'row') {
                               return { 
                                   ...n, 
                                   children: position === 'left' 
                                       ? [node!, ...(n.children || [])]
                                       : [...(n.children || []), node!]
                               };
                           }
                           return {
                               id: generateId(),
                               type: 'SECTION',
                               label: 'Group',
                               colSpan: 1,
                               layoutDirection: 'row',
                               sectionVariant: 'minimal',
                               children: position === 'left' ? [node!, n] : [n, node!]
                           };
                       }
                       if (n.children) return { ...n, children: swapNodes(n.children) };
                       return n;
                   });
               }
               return { ...m, layout: swapNodes(currentNodes) };
          }

          let insertPos: 'before' | 'after' | 'inside' | 'at_index' = 'inside';
          if (position === 'at_index') insertPos = 'at_index';
          else if (position === 'left' || position === 'top') insertPos = 'before';
          else if (position === 'right' || position === 'bottom') insertPos = 'after';
          else insertPos = 'inside'; 

          const finalNodes = insertNode(currentNodes, targetId, node, insertPos, index);
          return { ...m, layout: finalNodes };
      }));
      
      setDraggedComponentId(null);
  };

  // Handle Rack Resizing
  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (resizingRackId && selectedModuleId) {
               const deltaY = e.clientY - resizingStartY.current;
               const newHeight = Math.max(100, resizingStartHeight.current + deltaY);
               updateComponent(selectedModuleId, resizingRackId, { height: newHeight });
          }
      };
      const handleMouseUp = () => {
          if (resizingRackId) {
              setResizingRackId(null);
              document.body.style.cursor = 'default';
          }
      };
      
      if (resizingRackId) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'ns-resize';
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [resizingRackId, selectedModuleId]);


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
          if (m.type === PluginType.SHINE) {
               // Map Shine Gain to Hybrid Shine Param to avoid EQ collision
               Object.keys(m.params).forEach(key => {
                   const match = key.match(/^b(\d+)Gain$/);
                   if (match) {
                       const band = match[1];
                       hybrid.params[`b${band}Shine`] = m.params[key];
                   }
                   // Also Map Frequency params so Shine curve shape is preserved
                   const matchFreq = key.match(/^b(\d+)Freq$/);
                   if (matchFreq) {
                       const band = matchFreq[1];
                       hybrid.params[`b${band}ShineFreq`] = m.params[key];
                   }
               });
               hybrid.shineMode = m.shineMode || 'AIR';
          } else {
               hybrid.params = { ...hybrid.params, ...m.params };
               if (m.type === PluginType.SATURATION) {
                   hybrid.saturationMode = m.saturationMode || 'TUBE';
               }
          }

          if (m.nestedModules) hybrid.nestedModules?.push(...m.nestedModules);
          else hybrid.nestedModules?.push(m.type);
      });
      
      hybrid.nestedModules = [...new Set(hybrid.nestedModules)];
      hybrid.layout = createDefaultLayout(PluginType.HYBRID_EQ_DYN, def.defaultColor, hybrid.nestedModules);

      setModules(prev => {
          const remaining = prev.filter(m => !m.selected);
          return [...remaining, hybrid];
      });
      setSelectedModuleId(hybrid.id);
      clearSelection();
  };

  useEffect(() => {
    audioEngine.updatePluginChain(modules);
  }, [modules.length, modules.map(m => m.id).join(','), modules.map(m => m.enabled).join(','), modules.map(m => m.saturationMode).join(','), modules.map(m => m.shineMode).join(','), modules.map(m => m.multibandStyle).join(',')]);

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

  const activeModule = modules.find(m => m.id === selectedModuleId);
  const activeComponent = activeModule?.layout ? findComponent(activeModule.layout, selectedComponentId || '') : null;
  
  // Designer Context
  const designerContext: DesignerContextProps = {
    appMode,
    selectedComponentId,
    draggedComponentId,
    dragOverInfo,
    actions: {
        handleDragStart: handleComponentDragStart,
        handleDrop: handleComponentDrop,
        setDragOver: setDragOverInfo,
        setDraggedId: setDraggedComponentId,
        selectComponent: selectForSidebar,
        updateParam,
        updateComponent,
        removeComponent,
        updateModule: updateModuleState,
        startRackResize: (e, id, h) => {
            e.preventDefault(); e.stopPropagation();
            setResizingRackId(id);
            resizingStartY.current = e.clientY;
            resizingStartHeight.current = h;
        }
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#020202] text-gray-100 font-sans overflow-hidden selection:bg-cyan-500/30" onDragOver={(e) => e.preventDefault()} onDrop={() => { setDraggedComponentId(null); setDragOverInfo(null); }}>
      
      {/* --- LEFT SIDEBAR --- */}
      <div className="w-[480px] bg-[#050505] border-r border-white/5 flex flex-col z-30 shadow-2xl flex-shrink-0">
          <div className="h-16 flex items-center px-6 border-b border-white/5">
            <div className="w-6 h-6 bg-cyan-500 rounded-sm flex items-center justify-center mr-3 shadow-[0_0_10px_rgba(34,211,238,0.4)]">
                <Zap size={14} className="text-black fill-current" />
            </div>
            <div>
                <h1 className="text-sm font-black tracking-tighter text-white leading-none">SONICFORGE</h1>
                <p className="text-[9px] text-cyan-500 font-bold tracking-[0.2em] opacity-80 mt-0.5">AI DSP WORKSTATION</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
            {appMode === 'ARCHITECT' && (
                <>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Module Identity</label>
                        <div className="relative group">
                            <input 
                              type="text" 
                              value={pluginName}
                              onChange={(e) => setPluginName(e.target.value)}
                              className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm p-3 pl-4 text-xs font-mono text-cyan-400 focus:border-cyan-500/50 focus:outline-none"
                              placeholder="MyPluginName"
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Architecture Template</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[PluginType.VISUAL_EQ, PluginType.MULTIBAND, PluginType.COMPRESSOR, PluginType.SATURATION, PluginType.SHINE, PluginType.HYBRID_EQ_DYN, PluginType.REVERB, PluginType.DELAY, PluginType.STEREO_IMAGER, PluginType.CHORUS, PluginType.DOUBLER, PluginType.FLANGER].map(type => (
                                <button 
                                key={type}
                                onClick={() => addModule(type)}
                                className="text-xs font-medium text-left px-3 py-3 bg-[#0a0a0a] border border-white/5 rounded-sm hover:border-cyan-500/30 transition-all group"
                                >
                                    <span className="text-neutral-400 group-hover:text-cyan-400 transition-colors">{type.replace('Visual ', '')}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedModuleId && activeModule && (
                        <div className="pt-6 border-t border-white/5 mt-6 animate-in fade-in slide-in-from-left-4">
                             <div className="flex items-center space-x-2 text-white mb-4">
                                <Sliders size={14} className="text-cyan-500" />
                                <span className="text-xs font-bold uppercase">{activeModule.title} Settings</span>
                            </div>
                            <p className="text-[10px] text-neutral-500">
                                Global module settings are available in the Designer panel.
                            </p>
                        </div>
                    )}
                </>
            )}

            {appMode === 'DESIGNER' && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-8">
                     {selectedModuleId && activeModule ? (
                        <>
                            {/* --- ADD ELEMENTS --- */}
                            <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Add Elements</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['KNOB', 'SLIDER', 'SWITCH'].map((type) => (
                                            <button 
                                                key={type}
                                                draggable
                                                onDragStart={(e) => handleSidebarDragStart(e, {
                                                    type: type as any,
                                                    label: type === 'SLIDER' ? 'Fader' : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
                                                    paramId: 'output',
                                                    color: activeModule.color,
                                                    style: 'classic',
                                                    size: 56,
                                                    colSpan: 1,
                                                    orientation: type === 'SLIDER' ? 'vertical' : undefined
                                                })}
                                                onClick={() => addComponentToLayout(activeModule.id, {
                                                    id: generateId(),
                                                    type: type as any,
                                                    label: type === 'SLIDER' ? 'Fader' : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
                                                    paramId: 'output',
                                                    color: activeModule.color,
                                                    style: 'classic',
                                                    size: 56,
                                                    colSpan: 1,
                                                    orientation: type === 'SLIDER' ? 'vertical' : undefined
                                                })}
                                                className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded transition-all group"
                                            >
                                                {type === 'KNOB' && <Activity size={16} className="text-neutral-500 group-hover:text-cyan-500 mb-2" />}
                                                {type === 'SLIDER' && <Sliders size={16} className="text-neutral-500 group-hover:text-cyan-500 mb-2" />}
                                                {type === 'SWITCH' && <ToggleLeft size={16} className="text-neutral-500 group-hover:text-cyan-500 mb-2" />}
                                                <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">{type === 'SLIDER' ? 'Fader' : type.charAt(0) + type.slice(1).toLowerCase()}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button 
                                            draggable
                                            onDragStart={(e) => handleSidebarDragStart(e, { type: 'SECTION', label: 'Group', color: '#ffffff', colSpan: 4, sectionVariant: 'minimal', layoutDirection: 'row', children: [] })}
                                            onClick={() => addComponentToLayout(activeModule.id, { id: generateId(), type: 'SECTION', label: 'Group', color: '#ffffff', colSpan: 4, sectionVariant: 'minimal', layoutDirection: 'row', children: [] })}
                                            className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 rounded transition-all group"
                                        >
                                            <Columns size={16} className="text-neutral-500 group-hover:text-amber-500 mb-2" />
                                            <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Row/Group</span>
                                        </button>
                                        <button 
                                            draggable
                                            onDragStart={(e) => handleSidebarDragStart(e, { type: 'RACK', label: 'Rack', colSpan: 1, rackSplits: 4, rackVariant: 'industrial', height: 400, children: [] })}
                                            onClick={() => addComponentToLayout(activeModule.id, { id: generateId(), type: 'RACK', label: 'Rack', colSpan: 1, rackSplits: 4, rackVariant: 'industrial', height: 400, children: [] })}
                                            className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 rounded transition-all group"
                                        >
                                            <Server size={16} className="text-neutral-500 group-hover:text-purple-300 mb-2" />
                                            <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Rack</span>
                                        </button>
                                        <button 
                                            draggable
                                            onDragStart={(e) => handleSidebarDragStart(e, { type: 'SCREW', label: 'Screw', colSpan: 1 })}
                                            onClick={() => addComponentToLayout(activeModule.id, { id: generateId(), type: 'SCREW', label: 'Screw', colSpan: 1 })}
                                            className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-zinc-500/50 hover:bg-zinc-500/5 rounded transition-all group"
                                        >
                                            <Nut size={16} className="text-neutral-500 group-hover:text-zinc-300 mb-2" />
                                            <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Screw</span>
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button 
                                            draggable
                                            onDragStart={(e) => handleSidebarDragStart(e, { type: 'STEREO_BAR', label: 'Imager', colSpan: 4, height: 32 })}
                                            onClick={() => addComponentToLayout(activeModule.id, { id: generateId(), type: 'STEREO_BAR', label: 'Imager', colSpan: 4, height: 32 })}
                                            className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded transition-all group"
                                        >
                                            <ArrowLeftRight size={16} className="text-neutral-500 group-hover:text-cyan-300 mb-2" />
                                            <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Stereo Bar</span>
                                        </button>
                                    </div>
                            </div>
                            
                            {/* --- STRUCTURE TREE --- */}
                            <div className="space-y-2 border-t border-white/5 pt-4">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block flex items-center justify-between">
                                    <span>Structure</span>
                                    <span className="text-[9px] text-neutral-700">Drag to Reorder</span>
                                </label>
                                <div className="bg-[#080808] border border-white/5 rounded p-2 max-h-64 overflow-y-auto custom-scrollbar">
                                    {activeModule.layout && activeModule.layout.length > 0 ? (
                                        <RenderSidebarTree components={activeModule.layout} moduleId={activeModule.id} ctx={designerContext} />
                                    ) : (
                                        <div className="text-[9px] text-neutral-600 p-2 text-center">Empty Layout</div>
                                    )}
                                </div>
                            </div>

                            {/* --- COMPONENT INSPECTOR (STACKED BELOW STRUCTURE) --- */}
                            {activeComponent && (
                                <div className="animate-in slide-in-from-bottom-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-[10px] font-bold uppercase text-cyan-500 tracking-wider">
                                                Edit {activeComponent.type === 'SECTION' ? 'Group' : activeComponent.type}
                                            </span>
                                            <span className="text-[9px] text-neutral-600 font-mono uppercase">
                                                {activeComponent.id.substring(0,4)}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedComponentId(null)}
                                            className="text-neutral-500 hover:text-white transition-colors"
                                            title="Close Inspector"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    
                                    <div className="bg-[#080808] border border-white/10 rounded-lg p-4 space-y-5 shadow-lg relative">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Label</label>
                                                <input 
                                                    type="text" 
                                                    value={activeComponent.label}
                                                    onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { label: e.target.value })}
                                                    className="w-full bg-black border border-white/10 rounded p-2 text-xs text-white focus:border-cyan-500/50 outline-none transition-colors"
                                                />
                                            </div>
                                            
                                            {activeComponent.type !== 'RACK' && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Width (Col Span)</label>
                                                        <div className="grid grid-cols-4 gap-1">
                                                            {[1, 2, 3, 4].map(span => (
                                                                <button
                                                                    key={span}
                                                                    onClick={() => updateComponent(activeModule.id, activeComponent.id, { colSpan: span })}
                                                                    className={`h-6 border rounded text-[10px] font-bold flex items-center justify-center transition-all
                                                                        {(activeComponent.colSpan || 1) === span 
                                                                            ? 'bg-white text-black border-white' 
                                                                            : 'bg-black border-white/10 text-neutral-500 hover:border-white/30'}
                                                                    `}
                                                                >
                                                                    {span === 4 ? 'F' : span}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                                <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Horz Align</label>
                                                                <div className="flex bg-black border border-white/10 rounded p-0.5">
                                                                {['start', 'center', 'end', 'stretch'].map((a: any) => (
                                                                    <button 
                                                                        key={a}
                                                                        onClick={() => updateComponent(activeModule.id, activeComponent.id, { align: a })}
                                                                        className={`flex-1 h-6 flex items-center justify-center rounded-sm ${activeComponent.align === a || (!activeComponent.align && a === 'center') ? 'bg-white/20 text-white' : 'text-neutral-600'}`}
                                                                        title={a}
                                                                    >
                                                                        {a === 'start' ? <AlignLeft size={10}/> : a === 'end' ? <AlignRight size={10}/> : a === 'stretch' ? <AlignJustify size={10}/> : <AlignCenter size={10}/>}
                                                                    </button>
                                                                ))}
                                                                </div>
                                                        </div>
                                                        <div>
                                                                <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Vert Align</label>
                                                                <div className="flex bg-black border border-white/10 rounded p-0.5">
                                                                {[
                                                                    { val: 'start', icon: <ArrowUpToLine size={10}/> }, 
                                                                    { val: 'center', icon: <AlignCenter size={10} className="rotate-90"/> },
                                                                    { val: 'end', icon: <ArrowDownToLine size={10}/> }, 
                                                                    { val: 'stretch', icon: <ArrowUpDown size={10}/> }
                                                                ].map((opt) => (
                                                                    <button 
                                                                        key={opt.val}
                                                                        onClick={() => updateComponent(activeModule.id, activeComponent.id, { justify: opt.val as any })}
                                                                        className={`flex-1 h-6 flex items-center justify-center rounded-sm ${activeComponent.justify === opt.val || (!activeComponent.justify && opt.val === 'center') ? 'bg-white/20 text-white' : 'text-neutral-600'}`}
                                                                        title={opt.val}
                                                                    >
                                                                        {opt.icon}
                                                                    </button>
                                                                ))}
                                                                </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {activeComponent.type === 'SECTION' && (
                                                <>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Variant</label>
                                                        <select 
                                                            value={activeComponent.sectionVariant || 'card'}
                                                            onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { sectionVariant: e.target.value as SectionVariant })}
                                                            className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none"
                                                        >
                                                            <option value="card">Card (Bordered)</option>
                                                            <option value="solid">Solid (Dark)</option>
                                                            <option value="simple">Simple (Divider)</option>
                                                            <option value="glass_row">Glass Row (Horizontal)</option>
                                                            <option value="minimal">Minimal (Transparent)</option>
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Direction</label>
                                                            <div className="flex bg-black border border-white/10 rounded p-0.5">
                                                                <button 
                                                                    onClick={() => updateComponent(activeModule.id, activeComponent.id, { layoutDirection: 'column' })}
                                                                    className={`flex-1 h-6 flex items-center justify-center rounded-sm ${activeComponent.layoutDirection !== 'row' ? 'bg-white/20 text-white' : 'text-neutral-600'}`}
                                                                >
                                                                    <Grid size={10} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => updateComponent(activeModule.id, activeComponent.id, { layoutDirection: 'row' })}
                                                                    className={`flex-1 h-6 flex items-center justify-center rounded-sm ${activeComponent.layoutDirection === 'row' ? 'bg-white/20 text-white' : 'text-neutral-600'}`}
                                                                >
                                                                    <ArrowLeftRight size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {activeComponent.layoutDirection !== 'row' && (
                                                            <div>
                                                                <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Grid Cols</label>
                                                                <input 
                                                                    type="number" 
                                                                    min="1" max="8"
                                                                    value={activeComponent.gridCols || 4}
                                                                    onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { gridCols: parseInt(e.target.value) })}
                                                                    className="w-full bg-black border border-white/10 rounded p-1 text-center text-white"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                     ) : (
                         <div className="flex flex-col items-center justify-center h-64 text-neutral-600 space-y-3 animate-in fade-in">
                             <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                                 <MousePointer2 size={20} className="opacity-50" />
                             </div>
                             <p className="text-xs">Select a module to design</p>
                         </div>
                     )}
                </div>
            )}
            
            {/* --- ENGINEER MODE (Code Gen) --- */}
             {appMode === 'ENGINEER' && (
                 <div className="space-y-6 animate-in fade-in">
                     <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Export Configuration</label>
                        <textarea 
                            value={userPrompt}
                            onChange={(e) => setUserPrompt(e.target.value)}
                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm p-3 text-xs text-neutral-300 focus:border-cyan-500/50 outline-none h-24 resize-none"
                            placeholder="Describe specific DSP requirements (e.g., 'Use 4x oversampling', 'Add soft clipping to output')..."
                        />
                     </div>
                     
                     <button 
                        onClick={handleGenerateCode}
                        disabled={isGenerating || modules.length === 0}
                        className={`w-full py-3 rounded font-bold uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2 transition-all
                            ${isGenerating ? 'bg-neutral-800 text-neutral-500' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg'}
                        `}
                     >
                         {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Code size={14} />}
                         <span>{isGenerating ? 'Generating Source...' : 'Generate C++ Source'}</span>
                     </button>

                     {generatedCode && (
                        <div className="p-4 bg-green-900/20 border border-green-500/30 rounded flex items-start space-x-3">
                            <Check size={16} className="text-green-500 mt-0.5" />
                            <div>
                                <h3 className="text-xs font-bold text-green-400 mb-1">Code Generated Successfully</h3>
                                <p className="text-[10px] text-green-300/80 leading-relaxed">
                                    Your VST3 source code is ready. Switch to the editor view to inspect the files.
                                </p>
                            </div>
                        </div>
                     )}
                 </div>
             )}
          </div>
      </div>

      {/* --- RIGHT MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col h-full relative bg-[#020202] overflow-hidden">
          
          {/* Top Nav */}
          <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#050505] z-20 shrink-0">
              <div className="flex items-center space-x-4">
                  <button className="flex items-center space-x-2 px-4 py-1.5 bg-white/5 border border-white/5 rounded-full hover:bg-white/10 transition-colors">
                      {audioFile ? <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> : <PlayCircle size={14} className="text-neutral-400" />}
                      <label className="text-[10px] font-bold uppercase tracking-wide cursor-pointer text-neutral-300">
                          {audioFile ? 'Source Loaded' : 'Load Source'}
                          <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                  </button>
              </div>

              <div className="flex bg-[#0a0a0a] border border-white/10 rounded-lg p-1">
                  <button 
                    onClick={() => setAppMode('ARCHITECT')}
                    className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center space-x-2
                        ${appMode === 'ARCHITECT' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}
                    `}
                  >
                      <Cpu size={12} /> <span>Architect</span>
                  </button>
                  <button 
                    onClick={() => setAppMode('DESIGNER')}
                    className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center space-x-2
                        ${appMode === 'DESIGNER' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}
                    `}
                  >
                      <PenTool size={12} /> <span>Designer</span>
                  </button>
                  <button 
                    onClick={() => setAppMode('ENGINEER')}
                    className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center space-x-2
                        ${appMode === 'ENGINEER' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}
                    `}
                  >
                      <Terminal size={12} /> <span>Engineer</span>
                  </button>
              </div>
              
              {canCombine && appMode === 'ARCHITECT' && (
                  <button 
                    onClick={combineSelected}
                    className="flex items-center space-x-2 px-4 py-1.5 bg-yellow-600/20 text-yellow-500 border border-yellow-600/50 rounded hover:bg-yellow-600/30 transition-all animate-pulse"
                  >
                      <Merge size={14} />
                      <span className="text-[10px] font-bold uppercase">Merge Selected ({selectedModules.length})</span>
                  </button>
              )}
              {!canCombine && <div className="w-8"></div>}
          </div>

          {/* Main Workspace */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
              {appMode === 'ENGINEER' ? (
                  <div className="flex-1 overflow-hidden flex">
                      {generatedCode ? (
                          <div className="flex-1 flex flex-col bg-[#050505]">
                               <div className="flex border-b border-white/5">
                                   <div className="px-6 py-3 text-xs font-mono text-cyan-400 border-b-2 border-cyan-500 bg-white/5">PluginProcessor.cpp</div>
                                   <div className="px-6 py-3 text-xs font-mono text-neutral-500 hover:text-neutral-300 cursor-pointer">PluginProcessor.h</div>
                               </div>
                               <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                                   <pre className="font-mono text-[11px] leading-relaxed text-neutral-300 whitespace-pre-wrap">
                                       {generatedCode.cppCode}
                                   </pre>
                               </div>
                          </div>
                      ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 space-y-4">
                              <Terminal size={48} className="opacity-20" />
                              <p className="text-xs uppercase tracking-widest font-bold">No Code Generated Yet</p>
                          </div>
                      )}
                  </div>
              ) : (
                  /* Architect & Designer View */
                  <div 
                    className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-20 custom-scrollbar flex flex-col items-center bg-[radial-gradient(circle_at_center,#111_0%,#020202_100%)]"
                    onClick={() => { setSelectedModuleId(null); setSelectedComponentId(null); }}
                  >
                      {/* Connection Lines Visualization (Simplified) */}
                      {modules.length > 1 && (
                          <div className="absolute inset-0 pointer-events-none overflow-visible z-0 opacity-30">
                               <svg className="w-full h-full">
                                   {modules.map((m, i) => {
                                       if (i === modules.length - 1) return null;
                                       // Approximate positions would need real layout measurement, simpler to just draw a line down the center for now
                                       return (
                                            <line 
                                                key={i}
                                                x1="50%" y1={(i * 450) + 400} // Crude estimation
                                                x2="50%" y2={(i * 450) + 450} 
                                                stroke="#333" 
                                                strokeWidth="2" 
                                                strokeDasharray="4 4"
                                            />
                                       )
                                   })}
                               </svg>
                          </div>
                      )}

                      <div className="w-full max-w-5xl space-y-12 pb-24 z-10">
                          {modules.map((module, idx) => (
                              <div 
                                key={module.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedModuleId(module.id); }}
                                className={`relative transition-all duration-300 group
                                    ${selectedModuleId === module.id ? 'scale-[1.02]' : 'scale-100 opacity-90 hover:opacity-100'}
                                `}
                              >
                                  {/* Module Header */}
                                  <div className={`
                                      absolute -top-8 left-0 flex items-center space-x-3 px-2 transition-all
                                      ${selectedModuleId === module.id ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}
                                  `}>
                                       <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">{String(idx + 1).padStart(2, '0')}</span>
                                       <div className="h-px w-8 bg-cyan-900"></div>
                                       <span className="text-[10px] font-bold uppercase tracking-widest text-white">{module.type}</span>
                                       
                                       {appMode === 'ARCHITECT' && (
                                            <div className="ml-4 flex items-center space-x-1">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); toggleBypass(module.id); }}
                                                    className={`p-1 rounded hover:bg-white/10 ${!module.enabled ? 'text-red-500' : 'text-green-500'}`}
                                                    title="Bypass"
                                                >
                                                    <PlayCircle size={12} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(module.id); }}
                                                    className={`p-1 rounded hover:bg-white/10 ${module.selected ? 'text-yellow-400' : 'text-neutral-600'}`}
                                                    title="Select for Merge"
                                                >
                                                    <Check size={12} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); removeModule(module.id); }}
                                                    className="p-1 rounded hover:bg-white/10 text-neutral-600 hover:text-red-500"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                       )}
                                  </div>

                                  {/* Render Layout (Root) */}
                                  <div 
                                      className={`
                                          bg-[#09090b] rounded-xl border shadow-2xl overflow-hidden relative
                                          ${selectedModuleId === module.id 
                                            ? 'border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.05)] ring-1 ring-cyan-500/20' 
                                            : 'border-[#1a1a1a]'}
                                      `}
                                      onDragOver={(e) => {
                                          if (!module.layout || module.layout.length === 0) {
                                              e.preventDefault();
                                              designerContext.actions.setDragOver({ id: 'ROOT', position: 'inside' });
                                          }
                                      }}
                                      onDrop={(e) => {
                                          if (appMode === 'DESIGNER' && (!module.layout || module.layout.length === 0)) {
                                              designerContext.actions.handleDrop(e, 'ROOT', module.id, 'inside');
                                          }
                                      }}
                                  >
                                      {/* Inner Glow */}
                                      {selectedModuleId === module.id && (
                                          <div className="absolute inset-0 pointer-events-none bg-cyan-500/5 z-0"></div>
                                      )}
                                      
                                      <div className="relative z-10 p-1">
                                          {module.layout && module.layout.length > 0 ? (
                                             /* We map the root components of the layout. Usually it's just one container or branding + rack */
                                             module.layout.map((comp, i) => (
                                                 <div key={comp.id} className="mb-1 last:mb-0">
                                                     <RenderComponent 
                                                        component={comp} 
                                                        module={module} 
                                                        index={i} 
                                                        ctx={designerContext}
                                                     />
                                                 </div>
                                             ))
                                          ) : (
                                              <div className="h-32 flex items-center justify-center border-2 border-dashed border-white/5 rounded-lg m-4">
                                                  <span className="text-xs text-neutral-700 font-bold uppercase tracking-widest">Drop Components Here</span>
                                              </div>
                                          )}
                                      </div>

                                      {/* Corner Accents */}
                                      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/10 rounded-tl pointer-events-none"></div>
                                      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/10 rounded-tr pointer-events-none"></div>
                                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white/10 rounded-bl pointer-events-none"></div>
                                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/10 rounded-br pointer-events-none"></div>
                                  </div>
                              </div>
                          ))}

                          {modules.length === 0 && (
                               <div className="flex flex-col items-center justify-center h-96 text-neutral-600 space-y-6 animate-in fade-in zoom-in-95">
                                   <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/5 shadow-2xl">
                                       <Layers size={48} className="opacity-20" />
                                   </div>
                                   <div className="text-center">
                                       <h2 className="text-xl font-black text-white tracking-tight mb-2">EMPTY WORKSPACE</h2>
                                       <p className="text-xs font-medium text-neutral-500 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
                                           Select a template from the sidebar to begin architecting your plugin.
                                       </p>
                                   </div>
                               </div>
                          )}
                      </div>
                  </div>
              )}
          </div>

          {/* Transport Bar */}
          <Transport 
             isPlaying={isPlaying}
             currentTime={currentTime}
             duration={duration || 180} // Mock duration if no file
             onPlayPause={() => {
                 if (audioRef.current) {
                     if (isPlaying) {
                         audioRef.current.pause();
                         audioEngine.getContext().suspend();
                     } else {
                         audioRef.current.play();
                         audioEngine.resume();
                     }
                     setIsPlaying(!isPlaying);
                 }
             }}
             onSeek={(time) => {
                 if (audioRef.current) {
                     audioRef.current.currentTime = time;
                     setCurrentTime(time);
                 }
             }}
             onRestart={() => {
                 if (audioRef.current) {
                     audioRef.current.currentTime = 0;
                 }
             }}
          />
          {/* Hidden Audio Element */}
          {audioFile && (
              <audio 
                ref={audioRef} 
                src={audioFile} 
                loop 
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration);
                    audioEngine.loadSource(e.currentTarget);
                }}
              />
          )}
      </div>
    </div>
  );
}