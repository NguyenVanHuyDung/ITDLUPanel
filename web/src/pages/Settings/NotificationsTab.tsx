import React, { useState, useEffect, useCallback } from 'react';
import {
  Form, Input, InputNumber, Select, Switch, Button, Table, Modal,
  Space, Tag, Tooltip, Popconfirm, Spin, message, Badge, Empty, Typography,
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
const { Text } = Typography;

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
  gradient: [string, string];
  events: string[];
}

const EVENT_CATEGORIES: EventCategory[] = [
  { key: 'cron',     label: 'Scheduled Tasks',    icon: '🕐', gradient: ['#667eea', '#764ba2'], events: ['cron_success', 'cron_failed'] },
  { key: 'ssl',      label: 'SSL Certificates',   icon: '🔐', gradient: ['#f093fb', '#f5576c'], events: ['ssl_expiry_warning', 'ssl_expired'] },
  { key: 'backup',   label: 'Backups',             icon: '💾', gradient: ['#4facfe', '#00f2fe'], events: ['backup_completed', 'backup_failed'] },
  { key: 'software', label: 'Software',            icon: '📦', gradient: ['#43e97b', '#38f9d7'], events: ['software_installed', 'software_install_failed'] },
  { key: 'sites',    label: 'Websites',            icon: '🌐', gradient: ['#a18cd1', '#fbc2eb'], events: ['site_created', 'site_deleted'] },
  { key: 'system',   label: 'System Resources',    icon: '📊', gradient: ['#fccb90', '#d57eeb'], events: ['cpu_high', 'memory_high', 'disk_high'] },
  { key: 'security', label: 'Security',            icon: '🛡️', gradient: ['#ff9a9e', '#fecfef'], events: ['service_down', 'login_failed'] },
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
  const [activeRuleChannel, setActiveRuleChannel] = useState<number | null>(null);

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
    borderRadius: 12,
    background: isDark ? p.card : '#fff',
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 14 : 20,
    marginBottom: 16,
    boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
  };

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {icon}
      <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>{title}</span>
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
  const navBtn = (key: typeof section, icon: React.ReactNode, label: string) => (
    <Button
      type={section === key ? 'primary' : 'default'}
      icon={icon}
      onClick={() => setSection(key)}
      style={{ borderRadius: 6 }}
    >
      {label}
    </Button>
  );

  /* ================================================================ */
  /*  RENDER: Channels                                                 */
  /* ================================================================ */
  const renderChannels = () => (
    <div style={sectionBox}>
      {sectionTitle(<BellOutlined style={{ color: p.accent }} />, 'Notification Channels')}
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNewChannel} style={{ borderRadius: 6 }}>
          Add Channel
        </Button>
      </div>

      {channels.length === 0 ? (
        <Empty description="No notification channels configured" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {channels.map((ch) => {
            const cfg = parseConfig(ch.config);
            return (
            <div
              key={ch.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 8,
                background: isDark ? p.card : '#fff',
                border: `1px solid ${p.cardBorder}`,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {ch.type === 'email' ? (
                  <MailOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                ) : (
                  <SendOutlined style={{ fontSize: 20, color: '#0088cc' }} />
                )}
                <div>
                  <div style={{ fontWeight: 600, color: p.text }}>{ch.name}</div>
                  <div style={{ fontSize: 12, color: p.textMuted }}>
                    {ch.type === 'email'
                      ? `${cfg.host || ''}:${cfg.port || ''} → ${cfg.to || ''}`
                      : `Chat ID: ${cfg.chat_id || ''}`}
                  </div>
                </div>
                <Badge status={ch.is_enabled ? 'success' : 'default'} text={ch.is_enabled ? 'Active' : 'Disabled'} />
              </div>
              <Space size={4}>
                <Tooltip title="Test">
                  <Button
                    size="small"
                    icon={<ExperimentOutlined />}
                    loading={testing === ch.id}
                    onClick={() => handleTestChannel(ch.id)}
                  />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditChannel(ch)} />
                </Tooltip>
                <Popconfirm title="Delete this channel?" onConfirm={() => handleDeleteChannel(ch.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
            );
          })}
        </div>
      )}

      {/* ---- Channel Modal ---- */}
      <Modal
        open={channelModal}
        title={editingChannel ? 'Edit Channel' : 'New Channel'}
        onCancel={() => { setChannelModal(false); setEditingChannel(null); }}
        footer={null}
        destroyOnClose
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
            <Space>
              <Button onClick={() => { setChannelModal(false); setEditingChannel(null); }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingChannel ? 'Update' : 'Create'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  /* ================================================================ */
  /*  RENDER: Rules — modern card-based design                         */
  /* ================================================================ */
  const renderRules = () => {
    const activeChannels = channels.filter((c) => c.is_enabled);

    // Auto-select first channel if none selected
    const selCh = activeChannels.find((c) => c.id === activeRuleChannel) ?? activeChannels[0] ?? null;
    if (selCh && activeRuleChannel !== selCh.id) {
      setTimeout(() => setActiveRuleChannel(selCh.id), 0);
    }

    // Severity dot color
    const sevDot = (ev: string): string => {
      const sev = eventTypes.find((e) => e.type === ev)?.severity;
      const map: Record<string, string> = { info: p.accent, success: p.green, warning: p.amber, error: p.red, critical: p.red };
      return map[sev ?? ''] ?? p.textMuted;
    };

    // Count enabled rules for a channel within a category
    const categoryEnabledCount = (cat: EventCategory, chId: number) =>
      cat.events.filter((ev) => isRuleEnabled(chId, ev)).length;

    return (
      <div style={sectionBox}>
        {sectionTitle(<BellOutlined style={{ color: p.accent }} />, 'Event Rules')}

        {activeChannels.length === 0 ? (
          <Empty description="Create and enable a channel first" />
        ) : (
          <>
            {/* ---- Channel selector pills ---- */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
            }}>
              {activeChannels.map((ch) => {
                const isActive = selCh?.id === ch.id;
                const enabledCount = rules.filter((r) => r.channel_id === ch.id && r.is_enabled).length;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveRuleChannel(ch.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 16px',
                      borderRadius: 10,
                      border: isActive ? `2px solid ${p.accent}` : `1px solid ${p.cardBorder}`,
                      background: isActive
                        ? (isDark ? 'rgba(24,144,255,0.12)' : 'rgba(24,144,255,0.06)')
                        : (isDark ? p.card : '#fff'),
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      outline: 'none',
                      boxShadow: isActive ? `0 0 0 3px ${isDark ? 'rgba(24,144,255,0.15)' : 'rgba(24,144,255,0.1)'}` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{ch.type === 'email' ? '📧' : '📨'}</span>
                    <span style={{ fontWeight: isActive ? 700 : 500, color: isActive ? p.accent : p.text, fontSize: 13 }}>
                      {ch.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 10,
                      background: isDark ? p.codeBg : '#f0f0f0',
                      color: enabledCount > 0 ? p.green : p.textMuted,
                    }}>
                      {enabledCount}/{eventTypes.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ---- Category groups ---- */}
            {selCh && EVENT_CATEGORIES.map((cat) => {
              const enabledInCat = categoryEnabledCount(cat, selCh.id);
              const totalInCat = cat.events.length;

              return (
                <div key={cat.key} style={{ marginBottom: 16 }}>
                  {/* Category header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px 10px 0 0',
                    background: isDark
                      ? `linear-gradient(135deg, ${cat.gradient[0]}18, ${cat.gradient[1]}10)`
                      : `linear-gradient(135deg, ${cat.gradient[0]}12, ${cat.gradient[1]}08)`,
                    borderBottom: `1px solid ${isDark ? p.cardBorder : cat.gradient[0] + '22'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{cat.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: p.text }}>{cat.label}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 10px', borderRadius: 10,
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      color: enabledInCat === totalInCat ? p.green : enabledInCat > 0 ? p.amber : p.textMuted,
                    }}>
                      {enabledInCat}/{totalInCat} active
                    </span>
                  </div>

                  {/* Event cards */}
                  <div style={{
                    border: `1px solid ${p.cardBorder}`,
                    borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    overflow: 'hidden',
                  }}>
                    {cat.events.map((ev, idx) => {
                      const info = eventLabel(ev);
                      const isCritical = criticalTypes.includes(ev);
                      const enabled = isRuleEnabled(selCh.id, ev);
                      const customized = hasCustomTemplate(selCh.id, ev);
                      const testKey = `${selCh.id}-${ev}`;
                      const isLast = idx === cat.events.length - 1;

                      return (
                        <div
                          key={ev}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: isMobile ? '10px 12px' : '10px 16px',
                            gap: 8,
                            borderBottom: isLast ? 'none' : `1px solid ${isDark ? p.cardBorder : '#f0f0f0'}`,
                            background: isDark ? p.card : '#fff',
                            transition: 'background 0.15s',
                            flexWrap: 'wrap',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = isDark ? p.rowHover : '#fafbfc';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = isDark ? p.card : '#fff';
                          }}
                        >
                          {/* Left: status dot + info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: enabled ? sevDot(ev) : (isDark ? '#444' : '#d9d9d9'),
                              flexShrink: 0,
                              boxShadow: enabled ? `0 0 6px ${sevDot(ev)}40` : 'none',
                              transition: 'all 0.2s',
                            }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                              }}>
                                <span style={{ fontSize: 14 }}>{info.emoji}</span>
                                <span style={{
                                  fontSize: 13, fontWeight: 600, color: enabled ? p.text : p.textMuted,
                                  transition: 'color 0.2s',
                                }}>
                                  {info.label}
                                </span>
                                {isCritical && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                    padding: '1px 6px', borderRadius: 4,
                                    background: isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0',
                                    color: p.red,
                                    textTransform: 'uppercase',
                                  }}>
                                    Critical
                                  </span>
                                )}
                                {customized && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 600,
                                    padding: '1px 6px', borderRadius: 4,
                                    background: isDark ? 'rgba(82,196,26,0.12)' : '#f6ffed',
                                    color: p.green,
                                  }}>
                                    Custom
                                  </span>
                                )}
                              </div>
                              {!isMobile && (
                                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 1 }}>
                                  {info.desc}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, flexShrink: 0 }}>
                            <Tooltip title="Edit template">
                              <Button
                                size="small"
                                type="text"
                                icon={<FormOutlined style={{ fontSize: 13, color: customized ? p.green : p.textMuted }} />}
                                onClick={() => openTemplateEditor(selCh.id, ev)}
                                style={{ borderRadius: 6, width: 28, height: 28 }}
                              />
                            </Tooltip>
                            <Tooltip title={`Test "${info.label}"`}>
                              <Button
                                size="small"
                                type="text"
                                icon={<ExperimentOutlined style={{ fontSize: 13, color: p.accent }} />}
                                loading={testingEvent === testKey}
                                onClick={() => handleTestEvent(selCh.id, ev)}
                                style={{ borderRadius: 6, width: 28, height: 28 }}
                              />
                            </Tooltip>
                            <Switch
                              size="small"
                              checked={enabled}
                              onChange={(checked) => handleRuleToggle(selCh.id, ev, checked)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* ---- Quick actions bar ---- */}
            {selCh && (
              <div style={{
                display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap',
              }}>
                <Button
                  size="small"
                  type="link"
                  onClick={async () => {
                    const allRules = eventTypes.map((et) => ({
                      channel_id: selCh.id,
                      event_type: et.type,
                      is_enabled: true,
                    }));
                    try { await updateRules(allRules); await fetchRules(); message.success('All events enabled'); } catch { message.error('Failed'); }
                  }}
                  style={{ fontSize: 12, padding: '0 4px' }}
                >
                  Enable All
                </Button>
                <Button
                  size="small"
                  type="link"
                  onClick={async () => {
                    const allRules = eventTypes.map((et) => ({
                      channel_id: selCh.id,
                      event_type: et.type,
                      is_enabled: false,
                    }));
                    try { await updateRules(allRules); await fetchRules(); message.success('All events disabled'); } catch { message.error('Failed'); }
                  }}
                  style={{ fontSize: 12, padding: '0 4px', color: p.textMuted }}
                >
                  Disable All
                </Button>
                <Button
                  size="small"
                  type="link"
                  onClick={async () => {
                    const criticalRules = eventTypes.map((et) => ({
                      channel_id: selCh.id,
                      event_type: et.type,
                      is_enabled: criticalTypes.includes(et.type),
                    }));
                    try { await updateRules(criticalRules); await fetchRules(); message.success('Critical events only'); } catch { message.error('Failed'); }
                  }}
                  style={{ fontSize: 12, padding: '0 4px' }}
                >
                  Critical Only
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER: Logs                                                     */
  /* ================================================================ */
  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Event',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 180,
      render: (v: string) => {
        const info = eventLabel(v);
        return <Tag color={info.color}>{info.emoji} {info.label}</Tag>;
      },
    },
    {
      title: 'Channel',
      dataIndex: 'channel_type',
      key: 'channel_type',
      width: 90,
      render: (v: string) => (v === 'email' ? '📧 Email' : '📨 Telegram'),
    },
    {
      title: 'Recipient',
      dataIndex: 'recipient',
      key: 'recipient',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) =>
        v === 'sent' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">Sent</Tag>
        ) : (
          <Tooltip title={v}>
            <Tag icon={<CloseCircleOutlined />} color="error">Failed</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
  ];

  const renderLogs = () => (
    <div style={sectionBox}>
      {sectionTitle(<BellOutlined style={{ color: p.accent }} />, 'Notification Logs')}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetchLogs()} size="small" style={{ borderRadius: 6 }}>
          Refresh
        </Button>
        {logs.length > 0 && (
          <Popconfirm title="Clear all logs?" onConfirm={clearLogs}>
            <Button danger size="small" icon={<DeleteOutlined />} style={{ borderRadius: 6 }}>
              Clear All
            </Button>
          </Popconfirm>
        )}
      </div>
      <Table
        dataSource={logs}
        columns={logColumns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 700 }}
        locale={{ emptyText: <Empty description="No notification logs" /> }}
      />
    </div>
  );

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
          {tplChannel && <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>
            via {tplChannel.type === 'email' ? '📧' : '📨'} {tplChannel.name}
          </Text>}
        </span>
      }
      width={640}
      onCancel={() => setTplModal(false)}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<UndoOutlined />} onClick={handleResetTemplate}>
            Reset to Default
          </Button>
          <Space>
            <Button onClick={() => setTplModal(false)}>Cancel</Button>
            <Button type="primary" loading={tplSaving} onClick={handleSaveTemplate}>
              Save Template
            </Button>
          </Space>
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
          <Text type="secondary" style={{ fontSize: 11 }}>
            Leave fields empty to use the default template. Variables use Go template syntax.
          </Text>
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
          <Text type="secondary" style={{ fontSize: 11 }}>Default: {tplDefaultSubject}</Text>
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

      <div style={{ marginBottom: 8 }}>
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            loading={tplPreviewing}
            onClick={() => handlePreviewTemplate(tplBody || tplDefaultBody)}
            style={{ borderRadius: 4 }}
          >
            Preview Body
          </Button>
          {tplSubject && (
            <Button
              size="small"
              icon={<EyeOutlined />}
              loading={tplPreviewing}
              onClick={() => handlePreviewTemplate(tplSubject || tplDefaultSubject)}
              style={{ borderRadius: 4 }}
            >
              Preview Subject
            </Button>
          )}
        </Space>
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
          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 6 }}>
            Preview (with sample data):
          </Text>
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
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          {navBtn('channels', <BellOutlined />, 'Channels')}
          {navBtn('rules', <CheckCircleOutlined />, 'Event Rules')}
          {navBtn('logs', <MailOutlined />, 'Logs')}
        </Space>
      </div>

      {section === 'channels' && renderChannels()}
      {section === 'rules' && renderRules()}
      {section === 'logs' && renderLogs()}

      {renderTemplateModal()}
    </Spin>
  );
}
