// GoogleDriveManageModal v2 — GoogleDriveConnectionsTab extracted as top-level component
import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Form, Input, Switch, message, Popconfirm, Tooltip, Spin, Alert } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, CloudOutlined, SafetyCertificateOutlined,
  GlobalOutlined,
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

interface GDriveConfigParsed {
  client_id: string;
  client_secret: string;
  folder_id: string;
  refresh_token?: string;
}

// DeviceFlowState — drives the in-modal device authorization UI
interface DeviceFlowState {
  phase: 'idle' | 'starting' | 'waiting' | 'success' | 'error';
  userCode?: string;
  verificationURL?: string;
  expiresIn?: number;   // seconds remaining
  interval?: number;     // seconds between polls
  deviceCode?: string;  // used for polling
  errorMsg?: string;
  pollCount?: number;
}

// ── GoogleDriveConnectionsTab ──────────────────────────────────────────────────
interface ConnectionsTabProps { open: boolean }

function GoogleDriveConnectionsTab({ open }: ConnectionsTabProps) {
  const isMobile = useIsMobile();
  const { p } = usePalette();
  const [storages, setStorages] = useState<CloudStorageConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [authorizingId, setAuthorizingId] = useState<number | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<Record<number, DeviceFlowState>>({});
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceFlowStorageId, setDeviceFlowStorageId] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowDataRef = useRef<DeviceFlowState | null>(null);

  const fetchStorages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cloud-storages', { params: { type: 'google_drive' } });
      setStorages(data.data ?? []);
    } catch {
      message.error('Failed to load Google Drive storages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) fetchStorages(); }, [open, fetchStorages]);

  const parseConfig = (configStr: string): Partial<GDriveConfigParsed> => {
    try { return JSON.parse(configStr); } catch { return {}; }
  };

  const isAuthorized = (s: CloudStorageConfig) => !!parseConfig(s.config).refresh_token;

  const openCreateModal = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_default: false });
    setModalOpen(true);
  };

  const openEditModal = async (id: number) => {
    try {
      const { data } = await api.get(`/cloud-storages/${id}`);
      const s = data.data;
      const cfg = parseConfig(s.config);
      setEditingId(id);
      form.setFieldsValue({ name: s.name, client_id: cfg.client_id, client_secret: '', folder_id: cfg.folder_id, is_default: s.is_default });
      setModalOpen(true);
    } catch {
      message.error('Failed to load storage details');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const config = { client_id: values.client_id, client_secret: values.client_secret, folder_id: values.folder_id || '' };
      const payload = { name: values.name, type: 'google_drive', config, is_default: !!values.is_default };
      if (editingId) {
        await api.put(`/cloud-storages/${editingId}`, payload);
        message.success('Google Drive storage updated');
      } else {
        await api.post('/cloud-storages', payload);
        message.success('Google Drive storage created — click Authorize to connect');
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
      message.success('Google Drive storage deleted');
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
    setDeviceFlowStorageId(id);
    try {
      const { data } = await api.post(`/cloud-storages/${id}/device-auth/start`);
      const info = data.data as {
        user_code: string;
        verification_url: string;
        expires_in: number;
        interval: number;
        device_code: string;
      };

      setDeviceFlow(prev => ({
        ...prev,
        [id]: {
          phase: 'waiting',
          userCode: info.user_code,
          verificationURL: info.verification_url || 'https://www.google.com/device',
          expiresIn: info.expires_in,
          interval: info.interval,
          deviceCode: info.device_code,
          pollCount: 0,
        },
      }));
      setDeviceModalOpen(true);

      flowDataRef.current = {
        phase: 'waiting',
        deviceCode: info.device_code,
        interval: info.interval,
        expiresIn: info.expires_in,
      };

      const poll = async () => {
        const state = flowDataRef.current;
        if (!state || state.phase !== 'waiting') return;

        try {
          const pollResp = await api.post(`/cloud-storages/${id}/device-auth/poll`, {
            device_code: state.deviceCode,
          });
          const pollData = pollResp.data as { pending?: boolean; connected?: boolean };

          if (!pollData.pending && pollData.connected) {
            clearTimeout(pollTimerRef.current ?? undefined);
            flowDataRef.current = null;
            setDeviceFlow(prev => ({ ...prev, [id]: { ...prev[id], phase: 'success' } }));
            setTimeout(() => {
              setDeviceModalOpen(false);
              setDeviceFlow(prev => { const n = { ...prev }; delete n[id]; return n; });
              fetchStorages();
            }, 2000);
            return;
          }
        } catch {
          // Network errors during polling are normal — keep polling
        }

        const remaining = (state.expiresIn ?? 0) - (state.interval ?? 5);
        if (remaining <= 0) {
          clearTimeout(pollTimerRef.current ?? undefined);
          flowDataRef.current = null;
          setDeviceFlow(prev => ({
            ...prev,
            [id]: { ...prev[id], phase: 'error', errorMsg: 'Authorization timed out. Please try again.' },
          }));
          return;
        }

        flowDataRef.current = { ...state, expiresIn: remaining, pollCount: (state.pollCount ?? 0) + 1 };
        setDeviceFlow(prev => ({
          ...prev,
          [id]: { ...prev[id], expiresIn: remaining, pollCount: (prev[id]?.pollCount ?? 0) + 1 },
        }));

        pollTimerRef.current = setTimeout(poll, (state.interval ?? 5) * 1000);
      };

      poll();
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
      setDeviceFlow(prev => ({
        ...prev,
        [id]: { phase: 'error', errorMsg: raw || 'Failed to start device authorization' },
      }));
      setDeviceModalOpen(true);
    } finally {
      setAuthorizingId(null);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Google Drive Connections</div>
          <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>Manage Google Drive storage with OAuth</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={fetchStorages} style={{
            padding: '6px 12px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <ReloadOutlined /> Refresh
          </button>
          <button type="button" onClick={openCreateModal} style={{
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
          <div style={{ fontSize: 13 }}>No Google Drive storages configured</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Add a Google Drive connection for cloud backups</div>
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
                      {authorized
                        ? <><CheckCircleOutlined /> Connected</>
                        : <><ExclamationCircleOutlined /> Not Connected</>}
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
                    {cfg.folder_id && <span><strong>Folder:</strong> {cfg.folder_id}</span>}
                    <span>{formatDateTime(s.created_at, 'DD/MM/YYYY')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Tooltip title="Authorize">
                    <button type="button" onClick={() => handleAuthorize(s.id)} disabled={authorizingId === s.id} style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: '#4285F4', fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      opacity: authorizingId === s.id ? 0.6 : 1,
                    }}>
                      {authorizingId === s.id ? <Spin size="small" /> : <SafetyCertificateOutlined />}
                    </button>
                  </Tooltip>
                  <Tooltip title="Test Connection">
                    <button type="button" onClick={() => handleTest(s.id)} disabled={testingId === s.id} style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: p.green, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      opacity: testingId === s.id ? 0.6 : 1,
                    }}>
                      {testingId === s.id ? <Spin size="small" /> : <LinkOutlined />}
                    </button>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <button type="button" onClick={() => openEditModal(s.id)} style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                      background: p.card, color: p.accent, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center',
                    }}>
                      <EditOutlined />
                    </button>
                  </Tooltip>
                  <Popconfirm title="Delete this storage?" description="Existing backups will not be deleted." onConfirm={() => handleDelete(s.id)} okText="Delete" okButtonProps={{ danger: true }}>
                    <Tooltip title="Delete">
                      <button type="button" style={{
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
        maskClosable={false}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${p.cardBorder}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudOutlined style={{ color: '#4285F4' }} />
            {editingId ? 'Edit Google Drive Storage' : 'Add Google Drive Storage'}
          </div>
          <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
            Configure Google Drive for cloud backup storage
          </div>
        </div>

        <div style={{ padding: '16px 24px 20px' }}>
          <Form form={form} layout="vertical" requiredMark={false}
            style={{ '--ant-color-text': p.text, '--ant-color-text-secondary': p.textMuted } as React.CSSProperties}
          >
            <Form.Item name="name" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Storage Name</span>} rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. Google Drive Backup" />
            </Form.Item>
            <Form.Item name="client_id" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Client ID</span>} rules={[{ required: true, message: 'Required' }]}
              extra={<span style={{ fontSize: 10, color: p.textDim }}>Get from Google Cloud Console → APIs &amp; Services → Credentials</span>}
            >
              <Input placeholder="xxxx.apps.googleusercontent.com" />
            </Form.Item>
            <Form.Item name="client_secret" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Client Secret</span>} rules={editingId ? [] : [{ required: true, message: 'Required' }]}>
              <Input.Password placeholder={editingId ? 'Leave blank to keep current' : 'Client secret'} />
            </Form.Item>
            <Form.Item name="folder_id" label={<span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>Folder ID</span>}
              extra={<span style={{ fontSize: 10, color: p.textDim }}>Optional — leave empty to use root folder</span>}
            >
              <Input placeholder="Folder ID (optional)" />
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
          <button type="button" onClick={() => setModalOpen(false)} style={{
            padding: '7px 14px', borderRadius: 7, border: `1px solid ${p.cardBorder}`,
            background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={{
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

      {/* ── Device Authorization Flow Modal ──────────────────────── */}
      {deviceFlowStorageId !== null && deviceFlow[deviceFlowStorageId] && (
        <Modal
          open={deviceModalOpen}
          onCancel={() => {
            clearTimeout(pollTimerRef.current ?? undefined);
            setDeviceModalOpen(false);
            setDeviceFlow(prev => { const n = { ...prev }; delete n[deviceFlowStorageId]; return n; });
          }}
          footer={null}
          width={420}
          closable
          maskClosable={false}
          styles={{ body: { padding: '28px 28px 24px' } }}
          title={
            <span style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#4285F4' }} />
              Google Drive Authorization
            </span>
          }
        >
          {(() => {
            const df = deviceFlow[deviceFlowStorageId];
            if (!df) return null;

            if (df.phase === 'waiting') {
              return (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, fontFamily: 'monospace', fontWeight: 700, color: '#4285F4',
                    letterSpacing: '4px', background: '#E8F0FE', borderRadius: 8, padding: '16px 24px',
                    marginBottom: 20, border: '2px dashed #4285F4' }}>
                    {df.userCode}
                  </div>
                  <div style={{ fontSize: 13, color: p.text, marginBottom: 6, fontWeight: 500 }}>
                    1. Open this URL in your browser:
                  </div>
                  <a href={df.verificationURL} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#4285F4', wordBreak: 'break-all', marginBottom: 16, display: 'block' }}>
                    <GlobalOutlined style={{ marginRight: 4 }} />
                    {df.verificationURL}
                  </a>
                  <div style={{ fontSize: 13, color: p.text, marginBottom: 6, fontWeight: 500 }}>
                    2. Enter the code shown above
                  </div>
                  <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 20 }}>
                    {df.expiresIn ? (
                      <>Expires in <strong>{Math.floor(df.expiresIn / 60)}m {df.expiresIn % 60}s</strong></>
                    ) : 'Waiting...'}
                    {df.pollCount !== undefined && df.pollCount > 0 && (
                      <span style={{ marginLeft: 8 }}>— polling #{df.pollCount + 1}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Spin size="small" />
                    <span style={{ fontSize: 12, color: p.textMuted }}>
                      Waiting for authorization — keep this window open...
                    </span>
                  </div>
                </div>
              );
            }

            if (df.phase === 'success') {
              return (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <CheckCircleOutlined style={{ fontSize: 48, color: p.green, marginBottom: 16, display: 'block' }} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: p.text, marginBottom: 8 }}>
                    Authorization successful!
                  </div>
                  <div style={{ fontSize: 12, color: p.textMuted }}>
                    Google Drive connected. This window will close automatically.
                  </div>
                </div>
              );
            }

            // error phase
            const isClientTypeError = df.errorMsg?.includes('Only clients of type') || df.errorMsg?.includes('TVs and Limited Input');
            return (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <ExclamationCircleOutlined style={{ fontSize: 40, color: p.red, marginBottom: 12, display: 'block' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: p.text, marginBottom: 8 }}>
                    Authorization Failed
                  </div>
                  {isClientTypeError ? (
                    <div>
                      <div style={{ fontSize: 12, color: p.textMuted, background: `${p.red}10`, borderRadius: 8, padding: '12px 16px', textAlign: 'left', marginBottom: 16 }}>
                        <strong>Cause:</strong> Your Google OAuth Client is registered as <em>"Web application"</em>, which does not support the Device Authorization Flow required for server panels without a public domain.
                        <br /><br />
                        <strong>Solution:</strong> Create a new OAuth client of type <em>"TVs and Limited Input devices"</em> in Google Cloud Console.
                      </div>
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#4285F4', display: 'block', marginBottom: 16 }}>
                        Open Google Cloud Console → APIs &amp; Services → Credentials
                      </a>
                      <div style={{ fontSize: 11, color: p.textMuted, background: p.card, borderRadius: 6, padding: '12px 16px', textAlign: 'left' }}>
                        <strong>Steps:</strong><br />
                        1. Go to <strong>Credentials</strong> → click <strong>+ CREATE CREDENTIALS</strong><br />
                        2. Select <strong>OAuth client ID</strong><br />
                        3. Application type: select <strong>"TVs and Limited Input devices"</strong><br />
                        4. Give it a name (e.g. "ITDLUPanel Device") and click <strong>Create</strong><br />
                        5. Copy the <strong>Client ID</strong> and <strong>Client Secret</strong><br />
                        6. Edit your storage in ITDLUPanel and paste the new credentials<br />
                        7. Click <strong>Authorize</strong> again
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 16 }}>
                      {df.errorMsg}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => {
                    setDeviceModalOpen(false);
                    setDeviceFlow(prev => { const n = { ...prev }; delete n[deviceFlowStorageId]; return n; });
                  }} style={{
                    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                    background: p.card, color: p.textMuted, fontSize: 12, cursor: 'pointer',
                  }}>
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

// ── GoogleDriveManageModal ─────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'connections', label: 'Connections', icon: <CloudOutlined /> },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props { open: boolean; onClose: () => void; isInstalled?: boolean }

export default function GoogleDriveManageModal({ open, onClose, isInstalled = true }: Props) {
  const isMobile = useIsMobile();
  const { p } = usePalette();
  const [section, setSection] = useState<SectionKey>('connections');

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', cursor: 'pointer', fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 8,
    color: active ? p.accent : p.text,
    background: active ? `${p.accent}12` : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${p.accent}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${p.accent}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CloudOutlined style={{ color: '#4285F4' }} />
          <span>Google Drive Manager</span>
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
          message="Google Drive is not installed"
          description="Go to App Store to install Google Drive first, then configure your connections here."
        />
      )}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        <div style={{
          width: isMobile ? '100%' : 200,
          borderRight: isMobile ? 'none' : `1px solid ${p.cardBorder}`,
          borderBottom: isMobile ? `1px solid ${p.cardBorder}` : 'none',
          display: 'flex', flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
        }}>
          {SECTIONS.map((s) => (
            <div key={s.key} onClick={() => setSection(s.key)} style={sidebarStyle(section === s.key)}>
              {s.icon} {s.label}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', maxHeight: isMobile ? '60vh' : '80vh' }}>
          {section === 'connections' && <GoogleDriveConnectionsTab open={open} />}
        </div>
      </div>
    </Modal>
  );
}
