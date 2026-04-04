import { useState, useEffect, useCallback } from 'react';
import { Spin, message, Modal } from 'antd';
import {
  CloudServerOutlined, CloudOutlined, HddOutlined,
  CheckCircleOutlined, DownloadOutlined, SettingOutlined,
  DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTaskStore } from '@/stores/task';
import type { ApiResponse } from '@/types';
import FTPStorageManageModal from '@/components/FTPStorageManageModal';
import S3StorageManageModal from '@/components/S3StorageManageModal';
import GoogleDriveManageModal from '@/components/GoogleDriveManageModal';
import OneDriveManageModal from '@/components/OneDriveManageModal';

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

interface CloudStorage {
  id: number;
  name: string;
  type: string;
}

interface ProviderCard {
  key: string;
  softwareName: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  installed: boolean;
  count: number;
  onManage: () => void;
}

export default function Storage() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [ftpInstalled, setFtpInstalled] = useState(false);
  const [ftpCount, setFtpCount] = useState(0);
  const [ftpModalOpen, setFtpModalOpen] = useState(false);
  const [s3Installed, setS3Installed] = useState(false);
  const [s3Count, setS3Count] = useState(0);
  const [s3ModalOpen, setS3ModalOpen] = useState(false);
  const [gdInstalled, setGdInstalled] = useState(false);
  const [gdCount, setGdCount] = useState(0);
  const [gdModalOpen, setGdModalOpen] = useState(false);
  const [odInstalled, setOdInstalled] = useState(false);
  const [odCount, setOdCount] = useState(0);
  const [odModalOpen, setOdModalOpen] = useState(false);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [uninstallingKey, setUninstallingKey] = useState<string | null>(null);

  const { addTask, setModalOpen: openTaskModal, setActiveTab: setTaskTab } = useTaskStore();
  const tasks = useTaskStore((s) => s.tasks);

  void isDark;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [swRes, storageRes, cloudRes] = await Promise.allSettled([
        api.get('/software'),
        api.get('/ftp-storages'),
        api.get('/cloud-storages'),
      ]);

      if (swRes.status === 'fulfilled') {
        const list: Software[] = swRes.value.data?.data ?? [];
        setFtpInstalled(list.some((s) => s.name === 'ftp_storage' && s.installed));
        setS3Installed(list.some((s) => s.name === 's3_storage' && s.installed));
        setGdInstalled(list.some((s) => s.name === 'google_drive' && s.installed));
        setOdInstalled(list.some((s) => s.name === 'onedrive' && s.installed));
      }

      if (storageRes.status === 'fulfilled') {
        const storages: FTPStorageConfig[] = storageRes.value.data?.data ?? [];
        setFtpCount(storages.length);
      }

      if (cloudRes.status === 'fulfilled') {
        const storages: CloudStorage[] = cloudRes.value.data?.data ?? [];
        setS3Count(storages.filter((s) => s.type === 's3').length);
        setGdCount(storages.filter((s) => s.type === 'google_drive').length);
        setOdCount(storages.filter((s) => s.type === 'onedrive').length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when tasks complete (install/uninstall finishes)
  useEffect(() => {
    const doneCount = Object.values(tasks).filter(t =>
      (t.type === 'software_install' || t.type === 'software_uninstall') && t.status === 'completed'
    ).length;
    if (doneCount > 0) {
      const timer = setTimeout(() => fetchData(), 1000);
      return () => clearTimeout(timer);
    }
  }, [tasks, fetchData]);

  const trackTask = useCallback(
    (taskId: number, name: string, type: 'install' | 'uninstall') => {
      addTask({
        id: taskId, name,
        type: type === 'install' ? 'software_install' : 'software_uninstall',
        status: 'running', progress: 0, created_at: new Date().toISOString(),
      });
      openTaskModal(true);
      setTaskTab('tasks');
    },
    [addTask, openTaskModal, setTaskTab],
  );

  const handleInstall = async (prov: ProviderCard) => {
    setInstallingKey(prov.key);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
        name: prov.softwareName,
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        trackTask(taskId, `Install ${prov.name}`, 'install');
        message.info(`Installing ${prov.name}…`);
      }
    } catch {
      message.error(`Failed to install ${prov.name}`);
    } finally {
      setInstallingKey(null);
    }
  };

  const handleUninstall = (prov: ProviderCard) => {
    Modal.confirm({
      title: `Uninstall ${prov.name}?`,
      icon: <ExclamationCircleOutlined />,
      content: `This will remove ${prov.name}. Your storage configurations will be preserved.`,
      okText: 'Uninstall',
      okButtonProps: { danger: true },
      onOk: async () => {
        setUninstallingKey(prov.key);
        try {
          const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/uninstall', {
            name: prov.softwareName,
          });
          const taskId = data.data?.task_id;
          if (taskId) {
            trackTask(taskId, `Uninstall ${prov.name}`, 'uninstall');
            message.info(`Uninstalling ${prov.name}…`);
          }
        } catch {
          message.error(`Failed to uninstall ${prov.name}`);
        } finally {
          setUninstallingKey(null);
        }
      },
    });
  };

  const providers: ProviderCard[] = [
    {
      key: 'ftp', softwareName: 'ftp_storage',
      name: 'FTP Storage',
      description: 'Connect remote FTP servers for off-site backup storage',
      icon: <CloudServerOutlined style={{ fontSize: 28 }} />,
      color: '#1890FF',
      installed: ftpInstalled, count: ftpCount,
      onManage: () => setFtpModalOpen(true),
    },
    {
      key: 's3', softwareName: 's3_storage',
      name: 'Amazon S3',
      description: 'Connect Amazon S3 or S3-compatible storage for scalable backups',
      icon: <CloudOutlined style={{ fontSize: 28 }} />,
      color: '#FF9900',
      installed: s3Installed, count: s3Count,
      onManage: () => setS3ModalOpen(true),
    },
    {
      key: 'google_drive', softwareName: 'google_drive',
      name: 'Google Drive',
      description: 'Connect Google Drive for cloud backup storage with OAuth',
      icon: <CloudOutlined style={{ fontSize: 28 }} />,
      color: '#4285F4',
      installed: gdInstalled, count: gdCount,
      onManage: () => setGdModalOpen(true),
    },
    {
      key: 'onedrive', softwareName: 'onedrive',
      name: 'OneDrive',
      description: 'Connect Microsoft OneDrive for cloud backup storage',
      icon: <HddOutlined style={{ fontSize: 28 }} />,
      color: '#0078D4',
      installed: odInstalled, count: odCount,
      onManage: () => setOdModalOpen(true),
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '12px' : '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: p.text, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CloudServerOutlined style={{ color: p.accent }} />
            Storage
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: p.textMuted }}>
            Manage remote storage providers for backups
          </p>
        </div>
        <button onClick={fetchData} style={{
          padding: '7px 14px', borderRadius: 7, border: `1px solid ${p.cardBorder}`,
          background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <ReloadOutlined /> Refresh
        </button>
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
            const busy = installingKey === prov.key || uninstallingKey === prov.key;
            return (
              <div key={prov.key} style={{
                background: p.card,
                border: `1px solid ${p.cardBorder}`,
                borderRadius: 12,
                padding: 20,
                position: 'relative',
                transition: 'all 0.2s',
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
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    background: prov.installed ? `${p.green}15` : `${p.textDim}12`,
                    color: prov.installed ? p.green : p.textDim,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {prov.installed ? <><CheckCircleOutlined /> Installed</> : 'Not Installed'}
                  </span>
                </div>

                {/* Name */}
                <div style={{ fontSize: 15, fontWeight: 600, color: p.text, marginBottom: 6 }}>
                  {prov.name}
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
                  {prov.description}
                </div>

                {/* Connection count (only when installed) */}
                {prov.installed && (
                  <div style={{ fontSize: 11, color: p.textDim, marginBottom: 12 }}>
                    {prov.count} connection{prov.count !== 1 ? 's' : ''} configured
                  </div>
                )}

                {/* Actions */}
                {prov.installed ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={prov.onManage} style={{
                      flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
                      background: prov.color, color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <SettingOutlined /> Manage
                    </button>
                    <button onClick={() => handleUninstall(prov)} disabled={busy} style={{
                      padding: '8px 12px', borderRadius: 7,
                      border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: p.red, fontSize: 12,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                      opacity: busy ? 0.5 : 1,
                    }}>
                      <DeleteOutlined />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleInstall(prov)} disabled={busy} style={{
                    width: '100%', padding: '8px 0', borderRadius: 7, border: 'none',
                    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: busy ? 0.7 : 1,
                  }}>
                    {busy ? <Spin size="small" /> : <DownloadOutlined />}
                    Install
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FTPStorageManageModal open={ftpModalOpen} onClose={() => { setFtpModalOpen(false); fetchData(); }} />
      <S3StorageManageModal open={s3ModalOpen} onClose={() => { setS3ModalOpen(false); fetchData(); }} />
      <GoogleDriveManageModal open={gdModalOpen} onClose={() => { setGdModalOpen(false); fetchData(); }} />
      <OneDriveManageModal open={odModalOpen} onClose={() => { setOdModalOpen(false); fetchData(); }} />
    </div>
  );
}
