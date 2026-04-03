import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, InputNumber, Switch, Spin, message, Modal, Input, Select, Popconfirm, Tag, Tooltip, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/services/api';

type ApiResponse<T> = { data: T };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Icons
// ---------------------------------------------------------------------------

const F2bIcon = {
  Shield: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Ban: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  Settings: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  Log: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Jail: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="16" y1="3" x2="16" y2="21" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

function useStyles() {
  const { p } = usePalette();
  const isMobile = useIsMobile();
  return {
    p,
    isMobile,
    sectionBox: {
      background: p.card,
      borderRadius: 10,
      border: `1px solid ${p.cardBorder}`,
      padding: isMobile ? 16 : 28,
      maxWidth: 800,
    } as React.CSSProperties,
    btnPrimary: {
      padding: '7px 20px',
      borderRadius: 7,
      border: 'none',
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 500,
      background: p.accent,
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    } as React.CSSProperties,
    btnOutline: {
      padding: '7px 16px',
      borderRadius: 7,
      border: `1px solid ${p.cardBorder}`,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 500,
      background: 'transparent',
      color: p.text,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    } as React.CSSProperties,
    btnDanger: {
      padding: '7px 16px',
      borderRadius: 7,
      border: `1px solid ${p.red}30`,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 500,
      background: `${p.red}10`,
      color: p.red,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    } as React.CSSProperties,
  };
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  const { p } = usePalette();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      {icon}
      <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>{title}</span>
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
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
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
        <SectionTitle icon={<F2bIcon.Shield size={20} color={p.amber} />} title="Fail2ban Not Installed" />
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
      {/* Service Status Card */}
      <div style={sectionBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <SectionTitle icon={<F2bIcon.Shield size={20} color={p.accent} />} title="Service Status" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchStatus} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
            <button onClick={toggleService} disabled={toggling}
              style={{ ...btnPrimary, background: status.enabled ? p.red : p.green, opacity: toggling ? 0.6 : 1 }}>
              {toggling ? <Spin size="small" /> : null}
              {status.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: 12, marginBottom: 4 }}>
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

      {/* Jails */}
      {status.enabled && status.jails.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionTitle icon={<F2bIcon.Jail size={20} color={p.accent} />} title="Active Jails" />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '280px' : '340px'}, 1fr))`, gap: 12 }}>
            {status.jails.map(jail => (
              <div key={jail.name} style={{
                background: p.card, border: `1px solid ${p.cardBorder}`,
                borderRadius: 10, padding: 16, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{jail.name}</span>
                  <Tag color={jail.status === 'active' ? 'green' : 'orange'} style={{ margin: 0 }}>
                    {jail.status}
                  </Tag>
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
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>
                      Ban: {formatSeconds(jail.ban_time)}
                    </span>
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>
                      Find: {formatSeconds(jail.find_time)}
                    </span>
                    <span style={{ fontSize: 11, color: p.textMuted, background: p.codeBg, padding: '2px 8px', borderRadius: 4 }}>
                      Max: {jail.max_retry}
                    </span>
                  </div>
                )}
                {jail.banned_ips && jail.banned_ips.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Banned IPs:</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {jail.banned_ips.map(ip => (
                        <Tag key={ip} color="red" style={{ fontSize: 11, margin: 0 }}>{ip}</Tag>
                      ))}
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
// Banned IPs Tab
// ---------------------------------------------------------------------------

function BannedIPsTab() {
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
      message.success('IP banned successfully');
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
      message.success('IP unbanned successfully');
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
        <SectionTitle icon={<F2bIcon.Ban size={20} color={p.red} />} title="Banned IPs" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchStatus} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
          <button onClick={() => setBanModalOpen(true)} style={btnPrimary}>
            <PlusOutlined style={{ fontSize: 12 }} /> Ban IP
          </button>
        </div>
      </div>

      {allBanned.length === 0 ? (
        <div style={sectionBox}>
          <Empty description="No banned IPs" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div style={{
          borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden',
        }}>
          {/* Header */}
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

      <Modal title="Ban IP Address" open={banModalOpen} onCancel={() => setBanModalOpen(false)}
        footer={null} destroyOnClose>
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
// Jails Tab
// ---------------------------------------------------------------------------

function JailsTab() {
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
        <SectionTitle icon={<F2bIcon.Jail size={20} color={p.accent} />} title="Jail Configuration" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchJails} style={btnOutline}><ReloadOutlined style={{ fontSize: 12 }} /> Refresh</button>
          <button onClick={openAdd} style={btnPrimary}><PlusOutlined style={{ fontSize: 12 }} /> Add Jail</button>
        </div>
      </div>

      {jails.length === 0 ? (
        <div style={sectionBox}>
          <Empty description="No jails configured" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {jails.map(jail => (
            <div key={jail.name} style={{
              background: p.card, border: `1px solid ${p.cardBorder}`,
              borderRadius: 10, padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{jail.name}</span>
                  <Tag color={jail.enabled ? 'green' : 'default'} style={{ margin: 0 }}>
                    {jail.enabled ? 'Enabled' : 'Disabled'}
                  </Tag>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Tooltip title="Edit">
                    <button onClick={() => openEdit(jail)} style={{ ...btnOutline, padding: '4px 8px' }}>
                      <F2bIcon.Settings size={12} color={p.text} />
                    </button>
                  </Tooltip>
                  <Popconfirm title={`Remove ${jail.name}?`} onConfirm={() => handleRemove(jail.name)}>
                    <button style={{ ...btnDanger, padding: '4px 8px' }}>
                      <DeleteOutlined style={{ fontSize: 11 }} />
                    </button>
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
              <div style={{ fontSize: 11, color: p.textDim, marginTop: 8, fontFamily: 'monospace' }}>
                {jail.logpath}
              </div>
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
            <Form.Item name="port" label="Port" rules={[{ required: true }]}>
              <Input placeholder="ssh" />
            </Form.Item>
            <Form.Item name="filter" label="Filter" rules={[{ required: true }]}>
              <Input placeholder="sshd" />
            </Form.Item>
          </div>
          <Form.Item name="logpath" label="Log Path" rules={[{ required: true }]}>
            <Input placeholder="/var/log/auth.log" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="maxretry" label="Max Retry">
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="bantime" label="Ban Time (s)">
              <InputNumber min={60} max={604800} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="findtime" label="Find Time (s)">
              <InputNumber min={60} max={86400} style={{ width: '100%' }} />
            </Form.Item>
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
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab() {
  const { t } = useTranslation();
  const { p, sectionBox, btnPrimary, btnOutline, btnDanger } = useStyles();
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
      form.setFieldsValue({
        max_retry: data.data.max_retry,
        ban_time: data.data.ban_time,
        find_time: data.data.find_time,
      });
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
      await api.put('/security/fail2ban/config', {
        ...values,
        ignore_ips: config.ignore_ips,
      });
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
    const updated = [...config.ignore_ips, newIP.trim()];
    try {
      await api.put('/security/fail2ban/config', {
        max_retry: config.max_retry,
        ban_time: config.ban_time,
        find_time: config.find_time,
        ignore_ips: updated,
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
    const updated = config.ignore_ips.filter(i => i !== ip);
    try {
      await api.put('/security/fail2ban/config', {
        max_retry: config.max_retry,
        ban_time: config.ban_time,
        find_time: config.find_time,
        ignore_ips: updated,
      });
      message.success('IP removed from whitelist');
      await fetchConfig();
    } catch {
      message.error(t('common.error'));
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Global Defaults */}
      <div style={sectionBox}>
        <SectionTitle icon={<F2bIcon.Settings size={20} color={p.accent} />} title="Global Defaults" />
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <Form.Item name="max_retry" label={<span style={{ fontWeight: 500 }}>Max Retry</span>} rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>Failures before ban</span>}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="ban_time" label={<span style={{ fontWeight: 500 }}>Ban Time (s)</span>} rules={[{ required: true }]}
              extra={<span style={{ fontSize: 11, color: p.textMuted }}>Ban duration in seconds</span>}>
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

      {/* Whitelist */}
      <div style={sectionBox}>
        <SectionTitle icon={<F2bIcon.Shield size={20} color={p.green} />} title="IP Whitelist (ignoreip)" />
        <p style={{ fontSize: 12, color: p.textMuted, marginBottom: 16 }}>
          These IPs will never be banned by Fail2ban.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="e.g. 192.168.1.0/24"
            onPressEnter={addWhitelistIP} style={{ maxWidth: 300 }} />
          <button onClick={addWhitelistIP} style={btnOutline}>
            <PlusOutlined style={{ fontSize: 12 }} /> Add
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {config?.ignore_ips.map(ip => (
            <Tag key={ip} closable onClose={(e) => { e.preventDefault(); removeWhitelistIP(ip); }}
              style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}>
              {ip}
            </Tag>
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
// Log Tab
// ---------------------------------------------------------------------------

function LogTab() {
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

  // Stats
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
        <SectionTitle icon={<F2bIcon.Log size={20} color={p.accent} />} title="Fail2ban Log" />
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

      {/* Stats */}
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
          }}>
            {s.label}: {s.value}
          </div>
        ))}
      </div>

      {/* Search */}
      <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)}
        allowClear style={{ marginBottom: 12 }} />

      {/* Log viewer */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : (
        <div style={{
          background: p.codeBg, borderRadius: 10, border: `1px solid ${p.cardBorder}`,
          maxHeight: 540, overflow: 'auto', fontFamily: 'monospace', fontSize: 11,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: p.textMuted }}>No log entries</div>
          ) : (
            filtered.map((line, i) => {
              let color = p.textDim;
              if (line.includes('Ban ')) color = p.red;
              else if (line.includes('Unban ')) color = p.green;
              else if (line.includes('Found ')) color = p.amber;
              else if (line.includes('WARNING')) color = p.amber;
              else if (line.includes('ERROR')) color = p.red;

              return (
                <div key={i} style={{
                  padding: '3px 12px',
                  borderBottom: `1px solid ${p.cardBorder}`,
                  color,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {line}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Fail2ban Page
// ---------------------------------------------------------------------------

type TabKey = 'overview' | 'banned' | 'jails' | 'settings' | 'log';

export default function Fail2ban() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const { p, isDark } = usePalette();

  const tabs: { key: TabKey; icon: React.ReactNode; label: string }[] = [
    { key: 'overview', icon: <F2bIcon.Shield size={14} color="currentColor" />, label: 'Overview' },
    { key: 'banned', icon: <F2bIcon.Ban size={14} color="currentColor" />, label: 'Banned IPs' },
    { key: 'jails', icon: <F2bIcon.Jail size={14} color="currentColor" />, label: 'Jails' },
    { key: 'settings', icon: <F2bIcon.Settings size={14} color="currentColor" />, label: 'Settings' },
    { key: 'log', icon: <F2bIcon.Log size={14} color="currentColor" />, label: 'Log' },
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <F2bIcon.Ban size={22} color={p.accent} />
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>
            Fail2ban
          </span>
        </div>
      </div>

      {/* Tab bar */}
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
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'banned' && <BannedIPsTab />}
        {activeTab === 'jails' && <JailsTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'log' && <LogTab />}
      </div>
    </div>
  );
}
