import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tabs, Card, Row, Col, Button, Tag, Badge, Space, Typography,
  message, Modal, Select, Progress, Empty, Spin, Tooltip,
} from 'antd';
import {
  AppstoreOutlined, CheckCircleOutlined, DownloadOutlined,
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CloudServerOutlined, DatabaseOutlined, CodeOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse, Software } from '@/types';

const { Title, Text, Paragraph } = Typography;

interface AvailableSoftware {
  name: string;
  display_name: string;
  description?: string;
  type: string;
  category?: string;
  versions: string[];
  installed?: boolean;
  icon?: string;
}

interface TaskStatus {
  id: number;
  status: string;
  progress: number;
  name: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  webserver: <CloudServerOutlined />,
  database: <DatabaseOutlined />,
  runtime: <CodeOutlined />,
  cache: <ThunderboltOutlined />,
  default: <AppstoreOutlined />,
};

const SOFTWARE_COLORS: Record<string, string> = {
  nginx: '#009639',
  apache: '#D22128',
  mysql: '#4479A1',
  mariadb: '#003545',
  postgresql: '#336791',
  php: '#777BB4',
  nodejs: '#339933',
  redis: '#DC382D',
  memcached: '#3C7E31',
  python: '#3776AB',
  docker: '#2496ED',
  mongodb: '#47A248',
};

function getStatusBadge(status: number) {
  if (status === 1) return <Badge status="success" text={<Text type="success">Running</Text>} />;
  return <Badge status="error" text={<Text type="secondary">Stopped</Text>} />;
}

export default function AppStore() {
  const { t } = useTranslation();
  const [installed, setInstalled] = useState<Software[]>([]);
  const [available, setAvailable] = useState<AvailableSoftware[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Install modal
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState<AvailableSoftware | null>(null);
  const [installVersion, setInstallVersion] = useState<string>('');
  const [installing, setInstalling] = useState(false);
  const [installTask, setInstallTask] = useState<TaskStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ installed: Software[]; available: AvailableSoftware[] }>>('/software');
      setInstalled(data.data?.installed ?? []);
      setAvailable(data.data?.available ?? []);
    } catch {
      message.error('Failed to load software');
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  const fetchAvailable = useCallback(async () => {
    // Available software is fetched together with installed in fetchInstalled
  }, []);

  useEffect(() => {
    fetchInstalled();
    fetchAvailable();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleServiceAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    if (action === 'stop') {
      Modal.confirm({
        title: `Stop ${name}?`,
        icon: <ExclamationCircleOutlined />,
        content: 'This will stop the service. Active connections may be interrupted.',
        onOk: () => doServiceAction(name, action),
      });
      return;
    }
    await doServiceAction(name, action);
  };

  const doServiceAction = async (name: string, action: string) => {
    setActionLoading((prev) => ({ ...prev, [name]: true }));
    try {
      await api.post(`/software/${name}/${action}`);
      message.success(`${name}: ${action} successful`);
      fetchInstalled();
    } catch {
      message.error(`${name}: ${action} failed`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [name]: false }));
    }
  };

  const openInstallModal = (sw: AvailableSoftware) => {
    setInstallTarget(sw);
    setInstallVersion(sw.versions[sw.versions.length - 1] ?? '');
    setInstallTask(null);
    setInstallModalOpen(true);
  };

  const handleInstall = async () => {
    if (!installTarget) return;
    setInstalling(true);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
        name: installTarget.name,
        version: installVersion,
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        // Poll task status
        setInstallTask({ id: taskId, status: 'running', progress: 0, name: installTarget.display_name });
        pollRef.current = setInterval(async () => {
          try {
            const { data: taskData } = await api.get<ApiResponse<TaskStatus>>(`/tasks/${taskId}`);
            const task = taskData.data;
            setInstallTask(task);
            if (task.status === 'completed' || task.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setInstalling(false);
              if (task.status === 'completed') {
                message.success(`${installTarget.display_name} installed successfully`);
                fetchInstalled();
              } else {
                message.error(`Installation of ${installTarget.display_name} failed`);
              }
            }
          } catch {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setInstalling(false);
          }
        }, 2000);
      } else {
        message.success(`${installTarget.display_name} installed`);
        setInstalling(false);
        setInstallModalOpen(false);
        fetchInstalled();
      }
    } catch {
      message.error(t('common.error'));
      setInstalling(false);
    }
  };

  const isInstalled = (name: string) => installed.some((s) => s.name === name);

  const tabItems = [
    {
      key: 'installed',
      label: <span><CheckCircleOutlined /> Installed ({installed.length})</span>,
      children: (
        <Spin spinning={installedLoading}>
          {installed.length === 0 ? (
            <Empty description="No software installed" />
          ) : (
            <Row gutter={[16, 16]}>
              {installed.map((sw) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={sw.name}>
                  <Card
                    hoverable
                    styles={{ body: { padding: 20 } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: SOFTWARE_COLORS[sw.name] ?? '#1565C0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0,
                      }}>
                        {sw.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ display: 'block' }}>{sw.display_name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>v{sw.version}</Text>
                      </div>
                      {getStatusBadge(sw.status)}
                    </div>
                    <Space wrap size="small">
                      <Tooltip title={t('common.start')}>
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          icon={<PlayCircleOutlined />}
                          loading={actionLoading[sw.name]}
                          disabled={sw.status === 1}
                          onClick={() => handleServiceAction(sw.name, 'start')}
                        >
                          {t('common.start')}
                        </Button>
                      </Tooltip>
                      <Tooltip title={t('common.stop')}>
                        <Button
                          size="small"
                          danger
                          ghost
                          icon={<PauseCircleOutlined />}
                          loading={actionLoading[sw.name]}
                          disabled={sw.status !== 1}
                          onClick={() => handleServiceAction(sw.name, 'stop')}
                        >
                          {t('common.stop')}
                        </Button>
                      </Tooltip>
                      <Tooltip title={t('common.restart')}>
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={actionLoading[sw.name]}
                          onClick={() => handleServiceAction(sw.name, 'restart')}
                        >
                          {t('common.restart')}
                        </Button>
                      </Tooltip>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      ),
    },
    {
      key: 'available',
      label: <span><DownloadOutlined /> Available</span>,
      children: (
        <Spin spinning={availableLoading}>
          {available.length === 0 ? (
            <Empty description="No software available" />
          ) : (
            <Row gutter={[16, 16]}>
              {available.map((sw) => {
                const alreadyInstalled = isInstalled(sw.name);
                const catIcon = CATEGORY_ICONS[sw.type || sw.category || ''] ?? CATEGORY_ICONS.default;
                return (
                  <Col xs={24} sm={12} lg={8} xl={6} key={sw.name}>
                    <Card
                      hoverable={!alreadyInstalled}
                      styles={{ body: { padding: 20 } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: SOFTWARE_COLORS[sw.name] ?? '#1565C0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 22, fontWeight: 700, flexShrink: 0,
                        }}>
                          {sw.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text strong style={{ fontSize: 15 }}>{sw.display_name}</Text>
                          <div><Tag style={{ margin: 0 }}>{catIcon} {sw.type || sw.category}</Tag></div>
                        </div>
                      </div>
                      <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12, minHeight: 40 }}>
                        {sw.description || `${sw.display_name} — ${sw.type || sw.category || 'software'}`}
                      </Paragraph>
                      {alreadyInstalled ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>Installed</Tag>
                      ) : (
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          block
                          onClick={() => openInstallModal(sw)}
                        >
                          {t('common.install')}
                        </Button>
                      )}
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </Spin>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.appstore')}</Title>
      <Tabs
        items={tabItems}
        tabBarExtraContent={
          <Button icon={<ReloadOutlined />} onClick={() => { fetchInstalled(); fetchAvailable(); }}>
            {t('common.refresh')}
          </Button>
        }
      />

      {/* Install Modal */}
      <Modal
        title={<><DownloadOutlined /> Install {installTarget?.display_name}</>}
        open={installModalOpen}
        onCancel={() => { if (!installing) setInstallModalOpen(false); }}
        footer={installTask ? null : [
          <Button key="cancel" onClick={() => setInstallModalOpen(false)}>{t('common.cancel')}</Button>,
          <Button key="install" type="primary" loading={installing} onClick={handleInstall}>
            {t('common.install')}
          </Button>,
        ]}
        closable={!installing}
        maskClosable={!installing}
      >
        {installTask ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin spinning={installTask.status === 'running'}>
              <Title level={5}>
                {installTask.status === 'completed' ? 'Installation Complete' :
                 installTask.status === 'failed' ? 'Installation Failed' :
                 `Installing ${installTarget?.display_name}...`}
              </Title>
              <Progress
                percent={installTask.progress}
                status={
                  installTask.status === 'completed' ? 'success' :
                  installTask.status === 'failed' ? 'exception' : 'active'
                }
              />
            </Spin>
            {(installTask.status === 'completed' || installTask.status === 'failed') && (
              <Button
                type="primary"
                style={{ marginTop: 16 }}
                onClick={() => setInstallModalOpen(false)}
              >
                {t('common.close')}
              </Button>
            )}
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Paragraph>{installTarget?.description}</Paragraph>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Version</Text>
              <Select
                value={installVersion}
                onChange={setInstallVersion}
                style={{ width: '100%' }}
                options={installTarget?.versions.map((v) => ({ value: v, label: `v${v}` })) ?? []}
              />
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
