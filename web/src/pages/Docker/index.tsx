import { useState, useEffect, useCallback } from 'react';
import { Table, Modal, Form, Input, message, Popconfirm, Alert } from 'antd';
import {
  DeleteOutlined, ReloadOutlined, PlayCircleOutlined,
  PauseCircleOutlined, RedoOutlined, CloudServerOutlined, FileImageOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
}

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: string;
}

interface DockerInfo {
  version: string;
  containers: number;
  containers_running: number;
  containers_stopped: number;
  images: number;
  installed: boolean;
}

const defaultInfo: DockerInfo = {
  version: '-', containers: 0, containers_running: 0, containers_stopped: 0, images: 0, installed: false,
};

export default function Docker() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [activeTab, setActiveTab] = useState<string>('containers');
  const [info, setInfo] = useState<DockerInfo>(defaultInfo);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(true);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [pullOpen, setPullOpen] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logsTitle, setLogsTitle] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [pullForm] = Form.useForm();
  const [notInstalled, setNotInstalled] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const { data } = await api.get<ApiResponse<DockerInfo>>('/docker/info');
      if (data.data) {
        setInfo(data.data);
        setNotInstalled(!data.data.installed);
      }
    } catch {
      setNotInstalled(true);
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  const fetchContainers = useCallback(async () => {
    setLoadingContainers(true);
    try {
      const { data } = await api.get<ApiResponse<DockerContainer[]>>('/docker/containers', { params: { all: true } });
      setContainers(data.data ?? []);
    } catch {
      /* ignore if docker not installed */
    } finally {
      setLoadingContainers(false);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const { data } = await api.get<ApiResponse<DockerImage[]>>('/docker/images');
      setImages(data.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchInfo();
    fetchContainers();
    fetchImages();
  }, [fetchInfo, fetchContainers, fetchImages]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const containerAction = async (id: string, action: string) => {
    try {
      await api.post(`/docker/containers/${id}/${action}`);
      message.success(t('common.success'));
      fetchContainers();
      fetchInfo();
    } catch {
      message.error(t('common.error'));
    }
  };

  const viewLogs = async (container: DockerContainer) => {
    setLogsTitle(container.name);
    setLogsOpen(true);
    setLogsLoading(true);
    try {
      const { data } = await api.get<ApiResponse<string>>(`/docker/containers/${container.id}/logs`);
      setLogsContent(data.data ?? 'No logs available');
    } catch {
      setLogsContent('Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handlePullImage = async (values: { image: string }) => {
    setPullLoading(true);
    try {
      await api.post('/docker/images/pull', { image: values.image });
      message.success(t('common.success'));
      setPullOpen(false);
      pullForm.resetFields();
      fetchImages();
      fetchInfo();
    } catch {
      message.error(t('common.error'));
    } finally {
      setPullLoading(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    try {
      await api.delete(`/docker/images/${id}`);
      message.success(t('common.success'));
      fetchImages();
      fetchInfo();
    } catch {
      message.error(t('common.error'));
    }
  };

  const stateColor = (state: string): string => {
    if (state === 'running') return p.green;
    if (state === 'paused') return p.amber;
    return p.red;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const containerColumns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <span style={{ fontWeight: 600, color: p.text }}>{val}</span>,
    },
    { title: 'Image', dataIndex: 'image', key: 'image', ellipsis: true },
    {
      title: t('common.status'),
      key: 'state',
      render: (_: unknown, r: DockerContainer) => {
        const color = stateColor(r.state);
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', borderRadius: 99,
            background: `${color}15`, color, fontSize: 11, fontWeight: 500,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {r.status}
          </span>
        );
      },
    },
    {
      title: 'Ports',
      dataIndex: 'ports',
      key: 'ports',
      ellipsis: true,
      render: (val: string) => val
        ? <span style={{ fontSize: 12 }}>{val}</span>
        : '-',
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      render: (val: string) => val
        ? <span style={{ fontSize: 12, color: p.textMuted }}>{new Date(val).toLocaleString()}</span>
        : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 280,
      render: (_: unknown, r: DockerContainer) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.state !== 'running' && (
            <button onClick={() => containerAction(r.id, 'start')} style={{
              padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.accent, color: '#fff', fontSize: 11, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <PlayCircleOutlined /> {t('common.start')}
            </button>
          )}
          {r.state === 'running' && (
            <button onClick={() => containerAction(r.id, 'stop')} style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <PauseCircleOutlined /> {t('common.stop')}
            </button>
          )}
          <button onClick={() => containerAction(r.id, 'restart')} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <RedoOutlined /> {t('common.restart')}
          </button>
          <button onClick={() => viewLogs(r)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
          }}>
            Logs
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => containerAction(r.id, 'remove')}>
            <button style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <DeleteOutlined />
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const imageColumns = [
    { title: 'Repository', dataIndex: 'repository', key: 'repository' },
    {
      title: 'Tag',
      dataIndex: 'tag',
      key: 'tag',
      render: (val: string) => (
        <span style={{
          fontSize: 11, padding: '2px 9px', borderRadius: 4,
          background: `${p.accent}15`, color: p.accent, fontWeight: 500,
        }}>
          {val || 'latest'}
        </span>
      ),
    },
    {
      title: t('common.size'),
      dataIndex: 'size',
      key: 'size',
      render: (val: number) => <span style={{ fontSize: 12 }}>{formatSize(val)}</span>,
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      render: (val: string) => val
        ? <span style={{ fontSize: 12, color: p.textMuted }}>{new Date(val).toLocaleString()}</span>
        : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, r: DockerImage) => (
        <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDeleteImage(r.id)}>
          <button style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
            background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <DeleteOutlined /> {t('common.delete')}
          </button>
        </Popconfirm>
      ),
    },
  ];

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
              <button onClick={() => message.info('Please install Docker via Terminal or App Store')} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <DownloadOutlined /> {t('common.install')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

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
          {!loadingInfo && (
            <>
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.accent}15`, color: p.accent, fontWeight: 500,
              }}>
                v{info.version}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.green}15`, color: p.green, fontWeight: 500,
              }}>
                {info.containers} containers ({info.containers_running} running)
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
      }}>
        {[
          { key: 'containers', label: 'Containers', icon: <CloudServerOutlined /> },
          { key: 'images', label: 'Images', icon: <FileImageOutlined /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'containers' && (
          <Table columns={containerColumns} dataSource={containers} rowKey="id"
            loading={loadingContainers} pagination={{ pageSize: 10, showSizeChanger: true }} />
        )}
        {activeTab === 'images' && (
          <>
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <button onClick={() => setPullOpen(true)} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
              }}>
                <DownloadOutlined /> Pull Image
              </button>
            </div>
            <Table columns={imageColumns} dataSource={images} rowKey="id"
              loading={loadingImages} pagination={{ pageSize: 10, showSizeChanger: true }} />
          </>
        )}
      </div>

      {/* Pull Image Modal */}
      <Modal
        title="Pull Docker Image"
        open={pullOpen}
        onCancel={() => { setPullOpen(false); pullForm.resetFields(); }}
        onOk={() => pullForm.submit()}
        confirmLoading={pullLoading}
      >
        <Form form={pullForm} layout="vertical" onFinish={handlePullImage}>
          <Form.Item name="image" label="Image" rules={[{ required: true }]}
            extra="e.g. nginx:latest, mysql:8.0, redis:alpine">
            <Input placeholder="nginx:latest" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Logs Modal */}
      <Modal
        title={`Logs — ${logsTitle}`}
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={<button onClick={() => setLogsOpen(false)} style={{
          padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
          background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
          transition: 'all 0.15s',
        }}>{t('common.close')}</button>}
        width={isMobile ? '95%' : 720}
      >
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
          maxHeight: '60vh',
          overflow: 'auto',
          fontSize: isMobile ? 11 : 13,
          
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {logsLoading ? t('common.loading') : logsContent}
        </pre>
      </Modal>
    </div>
  );
}
