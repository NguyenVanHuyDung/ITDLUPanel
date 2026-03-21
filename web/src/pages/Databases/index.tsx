import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Typography, Popconfirm, Tooltip, Badge, Spin } from 'antd';
import {
  PlusOutlined, DeleteOutlined, KeyOutlined, CloudDownloadOutlined,
  ReloadOutlined, DatabaseOutlined, CopyOutlined, LinkOutlined,
  EyeOutlined, EyeInvisibleOutlined, SearchOutlined, ImportOutlined,
  SafetyCertificateOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Database } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Constants & palette (unified blue theme)
// ---------------------------------------------------------------------------
const PRIMARY = '#1565C0';
const PRIMARY_DARK = '#0D47A1';
const PRIMARY_LIGHT = '#E3F2FD';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
};

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  borderBottom: `1px solid ${BORDER}`,
  padding: '0 20px',
  background: '#FAFBFC',
};

const activeTabStyle: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  color: PRIMARY,
  borderBottom: `2px solid ${PRIMARY}`,
  cursor: 'pointer',
  background: 'transparent',
  marginBottom: -1,
};

const inactiveTabStyle: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 500,
  color: TEXT_SECONDARY,
  cursor: 'not-allowed',
  opacity: 0.5,
  background: 'transparent',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '12px 20px',
  borderBottom: `1px solid ${BORDER}`,
};

const actionLinkStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '0 4px',
  height: 'auto',
  color: PRIMARY,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function DatabasesContent() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDb, setSelectedDb] = useState<Database | null>(null);
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [pmaInstalled, setPmaInstalled] = useState<boolean | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [dbVersion, setDbVersion] = useState('');

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label} copied`);
  };

  const checkPma = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software');
      const sw = resp.data || {};
      const available = sw.available || [];
      const pma = available.find((s: { name: string; installed: boolean }) => s.name === 'phpmyadmin');
      setPmaInstalled(pma?.installed ?? false);
      const mysql = available.find((s: { name: string; installed: boolean; version?: string }) =>
        (s.name === 'mysql' || s.name === 'mariadb') && s.installed
      );
      if (mysql) setDbVersion(`${mysql.name === 'mariadb' ? 'MariaDB' : 'MySQL'} ${(mysql as { version?: string }).version || ''}`);
    } catch {
      setPmaInstalled(false);
    }
  }, []);

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

  useEffect(() => { fetchData(); checkPma(); }, [fetchData, checkPma]);

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
      fetchData();
    } catch {
      message.error('Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  const openPma = () => {
    const host = window.location.hostname;
    window.open(`http://${host}/phpmyadmin/`, '_blank');
  };

  const filteredDatabases = searchText
    ? databases.filter(d =>
        d.name.toLowerCase().includes(searchText.toLowerCase()) ||
        d.username.toLowerCase().includes(searchText.toLowerCase())
      )
    : databases;

  const columns = [
    {
      title: t('databases.db_name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span style={{ fontWeight: 500, color: TEXT_PRIMARY }}>
          <DatabaseOutlined style={{ marginRight: 6, color: PRIMARY }} />{name}
        </span>
      ),
    },
    {
      title: t('databases.db_user'),
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <Space size={4}>
          <Text code style={{ fontSize: 12, background: PRIMARY_LIGHT, color: PRIMARY_DARK, border: 'none' }}>{username}</Text>
          <Tooltip title="Copy">
            <CopyOutlined style={{ cursor: 'pointer', color: TEXT_SECONDARY, fontSize: 11 }} onClick={() => copyToClipboard(username, 'Username')} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Password',
      key: 'password',
      width: 200,
      render: (_: unknown, r: Database) => {
        const visible = visiblePasswords.has(r.id);
        return (
          <Space size={2}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: visible ? TEXT_PRIMARY : TEXT_SECONDARY,
              letterSpacing: visible ? 0 : 2,
              minWidth: 80,
              display: 'inline-block',
            }}>
              {visible ? (r.password || '—') : '••••••••'}
            </span>
            <Tooltip title={visible ? 'Hide' : 'Show'}>
              <Button
                type="text" size="small"
                icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                style={{ color: TEXT_SECONDARY, fontSize: 12 }}
                onClick={() => togglePasswordVisibility(r.id)}
              />
            </Tooltip>
            {r.password && (
              <Tooltip title="Copy">
                <CopyOutlined
                  style={{ cursor: 'pointer', color: TEXT_SECONDARY, fontSize: 11 }}
                  onClick={() => copyToClipboard(r.password!, 'Password')}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.size'),
      key: 'size',
      width: 100,
      render: (_: unknown, r: Database) => (
        <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{formatSize(r.size)}</span>
      ),
    },
    {
      title: 'Backup',
      key: 'backup',
      width: 120,
      render: (_: unknown, r: Database) => (
        <Space size={4}>
          <Button type="link" size="small" style={{ fontSize: 12, padding: 0, color: PRIMARY }}
            onClick={() => handleBackup(r.id)}
          >
            Backup
          </Button>
          <span style={{ color: BORDER }}>|</span>
          <Button type="link" size="small" style={{ fontSize: 12, padding: 0, color: PRIMARY }}
            onClick={() => { message.info('Import feature coming soon'); }}
          >
            Import
          </Button>
        </Space>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      width: 100,
      render: (_: unknown, r: Database) => (
        <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>
          <GlobalOutlined style={{ marginRight: 4, fontSize: 11 }} />
          {r.remote_access || 'localhost'}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 240,
      render: (_: unknown, r: Database) => (
        <Space size={0} split={<span style={{ color: '#E0E0E0', margin: '0 2px' }}>|</span>}>
          {pmaInstalled && (
            <Button type="link" size="small" style={actionLinkStyle} onClick={openPma}>
              phpMyAdmin
            </Button>
          )}
          <Button type="link" size="small" style={actionLinkStyle}
            onClick={() => { setSelectedDb(r); setPasswordModalOpen(true); }}
          >
            Password
          </Button>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(r.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" style={{ ...actionLinkStyle, color: '#F44336' }}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={cardStyle}>
        {/* Tab bar */}
        <div style={tabBarStyle}>
          <div style={activeTabStyle}>
            <DatabaseOutlined style={{ marginRight: 6 }} /> MySQL
          </div>
          <div style={inactiveTabStyle}>PostgreSQL</div>
          <div style={inactiveTabStyle}>Redis</div>
          <div style={{ flex: 1 }} />
          {dbVersion && (
            <Badge
              count={dbVersion}
              style={{
                background: PRIMARY_LIGHT,
                color: PRIMARY,
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                padding: '0 8px',
                boxShadow: 'none',
              }}
            />
          )}
        </div>

        {/* Toolbar */}
        <div style={toolbarStyle}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { form.setFieldsValue({ password: generatePassword() }); setModalOpen(true); }}
            style={{ background: PRIMARY, borderColor: PRIMARY, fontWeight: 500 }}
          >
            {t('databases.add_database')}
          </Button>
          <Button icon={<SafetyCertificateOutlined />} onClick={() => message.info('Root password management coming soon')}>
            Root password
          </Button>
          {pmaInstalled ? (
            <Button icon={<LinkOutlined />} onClick={openPma}>
              phpMyAdmin
            </Button>
          ) : (
            <Tooltip title="Install phpMyAdmin from App Store">
              <Button icon={<LinkOutlined />} disabled>phpMyAdmin</Button>
            </Tooltip>
          )}
          <Button icon={<CloudDownloadOutlined />} onClick={() => message.info('Backup all coming soon')}>
            Backup All
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => message.info('Import coming soon')}>
            Import
          </Button>

          <div style={{ flex: 1 }} />

          <Input
            placeholder="Database search"
            prefix={<SearchOutlined style={{ color: TEXT_SECONDARY }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: 200 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={fetchData} />
          </Tooltip>
        </div>

        {/* Table */}
        <div style={{ padding: 0 }}>
          <Table
            columns={columns}
            dataSource={filteredDatabases}
            rowKey="id"
            loading={{ spinning: loading, indicator: <Spin /> }}
            size="middle"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ color: TEXT_SECONDARY, fontSize: 13 }}>Total {total}</span>,
              style: { padding: '8px 16px', margin: 0 },
            }}
            style={{ fontSize: 13 }}
            rowClassName={() => 'db-table-row'}
          />
        </div>
      </div>

      {/* Add Database Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseOutlined style={{ color: PRIMARY }} />
            {t('databases.add_database')}
          </span>
        }
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={520}
        okButtonProps={{ style: { background: PRIMARY, borderColor: PRIMARY } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="db_type" label={t('databases.db_type') || 'Database Type'} initialValue="mysql" rules={[{ required: true }]}>
            <Select options={[
              { value: 'mysql', label: 'MySQL' },
              { value: 'mariadb', label: 'MariaDB' },
            ]} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('databases.db_name')}
            rules={[
              { required: true, message: 'Database name is required' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
              { max: 64, message: 'Maximum 64 characters' },
            ]}
          >
            <Input placeholder="my_database" />
          </Form.Item>
          <Form.Item
            name="username"
            label={t('databases.db_user')}
            rules={[
              { required: true, message: 'Username is required' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
              { max: 32, message: 'Maximum 32 characters' },
            ]}
          >
            <Input placeholder="db_user" />
          </Form.Item>
          <Form.Item name="password" label={t('auth.password')} rules={[{ required: true }, { min: 6, message: 'Minimum 6 characters' }]}>
            <Input.Password
              addonAfter={
                <Space size={8}>
                  <Tooltip title="Generate new password">
                    <ReloadOutlined onClick={() => form.setFieldsValue({ password: generatePassword() })} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title="Copy password">
                    <CopyOutlined onClick={() => {
                      const pw = form.getFieldValue('password');
                      if (pw) { navigator.clipboard.writeText(pw); message.success(t('common.copied')); }
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                </Space>
              }
            />
          </Form.Item>
          <Form.Item name="charset" label={t('databases.charset')} initialValue="utf8mb4">
            <Select options={[
              { value: 'utf8mb4', label: 'utf8mb4 (Recommended)' },
              { value: 'utf8', label: 'utf8' },
              { value: 'latin1', label: 'latin1' },
              { value: 'ascii', label: 'ascii' },
            ]} />
          </Form.Item>
          <Form.Item name="remote_access" label="Access Permission" initialValue="localhost">
            <Select options={[
              { value: 'localhost', label: 'Localhost — Local access only' },
              { value: '%', label: 'All — Allow remote connections' },
              { value: 'ip', label: 'Specific IP' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: PRIMARY }} />
            Change Password — {selectedDb?.name}
          </span>
        }
        open={passwordModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPasswordModalOpen(false); pwForm.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.update')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        okButtonProps={{ style: { background: PRIMARY, borderColor: PRIMARY } }}
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password
              addonAfter={
                <Space size={8}>
                  <Tooltip title="Generate & copy">
                    <ReloadOutlined onClick={() => {
                      const pw = generatePassword();
                      pwForm.setFieldsValue({ password: pw });
                      navigator.clipboard.writeText(pw);
                      message.success('Generated & copied');
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title="Copy">
                    <CopyOutlined onClick={() => {
                      const pw = pwForm.getFieldValue('password');
                      if (pw) { navigator.clipboard.writeText(pw); message.success(t('common.copied')); }
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                </Space>
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function Databases() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['database']} label={t('databases.title') || 'Database Server (MySQL/MariaDB)'}>
      <DatabasesContent />
    </RequireSoftware>
  );
}
