import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Tabs, Space, Tag, Typography, Row, Col, Statistic, message, Popconfirm, Alert } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, PlayCircleOutlined,
  PauseCircleOutlined, RedoOutlined, CloudServerOutlined, FileImageOutlined,
  InfoCircleOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
    if (state === 'running') return '#52c41a';
    if (state === 'paused') return '#faad14';
    return '#ff4d4f';
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
      render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
    },
    { title: 'Image', dataIndex: 'image', key: 'image', ellipsis: true },
    {
      title: t('common.status'),
      key: 'state',
      render: (_: unknown, r: DockerContainer) => (
        <Space>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: stateColor(r.state) }} />
          {r.status}
        </Space>
      ),
    },
    { title: 'Ports', dataIndex: 'ports', key: 'ports', ellipsis: true, render: (val: string) => val || '-' },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      render: (val: string) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 280,
      render: (_: unknown, r: DockerContainer) => (
        <Space size="small" wrap>
          {r.state !== 'running' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => containerAction(r.id, 'start')}>
              {t('common.start')}
            </Button>
          )}
          {r.state === 'running' && (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => containerAction(r.id, 'stop')}>
              {t('common.stop')}
            </Button>
          )}
          <Button size="small" icon={<RedoOutlined />} onClick={() => containerAction(r.id, 'restart')}>
            {t('common.restart')}
          </Button>
          <Button size="small" onClick={() => viewLogs(r)}>Logs</Button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => containerAction(r.id, 'remove')}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const imageColumns = [
    { title: 'Repository', dataIndex: 'repository', key: 'repository' },
    { title: 'Tag', dataIndex: 'tag', key: 'tag', render: (val: string) => <Tag>{val || 'latest'}</Tag> },
    { title: t('common.size'), dataIndex: 'size', key: 'size', render: (val: number) => formatSize(val) },
    { title: 'Created', dataIndex: 'created', key: 'created', render: (val: string) => val ? new Date(val).toLocaleString() : '-' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, r: DockerImage) => (
        <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDeleteImage(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>{t('common.delete')}</Button>
        </Popconfirm>
      ),
    },
  ];

  if (notInstalled && !loadingInfo) {
    return (
      <div>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.docker')}</Typography.Title>
        <Alert
          message="Docker Not Installed"
          description="Docker is not installed or not running on this server. Please install Docker to manage containers."
          type="warning"
          showIcon
          action={
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => message.info('Please install Docker via Terminal or App Store')}>
              {t('common.install')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.docker')}</Typography.Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card loading={loadingInfo}>
            <Statistic title="Docker Version" value={info.version} prefix={<InfoCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loadingInfo}>
            <Statistic title="Containers" value={info.containers} prefix={<CloudServerOutlined />}
              suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>({info.containers_running} running)</Typography.Text>} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loadingInfo}>
            <Statistic title="Images" value={info.images} prefix={<FileImageOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        extra={<Button icon={<ReloadOutlined />} onClick={refreshAll}>{t('common.refresh')}</Button>}
      >
        <Tabs items={[
          {
            key: 'containers',
            label: <span><CloudServerOutlined /> Containers</span>,
            children: (
              <Table columns={containerColumns} dataSource={containers} rowKey="id" loading={loadingContainers}
                pagination={{ pageSize: 10, showSizeChanger: true }} />
            ),
          },
          {
            key: 'images',
            label: <span><FileImageOutlined /> Images</span>,
            children: (
              <>
                <div style={{ marginBottom: 16, textAlign: 'right' }}>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={() => setPullOpen(true)}>
                    Pull Image
                  </Button>
                </div>
                <Table columns={imageColumns} dataSource={images} rowKey="id" loading={loadingImages}
                  pagination={{ pageSize: 10, showSizeChanger: true }} />
              </>
            ),
          },
        ]} />
      </Card>

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

      <Modal
        title={`Logs — ${logsTitle}`}
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={<Button onClick={() => setLogsOpen(false)}>{t('common.close')}</Button>}
        width={720}
      >
        <pre style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
          maxHeight: '60vh',
          overflow: 'auto',
          fontSize: 13,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {logsLoading ? t('common.loading') : logsContent}
        </pre>
      </Modal>
    </div>
  );
}
