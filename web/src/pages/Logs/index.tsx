import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Card, Button, Tabs, Space, Input, Select, Typography, message, Popconfirm, Tag, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined, ClearOutlined, InfoCircleOutlined, WarningOutlined, BugOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

const { Text } = Typography;

interface AuditEntry {
  id: number;
  user: string;
  action: string;
  resource: string;
  ip: string;
  created_at: string;
}

interface ParsedLog {
  key: number;
  raw: string;
  level: string;
  time: string;
  message: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
  ip?: string;
  error?: string;
  extra: Record<string, unknown>;
}

const LEVEL_CONFIG: Record<string, { color: string; icon: React.ReactNode; tag: string }> = {
  debug: { color: '#8b949e', icon: <BugOutlined />, tag: 'default' },
  info:  { color: '#58a6ff', icon: <InfoCircleOutlined />, tag: 'processing' },
  warn:  { color: '#d29922', icon: <WarningOutlined />, tag: 'warning' },
  error: { color: '#f85149', icon: <CloseCircleOutlined />, tag: 'error' },
  fatal: { color: '#f85149', icon: <CloseCircleOutlined />, tag: 'error' },
};

const HIDDEN_KEYS = new Set(['level', 'time', 'message', 'caller', 'method', 'path', 'status', 'duration', 'ip', 'error', 'size']);

function parseLogLine(raw: string, idx: number): ParsedLog {
  try {
    const obj = JSON.parse(raw);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!HIDDEN_KEYS.has(k)) extra[k] = v;
    }
    return {
      key: idx,
      raw,
      level: obj.level || 'info',
      time: obj.time || '',
      message: obj.message || '',
      method: obj.method,
      path: obj.path,
      status: obj.status,
      duration: obj.duration,
      ip: obj.ip,
      error: obj.error,
      extra,
    };
  } catch {
    return { key: idx, raw, level: 'info', time: '', message: raw, extra: {} };
  }
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

function StatusTag({ status }: { status?: number }) {
  if (status == null) return null;
  const color = status >= 500 ? 'red' : status >= 400 ? 'orange' : status >= 300 ? 'blue' : 'green';
  return <Tag color={color} style={{ margin: 0 }}>{status}</Tag>;
}

export default function Logs() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [panelLines, setPanelLines] = useState<string[]>([]);
  const [sshLines, setSshLines] = useState<string[]>([]);
  const [auditData, setAuditData] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(200);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('panel');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const fetchPanelLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>('/logs/panel', { params: { lines: numLines } });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setPanelLines(raw);
      else if (typeof raw === 'string') setPanelLines(raw.split('\n').filter(Boolean));
      else setPanelLines([]);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchSshLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>('/logs/ssh', { params: { lines: numLines } });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setSshLines(raw);
      else if (typeof raw === 'string') setSshLines(raw.split('\n').filter(Boolean));
      else setSshLines([]);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<AuditEntry[]>>('/logs/audit');
      setAuditData(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refresh = useCallback(() => {
    if (activeTab === 'panel') fetchPanelLog(lines);
    else if (activeTab === 'ssh') fetchSshLog(lines);
    else fetchAuditLog();
  }, [activeTab, lines, fetchPanelLog, fetchSshLog, fetchAuditLog]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleClearLog = async () => {
    const endpoint = activeTab === 'panel' ? '/logs/panel' : '/logs/ssh';
    try {
      await api.delete(endpoint);
      message.success(t('common.success'));
      refresh();
    } catch {
      message.error(t('common.error'));
    }
  };

  const currentLines = activeTab === 'panel' ? panelLines : sshLines;
  const parsed = useMemo(() => currentLines.map((l, i) => parseLogLine(l, i)), [currentLines]);

  const filtered = useMemo(() => {
    let data = parsed;
    if (levelFilter !== 'all') {
      data = data.filter((l) => l.level === levelFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((l) =>
        l.message.toLowerCase().includes(q) ||
        (l.path || '').toLowerCase().includes(q) ||
        (l.ip || '').toLowerCase().includes(q) ||
        (l.error || '').toLowerCase().includes(q) ||
        l.raw.toLowerCase().includes(q)
      );
    }
    return data;
  }, [parsed, levelFilter, search]);

  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
      width: isMobile ? 80 : 110,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{formatTime(v)}</Text>,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (v: string) => {
        const cfg = LEVEL_CONFIG[v] || LEVEL_CONFIG.info;
        return <Tag color={cfg.tag} icon={cfg.icon} style={{ margin: 0 }}>{v.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Message',
      key: 'message',
      ellipsis: true,
      render: (_: unknown, r: ParsedLog) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.message}</Text>
          {r.method && r.path && (
            <span style={{ marginLeft: 8 }}>
              <Tag color="blue" style={{ margin: 0 }}>{r.method}</Tag>{' '}
              <Text code style={{ fontSize: 12 }}>{r.path}</Text>
              {r.status != null && <>{' '}<StatusTag status={r.status} /></>}
              {r.duration != null && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{r.duration.toFixed(1)}ms</Text>}
            </span>
          )}
          {r.error && <div><Text type="danger" style={{ fontSize: 12 }}>{r.error}</Text></div>}
          {Object.keys(r.extra).length > 0 && (
            <div style={{ marginTop: 2 }}>
              {Object.entries(r.extra).map(([k, v]) => (
                <Tooltip key={k} title={JSON.stringify(v)}>
                  <Tag style={{ fontSize: 11, margin: '1px 4px 1px 0' }}>{k}={typeof v === 'string' ? v : JSON.stringify(v)}</Tag>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: isMobile ? 90 : 120,
      render: (v?: string) => v ? <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text> : null,
    },
  ];

  const sshPlainColumns = [
    {
      title: '#',
      key: 'idx',
      width: 50,
      render: (_: unknown, __: unknown, i: number) => <Text type="secondary" style={{ fontSize: 11 }}>{i + 1}</Text>,
    },
    {
      title: 'Log Entry',
      dataIndex: 'raw',
      key: 'raw',
      render: (v: string) => {
        if (!search.trim()) return <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>;
        const parts = v.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return (
          <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {parts.map((part, i) =>
              part.toLowerCase() === search.toLowerCase()
                ? <span key={i} style={{ background: '#e2b714', color: '#000', borderRadius: 2, padding: '0 2px' }}>{part}</span>
                : part
            )}
          </Text>
        );
      },
    },
  ];

  const isJsonLog = currentLines.length > 0 && currentLines[0]?.startsWith('{');

  const auditColumns = [
    { title: 'User', dataIndex: 'user', key: 'user' },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (val: string) => <Text code>{val}</Text> },
    { title: 'Resource', dataIndex: 'resource', key: 'resource', ellipsis: true },
    { title: 'IP', dataIndex: 'ip', key: 'ip' },
    { title: 'Time', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val ? new Date(val).toLocaleString() : '-' },
  ];

  const logToolbar = (
    <Space wrap>
      <Input
        prefix={<SearchOutlined />}
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ width: isMobile ? 160 : 220 }}
      />
      {activeTab !== 'audit' && (
        <Select
          value={levelFilter}
          onChange={setLevelFilter}
          style={{ width: isMobile ? 80 : 110 }}
          options={[
            { label: 'All Levels', value: 'all' },
            { label: '🔴 Error', value: 'error' },
            { label: '🟡 Warn', value: 'warn' },
            { label: '🔵 Info', value: 'info' },
            { label: '⚪ Debug', value: 'debug' },
          ]}
        />
      )}
      <Select
        value={lines}
        onChange={(val: number) => setLines(val)}
        options={[
          { label: '100 lines', value: 100 },
          { label: '200 lines', value: 200 },
          { label: '500 lines', value: 500 },
          { label: '1000 lines', value: 1000 },
        ]}
        style={{ width: isMobile ? 90 : 130 }}
      />
      <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
        {t('common.refresh')}
      </Button>
      {activeTab !== 'audit' && (
        <Popconfirm title="Clear this log file?" onConfirm={handleClearLog}>
          <Button danger icon={<ClearOutlined />}>Clear</Button>
        </Popconfirm>
      )}
    </Space>
  );

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.logs')}</Typography.Title>
      <Card>
        <div style={{ marginBottom: 16, flexWrap: 'wrap' }}>{logToolbar}</div>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setSearch(''); setLevelFilter('all'); }}
          items={[
            {
              key: 'panel',
              label: `Panel Log (${panelLines.length})`,
              children: (
                <Table
                  columns={logColumns}
                  dataSource={filtered}
                  rowKey="key"
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} entries` }}
                  scroll={{ x: 600, y: 'calc(100vh - 380px)' }}
                  rowClassName={(r) => r.level === 'error' || r.level === 'fatal' ? 'log-row-error' : ''}
                />
              ),
            },
            {
              key: 'ssh',
              label: `SSH Log (${sshLines.length})`,
              children: isJsonLog ? (
                <Table
                  columns={logColumns}
                  dataSource={filtered}
                  rowKey="key"
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} entries` }}
                  scroll={{ x: 600, y: 'calc(100vh - 380px)' }}
                />
              ) : (
                <Table
                  columns={sshPlainColumns}
                  dataSource={filtered}
                  rowKey="key"
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} entries` }}
                  scroll={{ x: 600, y: 'calc(100vh - 380px)' }}
                />
              ),
            },
            {
              key: 'audit',
              label: `Audit Log (${auditData.length})`,
              children: (
                <Table
                  columns={auditColumns}
                  dataSource={auditData.filter((row) =>
                    !search.trim() || Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
                  )}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  scroll={{ x: 600 }}
                />
              ),
            },
          ]}
        />
      </Card>
      <style>{`
        .log-row-error td { background: #fff1f0 !important; }
        .ant-table-row:hover .log-row-error td { background: #ffccc7 !important; }
      `}</style>
    </div>
  );
}
