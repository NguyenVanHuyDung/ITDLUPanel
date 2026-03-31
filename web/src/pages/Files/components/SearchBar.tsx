import { useState, useEffect } from 'react';
import { Input, Tag } from 'antd';
import { SearchOutlined, FileSearchOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { usePalette } from '../palette';

export type SearchMode = 'name' | 'content';

interface SearchBarProps {
  visible: boolean;
  loading: boolean;
  resultCount: number | null;
  onSearch: (query: string, mode: SearchMode) => void;
  onClear: () => void;
}

export default function SearchBar({ visible, loading, resultCount, onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('name');
  const { p, isDark } = usePalette();

  useEffect(() => {
    if (!visible) { setQuery(''); setMode('name'); }
  }, [visible]);

  if (!visible) return null;

  const doSearch = () => { if (query.trim()) onSearch(query, mode); };

  const modeBtn = (m: SearchMode, icon: React.ReactNode, label: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
    fontSize: 11, fontWeight: 600, border: 'none',
    background: mode === m ? `${p.accent}18` : 'transparent',
    color: mode === m ? p.accent : p.textMuted,
    transition: 'all 0.15s',
  });

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', flexWrap: 'wrap',
        borderBottom: `1px solid ${p.cardBorder}`,
        background: p.card,
      }}
    >
      <div style={{ display: 'flex', borderRadius: 6, border: `1px solid ${p.cardBorder}`, overflow: 'hidden' }}>
        <button style={modeBtn('name', <SearchOutlined />, 'File Name')} onClick={() => setMode('name')}>
          <SearchOutlined /> File Name
        </button>
        <button style={modeBtn('content', <FileSearchOutlined />, 'Content')} onClick={() => setMode('content')}>
          <FileSearchOutlined /> Content
        </button>
      </div>

      <Input
        placeholder={mode === 'name' ? 'Search by filename pattern (e.g. *.php)...' : 'Search text inside files (grep)...'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPressEnter={doSearch}
        size="small"
        style={{
          maxWidth: 360, flex: 1,
          background: p.inputBg, borderColor: p.cardBorder,
          borderRadius: 6, color: p.text, fontSize: 12,
        }}
        styles={{ input: { background: 'transparent', color: p.text } }}
        prefix={mode === 'name'
          ? <SearchOutlined style={{ color: p.textDim }} />
          : <FileSearchOutlined style={{ color: p.textDim }} />
        }
        allowClear
      />

      <button
        onClick={doSearch}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, border: 'none',
          background: p.accent, color: '#fff',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '...' : 'Search'}
      </button>

      {resultCount !== null && (
        <>
          <button
            onClick={() => { onClear(); setQuery(''); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, border: 'none',
              background: isDark ? 'rgba(30,41,59,0.5)' : '#F1F5F9',
              color: p.textMuted,
            }}
          >
            <CloseCircleOutlined /> Clear
          </button>
          <Tag
            style={{
              background: `${p.green}12`, border: `1px solid ${p.green}30`,
              color: p.green, fontSize: 11, fontWeight: 700,
              borderRadius: 6, padding: '0 8px', lineHeight: '22px', margin: 0,
            }}
          >
            {resultCount} result(s)
          </Tag>
        </>
      )}
    </div>
  );
}
