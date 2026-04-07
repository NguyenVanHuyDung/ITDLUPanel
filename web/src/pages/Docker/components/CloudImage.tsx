import { useState, useEffect, useCallback } from 'react';
import { message, Popconfirm, Modal, Form, Input, Select, Descriptions, Tag, Empty } from 'antd';
import {
  DeleteOutlined, ReloadOutlined, SearchOutlined,
  DownloadOutlined, EyeOutlined, TagOutlined, ClearOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface ImageSearchResult {
  name: string;
  description: string;
  stars: number;
  official: boolean;
}

export default function CloudImage() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<ImageSearchResult[]>>('/docker/images/search', { params: { q: query } });
      setResults(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  const handlePull = async (name: string) => {
    setPullLoading(name);
    try {
      await api.post('/docker/images/pull', { name });
      message.success(`Pulled ${name} successfully`);
    } catch {
      message.error(`Failed to pull ${name}`);
    } finally {
      setPullLoading(null);
    }
  };

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="Search Docker Hub (e.g. nginx, mysql, redis...)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onPressEnter={handleSearch}
          prefix={<SearchOutlined style={{ color: p.textMuted }} />}
          style={{ flex: 1 }}
          allowClear
        />
        <button onClick={handleSearch} disabled={loading || !query.trim()} style={{
          padding: '6px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          opacity: loading || !query.trim() ? 0.5 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <SearchOutlined /> {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {results.length === 0 && !loading && (
        <Empty description="Search Docker Hub to find images" style={{ padding: 40 }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(img => (
          <div key={img.name} style={{
            padding: '12px 16px', borderRadius: 8,
            border: `1px solid ${p.cardBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>{img.name}</span>
                {img.official && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: `${p.green}20`, color: p.green, fontWeight: 600,
                  }}>OFFICIAL</span>
                )}
                <span style={{ fontSize: 11, color: p.textMuted }}>★ {img.stars}</span>
              </div>
              <div style={{ fontSize: 12, color: p.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {img.description || 'No description'}
              </div>
            </div>
            <button
              onClick={() => handlePull(img.name)}
              disabled={pullLoading === img.name}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
                opacity: pullLoading === img.name ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
              }}
            >
              <DownloadOutlined /> {pullLoading === img.name ? 'Pulling...' : 'Pull'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
