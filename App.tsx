

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PluginType, PluginModuleState, GemimiCodeResponse, PluginLayer, VisualizerMode, AudioParamConfig, SaturationMode, ShineMode, UIComponent, UIComponentType, RackVariant, SectionVariant } from './types';
import { PLUGIN_DEFINITIONS, LAYER_TO_PLUGIN_TYPE, createDefaultLayout } from './constants';
import { Knob } from './components/Knob';
import { Slider } from './components/Slider';
import { Switch } from './components/Switch';
import { Screw } from './components/Screw';
import { Rack } from './components/Rack';
import { Visualizer } from './components/Visualizer';
import { VisualEQ } from './components/VisualEQ';
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
  ChevronDown
} from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2, 9);

type AppMode = 'ARCHITECT' | 'DESIGNER' | 'ENGINEER';

type DragPosition = 'left' | 'right' | 'top' | 'bottom' | 'inside';

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
                absolute z-50 bg-cyan-500/60 border-2 border-cyan-400 rounded-sm animate-in fade-in zoom-in-95 pointer-events-none shadow-[0_0_15px_rgba(34,211,238,0.5)]
                ${position === 'top' ? 'top-0 left-0 right-0 h-1.5' : ''}
                ${position === 'bottom' ? 'bottom-0 left-0 right-0 h-1.5' : ''}
                ${position === 'left' ? 'left-0 top-0 bottom-0 w-1.5' : ''}
                ${position === 'right' ? 'right-0 top-0 bottom-0 w-1.5' : ''}
                ${position === 'inside' ? 'inset-0 bg-cyan-500/20 border-dashed border-4' : ''}
            `}
        >
            {position === 'inside' && (
                <div className="absolute inset-0 flex items-center justify-center">
                     <CornerDownRight size={24} className="text-cyan-400 drop-shadow-lg" />
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

                const edge = Math.min(40, Math.min(w, h) * 0.25); 
                
                let pos: DragPosition = 'inside';

                if (y < edge) pos = 'top';
                else if (y > h - edge) pos = 'bottom';
                else if (x < edge) pos = 'left';
                else if (x > w - edge) pos = 'right';
                else pos = 'inside';

                if (ctx.dragOverInfo?.id !== component.id || ctx.dragOverInfo?.position !== pos) {
                    ctx.actions.setDragOver({ id: component.id, position: pos });
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (ctx.appMode === 'DESIGNER' && ctx.draggedComponentId && ctx.draggedComponentId !== component.id) {
                     if (component.type === 'RACK' && ctx.dragOverInfo?.position === 'inside') {
                          ctx.actions.handleDrop(e, component.id, module.id, 'inside');
                     } else {
                         const pos = ctx.dragOverInfo?.id === component.id && ctx.dragOverInfo?.position ? ctx.dragOverInfo.position : 'inside';
                         ctx.actions.handleDrop(e, component.id, module.id, pos);
                     }
                }
                ctx.actions.setDragOver(null);
            }}
            className={`relative transition-all duration-200 flex flex-col ${alignClass} ${justifyClass}
                ${isSelected ? 'ring-1 ring-cyan-500/50 bg-cyan-500/5 rounded-sm' : ''} 
                ${ctx.appMode === 'DESIGNER' ? 'cursor-grab active:cursor-grabbing hover:bg-white/5 rounded-sm' : ''}
                ${isDragging ? 'opacity-40 scale-95' : ''}
                ${colClass}
                ${parentLayout === 'flex' ? 'flex-1 min-w-0' : ''}
            `}
            style={{ 
                height: component.type === 'VISUALIZER' ? (component.height || 280) : (component.type === 'SPACER' || component.type === 'BRANDING' ? (component.height || 24) : (component.type === 'RACK' ? 'auto' : 'auto')),
            }}
        >
            {ctx.dragOverInfo?.id === component.id && (
                <DropZone position={ctx.dragOverInfo.position} />
            )}

            {component.type === 'KNOB' && component.paramId && (
                <div className="p-1 pointer-events-none">
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
                <div className="p-2 h-full flex items-center justify-center w-full pointer-events-none">
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
                <div className="p-1 w-full h-full flex items-center justify-center pointer-events-none">
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
                                component.paramId === 'shineMode' ? (module.shineMode || 'AIR') : ''
                            }
                            onChange={(e) => {
                                if (component.paramId === 'saturationMode') ctx.actions.updateModule(module.id, { saturationMode: e.target.value as any });
                                if (component.paramId === 'shineMode') ctx.actions.updateModule(module.id, { shineMode: e.target.value as any });
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

            {component.type === 'VISUALIZER' && (
                <div className="w-full h-full pointer-events-auto">
                    <VisualEQ 
                        module={module} 
                        onChangeParam={(p, v) => ctx.actions.updateParam(module.id, p, v)} 
                        onLayerChange={(layer) => ctx.actions.updateModule(module.id, { activeLayer: layer })} 
                    />
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
                                    {ctx.dragOverInfo?.id === `${component.id}-slot-${slotIdx}` && (
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
                            ${component.layoutDirection === 'row' ? 'flex flex-row items-center space-x-2' : 'grid gap-2'}
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
      nestedModules,
      params: def.params.reduce((acc, p) => ({ ...acc, [p.id]: p.value }), {}),
      activeLayer: PluginLayer.EQ,
      saturationMode: 'TUBE',
      shineMode: 'AIR',
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

  const handleComponentDrop = (e: React.DragEvent, targetId: string, moduleId: string, position: DragPosition | 'at_index', index?: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverInfo(null);
      
      if (!draggedComponentId || draggedComponentId === targetId) {
          setDraggedComponentId(null);
          return;
      }

      setModules(prev => prev.map(m => {
          if (m.id !== moduleId || !m.layout) return m;

          const targetNode = findComponent(m.layout, targetId);
          const isTargetContainer = targetNode && (targetNode.type === 'SECTION' || targetNode.type === 'RACK');
          
          // 1. If dropping 'inside' a leaf node (e.g., Knob, Slider), GROUP them.
          if (position === 'inside' && !isTargetContainer && targetNode) {
               const { node, newNodes } = removeNode(m.layout, draggedComponentId);
               if (!node) return m;

               // Create Group wrapping both
               const newGroup: UIComponent = {
                   id: generateId(),
                   type: 'SECTION',
                   label: 'Group',
                   children: [targetNode, node],
                   colSpan: targetNode.colSpan || 1,
                   sectionVariant: 'minimal',
                   layoutDirection: 'row', // Default to side-by-side stacking
                   gridCols: 4
               };
               
               // Replace targetNode with newGroup in tree
               // We need to use the newNodes tree (where 'node' is already removed)
               const finalLayout = replaceNode(newNodes, targetId, newGroup);
               return { ...m, layout: finalLayout };
          }

          const parent = findParent(m.layout, targetId);
          const parentIsRack = parent?.type === 'RACK';
          
          const { node, newNodes } = removeNode(m.layout, draggedComponentId);
          if (!node) return m;

          // Auto-Grouping Logic for Racks (Side-by-side)
          if (parentIsRack && (position === 'left' || position === 'right')) {
               const swapNodes = (list: UIComponent[]): UIComponent[] => {
                   return list.map(n => {
                       if (n.id === targetId) {
                           if (n.type === 'SECTION' && n.layoutDirection === 'row') {
                               return { 
                                   ...n, 
                                   children: position === 'left' 
                                       ? [node, ...(n.children || [])]
                                       : [...(n.children || []), node]
                               };
                           }
                           return {
                               id: generateId(),
                               type: 'SECTION',
                               label: 'Group',
                               colSpan: 1,
                               layoutDirection: 'row',
                               sectionVariant: 'minimal',
                               children: position === 'left' ? [node, n] : [n, node]
                           };
                       }
                       if (n.children) return { ...n, children: swapNodes(n.children) };
                       return n;
                   });
               }
               return { ...m, layout: swapNodes(newNodes) };
          }

          let insertPos: 'before' | 'after' | 'inside' | 'at_index' = 'inside';
          if (position === 'at_index') insertPos = 'at_index';
          else if (position === 'left' || position === 'top') insertPos = 'before';
          else if (position === 'right' || position === 'bottom') insertPos = 'after';
          else insertPos = 'inside'; 

          const finalNodes = insertNode(newNodes, targetId, node, insertPos, index);
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
  }, [modules.length, modules.map(m => m.id).join(','), modules.map(m => m.enabled).join(','), modules.map(m => m.saturationMode).join(','), modules.map(m => m.shineMode).join(',')]);

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
                            {[PluginType.VISUAL_EQ, PluginType.MULTIBAND, PluginType.COMPRESSOR, PluginType.SATURATION, PluginType.SHINE, PluginType.HYBRID_EQ_DYN, PluginType.REVERB, PluginType.DELAY].map(type => (
                                <button 
                                key={type}
                                onClick={() => addModule(type)}
                                className="text-xs font-medium text-left px-3 py-3 bg-[#0a0a0a] border border-white/5 rounded-sm hover:border-cyan-500/30 transition-all"
                                >
                                    <span className="text-neutral-400 hover:text-cyan-400">{type.replace('Visual ', '')}</span>
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
                            {/* Controls are now inside the module layout via DROPDOWNs */}
                            <p className="text-[10px] text-neutral-500">
                                Global module settings (like Modes) are now available directly on the module controls panel.
                            </p>
                        </div>
                    )}
                </>
            )}

            {appMode === 'DESIGNER' && (
                <div className="animate-in fade-in slide-in-from-right-4 space-y-8">
                     {selectedModuleId && activeModule ? (
                        <>
                            {/* --- COMPONENT EDIT MODE --- */}
                            {activeComponent ? (
                                <div className="bg-[#0a0a0a] border border-white/10 rounded-sm p-4 space-y-5 relative animate-in slide-in-from-right-8 shadow-xl">
                                    <button 
                                        onClick={() => setSelectedComponentId(null)}
                                        className="flex items-center space-x-1 text-neutral-500 hover:text-white text-[10px] font-bold uppercase tracking-wider mb-2"
                                    >
                                        <ChevronLeft size={12} />
                                        <span>Back to Layout</span>
                                    </button>
                                    
                                    <div className="flex items-center space-x-2 text-white mb-2 border-b border-white/5 pb-2">
                                        <span className="text-xs font-bold uppercase">Edit {activeComponent.type}</span>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Label</label>
                                            <input 
                                                type="text" 
                                                value={activeComponent.label}
                                                onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { label: e.target.value })}
                                                className="w-full bg-black border border-white/10 rounded p-2 text-xs text-white focus:border-cyan-500/50 outline-none"
                                            />
                                        </div>
                                        
                                        {activeComponent.type !== 'RACK' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Width (Col Span)</label>
                                                    <div className="grid grid-cols-4 gap-1">
                                                        {[1, 2, 3, 4].map(span => (
                                                            <button
                                                                key={span}
                                                                onClick={() => updateComponent(activeModule.id, activeComponent.id, { colSpan: span })}
                                                                className={`h-6 border rounded text-[10px] font-bold flex items-center justify-center transition-all
                                                                    ${(activeComponent.colSpan || 1) === span 
                                                                        ? 'bg-white text-black border-white' 
                                                                        : 'bg-black border-white/10 text-neutral-500 hover:border-white/30'}
                                                                `}
                                                            >
                                                                {span === 4 ? 'F' : span}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                     <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Alignment</label>
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
                                                                className="w-full bg-black border border-white/10 rounded p-1.5 text-xs text-white text-center"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {activeComponent.type === 'RACK' && (
                                            <>
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Rack Style</label>
                                                    <select 
                                                        value={activeComponent.rackVariant || 'basic'}
                                                        onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { rackVariant: e.target.value as RackVariant })}
                                                        className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none"
                                                    >
                                                        <option value="basic">Basic (Dark)</option>
                                                        <option value="industrial">Industrial (Texture)</option>
                                                        <option value="metal">Brushed Metal</option>
                                                        <option value="framed">Framed</option>
                                                        <option value="cyber">Cyber (Neon Grid)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Slots (Rows)</label>
                                                    <div className="flex items-center space-x-2">
                                                        {[1, 2, 3, 4, 6].map(n => (
                                                            <button
                                                                key={n}
                                                                onClick={() => updateComponent(activeModule.id, activeComponent.id, { rackSplits: n })}
                                                                className={`w-8 h-8 border rounded text-xs font-bold flex items-center justify-center
                                                                    {(activeComponent.rackSplits || 4) === n ? 'bg-white text-black' : 'bg-black border-white/10 text-neutral-500'}
                                                                `}
                                                            >
                                                                {n}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Height (px)</label>
                                                    <input 
                                                        type="number" 
                                                        value={activeComponent.height || 400}
                                                        onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { height: parseInt(e.target.value) })}
                                                        className="w-full bg-black border border-white/10 rounded p-2 text-xs text-white"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {(activeComponent.type === 'KNOB' || activeComponent.type === 'SLIDER' || activeComponent.type === 'SWITCH' || activeComponent.type === 'SCREW' || activeComponent.type === 'DROPDOWN') && (
                                            <>
                                                {(activeComponent.type !== 'DROPDOWN') && (
                                                <div>
                                                    <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Parameter Link</label>
                                                    <select 
                                                        value={activeComponent.paramId}
                                                        onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { paramId: e.target.value })}
                                                        className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none focus:border-cyan-500/50"
                                                    >
                                                        {PLUGIN_DEFINITIONS[activeModule.type].params.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                )}
                                                
                                                {(activeComponent.type === 'KNOB' || activeComponent.type === 'SCREW') && (
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Size (px)</label>
                                                        <input 
                                                            type="number" 
                                                            value={activeComponent.size || (activeComponent.type === 'KNOB' ? 56 : 14)}
                                                            onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { size: parseInt(e.target.value) })}
                                                            className="w-full bg-black border border-white/10 rounded p-2 text-xs text-white"
                                                        />
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-4">
                                                    {(activeComponent.type !== 'DROPDOWN') && (
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Style</label>
                                                        <select 
                                                            value={activeComponent.style || 'classic'}
                                                            onChange={(e) => updateComponent(activeModule.id, activeComponent.id, { style: e.target.value as any })}
                                                            className="w-full bg-black border border-white/10 rounded p-2 text-xs text-gray-300 outline-none"
                                                        >
                                                            <option value="classic">Classic</option>
                                                            <option value="soft">Soft/Flat</option>
                                                            <option value="tech">Tech</option>
                                                            <option value="cyber">Cyber (Neon)</option>
                                                            <option value="ring">Ring (Glow)</option>
                                                            <option value="analog">Analog (Real)</option>
                                                        </select>
                                                    </div>
                                                    )}
                                                    <ColorPicker 
                                                        label="Accent Color"
                                                        value={activeComponent.color || '#3b82f6'}
                                                        onChange={(c) => updateComponent(activeModule.id, activeComponent.id, { color: c })}
                                                    />
                                                </div>
                                                
                                                {activeComponent.type === 'SLIDER' && (
                                                    <div>
                                                        <label className="text-[9px] text-neutral-500 uppercase font-bold block mb-1">Orientation</label>
                                                        <div className="flex bg-black border border-white/10 rounded p-1">
                                                            <button onClick={() => updateComponent(activeModule.id, activeComponent.id, { orientation: 'vertical' })} className={`flex-1 text-xs py-1 ${activeComponent.orientation !== 'horizontal' ? 'bg-white/20' : ''}`}>Vert</button>
                                                            <button onClick={() => updateComponent(activeModule.id, activeComponent.id, { orientation: 'horizontal' })} className={`flex-1 text-xs py-1 ${activeComponent.orientation === 'horizontal' ? 'bg-white/20' : ''}`}>Horz</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className="pt-4 border-t border-white/5 mt-4">
                                        <button 
                                            onClick={() => removeComponent(activeModule.id, activeComponent.id)}
                                            className="w-full flex items-center justify-center space-x-2 py-3 bg-red-900/10 hover:bg-red-900/30 border border-red-900/20 hover:border-red-500/50 text-red-400 rounded text-xs font-bold transition-all"
                                        >
                                            <Trash2 size={12} />
                                            <span>Delete Component</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* --- MODULE SETTINGS & LAYOUT --- */}
                                    <div className="space-y-6 animate-in slide-in-from-left-4">
                                        {/* REMOVED SIDEBAR MODULE SETTINGS (NOW IN MODULE UI) */}

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Add Elements</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'KNOB',
                                                        label: 'Knob',
                                                        paramId: 'output',
                                                        color: activeModule.color,
                                                        style: 'classic',
                                                        size: 56,
                                                        colSpan: 1
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 rounded transition-all group"
                                                >
                                                    <Activity size={16} className="text-neutral-500 group-hover:text-purple-500 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Knob</span>
                                                </button>
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'SLIDER',
                                                        label: 'Fader',
                                                        paramId: 'output',
                                                        color: activeModule.color,
                                                        style: 'classic',
                                                        colSpan: 1,
                                                        orientation: 'vertical'
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 rounded transition-all group"
                                                >
                                                    <Sliders size={16} className="text-neutral-500 group-hover:text-blue-500 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Slider</span>
                                                </button>
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'SWITCH',
                                                        label: 'Switch',
                                                        paramId: 'output',
                                                        color: activeModule.color,
                                                        style: 'classic',
                                                        colSpan: 1
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-green-500/50 hover:bg-green-500/5 rounded transition-all group"
                                                >
                                                    <ToggleLeft size={16} className="text-neutral-500 group-hover:text-green-500 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Switch</span>
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 mt-2">
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'SECTION',
                                                        label: 'Group',
                                                        color: '#ffffff',
                                                        colSpan: 4,
                                                        sectionVariant: 'minimal',
                                                        layoutDirection: 'row', // Default to horizontal for grouping
                                                        children: []
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 rounded transition-all group"
                                                >
                                                    <Columns size={16} className="text-neutral-500 group-hover:text-amber-500 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Row/Group</span>
                                                </button>
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'RACK',
                                                        label: 'Rack',
                                                        colSpan: 1,
                                                        rackSplits: 4,
                                                        rackVariant: 'industrial',
                                                        height: 400,
                                                        children: []
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 rounded transition-all group"
                                                >
                                                    <Server size={16} className="text-neutral-500 group-hover:text-cyan-300 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Rack</span>
                                                </button>
                                                <button 
                                                    onClick={() => addComponentToLayout(activeModule.id, {
                                                        id: generateId(),
                                                        type: 'SCREW',
                                                        label: 'Screw',
                                                        colSpan: 1
                                                    })}
                                                    className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-white/10 hover:border-zinc-500/50 hover:bg-zinc-500/5 rounded transition-all group"
                                                >
                                                    <Nut size={16} className="text-neutral-500 group-hover:text-zinc-300 mb-2" />
                                                    <span className="text-[10px] font-bold text-neutral-400 group-hover:text-white">Screw</span>
                                                </button>
                                            </div>
                                        </div>
                                        
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
                                    </div>
                                </>
                            )}
                        </>
                     ) : (
                         <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
                             <p className="text-xs text-neutral-500">Select a module to edit design</p>
                         </div>
                     )}
                </div>
            )}
          </div>

          <div className="p-6 border-t border-white/5 bg-[#050505]">
              <button 
                  onClick={handleGenerateCode}
                  disabled={isGenerating || modules.length === 0}
                  className="w-full h-14 bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-500/30 rounded flex items-center justify-center space-x-2 transition-all text-cyan-100 uppercase font-bold tracking-wider text-xs"
              >
                  {isGenerating ? <Loader2 className="animate-spin" size={16}/> : <Cpu size={16}/>}
                  <span>{isGenerating ? 'Generating...' : 'Generate Plugin Source'}</span>
              </button>
          </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#020202] relative">
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#050505] shrink-0 z-20">
             <div className="flex items-center space-x-4">
                 <div className="relative group">
                    <input type="file" accept="audio/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                    <button className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all ${audioFile ? 'bg-cyan-950/30 border-cyan-900 text-cyan-400' : 'bg-[#0a0a0a] border-white/5 text-neutral-500'}`}>
                        <PlayCircle size={14} /> <span className="text-[10px] font-bold uppercase tracking-wider">Source</span>
                    </button>
                 </div>
                 {audioFile && <audio ref={audioRef} src={audioFile} onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => {setDuration(audioRef.current?.duration || 0); audioEngine.loadSource(audioRef.current!);}} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} className="hidden" />}
             </div>

             <div className="flex items-center bg-[#0a0a0a] p-1 rounded-full border border-white/5">
                {['ARCHITECT', 'DESIGNER', 'ENGINEER'].map(mode => (
                    <button key={mode} onClick={() => setAppMode(mode as AppMode)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${appMode === mode ? 'bg-neutral-800 text-white' : 'text-neutral-600 hover:text-neutral-400'}`}>{mode}</button>
                ))}
             </div>
             <div className="w-24"></div>
        </div>

        {appMode === 'ARCHITECT' && selectedModules.length > 0 && (
            <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-[#09090b] border border-white/10 px-6 py-3 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center space-x-6 z-50 animate-in slide-in-from-top-4 fade-in border-t border-white/20 backdrop-blur-xl">
                 <span className="text-xs font-bold text-white flex items-center">
                     <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-black text-[10px] mr-2">{selectedModules.length}</div>
                     Selected
                 </span>
                 <div className="h-4 w-px bg-white/10"></div>
                 <button 
                    onClick={combineSelected}
                    disabled={!canCombine}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all
                        ${canCombine 
                            ? 'bg-amber-500 text-black hover:bg-amber-400' 
                            : 'bg-white/5 text-neutral-600 cursor-not-allowed'}
                    `}
                 >
                     <GitMerge size={14} />
                     <span>Merge</span>
                 </button>
                 <button 
                     onClick={clearSelection}
                     className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                 >
                     <X size={14} />
                 </button>
            </div>
        )}

        <div className="flex-1 relative overflow-y-auto custom-scrollbar p-10 bg-[#020202]">
             {(appMode === 'ARCHITECT' || appMode === 'DESIGNER') && modules.length > 0 && (
                 <div className="max-w-6xl mx-auto space-y-8 pb-32">
                     
                     <div className={`transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden ${isPlaying ? 'max-h-[300px] opacity-100 mb-8 translate-y-0' : 'max-h-0 opacity-0 mb-0 -translate-y-4'}`}>
                         <div className="bg-[#050505] rounded border border-white/5 shadow-2xl p-4 relative">
                             <Visualizer mode={visualizerMode} />
                         </div>
                     </div>

                     <div className="space-y-4">
                        {modules.map((module) => (
                            <div 
                                key={module.id} 
                                onClick={() => selectForSidebar(module.id)}
                                className={`bg-[#080808] rounded border transition-all relative overflow-hidden
                                    ${selectedModuleId === module.id ? 'border-cyan-500/30 shadow-lg shadow-cyan-900/10' : 'border-white/5 hover:border-white/10'}
                                    ${module.selected ? 'ring-2 ring-amber-500/50 border-amber-500/50' : ''}
                                `}
                            >
                                <div className="h-10 flex items-center justify-between px-4 border-b border-white/5 bg-white/[0.01]">
                                    <div className="flex items-center space-x-3">
                                        <button onClick={(e) => {e.stopPropagation(); toggleBypass(module.id)}} className={`w-2.5 h-2.5 rounded-full ${module.enabled ? 'shadow-[0_0_8px_currentColor]' : 'bg-neutral-800'}`} style={{ backgroundColor: module.enabled ? module.color : '' }} />
                                        <span className="text-[11px] font-bold text-gray-300 tracking-widest uppercase">{module.title || module.type}</span>
                                    </div>
                                    {appMode === 'ARCHITECT' && (
                                        <div className="flex items-center space-x-2 z-20">
                                             <button onClick={(e) => { e.stopPropagation(); toggleSelection(module.id); }} className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border transition-colors ${module.selected ? 'bg-amber-500 text-black border-amber-500' : 'border-white/10 text-neutral-400 hover:bg-white/10'}`}>
                                                 {module.selected ? <Check size={12}/> : 'Select'}
                                             </button>
                                             <button onClick={(e) => { e.stopPropagation(); removeModule(module.id); }} className="text-neutral-700 hover:text-red-500 p-1"><X size={12} /></button>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6">
                                    <div className="grid grid-cols-4 gap-4 items-start">
                                        {module.layout ? module.layout.map((comp, i) => (
                                            <RenderComponent key={comp.id} component={comp} module={module} index={i} ctx={designerContext} />
                                        )) : (
                                            <div className="col-span-4 text-center text-neutral-600 text-xs">No layout defined</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>
             )}
             
             {modules.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center text-neutral-500">
                     <Box size={48} className="mb-4 opacity-20"/>
                     <p className="text-sm">Add a module from the architect panel to begin.</p>
                 </div>
             )}

            {appMode === 'ENGINEER' && generatedCode && (
                <div className="max-w-6xl mx-auto grid grid-cols-2 gap-6 h-[600px]">
                    <div className="bg-[#080808] border border-white/5 rounded p-4 flex flex-col"><h3 className="text-xs font-bold text-neutral-400 mb-2">HEADER</h3><pre className="flex-1 overflow-auto text-[10px] font-mono text-neutral-400">{generatedCode.headerCode}</pre></div>
                    <div className="bg-[#080808] border border-white/5 rounded p-4 flex flex-col"><h3 className="text-xs font-bold text-neutral-400 mb-2">SOURCE</h3><pre className="flex-1 overflow-auto text-[10px] font-mono text-cyan-100/80">{generatedCode.cppCode}</pre></div>
                </div>
            )}
        </div>

        <Transport isPlaying={isPlaying} currentTime={currentTime} duration={duration} onPlayPause={() => {if(audioRef.current){ if(isPlaying) audioRef.current.pause(); else audioRef.current.play(); }}} onRestart={() => {if(audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); }}} onSeek={(t) => {if(audioRef.current) audioRef.current.currentTime = t;}} />
      </div>
    </div>
  );
}