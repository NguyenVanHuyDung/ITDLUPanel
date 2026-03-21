import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Form, Input, Switch, Badge, Tooltip } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, SettingOutlined,
  CodeOutlined, SwapOutlined, DashboardOutlined, ThunderboltOutlined,
  FileTextOutlined, CheckCircleFilled, CloudServerOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Theme constants (matching global palette)
// ---------------------------------------------------------------------------
const PRIMARY = '#1565C0';
const PRIMARY_LIGHT = '#E3F2FD';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const WARNING = '#FF9800';
const ERROR = '#F44336';
const DARK_BG = '#1B2A4A';

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------
const SECTIONS = [
  { key: 'service',      label: 'Service',        icon: <PlayCircleOutlined /> },
  { key: 'config',       label: 'Config File',     icon: <CodeOutlined /> },
  { key: 'version',      label: 'Switch Version',  icon: <SwapOutlined /> },
  { key: 'loadstatus',   label: 'Load Status',     icon: <DashboardOutlined /> },
  { key: 'optimization', label: 'Optimization',    icon: <ThunderboltOutlined /> },
  { key: 'errorlog',     label: 'Error Log',       icon: <FileTextOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ============================================================================
// Main Modal
// ============================================================================
export default function NginxManageModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [section, setSection] = useState<SectionKey>('service');

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
      case 'service':      return <ServiceTab />;
      case 'config':       return <ConfigTab />;
      case 'version':      return <VersionTab />;
      case 'loadstatus':   return <LoadStatusTab />;
      case 'optimization': return <OptimizationTab />;
      case 'errorlog':     return <ErrorLogTab />;
      default:             return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <CloudServerOutlined style={{ color: '#009639' }} />
          <span>Nginx Management</span>
        </Space>
      }
      width={isMobile ? '95vw' : 920}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 180,
          borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          flexShrink: 0,
          background: '#FAFBFC',
        }}>
          {SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarStyle(section === s.key)}
              onClick={() => setSection(s.key)}
              onMouseEnter={e => { if (section !== s.key) e.currentTarget.style.background = '#f0f4f8'; }}
              onMouseLeave={e => { if (section !== s.key) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              {(!isMobile || section === s.key) && <span>{s.label}</span>}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? 16 : 24, overflow: 'auto', maxHeight: isMobile ? '60vh' : '78vh' }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Service Tab
// ============================================================================
function ServiceTab() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/nginx/status');
      setStatus(resp.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'reload') => {
    setActionLoading(action);
    try {
      await api.post(`/software/nginx/${action}`);
      message.success(`Nginx ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} nginx`);
    } finally {
      setActionLoading(null);
    }
  };

  const running = status?.running === true || status?.is_running === true;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Service Status</Text>
      </div>

      {loading ? <Spin /> : (
        <>
          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 10,
            background: running ? '#E8F5E9' : '#FFEBEE',
            border: `1px solid ${running ? '#A5D6A7' : '#EF9A9A'}`,
            marginBottom: 24,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: running ? SUCCESS : ERROR,
              boxShadow: `0 0 8px ${running ? SUCCESS : ERROR}50`,
            }} />
            <Text style={{ fontSize: 15, fontWeight: 600, color: running ? '#2E7D32' : '#C62828' }}>
              {running ? 'Running' : 'Stopped'}
            </Text>
            {status?.version && (
              <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginLeft: 'auto' }}>
                Version: {status.version}
              </Text>
            )}
          </div>

          {/* Action buttons */}
          <Space wrap size={12}>
            {running ? (
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => handleAction('stop')}
                loading={actionLoading === 'stop'}
                danger
                style={{ borderRadius: 6 }}
              >
                Stop
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction('start')}
                loading={actionLoading === 'start'}
                style={{ background: SUCCESS, borderColor: SUCCESS, borderRadius: 6 }}
              >
                Start
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleAction('restart')}
              loading={actionLoading === 'restart'}
              style={{ borderRadius: 6 }}
            >
              Restart
            </Button>
            <Button
              icon={<ReloadOutlined style={{ color: PRIMARY }} />}
              onClick={() => handleAction('reload')}
              loading={actionLoading === 'reload'}
              style={{ borderRadius: 6, borderColor: PRIMARY, color: PRIMARY }}
            >
              Reload
            </Button>
          </Space>

          {/* Info notices */}
          <div style={{ marginTop: 24, padding: 16, background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: TEXT_SECONDARY }}>
            <p style={{ margin: '0 0 6px' }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
              <strong>Reload</strong> — Gracefully reload config without dropping connections
            </p>
            <p style={{ margin: 0 }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: WARNING }} />
              <strong>Restart</strong> — Full restart; briefly interrupts active connections
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Config Tab (Monaco Editor)
// ============================================================================
function ConfigTab() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get('/software/nginx/config');
        const cfg = resp.data;
        setContent(typeof cfg === 'string' ? cfg : cfg?.content ?? '');
      } catch {
        setContent('# Failed to load configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/software/nginx/config', { content });
      message.success('Configuration saved');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>nginx.conf</Text>
        <Button
          type="primary"
          size="small"
          onClick={handleSave}
          loading={saving}
          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
        >
          Save
        </Button>
      </div>

      {/* Tips bar */}
      <div style={{
        padding: '8px 12px', borderRadius: 6, marginBottom: 12,
        background: '#FFF8E1', border: '1px solid #FFE082', fontSize: 12, color: '#F57F17',
      }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Ctrl+F Search  •  Ctrl+H Replace  •  Ctrl+S Save
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="400px"
            defaultLanguage="nginx"
            value={content}
            onChange={v => setContent(v || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 4,
            }}
          />
        </div>
      )}

      {/* Warning */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 6,
        background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100',
      }}>
        ⚠️ This is the main configuration file of Nginx. Incorrect modifications may cause Nginx to fail to start.
      </div>
    </div>
  );
}

// ============================================================================
// Switch Version Tab
// ============================================================================
function VersionTab() {
  const [currentVersion, setCurrentVersion] = useState('');
  const [versions] = useState(['stable', 'mainline']);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/software/nginx/status');
        const ver = resp.data?.version || 'unknown';
        setCurrentVersion(ver);
        setSelected(ver.includes('mainline') ? 'mainline' : 'stable');
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      await api.post('/software/install', { name: 'nginx', version: selected });
      message.success(`Switching to nginx ${selected}. This may take a few minutes.`);
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to switch version');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div>
      <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 20 }}>
        Switch Version
      </Text>

      {loading ? <Spin /> : (
        <>
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: PRIMARY_LIGHT, border: `1px solid ${PRIMARY}40`,
            marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircleFilled style={{ color: SUCCESS }} />
            <Text style={{ fontSize: 13 }}>
              Current version: <strong>{currentVersion}</strong>
            </Text>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select
              value={selected}
              onChange={setSelected}
              style={{ width: 200 }}
              options={versions.map(v => ({
                value: v,
                label: (
                  <Space>
                    <span>{v === 'stable' ? 'Nginx Stable' : 'Nginx Mainline'}</span>
                    {currentVersion.includes(v) && <CheckCircleFilled style={{ color: SUCCESS, fontSize: 12 }} />}
                  </Space>
                ),
              }))}
            />
            <Button
              type="primary"
              icon={<SwapOutlined />}
              onClick={handleSwitch}
              loading={switching}
              style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
            >
              Switch
            </Button>
          </div>

          <div style={{
            marginTop: 20, padding: 12, background: '#F5F5F5', borderRadius: 8,
            fontSize: 12, color: TEXT_SECONDARY,
          }}>
            <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
            Switching version will reinstall Nginx. Your configuration files will be preserved.
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Load Status Tab
// ============================================================================
function LoadStatusTab() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<any>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/nginx/metrics');
      setMetrics(resp.data);
    } catch {
      setMetrics(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMetrics();
    timerRef.current = setInterval(fetchMetrics, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchMetrics]);

  const rows = metrics ? [
    { field: 'Active Connections', value: metrics.active_connections, icon: '🔗' },
    { field: 'Total Accepts',     value: metrics.total_accepts,      icon: '📥' },
    { field: 'Total Handled',     value: metrics.total_handled,      icon: '✅' },
    { field: 'Total Requests',    value: metrics.total_requests,     icon: '📊' },
    { field: 'Reading',           value: metrics.reading,            icon: '📖' },
    { field: 'Writing',           value: metrics.writing,            icon: '✍️' },
    { field: 'Waiting',           value: metrics.waiting,            icon: '⏳' },
    { field: 'Worker Processes',  value: metrics.worker_processes,   icon: '⚙️' },
    { field: 'CPU Usage',         value: metrics.nginx_cpu_usage + '%', icon: '🖥️' },
    { field: 'Memory Usage',      value: metrics.nginx_memory_usage, icon: '💾' },
  ] : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Load Status</Text>
        <Tooltip title="Auto-refreshes every 5s">
          <Badge status="processing" text={<Text style={{ fontSize: 11, color: TEXT_SECONDARY }}>Live</Text>} />
        </Tooltip>
      </div>

      {loading ? <Spin /> : !metrics ? (
        <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
          <p>Unable to fetch metrics. Make sure Nginx is running.</p>
          <p style={{ fontSize: 12 }}>Tip: Enable <code>stub_status</code> module for detailed metrics.</p>
        </div>
      ) : (
        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          {rows.map((r, i) => (
            <div key={r.field} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px',
              background: i % 2 === 0 ? '#FAFBFC' : '#fff',
              borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none',
            }}>
              <span style={{ fontSize: 13, color: TEXT_PRIMARY }}>
                <span style={{ marginRight: 8 }}>{r.icon}</span>
                {r.field}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: PRIMARY, fontFamily: "'JetBrains Mono', monospace" }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Optimization Tab
// ============================================================================
const OPT_FIELDS = [
  { key: 'worker_processes',            label: 'Worker Processes',             desc: 'Number of worker processes. "auto" = detect CPU cores.' },
  { key: 'worker_connections',          label: 'Worker Connections',           desc: 'Max simultaneous connections per worker.' },
  { key: 'keepalive_timeout',           label: 'Keepalive Timeout',            desc: 'Timeout for keep-alive connections (seconds).' },
  { key: 'gzip',                        label: 'Gzip',                         desc: 'Enable gzip compression.',             type: 'select', options: ['on', 'off'] },
  { key: 'gzip_min_length',             label: 'Gzip Min Length',              desc: 'Min response size (bytes) to gzip.' },
  { key: 'gzip_comp_level',             label: 'Gzip Comp Level',              desc: 'Compression level (1-9). Higher = smaller but slower.' },
  { key: 'client_max_body_size',        label: 'Client Max Body Size',         desc: 'Max upload file size (e.g. 50m, 1g).' },
  { key: 'server_names_hash_bucket_size', label: 'Server Names Hash Bucket',  desc: 'Hash bucket size for server names.' },
  { key: 'client_header_buffer_size',   label: 'Client Header Buffer',         desc: 'Buffer size for reading client request header.' },
  { key: 'client_body_buffer_size',     label: 'Client Body Buffer',           desc: 'Buffer size for reading client request body.' },
];

function OptimizationTab() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/software/nginx/optimization');
        form.setFieldsValue(resp.data);
      } catch {
        message.error('Failed to load optimization settings');
      }
      setLoading(false);
    })();
  }, [form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await api.put('/software/nginx/optimization', values);
      message.success('Optimization settings saved. Run Reload to apply.');
    } catch (e: any) {
      if (e.response) message.error('Failed to save optimization settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Performance Optimization</Text>
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
        >
          Save
        </Button>
      </div>

      {loading ? <Spin /> : (
        <Form form={form} layout="vertical" size="small">
          {OPT_FIELDS.map(f => (
            <div key={f.key} style={{
              padding: '12px 0',
              borderBottom: `1px solid ${BORDER}`,
            }}>
              <Form.Item
                name={f.key}
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</span>}
                style={{ marginBottom: 0 }}
              >
                {f.type === 'select' ? (
                  <Select options={f.options!.map(o => ({ value: o, label: o }))} style={{ width: 120 }} />
                ) : (
                  <Input style={{ maxWidth: 300, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }} />
                )}
              </Form.Item>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY }}>{f.desc}</Text>
            </div>
          ))}
        </Form>
      )}
    </div>
  );
}

// ============================================================================
// Error Log Tab
// ============================================================================
function ErrorLogTab() {
  const [content, setContent] = useState('');
  const [logPath, setLogPath] = useState('');
  const [lines, setLines] = useState(100);
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLog = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/nginx/error-log?lines=${n}`);
      setContent(resp.data?.content || '(empty)');
      setLogPath(resp.data?.log_path || '');
    } catch {
      setContent('Failed to load error log');
    }
    setLoading(false);
    setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, 100);
  }, []);

  useEffect(() => { fetchLog(lines); }, [fetchLog, lines]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Error Log</Text>
          {logPath && (
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>
              From {logPath}
            </Text>
          )}
        </div>
        <Space>
          <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>Last</Text>
          {[50, 100, 500].map(n => (
            <Button
              key={n}
              size="small"
              type={lines === n ? 'primary' : 'default'}
              onClick={() => setLines(n)}
              style={lines === n ? { background: PRIMARY, borderColor: PRIMARY, borderRadius: 4 } : { borderRadius: 4 }}
            >
              {n}
            </Button>
          ))}
          <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>lines</Text>
        </Space>
      </div>

      {loading ? <Spin /> : (
        <pre
          ref={logRef}
          style={{
            background: DARK_BG,
            color: '#E0E0E0',
            padding: 16,
            borderRadius: 10,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.7,
            maxHeight: 420,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
            border: `1px solid ${BORDER}`,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
