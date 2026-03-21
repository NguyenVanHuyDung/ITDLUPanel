import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, Tabs, Space, Tag, Switch, Typography, message, Popconfirm, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, SafetyOutlined, LockOutlined, SecurityScanOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface FirewallRule {
  id: number;
  port: string;
  protocol: string;
  ip: string;
  action: string;
  direction: string;
  status: number;
}

interface SSHConfig {
  port: number;
  permit_root_login: boolean;
  password_auth: boolean;
  max_auth_tries: number;
}

interface Fail2banConfig {
  enabled: boolean;
  max_retry: number;
  ban_time: number;
  find_time: number;
}

// Firewall Tab
function FirewallTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<FirewallRule[]>>('/firewall/rules');
      setRules(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleCreate = async (values: Record<string, string>) => {
    setSubmitting(true);
    try {
      await api.post('/firewall/rules', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchRules();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/firewall/rules/${id}`);
      message.success(t('common.success'));
      fetchRules();
    } catch {
      message.error(t('common.error'));
    }
  };

  const columns = [
    { title: 'Port', dataIndex: 'port', key: 'port' },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (val: string) => <Tag>{(val ?? '').toUpperCase()}</Tag>,
    },
    { title: 'IP', dataIndex: 'ip', key: 'ip', render: (val: string) => val || 'Any' },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (val: string) =>
        val === 'allow'
          ? <Tag color="success">ALLOW</Tag>
          : <Tag color="error">DENY</Tag>,
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      render: (val: string) => <Tag color="blue">{(val ?? '').toUpperCase()}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: number) =>
        status === 1
          ? <Tag color="success">{t('common.active')}</Tag>
          : <Tag color="default">{t('common.inactive')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: FirewallRule) => (
        <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>{t('common.delete')}</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchRules}>{t('common.refresh')}</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          Add Rule
        </Button>
      </div>
      <Table columns={columns} dataSource={rules} rowKey="id" loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true }} scroll={{ x: 600 }} />

      <Modal
        title="Add Firewall Rule"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ protocol: 'tcp', action: 'allow', direction: 'in' }}>
          <Form.Item name="port" label="Port" rules={[{ required: true }]}
            extra="Single port (80), range (8000-9000), or comma-separated (80,443)">
            <Input placeholder="80" />
          </Form.Item>
          <Form.Item name="protocol" label="Protocol" rules={[{ required: true }]}>
            <Select options={[{ label: 'TCP', value: 'tcp' }, { label: 'UDP', value: 'udp' }, { label: 'TCP/UDP', value: 'tcp/udp' }]} />
          </Form.Item>
          <Form.Item name="ip" label="IP Address (optional)" extra="Leave empty to apply to all IPs">
            <Input placeholder="0.0.0.0/0" />
          </Form.Item>
          <Form.Item name="action" label="Action" rules={[{ required: true }]}>
            <Select options={[{ label: 'Allow', value: 'allow' }, { label: 'Deny', value: 'deny' }]} />
          </Form.Item>
          <Form.Item name="direction" label="Direction" rules={[{ required: true }]}>
            <Select options={[{ label: 'Inbound', value: 'in' }, { label: 'Outbound', value: 'out' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// SSH Tab
function SSHTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSHConfig>>('/security/ssh');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: SSHConfig) => {
    setSaving(true);
    try {
      await api.put('/security/ssh', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <Card style={{ maxWidth: 600, width: '100%' }}>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ port: 22, permit_root_login: false, password_auth: true, max_auth_tries: 6 }}>
        <Form.Item name="port" label="SSH Port" rules={[{ required: true }]}
          extra="Default: 22. Changing this requires a service restart.">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="permit_root_login" label="Permit Root Login" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="password_auth" label="Password Authentication" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_auth_tries" label="Max Auth Tries" rules={[{ required: true }]}>
          <InputNumber min={1} max={20} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

// Fail2ban Tab
function Fail2banTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<Fail2banConfig>>('/security/fail2ban');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: Fail2banConfig) => {
    setSaving(true);
    try {
      await api.put('/security/fail2ban', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <Card style={{ maxWidth: 600, width: '100%' }}>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ enabled: false, max_retry: 5, ban_time: 600, find_time: 600 }}>
        <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_retry" label="Max Retry" rules={[{ required: true }]}
          extra="Number of failures before a host gets banned">
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="ban_time" label="Ban Time (seconds)" rules={[{ required: true }]}
          extra="Duration to ban an IP. Default: 600 (10 min)">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="find_time" label="Find Time (seconds)" rules={[{ required: true }]}
          extra="Window in which max_retry failures must occur">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('common.save')}</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

// Main Security Page
export default function Security() {
  const { t } = useTranslation();

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.security')}</Typography.Title>
      <Card>
        <Tabs items={[
          {
            key: 'firewall',
            label: <span><SafetyOutlined /> Firewall</span>,
            children: <FirewallTab />,
          },
          {
            key: 'ssh',
            label: <span><LockOutlined /> SSH</span>,
            children: <SSHTab />,
          },
          {
            key: 'fail2ban',
            label: <span><SecurityScanOutlined /> Fail2ban</span>,
            children: <Fail2banTab />,
          },
        ]} />
      </Card>
    </div>
  );
}
