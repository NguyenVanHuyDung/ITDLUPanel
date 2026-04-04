import { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import {
  CloudServerOutlined, CloudOutlined, HddOutlined,
  CheckCircleOutlined, ClockCircleOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import FTPStorageManageModal from '@/components/FTPStorageManageModal';

interface Software {
  name: string;
  display_name: string;
  type: string;
  installed: boolean;
}

interface FTPStorageConfig {
  id: number;
  name: string;
}

interface ProviderCard {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  status: 'installed' | 'not_installed' | 'coming_soon';
  count?: number;
  onManage?: () => void;
}

export default function Storage() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [ftpInstalled, setFtpInstalled] = useState(false);
  const [ftpCount, setFtpCount] = useState(0);
  const [ftpModalOpen, setFtpModalOpen] = useState(false);

  void isDark;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [swRes, storageRes] = await Promise.allSettled([
        api.get('/software'),
        api.get('/ftp-storages'),
      ]);

      if (swRes.status === 'fulfilled') {
        const list: Software[] = swRes.value.data?.data ?? [];
        setFtpInstalled(list.some((s) => s.name === 'ftp_storage' && s.installed));
      }

      if (storageRes.status === 'fulfilled') {
        const storages: FTPStorageConfig[] = storageRes.value.data?.data ?? [];
        setFtpCount(storages.length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const providers: ProviderCard[] = [
    {
      key: 'ftp',
      name: 'FTP Storage',
      description: 'Connect remote FTP servers for off-site backup storage',
      icon: <CloudServerOutlined style={{ fontSize: 28 }} />,
      color: '#1890FF',
      status: ftpInstalled ? 'installed' : 'not_installed',
      count: ftpCount,
      onManage: () => setFtpModalOpen(true),
    },
    {
      key: 'google_drive',
      name: 'Google Drive',
      description: 'Connect Google Drive for cloud backup storage',
      icon: <CloudOutlined style={{ fontSize: 28 }} />,
      color: '#4285F4',
      status: 'coming_soon',
    },
    {
      key: 'onedrive',
      name: 'OneDrive',
      description: 'Connect Microsoft OneDrive for cloud backup storage',
      icon: <HddOutlined style={{ fontSize: 28 }} />,
      color: '#0078D4',
      status: 'coming_soon',
    },
    {
      key: 's3',
      name: 'Amazon S3',
      description: 'Connect Amazon S3 for scalable backup storage',
      icon: <CloudOutlined style={{ fontSize: 28 }} />,
      color: '#FF9900',
      status: 'coming_soon',
    },
  ];

  const statusBadge = (status: ProviderCard['status']) => {
    if (status === 'installed') return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
        background: `${p.green}15`, color: p.green,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <CheckCircleOutlined /> Installed
      </span>
    );
    if (status === 'not_installed') return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
        background: `${p.amber}15`, color: p.amber,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <AppstoreOutlined /> Not Installed
      </span>
    );
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
        background: `${p.purple}15`, color: p.purple,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <ClockCircleOutlined /> Coming Soon
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '12px' : '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: p.text, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CloudServerOutlined style={{ color: p.accent }} />
          Storage
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: p.textMuted }}>
          Manage remote storage for backups
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spin size="large" /></div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {providers.map((prov) => {
            const isComingSoon = prov.status === 'coming_soon';
            return (
              <div key={prov.key} style={{
                background: p.card,
                border: `1px solid ${p.cardBorder}`,
                borderRadius: 12,
                padding: 20,
                position: 'relative',
                opacity: isComingSoon ? 0.55 : 1,
                transition: 'all 0.2s',
                cursor: isComingSoon ? 'default' : 'pointer',
              }}>
                {/* Icon + status row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: `${prov.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: prov.color,
                  }}>
                    {prov.icon}
                  </div>
                  {statusBadge(prov.status)}
                </div>

                {/* Name */}
                <div style={{ fontSize: 15, fontWeight: 600, color: p.text, marginBottom: 6 }}>
                  {prov.name}
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
                  {prov.description}
                </div>

                {/* Count (for FTP) */}
                {prov.status !== 'coming_soon' && prov.count !== undefined && (
                  <div style={{ fontSize: 11, color: p.textDim, marginBottom: 12 }}>
                    {prov.count} connection{prov.count !== 1 ? 's' : ''} configured
                  </div>
                )}

                {/* Action */}
                {prov.status === 'installed' && prov.onManage && (
                  <button onClick={prov.onManage} style={{
                    width: '100%', padding: '8px 0', borderRadius: 7, border: 'none',
                    background: prov.color, color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                    Manage
                  </button>
                )}

                {prov.status === 'not_installed' && (
                  <button onClick={() => window.location.hash = '#/appstore'} style={{
                    width: '100%', padding: '8px 0', borderRadius: 7,
                    border: `1px solid ${p.cardBorder}`,
                    background: p.card, color: p.accent, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                    <AppstoreOutlined style={{ marginRight: 6 }} />
                    Install from AppStore
                  </button>
                )}

                {isComingSoon && (
                  <div style={{
                    width: '100%', padding: '8px 0', borderRadius: 7,
                    border: `1px solid ${p.cardBorder}`,
                    background: p.card, color: p.textDim, fontSize: 12, fontWeight: 500,
                    textAlign: 'center',
                  }}>
                    Coming Soon
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FTPStorageManageModal open={ftpModalOpen} onClose={() => { setFtpModalOpen(false); fetchData(); }} />
    </div>
  );
}
