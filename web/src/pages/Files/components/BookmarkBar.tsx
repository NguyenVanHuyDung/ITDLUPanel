import { useRef } from 'react';
import { Tooltip } from 'antd';
import {
  LeftOutlined, RightOutlined, StarOutlined, CloseOutlined, FolderFilled,
} from '@ant-design/icons';
import type { Bookmark } from '../types';
import { usePalette, mono } from '../palette';

interface BookmarkBarProps {
  bookmarks: Bookmark[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onAdd: () => void;
  onRemove: (path: string) => void;
}

export default function BookmarkBar({ bookmarks, currentPath, onNavigate, onAdd, onRemove }: BookmarkBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const { p, isDark } = usePalette();

  const scroll = (dir: 'left' | 'right') => {
    barRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const navBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: p.textMuted, fontSize: 12, padding: '4px 6px',
    borderRadius: 6, display: 'flex', alignItems: 'center',
    transition: 'color 0.15s',
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', minHeight: 38,
        borderBottom: `1px solid ${p.cardBorder}`,
        background: isDark ? 'rgba(15,23,42,0.4)' : 'rgba(37,99,235,0.03)',
      }}
    >
      <button style={navBtn} onClick={() => scroll('left')}><LeftOutlined /></button>

      <div
        ref={barRef}
        style={{
          display: 'flex', gap: 4, flex: 1,
          overflowX: 'auto', scrollbarWidth: 'none',
        }}
      >
        {bookmarks.map(bm => {
          const active = currentPath === bm.path;
          return (
            <div
              key={bm.path}
              onClick={() => onNavigate(bm.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500,
                transition: 'all 0.15s',
                background: active ? p.accent : (isDark ? 'rgba(30,41,59,0.5)' : '#fff'),
                color: active ? '#fff' : p.text,
                border: `1px solid ${active ? p.accent : p.cardBorder}`,
              }}
            >
              <FolderFilled style={{ fontSize: 12, color: active ? '#fff' : p.amber }} />
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bm.label}
              </span>
              <CloseOutlined
                style={{ fontSize: 9, opacity: 0.5, transition: 'opacity 0.15s' }}
                onClick={(e) => { e.stopPropagation(); onRemove(bm.path); }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; }}
              />
            </div>
          );
        })}
      </div>

      <button style={navBtn} onClick={() => scroll('right')}><RightOutlined /></button>
      <Tooltip title="Bookmark current folder">
        <button
          style={{ ...navBtn, color: p.amber }}
          onClick={onAdd}
        >
          <StarOutlined />
        </button>
      </Tooltip>
    </div>
  );
}
