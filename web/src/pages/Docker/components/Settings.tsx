import { useState, useEffect, useCallback, useRef } from 'react';
import { message, Descriptions, Input, Alert, Popconfirm } from 'antd';
import {
  SettingOutlined, ReloadOutlined, PoweroffOutlined,
  SaveOutlined, DownloadOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

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

type DaemonStatus = 'unknown' | 'running' | 'stopped';

export default function Settings() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [installed, setInstalled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mirrors, setMirrors] = useState('');
  const [savingMirrors, setSavingMirrors] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>('unknown');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!isRefreshing) setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ installed: boolean; info?: DockerInfo }>>('/docker/info');
      setInstalled(data.data?.installed ?? false);
      if (data.data?.info) {
        setInfo(data.data.info);
        setDaemonStatus('running');
      } else {
        setDaemonStatus('stopped');
      }
    } catch {
      setInstalled(false);
      setDaemonStatus('stopped');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponse<{ mirrors: string[] }>>('/docker/system/config');
      const m = data.data?.mirrors ?? [];
      setMirrors(m.join('\n'));
    } catch { /* ignore - config may not exist yet */ }
  }, []);

  useEffect(() => { fetchInfo(); fetchConfig(); }, [fetchInfo, fetchConfig]);

  const refreshWithState = useCallback(() => {
    setIsRefreshing(true);
    fetchInfo();
  }, [fetchInfo]);

  const formatMemory = (bytes: number) => {
    if (!bytes) return '-';
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleSaveMirrors = async () => {
    setSavingMirrors(true);
    try {
      const mirrorList = mirrors.split('\n').map(m => m.trim()).filter(Boolean);
      await api.put('/docker/system/config', { mirrors: mirrorList });
      message.success(t('docker.mirrors_saved'));
      fetchConfig();
    } catch {
      message.error(t('docker.mirrors_save_failed'));
    } finally {
      setSavingMirrors(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    setDaemonStatus('stopped');
    try {
      await api.post('/docker/system/restart');
      message.success(t('docker.docker_restarted'));
      setTimeout(() => refreshWithState(), 3000);
    } catch {
      message.error(t('docker.docker_restart_failed'));
      setRestarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    setDaemonStatus('stopped');
    try {
      await api.post('/docker/system/stop');
      message.success(t('docker.docker_stopped'));
      setTimeout(() => refreshWithState(), 2000);
    } catch {
      message.error(t('docker.docker_stop_failed'));
      setStopping(false);
    }
  };

  const statusColor = (status: DaemonStatus): string => {
    if (status === 'running') return p.green;
    if (status === 'stopped') return p.red;
    return p.textMuted;
  };

  const statusLabel = (status: DaemonStatus): string => {
    if (status === 'running') return t('docker.running');
    if (status === 'stopped') return t('docker.stopped');
    return t('docker.unknown');
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>{t('common.loading')}</div>;
  }

  if (!installed) {
    return (
      <Alert
        message={t('docker.not_installed')}
        description={t('docker.not_installed_desc')}
        type="warning"
        showIcon
        style={{ borderRadius: 8 }}
        action={
          <button onClick={() => message.info(t('docker.install_cmd'))} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <DownloadOutlined /> {t('docker.install_guide')}
          </button>
        }
      />
    );
  }

  const actualDaemonStatus: DaemonStatus = restarting ? 'stopped' : stopping ? 'stopped' : daemonStatus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Docker Status */}
      <div style={{
        borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{t('docker.daemon_status')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
              background: `${statusColor(actualDaemonStatus)}15`, color: statusColor(actualDaemonStatus), lineHeight: 1,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(actualDaemonStatus) }} />
              {statusLabel(actualDaemonStatus)}
            </span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
            <Descriptions.Item label={t('docker.version')}>{info?.server_version ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.storage_driver')}>{info?.driver ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.operating_system')}>{info?.os ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.architecture')}>{info?.arch ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.cpus')}>{info?.ncpu ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.total_memory')}>{info ? formatMemory(info.mem_total) : '-'}</Descriptions.Item>
            <Descriptions.Item label={t('docker.docker_root_dir')} span={2}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{info?.docker_root ?? '-'}</span>
            </Descriptions.Item>
          </Descriptions>
        </div>
      </div>

      {/* Registry Mirrors */}
      <div style={{
        borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg, fontSize: 13, fontWeight: 600, color: p.text,
        }}>
          {t('docker.registry_mirrors')}
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 8 }}>
            {t('docker.registry_mirrors_desc')}
          </div>
          <Input.TextArea
            rows={3}
            value={mirrors}
            onChange={e => setMirrors(e.target.value)}
            placeholder={t('docker.registry_mirrors_placeholder')}
            style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
          />
          <button onClick={handleSaveMirrors} disabled={savingMirrors} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: savingMirrors ? 'not-allowed' : 'pointer',
            background: savingMirrors ? p.cardBorder : p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {savingMirrors ? <LoadingOutlined /> : <SaveOutlined />} {savingMirrors ? t('docker.saving') : t('docker.save_mirrors')}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg, fontSize: 13, fontWeight: 600, color: p.text,
        }}>
          {t('docker.quick_actions')}
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Popconfirm title={t('docker.restart_confirm')} onConfirm={handleRestart}>
            <button disabled={restarting || stopping} style={{
              padding: '8px 18px', borderRadius: 8, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.text, fontSize: 13, cursor: restarting || stopping ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              opacity: restarting || stopping ? 0.6 : 1,
            }}>
              {restarting ? <LoadingOutlined /> : <ReloadOutlined />} {restarting ? t('docker.restarting') : t('docker.restart_docker')}
            </button>
          </Popconfirm>
          <Popconfirm title={t('docker.stop_confirm')} onConfirm={handleStop}>
            <button disabled={restarting || stopping} style={{
              padding: '8px 18px', borderRadius: 8, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 13, cursor: restarting || stopping ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              opacity: restarting || stopping ? 0.6 : 1,
            }}>
              {stopping ? <LoadingOutlined /> : <PoweroffOutlined />} {stopping ? t('docker.stopping') : t('docker.stop_docker')}
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}
