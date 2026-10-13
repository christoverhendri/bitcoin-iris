'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createThreeGlobe, type GlobeRuntime } from './threeGlobe';
import type { WorldMapProps } from './WorldMap';

const FlatMap = dynamic(() => import('./WorldMap').then((mod) => mod.WorldMap));

/** Lazy-loaded WebGL globe; flat map is the automatic fallback without WebGL. */
export function GlobeMap(props: WorldMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GlobeRuntime | null>(null);
  const propsRef = useRef(props);
  const autoRef = useRef(false);
  const [auto, setAuto] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    propsRef.current = props;
    autoRef.current = auto;
    runtimeRef.current?.update(props);
    runtimeRef.current?.autoRotate(auto);
  }, [props, auto]);

  useEffect(() => {
    if (fallback) return;
    const host = hostRef.current;
    if (!host) return;
    const initFrame = requestAnimationFrame(() => {
      try {
        runtimeRef.current = createThreeGlobe(host, propsRef.current, () => setFallback(true));
        runtimeRef.current.autoRotate(autoRef.current);
      } catch {
        setFallback(true);
      }
    });
    return () => {
      cancelAnimationFrame(initFrame);
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [fallback]);

  if (fallback) return <div>
    <div role="status" className="sentiment-globe-fallback">3D is unavailable on this device. Showing the 2D map.</div>
    <FlatMap {...props} />
  </div>;

  return <div className="sentiment-three-globe">
    <div ref={hostRef} className="sentiment-globe-stage" />
    <div className="sentiment-globe-controls">
      <button type="button" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? 'PAUSE ROTATION' : 'AUTO ROTATE'}</button>
      <button type="button" aria-label="Zoom in" onClick={() => runtimeRef.current?.zoom(1.4)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => runtimeRef.current?.zoom(1 / 1.4)}>−</button>
      <button type="button" onClick={() => runtimeRef.current?.reset()}>RESET</button>
    </div>
    <div className="sentiment-globe-hint">Drag to rotate · Scroll to zoom · Click an event</div>
  </div>;
}
