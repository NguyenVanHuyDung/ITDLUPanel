import React, { useState, useEffect, useCallback } from 'react';
import {
  Form, Input, InputNumber, Select, Switch, Modal,
  Spin, message,
} from 'antd';
import {
  MailOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
  EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExperimentOutlined, BellOutlined, ReloadOutlined,
  FormOutlined, EyeOutlined, UndoOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useThemeStore } from '@/stores/theme';
import { useNotificationStore } from '@/stores/notification';
import type { NotificationChannel } from '@/stores/notification';

const { TextArea } = Input;

/* ------------------------------------------------------------------ */
/*  Event type labels, categories & severity colors                    */
/* ------------------------------------------------------------------ */

const EVENT_LABELS: Record<string, { label: string; color: string; emoji: string; desc: string }> = {
  cron_success:            { label: 'Cron Success',            color: 'green',   emoji: '✅', desc: 'Scheduled task completed' },
  cron_failed:             { label: 'Cron Failed',             color: 'red',     emoji: '❌', desc: 'Scheduled task failed' },
  ssl_expiry_warning:      { label: 'SSL Expiry Warning',      color: 'orange',  emoji: '⚠️', desc: 'Certificate expiring soon' },
  ssl_expired:             { label: 'SSL Expired',             color: 'red',     emoji: '🔴', desc: 'Certificate has expired' },
  backup_completed:        { label: 'Backup Completed',        color: 'green',   emoji: '✅', desc: 'Backup finished successfully' },
  backup_failed:           { label: 'Backup Failed',           color: 'red',     emoji: '❌', desc: 'Backup operation failed' },
  software_installed:      { label: 'Software Installed',      color: 'green',   emoji: '📦', desc: 'Package installed successfully' },
  software_install_failed: { label: 'Software Install Failed', color: 'red',     emoji: '❌', desc: 'Package installation failed' },
  site_created:            { label: 'Site Created',            color: 'blue',    emoji: '🌐', desc: 'New website created' },
  site_deleted:            { label: 'Site Deleted',            color: 'orange',  emoji: '🗑️', desc: 'Website removed' },
  cpu_high:                { label: 'CPU High',                color: 'orange',  emoji: '🔥', desc: 'CPU threshold exceeded' },
  memory_high:             { label: 'Memory High',             color: 'orange',  emoji: '💾', desc: 'Memory usage critical' },
  disk_high:               { label: 'Disk High',               color: 'red',     emoji: '💿', desc: 'Disk space running low' },
  service_down:            { label: 'Service Down',            color: 'red',     emoji: '🔻', desc: 'Service stopped responding' },
  login_failed:            { label: 'Login Failed',            color: 'orange',  emoji: '🔒', desc: 'Failed login attempt' },
};

const eventLabel = (t: string) => EVENT_LABELS[t] ?? { label: t, color: 'default', emoji: '🔔', desc: '' };

interface EventCategory {
  key: string;
  label: string;
  icon: string;
  events: string[];
}

const EVENT_CATEGORIES: EventCategory[] = [
  { key: 'cron',     label: 'Scheduled Tasks',    icon: '🕐', events: ['cron_success', 'cron_failed'] },
  { key: 'ssl',      label: 'SSL Certificates',   icon: '🔐', events: ['ssl_expiry_warning', 'ssl_expired'] },
  { key: 'backup',   label: 'Backups',             icon: '💾', events: ['backup_completed', 'backup_failed'] },
  { key: 'software', label: 'Software',            icon: '📦', events: ['software_installed', 'software_install_failed'] },
  { key: 'sites',    label: 'Websites',            icon: '🌐', events: ['site_created', 'site_deleted'] },
  { key: 'system',   label: 'System Resources',    icon: '📊', events: ['cpu_high', 'memory_high', 'disk_high'] },
  { key: 'security', label: 'Security',            icon: '🛡️', events: ['service_down', 'login_failed'] },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NotificationsTab() {
  const { t } = useTranslation();
  const p = usePalette();
  const isMobile = useIsMobile();
  const isDark = useThemeStore((s) => s.mode) === 'dark';

  const {
    channels, rules, logs, eventTypes, criticalTypes, loading,
    fetchChannels, fetchRules, fetchLogs, fetchEventTypes, fetchCriticalTypes,
    createChannel, updateChannel, deleteChannel, testChannel, testEvent,
    updateRules, clearLogs,
    getRuleTemplate, saveRuleTemplate, previewTemplate,
  } = useNotificationStore();

  const [channelModal, setChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [form] = Form.useForm();
  const [channelType, setChannelType] = useState<'email' | 'telegram'>('email');
  const [testing, setTesting] = useState<number | null>(null);
  const [testingEvent, setTestingEvent] = useState<string | null>(null);
  const [section, setSection] = useState<'channels' | 'rules' | 'logs'>('channels');
  const [activeRuleChannel, setActiveRuleChannel] = useState<number | null>(null); // kept for potential future use
  const [logPage, setLogPage] = useState(1);

  // Template editor state
  const [tplModal, setTplModal] = useState(false);
  const [tplChannelId, setTplChannelId] = useState<number>(0);
  const [tplEventType, setTplEventType] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplDefaultSubject, setTplDefaultSubject] = useState('');
  const [tplDefaultBody, setTplDefaultBody] = useState('');
  const [tplVariables, setTplVariables] = useState('');
  const [tplPreview, setTplPreview] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplPreviewing, setTplPreviewing] = useState(false);

  const parseConfig = (cfg: string): Record<string, string> => {
    try { return JSON.parse(cfg); } catch { return {}; }
  };

  const reload = useCallback(async () => {
    await Promise.all([fetchChannels(), fetchRules(), fetchEventTypes(), fetchCriticalTypes(), fetchLogs()]);
  }, [fetchChannels, fetchRules, fetchEventTypes, fetchCriticalTypes, fetchLogs]);

  useEffect(() => { reload(); }, [reload]);

  /* ---------- Styles ---------- */
  const sectionBox: React.CSSProperties = {
    maxWidth: 'none', borderRadius: 10,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 16 : 28,
    marginBottom: 16,
  };

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
    transition: 'all 0.15s',
  };

  const sevColor = (color: string): string => {
    const map: Record<string, string> = { green: p.green, red: p.red, orange: p.amber, blue: p.accent, default: p.textMuted };
    return map[color] ?? p.textMuted;
  };

  const sectionTitle = (icon: React.ReactNode, title: string, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.accent }}>{icon}</div>
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>{title}</span>
      </div>
      {extra}
    </div>
  );

  /* ---------- Channel CRUD ---------- */
  const handleSaveChannel = async (values: Record<string, unknown>) => {
    try {
      const config: Record<string, string> = {};
      if (values.type === 'email') {
        for (const k of ['host', 'port', 'username', 'password', 'from', 'to', 'encryption']) {
          if (values[k] !== undefined && values[k] !== '') config[k] = String(values[k]);
        }
      } else {
        for (const k of ['bot_token', 'chat_id']) {
          if (values[k] !== undefined && values[k] !== '') config[k] = String(values[k]);
        }
      }
      const payload = {
        type: values.type,
        name: values.name,
        config,
        is_enabled: values.is_enabled ?? true,
      };
      if (editingChannel) {
        await updateChannel(editingChannel.id, payload);
        message.success('Channel updated');
      } else {
        await createChannel(payload);
        message.success('Channel created');
      }
      setChannelModal(false);
      setEditingChannel(null);
      form.resetFields();
      await fetchChannels();
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosErr = e as any;
      const errMsg = axiosErr?.response?.data?.error || axiosErr?.message || 'Failed';
      message.error(errMsg, 6);
    }
  };

  const handleTestChannel = async (id: number) => {
    setTesting(id);
    try {
      const msg = await testChannel(id);
      message.success(msg);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosErr = e as any;
      const errMsg = axiosErr?.response?.data?.error || axiosErr?.message || 'Test failed';
      message.error(errMsg, 6);
    } finally {
      setTesting(null);
    }
  };

  const handleTestEvent = async (channelId: number, eventType: string) => {
    const key = `${channelId}-${eventType}`;
    setTestingEvent(key);
    try {
      const msg = await testEvent(channelId, eventType);
      message.success(msg);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosErr = e as any;
      const errMsg = axiosErr?.response?.data?.error || axiosErr?.message || 'Test failed';
      message.error(errMsg, 6);
    } finally {
      setTestingEvent(null);
    }
  };

  /* ---------- Template Editor ---------- */
  const openTemplateEditor = async (channelId: number, eventType: string) => {
    setTplChannelId(channelId);
    setTplEventType(eventType);
    setTplPreview('');
    try {
      const data = await getRuleTemplate(channelId, eventType);
      setTplSubject(data.custom_subject || '');
      setTplBody(data.custom_body || '');
      setTplDefaultSubject(data.default_subject || '');
      setTplDefaultBody(data.default_body || '');
      setTplVariables(data.variables || '');
      setTplModal(true);
    } catch {
      message.error('Failed to load template');
    }
  };

  const handleSaveTemplate = async () => {
    setTplSaving(true);
    try {
      await saveRuleTemplate(tplChannelId, tplEventType, tplSubject, tplBody);
      message.success('Template saved');
      setTplModal(false);
      await fetchRules();
    } catch {
      message.error('Failed to save template');
    } finally {
      setTplSaving(false);
    }
  };

  const handlePreviewTemplate = async (tpl: string) => {
    setTplPreviewing(true);
    try {
      const result = await previewTemplate(tpl, tplEventType);
      setTplPreview(result);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosErr = e as any;
      const errMsg = axiosErr?.response?.data?.error || axiosErr?.message || 'Preview failed';
      message.error(errMsg, 4);
      setTplPreview('');
    } finally {
      setTplPreviewing(false);
    }
  };

  const handleResetTemplate = () => {
    setTplSubject('');
    setTplBody('');
    setTplPreview('');
  };

  const hasCustomTemplate = (channelId: number, eventType: string) => {
    const rule = rules.find((r) => r.channel_id === channelId && r.event_type === eventType);
    return !!(rule?.custom_subject || rule?.custom_body);
  };

  const handleDeleteChannel = async (id: number) => {
    try {
      await deleteChannel(id);
      message.success('Channel deleted');
      await fetchChannels();
    } catch {
      message.error('Failed to delete channel');
    }
  };

  const openEditChannel = (ch: NotificationChannel) => {
    setEditingChannel(ch);
    setChannelType(ch.type);
    const cfg = parseConfig(ch.config);
    form.setFieldsValue({
      type: ch.type,
      name: ch.name,
      is_enabled: ch.is_enabled,
      ...cfg,
    });
    setChannelModal(true);
  };

  const openNewChannel = () => {
    setEditingChannel(null);
    setChannelType('email');
    form.resetFields();
    form.setFieldsValue({ type: 'email', is_enabled: true, port: 587, encryption: 'starttls' });
    setChannelModal(true);
  };

  /* ---------- Rules toggle ---------- */
  const handleRuleToggle = async (channelId: number, eventType: string, enabled: boolean) => {
    const existing = rules.find((r) => r.channel_id === channelId && r.event_type === eventType);
    const updated = existing
      ? rules.map((r) =>
          r.channel_id === channelId && r.event_type === eventType
            ? { ...r, is_enabled: enabled }
            : r
        )
      : [...rules, { id: 0, channel_id: channelId, event_type: eventType, is_enabled: enabled }];

    try {
      await updateRules(
        updated.map((r) => ({
          channel_id: r.channel_id,
          event_type: r.event_type,
          is_enabled: r.is_enabled,
        }))
      );
      await fetchRules();
    } catch {
      message.error('Failed to update rule');
    }
  };

  const isRuleEnabled = (channelId: number, eventType: string) => {
    const rule = rules.find((r) => r.channel_id === channelId && r.event_type === eventType);
    return rule?.is_enabled ?? false;
  };

  /* ---------- Nav buttons ---------- */
  const navBtn = (key: typeof section, icon: React.ReactNode, label: string, count?: number) => (
    <button
      onClick={() => setSection(key)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: section === key ? `1.5px solid ${p.accent}` : `1px solid ${p.cardBorder}`,
        background: section === key ? `${p.accent}14` : 'transparent',
        color: section === key ? p.accent : p.textMuted,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
          background: section === key ? `${p.accent}25` : `${p.textMuted}18`,
          color: section === key ? p.accent : p.textMuted,
        }}>{count}</span>
      )}
    </button>
  );

  /* ================================================================ */
  /*  RENDER: Channels — modern card design                            */
  /* ================================================================ */
  const renderChannels = () => {
    const emailIcon = (
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${p.accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MailOutlined style={{ fontSize: 22, color: p.accent }} />
      </div>
    );
    const telegramIcon = (
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${p.accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <SendOutlined style={{ fontSize: 22, color: p.accent }} />
      </div>
    );

    return (
      <div style={sectionBox}>
        {sectionTitle(
          <BellOutlined />,
          'Notification Channels',
          <button style={btnPrimary} onClick={openNewChannel}>
            <PlusOutlined /> Add Channel
          </button>
        )}

        {channels.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            borderRadius: 12, border: `2px dashed ${p.cardBorder}`,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          }}>
            <BellOutlined style={{ fontSize: 40, color: p.textDim, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: p.text, marginBottom: 4 }}>No channels configured</div>
            <div style={{ fontSize: 13, color: p.textMuted, marginBottom: 16 }}>Add an Email or Telegram channel to start receiving notifications</div>
            <button style={btnPrimary} onClick={openNewChannel}>
              <PlusOutlined /> Add Your First Channel
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
            {channels.map((ch) => {
              const cfg = parseConfig(ch.config);
              const isEmail = ch.type === 'email';
              return (
                <div key={ch.id} style={{
                  borderRadius: 10, overflow: 'hidden',
                  background: isDark ? p.rowAlt : p.headerBg,
                  border: `1px solid ${p.cardBorder}`,
                  borderLeft: ch.is_enabled ? `3px solid ${p.accent}` : `1px solid ${p.cardBorder}`,
                  transition: 'all 0.2s',
                }}>

                  <div style={{ padding: '16px 18px' }}>
                    {/* Header: icon + name + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      {isEmail ? emailIcon : telegramIcon}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: p.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                            padding: '2px 8px', borderRadius: 6,
                            background: ch.is_enabled ? `${p.green}18` : `${p.textMuted}15`,
                            color: ch.is_enabled ? p.green : p.textMuted,
                          }}>{ch.is_enabled ? 'Active' : 'Disabled'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>
                          {isEmail ? '📧 Email (SMTP)' : '📨 Telegram Bot'}
                        </div>
                      </div>
                    </div>

                    {/* Connection details */}
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${p.cardBorder}`,
                    }}>
                      {isEmail ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Server</span>
                            <div style={{ color: p.text, fontFamily: 'monospace', fontSize: 12 }}>{cfg.host || '—'}:{cfg.port || '—'}</div>
                          </div>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Encryption</span>
                            <div style={{ color: p.text }}>{(cfg.encryption || 'starttls').toUpperCase()}</div>
                          </div>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>From</span>
                            <div style={{ color: p.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.from || cfg.username || '—'}</div>
                          </div>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>To</span>
                            <div style={{ color: p.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.to || '—'}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Bot Token</span>
                            <div style={{ color: p.text, fontFamily: 'monospace', fontSize: 12 }}>••••{(cfg.bot_token || '').slice(-6)}</div>
                          </div>
                          <div>
                            <span style={{ color: p.textDim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Chat ID</span>
                            <div style={{ color: p.text, fontFamily: 'monospace', fontSize: 12 }}>{cfg.chat_id || '—'}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        title="Send test notification"
                        style={btnOutline}
                        onClick={() => handleTestChannel(ch.id)}
                        disabled={testing === ch.id}
                      >
                        <ExperimentOutlined /> {testing === ch.id ? 'Testing…' : 'Test'}
                      </button>
                      <button title="Edit channel settings" style={btnOutline} onClick={() => openEditChannel(ch)}>
                        <EditOutlined /> Edit
                      </button>
                      <button
                        title="Delete this channel and all its rules"
                        style={btnDanger}
                        onClick={() => { if (window.confirm('Delete this channel? All rules for this channel will also be removed.')) handleDeleteChannel(ch.id); }}
                      >
                        <DeleteOutlined /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* ---- Channel Modal ---- */}
      <Modal
        open={channelModal}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingChannel ? <EditOutlined style={{ color: p.accent }} /> : <PlusOutlined style={{ color: p.accent }} />}
            <span>{editingChannel ? 'Edit Channel' : 'New Notification Channel'}</span>
          </div>
        }
        onCancel={() => { setChannelModal(false); setEditingChannel(null); }}
        footer={null}
        destroyOnClose
        width={480}
        styles={{ content: { background: isDark ? p.card : '#fff' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveChannel}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="My Email / My Telegram" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select
              onChange={(v: 'email' | 'telegram') => setChannelType(v)}
              options={[
                { value: 'email', label: '📧 Email (SMTP)' },
                { value: 'telegram', label: '📨 Telegram Bot' },
              ]}
            />
          </Form.Item>
          <Form.Item name="is_enabled" label="Enabled" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>

          {channelType === 'email' && (
            <>
              <Form.Item name="host" label="SMTP Host" rules={[{ required: true }]}>
                <Input placeholder="smtp.gmail.com" />
              </Form.Item>
              <Form.Item name="port" label="SMTP Port" rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="encryption" label="Encryption">
                <Select
                  options={[
                    { value: 'starttls', label: 'STARTTLS (587)' },
                    { value: 'ssl', label: 'SSL/TLS (465)' },
                    { value: 'none', label: 'None (25)' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                <Input placeholder="user@example.com" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password placeholder="App password" />
              </Form.Item>
              <Form.Item name="from" label="From Address">
                <Input placeholder="noreply@example.com (defaults to username)" />
              </Form.Item>
              <Form.Item name="to" label="To Address" rules={[{ required: true }]}>
                <Input placeholder="admin@example.com" />
              </Form.Item>
            </>
          )}

          {channelType === 'telegram' && (
            <>
              <Form.Item name="bot_token" label="Bot Token" rules={[{ required: true }]}
                extra="Get from @BotFather on Telegram"
              >
                <Input.Password placeholder="123456:ABC-DEF..." />
              </Form.Item>
              <Form.Item name="chat_id" label="Chat ID" rules={[{ required: true }]}
                extra="Send /start to your bot, then get chat ID from @userinfobot"
              >
                <Input placeholder="-1001234567890" />
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnOutline} type="button" onClick={() => { setChannelModal(false); setEditingChannel(null); }}>
                Cancel
              </button>
              <button style={btnPrimary} type="submit">
                {editingChannel ? 'Update' : 'Create'}
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
    );
  };

  /* ================================================================ */
  /*  RENDER: Rules — matrix view (events × channels)                  */
  /* ================================================================ */
  const renderRules = () => {
    const activeChannels = channels.filter((c) => c.is_enabled);

    // Severity dot color
    const sevDot = (ev: string): string => {
      const sev = eventTypes.find((e) => e.type === ev)?.severity;
      const map: Record<string, string> = { info: p.accent, success: p.green, warning: p.amber, error: p.red, critical: p.red };
      return map[sev ?? ''] ?? p.textMuted;
    };

    // Summary per channel
    const channelEnabledCount = (chId: number) =>
      rules.filter((r) => r.channel_id === chId && r.is_enabled).length;

    // Batch toggle: enable/disable all events for a channel
    const toggleAllForChannel = async (chId: number, enable: boolean) => {
      const allEvents = EVENT_CATEGORIES.flatMap((cat) => cat.events);
      const batch = allEvents.map((ev) => ({
        channel_id: chId,
        event_type: ev,
        is_enabled: enable,
      }));
      // Preserve rules for other channels
      const otherRules = rules
        .filter((r) => r.channel_id !== chId)
        .map((r) => ({ channel_id: r.channel_id, event_type: r.event_type, is_enabled: r.is_enabled }));
      try {
        await updateRules([...otherRules, ...batch]);
        await fetchRules();
        message.success(enable ? 'All enabled' : 'All disabled');
      } catch { message.error('Failed'); }
    };

    // Batch toggle: enable/disable all channels for an event
    const toggleAllForEvent = async (ev: string, enable: boolean) => {
      const batch = activeChannels.map((ch) => ({
        channel_id: ch.id,
        event_type: ev,
        is_enabled: enable,
      }));
      const otherRules = rules
        .filter((r) => !activeChannels.some((ch) => ch.id === r.channel_id) || r.event_type !== ev)
        .map((r) => ({ channel_id: r.channel_id, event_type: r.event_type, is_enabled: r.is_enabled }));
      try {
        await updateRules([...otherRules, ...batch]);
        await fetchRules();
      } catch { message.error('Failed'); }
    };

    // Check if all channels are enabled for an event
    const allChannelsEnabled = (ev: string) =>
      activeChannels.length > 0 && activeChannels.every((ch) => isRuleEnabled(ch.id, ev));

    const colWidth = activeChannels.length <= 2 ? 100 : 80;

    return (
      <div style={sectionBox}>
        {sectionTitle(<BellOutlined style={{ color: p.accent }} />, 'Event Rules')}

        {activeChannels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: p.textMuted, fontSize: 13 }}>
            Create and enable a channel first
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* ---- Matrix table ---- */}
            <table style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: 13,
            }}>
              {/* Header: channel columns */}
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left', padding: '10px 12px',
                    borderBottom: `2px solid ${p.cardBorder}`,
                    color: p.textMuted, fontSize: 12, fontWeight: 600,
                    position: 'sticky', left: 0, zIndex: 2,
                    background: isDark ? p.card : '#fff',
                    minWidth: isMobile ? 140 : 200,
                  }}>
                    Event
                  </th>
                  {activeChannels.map((ch) => (
                    <th key={ch.id} style={{
                      textAlign: 'center', padding: '8px 6px',
                      borderBottom: `2px solid ${p.cardBorder}`,
                      minWidth: colWidth,
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 18 }}>{ch.type === 'email' ? '📧' : '📨'}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: p.text,
                          maxWidth: colWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {ch.name}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          padding: '1px 6px', borderRadius: 8,
                          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          color: channelEnabledCount(ch.id) > 0 ? p.green : p.textMuted,
                        }}>
                          {channelEnabledCount(ch.id)}/{EVENT_CATEGORIES.flatMap((c) => c.events).length}
                        </span>
                        {/* Column toggle all */}
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            title="Enable all"
                            onClick={() => toggleAllForChannel(ch.id, true)}
                            style={{ fontSize: 10, padding: '0 4px', height: 20, color: p.green, background: 'transparent', border: 'none', cursor: 'pointer' }}
                          >All</button>
                          <button
                            title="Disable all"
                            onClick={() => toggleAllForChannel(ch.id, false)}
                            style={{ fontSize: 10, padding: '0 4px', height: 20, color: p.textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                          >None</button>
                        </div>
                      </div>
                    </th>
                  ))}
                  {/* "All" column header */}
                  {activeChannels.length > 1 && (
                    <th style={{
                      textAlign: 'center', padding: '8px 6px',
                      borderBottom: `2px solid ${p.cardBorder}`,
                      minWidth: 60,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted }}>All</div>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {EVENT_CATEGORIES.map((cat) => (
                  <React.Fragment key={cat.key}>
                    {/* Category header row */}
                    <tr>
                      <td
                        colSpan={activeChannels.length + (activeChannels.length > 1 ? 2 : 1)}
                        style={{
                          padding: '10px 12px 6px',
                          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                          borderTop: `1px solid ${p.cardBorder}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15 }}>{cat.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: p.text }}>{cat.label}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Event rows */}
                    {cat.events.map((ev) => {
                      const info = eventLabel(ev);
                      const isCritical = criticalTypes.includes(ev);
                      const anyEnabled = activeChannels.some((ch) => isRuleEnabled(ch.id, ev));

                      return (
                        <tr
                          key={ev}
                          style={{ transition: 'background 0.15s' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = isDark ? p.rowHover : '#fafbfc';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          {/* Event label cell */}
                          <td style={{
                            padding: isMobile ? '8px 10px' : '8px 12px',
                            borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`,
                            position: 'sticky', left: 0, zIndex: 1,
                            background: isDark ? p.card : '#fff',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: anyEnabled ? sevDot(ev) : (isDark ? '#444' : '#d9d9d9'),
                                flexShrink: 0,
                                boxShadow: anyEnabled ? `0 0 5px ${sevDot(ev)}40` : 'none',
                              }} />
                              <span style={{ fontSize: 13 }}>{info.emoji}</span>
                              <span style={{
                                fontSize: 12, fontWeight: 600,
                                color: anyEnabled ? p.text : p.textMuted,
                              }}>
                                {info.label}
                              </span>
                              {isCritical && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                                  padding: '1px 5px', borderRadius: 3,
                                  background: isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0',
                                  color: p.red, textTransform: 'uppercase',
                                }}>
                                  Critical
                                </span>
                              )}
                            </div>
                            {!isMobile && (
                              <div style={{ fontSize: 10, color: p.textMuted, marginTop: 2, marginLeft: 28 }}>
                                {info.desc}
                              </div>
                            )}
                          </td>

                          {/* Channel switch cells */}
                          {activeChannels.map((ch) => {
                            const enabled = isRuleEnabled(ch.id, ev);
                            const customized = hasCustomTemplate(ch.id, ev);
                            const testKey = `${ch.id}-${ev}`;

                            return (
                              <td key={ch.id} style={{
                                textAlign: 'center', padding: '6px 4px',
                                borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`,
                                verticalAlign: 'middle',
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                  <Switch
                                    size="small"
                                    checked={enabled}
                                    onChange={(checked) => handleRuleToggle(ch.id, ev, checked)}
                                  />
                                  <div style={{ display: 'flex', gap: 2 }}>
                                    {customized && (
                                      <span style={{
                                        fontSize: 8, fontWeight: 600,
                                        padding: '0 3px', borderRadius: 3,
                                        background: isDark ? 'rgba(82,196,26,0.12)' : '#f6ffed',
                                        color: p.green,
                                      }}>TPL</span>
                                    )}
                                    <span title="Edit template">
                                      <FormOutlined
                                        style={{ fontSize: 11, color: customized ? p.green : p.textMuted, cursor: 'pointer' }}
                                        onClick={() => openTemplateEditor(ch.id, ev)}
                                      />
                                    </span>
                                    <span title={`Test "${info.label}" → ${ch.name}`}>
                                      <ExperimentOutlined
                                        style={{ fontSize: 11, color: p.accent, cursor: 'pointer', opacity: testingEvent === testKey ? 0.5 : 1 }}
                                        onClick={() => handleTestEvent(ch.id, ev)}
                                      />
                                    </span>
                                  </div>
                                </div>
                              </td>
                            );
                          })}

                          {/* "All" toggle cell */}
                          {activeChannels.length > 1 && (
                            <td style={{
                              textAlign: 'center', padding: '6px 4px',
                              borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`,
                              verticalAlign: 'middle',
                            }}>
                              <Switch
                                size="small"
                                checked={allChannelsEnabled(ev)}
                                onChange={(checked) => toggleAllForEvent(ev, checked)}
                                style={{ opacity: 0.8 }}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER: Logs                                                     */
  /* ================================================================ */
  const renderLogs = () => {
    const pageSize = 20;
    const totalPages = Math.ceil(logs.length / pageSize);
    const pagedLogs = logs.slice((logPage - 1) * pageSize, logPage * pageSize);

    return (
      <div style={sectionBox}>
        {sectionTitle(<BellOutlined />, 'Notification Logs')}
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={btnOutline} onClick={() => fetchLogs()}>
            <ReloadOutlined /> Refresh
          </button>
          {logs.length > 0 && (
            <button style={btnDanger} onClick={() => { if (window.confirm('Clear all logs?')) clearLogs(); }}>
              <DeleteOutlined /> Clear All
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: p.textMuted, fontSize: 13 }}>
            No notification logs
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  {['Time', 'Event', 'Channel', 'Recipient', 'Status', 'Error'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px',
                      borderBottom: `2px solid ${p.cardBorder}`,
                      color: p.textMuted, fontSize: 11, fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {pagedLogs.map((log: any) => {
                  const info = eventLabel(log.event_type);
                  const sc = sevColor(info.color);
                  return (
                    <tr key={log.id} style={{ transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? p.rowHover : '#fafbfc'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`, whiteSpace: 'nowrap', color: p.textMuted }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}` }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                          background: `${sc}15`, color: sc,
                        }}>
                          {info.emoji} {info.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`, color: p.text }}>
                        {log.channel_type === 'email' ? '📧 Email' : '📨 Telegram'}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`, color: p.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.recipient}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}` }}>
                        {log.status === 'sent' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: p.green }}>
                            <CheckCircleOutlined /> Sent
                          </span>
                        ) : (
                          <span title={log.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: p.red }}>
                            <CloseCircleOutlined /> Failed
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`, color: p.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.error || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <button
                  style={{ ...btnOutline, padding: '4px 10px', opacity: logPage <= 1 ? 0.4 : 1 }}
                  disabled={logPage <= 1}
                  onClick={() => setLogPage((prev) => Math.max(1, prev - 1))}
                >Prev</button>
                <span style={{ fontSize: 12, color: p.textMuted }}>{logPage} / {totalPages}</span>
                <button
                  style={{ ...btnOutline, padding: '4px 10px', opacity: logPage >= totalPages ? 0.4 : 1 }}
                  disabled={logPage >= totalPages}
                  onClick={() => setLogPage((prev) => Math.min(totalPages, prev + 1))}
                >Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  Template Editor Modal                                            */
  /* ================================================================ */
  const tplInfo = eventLabel(tplEventType);
  const tplChannel = channels.find((c) => c.id === tplChannelId);

  const renderTemplateModal = () => (
    <Modal
      open={tplModal}
      title={
        <span>
          <FormOutlined style={{ marginRight: 8 }} />
          Customize Template — {tplInfo.emoji} {tplInfo.label}
          {tplChannel && <span style={{ marginLeft: 8, fontSize: 13, color: p.textMuted }}>
            via {tplChannel.type === 'email' ? '📧' : '📨'} {tplChannel.name}
          </span>}
        </span>
      }
      width={640}
      onCancel={() => setTplModal(false)}
      styles={{ content: { background: isDark ? p.card : '#fff' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button style={btnOutline} onClick={handleResetTemplate}>
            <UndoOutlined /> Reset to Default
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnOutline} onClick={() => setTplModal(false)}>Cancel</button>
            <button style={btnPrimary} disabled={tplSaving} onClick={handleSaveTemplate}>
              {tplSaving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      }
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: isDark ? 'rgba(24,144,255,0.08)' : '#e6f7ff',
          border: `1px solid ${isDark ? 'rgba(24,144,255,0.2)' : '#91d5ff'}`,
          fontSize: 12,
          color: p.text,
          lineHeight: 1.7,
        }}>
          <strong>Available variables:</strong><br />
          <code style={{ fontSize: 11 }}>{tplVariables || '{{.Title}}, {{.Detail}}, {{.EventType}}, {{.Severity}}, {{.Timestamp}}, {{.ServerName}}, {{.PanelURL}}'}</code><br />
          <span style={{ fontSize: 11, color: p.textMuted }}>
            Leave fields empty to use the default template. Variables use Go template syntax.
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontWeight: 600, fontSize: 13, color: p.text, display: 'block', marginBottom: 4 }}>
          Subject / Title
        </label>
        <Input
          value={tplSubject}
          onChange={(e) => setTplSubject(e.target.value)}
          placeholder={tplDefaultSubject || 'Leave empty for default'}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {tplDefaultSubject && (
          <span style={{ fontSize: 11, color: p.textMuted }}>Default: {tplDefaultSubject}</span>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontWeight: 600, fontSize: 13, color: p.text, display: 'block', marginBottom: 4 }}>
          Body / Message
        </label>
        <TextArea
          value={tplBody}
          onChange={(e) => setTplBody(e.target.value)}
          placeholder={tplDefaultBody || 'Leave empty for default'}
          rows={6}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {tplDefaultBody && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 11, color: p.textMuted, cursor: 'pointer' }}>
              Show default body
            </summary>
            <pre style={{ fontSize: 11, color: p.textMuted, margin: '4px 0 0', whiteSpace: 'pre-wrap', background: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5', padding: 8, borderRadius: 6 }}>
              {tplDefaultBody}
            </pre>
          </details>
        )}
      </div>

      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button
          style={btnOutline}
          disabled={tplPreviewing}
          onClick={() => handlePreviewTemplate(tplBody || tplDefaultBody)}
        >
          <EyeOutlined /> {tplPreviewing ? 'Loading…' : 'Preview Body'}
        </button>
        {tplSubject && (
          <button
            style={btnOutline}
            disabled={tplPreviewing}
            onClick={() => handlePreviewTemplate(tplSubject || tplDefaultSubject)}
          >
            <EyeOutlined /> {tplPreviewing ? 'Loading…' : 'Preview Subject'}
          </button>
        )}
      </div>

      {tplPreview && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: isDark ? 'rgba(0,0,0,0.3)' : '#fafafa',
          border: `1px solid ${p.cardBorder}`,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          maxHeight: 200,
          overflow: 'auto',
          color: p.text,
        }}>
          <span style={{ fontSize: 10, display: 'block', marginBottom: 6, color: p.textMuted }}>
            Preview (with sample data):
          </span>
          {tplPreview}
        </div>
      )}
    </Modal>
  );

  /* ================================================================ */
  /*  MAIN RENDER                                                      */
  /* ================================================================ */
  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {navBtn('channels', <BellOutlined />, 'Channels', channels.length)}
        {navBtn('rules', <CheckCircleOutlined />, 'Event Rules')}
        {navBtn('logs', <MailOutlined />, 'Logs', logs.length)}
      </div>

      {section === 'channels' && renderChannels()}
      {section === 'rules' && renderRules()}
      {section === 'logs' && renderLogs()}

      {renderTemplateModal()}
    </Spin>
  );
}
