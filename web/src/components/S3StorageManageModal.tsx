import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, Switch, message, Popconfirm, Tooltip, Spin } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, CloudOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

interface S3StorageConfig {
  id: number;
  name: string;
  type: string;
  config: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface S3ConfigParsed {
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  path_prefix: string;
  use_ssl: boolean;
}

const SECTIONS = [
  { key: 'connections', label: 'Connections', icon: <CloudOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function S3StorageManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [section, setSection] = useState<SectionKey>('connections');

  void isDark;

  const MODAL_BORDER = p.cardBorder;
  const MODAL_PRIMARY = p.accent;
  const MODAL_PRIMARY_LIGHT = `${MODAL_PRIMARY}12`;
  const MODAL_TEXT = p.text;

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? MODAL_PRIMARY : MODAL_TEXT,
    background: active ? MODAL_PRIMARY_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${MODAL_PRIMARY}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${MODAL_PRIMARY}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CloudOutlined style={{ color: '#FF9900' }} />
          <span>S3 Storage Manager</span>
        </div>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        <div style={{
          width: isMobile ? '100%' : 200,
          borderRight: isMobile ? 'none' : `1px solid ${MODAL_BORDER}`,
          borderBottom: isMobile ? `1px solid ${MODAL_BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
        }}>
          {SECTIONS.map((s) => (
            <div key={s.key} onClick={() => setSection(s.key)} style={sidebarStyle(section === s.key)}>
              {s.icon} {s.label}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', maxHeight: isMobile ? '60vh' : '80vh' }}>
          {section === 'connections' && <ConnectionsTab />}
        </div>
      </div>
    </Modal>
  );

  function ConnectionsTab() {
    const [storages, setStorages] = useState<S3StorageConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form] = Form.useForm();
    const [testingId, setTestingId] = useState<number | null>(null);
    const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchStorages = useCallback(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/cloud-storages', { params: { type: 's3' } });
        setStorages(data.data ?? []);
      } catch {
        message.error('Failed to load S3 storages');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => { if (open) fetchStorages(); }, [open, fetchStorages]);

    const parseConfig = (configStr: string): Partial<S3ConfigParsed> => {
      try { return JSON.parse(configStr); } catch { return {}; }
    };

    const openCreateModal = () => {
      setEditingId(null);
      form.resetFields();
      form.setFieldsValue({ use_ssl: true, is_default: false });
      setModalOpen(true);
    };

    const openEditModal = async (id: number) => {
      try {
        const { data } = await api.get(`/cloud-storages/${id}`);
        const s = data.data;
        const cfg = parseConfig(s.config);
        setEditingId(id);
        form.setFieldsValue({
          name: s.name,
          endpoint: cfg.endpoint,
          region: cfg.region,
          bucket: cfg.bucket,
          access_key: cfg.access_key,
          secret_key: '',
          path_prefix: cfg.path_prefix,
          use_ssl: cfg.use_ssl !== false,
          is_default: s.is_default,
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
        const config = JSON.stringify({
          endpoint: values.endpoint || '',
          region: values.region || '',
          bucket: values.bucket,
          access_key: values.access_key,
          secret_key: values.secret_key,
          path_prefix: values.path_prefix || '',
          use_ssl: values.use_ssl !== false,
        });
        const payload = { name: values.name, type: 's3', config, is_default: !!values.is_default };
        if (editingId) {
          await api.put(`/cloud-storages/${editingId}`, payload);
          message.success('S3 storage updated');
        } else {
          await api.post('/cloud-storages', payload);
          message.success('S3 storage created');
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
        await api.delete(`/cloud-storages/${id}`);
        message.success('S3 storage deleted');
        fetchStorages();
      } catch {
        message.error('Failed to delete');
      }
    };

    const handleTest = async (id: number) => {
      setTestingId(id);
      setTestResult(null);
      try {
        await api.post(`/cloud-storages/${id}/test`);
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
        const config = JSON.stringify({
          endpoint: values.endpoint || '',
          region: values.region || '',
          bucket: values.bucket,
          access_key: values.access_key,
          secret_key: values.secret_key,
          path_prefix: values.path_prefix || '',
          use_ssl: values.use_ssl !== false,
        });
        await api.post('/cloud-storages/test', { type: 's3', config });
        message.success('Connection successful!');
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        message.error(detail || 'Connection failed');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: p.text }}>S3 Connections</div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>Manage Amazon S3 or S3-compatible storage</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchStorages} style={{
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <ReloadOutlined /> Refresh
            </button>
            <button onClick={openCreateModal} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <PlusOutlined /> Add
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin /></div>
        ) : storages.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: p.textMuted }}>
            <CloudOutlined style={{ fontSize: 40, opacity: 0.3, display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>No S3 storages configured</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Add an S3-compatible storage for cloud backups</div>
          </div>
        ) : (
          <div style={{ background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}>
            {storages.map((s) => {
              const cfg = parseConfig(s.config);
              return (
                <div key={s.id} style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${p.cardBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{s.name}</span>
                      {s.is_default && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: `${p.accent}18`, color: p.accent, textTransform: 'uppercase',
                        }}>Default</span>
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
                      <span><strong>Bucket:</strong> {cfg.bucket}</span>
                      {cfg.region && <span><strong>Region:</strong> {cfg.region}</span>}
                      {cfg.endpoint && <span><strong>Endpoint:</strong> {cfg.endpoint}</span>}
                      <span>{formatDateTime(s.created_at, 'DD/MM/YYYY')}</span>
                    </div>
                  </div>
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
                    <Popconfirm title="Delete this storage?" description="Existing backups stored here will not be deleted." onConfirm={() => handleDelete(s.id)} okText="Delete" okButtonProps={{ danger: true }}>
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
              );
            })}
          </div>
        )}

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
              <CloudOutlined style={{ color: '#FF9900' }} />
              {editingId ? 'Edit S3 Storage' : 'Add S3 Storage'}
            </div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
              Configure Amazon S3 or S3-compatible storage
            </div>
          </div>

          <div style={{ padding: '16px 24px 20px' }}>
            <Form form={form} layout="vertical" requiredMark={false}
              style={{ '--ant-color-text': p.text, '--ant-color-text-secondary': p.textMuted } as React.CSSProperties}
            >
              <Form.Item name="name" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Storage Name</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="e.g. AWS Backups" />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="endpoint" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Endpoint</span>}>
                  <Input placeholder="s3.amazonaws.com" />
                </Form.Item>
                <Form.Item name="region" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Region</span>}>
                  <Input placeholder="us-east-1" />
                </Form.Item>
              </div>

              <Form.Item name="bucket" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Bucket</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="my-backup-bucket" />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="access_key" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Access Key</span>} rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="AKIAIOSFODNN7EXAMPLE" />
                </Form.Item>
                <Form.Item name="secret_key" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Secret Key</span>} rules={editingId ? [] : [{ required: true, message: 'Required' }]}>
                  <Input.Password placeholder={editingId ? 'Leave blank to keep current' : 'Secret key'} />
                </Form.Item>
              </div>

              <Form.Item name="path_prefix" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Path Prefix</span>}>
                <Input placeholder="backups/" />
              </Form.Item>

              <div style={{ display: 'flex', gap: 24 }}>
                <Form.Item name="use_ssl" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
                    <Switch size="small" /> Use SSL
                  </span>
                </Form.Item>
                <Form.Item name="is_default" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
                    <Switch size="small" /> Set as default
                  </span>
                </Form.Item>
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
}
