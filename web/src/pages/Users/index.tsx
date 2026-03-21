import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm, Badge } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, ReloadOutlined, UserOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/services/api';
import type { User } from '@/types';

const { Title } = Typography;

const roleColors: Record<string, string> = { admin: 'red', operator: 'blue', viewer: 'green' };

export default function Users() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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

  const columns = [
    { title: t('auth.username'), dataIndex: 'username', key: 'username', render: (v: string) => <><UserOutlined style={{ marginRight: 8 }} />{v}</> },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '—' },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (role: string) => <Tag color={roleColors[role] || 'default'}>{role?.toUpperCase()}</Tag>,
    },
    {
      title: t('common.status'), key: 'status',
      render: (_: unknown, r: User) => r.status === 1
        ? <Badge status="success" text={t('common.active')} />
        : <Badge status="error" text={t('common.inactive')} />,
    },
    {
      title: 'Last Login', dataIndex: 'last_login', key: 'last_login',
      render: (v: string) => v ? new Date(v).toLocaleString() : 'Never',
    },
    {
      title: t('common.actions'), key: 'actions',
      render: (_: unknown, r: User) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setSelectedUser(r); editForm.setFieldsValue({ username: r.username, email: r.email, role: r.role }); setEditModalOpen(true); }} />
          <Button type="text" size="small" icon={<KeyOutlined />} title="Reset Password" onClick={() => { setSelectedUser(r); setPasswordModalOpen(true); }} />
          <Button type="text" size="small" icon={r.status === 1 ? <LockOutlined /> : <UnlockOutlined />} title={r.status === 1 ? t('common.disable') : t('common.enable')} onClick={() => handleToggleStatus(r)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>{t('sidebar.users')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add User</Button>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} pagination={{ pageSize: 10, showTotal: total => `${t('common.total')}: ${total}` }} scroll={{ x: 500 }} />
      </Card>

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
