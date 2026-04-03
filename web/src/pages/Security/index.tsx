import { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Input, InputNumber, Switch, Select, message, Spin, Popconfirm, Table, Modal, Tag, Empty } from 'antd';
import {
  LockOutlined, SecurityScanOutlined, ReloadOutlined,
  KeyOutlined, UserOutlined, DeleteOutlined,
  PlusOutlined, DownloadOutlined, CopyOutlined,
  EyeOutlined, EyeInvisibleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const SecIcon = {
  Shield: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Terminal: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Ban: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 14.14 14.14" />
    </svg>
  ),
  Key: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  Log: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  User: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Jail: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="16" y1="3" x2="16" y2="21" />
    </svg>
  ),
  Settings: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSHConfig {
  port: number;
  permit_root_login: string;
  password_auth: boolean;
  pubkey_auth: boolean;
  max_auth_tries: number;
}

interface SSHKeyEntry {
  index: number;
  type: string;
  fingerprint: string;
  comment: string;
  public_key: string;
}

interface SystemUser {
  username: string;
  uid: number;
  home_dir: string;
  shell: string;
  has_keys: boolean;
  key_count: number;
}

interface SSHLogEntry {
  time: string;
  source: string;
  event: 'accepted' | 'failed' | 'close' | 'connect' | 'other';
  message: string;
  ip?: string;
}

interface JailInfo {
  name: string;
  enabled: boolean;
  status: string;
  currently_ban: number;
  total_banned: number;
  currently_fail: number;
  total_failed: number;
  ban_time: number;
  find_time: number;
  max_retry: number;
  banned_ips: string[] | null;
}

interface Fail2banStatus {
  installed: boolean;
  enabled: boolean;
  version: string;
  jails: JailInfo[];
}

interface JailConfig {
  name: string;
  enabled: boolean;
  port: string;
  filter: string;
  logpath: string;
  maxretry: number;
  bantime: number;
  findtime: number;
}

interface GlobalConfig {
  max_retry: number;
  ban_time: number;
  find_time: number;
  ignore_ips: string[];
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

function useStyles() {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();

  const sectionBox: React.CSSProperties = {
    maxWidth: 640, borderRadius: 10,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 16 : 28,
  };

  const wideBox: React.CSSProperties = { ...sectionBox, maxWidth: 'none' };

  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
    transition: 'opacity 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnOutline: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.text, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  };

  const btnDanger: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.red}`,
    background: 'transparent', color: p.red, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  return { sectionBox, wideBox, btnPrimary, btnOutline, btnDanger, p, isDark, isMobile };
}

function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  const { p } = usePalette();
  return (
    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.accent }}>{icon}</div>
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>{title}</span>
      </div>
      {extra}
    </div>
  );
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ---------------------------------------------------------------------------
// SSH Config Tab
// ---------------------------------------------------------------------------

function SSHConfigTab() {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, p } = useStyles();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSHConfig>>('/security/ssh');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: SSHConfig) => {
    setSaving(true);
    try {
      await api.put('/security/ssh', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={sectionBox}>
      <SectionTitle icon={<SecIcon.Terminal size={20} color={p.accent} />} title="SSH Configuration" />
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ port: 22, permit_root_login: 'yes', password_auth: true, pubkey_auth: true, max_auth_tries: 6 }}>
        <Form.Item name="port" label={<span style={{ fontWeight: 500 }}>SSH Port</span>} rules={[{ required: true }]}
          extra={<span style={{ fontSize: 11, color: p.textMuted }}>Default: 22. Changing this requires a service restart.</span>}>
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="password_auth" label={<span style={{ fontWeight: 500 }}>Password Authentication</span>} valuePropName="checked"
          extra={<span style={{ fontSize: 11, color: p.textMuted }}>Allow users to log in using passwords</span>}>
          <Switch />
        </Form.Item>
        <Form.Item name="pubkey_auth" label={<span style={{ fontWeight: 500 }}>Public Key Authentication</span>} valuePropName="checked"
          extra={<span style={{ fontSize: 11, color: p.textMuted }}>Allow users to log in using SSH keys</span>}>
          <Switch />
        </Form.Item>
        <Form.Item name="permit_root_login" label={<span style={{ fontWeight: 500 }}>Root Login</span>}
          extra={<span style={{ fontSize: 11, color: p.textMuted }}>
            <b>yes</b> — password &amp; key &nbsp;|&nbsp; <b>no</b> — disabled &nbsp;|&nbsp;
            <b>without-password</b> — key only &nbsp;|&nbsp; <b>forced-commands-only</b> — command only
          </span>}>
          <Select options={[
            { value: 'yes', label: 'Yes — key and password' },
            { value: 'no', label: 'No — login disabled' },
            { value: 'without-password', label: 'Without-password — key only' },
            { value: 'forced-commands-only', label: 'Forced-commands-only — command only' },
          ]} />
        </Form.Item>
        <Form.Item name="max_auth_tries" label={<span style={{ fontWeight: 500 }}>Max Auth Tries</span>} rules={[{ required: true }]}>
          <InputNumber min={1} max={20} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? <Spin size="small" /> : null} {t('common.save')}
          </button>
        </Form.Item>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root Account Tab
// ---------------------------------------------------------------------------

function RootAccountTab() {
  const { t } = useTranslation();
  const { sectionBox, btnPrimary, btnOutline, p, isDark } = useStyles();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleChangePassword = async (values: { password: string; confirm: string }) => {
    if (values.password !== values.confirm) {
      message.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.put('/security/root-password', { password: values.password });
      message.success('Root password changed');
      form.resetFields();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  // Root key management
  const [keyLoading, setKeyLoading] = useState(false);
  const [publicKeys, setPublicKeys] = useState<SSHKeyEntry[]>([]);
  const [generatedKey, setGeneratedKey] = useState<{ public_key: string; private_key: string } | null>(null);
  const [keyType, setKeyType] = useState<'ed25519' | 'rsa'>('ed25519');

  const fetchPublicKeys = useCallback(async () => {
    setKeyLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSHKeyEntry[]>>('/security/ssh/keys/root/public');
      setPublicKeys(data.data || []);
    } catch { /* ignore */ } finally {
      setKeyLoading(false);
    }
  }, []);

  useEffect(() => { fetchPublicKeys(); }, [fetchPublicKeys]);

  const handleGenerate = async () => {
    setKeyLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ public_key: string; private_key: string }>>('/security/ssh/keys/root/generate', { key_type: keyType });
      setGeneratedKey(data.data);
      fetchPublicKeys();
      message.success('Key pair generated');
    } catch {
      message.error('Failed to generate key');
    } finally {
      setKeyLoading(false);
    }
  };

  const handleDownloadPrivate = () => {
    window.open(`/api/v1/security/ssh/keys/root/download-private?type=${keyType}`, '_blank');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied!')).catch(() => message.error('Copy failed'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Change Password */}
      <div style={sectionBox}>
        <SectionTitle icon={<SecIcon.Shield size={20} color={p.accent} />} title="Change Root Password" />
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 20,
          background: `${p.amber}10`, border: `1px solid ${p.amber}30`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 14, color: p.amber, marginTop: 1 }}>⚠</span>
          <span style={{ fontSize: 12, color: p.text }}>This changes the system root password. Make sure you remember it.</span>
        </div>
        <Form form={form} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="password" label={<span style={{ fontWeight: 500 }}>New Password</span>}
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
            <Input.Password
              placeholder="Enter new root password"
              iconRender={v => v ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              visibilityToggle={{ visible: showPw, onVisibleChange: setShowPw }}
            />
          </Form.Item>
          <Form.Item name="confirm" label={<span style={{ fontWeight: 500 }}>Confirm Password</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm the password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}>
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Popconfirm title="Change root password?" onConfirm={() => form.submit()} okText="Change">
              <button type="button" disabled={saving} style={{ ...btnPrimary, background: p.red, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Spin size="small" /> : null} Change Password
              </button>
            </Popconfirm>
          </Form.Item>
        </Form>
      </div>

      {/* Root SSH Keys */}
      <div style={sectionBox}>
        <SectionTitle icon={<SecIcon.Key size={20} color={p.accent} />} title="Root SSH Keys" />
        <Spin spinning={keyLoading}>
          {publicKeys.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {publicKeys.map((k, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: isDark ? p.card : '#fff',
                  border: `1px solid ${p.cardBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.accent }}>{k.type}</span>
                    <code style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {k.fingerprint}
                    </code>
                    {k.comment && <span style={{ fontSize: 11, color: p.textMuted }}>{k.comment}</span>}
                  </div>
                  <button onClick={() => copyToClipboard(k.public_key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted, padding: 4, display: 'flex' }}>
                    <CopyOutlined style={{ fontSize: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: p.textMuted, marginBottom: 16, padding: '12px 0' }}>
              No SSH key pair found for root. Generate one below.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Select value={keyType} onChange={setKeyType} style={{ width: 140 }}
              options={[{ value: 'ed25519', label: 'Ed25519' }, { value: 'rsa', label: 'RSA 4096' }]} />
            <Popconfirm title="Generate new key pair? This will overwrite existing keys." onConfirm={handleGenerate} okText="Generate">
              <button style={btnPrimary}><KeyOutlined /> Generate</button>
            </Popconfirm>
            {publicKeys.length > 0 && (
              <button onClick={handleDownloadPrivate} style={btnOutline}><DownloadOutlined /> Download Private Key</button>
            )}
          </div>
        </Spin>

        {generatedKey && (
          <Modal title="Generated Key Pair" open={!!generatedKey} onCancel={() => setGeneratedKey(null)} footer={null} width={640}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>Public Key</span>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <pre style={{
                  fontSize: 11, padding: 12, borderRadius: 8,
                  background: isDark ? p.card : p.codeBg,
                  border: `1px solid ${p.cardBorder}`, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                }}>{generatedKey.public_key}</pre>
                <button onClick={() => copyToClipboard(generatedKey.public_key)} style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted,
                }}><CopyOutlined /></button>
              </div>
            </div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.red }}>Private Key — save this now! It won't be shown again.</span>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <pre style={{
                  fontSize: 11, padding: 12, borderRadius: 8, maxHeight: 200, overflow: 'auto',
                  background: isDark ? p.card : p.codeBg,
                  border: `1px solid ${p.red}30`, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                }}>{generatedKey.private_key}</pre>
                <button onClick={() => copyToClipboard(generatedKey.private_key)} style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted,
                }}><CopyOutlined /></button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSH Keys Tab (multi-user)
// ---------------------------------------------------------------------------

function SSHKeysTab() {
  const { t } = useTranslation();
  const { wideBox, btnPrimary, btnOutline, btnDanger, p, isDark, isMobile } = useStyles();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('root');
  const [keys, setKeys] = useState<SSHKeyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addKey, setAddKey] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SystemUser[]>>('/security/ssh/users');
      setUsers(data.data || []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchKeys = useCallback(async (username: string) => {
    setKeysLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSHKeyEntry[]>>(`/security/ssh/keys/${username}`);
      setKeys(data.data || []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setKeysLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (selectedUser) fetchKeys(selectedUser); }, [selectedUser, fetchKeys]);

  const handleAddKey = async () => {
    if (!addKey.trim()) return;
    setAddLoading(true);
    try {
      await api.post(`/security/ssh/keys/${selectedUser}`, { public_key: addKey.trim() });
      message.success('Key added');
      setAddModalOpen(false);
      setAddKey('');
      fetchKeys(selectedUser);
      fetchUsers();
    } catch {
      message.error('Failed to add key');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveKey = async (fingerprint: string) => {
    try {
      await api.delete(`/security/ssh/keys/${selectedUser}/${encodeURIComponent(fingerprint)}`);
      message.success('Key removed');
      fetchKeys(selectedUser);
      fetchUsers();
    } catch {
      message.error('Failed to remove key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied!')).catch(() => message.error('Copy failed'));
  };

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v: string) => <span style={{ fontSize: 12, fontWeight: 600, color: p.accent }}>{v}</span>,
    },
    {
      title: 'Fingerprint',
      dataIndex: 'fingerprint',
      key: 'fingerprint',
      ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{v}</code>,
    },
    {
      title: 'Comment',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12, color: p.text }}>{v || '—'}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: SSHKeyEntry) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => copyToClipboard(record.public_key)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted, padding: 4, display: 'flex',
          }}><CopyOutlined style={{ fontSize: 13 }} /></button>
          <Popconfirm title="Remove this key?" onConfirm={() => handleRemoveKey(record.fingerprint)} okText="Remove">
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer', color: p.red, padding: 4, display: 'flex',
            }}><DeleteOutlined style={{ fontSize: 13 }} /></button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={wideBox}>
      <SectionTitle icon={<SecIcon.Key size={20} color={p.accent} />} title="SSH Key Management"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { fetchKeys(selectedUser); fetchUsers(); }} style={btnOutline}><ReloadOutlined /> Refresh</button>
            <button onClick={() => setAddModalOpen(true)} style={btnPrimary}><PlusOutlined /> Add Key</button>
          </div>
        }
      />

      {/* User selector */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: p.textMuted }}>User:</span>
        <Select value={selectedUser} onChange={setSelectedUser} style={{ minWidth: 180 }} loading={loading}
          options={users.map(u => ({
            value: u.username,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserOutlined style={{ fontSize: 12 }} />
                {u.username}
                {u.key_count > 0 && (
                  <span style={{
                    fontSize: 10, padding: '0 6px', borderRadius: 99,
                    background: `${p.accent}15`, color: p.accent, fontWeight: 600,
                  }}>{u.key_count}</span>
                )}
              </span>
            ),
          }))}
        />
      </div>

      {/* Keys table */}
      <Spin spinning={keysLoading}>
        {keys.length > 0 ? (
          <Table
            dataSource={keys}
            columns={columns}
            rowKey="fingerprint"
            pagination={false}
            size="small"
            scroll={isMobile ? { x: 500 } : undefined}
            style={{ borderRadius: 8, overflow: 'hidden' }}
          />
        ) : (
          <div style={{
            padding: 32, textAlign: 'center', borderRadius: 8,
            background: isDark ? p.card : '#fff',
            border: `1px dashed ${p.cardBorder}`,
          }}>
            <SecIcon.Key size={32} color={p.textMuted} />
            <div style={{ fontSize: 13, color: p.textMuted, marginTop: 8 }}>
              No authorized keys for <b>{selectedUser}</b>
            </div>
            <button onClick={() => setAddModalOpen(true)} style={{ ...btnPrimary, marginTop: 12 }}>
              <PlusOutlined /> Add Key
            </button>
          </div>
        )}
      </Spin>

      {/* Add key modal */}
      <Modal title={`Add SSH Key for ${selectedUser}`} open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); setAddKey(''); }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAddModalOpen(false); setAddKey(''); }} style={btnOutline}>Cancel</button>
            <button onClick={handleAddKey} disabled={addLoading || !addKey.trim()} style={{ ...btnPrimary, opacity: addLoading ? 0.6 : 1 }}>
              {addLoading ? <Spin size="small" /> : <PlusOutlined />} Add Key
            </button>
          </div>
        }
      >
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: p.textMuted }}>Paste the public key (ssh-ed25519, ssh-rsa, etc.)</span>
        </div>
        <Input.TextArea
          rows={4}
          value={addKey}
          onChange={e => setAddKey(e.target.value)}
          placeholder="ssh-ed25519 AAAA... user@host"
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSH Log Tab
// ---------------------------------------------------------------------------

function parseSSHLogLine(line: string): SSHLogEntry | null {
  if (!line.trim()) return null;

  let event: SSHLogEntry['event'] = 'other';
  const lower = line.toLowerCase();
  if (lower.includes('accepted')) event = 'accepted';
  else if (lower.includes('failed') || lower.includes('invalid')) event = 'failed';
  else if (lower.includes('closed') || lower.includes('disconnected')) event = 'close';
  else if (lower.includes('connection from') || lower.includes('connect')) event = 'connect';

  const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  const timeMatch = line.match(/^(\w{3}\s+\d{1,2}\s+[\d:]+)/);

  return {
    time: timeMatch?.[1] || '',
    source: 'sshd',
    event,
    message: line,
    ip: ipMatch?.[1],
  };
}

function SSHLogTab() {
  const { t } = useTranslation();
  const { wideBox, btnOutline, p, isDark, isMobile } = useStyles();
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [numLines, setNumLines] = useState(200);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string[] }>>('/logs/ssh', { params: { lines: numLines } });
      setLines(data.data?.lines || []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [numLines, t]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const parsed = useMemo(() => {
    return lines.map(parseSSHLogLine).filter((e): e is SSHLogEntry => e !== null);
  }, [lines]);

  const filtered = useMemo(() => {
    return parsed.filter(e => {
      if (eventFilter !== 'all' && e.event !== eventFilter) return false;
      if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [parsed, eventFilter, search]);

  const stats = useMemo(() => {
    const s = { accepted: 0, failed: 0, close: 0, connect: 0, other: 0 };
    parsed.forEach(e => { s[e.event] = (s[e.event] || 0) + 1; });
    return s;
  }, [parsed]);

  const eventColor = (e: string) => {
    switch (e) {
      case 'accepted': return p.green;
      case 'failed': return p.red;
      case 'close': return p.amber;
      case 'connect': return p.accent;
      default: return p.textMuted;
    }
  };

  const statBadge = (label: string, count: number, color: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
      borderRadius: 8, background: `${color}12`, border: `1px solid ${color}25`,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>{label}</span>
    </div>
  );

  return (
    <div style={wideBox}>
      <SectionTitle icon={<SecIcon.Log size={20} color={p.accent} />} title="SSH Authentication Log"
        extra={
          <button onClick={fetchLog} disabled={loading} style={btnOutline}>
            <ReloadOutlined /> Refresh
          </button>
        }
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {statBadge('Accepted', stats.accepted, p.green)}
        {statBadge('Failed', stats.failed, p.red)}
        {statBadge('Closed', stats.close, p.amber)}
        {statBadge('Connect', stats.connect, p.accent)}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: p.textMuted }} />}
          placeholder="Search logs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: isMobile ? '100%' : 240, fontSize: 12 }}
        />
        <Select value={eventFilter} onChange={setEventFilter} style={{ width: 140 }}
          options={[
            { value: 'all', label: 'All events' },
            { value: 'accepted', label: '✓ Accepted' },
            { value: 'failed', label: '✗ Failed' },
            { value: 'close', label: '— Closed' },
            { value: 'connect', label: '→ Connect' },
          ]}
        />
        <Select value={numLines} onChange={setNumLines} style={{ width: 110 }}
          options={[
            { value: 100, label: '100 lines' },
            { value: 200, label: '200 lines' },
            { value: 500, label: '500 lines' },
            { value: 1000, label: '1000 lines' },
          ]}
        />
      </div>

      {/* Log content */}
      <Spin spinning={loading}>
        <div style={{
          maxHeight: 500, overflow: 'auto', borderRadius: 8,
          background: isDark ? p.card : p.codeBg,
          border: `1px solid ${p.cardBorder}`,
          fontFamily: 'monospace', fontSize: 11,
        }}>
          {filtered.length > 0 ? filtered.map((entry, i) => (
            <div key={i} style={{
              padding: '6px 12px',
              borderBottom: `1px solid ${p.cardBorder}`,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                background: `${eventColor(entry.event)}15`, color: eventColor(entry.event),
                flexShrink: 0, textTransform: 'uppercase', minWidth: 50, textAlign: 'center',
              }}>{entry.event}</span>
              {entry.time && (
                <span style={{ fontSize: 11, color: p.textMuted, flexShrink: 0, minWidth: 110 }}>{entry.time}</span>
              )}
              {entry.ip && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: p.accent, flexShrink: 0,
                  padding: '0 4px', borderRadius: 3, background: `${p.accent}10`,
                }}>{entry.ip}</span>
              )}
              <span style={{ fontSize: 11, color: p.text, wordBreak: 'break-all', flex: 1 }}>
                {entry.message.replace(/^(\w{3}\s+\d{1,2}\s+[\d:]+\s+\S+\s+\S+:\s*)/, '')}
              </span>
            </div>
          )) : (
            <div style={{ padding: 32, textAlign: 'center', color: p.textMuted, fontSize: 13 }}>
              {loading ? 'Loading...' : 'No log entries found'}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8 }}>
          Showing {filtered.length} of {parsed.length} entries
        </div>
      </Spin>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban — Overview Tab
// ---------------------------------------------------------------------------

function F2bOverviewTab() {
  const { t } = useTranslation();
  const { p, isMobile, sectionBox, btnPrimary, btnOutline } = useStyles();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Fail2banStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<Fail2banStatus>>('/security/fail2ban');
      setStatus(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const toggleService = async () => {
    if (!status) return;
    setToggling(true);
    try {
      await api.put('/security/fail2ban', { enabled: !status.enabled });
      message.success(t('common.success'));
      await fetchStatus();
    } catch {
      message.error(t('common.error'));
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  if (!status?.installed) {
    return (
      <div style={sectionBox}>
        <SectionTitle icon={<SecIcon.Ban size={20} color={p.amber} />} title="Fail2ban Not Installed" />
        <p style={{ color: p.textMuted, fontSize: 13, marginBottom: 16 }}>
          Fail2ban is not installed on this server. Install it to enable brute force protection.
        </p>
        <code style={{ display: 'block', background: p.codeBg, color: p.text, padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
          apt install fail2ban -y
        </code>
      </div>
    );
  }

  const totalBanned = status.jails.reduce((s, j) => s + j.currently_ban, 0);
  const totalFailed = status.jails.reduce((s, j) => s + j.currently_fail, 0);

  return (
    <div>
      <div style={sectionBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <SectionTitle icon={<SecIcon.Shield size={20} color={p.accent} />} title="Service Status" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchStatus} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
            <button onClick={toggleService} disabled={toggling}
              style={{ ...btnPrimary, background: status.enabled ? p.red : p.green, opacity: toggling ? 0.6 : 1 }}>
              {toggling ? <Spin size="small" /> : null}
              {status.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: 12 }}>
          {[
            { label: 'Status', value: status.enabled ? 'Active' : 'Stopped', color: status.enabled ? p.green : p.red },
            { label: 'Version', value: status.version || 'N/A', color: p.accent },
            { label: 'Active Jails', value: String(status.jails.filter(j => j.status === 'active').length), color: p.accent },
            { label: 'Currently Banned', value: String(totalBanned), color: totalBanned > 0 ? p.red : p.green },
            { label: 'Currently Failed', value: String(totalFailed), color: totalFailed > 0 ? p.amber : p.green },
          ].map((s, i) => (
            <div key={i} style={{
              background: `${s.color}08`, border: `1px solid ${s.color}20`,
              borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: p.textMuted }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status.enabled && status.jails.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionTitle icon={<SecIcon.Jail size={20} color={p.accent} />} title="Active Jails" />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '280px' : '340px'}, 1fr))`, gap: 12 }}>
            {status.jails.map(jail => (
              <div key={jail.name} style={{
                background: p.card, border: `1px solid ${p.cardBorder}`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{jail.name}</span>
                  <Tag color={jail.status === 'active' ? 'green' : 'orange'} style={{ margin: 0 }}>{jail.status}</Tag>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Banned', value: jail.currently_ban, color: jail.currently_ban > 0 ? p.red : p.green },
                    { label: 'Total Banned', value: jail.total_banned, color: p.amber },
                    { label: 'Failed', value: jail.currently_fail, color: jail.currently_fail > 0 ? p.amber : p.green },
                    { label: 'Total Failed', value: jail.total_failed, color: p.textMuted },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: `${s.color}08` }}>
                      <div style={{ fontSize: 10, color: p.textMuted }}>{s.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {jail.ban_time > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>Ban: {formatSeconds(jail.ban_time)}</span>
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>Find: {formatSeconds(jail.find_time)}</span>
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>Max: {jail.max_retry}</span>
                  </div>
                )}
                {jail.banned_ips && jail.banned_ips.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Banned IPs:</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {jail.banned_ips.map(ip => <Tag key={ip} color="red" style={{ fontSize: 11, margin: 0 }}>{ip}</Tag>)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban — Banned IPs Tab
// ---------------------------------------------------------------------------

function F2bBannedIPsTab() {
  const { t } = useTranslation();
  const { p, sectionBox, btnPrimary, btnDanger, btnOutline } = useStyles();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Fail2banStatus | null>(null);
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banning, setBanning] = useState(false);
  const [form] = Form.useForm();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<Fail2banStatus>>('/security/fail2ban');
      setStatus(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleBan = async (values: { jail: string; ip: string }) => {
    setBanning(true);
    try {
      await api.post('/security/fail2ban/ban', values);
      message.success('IP banned');
      setBanModalOpen(false);
      form.resetFields();
      await fetchStatus();
    } catch {
      message.error(t('common.error'));
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (jail: string, ip: string) => {
    try {
      await api.post('/security/fail2ban/unban', { jail, ip });
      message.success('IP unbanned');
      await fetchStatus();
    } catch {
      message.error(t('common.error'));
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  const allBanned: { jail: string; ip: string }[] = [];
  status?.jails.forEach(j => {
    j.banned_ips?.forEach(ip => allBanned.push({ jail: j.name, ip }));
  });
  const jailNames = status?.jails.filter(j => j.status === 'active').map(j => j.name) || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <SectionTitle icon={<SecIcon.Ban size={20} color={p.red} />} title="Banned IPs" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchStatus} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
          <button onClick={() => setBanModalOpen(true)} style={btnPrimary}><PlusOutlined style={{ fontSize: 12 }} /> Ban IP</button>
        </div>
      </div>

      {allBanned.length === 0 ? (
        <div style={sectionBox}><Empty description="No banned IPs" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>
      ) : (
        <div style={{ borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr auto',
            padding: '10px 16px', background: p.colHeaderBg,
            borderBottom: `1px solid ${p.cardBorder}`,
            fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase',
          }}>
            <span>IP Address</span><span>Jail</span><span>Action</span>
          </div>
          {allBanned.map((b, i) => (
            <div key={`${b.jail}-${b.ip}`} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr auto',
              padding: '10px 16px', alignItems: 'center',
              background: i % 2 ? p.rowAlt : p.card,
              borderBottom: `1px solid ${p.cardBorder}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text, fontFamily: 'monospace' }}>{b.ip}</span>
              <span><Tag color="red" style={{ margin: 0 }}>{b.jail}</Tag></span>
              <Popconfirm title={`Unban ${b.ip}?`} onConfirm={() => handleUnban(b.jail, b.ip)}>
                <button style={btnDanger}><DeleteOutlined style={{ fontSize: 11 }} /> Unban</button>
              </Popconfirm>
            </div>
          ))}
        </div>
      )}

      <Modal title="Ban IP Address" open={banModalOpen} onCancel={() => setBanModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleBan}>
          <Form.Item name="jail" label="Jail" rules={[{ required: true }]}>
            <Select placeholder="Select jail">
              {jailNames.map(n => <Select.Option key={n} value={n}>{n}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="ip" label="IP Address" rules={[{ required: true, message: 'Enter IP address' }]}>
            <Input placeholder="e.g. 192.168.1.100" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <button type="submit" disabled={banning} style={{ ...btnPrimary, opacity: banning ? 0.6 : 1 }}>
              {banning ? <Spin size="small" /> : null} Ban IP
            </button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban — Jails Tab
// ---------------------------------------------------------------------------

function F2bJailsTab() {
  const { t } = useTranslation();
  const { p, sectionBox, btnPrimary, btnOutline, btnDanger } = useStyles();
  const [loading, setLoading] = useState(true);
  const [jails, setJails] = useState<JailConfig[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JailConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchJails = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<JailConfig[]>>('/security/fail2ban/jails');
      setJails(data.data || []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchJails(); }, [fetchJails]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true, port: 'ssh', filter: 'sshd', logpath: '/var/log/auth.log', maxretry: 5, bantime: 3600, findtime: 600 });
    setModalOpen(true);
  };

  const openEdit = (j: JailConfig) => {
    setEditing(j);
    form.setFieldsValue(j);
    setModalOpen(true);
  };

  const handleSave = async (values: JailConfig) => {
    setSaving(true);
    try {
      if (editing) values.name = editing.name;
      await api.post('/security/fail2ban/jails', values);
      message.success(t('common.success'));
      setModalOpen(false);
      await fetchJails();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await api.delete(`/security/fail2ban/jails/${name}`);
      message.success('Jail removed');
      await fetchJails();
    } catch {
      message.error(t('common.error'));
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <SectionTitle icon={<SecIcon.Jail size={20} color={p.accent} />} title="Jail Configuration" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchJails} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
          <button onClick={openAdd} style={btnPrimary}><PlusOutlined style={{ fontSize: 12 }} /> Add Jail</button>
        </div>
      </div>

      {jails.length === 0 ? (
        <div style={sectionBox}><Empty description="No jails configured" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {jails.map(jail => (
            <div key={jail.name} style={{
              background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 10, padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{jail.name}</span>
                  <Tag color={jail.enabled ? 'green' : 'default'} style={{ margin: 0 }}>{jail.enabled ? 'Enabled' : 'Disabled'}</Tag>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEdit(jail)} style={{ ...btnOutline, padding: '4px 8px' }}>
                    <SecIcon.Settings size={12} color={p.text} />
                  </button>
                  <Popconfirm title={`Remove ${jail.name}?`} onConfirm={() => handleRemove(jail.name)}>
                    <button style={{ ...btnDanger, padding: '4px 8px' }}><DeleteOutlined style={{ fontSize: 11 }} /></button>
                  </Popconfirm>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { label: 'Port', value: jail.port },
                  { label: 'Filter', value: jail.filter },
                  { label: 'Max Retry', value: String(jail.maxretry || '-') },
                  { label: 'Ban Time', value: jail.bantime ? formatSeconds(jail.bantime) : '-' },
                ].map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: p.textMuted }}>
                    <span style={{ fontWeight: 500 }}>{item.label}:</span>{' '}
                    <span style={{ color: p.text }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: p.textDim, marginTop: 8, fontFamily: 'monospace' }}>{jail.logpath}</div>
            </div>
          ))}
        </div>
      )}

      <Modal title={editing ? `Edit Jail: ${editing.name}` : 'Add Jail'} open={modalOpen}
        onCancel={() => setModalOpen(false)} footer={null} destroyOnClose width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          {!editing && (
            <Form.Item name="name" label="Jail Name" rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>e.g. sshd, apache-auth, nginx-limit-req</span>}>
              <Input placeholder="sshd" />
            </Form.Item>
          )}
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="port" label="Port" rules={[{ required: true }]}><Input placeholder="ssh" /></Form.Item>
            <Form.Item name="filter" label="Filter" rules={[{ required: true }]}><Input placeholder="sshd" /></Form.Item>
          </div>
          <Form.Item name="logpath" label="Log Path" rules={[{ required: true }]}><Input placeholder="/var/log/auth.log" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="maxretry" label="Max Retry"><InputNumber min={1} max={100} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="bantime" label="Ban Time (s)"><InputNumber min={60} max={604800} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="findtime" label="Find Time (s)"><InputNumber min={60} max={86400} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Spin size="small" /> : null} {editing ? 'Update' : 'Create'} Jail
            </button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban — Settings Tab
// ---------------------------------------------------------------------------

function F2bSettingsTab() {
  const { t } = useTranslation();
  const { p, sectionBox, btnPrimary, btnOutline } = useStyles();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [newIP, setNewIP] = useState('');
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<GlobalConfig>>('/security/fail2ban/config');
      setConfig(data.data);
      form.setFieldsValue({ max_retry: data.data.max_retry, ban_time: data.data.ban_time, find_time: data.data.find_time });
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: { max_retry: number; ban_time: number; find_time: number }) => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put('/security/fail2ban/config', { ...values, ignore_ips: config.ignore_ips });
      message.success(t('common.success'));
      await fetchConfig();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const addWhitelistIP = async () => {
    if (!config || !newIP.trim()) return;
    try {
      await api.put('/security/fail2ban/config', {
        max_retry: config.max_retry, ban_time: config.ban_time, find_time: config.find_time,
        ignore_ips: [...config.ignore_ips, newIP.trim()],
      });
      message.success('IP added to whitelist');
      setNewIP('');
      await fetchConfig();
    } catch {
      message.error(t('common.error'));
    }
  };

  const removeWhitelistIP = async (ip: string) => {
    if (!config) return;
    try {
      await api.put('/security/fail2ban/config', {
        max_retry: config.max_retry, ban_time: config.ban_time, find_time: config.find_time,
        ignore_ips: config.ignore_ips.filter(i => i !== ip),
      });
      message.success('IP removed');
      await fetchConfig();
    } catch {
      message.error(t('common.error'));
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={sectionBox}>
        <SectionTitle icon={<SecIcon.Settings size={20} color={p.accent} />} title="Global Defaults" />
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <Form.Item name="max_retry" label={<span style={{ fontWeight: 500 }}>Max Retry</span>} rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>Failures before ban</span>}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="ban_time" label={<span style={{ fontWeight: 500 }}>Ban Time (s)</span>} rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>Ban duration</span>}>
              <InputNumber min={60} max={604800} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="find_time" label={<span style={{ fontWeight: 500 }}>Find Time (s)</span>} rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>Observation window</span>}>
              <InputNumber min={60} max={86400} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item style={{ marginBottom: 0 }}>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Spin size="small" /> : null} Save Defaults
            </button>
          </Form.Item>
        </Form>
      </div>

      <div style={sectionBox}>
        <SectionTitle icon={<SecIcon.Shield size={20} color={p.green} />} title="IP Whitelist (ignoreip)" />
        <p style={{ fontSize: 12, color: p.textMuted, marginBottom: 16 }}>These IPs will never be banned.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="e.g. 192.168.1.0/24"
            onPressEnter={addWhitelistIP} style={{ maxWidth: 300 }} />
          <button onClick={addWhitelistIP} style={btnOutline}><PlusOutlined style={{ fontSize: 12 }} /> Add</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {config?.ignore_ips.map(ip => (
            <Tag key={ip} closable onClose={(e) => { e.preventDefault(); removeWhitelistIP(ip); }}
              style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}>{ip}</Tag>
          ))}
          {(!config?.ignore_ips || config.ignore_ips.length === 0) && (
            <span style={{ fontSize: 12, color: p.textMuted }}>No whitelisted IPs</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban — Log Tab
// ---------------------------------------------------------------------------

function F2bLogTab() {
  const { t } = useTranslation();
  const { p, btnOutline } = useStyles();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [lineCount, setLineCount] = useState(200);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<string[]>>(`/security/fail2ban/log?lines=${lineCount}`);
      setLines(data.data || []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [lineCount, t]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const filtered = useMemo(() => {
    if (!search) return lines;
    const q = search.toLowerCase();
    return lines.filter(l => l.toLowerCase().includes(q));
  }, [lines, search]);

  const stats = useMemo(() => {
    let bans = 0, unbans = 0, found = 0;
    lines.forEach(l => {
      if (l.includes('Ban ')) bans++;
      if (l.includes('Unban ')) unbans++;
      if (l.includes('Found ')) found++;
    });
    return { bans, unbans, found };
  }, [lines]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <SectionTitle icon={<SecIcon.Log size={20} color={p.accent} />} title="Fail2ban Log" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={lineCount} onChange={setLineCount} style={{ width: 100 }} size="small">
            <Select.Option value={100}>100 lines</Select.Option>
            <Select.Option value={200}>200 lines</Select.Option>
            <Select.Option value={500}>500 lines</Select.Option>
            <Select.Option value={1000}>1000 lines</Select.Option>
          </Select>
          <button onClick={fetchLog} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Bans', value: stats.bans, color: p.red },
          { label: 'Unbans', value: stats.unbans, color: p.green },
          { label: 'Found', value: stats.found, color: p.amber },
          { label: 'Total', value: lines.length, color: p.accent },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '4px 12px', borderRadius: 6,
            background: `${s.color}10`, border: `1px solid ${s.color}20`,
            fontSize: 12, color: s.color, fontWeight: 500,
          }}>{s.label}: {s.value}</div>
        ))}
      </div>

      <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ marginBottom: 12 }} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : (
        <div style={{
          background: p.codeBg, borderRadius: 10, border: `1px solid ${p.cardBorder}`,
          maxHeight: 500, overflow: 'auto', fontFamily: 'monospace', fontSize: 11,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: p.textMuted }}>No log entries</div>
          ) : filtered.map((line, i) => {
            let color = p.textDim;
            if (line.includes('Ban ')) color = p.red;
            else if (line.includes('Unban ')) color = p.green;
            else if (line.includes('Found ')) color = p.amber;
            else if (line.includes('WARNING')) color = p.amber;
            else if (line.includes('ERROR')) color = p.red;
            return (
              <div key={i} style={{
                padding: '3px 12px', borderBottom: `1px solid ${p.cardBorder}`,
                color, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{line}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Security Page
// ---------------------------------------------------------------------------

type Section = 'ssh' | 'fail2ban';
type SSHTab = 'config' | 'root' | 'keys' | 'log';
type F2bTab = 'overview' | 'banned' | 'jails' | 'settings' | 'log';

export default function Security() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('ssh');
  const [sshTab, setSSHTab] = useState<SSHTab>('config');
  const [f2bTab, setF2bTab] = useState<F2bTab>('overview');
  const { p, isDark } = usePalette();

  const sshTabs: { key: SSHTab; icon: React.ReactNode; label: string }[] = [
    { key: 'config', icon: <SecIcon.Terminal size={14} color="currentColor" />, label: 'SSH Config' },
    { key: 'root', icon: <SecIcon.User size={14} color="currentColor" />, label: 'Root Account' },
    { key: 'keys', icon: <SecIcon.Key size={14} color="currentColor" />, label: 'SSH Keys' },
    { key: 'log', icon: <SecIcon.Log size={14} color="currentColor" />, label: 'SSH Log' },
  ];

  const f2bTabs: { key: F2bTab; icon: React.ReactNode; label: string }[] = [
    { key: 'overview', icon: <SecIcon.Shield size={14} color="currentColor" />, label: 'Overview' },
    { key: 'banned', icon: <SecIcon.Ban size={14} color="currentColor" />, label: 'Banned IPs' },
    { key: 'jails', icon: <SecIcon.Jail size={14} color="currentColor" />, label: 'Jails' },
    { key: 'settings', icon: <SecIcon.Settings size={14} color="currentColor" />, label: 'Settings' },
    { key: 'log', icon: <SecIcon.Log size={14} color="currentColor" />, label: 'Log' },
  ];

  const tabs = section === 'ssh' ? sshTabs : f2bTabs;
  const activeTab = section === 'ssh' ? sshTab : f2bTab;
  const setActiveTab = section === 'ssh'
    ? (k: string) => setSSHTab(k as SSHTab)
    : (k: string) => setF2bTab(k as F2bTab);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SecIcon.Shield size={22} color={p.accent} />
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>
            {t('menu.security', 'Security')}
          </span>
        </div>

        {/* Section switcher */}
        <div style={{
          display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${p.cardBorder}`,
        }}>
          {[
            { key: 'ssh' as Section, icon: <SecIcon.Terminal size={13} color="currentColor" />, label: 'SSH' },
            { key: 'fail2ban' as Section, icon: <SecIcon.Ban size={13} color="currentColor" />, label: 'Fail2ban' },
          ].map(s => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              padding: '5px 16px', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: section === s.key ? p.accent : 'transparent',
              color: section === s.key ? '#fff' : p.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              borderRight: s.key === 'ssh' ? `1px solid ${p.cardBorder}` : 'none',
            }}>{s.icon} {s.label}</button>
          ))}
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, flexWrap: 'wrap',
      }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {section === 'ssh' && sshTab === 'config' && <SSHConfigTab />}
        {section === 'ssh' && sshTab === 'root' && <RootAccountTab />}
        {section === 'ssh' && sshTab === 'keys' && <SSHKeysTab />}
        {section === 'ssh' && sshTab === 'log' && <SSHLogTab />}
        {section === 'fail2ban' && f2bTab === 'overview' && <F2bOverviewTab />}
        {section === 'fail2ban' && f2bTab === 'banned' && <F2bBannedIPsTab />}
        {section === 'fail2ban' && f2bTab === 'jails' && <F2bJailsTab />}
        {section === 'fail2ban' && f2bTab === 'settings' && <F2bSettingsTab />}
        {section === 'fail2ban' && f2bTab === 'log' && <F2bLogTab />}
      </div>
    </div>
  );
}
