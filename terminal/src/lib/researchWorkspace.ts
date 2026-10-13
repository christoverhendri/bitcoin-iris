import { normalizeLayout, type DashboardLayout, type WidgetId } from './dashboardLayout';
import { resolveTimeframe, type Timeframe } from './nav';

export const FOCUS_PROFILES = {
  price: {label:'Price investigation',timeframe:'7D',widgets:['price','technicals','snapshot','evidence']},
  chain: {label:'On-chain investigation',timeframe:'7D',widgets:['chain','price','evidence','snapshot']},
  macro: {label:'Macro investigation',timeframe:'3M',widgets:['macro','price','evidence','technicals']},
  news: {label:'News investigation',timeframe:'7D',widgets:['evidence','price','chain','macro']},
} as const satisfies Record<string,{label:string;timeframe:Timeframe;widgets:readonly WidgetId[]}>;
export type FocusKind = keyof typeof FOCUS_PROFILES;
export interface ResearchEvent {title:string;publishedAt:number;url?:string}
export interface ResearchFocus {kind:FocusKind;event?:ResearchEvent}

/** Pinned settings survive automatic suggestions; personal layout is never mutated. */
export function focusLayout(base: DashboardLayout, kind: FocusKind): DashboardLayout {
  const order: readonly WidgetId[] = FOCUS_PROFILES[kind].widgets;
  const moving = base.widgets.filter((w) => !w.pinned).sort((a,b) => {
    const rank = (id:WidgetId) => order.includes(id) ? order.indexOf(id) : order.length;
    return rank(a.id)-rank(b.id);
  }).map((w) => ({...w,position:undefined,visible:order.includes(w.id),collapsed:false,size:(w.id==='price'?8:4) as 4|8}));
  let index=0;
  return {...base,widgets:base.widgets.map((w) => w.pinned?{...w}:moving[index++])};
}

export const LIBRARY_KEY = 'iris.workspace.library.v1';
export interface SavedWorkspace {id:string;name:string;layout:DashboardLayout;timeframe:Timeframe}
export function normalizeLibrary(raw:unknown, development:boolean): SavedWorkspace[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0,8).flatMap((entry) => {
    if (!entry || typeof entry!=='object' || typeof entry.id!=='string' || !/^[\w-]{1,80}$/.test(entry.id)
      || seen.has(entry.id) || typeof entry.name!=='string' || !entry.name.trim() || entry.layout?.version!==1) return [];
    seen.add(entry.id);
    return [{id:entry.id,name:entry.name.trim().slice(0,40),layout:normalizeLayout(entry.layout,development),timeframe:resolveTimeframe(typeof entry.timeframe==='string'?entry.timeframe:null)}];
  });
}

export function importWorkspace(text:string, development:boolean):{layout:DashboardLayout;timeframe:Timeframe} {
  if (text.length>100_000) throw new Error('Workspace JSON must be smaller than 100 KB.');
  let value:unknown; try {value=JSON.parse(text);} catch {throw new Error('Invalid workspace JSON.');}
  const payload = value as {kind?:string;layout?:DashboardLayout;timeframe?:string};
  if (!payload || payload.kind!=='iris-workspace/v1' || payload.layout?.version!==1 || !Array.isArray(payload.layout.widgets)) throw new Error('This file is not an IRIS workspace.');
  return {layout:normalizeLayout(payload.layout,development),timeframe:resolveTimeframe(payload.timeframe)};
}

/** Only annotate events covered by observed chart buckets. */
export function eventInChart(ts:number, first:number, last:number, step:number) {
  return Number.isFinite(ts) && ts>=first && ts<last+step;
}
