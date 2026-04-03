import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Form, Input, Select, Popconfirm, Table, Tag, Progress } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, ThunderboltOutlined, FileTextOutlined,
  FieldTimeOutlined, DatabaseOutlined, SafetyCertificateOutlined,
  InfoCircleOutlined, TeamOutlined, DeleteOutlined, KeyOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

const SECTIONS = [
  { key: 'service',     label: 'Service',      icon: <PlayCircleOutlined /> },
  { key: 'config',      label: 'Config File',   icon: <CodeOutlined /> },
  { key: 'performance', label: 'Performance',    icon: <ThunderboltOutlined /> },
  { key: 'memory',      label: 'Memory',         icon: <SafetyCertificateOutlined /> },
  { key: 'clients',     label: 'Clients',        icon: <TeamOutlined /> },
  { key: 'persistence', label: 'Persistence',    icon: <DatabaseOutlined /> },
  { key: 'slowlog',     label: 'Slow Log',       icon: <FieldTimeOutlined /> },
  { key: 'errorlog',    label: 'Error Log',      icon: <FileTextOutlined /> },
  { key: 'security',    label: 'Security',       icon: <KeyOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RedisManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p } = usePalette();
  const [section, setSection] = useState<SectionKey>('service');

  const MODAL_BORDER = p.cardBorder || '#E8EDF2';
  const MODAL_PRIMARY = p.accent || '#1565C0';
  const MODAL_PRIMARY_LIGHT = `${MODAL_PRIMARY}12`;
  const MODAL_TEXT = p.text || '#1A1A2E';

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? MODAL_PRIMARY : MODAL_TEXT,
    background: active ? MODAL_PRIMARY_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${MODAL_PRIMARY}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${MODAL_PRIMARY}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const renderContent = () => {
    switch (section) {
      case 'service':     return <ServiceTab />;
      case 'config':      return <ConfigTab />;
      case 'performance': return <PerformanceTab />;
      case 'memory':      return <MemoryTab />;
      case 'clients':     return <ClientsTab />;
      case 'persistence': return <PersistenceTab />;
      case 'slowlog':     return <SlowLogTab />;
      case 'errorlog':    return <ErrorLogTab />;
      case 'security':    return <SecurityTab />;
      default:            return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <DatabaseOutlined style={{ color: '#DC382D' }} />
          <span>Redis Manager</span>
        </Space>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        <div style={{
          width: isMobile ? '100%' : 200,
          borderRight: isMobile ? 'none' : `1px solid ${MODAL_BORDER}`,
          borderBottom: isMobile ? `1px solid ${MODAL_BORDER}` : 'none',
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
// Shared
// ============================================================================
const REDIS_COLOR = '#DC382D';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const ERROR_CLR = '#F44336';
const WARNING = '#FF9800';
const PRIMARY = '#1565C0';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 20 }}>{children}</Text>;
}

function InfoRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
      <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || TEXT_PRIMARY }}>{value}</span>
    </div>
  );
}

function InfoTable({ rows }: { rows: { label: string; value: React.ReactNode; color?: string }[] }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 24 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ background: i % 2 === 0 ? '#FAFBFC' : '#fff', borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
          <InfoRow {...r} />
        </div>
      ))}
    </div>
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
      const { data: resp } = await api.get('/software/redis/status');
      setStatus(resp.data);
    } catch { setStatus(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchStatus]);

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'reload') => {
    setActionLoading(action);
    try {
      await api.post(`/software/redis/${action}`);
      message.success(`Redis ${action}ed successfully`);
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} Redis`);
    } finally { setActionLoading(null); }
  };

  const running = status?.running === true || status?.is_running === true;
  const infoRows = status ? [
    { label: 'Service Name', value: status.name || status.service || 'redis-server' },
    { label: 'Version', value: status.version || '—' },
    { label: 'Status', value: status.activestate || (running ? 'active' : 'inactive') },
    { label: 'Sub-state', value: status.substate || '—' },
    { label: 'PID', value: status.mainpid || '—' },
    { label: 'Memory Usage', value: status.memorycurrent || '—' },
    { label: 'Port', value: '6379' },
    { label: 'Data Directory', value: '/ITDLUPanel/server/redis/data' },
  ] : [];

  return (
    <div>
      <SectionTitle>Service Status</SectionTitle>
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
              background: running ? SUCCESS : ERROR_CLR,
              boxShadow: `0 0 8px ${running ? SUCCESS : ERROR_CLR}50`,
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

          <InfoTable rows={infoRows} />

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
          </Space>

          <div style={{ marginTop: 24, padding: 16, background: '#F5F5F5', borderRadius: 8, fontSize: 12, color: TEXT_SECONDARY }}>
            <p style={{ margin: '0 0 6px' }}>
              <InfoCircleOutlined style={{ marginRight: 6, color: REDIS_COLOR }} />
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
        const { data: resp } = await api.get('/redis/config-file');
        const cfg = resp.data;
        setContent(typeof cfg === 'string' ? cfg : cfg?.content ?? '');
      } catch {
        setContent('# Failed to load configuration');
      } finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/redis/config-file', { content });
      message.success('Configuration saved. Redis will reload.');
    } catch {
      message.error('Failed to save configuration');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionTitle>Redis Configuration</SectionTitle>
        <Button type="primary" size="small" onClick={handleSave} loading={saving} style={{ background: REDIS_COLOR, borderColor: REDIS_COLOR, borderRadius: 6 }}>
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
            options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, tabSize: 4 }}
          />
        </div>
      )}

      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: '#FFF3E0', border: '1px solid #FFCC80', fontSize: 12, color: '#E65100' }}>
        <SettingOutlined style={{ marginRight: 6 }} />
        Incorrect modifications may cause Redis to fail to start. Redis will reload after saving.
      </div>
    </div>
  );
}

// ============================================================================
// Performance Tab — Redis INFO stats
// ============================================================================
function PerformanceTab() {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<any>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/redis/info');
      setInfo(resp.data || {});
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchInfo();
    timerRef.current = setInterval(fetchInfo, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchInfo]);

  const statsGroups = [
    {
      title: 'Server',
      icon: <DatabaseOutlined style={{ color: REDIS_COLOR }} />,
      rows: [
        { label: 'Redis Version', value: info.redis_version || '—' },
        { label: 'Redis Mode', value: info.redis_mode || '—' },
        { label: 'OS', value: info.os || '—' },
        { label: 'Uptime (seconds)', value: info.uptime_in_seconds ? Number(info.uptime_in_seconds).toLocaleString() : '—' },
        { label: 'Uptime (days)', value: info.uptime_in_days || '—' },
        { label: 'Process ID', value: info.process_id || '—' },
        { label: 'TCP Port', value: info.tcp_port || '—' },
        { label: 'Config File', value: info.config_file || '—' },
      ],
    },
    {
      title: 'Stats',
      icon: <ThunderboltOutlined style={{ color: WARNING }} />,
      rows: [
        { label: 'Total Connections Received', value: info.total_connections_received ? Number(info.total_connections_received).toLocaleString() : '—' },
        { label: 'Total Commands Processed', value: info.total_commands_processed ? Number(info.total_commands_processed).toLocaleString() : '—' },
        { label: 'Instantaneous Ops/sec', value: info.instantaneous_ops_per_sec || '—' },
        { label: 'Keyspace Hits', value: info.keyspace_hits ? Number(info.keyspace_hits).toLocaleString() : '—' },
        { label: 'Keyspace Misses', value: info.keyspace_misses ? Number(info.keyspace_misses).toLocaleString() : '—' },
        { label: 'Hit Rate', value: (() => {
          const hits = Number(info.keyspace_hits || 0);
          const misses = Number(info.keyspace_misses || 0);
          const total = hits + misses;
          return total > 0 ? `${((hits / total) * 100).toFixed(2)}%` : '—';
        })() },
        { label: 'Expired Keys', value: info.expired_keys ? Number(info.expired_keys).toLocaleString() : '—' },
        { label: 'Evicted Keys', value: info.evicted_keys ? Number(info.evicted_keys).toLocaleString() : '—' },
      ],
    },
    {
      title: 'Clients',
      icon: <TeamOutlined style={{ color: PRIMARY }} />,
      rows: [
        { label: 'Connected Clients', value: info.connected_clients || '—' },
        { label: 'Blocked Clients', value: info.blocked_clients || '—' },
        { label: 'Max Clients', value: info.maxclients || '—' },
      ],
    },
    {
      title: 'Replication',
      icon: <ReloadOutlined style={{ color: SUCCESS }} />,
      rows: [
        { label: 'Role', value: info.role || '—' },
        { label: 'Connected Slaves', value: info.connected_slaves || '—' },
      ],
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <SectionTitle>Performance Stats</SectionTitle>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchInfo} style={{ borderRadius: 6 }}>Refresh</Button>
      </div>
      {loading ? <Spin /> : (
        <>
          {statsGroups.map(group => (
            <div key={group.title} style={{ marginBottom: 20, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#FAFBFC', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                {group.icon}
                <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>{group.title}</Text>
              </div>
              {group.rows.map((r, i) => (
                <div key={r.label} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC', borderBottom: i < group.rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <InfoRow {...r} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Memory Tab
// ============================================================================
function MemoryTab() {
  const [mem, setMem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchMem = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/redis/memory');
      setMem(resp.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMem(); }, [fetchMem]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const vals = await form.validateFields();
      if (vals.maxmemory) {
        await api.put('/redis/config', { key: 'maxmemory', value: vals.maxmemory });
      }
      if (vals.maxmemory_policy) {
        await api.put('/redis/config', { key: 'maxmemory-policy', value: vals.maxmemory_policy });
      }
      message.success('Memory settings saved');
      fetchMem();
    } catch {
      message.error('Failed to save memory settings');
    } finally { setSaving(false); }
  };

  const usedPct = mem && mem.max_memory > 0
    ? Math.min(100, Math.round((mem.used_memory / mem.max_memory) * 100))
    : 0;

  const POLICIES = [
    { value: 'noeviction', label: 'noeviction — Return errors when memory limit reached' },
    { value: 'allkeys-lru', label: 'allkeys-lru — Evict least recently used keys' },
    { value: 'allkeys-lfu', label: 'allkeys-lfu — Evict least frequently used keys' },
    { value: 'allkeys-random', label: 'allkeys-random — Evict random keys' },
    { value: 'volatile-lru', label: 'volatile-lru — Evict LRU keys with TTL' },
    { value: 'volatile-lfu', label: 'volatile-lfu — Evict LFU keys with TTL' },
    { value: 'volatile-random', label: 'volatile-random — Evict random keys with TTL' },
    { value: 'volatile-ttl', label: 'volatile-ttl — Evict keys with shortest TTL' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <SectionTitle>Memory Management</SectionTitle>
        <Space>
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchMem} style={{ borderRadius: 6 }}>Refresh</Button>
          <Button type="primary" size="small" onClick={handleSave} loading={saving} style={{ background: REDIS_COLOR, borderColor: REDIS_COLOR, borderRadius: 6 }}>Save</Button>
        </Space>
      </div>

      {loading ? <Spin /> : mem ? (
        <>
          {/* Memory usage gauge */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 10, textAlign: 'center' }}>
              <Progress
                type="dashboard"
                percent={usedPct}
                strokeColor={usedPct > 90 ? ERROR_CLR : usedPct > 70 ? WARNING : SUCCESS}
                size={100}
              />
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 8 }}>Memory Usage</div>
            </div>
            <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <InfoRow label="Used Memory" value={mem.used_memory_human || '—'} />
              <InfoRow label="Peak Memory" value={mem.used_memory_peak_human || '—'} />
              <InfoRow label="Max Memory" value={mem.max_memory_human || '0 (unlimited)'} />
              <InfoRow label="Fragmentation" value={mem.mem_frag_ratio || '—'} />
            </div>
          </div>

          <InfoTable rows={[
            { label: 'Used Memory (bytes)', value: mem.used_memory?.toLocaleString() || '—' },
            { label: 'Peak Memory (bytes)', value: mem.used_memory_peak?.toLocaleString() || '—' },
            { label: 'Max Memory (bytes)', value: mem.max_memory?.toLocaleString() || '0' },
            { label: 'Eviction Policy', value: <Tag color={REDIS_COLOR}>{mem.max_memory_policy || 'noeviction'}</Tag> },
            { label: 'Fragmentation Ratio', value: mem.mem_frag_ratio || '—' },
          ]} />

          {/* Settings form */}
          <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 12 }}>
              <SettingOutlined style={{ marginRight: 6 }} /> Memory Settings
            </Text>
            <Form form={form} layout="vertical" size="small" initialValues={{ maxmemory: mem.max_memory_human || '', maxmemory_policy: mem.max_memory_policy || 'noeviction' }}>
              <Form.Item label="Max Memory (e.g. 256mb, 1gb, 0 for unlimited)" name="maxmemory">
                <Input placeholder="e.g. 256mb" style={{ borderRadius: 6 }} />
              </Form.Item>
              <Form.Item label="Eviction Policy" name="maxmemory_policy">
                <Select options={POLICIES} style={{ borderRadius: 6 }} />
              </Form.Item>
            </Form>
          </div>
        </>
      ) : (
        <Text type="secondary">Failed to load memory stats</Text>
      )}
    </div>
  );
}

// ============================================================================
// Clients Tab
// ============================================================================
function ClientsTab() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/redis/clients');
      setClients(resp.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Address', dataIndex: 'addr', key: 'addr', width: 160 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 100, render: (v: string) => v || '—' },
    { title: 'DB', dataIndex: 'db', key: 'db', width: 50 },
    { title: 'Command', dataIndex: 'cmd', key: 'cmd', width: 100 },
    { title: 'Age (s)', dataIndex: 'age', key: 'age', width: 80 },
    { title: 'Idle (s)', dataIndex: 'idle', key: 'idle', width: 80 },
    { title: 'Flags', dataIndex: 'flags', key: 'flags', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="Kill this client?" onConfirm={async () => {
          try {
            await api.delete(`/redis/clients/${record.id}`);
            message.success('Client killed');
            fetchClients();
          } catch { message.error('Failed to kill client'); }
        }}>
          <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <SectionTitle>Connected Clients</SectionTitle>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchClients} style={{ borderRadius: 6 }}>Refresh</Button>
      </div>
      <Table
        dataSource={clients}
        columns={columns}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 800 }}
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['10', '20', '50'], showSizeChanger: true, showTotal: (total) => `Total: ${total}` }}
        style={{ borderRadius: 10, overflow: 'hidden' }}
      />
    </div>
  );
}

// ============================================================================
// Persistence Tab
// ============================================================================
function PersistenceTab() {
  const [persistence, setPersistence] = useState<any>(null);
  const [dbsize, setDbsize] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, dRes] = await Promise.all([
        api.get('/redis/persistence'),
        api.get('/redis/dbsize'),
      ]);
      setPersistence(pRes.data?.data);
      setDbsize(dRes.data?.data || {});
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dbEntries = Object.entries(dbsize).map(([k, v]) => ({
    label: `DB ${k}`,
    value: `${v.toLocaleString()} keys`,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <SectionTitle>Persistence & Keyspace</SectionTitle>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchData} style={{ borderRadius: 6 }}>Refresh</Button>
      </div>

      {loading ? <Spin /> : persistence ? (
        <>
          {/* RDB */}
          <div style={{ marginBottom: 20, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#FAFBFC', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DatabaseOutlined style={{ color: PRIMARY }} />
              <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>RDB Snapshots</Text>
              <Tag color={persistence.rdb_enabled ? 'green' : 'default'} style={{ marginLeft: 'auto' }}>
                {persistence.rdb_enabled ? 'Enabled' : 'Disabled'}
              </Tag>
            </div>
            <InfoTable rows={[
              { label: 'Last Save Time', value: persistence.rdb_last_save_time ? new Date(persistence.rdb_last_save_time * 1000).toLocaleString() : '—' },
              { label: 'Last Save Status', value: persistence.rdb_last_status || '—', color: persistence.rdb_last_status === 'ok' ? SUCCESS : ERROR_CLR },
              { label: 'Currently Saving', value: persistence.rdb_current_save ? 'Yes' : 'No', color: persistence.rdb_current_save ? WARNING : SUCCESS },
            ]} />
          </div>

          {/* AOF */}
          <div style={{ marginBottom: 20, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#FAFBFC', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextOutlined style={{ color: WARNING }} />
              <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>AOF (Append Only File)</Text>
              <Tag color={persistence.aof_enabled ? 'green' : 'default'} style={{ marginLeft: 'auto' }}>
                {persistence.aof_enabled ? 'Enabled' : 'Disabled'}
              </Tag>
            </div>
            <InfoTable rows={[
              { label: 'Last Rewrite Status', value: persistence.aof_last_rewrite_status || '—' },
              { label: 'Current AOF Size', value: persistence.aof_current_size ? `${(persistence.aof_current_size / 1024 / 1024).toFixed(2)} MB` : '—' },
              { label: 'AOF Base Size', value: persistence.aof_base_size ? `${(persistence.aof_base_size / 1024 / 1024).toFixed(2)} MB` : '—' },
            ]} />
          </div>

          {/* Keyspace */}
          {dbEntries.length > 0 && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: '#FAFBFC', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <SafetyCertificateOutlined style={{ color: SUCCESS }} />
                <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Keyspace</Text>
              </div>
              <InfoTable rows={dbEntries} />
            </div>
          )}

          {/* Flush buttons */}
          <div style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, display: 'block', marginBottom: 12 }}>
              <DeleteOutlined style={{ marginRight: 6, color: ERROR_CLR }} /> Danger Zone
            </Text>
            <Space wrap>
              <Popconfirm title="Flush ALL databases? This cannot be undone!" onConfirm={async () => {
                try {
                  await api.post('/redis/flush', { db: -1 });
                  message.success('All databases flushed');
                  fetchData();
                } catch { message.error('Failed to flush'); }
              }}>
                <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>Flush All</Button>
              </Popconfirm>
            </Space>
          </div>
        </>
      ) : (
        <Text type="secondary">Failed to load persistence info</Text>
      )}
    </div>
  );
}

// ============================================================================
// Slow Log Tab
// ============================================================================
function SlowLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/redis/slowlog?count=50');
      setLogs(resp.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Time', dataIndex: 'timestamp', key: 'timestamp', width: 160, render: (v: number) => v ? new Date(v * 1000).toLocaleString() : '—' },
    { title: 'Duration (μs)', dataIndex: 'duration', key: 'duration', width: 110, render: (v: number) => <Tag color={v > 10000 ? 'red' : v > 1000 ? 'orange' : 'green'}>{v?.toLocaleString()}</Tag> },
    { title: 'Command', dataIndex: 'command', key: 'command', render: (v: string[]) => <code style={{ fontSize: 12, background: '#F5F5F5', padding: '2px 6px', borderRadius: 4 }}>{(v || []).join(' ')}</code> },
    { title: 'Client', dataIndex: 'client_addr', key: 'client_addr', width: 140 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <SectionTitle>Slow Log</SectionTitle>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchLogs} style={{ borderRadius: 6 }}>Refresh</Button>
      </div>
      <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: '#F5F5F5', fontSize: 12, color: TEXT_SECONDARY }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Queries that exceeded the <code>slowlog-log-slower-than</code> threshold. Default: 10,000μs (10ms).
      </div>
      <Table
        dataSource={logs}
        columns={columns}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 700 }}
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['10', '20', '50'], showSizeChanger: true }}
        style={{ borderRadius: 10, overflow: 'hidden' }}
      />
    </div>
  );
}

// ============================================================================
// Error Log Tab
// ============================================================================
function ErrorLogTab() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(200);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/redis/error-log?lines=${lines}`);
      const log = resp.data;
      setContent(typeof log === 'string' ? log : log?.content ?? '');
    } catch {
      setContent('# Failed to load error log');
    } finally { setLoading(false); }
  }, [lines]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionTitle>Error Log</SectionTitle>
        <Space>
          <Select value={lines} onChange={setLines} size="small" style={{ width: 100 }} options={[
            { value: 100, label: '100 lines' },
            { value: 200, label: '200 lines' },
            { value: 500, label: '500 lines' },
            { value: 1000, label: '1000 lines' },
          ]} />
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchLog} style={{ borderRadius: 6 }}>Refresh</Button>
        </Space>
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="500px"
            defaultLanguage="log"
            value={content}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Security Tab — Password management
// ============================================================================
function SecurityTab() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: resp } = await api.get('/redis/config');
        const cfg = resp.data || {};
        setCurrentPass(cfg.requirepass || '');
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const vals = await form.validateFields();
      await api.put('/redis/password', { password: vals.password });
      message.success('Redis password updated');
      setCurrentPass(vals.password);
    } catch {
      message.error('Failed to update password');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <SectionTitle>Security Settings</SectionTitle>

      {loading ? <Spin /> : (
        <>
          <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <KeyOutlined style={{ color: REDIS_COLOR }} />
              <Text style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>Authentication</Text>
            </div>

            <div style={{
              padding: '10px 16px', borderRadius: 6, marginBottom: 16,
              background: currentPass ? '#E8F5E9' : '#FFF3E0',
              border: `1px solid ${currentPass ? '#A5D6A7' : '#FFCC80'}`,
              fontSize: 13,
            }}>
              {currentPass ? (
                <span style={{ color: '#2E7D32' }}><SafetyCertificateOutlined style={{ marginRight: 6 }} /> Password authentication is enabled</span>
              ) : (
                <span style={{ color: '#E65100' }}><InfoCircleOutlined style={{ marginRight: 6 }} /> No password set — Redis is accessible without authentication</span>
              )}
            </div>

            <Form form={form} layout="vertical" size="small">
              <Form.Item label="New Password (leave empty to remove password)" name="password">
                <Input.Password placeholder="Enter new Redis password" style={{ borderRadius: 6 }} />
              </Form.Item>
              <Button type="primary" onClick={handleSave} loading={saving} style={{ background: REDIS_COLOR, borderColor: REDIS_COLOR, borderRadius: 6 }}>
                Update Password
              </Button>
            </Form>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: 6, background: '#F5F5F5', fontSize: 12, color: TEXT_SECONDARY }}>
            <InfoCircleOutlined style={{ marginRight: 6 }} />
            Password is set via <code>requirepass</code> directive. After changing, existing connections will need to re-authenticate with <code>AUTH</code> command.
          </div>
        </>
      )}
    </div>
  );
}
