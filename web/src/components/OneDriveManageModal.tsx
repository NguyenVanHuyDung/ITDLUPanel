import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, Switch, message, Popconfirm, Tooltip, Spin, Alert } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, HddOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

interface CloudStorageConfig {
  id: number;
  name: string;
  type: string;
  config: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface OneDriveConfigParsed {
  client_id: string;
  client_secret: string;
  folder_path: string;
  refresh_token?: string;
}

const SECTIONS = [
  { key: 'connections', label: 'Connections', icon: <HddOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
  isInstalled?: boolean;
}

export default function OneDriveManageModal({ open, onClose, isInstalled = true }: Props) {
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
          <HddOutlined style={{ color: '#0078D4' }} />
          <span>OneDrive Manager</span>
        </div>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnHidden
    >
      {!isInstalled && (
        <Alert
          type="warning"
          showIcon
          style={{ margin: 16, marginBottom: 0 }}
          message="OneDrive is not installed"
          description="Go to App Store to install OneDrive first, then configure your connections here."
        />
      )}
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
    const [storages, setStorages] = useState<CloudStorageConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form] = Form.useForm();
    const [testingId, setTestingId] = useState<number | null>(null);
    const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [authorizingId, setAuthorizingId] = useState<number | null>(null);

    const fetchStorages = useCallback(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/cloud-storages', { params: { type: 'onedrive' } });
        setStorages(data.data ?? []);
      } catch {
        message.error('Failed to load OneDrive storages');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => { if (open) fetchStorages(); }, [open, fetchStorages]);

    const parseConfig = (configStr: string): Partial<OneDriveConfigParsed> => {
      try { return JSON.parse(configStr); } catch { return {}; }
    };

    const isAuthorized = (s: CloudStorageConfig) => {
      const cfg = parseConfig(s.config);
      return !!cfg.refresh_token;
    };

    const openCreateModal = () => {
      setEditingId(null);
      form.resetFields();
      form.setFieldsValue({ folder_path: '/backups', is_default: false });
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
          client_id: cfg.client_id,
          client_secret: '',
          folder_path: cfg.folder_path || '/backups',
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
          client_id: values.client_id,
          client_secret: values.client_secret,
          folder_path: values.folder_path || '/backups',
        });
        const payload = { name: values.name, type: 'onedrive', config, is_default: !!values.is_default };
        if (editingId) {
          await api.put(`/cloud-storages/${editingId}`, payload);
          message.success('OneDrive storage updated');
        } else {
          await api.post('/cloud-storages', payload);
          message.success('OneDrive storage created — click Authorize to connect');
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
        message.success('OneDrive storage deleted');
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

    const handleAuthorize = async (id: number) => {
      setAuthorizingId(id);
      let popup: Window | null = null;
      try {
        const { data } = await api.get(`/cloud-storages/${id}/auth-url`);
        const url = data.data?.url || data.data;
        if (!url) {
          message.error('Failed to get authorization URL');
          return;
        }
        popup = window.open(url, '_blank', 'width=600,height=700,scrollbars=yes');
        if (!popup) {
          message.error('Popup was blocked — please allow popups for this site and try again');
          return;
        }
        message.info('Complete authorization in the popup window');

        await new Promise<void>((resolve) => {
          const handler = (event: MessageEvent) => {
            if (event.data?.type === 'oauth_callback_done') {
              window.removeEventListener('message', handler);
              resolve();
            }
          };
          window.addEventListener('message', handler);
          const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve();
          }, 5 * 60 * 1000);
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed);
              clearTimeout(timeout);
              window.removeEventListener('message', handler);
              resolve();
            }
          }, 500);
        });

        if (popup && !popup.closed) popup.close();
        message.success('Authorization complete');
        fetchStorages();
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        message.error(detail || 'Failed to get authorization URL');
        if (popup && !popup.closed) popup.close();
      } finally {
        setAuthorizingId(null);
      }
    };

    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: p.text }}>OneDrive Connections</div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>Manage Microsoft OneDrive storage with OAuth</div>
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
            <HddOutlined style={{ fontSize: 40, opacity: 0.3, display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>No OneDrive storages configured</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Add a OneDrive connection for cloud backups</div>
          </div>
        ) : (
          <div style={{ background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}>
            {storages.map((s) => {
              const authorized = isAuthorized(s);
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
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: authorized ? `${p.green}15` : `${p.amber}15`,
                        color: authorized ? p.green : p.amber,
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        {authorized ? <><CheckCircleOutlined /> Connected</> : <><ExclamationCircleOutlined /> Not Connected</>}
                      </span>
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
                      {cfg.folder_path && <span><strong>Folder:</strong> {cfg.folder_path}</span>}
                      <span>{formatDateTime(s.created_at, 'DD/MM/YYYY')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <Tooltip title="Authorize">
                      <button onClick={() => handleAuthorize(s.id)} disabled={authorizingId === s.id} style={{
                        padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                        background: p.card, color: '#0078D4', fontSize: 12, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        opacity: authorizingId === s.id ? 0.6 : 1,
                      }}>
                        {authorizingId === s.id ? <Spin size="small" /> : <SafetyCertificateOutlined />}
                      </button>
                    </Tooltip>
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
                    <Popconfirm title="Delete this storage?" description="Existing backups will not be deleted." onConfirm={() => handleDelete(s.id)} okText="Delete" okButtonProps={{ danger: true }}>
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
              <HddOutlined style={{ color: '#0078D4' }} />
              {editingId ? 'Edit OneDrive Storage' : 'Add OneDrive Storage'}
            </div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
              Configure Microsoft OneDrive for cloud backup storage
            </div>
          </div>

          <div style={{ padding: '16px 24px 20px' }}>
            <Form form={form} layout="vertical" requiredMark={false}
              style={{ '--ant-color-text': p.text, '--ant-color-text-secondary': p.textMuted } as React.CSSProperties}
            >
              <Form.Item name="name" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Storage Name</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="e.g. OneDrive Backup" />
              </Form.Item>

              <Form.Item name="client_id" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Client ID</span>} rules={[{ required: true, message: 'Required' }]}
                extra={<span style={{ fontSize: 10, color: p.textDim }}>Get from Azure Portal → App Registrations</span>}
              >
                <Input placeholder="Application (client) ID" />
              </Form.Item>

              <Form.Item name="client_secret" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Client Secret</span>} rules={editingId ? [] : [{ required: true, message: 'Required' }]}>
                <Input.Password placeholder={editingId ? 'Leave blank to keep current' : 'Client secret value'} />
              </Form.Item>

              <Form.Item name="folder_path" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Folder Path</span>}>
                <Input placeholder="/backups" />
              </Form.Item>

              <Form.Item name="is_default" valuePropName="checked" style={{ marginBottom: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
                  <Switch size="small" /> Set as default
                </span>
              </Form.Item>
            </Form>
          </div>

          <div style={{
            padding: '12px 24px 16px',
            borderTop: `1px solid ${p.cardBorder}`,
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>
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
        </Modal>
      </div>
    );
  }
}
