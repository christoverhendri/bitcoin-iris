import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, normalizeLayout } from './dashboardLayout';
import { focusLayout, importWorkspace, normalizeLibrary, eventInChart } from './researchWorkspace';

describe('research workspace',()=>{
  it('preserves pinned panel settings and leaves the personal layout untouched',()=>{
    const base=normalizeLayout(DEFAULT_LAYOUT,true);
    base.widgets[0]={...base.widgets[0],pinned:true,size:6,collapsed:true};
    const before=JSON.stringify(base);
    const focused=focusLayout(base,'macro');
    expect(focused.widgets[0]).toEqual(base.widgets[0]);
    expect(focused.widgets.find(w=>w.id==='macro')?.visible).toBe(true);
    expect(focused.widgets.find(w=>w.id==='chain')?.visible).toBe(false);
    expect(JSON.stringify(base)).toBe(before);
  });
  it('validates imported profiles without exposing dev-only widgets',()=>{
    const exported=JSON.stringify({kind:'iris-workspace/v1',layout:DEFAULT_LAYOUT,timeframe:'7D'});
    expect(importWorkspace(exported,false).layout.widgets.some(w=>w.id==='sources')).toBe(false);
    expect(importWorkspace(exported,false).timeframe).toBe('7D');
    expect(()=>importWorkspace('{}',true)).toThrow('not an IRIS');
    expect(()=>importWorkspace('bad',true)).toThrow('Invalid');
    expect(()=>importWorkspace('x'.repeat(100001),true)).toThrow('100 KB');
    expect(normalizeLibrary([{id:'one',name:' Desk ',layout:DEFAULT_LAYOUT},{id:'one',name:'duplicate',layout:DEFAULT_LAYOUT}],true)).toHaveLength(1);
  });
  it('retains pin/collapse settings through normalization and annotates only covered event times',()=>{
    const base={...DEFAULT_LAYOUT,widgets:[{id:'price',size:8,visible:true,pinned:true,collapsed:true}]};
    expect(normalizeLayout(base,true).widgets[0]).toMatchObject({pinned:true,collapsed:true});
    expect(eventInChart(100,100,200,60)).toBe(true);
    expect(eventInChart(259,100,200,60)).toBe(true);
    expect(eventInChart(260,100,200,60)).toBe(false);
    expect(eventInChart(NaN,100,200,60)).toBe(false);
  });
});
