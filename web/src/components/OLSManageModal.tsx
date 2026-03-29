import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Form, Input } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, ThunderboltOutlined,
  FileTextOutlined, CloudServerOutlined,
  InfoCircleOutlined, SettingOutlined,
  WarningOutlined,
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
export default function OLSManageModal({ open, onClose }: Props) {
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
          <CloudServerOutlined style={{ color: '#3A7BD5' }} />
          <span>OpenLiteSpeed Management</span>
        </Space>
      }
      width={isMobile ? '95vw' : 1000}
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
      const { data: resp } = await api.get('/software/openlitespeed/status');
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
      await api.post(`/software/openlitespeed/${action}`);
      message.success(`OpenLiteSpeed ${action === 'reload' ? 'graceful restart' : action} succeeded`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} OpenLiteSpeed`);
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
              Graceful Restart
            </Button>
          </Space>

          {/* Info notices */}
          <div style={{ marginTop: 24, padding: 16, background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: TEXT_SECONDARY }}>
            <p style={{ margin: '0 0 6px' }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
              <strong>Graceful Restart</strong> — Reload config without dropping active connections
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
        const { data: resp } = await api.get('/software/openlitespeed/config');
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
      await api.put('/software/openlitespeed/config', { content });
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
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>httpd_config.conf</Text>
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
            defaultLanguage="plaintext"
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
        ⚠️ This is the main configuration file of OpenLiteSpeed. Incorrect modifications may cause OpenLiteSpeed to fail to start.
      </div>
    </div>
  );
}

// ============================================================================
// Optimization Tab
// ============================================================================
const OPT_GROUPS = [
  {
    title: 'Server',
    icon: <CloudServerOutlined />,
    fields: [
      { key: 'max_connections', label: 'Max Connections', desc: 'Maximum concurrent connections.' },
      { key: 'max_ssl_connections', label: 'Max SSL Connections', desc: 'Maximum concurrent SSL connections.' },
      { key: 'conn_timeout', label: 'Connection Timeout', desc: 'Connection idle timeout in seconds.' },
      { key: 'max_keep_alive_req', label: 'Max Keep-Alive Requests', desc: 'Max requests per keep-alive connection.' },
      { key: 'keep_alive_timeout', label: 'Keep-Alive Timeout', desc: 'Keep-alive idle timeout in seconds.' },
    ],
  },
  {
    title: 'Tuning',
    icon: <ThunderboltOutlined />,
    fields: [
      { key: 'max_req_url_len', label: 'Max Request URL Length', desc: 'Maximum length of request URL.' },
      { key: 'max_req_header_size', label: 'Max Request Header Size', desc: 'Maximum size of request headers.' },
      { key: 'max_req_body_size', label: 'Max Request Body Size', desc: 'Maximum size of request body (e.g., 50M).' },
      { key: 'max_dyn_resp_header_size', label: 'Max Dynamic Response Header', desc: 'Maximum size of dynamic response headers.' },
      { key: 'max_dyn_resp_size', label: 'Max Dynamic Response Size', desc: 'Maximum size of dynamic responses (e.g., 256M).' },
    ],
  },
  {
    title: 'Gzip Compression',
    icon: <SettingOutlined />,
    fields: [
      { key: 'enable_gzip', label: 'Enable Gzip', desc: 'Enable gzip compression.', type: 'select' as const, options: ['1', '0'] },
      { key: 'gzip_comp_level', label: 'Compression Level', desc: 'Gzip compression level (1-9).' },
    ],
  },
  {
    title: 'Security',
    icon: <WarningOutlined />,
    fields: [
      { key: 'server_name', label: 'Server Name', desc: 'Server name shown in headers.' },
      { key: 'disable_server_header', label: 'Hide Server Header', desc: 'Disable Server header in response.', type: 'select' as const, options: ['1', '0'] },
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
        const { data: resp } = await api.get('/software/openlitespeed/optimization');
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
      await api.put('/software/openlitespeed/optimization', values);
      message.success('Optimization settings saved. Run Graceful Restart to apply.');
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
      const { data: resp } = await api.get(`/software/openlitespeed/error-log?lines=${n}`);
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
