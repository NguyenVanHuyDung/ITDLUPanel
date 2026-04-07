import { useState, useEffect, useCallback } from 'react';
import { message, Alert } from 'antd';
import {
  ReloadOutlined, CloudServerOutlined, FileImageOutlined,
  DownloadOutlined, AppstoreOutlined, DashboardOutlined,
  CloudDownloadOutlined, HddOutlined, ApartmentOutlined,
  DatabaseOutlined, BuildOutlined, SafetyOutlined, SettingOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import { useTaskStore } from '@/stores/task';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

import OneClickInstall from './components/OneClickInstall';
import Overview from './components/Overview';
import ContainerList from './components/ContainerList';
import CloudImage from './components/CloudImage';
import LocalImage from './components/LocalImage';
import ComposeList from './components/ComposeList';
import NetworkList from './components/NetworkList';
import VolumeList from './components/VolumeList';
import Repository from './components/Repository';
import Settings from './components/Settings';

interface DockerInfo {
  installed: boolean;
  info?: {
    server_version: string;
    containers: number;
    running: number;
    images: number;
  };
}

const tabs = [
  { key: 'oneclick', label: 'One-Click', icon: <AppstoreOutlined /> },
  { key: 'overview', label: 'Overview', icon: <DashboardOutlined /> },
  { key: 'containers', label: 'Container', icon: <CloudServerOutlined /> },
  { key: 'cloud-image', label: 'Cloud Image', icon: <CloudDownloadOutlined /> },
  { key: 'local-image', label: 'Local Image', icon: <FileImageOutlined /> },
  { key: 'compose', label: 'Compose', icon: <BuildOutlined /> },
  { key: 'network', label: 'Network', icon: <ApartmentOutlined /> },
  { key: 'volume', label: 'Volume', icon: <DatabaseOutlined /> },
  { key: 'repository', label: 'Repository', icon: <SafetyOutlined /> },
  { key: 'settings', label: 'Settings', icon: <SettingOutlined /> },
];

export default function Docker() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const { addTask, setModalOpen: openTaskModal, setActiveTab: setTaskTab } = useTaskStore();
  const tasks = useTaskStore((s) => s.tasks);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [notInstalled, setNotInstalled] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [installing, setInstalling] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const { data } = await api.get<ApiResponse<DockerInfo>>('/docker/info');
      if (data.data) {
        setDockerInfo(data.data);
        setNotInstalled(!data.data.installed);
      }
    } catch {
      setNotInstalled(true);
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  const refreshAll = useCallback(() => {
    fetchInfo();
    setRefreshKey(k => k + 1);
  }, [fetchInfo]);

  const handleInstallDocker = useCallback(async () => {
    setInstalling(true);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
        name: 'docker', version: 'stable',
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        addTask({
          id: taskId, name: 'Install Docker',
          type: 'software_install', status: 'running',
          progress: 0, created_at: new Date().toISOString(),
        });
        openTaskModal(true);
        setTaskTab('tasks');
        message.info('Docker installation started');
      }
    } catch {
      message.error('Failed to start Docker installation');
    } finally {
      setInstalling(false);
    }
  }, [addTask, openTaskModal, setTaskTab]);

  // Auto-refresh when Docker install task completes
  useEffect(() => {
    for (const task of Object.values(tasks)) {
      if (task.type === 'software_install' && task.name === 'Install Docker' && task.status === 'completed') {
        fetchInfo();
        break;
      }
    }
  }, [tasks, fetchInfo]);

  if (notInstalled && !loadingInfo) {
    return (
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.docker')}</span>
        </div>
        <div style={{ padding: 16 }}>
          <Alert
            message="Docker Not Installed"
            description="Docker is not installed or not running on this server. Please install Docker to manage containers."
            type="warning"
            showIcon
            action={
              <button onClick={handleInstallDocker} disabled={installing} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: installing ? 'not-allowed' : 'pointer',
                background: installing ? p.border : p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {installing ? <LoadingOutlined /> : <DownloadOutlined />} {installing ? 'Installing...' : t('common.install')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const info = dockerInfo?.info;

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.docker')}</span>
          {!loadingInfo && info && (
            <>
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.accent}15`, color: p.accent, fontWeight: 500,
              }}>
                v{info.server_version}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.green}15`, color: p.green, fontWeight: 500,
              }}>
                {info.containers} containers ({info.running} running)
              </span>
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.purple}15`, color: p.purple, fontWeight: 500,
              }}>
                {info.images} images
              </span>
            </>
          )}
        </div>
        <button onClick={refreshAll} style={{
          padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
          background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
        }}>
          <ReloadOutlined /> {t('common.refresh')}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '6px 14px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'oneclick' && <OneClickInstall key={refreshKey} onRefresh={refreshAll} />}
        {activeTab === 'overview' && <Overview key={refreshKey} />}
        {activeTab === 'containers' && <ContainerList key={refreshKey} onRefresh={refreshAll} />}
        {activeTab === 'cloud-image' && <CloudImage key={refreshKey} />}
        {activeTab === 'local-image' && <LocalImage key={refreshKey} onRefresh={refreshAll} />}
        {activeTab === 'compose' && <ComposeList key={refreshKey} />}
        {activeTab === 'network' && <NetworkList key={refreshKey} onRefresh={refreshAll} />}
        {activeTab === 'volume' && <VolumeList key={refreshKey} onRefresh={refreshAll} />}
        {activeTab === 'repository' && <Repository key={refreshKey} />}
        {activeTab === 'settings' && <Settings key={refreshKey} />}
      </div>
    </div>
  );
}
