import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Form, Input } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, SettingOutlined,
  CodeOutlined, ThunderboltOutlined, FileTextOutlined, CloudServerOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/services/api';
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
export default function ApacheManageModal({ open, onClose }: Props) {
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
          <CloudServerOutlined style={{ color: '#D22128' }} />
          <span>Apache Management</span>
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
      const { data: resp } = await api.get('/software/apache/status');
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
      await api.post(`/software/apache/${action}`);
      message.success(`Apache ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} Apache`);
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
        const { data: resp } = await api.get('/software/apache/config');
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
      await api.put('/software/apache/config', { content });
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
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>apache2.conf</Text>
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
            defaultLanguage="apacheconf"
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
        ⚠️ This is the main configuration file of Apache. Incorrect modifications may cause Apache to fail to start.
      </div>
    </div>
  );
}

// ============================================================================
// Optimization Tab
// ============================================================================
const OPT_GROUPS = [
  {
    title: 'General',
    icon: <SettingOutlined />,
    fields: [
      { key: 'timeout', label: 'Timeout', desc: 'Connection timeout in seconds.' },
      { key: 'keep_alive', label: 'KeepAlive', desc: 'Enable persistent connections.', type: 'select' as const, options: ['On', 'Off'] },
      { key: 'max_keep_alive_requests', label: 'MaxKeepAliveRequests', desc: 'Max requests per persistent connection (0 = unlimited).' },
      { key: 'keep_alive_timeout', label: 'KeepAliveTimeout', desc: 'Timeout for persistent connections (seconds).' },
    ],
  },
  {
    title: 'MPM Settings',
    icon: <CloudServerOutlined />,
    fields: [
      { key: 'max_request_workers', label: 'MaxRequestWorkers', desc: 'Max simultaneous connections. Key performance tuning parameter.' },
      { key: 'start_servers', label: 'StartServers', desc: 'Number of child processes at startup.' },
      { key: 'min_spare_threads', label: 'MinSpareThreads', desc: 'Minimum number of idle threads.' },
      { key: 'max_spare_threads', label: 'MaxSpareThreads', desc: 'Maximum number of idle threads.' },
      { key: 'server_limit', label: 'ServerLimit', desc: 'Upper limit on configurable number of processes.' },
      { key: 'thread_limit', label: 'ThreadLimit', desc: 'Upper limit on threads per child process.' },
    ],
  },
  {
    title: 'Security',
    icon: <InfoCircleOutlined />,
    fields: [
      { key: 'server_tokens', label: 'ServerTokens', desc: 'Control server version info in headers.', type: 'select' as const, options: ['Prod', 'Major', 'Minor', 'Minimal', 'OS', 'Full'] },
      { key: 'server_signature', label: 'ServerSignature', desc: 'Show server info in error pages.', type: 'select' as const, options: ['Off', 'On', 'EMail'] },
      { key: 'trace_enable', label: 'TraceEnable', desc: 'Allow TRACE method.', type: 'select' as const, options: ['Off', 'On'] },
    ],
  },
];

function OptimizationTab() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/software/apache/optimization');
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
      await api.put('/software/apache/optimization', values);
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
          {OPT_GROUPS.map(group => (
            <div key={group.title} style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 10,
              background: '#F8FAFC',
              border: `1px solid ${BORDER}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ color: PRIMARY, fontSize: 15 }}>{group.icon}</span>
                <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>{group.title}</Text>
              </div>
              {group.fields.map(f => (
                <div key={f.key} style={{
                  padding: '10px 0',
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
      const { data: resp } = await api.get(`/software/apache/error-log?lines=${n}`);
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
