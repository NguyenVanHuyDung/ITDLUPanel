interface DragDropOverlayProps {
  isDragging: boolean;
}

export default function DragDropOverlay({ isDragging }: DragDropOverlayProps) {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-600/10 backdrop-blur-[2px] pointer-events-none">
      <div className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-blue-500 bg-white/90 shadow-xl">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-blue-700 font-semibold text-base">Drop files to upload</span>
        <span className="text-blue-500 text-sm">Files will be uploaded to the current directory</span>
      </div>
    </div>
  );
}
