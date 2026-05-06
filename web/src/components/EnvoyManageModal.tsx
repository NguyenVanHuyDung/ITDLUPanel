import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Table, Tag, Form, Input, Select, Popconfirm, Descriptions, Badge, Divider, InputNumber } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, DashboardOutlined, FileTextOutlined,
  CloudServerOutlined, DeleteOutlined, PlusOutlined,
  ApiOutlined, GatewayOutlined, SafetyOutlined,
  CheckCircleOutlined, WarningOutlined, ReloadOutlined as ReloadSpinIcon,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

const PRIMARY = '#E0156B';
const PRIMARY_LIGHT = '#FCE4EC';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const WARNING = '#FF9800';
const ERROR = '#F44336';

const SECTIONS = [
  { key: 'service',   label: 'Service',       icon: <CloudServerOutlined /> },
  { key: 'config',    label: 'Configuration', icon: <CodeOutlined /> },
  { key: 'clusters',  label: 'Clusters',        icon: <ApiOutlined /> },
  { key: 'listeners', label: 'Listeners',       icon: <GatewayOutlined /> },
  { key: 'stats',     label: 'Stats',           icon: <DashboardOutlined /> },
  { key: 'errorlog',  label: 'Error Log',       icon: <FileTextOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

interface EnvoyCluster {
  name: string;
  type: string;
  lb_policy?: string;
  connect_timeout?: string;
}

interface EnvoyListener {
  name: string;
  address?: {
    socket_address?: {
      address: string;
      port_value: number;
    };
  };
}

interface EnvoyStats {
  [key: string]: string | number;
}

// ============================================================================
// Main Modal
// ============================================================================
export default function EnvoyManageModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [section, setSection] = useState<SectionKey>('service');
  const [loading, setLoading] = useState(false);

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? PRIMARY : TEXT_PRIMARY,
    background: active ? PRIMARY_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${PRIMARY}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${PRIMARY}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const renderContent = () => {
    switch (section) {
      case 'service':   return <ServiceTab />;
      case 'config':    return <ConfigTab />;
      case 'clusters':  return <ClustersTab />;
      case 'listeners': return <ListenersTab />;
      case 'stats':     return <StatsTab />;
      case 'errorlog':  return <ErrorLogTab />;
      default:          return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <svg viewBox="0 0 32 32" width={20} height={20} style={{ flexShrink: 0 }}>
            <rect width="32" height="32" rx={4} fill={PRIMARY} />
            <circle cx="16" cy="16" r="9" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="16" cy="16" r="4" fill="white" />
            <path d="M16 7v2M16 23v2M7 16h2M23 16h2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Envoy Proxy Management</span>
        </Space>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', height: '72vh' }}>
        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 180,
          borderRight: `1px solid ${BORDER}`,
          background: isDark ? 'rgba(255,255,255,0.02)' : '#FAFBFC',
          display: isMobile ? 'flex' : 'block',
          overflowX: isMobile ? 'auto' : 'visible',
          flexShrink: 0,
        }}>
          {SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarStyle(section === s.key)}
              onClick={() => setSection(s.key)}
            >
              <span style={{ fontSize: 14 }}>{s.icon}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Service Tab
// ============================================================================
function ServiceTab() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<Record<string, string> | null>(null);
  const [serverInfo, setServerInfo] = useState<Record<string, unknown> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sData } = await api.get('/software/envoy/status');
      setStatus(sData.data || {});
      const { data: siData } = await api.get('/software/envoy/server-info');
      setServerInfo(siData.data || null);
    } catch {
      message.error('Failed to fetch envoy status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const doAction = async (action: string) => {
    setActionLoading(true);
    try {
      await api.post(`/software/envoy/${action}`);
      message.success(`Envoy ${action} successful`);
      fetchStatus();
    } catch {
      message.error(`Envoy ${action} failed`);
    } finally {
      setActionLoading(false);
    }
  };

  const isRunning = status?.ActiveState === 'active';

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: isRunning ? `${SUCCESS}12` : `${ERROR}12`,
          border: `1px solid ${isRunning ? SUCCESS : ERROR}30`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: 6,
            background: isRunning ? SUCCESS : ERROR,
            boxShadow: isRunning ? `0 0 8px ${SUCCESS}` : 'none',
          }} />
          <div>
            <div style={{ fontWeight: 600, color: p.text }}>
              {isRunning ? 'Envoy Proxy is Running' : 'Envoy Proxy is Stopped'}
            </div>
            {status?.MainPID && status.MainPID !== '0' && (
              <div style={{ fontSize: 12, color: p.textMuted }}>
                PID: {status.MainPID}
              </div>
            )}
          </div>
        </div>
      </div>

      <Descriptions bordered size="small" column={isMobile ? 1 : 2} style={{ marginBottom: 20 }}>
        {serverInfo && Object.entries(serverInfo).map(([key, value]) => (
          <Descriptions.Item key={key} label={key}>
            <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(value)}</Text>
          </Descriptions.Item>
        ))}
        {status?.ActiveState && (
          <Descriptions.Item label="Active State">
            <Tag color={status.ActiveState === 'active' ? 'success' : 'default'}>{status.ActiveState}</Tag>
          </Descriptions.Item>
        )}
        {status?.SubState && (
          <Descriptions.Item label="Sub State">{status.SubState}</Descriptions.Item>
        )}
        {status?.MemoryCurrent && status.MemoryCurrent !== '18446744073709551615' && (
          <Descriptions.Item label="Memory">
            {(parseInt(status.MemoryCurrent) / 1024 / 1024).toFixed(1)} MB
          </Descriptions.Item>
        )}
        {status?.ActiveEnterTimestamp && (
          <Descriptions.Item label="Uptime">{status.ActiveEnterTimestamp}</Descriptions.Item>
        )}
      </Descriptions>

      <Space wrap>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={actionLoading}
          disabled={isRunning}
          onClick={() => doAction('start')}
          style={{ background: SUCCESS, borderColor: SUCCESS }}
        >Start</Button>
        <Button
          danger
          icon={<PauseCircleOutlined />}
          loading={actionLoading}
          disabled={!isRunning}
          onClick={() => doAction('stop')}
        >Stop</Button>
        <Button
          icon={<ReloadOutlined />}
          loading={actionLoading}
          onClick={() => doAction('restart')}
        >Restart</Button>
        <Button
          icon={<ReloadSpinIcon />}
          loading={loading}
          onClick={fetchStatus}
        >Refresh</Button>
      </Space>

      <Divider />

      <div style={{ fontSize: 12, color: p.textMuted }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Default Ports:</div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><code>:8080</code> — HTTP listener</li>
          <li><code>:8443</code> — HTTPS listener</li>
          <li><code>:9901</code> — Admin interface</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Config Tab
// ============================================================================
function ConfigTab() {
  const { p, isDark } = usePalette();
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [configPath, setConfigPath] = useState('/etc/envoy/envoy.yaml');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/software/envoy/config');
      setConfig(data.data?.content || '');
      setConfigPath(data.data?.path || '/etc/envoy/envoy.yaml');
      setIsValid(null);
    } catch {
      message.error('Failed to load envoy config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const { data } = await api.post('/software/envoy/validate', { content: config });
      setIsValid(true);
      message.success('Configuration is valid');
    } catch (err: unknown) {
      setIsValid(false);
      const e = err as { response?: { data?: { message?: string } } };
      message.error('Configuration has errors: ' + (e.response?.data?.message || 'validation failed'));
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/software/envoy/config', { content: config });
      message.success('Configuration saved and service reloaded');
      setIsValid(true);
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: p.textMuted, fontFamily: 'monospace' }}>{configPath}</Text>
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={fetchConfig}
            loading={loading}
          >Reload</Button>
          <Button
            size="small"
            onClick={handleValidate}
            loading={validating}
            type={isValid === false ? 'primary' : 'default'}
            danger={isValid === false}
          >
            {isValid === false ? 'Invalid' : isValid === true ? 'Valid' : 'Validate'}
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <Editor
          height="500px"
          language="yaml"
          value={config}
          onChange={(v) => { setConfig(v || ''); setIsValid(null); }}
          theme={isDark ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      )}

      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <Space>
          <Button onClick={fetchConfig} disabled={loading}>Discard</Button>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleSave}
            loading={saving}
            style={{ background: PRIMARY, borderColor: PRIMARY }}
          >
            Save & Reload
          </Button>
        </Space>
      </div>
    </div>
  );
}

// ============================================================================
// Clusters Tab
// ============================================================================
function ClustersTab() {
  const { p, isDark } = usePalette();
  const [clusters, setClusters] = useState<EnvoyCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/software/envoy/clusters');
      setClusters(data.data?.clusters || []);
    } catch {
      message.error('Failed to load clusters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try {
      await api.delete(`/software/envoy/clusters/${encodeURIComponent(name)}`);
      message.success(`Cluster ${name} removed`);
      fetchClusters();
    } catch {
      message.error(`Failed to remove cluster ${name}`);
    } finally {
      setDeleting(null);
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Load Balancing', dataIndex: 'lb_policy', key: 'lb_policy', render: (v: string) => v || <Text type="secondary">ROUND_ROBIN</Text> },
    { title: 'Connect Timeout', dataIndex: 'connect_timeout', key: 'connect_timeout', render: (v: string) => v || '5s' },
    {
      title: 'Actions', key: 'actions', width: 80,
      render: (_: unknown, record: EnvoyCluster) => (
        <Popconfirm
          title={`Remove cluster ${record.name}?`}
          onConfirm={() => handleDelete(record.name)}
          okText="Remove"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === record.name}>
            Remove
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          Clusters define upstream services that Envoy routes traffic to.
        </Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)} style={{ background: PRIMARY, borderColor: PRIMARY }}>
          Add Cluster
        </Button>
      </div>

      <Table
        dataSource={clusters}
        columns={columns}
        rowKey="name"
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'No clusters configured. Add a cluster to define upstream services.' }}
      />

      <AddClusterModal open={addOpen} onClose={() => setAddOpen(false)} onSuccess={fetchClusters} />
    </div>
  );
}

// ============================================================================
// Add Cluster Modal
// ============================================================================
function AddClusterModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const hosts = (values.hosts as string || '')
        .split('\n')
        .map(h => h.trim())
        .filter(h => h.includes(':'));

      await api.post('/software/envoy/clusters', {
        name: values.name,
        type: values.type,
        lb_policy: values.lb_policy || 'ROUND_ROBIN',
        connect_timeout: values.connect_timeout || '5s',
        hosts,
      });
      message.success('Cluster added');
      form.resetFields();
      onClose();
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e.response?.data?.message || 'Failed to add cluster');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Add Envoy Cluster"
      footer={null}
      width={480}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="Cluster Name" rules={[{ required: true, message: 'Cluster name is required' }]}>
          <Input placeholder="e.g. backend-service" />
        </Form.Item>

        <Form.Item name="type" label="Cluster Type" rules={[{ required: true, message: 'Type is required' }]}>
          <Select>
            <Select.Option value="STRICT_DNS">STRICT_DNS — Resolve from DNS</Select.Option>
            <Select.Option value="STATIC">STATIC — Fixed list of hosts</Select.Option>
            <Select.Option value="ORIGINAL_DST">ORIGINAL_DST — Use original destination</Select.Option>
            <Select.Option value="LOGICAL_DNS">LOGICAL_DNS — DNS with connection pooling</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="lb_policy" label="Load Balancing Policy">
          <Select>
            <Select.Option value="ROUND_ROBIN">ROUND_ROBIN (default)</Select.Option>
            <Select.Option value="LEAST_REQUEST">LEAST_REQUEST — Least connections</Select.Option>
            <Select.Option value="RANDOM">RANDOM</Select.Option>
            <Select.Option value="MAGLEV">MAGLEV</Select.Option>
            <Select.Option value="ROUND_ROBIN">ROUND_ROBIN</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="connect_timeout" label="Connect Timeout">
          <Input placeholder="5s" />
        </Form.Item>

        <Form.Item
          name="hosts"
          label="Upstream Hosts"
          extra="One host per line in format host:port (e.g. 127.0.0.1:8080)"
        >
          <Input.TextArea rows={4} placeholder="127.0.0.1:8080&#10;127.0.0.1:8081" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting} style={{ background: PRIMARY, borderColor: PRIMARY }}>
              Add Cluster
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// Listeners Tab
// ============================================================================
function ListenersTab() {
  const { p, isDark } = usePalette();
  const [listeners, setListeners] = useState<EnvoyListener[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchListeners = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/software/envoy/listeners');
      setListeners(data.data?.listeners || []);
    } catch {
      message.error('Failed to load listeners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchListeners(); }, [fetchListeners]);

  const handleDelete = async (port: number) => {
    setDeleting(port);
    try {
      await api.delete(`/software/envoy/listeners/${port}`);
      message.success(`Listener on port ${port} removed`);
      fetchListeners();
    } catch {
      message.error(`Failed to remove listener on port ${port}`);
    } finally {
      setDeleting(null);
    }
  };

  const columns = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    {
      title: 'Address', key: 'address',
      render: (_: unknown, record: EnvoyListener) => {
        const addr = record.address?.socket_address;
        if (!addr) return <Text type="secondary">-</Text>;
        return <Text style={{ fontFamily: 'monospace' }}>{addr.address}:{addr.port_value}</Text>;
      },
    },
    {
      title: 'Port', key: 'port',
      render: (_: unknown, record: EnvoyListener) => {
        const port = record.address?.socket_address?.port_value;
        return port ? <Tag color="purple">{port}</Tag> : '-';
      },
    },
    {
      title: 'Protocol', key: 'protocol',
      render: () => <Tag color="cyan">HTTP</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 100,
      render: (_: unknown, record: EnvoyListener) => {
        const port = record.address?.socket_address?.port_value;
        return (
          <Popconfirm
            title={`Remove listener ${record.name}?`}
            onConfirm={() => port && handleDelete(port)}
            okText="Remove"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === port}>
              Remove
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          Listeners expose ports and define how Envoy handles incoming connections.
        </Text>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)} style={{ background: PRIMARY, borderColor: PRIMARY }}>
          Add Listener
        </Button>
      </div>

      <Table
        dataSource={listeners}
        columns={columns}
        rowKey="name"
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'No listeners configured. Add a listener to expose a port.' }}
      />

      <AddListenerModal open={addOpen} onClose={() => setAddOpen(false)} onSuccess={fetchListeners} />
    </div>
  );
}

// ============================================================================
// Add Listener Modal
// ============================================================================
function AddListenerModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await api.post('/software/envoy/listeners', {
        name: values.name,
        port: values.port,
        protocol: 'HTTP',
      });
      message.success('Listener added');
      form.resetFields();
      onClose();
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e.response?.data?.message || 'Failed to add listener');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Add Envoy Listener"
      footer={null}
      width={420}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="Listener Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="e.g. backend-http" />
        </Form.Item>

        <Form.Item name="port" label="Port" rules={[{ required: true, message: 'Port is required' }]}>
          <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="8080" />
        </Form.Item>

        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
          <Text style={{ color: '#E65100' }}>The listener will be configured as an HTTP listener with a basic HTTP Connection Manager filter routing all traffic to the <code>original_destination</code> cluster.</Text>
        </div>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting} style={{ background: PRIMARY, borderColor: PRIMARY }}>
              Add Listener
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// Stats Tab
// ============================================================================
function StatsTab() {
  const { p, isDark } = usePalette();
  const [stats, setStats] = useState<EnvoyStats>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/software/envoy/stats?usedonly');
      const raw = data.data?.stats || data.data;
      if (typeof raw === 'object') {
        setStats(raw as EnvoyStats);
      }
    } catch {
      message.error('Failed to load envoy stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const filteredStats = Object.entries(stats).filter(([key]) =>
    !filter || key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input.Search
          placeholder="Filter stats..."
          style={{ width: 250 }}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>Refresh</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <div style={{
          maxHeight: 500, overflow: 'auto',
          background: isDark ? '#161B22' : '#F5F7FA',
          borderRadius: 8, padding: 12,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
        }}>
          {filteredStats.length === 0 ? (
            <Text type="secondary">No stats available. Make sure Envoy is running.</Text>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {filteredStats.slice(0, 200).map(([key, value]) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${p.cardBorder}20` }}>
                    <td style={{ padding: '4px 8px', color: p.text, wordBreak: 'break-all' }}>{key}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: p.textMuted, whiteSpace: 'nowrap' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filteredStats.length > 200 && (
            <div style={{ textAlign: 'center', marginTop: 8, color: p.textMuted, fontSize: 12 }}>
              Showing 200 of {filteredStats.length} stats
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Error Log Tab
// ============================================================================
function ErrorLogTab() {
  const { p, isDark } = usePalette();
  const [log, setLog] = useState('');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/software/envoy/error-log?lines=${lines}`);
      setLog(data.data?.content || '');
      setPath(data.data?.path || '');
    } catch {
      setLog('Failed to load envoy error log.');
    } finally {
      setLoading(false);
    }
  }, [lines]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          value={lines}
          onChange={(v) => setLines(v)}
          style={{ width: 120 }}
          options={[
            { value: 50, label: '50 lines' },
            { value: 100, label: '100 lines' },
            { value: 200, label: '200 lines' },
            { value: 500, label: '500 lines' },
          ]}
        />
        <Text style={{ fontSize: 12, color: p.textMuted, fontFamily: 'monospace' }}>{path}</Text>
        <Button icon={<ReloadOutlined />} onClick={fetchLog} loading={loading} style={{ marginLeft: 'auto' }}>Refresh</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <pre style={{
          maxHeight: 450,
          overflow: 'auto',
          background: isDark ? '#161B22' : '#1A1A2E',
          color: isDark ? '#E6EDF3' : '#E6EDF3',
          padding: 16,
          borderRadius: 8,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          lineHeight: 1.6,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {log || <span style={{ color: '#64748B' }}>No log entries found.</span>}
        </pre>
      )}
    </div>
  );
}
