import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tooltip, InputNumber, Spin } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, EditOutlined, FileTextOutlined,
  ThunderboltOutlined, DatabaseOutlined, SearchOutlined,
  CloudServerOutlined, SafetyCertificateOutlined, ClearOutlined, FolderOutlined,
  ClockCircleOutlined, CheckCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

interface CronJob {
  id: number;
  name: string;
  schedule: string;
  command: string;
  type: string;
  status: number;
  last_run?: string;
  created_at: string;
}

interface CronTemplate {
  name: string;
  description: string;
  schedule: string;
  command: string;
  type: string;
  icon: React.ReactNode;
  color: string;
}

function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;
  const dayNames: Record<string, string> = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday' };
  const monthNames: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };
  const pad = (v: string) => v.padStart(2, '0');
  const timeStr = (h: string, m: string) => `${pad(h)}:${pad(m)}`;
  if (expr === '* * * * *') return 'Every minute';
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every ${minute.slice(2)} minutes`;
  if (minute !== '*' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*')
    return `Every ${hour.slice(2)} hours at :${pad(minute)}`;
  if (minute !== '*' && !minute.includes('/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every hour at :${pad(minute)}`;
  if (minute !== '*' && hour !== '*' && !minute.includes('/') && !hour.includes('/') && dom === '*' && month === '*' && dow === '*')
    return `Every day at ${timeStr(hour, minute)}`;
  if (minute !== '*' && hour !== '*' && dom === '*' && month === '*' && dow !== '*' && !dow.includes('/')) {
    const dayList = dow.split(',').map(d => dayNames[d] || d).join(', ');
    return `Every ${dayList} at ${timeStr(hour, minute)}`;
  }
  if (minute !== '*' && hour !== '*' && dom !== '*' && !dom.includes('/') && month === '*' && dow === '*') {
    const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${timeStr(hour, minute)}`;
  }
  if (minute !== '*' && hour !== '*' && dom !== '*' && month !== '*' && dow === '*')
    return `Yearly on ${monthNames[month] || month} ${dom} at ${timeStr(hour, minute)}`;
  return expr;
}

interface ScheduleState {
  mode: 'preset' | 'custom' | 'builder';
  preset: string;
  custom: string;
  freq: 'minute' | 'hour' | 'day' | 'week' | 'month';
  minute: number;
  hour: number;
  dom: number;
  dow: number;
  interval: number;
}

function buildCronFromState(s: ScheduleState): string {
  switch (s.freq) {
    case 'minute': return s.interval <= 1 ? '* * * * *' : `*/${s.interval} * * * *`;
    case 'hour':   return `${s.minute} * * * *`;
    case 'day':    return `${s.minute} ${s.hour} * * *`;
    case 'week':   return `${s.minute} ${s.hour} * * ${s.dow}`;
    case 'month':  return `${s.minute} ${s.hour} ${s.dom} * *`;
    default:       return '* * * * *';
  }
}

function parseCronToState(expr: string): ScheduleState | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, , dow] = parts;
  const base: ScheduleState = { mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 0, dom: 1, dow: 0, interval: 5 };

  // Every minute or */N minutes
  if (minute === '*' && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'minute', interval: 1 };
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'minute', interval: parseInt(minute.slice(2)) || 5 };
  // Every hour at :MM
  if (!minute.includes('*') && !minute.includes('/') && hour === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'hour', minute: parseInt(minute) || 0 };
  // Weekly
  if (!minute.includes('*') && !hour.includes('*') && dom === '*' && dow !== '*' && !dow.includes('/'))
    return { ...base, freq: 'week', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0, dow: parseInt(dow) || 0 };
  // Monthly
  if (!minute.includes('*') && !hour.includes('*') && dom !== '*' && !dom.includes('/') && dow === '*')
    return { ...base, freq: 'month', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0, dom: parseInt(dom) || 1 };
  // Daily (catch-all for H:M * * *)
  if (!minute.includes('*') && !hour.includes('*') && dom === '*' && dow === '*')
    return { ...base, freq: 'day', minute: parseInt(minute) || 0, hour: parseInt(hour) || 0 };

  return null;
}

const CRON_TEMPLATES: CronTemplate[] = [
  {
    name: 'Backup All Databases',
    description: 'Dump all MySQL/MariaDB databases to /ITDLUPanel/backup/db/',
    schedule: '0 2 * * *',
    command: 'mkdir -p /ITDLUPanel/backup/db && mysqldump --all-databases | gzip > /ITDLUPanel/backup/db/all-db-$(date +\\%Y\\%m\\%d-\\%H\\%M).sql.gz',
    type: 'shell', icon: <DatabaseOutlined />, color: '#4479A1',
  },
  {
    name: 'Backup Single Database',
    description: 'Dump a specific database (edit DB_NAME after adding)',
    schedule: '0 3 * * *',
    command: 'DB_NAME="mydb"; mkdir -p /ITDLUPanel/backup/db && mysqldump "$DB_NAME" | gzip > /ITDLUPanel/backup/db/${DB_NAME}-$(date +\\%Y\\%m\\%d-\\%H\\%M).sql.gz',
    type: 'shell', icon: <DatabaseOutlined />, color: '#2E7D32',
  },
  {
    name: 'Backup All Sites',
    description: 'Archive all websites in /ITDLUPanel/wwwroot/ to backup',
    schedule: '0 3 * * 0',
    command: 'mkdir -p /ITDLUPanel/backup/sites && tar czf /ITDLUPanel/backup/sites/all-sites-$(date +\\%Y\\%m\\%d).tar.gz -C /ITDLUPanel/wwwroot .',
    type: 'shell', icon: <CloudServerOutlined />, color: '#1565C0',
  },
  {
    name: 'Backup Single Site',
    description: 'Archive a specific site (edit SITE after adding)',
    schedule: '0 4 * * *',
    command: 'SITE="example.com"; mkdir -p /ITDLUPanel/backup/sites && tar czf /ITDLUPanel/backup/sites/${SITE}-$(date +\\%Y\\%m\\%d).tar.gz -C /ITDLUPanel/wwwroot "$SITE"',
    type: 'shell', icon: <FolderOutlined />, color: '#FF9800',
  },
  {
    name: 'Full Backup (DB + Sites)',
    description: 'Complete backup: all databases + all sites + configs',
    schedule: '0 1 * * 0',
    command: 'BDIR="/ITDLUPanel/backup/full/$(date +\\%Y\\%m\\%d)"; mkdir -p "$BDIR" && mysqldump --all-databases | gzip > "$BDIR/databases.sql.gz" && tar czf "$BDIR/sites.tar.gz" -C /ITDLUPanel/wwwroot . && tar czf "$BDIR/configs.tar.gz" -C /ITDLUPanel/server .',
    type: 'shell', icon: <SafetyCertificateOutlined />, color: '#9C27B0',
  },
  {
    name: 'Cleanup Old Backups (30 days)',
    description: 'Remove backup files older than 30 days',
    schedule: '0 5 * * 0',
    command: 'find /ITDLUPanel/backup -type f -mtime +30 -delete && find /ITDLUPanel/backup -type d -empty -delete',
    type: 'shell', icon: <ClearOutlined />, color: '#F44336',
  },
  {
    name: 'Renew SSL Certificates',
    description: 'Auto-renew Let\'s Encrypt SSL certificates',
    schedule: '0 6 * * 1',
    command: 'certbot renew --quiet --post-hook "systemctl reload nginx"',
    type: 'shell', icon: <SafetyCertificateOutlined />, color: '#0288D1',
  },
  {
    name: 'Clear Temp & Cache',
    description: 'Clean system temp files and application caches',
    schedule: '0 4 * * *',
    command: 'rm -rf /tmp/phpmyadmin_extract /tmp/*.zip && apt-get clean -y 2>/dev/null; echo "Cleanup done"',
    type: 'shell', icon: <ThunderboltOutlined />, color: '#607D8B',
  },
];

export default function Cron() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { p, isDark } = usePalette();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logJobName, setLogJobName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'jobs' | 'templates'>('jobs');
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [schedMode, setSchedMode] = useState<'builder' | 'custom'>('builder');
  const [schedState, setSchedState] = useState<ScheduleState>({
    mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 2, dom: 1, dow: 0, interval: 5,
  });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<CronJob[]>>('/crons');
      setJobs(data.data ?? []);
    } catch { message.error(t('common.error')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filteredJobs = useMemo(() => {
    if (!searchText) return jobs;
    const q = searchText.toLowerCase();
    return jobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      j.command.toLowerCase().includes(q) ||
      j.schedule.includes(q)
    );
  }, [jobs, searchText]);

  // ── CRUD handlers ──────────────────────────────────────────────────

  const handleSubmit = async (values: Record<string, string>) => {
    const schedule = schedMode === 'builder' ? buildCronFromState(schedState) : values.schedule;
    setSubmitting(true);
    try {
      const payload = { ...values, schedule };
      if (editingJob) await api.put(`/crons/${editingJob.id}`, payload);
      else await api.post('/crons', payload);
      message.success(t('common.success'));
      setModalOpen(false);
      setEditingJob(null);
      form.resetFields();
      fetchJobs();
    } catch { message.error(t('common.error')); }
    finally { setSubmitting(false); }
  };

  const handleToggleStatus = async (record: CronJob) => {
    try {
      await api.put(`/crons/${record.id}/status`, { enabled: record.status !== 1 });
      message.success(t('common.success'));
      fetchJobs();
    } catch { message.error(t('common.error')); }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/crons/${id}`);
      message.success(t('common.success'));
      fetchJobs();
    } catch { message.error(t('common.error')); }
  };

  const handleRunNow = async (record: CronJob) => {
    setRunningIds(prev => new Set(prev).add(record.id));
    try {
      await api.post(`/crons/${record.id}/run`);
      message.success(`"${record.name}" executed`);
      fetchJobs();
    } catch { message.error(`Failed to run "${record.name}"`); }
    finally { setRunningIds(prev => { const s = new Set(prev); s.delete(record.id); return s; }); }
  };

  const handleViewLog = async (id: number, name: string) => {
    setLogJobName(name);
    setLogOpen(true);
    setLogLoading(true);
    setLogContent('');
    try {
      const { data } = await api.get<ApiResponse<{ content: string }>>(`/crons/${id}/log`);
      const content = typeof data.data === 'string' ? data.data : data.data?.content;
      setLogContent(content || 'No logs available');
    } catch { setLogContent('Failed to load logs'); }
    finally { setLogLoading(false); }
  };

  // ── Bulk actions ───────────────────────────────────────────────────

  const handleBulkDelete = () => {
    if (!selectedRowKeys.length) return;
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} cron job(s)?`,
      content: 'This action cannot be undone.',
      okButtonProps: { danger: true },
      onOk: async () => {
        let ok = 0;
        for (const id of selectedRowKeys) {
          try { await api.delete(`/crons/${id}`); ok++; } catch { /* skip */ }
        }
        message.success(`Deleted ${ok} job(s)`);
        setSelectedRowKeys([]);
        fetchJobs();
      },
    });
  };

  const handleBulkToggle = async (enable: boolean) => {
    let ok = 0;
    for (const id of selectedRowKeys) {
      try { await api.put(`/crons/${id}/status`, { enabled: enable }); ok++; } catch { /* skip */ }
    }
    message.success(`${enable ? 'Enabled' : 'Disabled'} ${ok} job(s)`);
    setSelectedRowKeys([]);
    fetchJobs();
  };

  // ── Modal helpers ──────────────────────────────────────────────────

  const openEdit = (record: CronJob) => {
    setEditingJob(record);
    form.setFieldsValue(record);
    const parsed = parseCronToState(record.schedule);
    if (parsed) {
      setSchedMode('builder');
      setSchedState(parsed);
    } else {
      setSchedMode('custom');
      form.setFieldsValue({ schedule: record.schedule });
    }
    setModalOpen(true);
  };

  const openCreate = (template?: CronTemplate) => {
    setEditingJob(null);
    form.resetFields();
    setSchedMode('builder');
    setSchedState({ mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 2, dom: 1, dow: 0, interval: 5 });
    if (template) {
      form.setFieldsValue({ name: template.name, command: template.command, type: template.type });
      const parsed = parseCronToState(template.schedule);
      if (parsed) {
        setSchedMode('builder');
        setSchedState(parsed);
      } else {
        setSchedMode('custom');
        form.setFieldsValue({ schedule: template.schedule });
      }
    }
    setModalOpen(true);
  };

  // ── Reusable styles ────────────────────────────────────────────────

  const ghostBtn = (color?: string): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
    border: `1px solid ${color ? `${color}50` : p.cardBorder}`,
    background: color ? `${color}08` : 'transparent',
    color: color || p.textMuted, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'all 0.15s',
  });

  const dayOptions = [
    { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 }, { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  // ── Table columns ──────────────────────────────────────────────────

  const columns = [
    {
      title: t('common.name'),
      key: 'name',
      render: (_: unknown, r: CronJob) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined style={{ color: p.accent, fontSize: 13 }} />
            <span style={{ fontWeight: 500, color: p.text, fontSize: 13 }}>{r.name}</span>
          </div>
          <div style={{ fontSize: 11, color: p.textMuted, marginLeft: 19 }}>
            {cronToHuman(r.schedule)}
            <code style={{
              marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: p.codeBg, color: p.textMuted,
            }}>{r.schedule}</code>
          </div>
        </div>
      ),
      sorter: (a: CronJob, b: CronJob) => a.name.localeCompare(b.name),
    },
    {
      title: 'Status',
      key: 'status',
      width: 70,
      render: (_: unknown, r: CronJob) => (
        <Tooltip title={r.status === 1 ? 'Click to disable' : 'Click to enable'}>
          <button
            onClick={() => handleToggleStatus(r)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: 4,
              background: r.status === 1 ? p.green : p.red,
              boxShadow: r.status === 1 ? `0 0 6px ${p.green}60` : 'none',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: r.status === 1 ? p.green : p.red,
            }}>
              {r.status === 1 ? 'On' : 'Off'}
            </span>
          </button>
        </Tooltip>
      ),
    },
    {
      title: 'Command',
      key: 'command',
      ellipsis: true,
      width: isMobile ? 120 : 220,
      render: (_: unknown, r: CronJob) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            background: r.type === 'shell' ? `${p.accent}15` : `${p.purple}15`,
            color: r.type === 'shell' ? p.accent : p.purple,
            flexShrink: 0,
          }}>{r.type}</span>
          <Tooltip title={r.command}>
            <span style={{ fontSize: 12, color: p.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.command}
            </span>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Last Run',
      key: 'last_run',
      width: 150,
      render: (_: unknown, r: CronJob) => r.last_run
        ? <span style={{ fontSize: 12, color: p.text }}>{new Date(r.last_run).toLocaleString()}</span>
        : <span style={{ fontSize: 12, color: p.textMuted }}>—</span>,
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: CronJob) => (
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          <Tooltip title="Run now">
            <button
              onClick={() => handleRunNow(record)}
              disabled={runningIds.has(record.id)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                opacity: runningIds.has(record.id) ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
            >▶ Run</button>
          </Tooltip>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <button onClick={() => handleViewLog(record.id, record.name)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: p.textMuted, fontSize: 12, padding: '3px 6px',
          }}>Log</button>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <button onClick={() => openEdit(record)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: p.textMuted, fontSize: 12, padding: '3px 6px',
          }}>Edit</button>
          <span style={{ color: p.cardBorder, margin: '0 2px', fontSize: 12 }}>|</span>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: p.red, fontSize: 12, padding: '3px 6px',
            }}>Del</button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // ── Schedule builder ───────────────────────────────────────────────

  const scheduleBuilder = (
    <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 8, padding: 16, background: isDark ? p.rowAlt : p.headerBg }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: p.text, fontSize: 13 }}>Run every:</span>
        <Select
          value={schedState.freq}
          style={{ width: isMobile ? 100 : 140 }}
          onChange={(v) => setSchedState(prev => ({ ...prev, freq: v }))}
          options={[
            { label: 'N minutes', value: 'minute' },
            { label: 'Hour', value: 'hour' },
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
          ]}
        />
      </div>

      {schedState.freq === 'minute' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>Every</span>
          <InputNumber min={1} max={59} value={schedState.interval} onChange={(v) => setSchedState(prev => ({ ...prev, interval: v ?? 5 }))} style={{ width: 80 }} />
          <span style={{ color: p.text }}>minutes</span>
        </div>
      )}
      {schedState.freq === 'hour' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>At minute</span>
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 80 }} />
        </div>
      )}
      {schedState.freq === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: p.text }}>At</span>
          <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
        </div>
      )}
      {schedState.freq === 'week' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: p.text }}>On</span>
            <Select value={schedState.dow} options={dayOptions} style={{ width: 140 }} onChange={(v) => setSchedState(prev => ({ ...prev, dow: v }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: p.text }}>At</span>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}
      {schedState.freq === 'month' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: p.text }}>On day</span>
            <InputNumber min={1} max={31} value={schedState.dom} onChange={(v) => setSchedState(prev => ({ ...prev, dom: v ?? 1 }))} style={{ width: 80 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: p.text }}>At</span>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}

      <div style={{
        marginTop: 12, padding: '8px 12px', borderRadius: 6,
        background: `${p.accent}10`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <ClockCircleOutlined style={{ color: p.accent }} />
        <span style={{ color: p.accent, fontWeight: 500 }}>{cronToHuman(buildCronFromState(schedState))}</span>
        <code style={{ marginLeft: 'auto', fontSize: 12, color: p.textMuted }}>{buildCronFromState(schedState)}</code>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.cron')}</span>
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>{jobs.length}</span>
        </div>
        <button
          onClick={() => openCreate()}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, background: p.accent, color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <PlusOutlined /> Add Job
        </button>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {([
          { key: 'jobs' as const, label: `My Jobs (${jobs.length})`, icon: <ClockCircleOutlined style={{ marginRight: 5 }} /> },
          { key: 'templates' as const, label: 'Templates', icon: <ThunderboltOutlined style={{ marginRight: 5 }} /> },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              display: 'inline-flex', alignItems: 'center',
              transition: 'all 0.15s',
            }}
          >{tab.icon}{tab.label}</button>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 8, padding: '12px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          background: selectedRowKeys.length > 0 ? (isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)') : undefined,
          transition: 'background 0.2s',
        }}>
          {selectedRowKeys.length > 0 ? (
            <>
              <span style={{
                fontSize: 12, fontWeight: 600, color: p.accent,
                padding: '3px 10px', borderRadius: 5, background: `${p.accent}15`,
              }}>
                {selectedRowKeys.length} selected
              </span>
              <button onClick={() => setSelectedRowKeys([])} style={ghostBtn()}>
                Deselect
              </button>
              <div style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 4px' }} />
              <button onClick={handleBulkDelete} style={ghostBtn(p.red)}>
                <DeleteOutlined /> Delete
              </button>
              <button onClick={() => handleBulkToggle(true)} style={ghostBtn(p.green)}>
                <CheckCircleOutlined /> Enable
              </button>
              <button onClick={() => handleBulkToggle(false)} style={ghostBtn(p.amber)}>
                <StopOutlined /> Disable
              </button>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <Input
                placeholder="Search name or command"
                prefix={<SearchOutlined style={{ color: p.textDim }} />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ width: 220 }}
                size="middle"
              />
              <Tooltip title="Refresh">
                <button
                  onClick={fetchJobs}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    border: `1px solid ${p.cardBorder}`,
                    background: 'transparent', color: p.textMuted,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <ReloadOutlined />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div>
          <Table
            columns={isMobile ? columns.filter(c => !['last_run', 'command'].includes(c.key)) : columns}
            dataSource={filteredJobs}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            loading={{ spinning: loading, indicator: <Spin /> }}
            size="middle"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ fontSize: 12, color: p.textMuted }}>{total} jobs</span>,
            }}
            scroll={{ x: 600 }}
            style={{
              // Consistent with Websites table styling
            }}
          />
        </div>
      )}

      {activeTab === 'templates' && (
        <div style={{ padding: 20 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {CRON_TEMPLATES.map((tpl) => (
              <div
                key={tpl.name}
                onClick={() => openCreate(tpl)}
                style={{
                  padding: 18, borderRadius: 10,
                  border: `1px solid ${p.cardBorder}`,
                  background: isDark ? p.rowAlt : p.headerBg,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = `${p.accent}60`;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 8px ${p.accent}15`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = p.cardBorder;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 17, flexShrink: 0,
                  }}>
                    {tpl.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: p.text, fontSize: 13, lineHeight: 1.3 }}>{tpl.name}</div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2, lineHeight: 1.4 }}>{tpl.description}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Tooltip title={`Cron: ${tpl.schedule}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ClockCircleOutlined style={{ color: p.accent, fontSize: 11 }} />
                      <span style={{ fontSize: 11, color: p.textMuted }}>{cronToHuman(tpl.schedule)}</span>
                    </div>
                  </Tooltip>
                  <button onClick={(e) => { e.stopPropagation(); openCreate(tpl); }} style={{
                    padding: '3px 10px', borderRadius: 6,
                    border: 'none', cursor: 'pointer',
                    background: p.accent, color: '#fff',
                    fontSize: 11, fontWeight: 600, transition: 'opacity 0.15s',
                  }}>+ Use</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────── */}
      <Modal
        title={editingJob ? 'Edit Cron Job' : 'Add Cron Job'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingJob(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        width={isMobile ? '95%' : 600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ type: 'shell' }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input placeholder="Backup database" />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')} rules={[{ required: true }]}>
            <Select options={[{ label: 'Shell Command', value: 'shell' }, { label: 'URL (wget/curl)', value: 'url' }]} />
          </Form.Item>

          <Form.Item label="Schedule" required>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {([
                { key: 'builder' as const, label: '🕐 Visual Builder' },
                { key: 'custom' as const, label: '✏️ Cron Expression' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSchedMode(tab.key)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    background: schedMode === tab.key ? `${p.accent}15` : 'transparent',
                    color: schedMode === tab.key ? p.accent : p.textMuted,
                    transition: 'all 0.15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
            {schedMode === 'builder' && scheduleBuilder}
            {schedMode === 'custom' && (
              <div>
                <Form.Item name="schedule" noStyle rules={schedMode === 'custom' ? [{ required: true, message: 'Enter cron expression' }] : []}>
                  <Input placeholder="* * * * *" />
                </Form.Item>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                  minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-7)
                </div>
              </div>
            )}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev: Record<string, string>, cur: Record<string, string>) => prev.type !== cur.type}
          >
            {({ getFieldValue }: { getFieldValue: (name: string) => string }) =>
              getFieldValue('type') === 'url' ? (
                <Form.Item name="command" label="URL" rules={[{ required: true, type: 'url' }]}>
                  <Input placeholder="https://example.com/cron-endpoint" />
                </Form.Item>
              ) : (
                <Form.Item name="command" label="Command" rules={[{ required: true }]}>
                  <Input.TextArea rows={3} placeholder="/usr/bin/php /var/www/artisan schedule:run" />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Log Modal ──────────────────────────────────────────────── */}
      <Modal
        title={`Log — ${logJobName}`}
        open={logOpen}
        onCancel={() => setLogOpen(false)}
        footer={null}
        width={isMobile ? '95%' : 700}
      >
        <pre style={{
          background: isDark ? '#0D1117' : '#1e1e1e',
          color: isDark ? '#E2E8F0' : '#d4d4d4',
          padding: 16, borderRadius: 8,
          maxHeight: '60vh', overflow: 'auto',
          fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: `1px solid ${p.cardBorder}`,
          margin: 0,
        }}>
          {logLoading ? t('common.loading') : logContent}
        </pre>
      </Modal>
    </div>
  );
}
