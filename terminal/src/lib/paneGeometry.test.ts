import {describe,it,expect} from 'vitest';
import {normalizeLayout} from './dashboardLayout';
import {adjustPane,positionPanes} from './paneGeometry';

describe('workspace geometry',()=>{
  it('migrates positions and pushes collisions without mutating the original',()=>{
    const base=normalizeLayout(null,true),placed=positionPanes(base);
    expect(base.widgets[0].position).toBeUndefined();
    const moved=adjustPane(placed,'macro',{x:0,y:0,size:5,rows:10});
    expect(moved.widgets.find(w=>w.id==='macro')).toMatchObject({size:5,position:{x:0,y:0,rows:10}});
    expect(moved.widgets.find(w=>w.id==='price')!.position!.y).toBeGreaterThanOrEqual(10);
    expect(normalizeLayout(JSON.parse(JSON.stringify(moved)),true)).toEqual(moved);
  });
  it('locks pinned geometry and rejects collisions against pinned panes',()=>{
    const base=positionPanes(normalizeLayout(null,true));base.widgets[0].pinned=true;
    expect(adjustPane(base,'price',{x:5}).widgets[0]).toEqual(base.widgets[0]);
    const blocked=adjustPane(base,'macro',{x:0,y:0});
    expect(blocked.widgets.find(w=>w.id==='macro')).toEqual(base.widgets.find(w=>w.id==='macro'));
  });
  it('bounds dimensions and rejects unsafe imported coordinates',()=>{
    const base=positionPanes(normalizeLayout(null,true));
    const resized=adjustPane(base,'price',{size:99,x:99,y:-10,rows:999}).widgets[0];
    expect(resized).toMatchObject({size:12,position:{x:0,y:0,rows:40}});
    for(const position of [{x:12,y:0,rows:5},{x:0,y:Infinity,rows:5},{x:0,y:0,rows:-1}]) {
      expect(normalizeLayout({...base,widgets:[{...base.widgets[0],position}]},true).widgets[0].position).toBeUndefined();
    }
  });
});
