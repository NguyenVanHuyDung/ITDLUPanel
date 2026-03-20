import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tabs, Card, Row, Col, Button, Tag, Badge, Space, Typography,
  message, Modal, Select, Progress, Empty, Spin, Tooltip, Descriptions, Input, Drawer,
} from 'antd';
import {
  AppstoreOutlined, CheckCircleOutlined, DownloadOutlined,
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CloudServerOutlined, DatabaseOutlined, CodeOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined, SettingOutlined, FileTextOutlined,
  DeleteOutlined, CloseOutlined, MinusOutlined, LoadingOutlined,
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

interface TrackedTask {
  id: number;
  name: string;
  type: 'install' | 'uninstall';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  log: string;
  error?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
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

const MONO_FONT = '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace';

function getStatusBadge(status: number) {
  if (status === 1) return <Badge status="success" text={<Text type="success">Running</Text>} />;
  return <Badge status="error" text={<Text type="secondary">Stopped</Text>} />;
}

function getTaskStatusColor(status: string) {
  switch (status) {
    case 'running': case 'pending': return '#1677ff';
    case 'completed': return '#52c41a';
    case 'failed': return '#ff4d4f';
    default: return '#1677ff';
  }
}

function getTaskProgressStatus(status: string): 'active' | 'success' | 'exception' {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'exception';
    default: return 'active';
  }
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

  // Management modal
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageSW, setManageSW] = useState<Software | null>(null);
  const [swStatus, setSwStatus] = useState<Record<string, string> | null>(null);
  const [swConfig, setSwConfig] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [manageTab, setManageTab] = useState<'status' | 'config'>('status');

  // Task tracking drawer
  const [trackedTasks, setTrackedTasks] = useState<Record<number, TrackedTask>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const pollIntervalsRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});
  const autoCloseTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

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

  // Cleanup all polling intervals and auto-close timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollIntervalsRef.current).forEach(clearInterval);
      Object.values(autoCloseTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  // Auto-scroll log to bottom when active task log updates
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [trackedTasks, activeTaskId]);

  // ---------------------------------------------------------------------------
  // Task tracking (drawer)
  // ---------------------------------------------------------------------------

  const removeTrackedTask = useCallback((taskId: number) => {
    if (pollIntervalsRef.current[taskId]) {
      clearInterval(pollIntervalsRef.current[taskId]);
      delete pollIntervalsRef.current[taskId];
    }
    if (autoCloseTimersRef.current[taskId]) {
      clearTimeout(autoCloseTimersRef.current[taskId]);
      delete autoCloseTimersRef.current[taskId];
    }
    setTrackedTasks((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setActiveTaskId((prev) => (prev === taskId ? null : prev));
  }, []);

  const startTaskPolling = useCallback((taskId: number) => {
    if (pollIntervalsRef.current[taskId]) {
      clearInterval(pollIntervalsRef.current[taskId]);
    }

    const poll = async () => {
      try {
        const [taskRes, logRes] = await Promise.all([
          api.get<ApiResponse<TrackedTask>>(`/tasks/${taskId}`),
          api.get<ApiResponse<{ log: string }>>(`/tasks/${taskId}/log`),
        ]);

        const taskData = taskRes.data.data;
        const logContent = logRes.data.data?.log;

        setTrackedTasks((prev) => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              status: (taskData?.status as TrackedTask['status']) ?? existing.status,
              progress: taskData?.progress ?? existing.progress,
              error: taskData?.error,
              log: logContent ?? (taskData as unknown as { log?: string })?.log ?? existing.log,
              started_at: taskData?.started_at,
              completed_at: taskData?.completed_at,
            },
          };
        });

        if (taskData?.status === 'completed' || taskData?.status === 'failed') {
          if (pollIntervalsRef.current[taskId]) {
            clearInterval(pollIntervalsRef.current[taskId]);
            delete pollIntervalsRef.current[taskId];
          }
          if (taskData.status === 'completed') {
            fetchInstalled();
          }
          // Auto-remove badge 5 s after completion
          autoCloseTimersRef.current[taskId] = setTimeout(() => {
            setTrackedTasks((prev) => {
              const next = { ...prev };
              delete next[taskId];
              return next;
            });
            setActiveTaskId((prev) => (prev === taskId ? null : prev));
            delete autoCloseTimersRef.current[taskId];
          }, 5000);
        }
      } catch {
        // Silently ignore transient polling errors
      }
    };

    poll();
    pollIntervalsRef.current[taskId] = setInterval(poll, 2000);
  }, [fetchInstalled]);

  const addTrackedTask = useCallback(
    (taskId: number, name: string, type: 'install' | 'uninstall') => {
      setTrackedTasks((prev) => ({
        ...prev,
        [taskId]: { id: taskId, name, type, status: 'running', progress: 0, log: '' },
      }));
      setActiveTaskId(taskId);
      setDrawerOpen(true);
      setDrawerCollapsed(false);
      startTaskPolling(taskId);
    },
    [startTaskPolling],
  );

  const taskList = Object.values(trackedTasks);
  const hasActiveTasks = taskList.length > 0;
  const activeTask =
    activeTaskId != null && trackedTasks[activeTaskId]
      ? trackedTasks[activeTaskId]
      : taskList[0] ?? null;

  // ---------------------------------------------------------------------------
  // Service actions
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Install / Uninstall
  // ---------------------------------------------------------------------------

  const openInstallModal = (sw: AvailableSoftware) => {
    setInstallTarget(sw);
    setInstallVersion(sw.versions[sw.versions.length - 1] ?? '');
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
        addTrackedTask(taskId, `Install ${installTarget.display_name}`, 'install');
        setInstallModalOpen(false);
        message.info(`Installation of ${installTarget.display_name} started`);
      } else {
        message.success(`${installTarget.display_name} installed`);
        setInstallModalOpen(false);
        fetchInstalled();
      }
    } catch {
      message.error(t('common.error'));
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = useCallback(
    (sw: Software | { name: string; display_name: string }) => {
      Modal.confirm({
        title: `Uninstall ${sw.display_name}?`,
        icon: <ExclamationCircleOutlined />,
        content: `This will completely remove ${sw.display_name} and all its configuration. This action cannot be undone.`,
        okText: 'Uninstall',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const { data } = await api.delete<ApiResponse<{ task_id: number }>>(
              `/software/${sw.name}`,
            );
            const taskId = data.data?.task_id;
            if (taskId) {
              addTrackedTask(taskId, `Uninstall ${sw.display_name}`, 'uninstall');
              message.info(`Uninstalling ${sw.display_name}…`);
              setManageModalOpen(false);
            } else {
              message.success(`${sw.display_name} uninstalled`);
              fetchInstalled();
            }
          } catch {
            message.error(`Failed to uninstall ${sw.display_name}`);
          }
        },
      });
    },
    [addTrackedTask, fetchInstalled],
  );

  // ---------------------------------------------------------------------------
  // Management modal
  // ---------------------------------------------------------------------------

  const openManageModal = async (sw: Software) => {
    setManageSW(sw);
    setManageTab('status');
    setSwStatus(null);
    setSwConfig('');
    setManageModalOpen(true);
    try {
      const { data } = await api.get(`/software/${sw.name}/status`);
      setSwStatus(data.data);
    } catch {
      setSwStatus({ error: 'Could not fetch status' });
    }
  };

  const fetchConfig = async () => {
    if (!manageSW) return;
    setConfigLoading(true);
    try {
      const { data } = await api.get(`/software/${manageSW.name}/config`);
      setSwConfig(data.data?.content ?? '');
    } catch {
      setSwConfig('# Config file not found or not supported for this software');
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!manageSW) return;
    setSavingConfig(true);
    try {
      await api.put(`/software/${manageSW.name}/config`, { content: swConfig });
      message.success('Configuration saved. Restart the service to apply changes.');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const isInstalled = (name: string) => installed.some((s) => s.name === name);

  // ---------------------------------------------------------------------------
  // Tab content
  // ---------------------------------------------------------------------------

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
                    onClick={() => openManageModal(sw)}
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
                    <Space wrap size="small" onClick={(e) => e.stopPropagation()}>
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
                      <Tooltip title="Uninstall">
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleUninstall(sw)}
                        >
                          Uninstall
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

      {/* ── Install Modal ─────────────────────────────────────────────────── */}
      <Modal
        title={<><DownloadOutlined /> Install {installTarget?.display_name}</>}
        open={installModalOpen}
        onCancel={() => { if (!installing) setInstallModalOpen(false); }}
        footer={[
          <Button key="cancel" disabled={installing} onClick={() => setInstallModalOpen(false)}>
            {t('common.cancel')}
          </Button>,
          <Button key="install" type="primary" loading={installing} onClick={handleInstall}>
            {t('common.install')}
          </Button>,
        ]}
        closable={!installing}
        maskClosable={!installing}
      >
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
      </Modal>

      {/* ── Software Management Modal ─────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: SOFTWARE_COLORS[manageSW?.name ?? ''] ?? '#1565C0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16, fontWeight: 700,
            }}>
              {manageSW?.display_name?.charAt(0).toUpperCase()}
            </div>
            <span>{manageSW?.display_name} Management</span>
          </Space>
        }
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        width={700}
        footer={null}
      >
        {manageSW && (
          <Tabs
            activeKey={manageTab}
            onChange={(key) => {
              setManageTab(key as 'status' | 'config');
              if (key === 'config' && !swConfig) fetchConfig();
            }}
            items={[
              {
                key: 'status',
                label: <span><SettingOutlined /> Status</span>,
                children: (
                  <div>
                    <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="Name">{manageSW.display_name}</Descriptions.Item>
                      <Descriptions.Item label="Version">{manageSW.version}</Descriptions.Item>
                      <Descriptions.Item label="Type"><Tag>{manageSW.type}</Tag></Descriptions.Item>
                      <Descriptions.Item label="Status">{getStatusBadge(manageSW.status)}</Descriptions.Item>
                      {swStatus && !swStatus.error && (
                        <>
                          {swStatus.ActiveState && <Descriptions.Item label="Active State"><Tag color={swStatus.ActiveState === 'active' ? 'success' : 'default'}>{swStatus.ActiveState}</Tag></Descriptions.Item>}
                          {swStatus.SubState && <Descriptions.Item label="Sub State">{swStatus.SubState}</Descriptions.Item>}
                          {swStatus.MainPID && swStatus.MainPID !== '0' && <Descriptions.Item label="Main PID">{swStatus.MainPID}</Descriptions.Item>}
                          {swStatus.MemoryCurrent && swStatus.MemoryCurrent !== '18446744073709551615' && (
                            <Descriptions.Item label="Memory">{(parseInt(swStatus.MemoryCurrent) / 1024 / 1024).toFixed(1)} MB</Descriptions.Item>
                          )}
                          {swStatus.ActiveEnterTimestamp && <Descriptions.Item label="Started">{swStatus.ActiveEnterTimestamp}</Descriptions.Item>}
                        </>
                      )}
                      {swStatus?.error && <Descriptions.Item label="Error"><Text type="danger">{swStatus.error}</Text></Descriptions.Item>}
                    </Descriptions>
                    <Space wrap>
                      <Button
                        type="primary"
                        ghost
                        icon={<PlayCircleOutlined />}
                        loading={actionLoading[manageSW.name]}
                        disabled={manageSW.status === 1}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'start');
                          openManageModal({ ...manageSW, status: 1 });
                        }}
                      >
                        {t('common.start')}
                      </Button>
                      <Button
                        danger
                        ghost
                        icon={<PauseCircleOutlined />}
                        loading={actionLoading[manageSW.name]}
                        disabled={manageSW.status !== 1}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'stop');
                          openManageModal({ ...manageSW, status: 0 });
                        }}
                      >
                        {t('common.stop')}
                      </Button>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={actionLoading[manageSW.name]}
                        onClick={async () => {
                          await doServiceAction(manageSW.name, 'restart');
                          openManageModal({ ...manageSW, status: 1 });
                        }}
                      >
                        {t('common.restart')}
                      </Button>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleUninstall(manageSW)}
                      >
                        Uninstall
                      </Button>
                    </Space>
                  </div>
                ),
              },
              {
                key: 'config',
                label: <span><FileTextOutlined /> Configuration</span>,
                children: (
                  <Spin spinning={configLoading}>
                    <Input.TextArea
                      value={swConfig}
                      onChange={(e) => setSwConfig(e.target.value)}
                      rows={18}
                      style={{ fontFamily: MONO_FONT, fontSize: 13 }}
                    />
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <Button type="primary" loading={savingConfig} onClick={saveConfig}>
                        Save Configuration
                      </Button>
                    </div>
                  </Spin>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* ── Task Progress Drawer ──────────────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            {taskList.some((tk) => tk.status === 'running' || tk.status === 'pending') && (
              <LoadingOutlined />
            )}
            <span>Task Progress ({taskList.length})</span>
          </Space>
        }
        extra={
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<MinusOutlined />}
              onClick={() => setDrawerCollapsed(true)}
            />
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => {
                taskList.forEach((tk) => removeTrackedTask(tk.id));
                setDrawerOpen(false);
              }}
            />
          </Space>
        }
        placement="bottom"
        height={300}
        open={hasActiveTasks && drawerOpen && !drawerCollapsed}
        mask={false}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ display: 'flex', height: '100%' }}>
          {/* Task sidebar (shown when multiple tasks) */}
          {taskList.length > 1 && (
            <div style={{
              width: 220,
              borderRight: '1px solid #f0f0f0',
              overflowY: 'auto',
              flexShrink: 0,
            }}>
              {taskList.map((tk) => (
                <div
                  key={tk.id}
                  onClick={() => setActiveTaskId(tk.id)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: activeTask?.id === tk.id ? '#f0f5ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    transition: 'background 0.2s',
                  }}
                >
                  <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>
                    {tk.name}
                  </Text>
                  <Progress
                    percent={tk.progress}
                    size="small"
                    status={getTaskProgressStatus(tk.status)}
                    style={{ marginBottom: 0 }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Active task detail */}
          {activeTask && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Text strong>{activeTask.name}</Text>
                  <Tag
                    color={
                      activeTask.status === 'running' ? 'processing' :
                      activeTask.status === 'completed' ? 'success' :
                      activeTask.status === 'failed' ? 'error' : 'default'
                    }
                  >
                    {activeTask.status}
                  </Tag>
                </div>
                <Progress
                  percent={activeTask.progress}
                  status={getTaskProgressStatus(activeTask.status)}
                  size="small"
                  style={{ marginBottom: 0, marginTop: 4 }}
                />
              </div>
              <div
                ref={logContainerRef}
                style={{
                  flex: 1,
                  background: '#1a1a2e',
                  color: '#e0e0e0',
                  fontFamily: MONO_FONT,
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: '12px 16px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {activeTask.log ||
                  (activeTask.status === 'pending'
                    ? 'Waiting to start…'
                    : 'Loading logs…')}
                {activeTask.error && (
                  <div style={{ color: '#ff4d4f', marginTop: 8 }}>
                    Error: {activeTask.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* ── Collapsed floating badges ─────────────────────────────────────── */}
      {hasActiveTasks && drawerCollapsed && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {taskList.map((tk) => (
            <div
              key={tk.id}
              onClick={() => {
                setActiveTaskId(tk.id);
                setDrawerCollapsed(false);
                setDrawerOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                borderRadius: 20,
                background: getTaskStatusColor(tk.status),
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                fontSize: 13,
                fontWeight: 500,
                transition: 'all 0.3s',
                maxWidth: 280,
              }}
            >
              {tk.status === 'running' || tk.status === 'pending' ? (
                <LoadingOutlined />
              ) : tk.status === 'completed' ? (
                <CheckCircleOutlined />
              ) : (
                <ExclamationCircleOutlined />
              )}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tk.name}
              </span>
              <span>{tk.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
