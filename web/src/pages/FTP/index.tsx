import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, LockOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import RequireSoftware from '@/components/RequireSoftware';

interface FTPAccount {
  id: number;
  username: string;
  path: string;
  status: number;
  created_at: string;
}

function FTPContent() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<FTPAccount[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FTPAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<FTPAccount[]>>('/ftp');
      setAccounts(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleCreate = async (values: Record<string, string>) => {
    setSubmitting(true);
    try {
      await api.post('/ftp', values);
      message.success(t('common.success'));
      setCreateOpen(false);
      createForm.resetFields();
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (values: Record<string, string>) => {
    if (!selectedAccount) return;
    setSubmitting(true);
    try {
      await api.put(`/ftp/${selectedAccount.id}/password`, values);
      message.success(t('common.success'));
      setPasswordOpen(false);
      passwordForm.resetFields();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: FTPAccount) => {
    try {
      await api.put(`/ftp/${record.id}/status`, { enabled: record.status !== 1 });
      message.success(t('common.success'));
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/ftp/${id}`);
      message.success(t('common.success'));
      fetchAccounts();
    } catch {
      message.error(t('common.error'));
    }
  };

  const columns = [
    {
      title: t('auth.username'),
      dataIndex: 'username',
      key: 'username',
      sorter: (a: FTPAccount, b: FTPAccount) => a.username.localeCompare(b.username),
    },
    {
      title: 'Home Directory',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
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
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: FTPAccount) => (
        <Space size="small">
          <Button
            size="small"
            icon={<LockOutlined />}
            onClick={() => { setSelectedAccount(record); setPasswordOpen(true); }}
          >
            Password
          </Button>
          <Button
            size="small"
            type={record.status === 1 ? 'default' : 'primary'}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 1 ? t('common.disable') : t('common.enable')}
          </Button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.ftp')}</Typography.Title>
      <Card
        title={`FTP Accounts (${accounts.length})`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchAccounts}>{t('common.refresh')}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Add FTP Account
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title="Add FTP Account"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="username" label={t('auth.username')} rules={[{ required: true }]}>
            <Input placeholder="ftpuser" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="path"
            label="Home Directory"
            rules={[{ required: true }]}
            extra="Absolute path, e.g. /home/ftpuser or /var/www/html"
          >
            <Input placeholder="/home/ftpuser" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Change Password — ${selectedAccount?.username ?? ''}`}
        open={passwordOpen}
        onCancel={() => { setPasswordOpen(false); passwordForm.resetFields(); }}
        onOk={() => passwordForm.submit()}
        confirmLoading={submitting}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function FTP() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['ftp']} label={t('sidebar.ftp') || 'FTP Server (Pure-FTPd)'}>
      <FTPContent />
    </RequireSoftware>
  );
}
