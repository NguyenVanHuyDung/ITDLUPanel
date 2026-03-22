import { usePalette } from '../palette';

interface DragDropOverlayProps {
  isDragging: boolean;
}

export default function DragDropOverlay({ isDragging }: DragDropOverlayProps) {
  const { p } = usePalette();

  if (!isDragging) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${p.accent}08`,
        backdropFilter: 'blur(2px)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12,
          padding: 32, borderRadius: 16,
          border: `2px dashed ${p.accent}`,
          background: `${p.card}F0`,
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span style={{ color: p.accent, fontWeight: 600, fontSize: 15 }}>
          Drop files to upload
        </span>
        <span style={{ color: p.textMuted, fontSize: 12 }}>
          Files will be uploaded to the current directory
        </span>
      </div>
    </div>
  );
}
