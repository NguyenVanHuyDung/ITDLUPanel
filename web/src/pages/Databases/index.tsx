import { useState, useEffect, useCallback } from 'react';
import { Table, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Spin } from 'antd';
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
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

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

function DatabasesContent() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
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
        <span style={{ fontWeight: 500, color: p.text }}>
          <DatabaseOutlined style={{ marginRight: 6, color: p.accent }} />{name}
        </span>
      ),
    },
    {
      title: t('databases.db_user'),
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 12, padding: '1px 7px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
          }}>{username}</span>
          <Tooltip title="Copy">
            <CopyOutlined style={{ cursor: 'pointer', color: p.textMuted, fontSize: 11 }} onClick={() => copyToClipboard(username, 'Username')} />
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Password',
      key: 'password',
      render: (_: unknown, r: Database) => {
        const visible = visiblePasswords.has(r.id);
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span style={{
              
              fontSize: 12,
              color: visible ? p.text : p.textMuted,
              letterSpacing: visible ? 0 : 2,
              minWidth: isMobile ? 50 : 80,
              display: 'inline-block',
            }}>
              {visible ? (r.password || '—') : '••••••••'}
            </span>
            <Tooltip title={visible ? 'Hide' : 'Show'}>
              <button
                onClick={() => togglePasswordVisibility(r.id)}
                style={{
                  padding: '2px 4px', border: 'none', background: 'transparent',
                  cursor: 'pointer', color: p.textMuted, fontSize: 12, display: 'inline-flex', alignItems: 'center',
                }}
              >
                {visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </button>
            </Tooltip>
            {r.password && (
              <Tooltip title="Copy">
                <CopyOutlined
                  style={{ cursor: 'pointer', color: p.textMuted, fontSize: 11 }}
                  onClick={() => copyToClipboard(r.password!, 'Password')}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: t('common.size'),
      key: 'size',
      width: 80,
      render: (_: unknown, r: Database) => (
        <span style={{ fontSize: 12, color: p.textMuted }}>{formatSize(r.size)}</span>
      ),
    },
    {
      title: 'Backup',
      key: 'backup',
      width: 100,
      render: (_: unknown, r: Database) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => handleBackup(r.id)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            Backup
          </button>
          <button onClick={() => { message.info('Import feature coming soon'); }} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            Import
          </button>
        </div>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      width: 90,
      render: (_: unknown, r: Database) => (
        <span style={{ fontSize: 12, color: p.textMuted }}>
          <GlobalOutlined style={{ marginRight: 4, fontSize: 11 }} />
          {r.remote_access || 'localhost'}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: isMobile ? 120 : 240,
      render: (_: unknown, r: Database) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {pmaInstalled && (
            <button onClick={openPma} style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {isMobile ? 'PMA' : 'phpMyAdmin'}
            </button>
          )}
          <button onClick={() => { setSelectedDb(r); setPasswordModalOpen(true); }} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            {isMobile ? 'Pwd' : 'Password'}
          </button>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(r.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <button style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
            }}>
              Delete
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Databases</span>
            <span style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 4,
              background: `${p.accent}15`, color: p.accent, fontWeight: 500,
            }}>
              {databases.length} databases
            </span>
            {dbVersion && (
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 4,
                background: `${p.green}15`, color: p.green, fontWeight: 500,
              }}>
                {dbVersion}
              </span>
            )}
          </div>
          <button
            onClick={() => { form.setFieldsValue({ password: generatePassword() }); setModalOpen(true); }}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s',
            }}
          >
            <PlusOutlined /> {!isMobile && t('databases.add_database')}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          padding: '8px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', gap: 4,
        }}>
          <button style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: `${p.accent}15`, color: p.accent,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <DatabaseOutlined /> MySQL
          </button>
          <button disabled style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'not-allowed',
            fontSize: 12, fontWeight: 500, opacity: 0.45,
            background: 'transparent', color: p.textMuted,
          }}>
            PostgreSQL
          </button>
          <button disabled style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'not-allowed',
            fontSize: 12, fontWeight: 500, opacity: 0.45,
            background: 'transparent', color: p.textMuted,
          }}>
            Redis
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '10px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
        }}>
          <button onClick={() => message.info('Root password management coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <SafetyCertificateOutlined /> {!isMobile && 'Root password'}
          </button>
          {pmaInstalled ? (
            <button onClick={openPma} style={{
              padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
              <LinkOutlined /> {!isMobile && 'phpMyAdmin'}
            </button>
          ) : (
            <Tooltip title="Install phpMyAdmin from App Store">
              <button disabled style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.5,
              }}>
                <LinkOutlined /> {!isMobile && 'phpMyAdmin'}
              </button>
            </Tooltip>
          )}
          <button onClick={() => message.info('Backup all coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <CloudDownloadOutlined /> {!isMobile && 'Backup All'}
          </button>
          <button onClick={() => message.info('Import coming soon')} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            <ImportOutlined /> {!isMobile && 'Import'}
          </button>

          <div style={{ flex: 1 }} />

          <Input
            placeholder="Database search"
            prefix={<SearchOutlined style={{ color: p.textMuted }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: isMobile ? 140 : 200 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <button onClick={fetchData} style={{
              padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s',
            }}>
              <ReloadOutlined />
            </button>
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
            scroll={{ x: 800 }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ color: p.textMuted, fontSize: 13 }}>Total {total}</span>,
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
            <DatabaseOutlined style={{ color: p.accent }} />
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
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Tooltip title="Generate new password">
                    <ReloadOutlined onClick={() => form.setFieldsValue({ password: generatePassword() })} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                  <Tooltip title="Copy password">
                    <CopyOutlined onClick={() => {
                      const pw = form.getFieldValue('password');
                      if (pw) { navigator.clipboard.writeText(pw); message.success(t('common.copied')); }
                    }} style={{ cursor: 'pointer' }} />
                  </Tooltip>
                </span>
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
            <KeyOutlined style={{ color: p.accent }} />
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
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label={t('auth.new_password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password
              addonAfter={
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
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
                </span>
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
