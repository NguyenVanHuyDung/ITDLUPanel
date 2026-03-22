import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Input, Select, Popconfirm, Tooltip, message } from 'antd';
import { ReloadOutlined, SearchOutlined, ClearOutlined, InfoCircleOutlined, WarningOutlined, BugOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

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

const LEVEL_COLOR: Record<string, { color: string; icon: React.ReactNode }> = {
  debug: { color: '#8b949e', icon: <BugOutlined /> },
  info:  { color: '#58a6ff', icon: <InfoCircleOutlined /> },
  warn:  { color: '#d29922', icon: <WarningOutlined /> },
  error: { color: '#f85149', icon: <CloseCircleOutlined /> },
  fatal: { color: '#f85149', icon: <CloseCircleOutlined /> },
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

function StatusBadge({ status, p }: { status?: number; p: { green: string; amber: string; red: string; accent: string } }) {
  if (status == null) return null;
  const color = status >= 500 ? p.red : status >= 400 ? p.amber : status >= 300 ? p.accent : p.green;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4,
      background: `${color}15`, color, fontSize: 11, fontWeight: 500,
    }}>{status}</span>
  );
}

export default function Logs() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
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
      render: (v: string) => <span style={{ fontSize: 12, color: p.textMuted }}>{formatTime(v)}</span>,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (v: string) => {
        const cfg = LEVEL_COLOR[v] || LEVEL_COLOR.info;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: `${cfg.color}15`, color: cfg.color,
            fontSize: 11, fontWeight: 500,
          }}>
            {cfg.icon} {v.toUpperCase()}
          </span>
        );
      },
    },
    {
      title: 'Message',
      key: 'message',
      ellipsis: true,
      render: (_: unknown, r: ParsedLog) => (
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{r.message}</span>
          {r.method && r.path && (
            <span style={{ marginLeft: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4,
                background: `${p.accent}15`, color: p.accent, fontSize: 11, fontWeight: 500,
              }}>{r.method}</span>{' '}
              <span style={{ fontSize: 12, color: p.textMuted, background: p.codeBg, padding: '1px 5px', borderRadius: 3 }}>{r.path}</span>
              {r.status != null && <>{' '}<StatusBadge status={r.status} p={p} /></>}
              {r.duration != null && <span style={{ fontSize: 11, color: p.textMuted, marginLeft: 4 }}>{r.duration.toFixed(1)}ms</span>}
            </span>
          )}
          {r.error && <div><span style={{ fontSize: 12, color: p.red }}>{r.error}</span></div>}
          {Object.keys(r.extra).length > 0 && (
            <div style={{ marginTop: 2 }}>
              {Object.entries(r.extra).map(([k, v]) => (
                <Tooltip key={k} title={JSON.stringify(v)}>
                  <span style={{
                    display: 'inline-block', fontSize: 11,
                    margin: '1px 4px 1px 0', padding: '1px 6px', borderRadius: 3,
                    background: p.codeBg, color: p.textMuted,
                  }}>{k}={typeof v === 'string' ? v : JSON.stringify(v)}</span>
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
      render: (v?: string) => v ? <span style={{ fontSize: 12, color: p.textMuted }}>{v}</span> : null,
    },
  ];

  const sshPlainColumns = [
    {
      title: 'Time',
      key: 'time',
      width: isMobile ? 80 : 140,
      render: (_: unknown, record: ParsedLog) => {
        // Try to extract timestamp from common syslog formats: "Mon DD HH:MM:SS" or ISO
        const m = record.raw.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
        return <span style={{ fontSize: 11, color: p.textMuted, whiteSpace: 'nowrap' }}>{m ? m[1] : ''}</span>;
      },
    },
    {
      title: 'Source',
      key: 'source',
      width: isMobile ? 80 : 120,
      render: (_: unknown, record: ParsedLog) => {
        const m = record.raw.match(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(\S+?)[\[:]/);
        const src = m ? m[1] : '';
        return src ? (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 4,
            background: `${p.accent}12`, color: p.accent, fontWeight: 500,
          }}>{src}</span>
        ) : null;
      },
    },
    {
      title: 'Event',
      key: 'event',
      width: isMobile ? 60 : 90,
      render: (_: unknown, record: ParsedLog) => {
        const raw = record.raw.toLowerCase();
        let label = '';
        let color = p.textMuted;
        if (raw.includes('accepted') || raw.includes('opened')) { label = 'Accept'; color = p.green; }
        else if (raw.includes('failed') || raw.includes('invalid') || raw.includes('error')) { label = 'Failed'; color = p.red; }
        else if (raw.includes('disconnect') || raw.includes('closed')) { label = 'Close'; color = p.amber; }
        else if (raw.includes('connection from') || raw.includes('new connection')) { label = 'Connect'; color = p.accent; }
        if (!label) return null;
        return (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            background: `${color}15`, color,
          }}>{label}</span>
        );
      },
    },
    {
      title: 'Message',
      dataIndex: 'raw',
      key: 'raw',
      render: (v: string) => {
        // Strip the syslog prefix to show just the message
        const stripped = v.replace(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+?\[\d+\]:\s*/, '')
                          .replace(/^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+:\s*/, '');
        const text = stripped || v;
        if (!search.trim()) return <span style={{ fontSize: 12, color: p.text, lineHeight: 1.5 }}>{text}</span>;
        const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return (
          <span style={{ fontSize: 12, color: p.text, lineHeight: 1.5 }}>
            {parts.map((part, i) =>
              part.toLowerCase() === search.toLowerCase()
                ? <span key={i} style={{ background: p.amber, color: '#000', borderRadius: 2, padding: '0 2px' }}>{part}</span>
                : part
            )}
          </span>
        );
      },
    },
    {
      title: 'IP',
      key: 'ip_addr',
      width: isMobile ? 90 : 120,
      render: (_: unknown, record: ParsedLog) => {
        const m = record.raw.match(/(?:from|for)\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return m ? <span style={{ fontSize: 11, color: p.textMuted }}>{m[1]}</span> : null;
      },
    },
  ];

  const isJsonLog = currentLines.length > 0 && currentLines[0]?.startsWith('{');

  const auditColumns = [
    {
      title: 'Time', dataIndex: 'created_at', key: 'created_at', width: isMobile ? 100 : 160,
      render: (val: string) => {
        if (!val) return <span style={{ color: p.textDim }}>—</span>;
        const d = new Date(val);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ color: p.text, fontWeight: 500 }}>{d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div style={{ color: p.textMuted, fontSize: 11 }}>{d.toLocaleTimeString('en-GB', { hour12: false })}</div>
          </div>
        );
      },
    },
    {
      title: 'User', dataIndex: 'user', key: 'user', width: isMobile ? 80 : 120,
      render: (val: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: `${p.accent}15`, color: p.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>{(val || '?')[0].toUpperCase()}</div>
          <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{val}</span>
        </div>
      ),
    },
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: isMobile ? 80 : 140,
      render: (val: string) => {
        const lower = (val || '').toLowerCase();
        let color = p.accent;
        if (lower.includes('create') || lower.includes('add') || lower.includes('install')) color = p.green;
        else if (lower.includes('delete') || lower.includes('remove') || lower.includes('uninstall')) color = p.red;
        else if (lower.includes('update') || lower.includes('edit') || lower.includes('change') || lower.includes('reset')) color = p.amber;
        else if (lower.includes('login') || lower.includes('logout') || lower.includes('auth')) color = p.purple;
        else if (lower.includes('start') || lower.includes('stop') || lower.includes('restart')) color = p.cyan;
        return (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 5, fontWeight: 600,
            background: `${color}15`, color,
            display: 'inline-block',
          }}>{val}</span>
        );
      },
    },
    {
      title: 'Resource', dataIndex: 'resource', key: 'resource', ellipsis: true,
      render: (val: string) => (
        <span style={{ fontSize: 12, color: p.text }}>{val || '—'}</span>
      ),
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: isMobile ? 90 : 130,
      render: (v: string) => v ? (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          color: p.textMuted,
        }}>{v}</span>
      ) : <span style={{ color: p.textDim }}>—</span>,
    },
  ];

  const tabCounts: Record<string, number> = {
    panel: panelLines.length,
    ssh: sshLines.length,
    audit: auditData.length,
  };

  const tabs = [
    { key: 'panel', label: 'Panel Log' },
    { key: 'ssh', label: 'SSH Log' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.logs')}</span>
          <Input
            prefix={<SearchOutlined style={{ color: p.textDim }} />}
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
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={refresh}
            style={{
              padding: '5px 14px', borderRadius: 6,
              border: `1px solid ${p.cardBorder}`, background: 'transparent',
              color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <ReloadOutlined /> {t('common.refresh')}
          </button>
          {activeTab !== 'audit' && (
            <Popconfirm title="Clear this log file?" onConfirm={handleClearLog}>
              <button style={{
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${p.red}`, background: 'transparent',
                color: p.red, fontSize: 12, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <ClearOutlined /> Clear
              </button>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); setLevelFilter('all'); }}
            style={{
              padding: '6px 16px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: activeTab === tab.key ? `${p.accent}20` : p.codeBg,
              color: activeTab === tab.key ? p.accent : p.textDim,
            }}>{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'panel' && (
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
        )}
        {activeTab === 'ssh' && (
          isJsonLog ? (
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
              rowClassName={(r) => {
                const raw = r.raw.toLowerCase();
                if (raw.includes('failed') || raw.includes('invalid') || raw.includes('error')) return 'log-row-error';
                return '';
              }}
            />
          )
        )}
        {activeTab === 'audit' && (
          <Table
            columns={auditColumns}
            dataSource={auditData.filter((row) =>
              !search.trim() || Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
            )}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} entries` }}
            scroll={{ x: 600, y: 'calc(100vh - 380px)' }}
          />
        )}
      </div>

      <style>{`
        .log-row-error td { background: ${isDark ? 'rgba(248,81,73,0.06)' : '#fff1f0'} !important; }
        .ant-table-row:hover .log-row-error td { background: ${isDark ? 'rgba(248,81,73,0.1)' : '#ffccc7'} !important; }
      `}</style>
    </div>
  );
}
