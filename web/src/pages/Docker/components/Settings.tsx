import { useState, useEffect, useCallback } from 'react';
import { message, Descriptions, Switch, Input, Alert } from 'antd';
import {
  SettingOutlined, ReloadOutlined, PoweroffOutlined, PlayCircleOutlined,
  SaveOutlined, DownloadOutlined,
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

export default function Settings() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [installed, setInstalled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mirrors, setMirrors] = useState('');

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ installed: boolean; info?: DockerInfo }>>('/docker/info');
      setInstalled(data.data?.installed ?? false);
      if (data.data?.info) setInfo(data.data.info);
    } catch {
      setInstalled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  const formatMemory = (bytes: number) => {
    if (!bytes) return '-';
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>Loading...</div>;
  }

  if (!installed) {
    return (
      <Alert
        message="Docker Not Installed"
        description="Docker Engine is not installed or the daemon is not running. Install Docker to manage containers."
        type="warning"
        showIcon
        style={{ borderRadius: 8 }}
        action={
          <button onClick={() => message.info('Install Docker via terminal: curl -fsSL https://get.docker.com | sh')} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <DownloadOutlined /> Install Guide
          </button>
        }
      />
    );
  }

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
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Docker Daemon Status</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
              background: `${p.green}15`, color: p.green,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.green }} />
              Running
            </span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
            <Descriptions.Item label="Version">{info?.server_version ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Storage Driver">{info?.driver ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Operating System">{info?.os ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Architecture">{info?.arch ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="CPUs">{info?.ncpu ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Total Memory">{info ? formatMemory(info.mem_total) : '-'}</Descriptions.Item>
            <Descriptions.Item label="Docker Root Dir" span={2}>
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
          Registry Mirrors
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 8 }}>
            Add registry mirrors to speed up image pulls. One URL per line.
          </div>
          <Input.TextArea
            rows={3}
            value={mirrors}
            onChange={e => setMirrors(e.target.value)}
            placeholder="https://mirror.example.com&#10;https://registry.example.io"
            style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
          />
          <button onClick={() => message.info('Mirror configuration will be saved to /etc/docker/daemon.json')} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <SaveOutlined /> Save Mirrors
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
          Quick Actions
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => message.info('Run: systemctl restart docker')} style={{
            padding: '8px 18px', borderRadius: 8, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.text, fontSize: 13, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <ReloadOutlined /> Restart Docker
          </button>
          <button onClick={() => message.info('Run: systemctl stop docker')} style={{
            padding: '8px 18px', borderRadius: 8, border: `1px solid ${p.red}`,
            background: 'transparent', color: p.red, fontSize: 13, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <PoweroffOutlined /> Stop Docker
          </button>
        </div>
      </div>
    </div>
  );
}
