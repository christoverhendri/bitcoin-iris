import type { DashboardLayout, PanePosition, WidgetId, WidgetLayout } from './dashboardLayout';

export const PANE_ROW_HEIGHT = 24;
const defaults: Record<WidgetId, number> = {price:16,chain:16,macro:8,evidence:11,sources:7,snapshot:6,technicals:9};
const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
const rectangle = (w:WidgetLayout) => ({...w.position!,width:w.size,rows:w.collapsed?2:w.position!.rows});
function overlaps(a:WidgetLayout,b:WidgetLayout) {
  const x=rectangle(a),y=rectangle(b);
  return x.x<y.x+y.width && x.x+x.width>y.x && x.y<y.y+y.rows && x.y+x.rows>y.y;
}

/** Explicit positions first, then place new/legacy panes in the first free slot. */
export function positionPanes(layout:DashboardLayout):DashboardLayout {
  const placed:WidgetLayout[]=[];
  const visible=layout.widgets.filter(w=>w.visible);
  for(const w of [...visible.filter(w=>w.position&&w.pinned),...visible.filter(w=>w.position&&!w.pinned),...visible.filter(w=>!w.position)]) {
    let candidate={...w,position:w.position?{...w.position}:{x:0,y:0,rows:defaults[w.id]}};
    if(!w.position) {
      let found=false;
      for(let y=0;!found;y++) for(let x=0;x<=12-w.size;x++) {
        candidate={...candidate,position:{...candidate.position,x,y}};
        if(!placed.some(p=>overlaps(candidate,p))){found=true;break;}
      }
    } else while(placed.some(p=>overlaps(candidate,p))) candidate={...candidate,position:{...candidate.position,y:candidate.position.y>=500?0:candidate.position.y+1}};
    placed.push(candidate);
  }
  return {...layout,widgets:layout.widgets.map(w=>placed.find(p=>p.id===w.id)??w)};
}

/** Preserve pinned panes; collisions push other panes down without covering content. */
export function adjustPane(layout:DashboardLayout,id:WidgetId,patch:Partial<PanePosition>&{size?:number}):DashboardLayout {
  const base=positionPanes(layout),target=base.widgets.find(w=>w.id===id);
  if(!target?.position||target.pinned)return base;
  const size=clamp(Math.round(patch.size??target.size),2,12);
  const changed={...target,size,position:{x:clamp(Math.round(patch.x??target.position.x),0,12-size),y:clamp(Math.round(patch.y??target.position.y),0,200),rows:clamp(Math.round(patch.rows??target.position.rows),4,40)}};
  const pinned=base.widgets.filter(w=>w.visible&&w.pinned&&w.position);
  if(pinned.some(w=>overlaps(changed,w)))return base;
  const placed=[...pinned,changed];
  for(const w of base.widgets.filter(w=>w.visible&&!w.pinned&&w.id!==id)) {
    let candidate=w;
    while(placed.some(p=>overlaps(candidate,p))) candidate={...candidate,position:{...candidate.position!,y:candidate.position!.y>=500?0:candidate.position!.y+1}};
    placed.push(candidate);
  }
  return {...base,widgets:base.widgets.map(w=>placed.find(p=>p.id===w.id)??w)};
}
