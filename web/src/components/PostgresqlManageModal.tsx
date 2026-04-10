import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Form, Input, Select, Tooltip } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, ThunderboltOutlined, FileTextOutlined,
  TeamOutlined, DatabaseOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

const PRIMARY = '#336791';
const PRIMARY_LIGHT = '#E8EFF5';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const WARNING = '#FF9800';
const ERROR = '#F44336';

const SECTIONS = [
  { key: 'service',      label: 'Service',      icon: <PlayCircleOutlined /> },
  { key: 'config',       label: 'Config',        icon: <CodeOutlined /> },
  { key: 'performance',  label: 'Performance',   icon: <ThunderboltOutlined /> },
  { key: 'connections',  label: 'Connections',    icon: <TeamOutlined /> },
  { key: 'databases',    label: 'Databases',      icon: <DatabaseOutlined /> },
  { key: 'errorlog',     label: 'Error Log',      icon: <FileTextOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PostgresqlManageModal({ open, onClose }: Props) {
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
      case 'performance':  return <PerformanceTab />;
      case 'connections':  return <ConnectionsTab />;
      case 'databases':    return <DatabasesTab />;
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
          <DatabaseOutlined style={{ color: PRIMARY }} />
          <span>PostgreSQL Manager</span>
        </Space>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        <div style={{
          width: isMobile ? '100%' : 200,
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
  const timerRef = useRef<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/postgresql/status');
      setStatus(resp.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchStatus]);

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'reload') => {
    setActionLoading(action);
    try {
      await api.post(`/software/postgresql/${action}`);
      message.success(`PostgreSQL ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} PostgreSQL`);
    } finally {
      setActionLoading(null);
    }
  };

  const running = status?.running === true || status?.is_running === true;

  const infoRows = status ? [
    { label: 'Service Name', value: status.name || status.service || 'postgresql' },
    { label: 'Version', value: status.version || '—' },
    { label: 'Status', value: status.activestate || (running ? 'active' : 'inactive') },
    { label: 'Sub-state', value: status.substate || '—' },
    { label: 'PID', value: status.mainpid || '—' },
    { label: 'Memory Usage', value: status.memorycurrent || '—' },
    { label: 'Port', value: '5432' },
    { label: 'Data Directory', value: '/var/lib/postgresql' },
  ] : [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Service Status</Text>
      </div>

      {loading ? <Spin /> : (
        <>
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

          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 24 }}>
            {infoRows.map((r, i) => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px',
                background: i % 2 === 0 ? '#FAFBFC' : '#fff',
                borderBottom: i < infoRows.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>{r.value}</span>
              </div>
            ))}
          </div>

          <Space wrap size={12}>
            {running ? (
              <Button icon={<PauseCircleOutlined />} onClick={() => handleAction('stop')} loading={actionLoading === 'stop'} danger style={{ borderRadius: 6 }}>
                Stop
              </Button>
            ) : (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleAction('start')} loading={actionLoading === 'start'} style={{ background: SUCCESS, borderColor: SUCCESS, borderRadius: 6 }}>
                Start
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => handleAction('restart')} loading={actionLoading === 'restart'} style={{ borderRadius: 6 }}>
              Restart
            </Button>
            <Button icon={<ReloadOutlined style={{ color: PRIMARY }} />} onClick={() => handleAction('reload')} loading={actionLoading === 'reload'} style={{ borderRadius: 6, borderColor: PRIMARY, color: PRIMARY }}>
              Reload
            </Button>
          </Space>

          <div style={{ marginTop: 24, padding: 16, background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: TEXT_SECONDARY }}>
            <p style={{ margin: '0 0 6px' }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
              <strong>Reload</strong> — Re-reads configuration files (pg_hba.conf, postgresql.conf) without restart
            </p>
            <p style={{ margin: 0 }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: WARNING }} />
              <strong>Restart</strong> — Full restart required for some settings (shared_buffers, max_connections)
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
        const { data: resp } = await api.get('/software/postgresql/config');
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
      await api.put('/software/postgresql/config', { content });
      message.success('Configuration saved. Run "Reload" to apply most changes.');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>postgresql.conf</Text>
        <Button type="primary" size="small" onClick={handleSave} loading={saving} style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}>
          Save
        </Button>
      </div>

      <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: '#FFF8E1', border: '1px solid #FFE082', fontSize: 12, color: '#F57F17' }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Ctrl+F Search  •  Ctrl+H Replace  •  Ctrl+S Save
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="500px"
            defaultLanguage="ini"
            value={content}
            onChange={v => setContent(v || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 4,
            }}
          />
        </div>
      )}

      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100' }}>
        ⚠️ Changes to shared_buffers, max_connections, and WAL settings require a full restart.
        Other settings can be applied with Reload.
      </div>
    </div>
  );
}

// ============================================================================
// Performance Tab
// ============================================================================
const PG_OPT_GROUPS = [
  {
    title: 'Memory',
    icon: <ThunderboltOutlined />,
    fields: [
      { key: 'shared_buffers', label: 'Shared Buffers', desc: 'Primary memory cache for PostgreSQL data (e.g. 256MB, 1GB). Typically 25% of RAM.' },
      { key: 'effective_cache_size', label: 'Effective Cache Size', desc: 'Planner estimate of OS cache available (e.g. 4GB). Typically 75% of RAM.' },
      { key: 'work_mem', label: 'Work Memory', desc: 'Memory per sort/hash operation (e.g. 4MB, 16MB). Multiplied by concurrent queries.' },
      { key: 'maintenance_work_mem', label: 'Maintenance Work Memory', desc: 'Memory for VACUUM, CREATE INDEX, etc. (e.g. 256MB, 512MB).' },
    ],
  },
  {
    title: 'Connections',
    icon: <TeamOutlined />,
    fields: [
      { key: 'max_connections', label: 'Max Connections', desc: 'Maximum concurrent connections. Default: 100.' },
    ],
  },
  {
    title: 'WAL (Write-Ahead Log)',
    icon: <FileTextOutlined />,
    fields: [
      { key: 'wal_buffers', label: 'WAL Buffers', desc: 'Shared memory for WAL data (e.g. 16MB). -1 for auto (1/32 of shared_buffers).' },
      { key: 'min_wal_size', label: 'Min WAL Size', desc: 'Minimum WAL disk space to retain (e.g. 1GB).' },
      { key: 'max_wal_size', label: 'Max WAL Size', desc: 'Maximum WAL disk space before checkpoint (e.g. 4GB).' },
      { key: 'checkpoint_completion_target', label: 'Checkpoint Target', desc: 'Spread checkpoint I/O over this fraction of checkpoint interval. 0.9 recommended.' },
    ],
  },
  {
    title: 'Query Planner',
    icon: <DatabaseOutlined />,
    fields: [
      { key: 'random_page_cost', label: 'Random Page Cost', desc: 'Cost estimate for random disk read. SSD: 1.1, HDD: 4.0.' },
      { key: 'effective_io_concurrency', label: 'Effective I/O Concurrency', desc: 'Concurrent disk I/O operations. SSD: 200, HDD: 2.' },
      { key: 'default_statistics_target', label: 'Statistics Target', desc: 'Default ANALYZE sample size. Higher = better plans but slower ANALYZE.' },
    ],
  },
  {
    title: 'Parallelism',
    icon: <PlayCircleOutlined />,
    fields: [
      { key: 'max_worker_processes', label: 'Max Worker Processes', desc: 'Total background worker processes (default: 8).' },
      { key: 'max_parallel_workers_per_gather', label: 'Parallel Workers/Gather', desc: 'Max parallel workers per query gather node.' },
      { key: 'max_parallel_workers', label: 'Max Parallel Workers', desc: 'Max parallel workers overall.' },
      { key: 'max_parallel_maintenance_workers', label: 'Parallel Maintenance Workers', desc: 'Max parallel workers for CREATE INDEX, VACUUM.' },
    ],
  },
];

function PerformanceTab() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/software/postgresql/optimization');
        if (resp.data) form.setFieldsValue(resp.data);
      } catch {
        message.error('Failed to load PostgreSQL optimization settings');
      }
      setLoading(false);
    })();
  }, [form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await api.put('/software/postgresql/optimization', values);
      message.success('Settings saved. Restart PostgreSQL to apply memory/connection changes.');
    } catch (e: any) {
      if (e.response) message.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Performance Tuning</Text>
        <Button type="primary" size="small" onClick={handleSave} loading={saving} style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}>
          Save Settings
        </Button>
      </div>

      <Form form={form} layout="vertical" size="small">
        {PG_OPT_GROUPS.map(group => (
          <div key={group.title} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 16, color: PRIMARY }}>{group.icon}</span>
              <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>{group.title}</Text>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px 20px' }}>
              {group.fields.map(f => (
                <Form.Item key={f.key} name={f.key} label={
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {f.label}
                    <Tooltip title={f.desc}>
                      <InfoCircleOutlined style={{ marginLeft: 6, color: TEXT_SECONDARY, fontSize: 11 }} />
                    </Tooltip>
                  </span>
                } style={{ marginBottom: 8 }}>
                  <Input placeholder={f.desc.split('.')[0]} style={{ fontSize: 12, borderRadius: 6 }} />
                </Form.Item>
              ))}
            </div>
          </div>
        ))}
      </Form>

      <div style={{ padding: '10px 14px', borderRadius: 8, background: '#E8EFF5', border: `1px solid ${PRIMARY}30`, fontSize: 12, color: TEXT_SECONDARY }}>
        <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
        These settings are written to <code>conf.d/99-itdlu-tuning.conf</code>. A restart is required for memory and connection changes.
      </div>
    </div>
  );
}

// ============================================================================
// Connections Tab
// ============================================================================
function ConnectionsTab() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<any>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/postgresql/connections');
      setConnections(resp.data?.connections || []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    timerRef.current = setInterval(fetchConnections, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchConnections]);

  const activeCount = connections.filter(c => c.state === 'active').length;
  const idleCount = connections.filter(c => c.state === 'idle').length;
  const total = connections.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Active Connections</Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchConnections} style={{ borderRadius: 6 }}>
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: total, color: PRIMARY },
          { label: 'Active', value: activeCount, color: SUCCESS },
          { label: 'Idle', value: idleCount, color: TEXT_SECONDARY },
        ].map(c => (
          <div key={c.label} style={{ padding: '14px 16px', borderRadius: 10, border: `1px solid ${BORDER}`, background: '#FAFBFC', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {loading ? <Spin /> : (
        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr',
            padding: '10px 16px', background: '#F1F5F9', fontWeight: 600, fontSize: 12, color: TEXT_SECONDARY,
          }}>
            <span>Database</span>
            <span>User</span>
            <span>State</span>
            <span>Query</span>
          </div>
          {connections.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: TEXT_SECONDARY, fontSize: 13 }}>No active connections</div>
          ) : connections.slice(0, 50).map((conn, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr',
              padding: '8px 16px', borderTop: `1px solid ${BORDER}`,
              background: i % 2 === 0 ? '#fff' : '#FAFBFC', fontSize: 12,
            }}>
              <span style={{ fontWeight: 500 }}>{conn.datname || '—'}</span>
              <span>{conn.usename || '—'}</span>
              <span style={{
                color: conn.state === 'active' ? SUCCESS : conn.state === 'idle' ? TEXT_SECONDARY : WARNING,
                fontWeight: 500,
              }}>{conn.state || '—'}</span>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: TEXT_SECONDARY, fontFamily: 'monospace', fontSize: 11,
              }}>{conn.query || '—'}</span>
            </div>
          ))}
          {connections.length > 50 && (
            <div style={{ padding: '8px 16px', textAlign: 'center', color: TEXT_SECONDARY, fontSize: 11, borderTop: `1px solid ${BORDER}` }}>
              Showing 50 of {connections.length} connections
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Databases Tab
// ============================================================================
function DatabasesTab() {
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/software/postgresql/databases');
        setDatabases(resp.data?.databases || []);
      } catch {
        setDatabases([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>PostgreSQL Databases</Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => window.location.reload()} style={{ borderRadius: 6 }}>
          Refresh
        </Button>
      </div>

      {loading ? <Spin /> : (
        <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
            padding: '10px 16px', background: '#F1F5F9', fontWeight: 600, fontSize: 12, color: TEXT_SECONDARY,
          }}>
            <span>Database</span>
            <span>Owner</span>
            <span>Encoding</span>
            <span>Size</span>
          </div>
          {databases.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: TEXT_SECONDARY, fontSize: 13 }}>No databases found</div>
          ) : databases.map((db, i) => (
            <div key={db.name} style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
              padding: '8px 16px', borderTop: `1px solid ${BORDER}`,
              background: i % 2 === 0 ? '#fff' : '#FAFBFC', fontSize: 12,
            }}>
              <span style={{ fontWeight: 500, color: TEXT_PRIMARY }}>
                <DatabaseOutlined style={{ marginRight: 6, color: PRIMARY, fontSize: 11 }} />
                {db.name}
              </span>
              <span>{db.owner || '—'}</span>
              <span>{db.encoding || '—'}</span>
              <span style={{ fontWeight: 500 }}>{formatSize(db.size)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#F5F5F5', fontSize: 12, color: TEXT_SECONDARY }}>
        <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
        This lists all PostgreSQL databases including system databases. Use the Databases page to manage panel-created databases.
      </div>
    </div>
  );
}

// ============================================================================
// Error Log Tab
// ============================================================================
function ErrorLogTab() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/postgresql/error-log?lines=${lines}`);
      setContent(resp.data?.content || resp.data || 'No log content available');
    } catch {
      setContent('Failed to load error log');
    } finally {
      setLoading(false);
    }
  }, [lines]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Error Log</Text>
        <Space>
          <Select
            value={lines}
            onChange={setLines}
            size="small"
            style={{ width: 100 }}
            options={[
              { value: 50, label: 'Last 50' },
              { value: 100, label: 'Last 100' },
              { value: 300, label: 'Last 300' },
              { value: 500, label: 'Last 500' },
            ]}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchLog} style={{ borderRadius: 6 }}>
            Refresh
          </Button>
        </Space>
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="460px"
            defaultLanguage="plaintext"
            value={typeof content === 'string' ? content : JSON.stringify(content)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
