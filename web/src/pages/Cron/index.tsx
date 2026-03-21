import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, Tabs, Space, Tag, Drawer, Typography, message, Popconfirm, Row, Col } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, EditOutlined, FileTextOutlined,
  CheckCircleOutlined, StopOutlined, ThunderboltOutlined, DatabaseOutlined,
  CloudServerOutlined, SafetyCertificateOutlined, ClearOutlined, FolderOutlined,
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
  const [form] = Form.useForm();

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
    setSubmitting(true);
    try {
      if (editingJob) {
        await api.put(`/crons/${editingJob.id}`, values);
      } else {
        await api.post('/crons', values);
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
      await api.put(`/crons/${record.id}`, { ...record, status: record.status === 1 ? 0 : 1 });
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
    setModalOpen(true);
  };

  const openCreate = (template?: CronTemplate) => {
    setEditingJob(null);
    form.resetFields();
    if (template) {
      form.setFieldsValue({
        name: template.name,
        schedule: template.schedule,
        command: template.command,
        type: template.type,
      });
    }
    setModalOpen(true);
  };

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
      render: (val: string) => <code style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>{val}</code>,
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
      width: 280,
      render: (_: unknown, record: CronJob) => (
        <Space size="small" wrap>
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

  const cronHelperText = (
    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', lineHeight: '1.8' }}>
      ┌──────────── minute (0–59)<br />
      │ ┌────────── hour (0–23)<br />
      │ │ ┌──────── day of month (1–31)<br />
      │ │ │ ┌────── month (1–12)<br />
      │ │ │ │ ┌──── day of week (0–7, Sun=0 or 7)<br />
      * &nbsp;* &nbsp;* &nbsp;* &nbsp;*
    </div>
  );

  const presets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every Sunday', value: '0 0 * * 0' },
    { label: 'Every month', value: '0 0 1 * *' },
  ];

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
                      <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>{tpl.schedule}</code>
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
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ type: 'shell' }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input placeholder="Backup database" />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')} rules={[{ required: true }]}>
            <Select options={[{ label: 'Shell Command', value: 'shell' }, { label: 'URL (wget/curl)', value: 'url' }]} />
          </Form.Item>
          <Form.Item name="schedule" label="Schedule" rules={[{ required: true }]} extra={cronHelperText}>
            <Select
              mode="tags"
              maxCount={1}
              placeholder="Select a preset or type custom schedule"
              options={presets}
              onChange={(vals: string[]) => form.setFieldsValue({ schedule: vals[vals.length - 1] ?? '' })}
              // Allow user to type custom cron expression
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
