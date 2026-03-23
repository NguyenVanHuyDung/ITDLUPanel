import { useState, useEffect, useCallback } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, ReloadOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import api from '@/services/api';
import type { User } from '@/types';

const roleColorKey: Record<string, 'red' | 'accent' | 'green'> = { admin: 'red', operator: 'accent', viewer: 'green' };

export default function Users() {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [pwForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/users');
      setUsers(resp.data || []);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await api.post('/users', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to create user');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      await api.put(`/users/${selectedUser?.id}`, values);
      message.success(t('common.success'));
      setEditModalOpen(false);
      editForm.resetFields();
      fetchData();
    } catch {
      message.error('Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await pwForm.validateFields();
      setSubmitting(true);
      await api.put(`/users/${selectedUser?.id}/password`, { password: values.password });
      message.success('Password reset successfully');
      setPasswordModalOpen(false);
      pwForm.resetFields();
    } catch {
      message.error('Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Failed to delete user');
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.put(`/users/${user.id}/status`, { status: user.status === 1 ? 0 : 1 });
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Failed to update status');
    }
  };

  const btnOutline: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
  };
  const btnAction: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  const btnDanger: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}30`,
    background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };

  const columns = [
    {
      title: t('auth.username'), dataIndex: 'username', key: 'username',
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, background: `${p.accent}20`,
            color: p.accent, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {v?.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 500, color: p.text, fontSize: 13 }}>{v}</span>
        </div>
      ),
    },
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      render: (v: string) => <span style={{ fontSize: 13, color: v ? p.text : p.textDim }}>{v || '—'}</span>,
    },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (role: string) => {
        const c = p[roleColorKey[role] || 'accent'];
        return (
          <span style={{ padding: '2px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: c + '15', color: c }}>
            {role?.toUpperCase()}
          </span>
        );
      },
    },
    {
      title: t('common.status'), key: 'status',
      render: (_: unknown, r: User) => {
        const active = r.status === 1;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: active ? p.green : p.red, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: p.textMuted }}>{active ? t('common.active') : t('common.inactive')}</span>
          </div>
        );
      },
    },
    {
      title: 'Last Login', dataIndex: 'last_login', key: 'last_login',
      render: (v: string) => <span style={{ fontSize: 12, color: p.textMuted }}>{v ? new Date(v).toLocaleString() : 'Never'}</span>,
    },
    {
      title: t('common.actions'), key: 'actions',
      render: (_: unknown, r: User) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnAction} onClick={() => { setSelectedUser(r); editForm.setFieldsValue({ username: r.username, email: r.email, role: r.role }); setEditModalOpen(true); }}>
            <EditOutlined />
          </button>
          <button style={btnAction} title="Reset Password" onClick={() => { setSelectedUser(r); setPasswordModalOpen(true); }}>
            <KeyOutlined />
          </button>
          <button style={btnAction} title={r.status === 1 ? t('common.disable') : t('common.enable')} onClick={() => handleToggleStatus(r)}>
            {r.status === 1 ? <LockOutlined /> : <UnlockOutlined />}
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <button style={btnDanger}><DeleteOutlined /></button>
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
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.users')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnOutline} onClick={fetchData}><ReloadOutlined /></button>
          <button style={btnPrimary} onClick={() => setModalOpen(true)}>
            <PlusOutlined style={{ marginRight: 6 }} />Add User
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: total => `${t('common.total')}: ${total}` }}
          scroll={{ x: 500 }}
        />
      </div>

      {/* Create User Modal */}
      <Modal title="Add User" open={modalOpen} onOk={handleCreate} onCancel={() => { setModalOpen(false); form.resetFields(); }} confirmLoading={submitting} okText={t('common.create')} cancelText={t('common.cancel')} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label={t('auth.username')} rules={[{ required: true, message: 'Username is required' }]}>
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Invalid email' }]}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true, min: 8, message: 'Password must be at least 8 characters' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="viewer" rules={[{ required: true }]}>
            <Select options={[{ value: 'admin', label: 'Admin' }, { value: 'operator', label: 'Operator' }, { value: 'viewer', label: 'Viewer' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal title="Edit User" open={editModalOpen} onOk={handleEdit} onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }} confirmLoading={submitting} okText={t('common.update')} cancelText={t('common.cancel')} destroyOnHidden>
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label={t('auth.username')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={[{ value: 'admin', label: 'Admin' }, { value: 'operator', label: 'Operator' }, { value: 'viewer', label: 'Viewer' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal title="Reset Password" open={passwordModalOpen} onOk={handleResetPassword} onCancel={() => { setPasswordModalOpen(false); pwForm.resetFields(); }} confirmLoading={submitting} okText={t('common.confirm')} cancelText={t('common.cancel')} destroyOnHidden>
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm" label={t('auth.confirm_password')} dependencies={['password']} rules={[
            { required: true },
            ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')); } }),
          ]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
