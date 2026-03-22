import { useState, useEffect } from 'react';
import { Input, Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchBarProps {
  visible: boolean;
  loading: boolean;
  resultCount: number | null;
  onSearch: (query: string) => void;
  onClear: () => void;
}

export default function SearchBar({ visible, loading, resultCount, onSearch, onClear }: SearchBarProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
      <Input
        placeholder="Search files..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPressEnter={() => onSearch(query)}
        className="max-w-[400px]"
        size="small"
        prefix={<SearchOutlined className="text-gray-400" />}
        allowClear
      />
      <Button size="small" type="primary" loading={loading} onClick={() => onSearch(query)}>
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
