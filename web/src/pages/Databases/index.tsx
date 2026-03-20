import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, KeyOutlined, CloudDownloadOutlined, ReloadOutlined, DatabaseOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Database } from '@/types';

const { Title } = Typography;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
};

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export default function Databases() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDb, setSelectedDb] = useState<Database | null>(null);
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/databases');
      setDatabases(resp.data || []);
    } catch {
      message.error('Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await api.post('/databases', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to create database');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/databases/${id}`);
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Failed to delete database');
    }
  };

  const handleBackup = async (id: number) => {
    try {
      await api.post(`/databases/${id}/backup`);
      message.success('Backup started');
    } catch {
      message.error('Backup failed');
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await pwForm.validateFields();
      setSubmitting(true);
      await api.put(`/databases/${selectedDb?.id}/password`, { password: values.password });
      message.success('Password changed');
      setPasswordModalOpen(false);
      pwForm.resetFields();
    } catch {
      message.error('Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: t('databases.db_name'), dataIndex: 'name', key: 'name', render: (name: string) => <><DatabaseOutlined style={{ marginRight: 8 }} />{name}</> },
    { title: t('databases.db_type'), dataIndex: 'db_type', key: 'type', render: (v: string) => <Tag color={v === 'mysql' ? 'blue' : v === 'postgresql' ? 'cyan' : 'default'}>{v?.toUpperCase()}</Tag> },
    { title: t('databases.db_user'), dataIndex: 'username', key: 'username' },
    { title: t('common.size'), key: 'size', render: (_: unknown, r: Database) => formatSize(r.size) },
    { title: t('databases.charset'), dataIndex: 'charset', key: 'charset' },
    { title: t('common.date'), dataIndex: 'created_at', key: 'created_at', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, r: Database) => (
        <Space>
          <Button type="text" size="small" icon={<CloudDownloadOutlined />} title="Backup" onClick={() => handleBackup(r.id)} />
          <Button type="text" size="small" icon={<KeyOutlined />} title="Change Password" onClick={() => { setSelectedDb(r); setPasswordModalOpen(true); }} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{t('databases.title')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ password: generatePassword() }); setModalOpen(true); }}>{t('databases.add_database')}</Button>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={databases} rowKey="id" loading={loading} pagination={{ pageSize: 10, showTotal: total => `${t('common.total')}: ${total}` }} />
      </Card>

      <Modal
        title={t('databases.add_database')}
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('databases.db_name')} rules={[{ required: true, message: 'Database name is required' }]}>
            <Input placeholder="my_database" />
          </Form.Item>
          <Form.Item name="username" label={t('databases.db_user')} rules={[{ required: true, message: 'Username is required' }]}>
            <Input placeholder="db_user" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true }]}>
            <Input.Password
              addonAfter={
                <CopyOutlined onClick={() => {
                  const pw = form.getFieldValue('password');
                  if (pw) { navigator.clipboard.writeText(pw); message.success(t('common.copied')); }
                }} style={{ cursor: 'pointer' }} />
              }
            />
          </Form.Item>
          <Form.Item name="charset" label={t('databases.charset')} initialValue="utf8mb4">
            <Select options={[
              { value: 'utf8mb4', label: 'utf8mb4' }, { value: 'utf8', label: 'utf8' },
              { value: 'latin1', label: 'latin1' }, { value: 'ascii', label: 'ascii' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Change Database Password"
        open={passwordModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPasswordModalOpen(false); pwForm.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.update')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password
              addonAfter={
                <CopyOutlined onClick={() => {
                  const pw = generatePassword();
                  pwForm.setFieldsValue({ password: pw });
                  navigator.clipboard.writeText(pw);
                  message.success(t('common.copied'));
                }} style={{ cursor: 'pointer' }} title="Generate & Copy" />
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
