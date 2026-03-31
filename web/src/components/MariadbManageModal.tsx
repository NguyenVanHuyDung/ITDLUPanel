import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Form, Input, Switch, Tooltip } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, ThunderboltOutlined, FileTextOutlined,
  FieldTimeOutlined, DatabaseOutlined, SafetyCertificateOutlined,
  InfoCircleOutlined, CheckCircleFilled, WarningOutlined,
} from '@ant-design/icons';
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
  { key: 'service',      label: 'Service',           icon: <PlayCircleOutlined /> },
  { key: 'config',       label: 'Config File',       icon: <CodeOutlined /> },
  { key: 'optimization', label: 'Optimization',      icon: <ThunderboltOutlined /> },
  { key: 'errorlog',     label: 'Error Log',         icon: <FileTextOutlined /> },
  { key: 'slowlog',      label: 'Slow Log',          icon: <FieldTimeOutlined /> },
  { key: 'binlog',       label: 'Binary Log',        icon: <DatabaseOutlined /> },
  { key: 'memory',       label: 'Memory Protection', icon: <SafetyCertificateOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ============================================================================
// Main Modal
// ============================================================================
export default function MariadbManageModal({ open, onClose }: Props) {
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
      case 'slowlog':      return <SlowLogTab />;
      case 'binlog':       return <BinaryLogTab />;
      case 'memory':       return <MemoryProtectionTab />;
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
          <DatabaseOutlined style={{ color: '#00758F' }} />
          <span>MariaDB Manager</span>
        </Space>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        {/* Sidebar */}
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
  const timerRef = useRef<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/mysql/status');
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
      await api.post(`/software/mysql/${action}`);
      message.success(`MariaDB ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} MariaDB`);
    } finally {
      setActionLoading(null);
    }
  };

  const running = status?.running === true || status?.is_running === true;

  const infoRows = status ? [
    { label: 'Service Name', value: status.name || status.service || 'mariadb' },
    { label: 'Version', value: status.version || '—' },
    { label: 'Status', value: status.activestate || (running ? 'active' : 'inactive') },
    { label: 'Sub-state', value: status.substate || '—' },
    { label: 'PID', value: status.mainpid || '—' },
    { label: 'Memory Usage', value: status.memorycurrent || '—' },
    { label: 'Port', value: '3306' },
    { label: 'Data Directory', value: '/var/lib/mysql' },
  ] : [];

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

          {/* Info table */}
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
        const { data: resp } = await api.get('/software/mysql/config');
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
      await api.put('/software/mysql/config', { content });
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
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>MariaDB Configuration</Text>
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

      {/* Warning */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 6,
        background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100',
      }}>
        ⚠️ This is the main configuration file of MariaDB. Incorrect modifications may cause MariaDB to fail to start.
      </div>
    </div>
  );
}

// ============================================================================
// Optimization Tab
// ============================================================================
const OPT_GROUPS = [
  {
    title: 'InnoDB',
    icon: <DatabaseOutlined />,
    fields: [
      { key: 'innodb_buffer_pool_size', label: 'Buffer Pool Size', desc: 'Memory allocated for InnoDB buffer pool (e.g. 256M, 1G). Primary tuning parameter.' },
      { key: 'innodb_log_file_size', label: 'Log File Size', desc: 'Size of each InnoDB redo log file (e.g. 64M, 256M).' },
      { key: 'innodb_flush_log_at_trx_commit', label: 'Flush Log at Commit', desc: '1 = full ACID, 2 = flush every second, 0 = fastest but risk data loss.', type: 'select' as const, options: ['0', '1', '2'] },
      { key: 'innodb_flush_method', label: 'Flush Method', desc: 'I/O flush method. O_DIRECT avoids double buffering.', type: 'select' as const, options: ['O_DIRECT', 'fsync', 'O_DSYNC'] },
      { key: 'innodb_io_capacity', label: 'I/O Capacity', desc: 'I/O operations per second for background tasks. SSD: 1000–2000, HDD: 200.' },
      { key: 'innodb_io_capacity_max', label: 'I/O Capacity Max', desc: 'Max I/O operations per second under pressure.' },
    ],
  },
  {
    title: 'Query Cache',
    icon: <ThunderboltOutlined />,
    fields: [
      { key: 'query_cache_type', label: 'Type', desc: '0 = OFF, 1 = ON, 2 = DEMAND (only cache with SQL_CACHE hint).', type: 'select' as const, options: ['0', '1', '2'] },
      { key: 'query_cache_size', label: 'Size', desc: 'Total query cache memory (e.g. 64M). 0 to disable.' },
      { key: 'query_cache_limit', label: 'Limit', desc: 'Max result set size to cache (e.g. 2M).' },
    ],
  },
  {
    title: 'Connections',
    icon: <PlayCircleOutlined />,
    fields: [
      { key: 'max_connections', label: 'Max Connections', desc: 'Maximum concurrent connections. Default: 151.' },
      { key: 'thread_cache_size', label: 'Thread Cache Size', desc: 'Threads to cache for reuse. Reduces thread creation overhead.' },
      { key: 'table_open_cache', label: 'Table Open Cache', desc: 'Number of open tables cached across all threads.' },
      { key: 'table_definition_cache', label: 'Table Definition Cache', desc: 'Number of table definitions (.frm) to cache.' },
    ],
  },
  {
    title: 'Memory Buffers',
    icon: <SafetyCertificateOutlined />,
    fields: [
      { key: 'tmp_table_size', label: 'Tmp Table Size', desc: 'Max in-memory temp table size (e.g. 64M).' },
      { key: 'max_heap_table_size', label: 'Max Heap Table Size', desc: 'Max size for MEMORY tables (e.g. 64M).' },
      { key: 'join_buffer_size', label: 'Join Buffer Size', desc: 'Buffer for joins without indexes (per-thread).' },
      { key: 'sort_buffer_size', label: 'Sort Buffer Size', desc: 'Buffer for sorting operations (per-thread).' },
      { key: 'read_buffer_size', label: 'Read Buffer Size', desc: 'Buffer for sequential table scans (per-thread).' },
      { key: 'read_rnd_buffer_size', label: 'Read Rnd Buffer Size', desc: 'Buffer for random reads after sort (per-thread).' },
      { key: 'key_buffer_size', label: 'Key Buffer Size', desc: 'MyISAM index cache. Set low if using mostly InnoDB.' },
    ],
  },
  {
    title: 'Logging',
    icon: <FileTextOutlined />,
    fields: [
      { key: 'slow_query_log', label: 'Slow Query Log', desc: 'Enable logging of slow queries.', type: 'switch' as const },
      { key: 'long_query_time', label: 'Long Query Time', desc: 'Queries slower than this (seconds) are logged.' },
      { key: 'log_bin', label: 'Binary Log', desc: 'Base name for binary log files (e.g. mysql-bin).' },
      { key: 'expire_logs_days', label: 'Expire Logs Days', desc: 'Automatically purge binary logs older than N days.' },
      { key: 'binlog_format', label: 'Binlog Format', desc: 'Binary log format.', type: 'select' as const, options: ['ROW', 'STATEMENT', 'MIXED'] },
      { key: 'max_binlog_size', label: 'Max Binlog Size', desc: 'Max size of a single binary log file (e.g. 100M).' },
    ],
  },
];

interface RamPlan {
  [key: string]: string | number;
}
interface RamPlans {
  low: RamPlan;
  medium: RamPlan;
  high: RamPlan;
  ultra: RamPlan;
  recommended?: string;
}

function OptimizationTab() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ramPlans, setRamPlans] = useState<RamPlans | null>(null);
  const [totalRam, setTotalRam] = useState(0);
  const [activePlan, setActivePlan] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [optRes, ramRes] = await Promise.all([
          api.get('/software/mysql/optimization'),
          api.get('/software/mysql/ram-plans'),
        ]);
        if (optRes.data?.data) form.setFieldsValue(optRes.data.data);
        if (ramRes.data?.data) {
          setRamPlans(ramRes.data.data.plans);
          setTotalRam(ramRes.data.data.total_ram_mb || 0);
        }
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
      await api.put('/software/mysql/optimization', values);
      message.success('Optimization settings saved. Restart MariaDB to apply.');
    } catch (e: any) {
      if (e.response) message.error('Failed to save optimization settings');
    } finally {
      setSaving(false);
    }
  };

  const applyPlan = (planKey: string) => {
    if (!ramPlans || !(planKey in ramPlans)) return;
    const plan = ramPlans[planKey as keyof RamPlans];
    if (typeof plan === 'string') return;
    form.setFieldsValue(plan);
    setActivePlan(planKey);
    message.success(`Applied "${planKey}" preset. Review values and click Save.`);
  };

  const planMeta: Record<string, { label: string; color: string; desc: string }> = {
    low:    { label: 'Low',    color: '#66BB6A', desc: 'Minimal memory — shared hosting / low traffic' },
    medium: { label: 'Medium', color: PRIMARY,   desc: 'Balanced — moderate traffic sites' },
    high:   { label: 'High',   color: WARNING,   desc: 'Performance — high traffic production' },
    ultra:  { label: 'Ultra',  color: ERROR,     desc: 'Maximum — dedicated database server' },
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
        <>
          {/* RAM Presets */}
          {ramPlans && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ThunderboltOutlined style={{ color: PRIMARY, fontSize: 15 }} />
                <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>RAM Presets</Text>
                {totalRam > 0 && (
                  <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginLeft: 'auto' }}>
                    Total RAM: {totalRam} MB
                  </Text>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {Object.entries(planMeta).map(([key, meta]) => {
                  const plan = ramPlans[key as keyof RamPlans];
                  if (!plan || typeof plan === 'string') return null;
                  const isRecommended = ramPlans.recommended === key;
                  const isActive = activePlan === key;
                  return (
                    <div
                      key={key}
                      onClick={() => applyPlan(key)}
                      style={{
                        padding: 14, borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${isActive ? meta.color : isRecommended ? meta.color + '60' : BORDER}`,
                        background: isActive ? meta.color + '0A' : '#fff',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      {isRecommended && (
                        <span style={{
                          position: 'absolute', top: -8, right: 8,
                          fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 4,
                          background: SUCCESS + '18', color: SUCCESS,
                        }}>
                          <CheckCircleFilled /> Recommended
                        </span>
                      )}
                      <div style={{ fontSize: 14, fontWeight: 600, color: meta.color, marginBottom: 4 }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 8 }}>
                        {meta.desc}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_PRIMARY }}>
                        {plan.innodb_buffer_pool_size && (
                          <div>Buffer Pool: <strong>{String(plan.innodb_buffer_pool_size)}</strong></div>
                        )}
                        {plan.max_connections && (
                          <div>Max Conn: <strong>{String(plan.max_connections)}</strong></div>
                        )}
                        {plan.key_buffer_size && (
                          <div>Key Buffer: <strong>{String(plan.key_buffer_size)}</strong></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Tuning */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CodeOutlined style={{ color: PRIMARY, fontSize: 15 }} />
            <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Manual Tuning</Text>
          </div>

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
                      valuePropName={f.type === 'switch' ? 'checked' : 'value'}
                    >
                      {f.type === 'select' ? (
                        <Select options={f.options!.map(o => ({ value: o, label: o }))} style={{ width: 160 }} />
                      ) : f.type === 'switch' ? (
                        <Switch />
                      ) : (
                        <Input style={{ maxWidth: 300, fontSize: 13 }} />
                      )}
                    </Form.Item>
                    <Text style={{ fontSize: 11, color: TEXT_SECONDARY }}>{f.desc}</Text>
                  </div>
                ))}
              </div>
            ))}
          </Form>
        </>
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
  const [lines, setLines] = useState(200);
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLog = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/mysql/error-log?lines=${n}`);
      setContent(resp.data?.content || '(empty)');
      setLogPath(resp.data?.path || '');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setContent(msg || 'Failed to load error log');
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
          {[100, 200, 500, 1000].map(n => (
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
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => fetchLog(lines)}
            style={{ borderRadius: 4 }}
          />
        </Space>
      </div>

      {loading ? <Spin /> : (
        <pre
          ref={logRef}
          style={{
            background: '#0D1117',
            color: '#E6EDF3',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}

// ============================================================================
// Slow Log Tab
// ============================================================================
function SlowLogTab() {
  const [content, setContent] = useState('');
  const [logPath, setLogPath] = useState('');
  const [lines, setLines] = useState(200);
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLog = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/mysql/slow-log?lines=${n}`);
      setContent(resp.data?.content || '(empty)');
      setLogPath(resp.data?.path || '');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setContent(msg || 'Failed to load slow query log');
    }
    setLoading(false);
    setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, 100);
  }, []);

  useEffect(() => { fetchLog(lines); }, [fetchLog, lines]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Slow Query Log</Text>
          {logPath && (
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, display: 'block' }}>
              From {logPath}
            </Text>
          )}
        </div>
        <Space>
          <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>Last</Text>
          {[100, 200, 500, 1000].map(n => (
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
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => fetchLog(lines)}
            style={{ borderRadius: 4 }}
          />
        </Space>
      </div>

      {loading ? <Spin /> : (
        <pre
          ref={logRef}
          style={{
            background: '#0D1117',
            color: '#E6EDF3',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}
        >
          {content}
        </pre>
      )}

      {/* Info */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 6,
        background: '#F5F5F5', fontSize: 12, color: TEXT_SECONDARY,
      }}>
        <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
        Slow queries are logged when execution time exceeds <strong>long_query_time</strong>. Enable via the Optimization tab.
      </div>
    </div>
  );
}

// ============================================================================
// Binary Log Tab
// ============================================================================
interface BinlogEntry {
  name: string;
  size: number | string;
}

function BinaryLogTab() {
  const [logs, setLogs] = useState<BinlogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: resp } = await api.get('/software/mysql/binary-logs');
      setLogs(resp.data?.logs || []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg || 'Failed to load binary logs');
      setLogs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatSize = (size: number | string) => {
    const bytes = typeof size === 'string' ? parseInt(size, 10) : size;
    if (isNaN(bytes)) return String(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Binary Logs</Text>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={fetchLogs}
          style={{ borderRadius: 4 }}
        >
          Refresh
        </Button>
      </div>

      {loading ? <Spin /> : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
          <DatabaseOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
          <p>{errorMsg || 'No binary logs found.'}</p>
          <p style={{ fontSize: 12 }}>Binary logging may be disabled. Enable <strong>log_bin</strong> in the Optimization tab.</p>
        </div>
      ) : (
        <>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', background: '#F0F4F8',
              borderBottom: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 12, color: TEXT_SECONDARY,
            }}>
              <span>File Name</span>
              <span>Size</span>
            </div>
            {/* Rows */}
            {logs.map((log, i) => (
              <div key={log.name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px',
                background: i % 2 === 0 ? '#FAFBFC' : '#fff',
                borderBottom: i < logs.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{ fontSize: 13, color: TEXT_PRIMARY }}>
                  <FileTextOutlined style={{ marginRight: 8, color: TEXT_SECONDARY }} />
                  {log.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: PRIMARY }}>
                  {formatSize(log.size)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: TEXT_SECONDARY }}>
            Total: {logs.length} file{logs.length !== 1 ? 's' : ''}
          </div>
        </>
      )}

      {/* Info */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 6,
        background: '#F5F5F5', fontSize: 12, color: TEXT_SECONDARY,
      }}>
        <InfoCircleOutlined style={{ marginRight: 6, color: PRIMARY }} />
        Binary logs are used for replication and point-in-time recovery. Manage retention via <strong>expire_logs_days</strong> in the Optimization tab.
      </div>
    </div>
  );
}

// ============================================================================
// Memory Protection Tab
// ============================================================================
function MemoryProtectionTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memoryMax, setMemoryMax] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/software/mysql/memory-protection');
      setData(resp.data);
      setMemoryMax(resp.data?.memorymax || resp.data?.memory_max || '');
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/software/mysql/memory-protection', { memory_max: memoryMax });
      message.success('Memory protection updated. A service restart may be required.');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to update memory protection');
    } finally {
      setSaving(false);
    }
  };

  const presets = ['512M', '1G', '2G', '4G'];

  const oompolicyColor = (policy: string) => {
    switch (policy?.toLowerCase()) {
      case 'stop':     return ERROR;
      case 'continue': return WARNING;
      case 'kill':     return ERROR;
      default:         return TEXT_SECONDARY;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY }}>Memory Protection</Text>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY, display: 'block', marginTop: 4 }}>
          Configure systemd MemoryMax to prevent MariaDB from consuming all available RAM.
        </Text>
      </div>

      {loading ? <Spin /> : !data ? (
        <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
          Failed to load memory protection settings.
        </div>
      ) : (
        <>
          {/* Current status */}
          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 24 }}>
            {[
              { label: 'Memory Current', value: data.memorycurrent || '—' },
              { label: 'Memory Limit', value: data.memorylimit || '—' },
              { label: 'Memory High', value: data.memoryhigh || '—' },
              { label: 'Memory Max', value: data.memorymax || 'infinity' },
              { label: 'OOM Policy', value: data.oompolicy || '—' },
            ].map((r, i) => (
              <div key={r.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px',
                background: i % 2 === 0 ? '#FAFBFC' : '#fff',
                borderBottom: i < 4 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{r.label}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: r.label === 'OOM Policy' ? oompolicyColor(r.value) : TEXT_PRIMARY,
                }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>

          {/* Set Memory Max */}
          <div style={{
            padding: 16, borderRadius: 10,
            background: '#F8FAFC', border: `1px solid ${BORDER}`,
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 12 }}>
              Set MemoryMax
            </Text>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <Input
                value={memoryMax}
                onChange={e => setMemoryMax(e.target.value)}
                placeholder="e.g. 2G, 512M, infinity"
                style={{ width: 200, fontSize: 13 }}
              />
              <Button
                type="primary"
                onClick={handleSave}
                loading={saving}
                style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6 }}
              >
                Apply
              </Button>
            </div>

            {/* Preset buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {presets.map(p => (
                <Button
                  key={p}
                  size="small"
                  onClick={() => setMemoryMax(p)}
                  style={{
                    borderRadius: 4,
                    borderColor: memoryMax === p ? PRIMARY : undefined,
                    color: memoryMax === p ? PRIMARY : undefined,
                  }}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="small"
                onClick={() => setMemoryMax('infinity')}
                style={{
                  borderRadius: 4,
                  borderColor: memoryMax === 'infinity' ? WARNING : undefined,
                  color: memoryMax === 'infinity' ? WARNING : undefined,
                }}
              >
                No Limit
              </Button>
            </div>
          </div>

          {/* Warning */}
          <div style={{
            padding: '10px 12px', borderRadius: 6,
            background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100',
          }}>
            <WarningOutlined style={{ marginRight: 6 }} />
            Changing MemoryMax applies immediately via systemd. If MariaDB exceeds this limit, it may be killed by the OOM killer.
            A service restart is recommended after changing this value.
          </div>
        </>
      )}
    </div>
  );
}
