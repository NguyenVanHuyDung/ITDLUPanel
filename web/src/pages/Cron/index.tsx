import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, Tabs, Space, Tag, Drawer, Typography, message, Popconfirm, Row, Col, Tooltip, InputNumber } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, EditOutlined, FileTextOutlined,
  CheckCircleOutlined, StopOutlined, ThunderboltOutlined, DatabaseOutlined,
  CloudServerOutlined, SafetyCertificateOutlined, ClearOutlined, FolderOutlined,
  PlayCircleOutlined, ClockCircleOutlined, CaretRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

const { Text } = Typography;

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

// Human-readable cron description
function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  const dayNames: Record<string, string> = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday' };
  const monthNames: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };

  const pad = (v: string) => v.padStart(2, '0');
  const timeStr = (h: string, m: string) => `${pad(h)}:${pad(m)}`;

  // Every minute
  if (expr === '* * * * *') return 'Every minute';
  // Every N minutes
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every ${minute.slice(2)} minutes`;
  // Every N hours
  if (minute !== '*' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*')
    return `Every ${hour.slice(2)} hours at :${pad(minute)}`;
  // Every hour at :MM
  if (minute !== '*' && !minute.includes('/') && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return `Every hour at :${pad(minute)}`;
  // Daily at HH:MM
  if (minute !== '*' && hour !== '*' && !minute.includes('/') && !hour.includes('/') && dom === '*' && month === '*' && dow === '*')
    return `Every day at ${timeStr(hour, minute)}`;
  // Weekly on DOW at HH:MM
  if (minute !== '*' && hour !== '*' && dom === '*' && month === '*' && dow !== '*' && !dow.includes('/')) {
    const dayList = dow.split(',').map(d => dayNames[d] || d).join(', ');
    return `Every ${dayList} at ${timeStr(hour, minute)}`;
  }
  // Monthly on DOM at HH:MM
  if (minute !== '*' && hour !== '*' && dom !== '*' && !dom.includes('/') && month === '*' && dow === '*') {
    const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${timeStr(hour, minute)}`;
  }
  // Yearly
  if (minute !== '*' && hour !== '*' && dom !== '*' && month !== '*' && dow === '*') {
    return `Yearly on ${monthNames[month] || month} ${dom} at ${timeStr(hour, minute)}`;
  }
  return expr;
}

// Build cron expression from schedule builder state
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
    case 'minute':
      return s.interval <= 1 ? '* * * * *' : `*/${s.interval} * * * *`;
    case 'hour':
      return `${s.minute} * * * *`;
    case 'day':
      return `${s.minute} ${s.hour} * * *`;
    case 'week':
      return `${s.minute} ${s.hour} * * ${s.dow}`;
    case 'month':
      return `${s.minute} ${s.hour} ${s.dom} * *`;
    default:
      return '* * * * *';
  }
}

const CRON_TEMPLATES: CronTemplate[] = [
  {
    name: 'Backup All Databases',
    description: 'Dump all MySQL/MariaDB databases to /ITDLUPanel/backup/db/',
    schedule: '0 2 * * *',
    command: 'mkdir -p /ITDLUPanel/backup/db && mysqldump --all-databases | gzip > /ITDLUPanel/backup/db/all-db-$(date +\\%Y\\%m\\%d-\\%H\\%M).sql.gz',
    type: 'shell',
    icon: <DatabaseOutlined />,
    color: '#4479A1',
  },
  {
    name: 'Backup Single Database',
    description: 'Dump a specific database (edit DB_NAME after adding)',
    schedule: '0 3 * * *',
    command: 'DB_NAME="mydb"; mkdir -p /ITDLUPanel/backup/db && mysqldump "$DB_NAME" | gzip > /ITDLUPanel/backup/db/${DB_NAME}-$(date +\\%Y\\%m\\%d-\\%H\\%M).sql.gz',
    type: 'shell',
    icon: <DatabaseOutlined />,
    color: '#2E7D32',
  },
  {
    name: 'Backup All Sites',
    description: 'Archive all websites in /ITDLUPanel/wwwroot/ to backup',
    schedule: '0 3 * * 0',
    command: 'mkdir -p /ITDLUPanel/backup/sites && tar czf /ITDLUPanel/backup/sites/all-sites-$(date +\\%Y\\%m\\%d).tar.gz -C /ITDLUPanel/wwwroot .',
    type: 'shell',
    icon: <CloudServerOutlined />,
    color: '#1565C0',
  },
  {
    name: 'Backup Single Site',
    description: 'Archive a specific site (edit SITE after adding)',
    schedule: '0 4 * * *',
    command: 'SITE="example.com"; mkdir -p /ITDLUPanel/backup/sites && tar czf /ITDLUPanel/backup/sites/${SITE}-$(date +\\%Y\\%m\\%d).tar.gz -C /ITDLUPanel/wwwroot "$SITE"',
    type: 'shell',
    icon: <FolderOutlined />,
    color: '#FF9800',
  },
  {
    name: 'Full Backup (DB + Sites)',
    description: 'Complete backup: all databases + all sites + configs',
    schedule: '0 1 * * 0',
    command: 'BDIR="/ITDLUPanel/backup/full/$(date +\\%Y\\%m\\%d)"; mkdir -p "$BDIR" && mysqldump --all-databases | gzip > "$BDIR/databases.sql.gz" && tar czf "$BDIR/sites.tar.gz" -C /ITDLUPanel/wwwroot . && tar czf "$BDIR/configs.tar.gz" -C /ITDLUPanel/server .',
    type: 'shell',
    icon: <SafetyCertificateOutlined />,
    color: '#9C27B0',
  },
  {
    name: 'Cleanup Old Backups (30 days)',
    description: 'Remove backup files older than 30 days',
    schedule: '0 5 * * 0',
    command: 'find /ITDLUPanel/backup -type f -mtime +30 -delete && find /ITDLUPanel/backup -type d -empty -delete',
    type: 'shell',
    icon: <ClearOutlined />,
    color: '#F44336',
  },
  {
    name: 'Renew SSL Certificates',
    description: 'Auto-renew Let\'s Encrypt SSL certificates',
    schedule: '0 6 * * 1',
    command: 'certbot renew --quiet --post-hook "systemctl reload nginx"',
    type: 'shell',
    icon: <SafetyCertificateOutlined />,
    color: '#0288D1',
  },
  {
    name: 'Clear Temp & Cache',
    description: 'Clean system temp files and application caches',
    schedule: '0 4 * * *',
    command: 'rm -rf /tmp/phpmyadmin_extract /tmp/*.zip && apt-get clean -y 2>/dev/null; echo "Cleanup done"',
    type: 'shell',
    icon: <ThunderboltOutlined />,
    color: '#607D8B',
  },
];

export default function Cron() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
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
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSubmit = async (values: Record<string, string>) => {
    // Build schedule from builder or custom
    const schedule = schedMode === 'builder' ? buildCronFromState(schedState) : values.schedule;
    setSubmitting(true);
    try {
      const payload = { ...values, schedule };
      if (editingJob) {
        await api.put(`/crons/${editingJob.id}`, payload);
      } else {
        await api.post('/crons', payload);
      }
      message.success(t('common.success'));
      setModalOpen(false);
      setEditingJob(null);
      form.resetFields();
      fetchJobs();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: CronJob) => {
    try {
      await api.put(`/crons/${record.id}/status`, { enabled: record.status !== 1 });
      message.success(t('common.success'));
      fetchJobs();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/crons/${id}`);
      message.success(t('common.success'));
      fetchJobs();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleRunNow = async (record: CronJob) => {
    setRunningIds(prev => new Set(prev).add(record.id));
    try {
      await api.post(`/crons/${record.id}/run`);
      message.success(`"${record.name}" executed successfully`);
      fetchJobs();
    } catch {
      message.error(`Failed to run "${record.name}"`);
    } finally {
      setRunningIds(prev => { const s = new Set(prev); s.delete(record.id); return s; });
    }
  };

  const handleViewLog = async (id: number) => {
    setLogOpen(true);
    setLogLoading(true);
    setLogContent('');
    try {
      const { data } = await api.get<ApiResponse<string>>(`/crons/${id}/log`);
      setLogContent(data.data ?? 'No logs available');
    } catch {
      setLogContent('Failed to load logs');
    } finally {
      setLogLoading(false);
    }
  };

  const openEdit = (record: CronJob) => {
    setEditingJob(record);
    form.setFieldsValue(record);
    // Try to detect if it's a common pattern for builder mode
    setSchedMode('custom');
    form.setFieldsValue({ schedule: record.schedule });
    setModalOpen(true);
  };

  const openCreate = (template?: CronTemplate) => {
    setEditingJob(null);
    form.resetFields();
    setSchedMode('builder');
    setSchedState({ mode: 'builder', preset: '', custom: '', freq: 'day', minute: 0, hour: 2, dom: 1, dow: 0, interval: 5 });
    if (template) {
      form.setFieldsValue({
        name: template.name,
        command: template.command,
        type: template.type,
      });
      // Set schedule in custom mode for templates
      setSchedMode('custom');
      form.setFieldsValue({ schedule: template.schedule });
    }
    setModalOpen(true);
  };

  const dayOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a: CronJob, b: CronJob) => a.name.localeCompare(b.name),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (val: string) => {
        const human = cronToHuman(val);
        const isHumanized = human !== val;
        return (
          <Tooltip title={`Cron: ${val}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 14 }} />
              <span style={{ fontWeight: 500 }}>{human}</span>
              {isHumanized && (
                <code style={{ fontSize: 11, color: '#999', background: '#f5f5f5', padding: '1px 6px', borderRadius: 3 }}>{val}</code>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Command',
      dataIndex: 'command',
      key: 'command',
      ellipsis: true,
      width: 200,
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      render: (val: string) => <Tag color={val === 'shell' ? 'blue' : 'purple'}>{val}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: number) =>
        status === 1
          ? <Tag color="success" icon={<CheckCircleOutlined />}>{t('common.enabled')}</Tag>
          : <Tag color="error" icon={<StopOutlined />}>{t('common.disabled')}</Tag>,
    },
    {
      title: 'Last Run',
      dataIndex: 'last_run',
      key: 'last_run',
      render: (val: string) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 320,
      render: (_: unknown, record: CronJob) => (
        <Space size="small" wrap>
          <Tooltip title="Run now">
            <Button
              size="small"
              type="primary"
              icon={<CaretRightOutlined />}
              loading={runningIds.has(record.id)}
              onClick={() => handleRunNow(record)}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Run
            </Button>
          </Tooltip>
          <Button size="small" type={record.status === 1 ? 'default' : 'primary'} onClick={() => handleToggleStatus(record)}>
            {record.status === 1 ? t('common.disable') : t('common.enable')}
          </Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => handleViewLog(record.id)}>
            Log
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const scheduleBuilder = (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, padding: 16, background: '#fafafa' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Text strong>Run every:</Text>
        <Select
          value={schedState.freq}
          style={{ width: 140 }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text>Every</Text>
          <InputNumber min={1} max={59} value={schedState.interval} onChange={(v) => setSchedState(prev => ({ ...prev, interval: v ?? 5 }))} style={{ width: 80 }} />
          <Text>minutes</Text>
        </div>
      )}

      {schedState.freq === 'hour' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text>At minute</Text>
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 80 }} />
        </div>
      )}

      {schedState.freq === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text>At</Text>
          <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
          <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
        </div>
      )}

      {schedState.freq === 'week' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>On</Text>
            <Select value={schedState.dow} options={dayOptions} style={{ width: 140 }} onChange={(v) => setSchedState(prev => ({ ...prev, dow: v }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>At</Text>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}

      {schedState.freq === 'month' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>On day</Text>
            <InputNumber min={1} max={31} value={schedState.dom} onChange={(v) => setSchedState(prev => ({ ...prev, dom: v ?? 1 }))} style={{ width: 80 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>At</Text>
            <InputNumber min={0} max={23} value={schedState.hour} onChange={(v) => setSchedState(prev => ({ ...prev, hour: v ?? 0 }))} style={{ width: 70 }} addonAfter="h" />
            <InputNumber min={0} max={59} value={schedState.minute} onChange={(v) => setSchedState(prev => ({ ...prev, minute: v ?? 0 }))} style={{ width: 70 }} addonAfter="m" />
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, padding: '8px 12px', background: '#e6f4ff', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClockCircleOutlined style={{ color: '#1677ff' }} />
        <Text style={{ color: '#1677ff' }}>{cronToHuman(buildCronFromState(schedState))}</Text>
        <code style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>{buildCronFromState(schedState)}</code>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('sidebar.cron')}</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchJobs}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            Add Cron Job
          </Button>
        </Space>
      </div>

      <Tabs items={[
        {
          key: 'jobs',
          label: `My Jobs (${jobs.length})`,
          children: (
            <Card>
              <Table
                columns={columns}
                dataSource={jobs}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showSizeChanger: true }}
              />
            </Card>
          ),
        },
        {
          key: 'templates',
          label: <span><ThunderboltOutlined /> Templates</span>,
          children: (
            <Row gutter={[16, 16]}>
              {CRON_TEMPLATES.map((tpl) => (
                <Col xs={24} sm={12} lg={8} key={tpl.name}>
                  <Card
                    hoverable
                    styles={{ body: { padding: 20 } }}
                    onClick={() => openCreate(tpl)}
                  >
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 18, flexShrink: 0,
                      }}>
                        {tpl.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong>{tpl.name}</Text>
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{tpl.description}</Text></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Tooltip title={`Cron: ${tpl.schedule}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                          <span style={{ fontSize: 12, color: '#555' }}>{cronToHuman(tpl.schedule)}</span>
                        </div>
                      </Tooltip>
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); openCreate(tpl); }}>
                        Use
                      </Button>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        },
      ]} />

      <Modal
        title={editingJob ? 'Edit Cron Job' : 'Add Cron Job'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingJob(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ type: 'shell' }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input placeholder="Backup database" />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')} rules={[{ required: true }]}>
            <Select options={[{ label: 'Shell Command', value: 'shell' }, { label: 'URL (wget/curl)', value: 'url' }]} />
          </Form.Item>

          <Form.Item label="Schedule" required>
            <Tabs
              activeKey={schedMode}
              onChange={(k) => setSchedMode(k as 'builder' | 'custom')}
              size="small"
              items={[
                {
                  key: 'builder',
                  label: <span><ClockCircleOutlined /> Visual</span>,
                  children: scheduleBuilder,
                },
                {
                  key: 'custom',
                  label: <span><EditOutlined /> Cron Expression</span>,
                  children: (
                    <div>
                      <Form.Item name="schedule" noStyle rules={schedMode === 'custom' ? [{ required: true, message: 'Enter cron expression' }] : []}>
                        <Input
                          placeholder="* * * * *"
                          style={{ fontFamily: 'monospace' }}
                        />
                      </Form.Item>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#999', marginTop: 8, lineHeight: 1.6 }}>
                        minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-7)
                      </div>
                    </div>
                  ),
                },
              ]}
            />
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

      <Drawer
        title="Cron Job Log"
        open={logOpen}
        onClose={() => setLogOpen(false)}
        width={640}
      >
        <Tabs
          items={[
            {
              key: 'log',
              label: 'Output',
              children: (
                <pre style={{
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 16,
                  borderRadius: 8,
                  maxHeight: '70vh',
                  overflow: 'auto',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {logLoading ? t('common.loading') : logContent}
                </pre>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}
