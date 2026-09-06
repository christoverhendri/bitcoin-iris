import { PanelLoading } from '@/components/primitives/AsyncPanel';

export default function Loading() {
  return <div style={{ padding: 8, display: 'grid', gap: 6 }}>
    <PanelLoading title="Section" height={100} />
    <PanelLoading title="Panels" height={350} />
  </div>;
}
