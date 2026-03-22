import { useState, useEffect } from 'react';
import { Input, Button, Radio } from 'antd';
import { SearchOutlined, FileSearchOutlined } from '@ant-design/icons';

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

  useEffect(() => {
    if (!visible) { setQuery(''); setMode('name'); }
  }, [visible]);

  if (!visible) return null;

  const doSearch = () => { if (query.trim()) onSearch(query, mode); };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
        <Radio.Button value="name">
          <SearchOutlined className="mr-1" />File Name
        </Radio.Button>
        <Radio.Button value="content">
          <FileSearchOutlined className="mr-1" />File Content
        </Radio.Button>
      </Radio.Group>

      <Input
        placeholder={mode === 'name' ? 'Search by filename pattern (e.g. *.php)...' : 'Search text inside files (grep)...'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPressEnter={doSearch}
        className="max-w-[400px] flex-1"
        size="small"
        prefix={mode === 'name' ? <SearchOutlined className="text-gray-400" /> : <FileSearchOutlined className="text-gray-400" />}
        allowClear
      />
      <Button size="small" type="primary" loading={loading} onClick={doSearch}>
        Search
      </Button>
      {resultCount !== null && (
        <>
          <Button size="small" onClick={() => { onClear(); setQuery(''); }}>Clear</Button>
          <span className="text-xs text-gray-500">Found {resultCount} result(s)</span>
        </>
      )}
    </div>
  );
}
