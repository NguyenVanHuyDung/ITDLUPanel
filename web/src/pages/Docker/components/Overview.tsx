import { useState, useEffect, useCallback } from 'react';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import {
  CloudServerOutlined, FileImageOutlined, ApartmentOutlined,
  DatabaseOutlined, HddOutlined,
} from '@ant-design/icons';

interface DockerInfo {
  server_version: string;
  ncpu: number;
  mem_total: number;
  containers: number;
  running: number;
  paused: number;
  stopped: number;
  images: number;
  driver: string;
  docker_root: string;
  os: string;
  arch: string;
}

interface DiskUsage {
  images_count: number;
  images_size: number;
  containers_count: number;
  containers_size: number;
  volumes_count: number;
  volumes_size: number;
  build_cache_size: number;
}

const formatSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatMemory = (bytes: number) => {
  if (!bytes) return '-';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export default function Overview() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkCount, setNetworkCount] = useState(0);
  const [volumeCount, setVolumeCount] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [infoRes, dfRes, netRes, volRes] = await Promise.allSettled([
        api.get<ApiResponse<{ installed: boolean; info: DockerInfo }>>('/docker/info'),
        api.get<ApiResponse<DiskUsage>>('/docker/system/df'),
        api.get<ApiResponse<{ id: string }[]>>('/docker/networks'),
        api.get<ApiResponse<{ name: string }[]>>('/docker/volumes'),
      ]);

      if (infoRes.status === 'fulfilled' && infoRes.value.data.data?.info) {
        setInfo(infoRes.value.data.data.info);
      }
      if (dfRes.status === 'fulfilled' && dfRes.value.data.data) {
        setDiskUsage(dfRes.value.data.data);
      }
      if (netRes.status === 'fulfilled') {
        const nets = netRes.value.data.data;
        setNetworkCount(Array.isArray(nets) ? nets.length : 0);
      }
      if (volRes.status === 'fulfilled') {
        const vols = volRes.value.data.data;
        setVolumeCount(Array.isArray(vols) ? vols.length : 0);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const StatCard = ({ icon, label, value, sub, color }: {
    icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
  }) => (
    <div style={{
      flex: '1 1 180px', padding: '16px 20px', borderRadius: 10,
      border: `1px solid ${p.cardBorder}`,
      background: isDark ? `${color}08` : `${color}06`,
      minWidth: isMobile ? '100%' : 180,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color, fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 12, color: p.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: p.text, lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: p.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>Loading overview...</div>;
  }

  return (
    <div>
      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard
          icon={<CloudServerOutlined />} label="Containers" color={p.green}
          value={info?.containers ?? 0}
          sub={`${info?.running ?? 0} running · ${info?.paused ?? 0} paused · ${info?.stopped ?? 0} stopped`}
        />
        <StatCard
          icon={<FileImageOutlined />} label="Images" color={p.purple}
          value={info?.images ?? 0}
          sub={diskUsage ? `Total: ${formatSize(diskUsage.images_size)}` : undefined}
        />
        <StatCard
          icon={<ApartmentOutlined />} label="Networks" color={p.cyan}
          value={networkCount}
        />
        <StatCard
          icon={<DatabaseOutlined />} label="Volumes" color={p.amber}
          value={volumeCount}
          sub={diskUsage ? `Total: ${formatSize(diskUsage.volumes_size)}` : undefined}
        />
      </div>

      {/* Docker Info */}
      {info && (
        <div style={{
          borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
            background: p.headerBg, fontSize: 13, fontWeight: 600, color: p.text,
          }}>
            Docker Engine Info
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px 24px' }}>
              {[
                ['Version', info.server_version],
                ['Storage Driver', info.driver],
                ['OS', info.os],
                ['Architecture', info.arch],
                ['CPUs', String(info.ncpu)],
                ['Memory', formatMemory(info.mem_total)],
                ['Docker Root', info.docker_root],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: `1px solid ${p.cardBorder}22` }}>
                  <span style={{ fontSize: 12, color: p.textMuted, minWidth: 120, fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 12, color: p.text, fontFamily: 'inherit' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Disk Usage */}
          {diskUsage && (
            <>
              <div style={{
                padding: '10px 16px', borderTop: `1px solid ${p.cardBorder}`,
                borderBottom: `1px solid ${p.cardBorder}`,
                background: p.headerBg, fontSize: 13, fontWeight: 600, color: p.text,
              }}>
                Disk Usage
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Images', count: diskUsage.images_count, size: diskUsage.images_size, color: p.purple },
                    { label: 'Containers', count: diskUsage.containers_count, size: diskUsage.containers_size, color: p.green },
                    { label: 'Volumes', count: diskUsage.volumes_count, size: diskUsage.volumes_size, color: p.amber },
                    { label: 'Build Cache', count: null, size: diskUsage.build_cache_size, color: p.cyan },
                  ].map(item => (
                    <div key={item.label} style={{
                      flex: '1 1 120px', padding: '10px 14px', borderRadius: 8,
                      border: `1px solid ${p.cardBorder}`, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{formatSize(item.size)}</div>
                      {item.count !== null && (
                        <div style={{ fontSize: 10, color: p.textMuted }}>{item.count} items</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
