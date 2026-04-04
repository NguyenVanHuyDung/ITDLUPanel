import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, InputNumber, message, Popconfirm, Tooltip, Spin, Switch } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
  CloudServerOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

interface FTPStorageConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  remote_path: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function FTPStorage() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [storages, setStorages] = useState<FTPStorageConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  void isDark;

  const fetchStorages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ftp-storages');
      setStorages(data.data ?? []);
    } catch {
      message.error('Failed to load FTP storages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStorages(); }, [fetchStorages]);

  const openCreateModal = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ port: 21, remote_path: '/', is_default: false, is_active: true });
    setModalOpen(true);
  };

  const openEditModal = async (id: number) => {
    try {
      const { data } = await api.get(`/ftp-storages/${id}`);
      const s = data.data;
      setEditingId(id);
      form.setFieldsValue({
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        password: '',
        remote_path: s.remote_path,
        is_default: s.is_default,
        is_active: s.is_active,
      });
      setModalOpen(true);
    } catch {
      message.error('Failed to load storage details');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingId) {
        await api.put(`/ftp-storages/${editingId}`, values);
        message.success('FTP storage updated');
      } else {
        await api.post('/ftp-storages', values);
        message.success('FTP storage created');
      }
      setModalOpen(false);
      fetchStorages();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (detail) message.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/ftp-storages/${id}`);
      message.success('FTP storage deleted');
      fetchStorages();
    } catch {
      message.error('Failed to delete');
    }
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    setTestResult(null);
    try {
      await api.post(`/ftp-storages/${id}/test`);
      setTestResult({ id, ok: true, msg: 'Connection successful' });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setTestResult({ id, ok: false, msg: detail || 'Connection failed' });
    } finally {
      setTestingId(null);
    }
  };

  const handleTestForm = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.post('/ftp-storages/test', {
        host: values.host,
        port: values.port || 21,
        username: values.username,
        password: values.password,
        remote_path: values.remote_path || '/',
      });
      message.success('Connection successful!');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Connection failed');
    } finally {
      setSaving(false);
    }
  };

  const sectionBox: React.CSSProperties = {
    background: p.card,
    border: `1px solid ${p.cardBorder}`,
    borderRadius: 10,
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${p.cardBorder}`,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '12px' : '24px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: p.text, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CloudServerOutlined style={{ color: p.accent }} />
            FTP Storage
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: p.textMuted }}>
            Manage remote FTP servers for backup storage
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchStorages} style={{
            padding: '7px 14px', borderRadius: 7, border: `1px solid ${p.cardBorder}`,
            background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ReloadOutlined /> Refresh
          </button>
          <button onClick={openCreateModal} style={{
            padding: '7px 16px', borderRadius: 7, border: 'none',
            background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <PlusOutlined /> Add Storage
          </button>
        </div>
      </div>

      {/* Storage list */}
      <div style={sectionBox}>
        <div style={headerStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>
            Remote Storages ({storages.length})
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : storages.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: p.textMuted }}>
            <CloudServerOutlined style={{ fontSize: 40, opacity: 0.3, display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>No FTP storages configured</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Add a remote FTP server to store backups off-site</div>
          </div>
        ) : (
          <div>
            {storages.map((s) => (
              <div key={s.id} style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${p.cardBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: isMobile ? 'wrap' : 'nowrap',
              }}>
                {/* Left: info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{s.name}</span>
                    {s.is_default && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: `${p.accent}18`, color: p.accent, textTransform: 'uppercase',
                      }}>Default</span>
                    )}
                    {!s.is_active && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: `${p.amber}18`, color: p.amber, textTransform: 'uppercase',
                      }}>Inactive</span>
                    )}
                    {testResult?.id === s.id && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: testResult.ok ? `${p.green}15` : `${p.red}15`,
                        color: testResult.ok ? p.green : p.red,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        {testResult.ok ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                        {testResult.msg}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: p.textMuted, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span><strong>Host:</strong> {s.host}:{s.port}</span>
                    <span><strong>User:</strong> {s.username}</span>
                    <span><strong>Path:</strong> {s.remote_path}</span>
                    <span>{formatDateTime(s.created_at, 'DD/MM/YYYY')}</span>
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Tooltip title="Test Connection">
                    <button onClick={() => handleTest(s.id)} disabled={testingId === s.id} style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: p.green, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      opacity: testingId === s.id ? 0.6 : 1,
                    }}>
                      {testingId === s.id ? <Spin size="small" /> : <LinkOutlined />}
                    </button>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <button onClick={() => openEditModal(s.id)} style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: p.accent, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                    }}>
                      <EditOutlined />
                    </button>
                  </Tooltip>
                  <Popconfirm title="Delete this storage?" description="Existing backups stored on this server will not be deleted." onConfirm={() => handleDelete(s.id)} okText="Delete" okButtonProps={{ danger: true }}>
                    <Tooltip title="Delete">
                      <button style={{
                        padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                        background: p.card, color: p.red, fontSize: 12, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center',
                      }}>
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={480}
        title={null}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${p.cardBorder}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudServerOutlined style={{ color: p.accent }} />
            {editingId ? 'Edit FTP Storage' : 'Add FTP Storage'}
          </div>
          <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
            Configure remote FTP server for backup storage
          </div>
        </div>

        <div style={{ padding: '16px 24px 20px' }}>
          <Form form={form} layout="vertical" requiredMark={false}
            style={{ '--ant-color-text': p.text, '--ant-color-text-secondary': p.textMuted } as React.CSSProperties}
          >
            <Form.Item name="name" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Storage Name</span>} rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. Backup Server HCM" />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
              <Form.Item name="host" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>FTP Host</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="ftp.example.com or IP" />
              </Form.Item>
              <Form.Item name="port" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Port</span>}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="username" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Username</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="FTP username" />
              </Form.Item>
              <Form.Item name="password" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Password</span>} rules={editingId ? [] : [{ required: true, message: 'Required' }]}>
                <Input.Password placeholder={editingId ? 'Leave blank to keep current' : 'FTP password'} />
              </Form.Item>
            </div>

            <Form.Item name="remote_path" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Remote Path</span>}>
              <Input placeholder="/" prefix={<FolderOpenOutlined style={{ color: p.textMuted }} />} />
            </Form.Item>

            <div style={{ display: 'flex', gap: 24 }}>
              <Form.Item name="is_default" valuePropName="checked" style={{ marginBottom: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
                  <Switch size="small" /> Set as default
                </span>
              </Form.Item>
              {editingId && (
                <Form.Item name="is_active" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
                    <Switch size="small" /> Active
                  </span>
                </Form.Item>
              )}
            </div>
          </Form>
        </div>

        <div style={{
          padding: '12px 24px 16px',
          borderTop: `1px solid ${p.cardBorder}`,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <button onClick={handleTestForm} disabled={saving} style={{
            padding: '7px 14px', borderRadius: 7, border: `1px solid ${p.cardBorder}`,
            background: p.card, color: p.green, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <LinkOutlined /> Test Connection
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setModalOpen(false)} style={{
              padding: '7px 14px', borderRadius: 7, border: `1px solid ${p.cardBorder}`,
              background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '7px 16px', borderRadius: 7, border: 'none',
              background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {saving ? <Spin size="small" /> : null}
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
