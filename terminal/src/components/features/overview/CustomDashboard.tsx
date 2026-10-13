'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { APPEARANCE_PRESETS, LAYOUT_KEY, WIDGETS, moveWidget, normalizeLayout, type DashboardLayout, type PanelAppearance, type WidgetId } from '@/lib/dashboardLayout';
import { Panel, PanelHeader } from '@/components/primitives';
import { useQueryState } from 'nuqs';
import { DEFAULT_TIMEFRAME, resolveTimeframe } from '@/lib/nav';
import { FOCUS_PROFILES, focusLayout, type ResearchFocus, type FocusKind } from '@/lib/researchWorkspace';
import { ResearchFocusContext } from './ResearchFocusContext';
import { WorkspaceLibrary } from './WorkspaceLibrary';
import { readWorkspace, writeWorkspace, subscribeWorkspace } from '@/lib/clientWorkspaceStore';
import { adjustPane, positionPanes, PANE_ROW_HEIGHT } from '@/lib/paneGeometry';

export function CustomDashboard({ widgets, development, summary }: { widgets: Partial<Record<WidgetId, ReactNode>>; development: boolean; summary?: ReactNode }) {
  const fallback = JSON.stringify(normalizeLayout(null,development));
  const raw = useSyncExternalStore(callback=>subscribeWorkspace(LAYOUT_KEY,callback), () => readWorkspace(LAYOUT_KEY,fallback), () => fallback);
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const saved = normalizeLayout(parsed, development);
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const editor = useRef<HTMLDialogElement>(null);
  const drag = useRef<WidgetId | null>(null);
  const [tf,setTf]=useQueryState('tf',{defaultValue:DEFAULT_TIMEFRAME,clearOnDefault:true,shallow:false});
  const [pendingFocus,setPendingFocus]=useState<ResearchFocus|null>(null);
  const focusBar=useRef<HTMLElement>(null);
  const [session,setSession]=useState<{context:ResearchFocus;layout:DashboardLayout;originalTimeframe:string}|null>(null);
  const [maximized,setMaximized]=useState<WidgetId|null>(null);
  const grid=useRef<HTMLDivElement>(null);
  const [gestureLayout,setGestureLayout]=useState<DashboardLayout|null>(null);
  const [activePane,setActivePane]=useState<WidgetId|null>(null);
  const gesture=useRef<{id:WidgetId;mode:'move'|'resize';base:DashboardLayout;next:DashboardLayout;startX:number;startY:number;columnStep:number;rowStep:number}|null>(null);
  useEffect(()=>{if(!maximized)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!editor.current?.open)setMaximized(null);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[maximized]);
  const layout = gestureLayout ?? draft ?? session?.layout ?? saved;
  const positioned = layout.widgets.some(w=>w.visible&&w.position) ? positionPanes(layout) : layout;
  const requestFocus=(next:ResearchFocus)=>{setPendingFocus(next);focusBar.current?.scrollIntoView({block:'start'});};
  const persist=(next:DashboardLayout)=>{
    const stored=writeWorkspace(LAYOUT_KEY,JSON.stringify(next));
    setStorageMessage(stored?'Layout saved on this browser.':'Layout saved for this session; browser storage is unavailable.');
  };
  const commitGeometry=(next:DashboardLayout)=>{
    if(session)setSession({...session,layout:next});else persist(next);
  };
  const measuredLayout=()=>{
    if(!grid.current)return positionPanes(layout);
    if(layout.widgets.some(w=>w.visible&&w.position))return positionPanes(layout);
    const bounds=grid.current.getBoundingClientRect(),gap=parseFloat(getComputedStyle(grid.current).columnGap)||0;
    const columnStep=(bounds.width+gap)/12,rowStep=PANE_ROW_HEIGHT+gap;
    return positionPanes({...layout,widgets:layout.widgets.map(w=>{
      const element=grid.current?.querySelector<HTMLElement>(`[data-widget="${w.id}"]`);
      if(!element)return w;
      const rect=element.getBoundingClientRect();
      return {...w,size:Math.max(2,Math.min(12,Math.round((rect.width+gap)/columnStep))),position:{x:Math.max(0,Math.min(12-w.size,Math.round((rect.left-bounds.left)/columnStep))),y:Math.max(0,Math.min(200,Math.round((rect.top-bounds.top)/rowStep))),rows:Math.max(4,Math.min(40,Math.ceil((rect.height+gap)/rowStep)))}};
    })});
  };
  const startGesture=(e:PointerEvent<HTMLButtonElement>,id:WidgetId,mode:'move'|'resize')=>{
    if(e.button!==0||maximized||!grid.current||window.innerWidth<=768)return;
    e.preventDefault();
    const base=measuredLayout(),gap=parseFloat(getComputedStyle(grid.current).columnGap)||0;
    gesture.current={id,mode,base,next:base,startX:e.clientX,startY:e.clientY,columnStep:(grid.current.getBoundingClientRect().width+gap)/12,rowStep:PANE_ROW_HEIGHT+gap};
    setActivePane(id);setGestureLayout(base);e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveGesture=(e:PointerEvent<HTMLButtonElement>)=>{
    const g=gesture.current;if(!g)return;
    const w=g.base.widgets.find(w=>w.id===g.id)!;
    const dx=Math.round((e.clientX-g.startX)/g.columnStep),dy=Math.round((e.clientY-g.startY)/g.rowStep);
    g.next=adjustPane(g.base,g.id,g.mode==='move'?{x:w.position!.x+dx,y:w.position!.y+dy}:{size:w.size+dx,rows:w.position!.rows+dy});
    setGestureLayout(g.next);
  };
  const finishGesture=(e:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const g=gesture.current;gesture.current=null;setGestureLayout(null);setActivePane(null);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    if(g&&!cancel)commitGeometry(g.next);
  };
  const keyGeometry=(e:ReactKeyboardEvent<HTMLButtonElement>,id:WidgetId,mode:'move'|'resize')=>{
    if(e.key==='Escape'&&gesture.current){gesture.current=null;setGestureLayout(null);setActivePane(null);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||maximized||window.innerWidth<=768)return;
    e.preventDefault();const base=measuredLayout(),w=base.widgets.find(w=>w.id===id)!;
    const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    commitGeometry(adjustPane(base,id,mode==='move'?{x:w.position!.x+dx,y:w.position!.y+dy}:{size:w.size+dx,rows:w.position!.rows+dy}));
  };
  const changePane=(id:WidgetId,patch:Partial<DashboardLayout['widgets'][number]>)=>{
    const next={...layout,widgets:layout.widgets.map(w=>w.id===id?{...w,...patch}:w)};
    if(session){setSession({...session,layout:next});if(patch.pinned!==undefined)persist({...saved,widgets:saved.widgets.map(w=>w.id===id?{...w,pinned:patch.pinned,visible:patch.pinned?true:w.visible}:w)});}
    else persist(next);
  };
  const applyFocus=()=>{
    if(!pendingFocus)return;
    setSession({context:pendingFocus,layout:focusLayout(session?.layout??saved,pendingFocus.kind),originalTimeframe:session?.originalTimeframe??resolveTimeframe(tf)});
    setMaximized(null);setPendingFocus(null);void setTf(FOCUS_PROFILES[pendingFocus.kind].timeframe);
  };
  const exitFocus=()=>{const original=session?.originalTimeframe;setSession(null);setPendingFocus(null);setMaximized(null);if(original)void setTf(original);};
  const appearance = layout.appearance;
  const restyle = (patch: Partial<PanelAppearance>) => setDraft({...layout,appearance:{...appearance,...patch}});
  const preset = Object.keys(APPEARANCE_PRESETS).find((key) => JSON.stringify(APPEARANCE_PRESETS[key]) === JSON.stringify(appearance)) ?? 'custom';
  const label = (id: WidgetId) => WIDGETS.find((w) => w.id === id)!.label;
  const update = (id: WidgetId, patch: Partial<DashboardLayout['widgets'][number]>) => setDraft({...layout, widgets: layout.widgets.map((w) => w.id === id ? {...w, ...patch} : w)});
  const save = () => {persist(layout);setDraft(null);editor.current?.close();};
  return <ResearchFocusContext.Provider value={{focus:session?.context??null,investigate:event=>requestFocus({kind:'news',event})}}><div className={`overview-dashboard density-${layout.density}`} data-frame={appearance.frame} data-header={appearance.header} data-signals={appearance.signalCuts}
    style={{'--panel-cut':`${appearance.corners}px`,'--frame-accent':`var(--${appearance.accent})`,'--widget-gap':`${appearance.spacing}px`} as CSSProperties}>
    {summary}
    <section ref={focusBar} className="research-focus-bar" aria-label="IRIS Focus Mode">
      <div><strong>IRIS FOCUS MODE</strong><span>{session?FOCUS_PROFILES[session.context.kind].label:'Personal workspace'}</span></div>
      <select aria-label="Research focus" value={pendingFocus?.kind??session?.context.kind??''} onChange={e=>{if(e.target.value)requestFocus({kind:e.target.value as FocusKind});}}><option value="">Choose an investigation…</option>{Object.entries(FOCUS_PROFILES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select>
      {session&&<button onClick={exitFocus}>Exit Focus</button>}
      {session?.context.event&&<p className="research-event-context"><strong>Investigating: {session.context.event.title}</strong><span>{new Date(session.context.event.publishedAt).toISOString().replace('T',' ').slice(0,16)} UTC · publication time, not proof of market impact</span></p>}
      {pendingFocus&&<div className="research-focus-preview" role="status"><span>Preview: {FOCUS_PROFILES[pendingFocus.kind].label} · {FOCUS_PROFILES[pendingFocus.kind].timeframe} · {FOCUS_PROFILES[pendingFocus.kind].widgets.map(id=>WIDGETS.find(w=>w.id===id)!.label).join(', ')}. Pinned panels stay available.</span><button onClick={applyFocus}>Apply Focus</button><button onClick={()=>setPendingFocus(null)}>Cancel preview</button></div>}
    </section>
    <WorkspaceLibrary development={development} layout={layout} timeframe={resolveTimeframe(tf)} disabled={!!session||!!draft} onLoad={(next,timeframe)=>{persist(next);setMaximized(null);void setTf(timeframe);}} />
    <div className="dashboard-toolbar"><div><strong>YOUR WORKSPACE</strong><span>{layout.widgets.filter((w) => w.visible).length} widgets · {draft ? 'Previewing changes' : session?'Focus layout · temporary':'Personal layout'}</span></div>
      {layout.widgets.some(w=>w.position)&&<button onClick={()=>commitGeometry({...layout,widgets:layout.widgets.map(w=>w.pinned?w:{...w,position:undefined})})}>Auto arrange</button>}
      <button className="dashboard-customize" disabled={!!session} title={session?'Exit Focus to edit your personal layout':undefined} onClick={() => { setDraft(saved); editor.current?.showModal(); }}>Customize dashboard</button></div>
    <p role="status" className="dashboard-save-status">{storageMessage}</p>
    <div ref={grid} className={`dashboard-grid${maximized?' pane-maximized':''}${positioned!==layout?' pane-positioned':''}${gestureLayout?' pane-interacting':''}`}>
      {positioned.widgets.filter((w) => w.visible && widgets[w.id] && (!maximized||maximized===w.id)).map((w) => <section key={w.id} className={`dashboard-widget widget-${w.id}`} data-widget={w.id} data-active={activePane===w.id} aria-label={label(w.id)} style={{gridColumn:maximized?'span 12':w.position?`${w.position.x+1} / span ${w.size}`:`span ${w.size}`,gridRow:!maximized&&w.position?`${w.position.y+1} / span ${w.collapsed?2:w.position.rows}`:undefined,'--pane-column':maximized?'span 12':w.position?`${w.position.x+1} / span ${w.size}`:`span ${w.size}`,'--pane-height':w.position?`${w.position.rows*PANE_ROW_HEIGHT+(w.position.rows-1)*(layout.density==='compact'?Math.max(4,appearance.spacing-3):appearance.spacing)}px`:undefined} as CSSProperties}>
        <div className="pane-toolbar"><button className="pane-drag" disabled={!!w.pinned||!!maximized} aria-label={`Move ${label(w.id)}`} title="Drag to move. Arrow keys move one grid step. Pin to lock." onPointerDown={e=>startGesture(e,w.id,'move')} onPointerMove={moveGesture} onPointerUp={e=>finishGesture(e)} onPointerCancel={e=>finishGesture(e,true)} onLostPointerCapture={e=>{if(gesture.current)finishGesture(e,true);}} onKeyDown={e=>keyGeometry(e,w.id,'move')}>⠿</button><span>{label(w.id)}</span><button aria-pressed={!!w.pinned} aria-label={`Pin ${label(w.id)}`} onClick={()=>changePane(w.id,{pinned:!w.pinned})}>{w.pinned?'Pinned':'Pin'}</button><button aria-expanded={!w.collapsed} aria-label={`${w.collapsed?'Expand':'Collapse'} ${label(w.id)}`} onClick={()=>changePane(w.id,{collapsed:!w.collapsed})}>{w.collapsed?'Expand':'Collapse'}</button><button aria-label={`${maximized?'Restore':'Maximize'} ${label(w.id)}`} onClick={()=>{setMaximized(maximized?null:w.id);if(w.collapsed)changePane(w.id,{collapsed:false});}}>{maximized?'Restore':'Maximize'}</button></div>
        <div className="pane-content" hidden={!!w.collapsed}>{widgets[w.id]}</div>
        {!w.collapsed&&<button className="pane-resize" disabled={!!w.pinned||!!maximized} aria-label={`Resize ${label(w.id)}`} title="Drag to resize. Arrow keys adjust width and height." onPointerDown={e=>startGesture(e,w.id,'resize')} onPointerMove={moveGesture} onPointerUp={e=>finishGesture(e)} onPointerCancel={e=>finishGesture(e,true)} onLostPointerCapture={e=>{if(gesture.current)finishGesture(e,true);}} onKeyDown={e=>keyGeometry(e,w.id,'resize')}>◢</button>}
      </section>)}
    </div>
    {!layout.widgets.some((w) => w.visible) && <div className="dashboard-empty">Your workspace is empty. Use Customize dashboard to add widgets.</div>}
    <dialog ref={editor} className="dashboard-editor" aria-labelledby="dashboard-editor-title" onCancel={() => setDraft(null)} onClose={() => setDraft(null)}>
      <div className="dashboard-editor-heading"><div><h2 id="dashboard-editor-title">Make this workspace yours</h2><p>Choose widgets, drag to reorder, and set their width.</p></div><button aria-label="Close customization" onClick={() => editor.current?.close()}>Close</button></div>
      <details className="dashboard-appearance" open>
        <summary>Panel appearance</summary>
        <div className="dashboard-appearance-grid">
          <label>Preset<select aria-label="Appearance preset" value={preset} onChange={(e) => { if (APPEARANCE_PRESETS[e.target.value]) setDraft({...layout,appearance:{...APPEARANCE_PRESETS[e.target.value]}}); }}><option value="custom" disabled>Custom</option><option value="signal">Signal terminal</option><option value="research">Research desk</option><option value="minimal">Minimal</option></select></label>
          <label>Frame<select aria-label="Panel frame" value={appearance.frame} onChange={(e) => restyle({frame:e.target.value as PanelAppearance['frame']})}><option value="signal">Signal</option><option value="technical">Technical</option><option value="plain">Plain</option></select></label>
          <label>Accent<select aria-label="Panel accent" value={appearance.accent} onChange={(e) => restyle({accent:e.target.value as PanelAppearance['accent']})}><option value="amber">Amber</option><option value="blue">Blue</option><option value="purple">Purple</option></select></label>
          <label>Corners<select aria-label="Corner cut size" value={appearance.corners} onChange={(e) => restyle({corners:Number(e.target.value) as PanelAppearance['corners']})}><option value={0}>Square</option><option value={8}>Subtle · 8px</option><option value={14}>Angled · 14px</option><option value={20}>Deep · 20px</option></select></label>
          <label>Headers<select aria-label="Section header style" value={appearance.header} onChange={(e) => restyle({header:e.target.value as PanelAppearance['header']})}><option value="solid">Solid band</option><option value="underline">Underline</option></select></label>
          <label>Widget spacing<select aria-label="Widget spacing" value={appearance.spacing} onChange={(e) => restyle({spacing:Number(e.target.value) as PanelAppearance['spacing']})}><option value={6}>Tight · 6px</option><option value={10}>Balanced · 10px</option><option value={14}>Open · 14px</option><option value={18}>Wide · 18px</option></select></label>
          <label className="dashboard-signal-toggle"><input type="checkbox" checked={appearance.signalCuts} onChange={(e) => restyle({signalCuts:e.target.checked})} />Thin signal cuts</label>
        </div>
        <Panel className="dashboard-frame-preview"><PanelHeader title="FRAME PREVIEW" note={appearance.frame.toUpperCase()} /><p>Signals. Evidence. Context.</p></Panel>
      </details>
      <label className="dashboard-density">Density <select value={layout.density} onChange={(e) => setDraft({...layout,density:e.target.value as DashboardLayout['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <ol className="dashboard-widget-list">
        {layout.widgets.map((w,i) => <li key={w.id} data-layout-row={w.id}>
          <button className="dashboard-order" aria-label={`Drag ${label(w.id)} to reorder`}
            onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); drag.current=w.id; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const target = document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-layout-row]')?.dataset.layoutRow as WidgetId | undefined;
              const moving = drag.current;
              if (target && target !== moving) setDraft((current) => moveWidget(current ?? saved,moving,target));
            }}
            onPointerUp={(e) => { drag.current=null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
            onPointerCancel={() => {drag.current=null;}}
          >{String(i+1).padStart(2,'0')}</button>
          <label><input type="checkbox" checked={w.visible} onChange={(e) => update(w.id,{visible:e.target.checked})} />{label(w.id)}</label>
          <select aria-label={`${label(w.id)} width`} value={w.size} onChange={(e) => update(w.id,{size:Number(e.target.value),position:undefined})}>{![4,6,8,12].includes(w.size)&&<option value={w.size}>{w.size}/12 columns</option>}<option value={4}>One third</option><option value={6}>Half</option><option value={8}>Two thirds</option><option value={12}>Full width</option></select>
          <button aria-label={`Move ${label(w.id)} earlier`} disabled={i===0} onClick={() => setDraft(moveWidget(layout,w.id,layout.widgets[i-1].id))}>Up</button>
          <button aria-label={`Move ${label(w.id)} later`} disabled={i===layout.widgets.length-1} onClick={() => setDraft(moveWidget(layout,w.id,layout.widgets[i+1].id))}>Down</button>
        </li>)}
      </ol>
      <footer><button onClick={() => setDraft(normalizeLayout(null,development))}>Reset layout</button><div><button onClick={() => editor.current?.close()}>Cancel</button><button className="dashboard-save" onClick={save}>Save layout</button></div></footer>
    </dialog>
  </div></ResearchFocusContext.Provider>;
}
