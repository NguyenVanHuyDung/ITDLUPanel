import { useState } from 'react';
import { Tooltip, Input } from 'antd';
import { LeftOutlined, RightOutlined, HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import { usePalette, mono } from '../palette';

interface BreadcrumbNavProps {
  currentPath: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
}

export default function BreadcrumbNav({
  currentPath, loading, canGoBack, canGoForward,
  onNavigate, onGoBack, onGoForward, onRefresh,
}: BreadcrumbNavProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const { p, isDark } = usePalette();

  const segments = currentPath.split('/').filter(Boolean);

  const startEdit = () => {
    setEditValue(currentPath);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== currentPath) {
      onNavigate(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    }
  };

  const navBtn = (disabled?: boolean): React.CSSProperties => ({
    background: 'none', border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? p.textDim : p.textMuted,
    fontSize: 12, padding: '4px 6px', borderRadius: 6,
    display: 'flex', alignItems: 'center',
    opacity: disabled ? 0.4 : 1,
    transition: 'color 0.15s',
  });

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        borderBottom: `1px solid ${p.cardBorder}`,
        background: p.card,
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        <Tooltip title="Back">
          <button style={navBtn(!canGoBack)} onClick={onGoBack} disabled={!canGoBack}>
            <LeftOutlined />
          </button>
        </Tooltip>
        <Tooltip title="Forward">
          <button style={navBtn(!canGoForward)} onClick={onGoForward} disabled={!canGoForward}>
            <RightOutlined />
          </button>
        </Tooltip>
      </div>

      {editing ? (
        <Input
          size="small"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onPressEnter={commitEdit}
          onBlur={commitEdit}
          autoFocus
          style={{
            flex: 1, fontFamily: mono, fontSize: 12,
            background: p.inputBg, borderColor: p.cardBorder,
            color: p.text, borderRadius: 6,
          }}
          styles={{ input: { background: 'transparent', color: p.text } }}
        />
      ) : (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            flex: 1, flexWrap: 'wrap', fontSize: 13, cursor: 'text',
          }}
          onDoubleClick={startEdit}
        >
          <span
            style={{
              cursor: 'pointer', color: p.accent, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onClick={() => onNavigate('/')}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
          >
            <HomeOutlined style={{ fontSize: 12 }} /> Root
          </span>
          {segments.map((seg, i) => {
            const fullPath = '/' + segments.slice(0, i + 1).join('/');
            const isLast = i === segments.length - 1;
            return (
              <span key={fullPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: p.textDim }}>/</span>
                <span
                  style={{
                    cursor: 'pointer',
                    color: isLast ? p.text : p.accent,
                    fontWeight: isLast ? 600 : 400,
                  }}
                  onClick={() => onNavigate(fullPath)}
                  onMouseEnter={(e) => { if (!isLast) (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                >
                  {seg}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <Tooltip title="Refresh">
        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: p.textMuted, fontSize: 13, padding: '4px 6px',
            borderRadius: 6, display: 'flex', alignItems: 'center',
          }}
          onClick={onRefresh}
        >
          <ReloadOutlined spin={loading} />
        </button>
      </Tooltip>
    </div>
  );
}
