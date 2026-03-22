import { useState, useEffect, useCallback } from 'react';
import { Table, Modal, Form, Input, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette, mono } from '@/hooks/usePalette';
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
  const { p, isDark } = usePalette();
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
      render: (v: string) => <span style={{ fontFamily: mono, fontSize: 12 }}>{v}</span>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => {
        const color = status === 1 ? p.green : p.red;
        const label = status === 1 ? t('common.enabled') : t('common.disabled');
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', borderRadius: 99,
            background: `${color}15`, color, fontSize: 11, fontWeight: 500,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {label}
          </span>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => val
        ? <span style={{ fontFamily: mono, fontSize: 12, color: p.textMuted }}>{new Date(val).toLocaleString()}</span>
        : <span style={{ color: p.textDim }}>-</span>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: FTPAccount) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setSelectedAccount(record); setPasswordOpen(true); }}
            style={{
              padding: '3px 8px', borderRadius: 6,
              border: `1px solid ${p.cardBorder}`, background: 'transparent',
              color: p.textMuted, fontSize: 11, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <LockOutlined /> Password
          </button>
          <button
            onClick={() => handleToggleStatus(record)}
            style={{
              padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 500, transition: 'opacity 0.15s',
              background: record.status === 1 ? `${p.amber}15` : `${p.green}15`,
              color: record.status === 1 ? p.amber : p.green,
            }}
          >
            {record.status === 1 ? t('common.disable') : t('common.enable')}
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <button style={{
              padding: '3px 8px', borderRadius: 6,
              border: `1px solid ${p.red}`, background: 'transparent',
              color: p.red, fontSize: 11, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <DeleteOutlined />
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>FTP Accounts</span>
          <span style={{
            fontSize: 11, fontFamily: mono, padding: '2px 9px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>{accounts.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={fetchAccounts}
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
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'opacity 0.15s',
            }}
          >
            <PlusOutlined /> Add FTP Account
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>

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
