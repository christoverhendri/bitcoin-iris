export const WIDGETS = [
  { id: 'price', label: 'Price action', size: 8, visible: true },
  { id: 'chain', label: 'On-chain intelligence', size: 4, visible: true },
  { id: 'macro', label: 'Macro snapshot', size: 4, visible: true },
  { id: 'evidence', label: 'Recent evidence', size: 4, visible: true },
  { id: 'sources', label: 'Source inspector', size: 4, visible: true, devOnly: true },
  { id: 'snapshot', label: 'BTC snapshot', size: 4, visible: false },
  { id: 'technicals', label: 'Technicals', size: 4, visible: false },
] as const;
export type WidgetId = typeof WIDGETS[number]['id'];
export interface PanePosition { x: number; y: number; rows: number }
export interface WidgetLayout { id: WidgetId; size: number; visible: boolean; pinned?: boolean; collapsed?: boolean; position?: PanePosition }
export interface PanelAppearance {
  frame: 'signal' | 'technical' | 'plain';
  accent: 'amber' | 'blue' | 'purple';
  corners: 0 | 8 | 14 | 20;
  header: 'solid' | 'underline';
  signalCuts: boolean;
  spacing: 6 | 10 | 14 | 18;
}
export const APPEARANCE_PRESETS: Record<string, PanelAppearance> = {
  signal: {frame:'signal',accent:'amber',corners:14,header:'solid',signalCuts:true,spacing:10},
  research: {frame:'technical',accent:'blue',corners:8,header:'underline',signalCuts:true,spacing:14},
  minimal: {frame:'plain',accent:'blue',corners:0,header:'underline',signalCuts:false,spacing:6},
};
export interface DashboardLayout { version: 1; density: 'comfortable' | 'compact'; widgets: WidgetLayout[]; appearance: PanelAppearance }
export const DEFAULT_LAYOUT: DashboardLayout = { version: 1, density: 'comfortable', appearance: APPEARANCE_PRESETS.signal, widgets: WIDGETS.map(({id,size,visible}) => ({id,size,visible})) };
export const LAYOUT_KEY = 'iris.overview.layout.v1';

/** Reject stale/corrupt preferences while adding newly introduced widgets. */
export function normalizeLayout(raw: unknown, development: boolean): DashboardLayout {
  const input = raw && typeof raw === 'object' ? raw as Partial<DashboardLayout> : {};
  const available = WIDGETS.filter((w) => !('devOnly' in w) || development);
  const seen = new Set<string>();
  const widgets: WidgetLayout[] = [];
  for (const w of input.version === 1 && Array.isArray(input.widgets) ? input.widgets : []) {
    if (!w || !available.some((a) => a.id === w.id) || seen.has(w.id)) continue;
    const fallback = available.find((a) => a.id === w.id)!;
    const size = Number.isInteger(w.size) && w.size >= 2 && w.size <= 12 ? w.size : fallback.size;
    const p = w.position;
    const position = p && Number.isInteger(p.x) && p.x >= 0 && p.x + size <= 12 && Number.isInteger(p.y) && p.y >= 0 && p.y <= 500 && Number.isInteger(p.rows) && p.rows >= 4 && p.rows <= 40 ? {...p} : undefined;
    widgets.push({ id: w.id, size, visible: typeof w.visible === 'boolean' ? w.visible : fallback.visible,
      ...(w.pinned === true ? {pinned:true} : {}), ...(w.collapsed === true ? {collapsed:true} : {}), ...(position ? {position:{x:position.x,y:position.y,rows:position.rows}} : {}) });
    seen.add(w.id);
  }
  for (const w of available) if (!seen.has(w.id)) widgets.push({id:w.id, size:w.size, visible:w.id === 'snapshot' && !development ? true : w.visible});
  const a = input.appearance && typeof input.appearance === 'object' ? input.appearance : {} as Partial<PanelAppearance>;
  const defaults = APPEARANCE_PRESETS.signal;
  const appearance: PanelAppearance = {
    frame: ['signal','technical','plain'].includes(a.frame ?? '') ? a.frame! : defaults.frame,
    accent: ['amber','blue','purple'].includes(a.accent ?? '') ? a.accent! : defaults.accent,
    corners: [0,8,14,20].includes(a.corners ?? -1) ? a.corners! : defaults.corners,
    header: a.header === 'underline' ? 'underline' : 'solid',
    signalCuts: typeof a.signalCuts === 'boolean' ? a.signalCuts : defaults.signalCuts,
    spacing: [6,10,14,18].includes(a.spacing ?? -1) ? a.spacing! : defaults.spacing,
  };
  return { version: 1, density: input.density === 'compact' ? 'compact' : 'comfortable', widgets, appearance };
}

export function moveWidget(layout: DashboardLayout, from: WidgetId, to: WidgetId): DashboardLayout {
  const widgets = [...layout.widgets];
  const index = widgets.findIndex((w) => w.id === from), target = widgets.findIndex((w) => w.id === to);
  if (index < 0 || target < 0 || index === target) return layout;
  const [widget] = widgets.splice(index, 1); widgets.splice(target, 0, widget);
  return {...layout, widgets:widgets.map(w=>w.position&&!w.pinned?{...w,position:undefined}:w)};
}
