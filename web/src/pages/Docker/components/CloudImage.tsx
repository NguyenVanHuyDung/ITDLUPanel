import { useState, useEffect, useCallback } from 'react';
import { message, Input, Empty } from 'antd';
import {
  SearchOutlined, DownloadOutlined, StarFilled, FireOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface ImageSearchResult {
  name: string;
  description: string;
  stars: number;
  official: boolean;
}

interface FeaturedImage {
  name: string;
  description: string;
  stars: string;
  official: boolean;
  category: string;
}

const featuredImages: FeaturedImage[] = [
  { name: 'nginx', description: 'Official build of Nginx — high-performance HTTP server and reverse proxy', stars: '19.8k+', official: true, category: 'Web Server' },
  { name: 'node', description: 'Node.js is a JavaScript runtime built on Chrome\'s V8 engine', stars: '13.5k+', official: true, category: 'Runtime' },
  { name: 'python', description: 'Python is an interpreted, high-level programming language', stars: '9.8k+', official: true, category: 'Runtime' },
  { name: 'postgres', description: 'PostgreSQL — the world\'s most advanced open-source relational database', stars: '13.2k+', official: true, category: 'Database' },
  { name: 'mysql', description: 'MySQL is the world\'s most popular open-source database', stars: '15.2k+', official: true, category: 'Database' },
  { name: 'redis', description: 'Redis is the world\'s fastest in-memory data store', stars: '12.9k+', official: true, category: 'Cache' },
  { name: 'mongo', description: 'MongoDB document database with scalability and flexibility', stars: '10.4k+', official: true, category: 'Database' },
  { name: 'ubuntu', description: 'Ubuntu is a Debian-based Linux operating system', stars: '16.9k+', official: true, category: 'OS' },
  { name: 'alpine', description: 'A minimal Docker image based on Alpine Linux (~5MB)', stars: '10.8k+', official: true, category: 'OS' },
  { name: 'golang', description: 'Go (golang) is a statically typed, compiled programming language', stars: '5.1k+', official: true, category: 'Runtime' },
  { name: 'php', description: 'Popular general-purpose scripting language for web development', stars: '7.2k+', official: true, category: 'Runtime' },
  { name: 'httpd', description: 'The Apache HTTP Server — the most used web server since 1996', stars: '4.8k+', official: true, category: 'Web Server' },
  { name: 'rabbitmq', description: 'RabbitMQ is an open-source multi-protocol message broker', stars: '5.2k+', official: true, category: 'Queue' },
  { name: 'elasticsearch', description: 'Elasticsearch — distributed, RESTful search and analytics engine', stars: '6.1k+', official: true, category: 'Search' },
  { name: 'grafana/grafana', description: 'The open observability platform for dashboards and visualization', stars: '1.2k+', official: false, category: 'Monitoring' },
  { name: 'jenkins/jenkins', description: 'The leading open source automation server for CI/CD', stars: '6.2k+', official: false, category: 'DevTools' },
  { name: 'wordpress', description: 'WordPress — the most popular CMS powering 40% of the web', stars: '5.0k+', official: true, category: 'CMS' },
  { name: 'caddy', description: 'Powerful enterprise-ready web server with automatic HTTPS', stars: '1.1k+', official: true, category: 'Web Server' },
  { name: 'traefik', description: 'The cloud-native application proxy and load balancer', stars: '3.0k+', official: true, category: 'Web Server' },
  { name: 'portainer/portainer-ce', description: 'Lightweight management UI for Docker, Swarm and Kubernetes', stars: '1.0k+', official: false, category: 'DevTools' },
  { name: 'ghost', description: 'Ghost is a professional publishing platform for modern journalism', stars: '2.0k+', official: true, category: 'CMS' },
  { name: 'mariadb', description: 'MariaDB — community-developed fork of MySQL', stars: '5.8k+', official: true, category: 'Database' },
  { name: 'sonarqube', description: 'SonarQube — code quality and security analysis', stars: '1.5k+', official: true, category: 'DevTools' },
  { name: 'minio/minio', description: 'High-performance, S3-compatible object storage', stars: '1.5k+', official: false, category: 'Storage' },
];

const featuredCategories = ['All', ...Array.from(new Set(featuredImages.map(i => i.category)))];

export default function CloudImage() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pullLoading, setPullLoading] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await api.get<ApiResponse<ImageSearchResult[]>>('/docker/images/search', { params: { q: query } });
      setResults(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

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

  const filteredFeatured = selectedCategory === 'All'
    ? featuredImages
    : featuredImages.filter(i => i.category === selectedCategory);

  const ImageRow = ({ name, description, stars, official, extra }: {
    name: string; description: string; stars: string | number; official: boolean; extra?: React.ReactNode;
  }) => (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      border: `1px solid ${p.cardBorder}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>{name}</span>
          {official && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${p.green}20`, color: p.green, fontWeight: 600, lineHeight: 1,
            }}>OFFICIAL</span>
          )}
          {extra}
          <span style={{ fontSize: 11, color: p.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <StarFilled style={{ fontSize: 10, color: '#faad14' }} /> {stars}
          </span>
        </div>
        <div style={{ fontSize: 12, color: p.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {description || 'No description'}
        </div>
      </div>
      <button
        onClick={() => handlePull(name)}
        disabled={pullLoading === name}
        style={{
          padding: '5px 14px', borderRadius: 6, border: 'none',
          cursor: pullLoading === name ? 'not-allowed' : 'pointer',
          background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
          opacity: pullLoading === name ? 0.5 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}
      >
        <DownloadOutlined /> {pullLoading === name ? 'Pulling...' : 'Pull'}
      </button>
    </div>
  );

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="Search Docker Hub (e.g. nginx, mysql, redis...)"
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) handleClearSearch(); }}
          onPressEnter={handleSearch}
          prefix={<SearchOutlined style={{ color: p.textMuted }} />}
          style={{ flex: 1 }}
          allowClear
          onClear={handleClearSearch}
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

      {searched ? (
        <>
          {/* Search results */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>
              Search Results {results.length > 0 && <span style={{ fontWeight: 400, color: p.textMuted }}>({results.length})</span>}
            </span>
            <button onClick={handleClearSearch} style={{
              padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            }}>
              ← Back to Featured
            </button>
          </div>

          {results.length === 0 && !loading ? (
            <Empty description={`No results found for "${query}"`} style={{ padding: 40 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map(img => (
                <ImageRow key={img.name} name={img.name} description={img.description} stars={img.stars} official={img.official} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Featured images */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FireOutlined style={{ color: '#ff6b35', fontSize: 15 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Popular Images</span>
            <span style={{ fontSize: 11, color: p.textMuted }}>— most used images on Docker Hub</span>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {featuredCategories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
                padding: '4px 12px', borderRadius: 6,
                border: selectedCategory === cat ? 'none' : `1px solid ${p.cardBorder}`,
                background: selectedCategory === cat ? `${p.accent}15` : 'transparent',
                color: selectedCategory === cat ? p.accent : p.textMuted,
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredFeatured.map(img => (
              <ImageRow
                key={img.name}
                name={img.name}
                description={img.description}
                stars={img.stars}
                official={img.official}
                extra={
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                    background: `${p.purple}12`, color: p.purple, fontWeight: 500, lineHeight: 1,
                  }}>{img.category}</span>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
