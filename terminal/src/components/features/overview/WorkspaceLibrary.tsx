'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import type { DashboardLayout } from '@/lib/dashboardLayout';
import { importWorkspace, LIBRARY_KEY, normalizeLibrary } from '@/lib/researchWorkspace';
import { readWorkspace, writeWorkspace, subscribeWorkspace } from '@/lib/clientWorkspaceStore';
import type { Timeframe } from '@/lib/nav';

export function WorkspaceLibrary({layout,development,onLoad,disabled,timeframe}: {layout:DashboardLayout;development:boolean;onLoad:(layout:DashboardLayout,timeframe:Timeframe)=>void;disabled:boolean;timeframe:Timeframe}){
  const raw=useSyncExternalStore(callback=>subscribeWorkspace(LIBRARY_KEY,callback),()=>readWorkspace(LIBRARY_KEY,'[]'),()=> '[]');
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{parsed=[];}
  const library=normalizeLibrary(parsed,development);
  const [name,setName]=useState(''),[message,setMessage]=useState('');
  const file=useRef<HTMLInputElement>(null);
  const save=()=>{
    const title=name.trim();if(!title){setMessage('Enter a workspace name.');return;}
    const previous=library.find(w=>w.name.toLowerCase()===title.toLowerCase());
    if(!previous&&library.length>=8){setMessage('Eight workspaces are saved. Use an existing name to update one.');return;}
    const entry={id:previous?.id??crypto.randomUUID(),name:title,layout,timeframe};
    const serialized=JSON.stringify(previous?library.map(w=>w.id===previous.id?entry:w):[...library,entry]);
    const persisted=writeWorkspace(LIBRARY_KEY,serialized);
    setMessage(persisted?`Saved ${title} on this browser.`:`Saved ${title} for this session; browser storage is unavailable.`);
  };
  const exportLayout=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({kind:'iris-workspace/v1',layout,timeframe},null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='iris-workspace.json';anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <details className="workspace-library"><summary>Saved workspaces & transfer</summary><div className="workspace-library-controls">
    <select aria-label="Load saved workspace" value="" disabled={disabled} onChange={e=>{const w=library.find(w=>w.id===e.target.value);if(w){onLoad(w.layout,w.timeframe);setMessage(`Loaded ${w.name}.`);}}}><option value="">Load a saved workspace…</option>{library.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select>
    <input aria-label="Workspace name" placeholder="Workspace name" maxLength={40} value={name} onChange={e=>setName(e.target.value)} /><button onClick={save}>Save workspace</button>
    <button onClick={exportLayout}>Export JSON</button><button disabled={disabled} onClick={()=>file.current?.click()}>Import JSON</button>
    <input ref={file} type="file" accept=".json,application/json" aria-label="Import workspace JSON" hidden onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;try{if(selected.size>100000)throw new Error('Workspace JSON must be smaller than 100 KB.');const imported=importWorkspace(await selected.text(),development);onLoad(imported.layout,imported.timeframe);setMessage('Imported workspace.');}catch(error){setMessage(error instanceof Error?error.message:'Import failed.');}}} />
  </div><p role="status">{message||'Up to eight named workspaces. Export/import contains layout preferences only.'}</p></details>;
}
