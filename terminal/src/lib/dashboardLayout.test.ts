import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, moveWidget, normalizeLayout } from './dashboardLayout';

describe('personal dashboard preferences', () => {
  it('migrates old layouts without changing widget choices and validates appearance independently', () => {
    const old = {version:DEFAULT_LAYOUT.version,density:DEFAULT_LAYOUT.density,widgets:DEFAULT_LAYOUT.widgets};
    const migrated = normalizeLayout(old,true);
    expect(migrated.widgets).toEqual(old.widgets);
    expect(migrated.appearance).toEqual(DEFAULT_LAYOUT.appearance);
    const invalid = normalizeLayout({...old,appearance:{frame:'unsafe',accent:'url(bad)',corners:999,header:'bad',spacing:-5,signalCuts:'yes'}},true);
    expect(invalid.appearance).toEqual(DEFAULT_LAYOUT.appearance);
    const custom = {...DEFAULT_LAYOUT.appearance,accent:'purple' as const,corners:20 as const,signalCuts:false,spacing:18 as const};
    expect(normalizeLayout({...old,appearance:custom},true).appearance).toEqual(custom);
    expect(moveWidget({...migrated,appearance:custom},'macro','price').appearance).toEqual(custom);
  });
  it('recovers from corrupt/versioned preferences and excludes dev-only providers in production', () => {
    expect(normalizeLayout({version:9,widgets:[{id:'bad'}]},true)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(null,false).widgets.some((w) => w.id === 'sources')).toBe(false);
    expect(normalizeLayout(null,false).widgets.find((w) => w.id === 'snapshot')?.visible).toBe(true);
  });
  it('preserves valid choices, rejects duplicates and unsafe sizes, and adds new widgets', () => {
    const normalized = normalizeLayout({version:1,density:'compact',widgets:[{id:'evidence',size:12,visible:false},{id:'evidence',size:4,visible:true},{id:'price',size:900,visible:true},{id:'injected',size:4,visible:true}]},true);
    expect(normalized.density).toBe('compact');
    expect(normalized.widgets[0]).toEqual({id:'evidence',size:12,visible:false});
    expect(normalized.widgets[1]).toEqual({id:'price',size:8,visible:true});
    expect(new Set(normalized.widgets.map((w) => w.id)).size).toBe(DEFAULT_LAYOUT.widgets.length);
  });
  it('reorders without changing sizes, visibility or the original layout', () => {
    const moved = moveWidget(DEFAULT_LAYOUT,'macro','price');
    expect(moved.widgets[0]).toEqual(DEFAULT_LAYOUT.widgets[2]);
    expect(DEFAULT_LAYOUT.widgets[0].id).toBe('price');
    expect(moveWidget(DEFAULT_LAYOUT,'price','price')).toBe(DEFAULT_LAYOUT);
  });
});
