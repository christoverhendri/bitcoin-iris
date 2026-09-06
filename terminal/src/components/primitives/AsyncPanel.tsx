import { Suspense, type ReactNode } from 'react';

export function PanelLoading({ title, height = 140 }: { title: string; height?: number }) {
  return <section role="status" aria-label={`Loading ${title}`} className="iris-panel-loading" style={{ minHeight: height }}>
    <strong>{title.toUpperCase()}</strong>
    <span>Loading data…</span>
    <div className="iris-skeleton" /><div className="iris-skeleton" style={{ width: '65%' }} />
  </section>;
}

async function Resolved<T>({ data, children }: { data: Promise<T>; children: (value: T) => ReactNode }) {
  return children(await data);
}

/** Start promises at the page, await only inside each independent boundary. */
export function AsyncPanel<T>({ data, title, height, children }: {
  data: Promise<T>; title: string; height?: number; children: (value: T) => ReactNode;
}) {
  return <Suspense fallback={<PanelLoading title={title} height={height} />}>
    <Resolved data={data}>{children}</Resolved>
  </Suspense>;
}
