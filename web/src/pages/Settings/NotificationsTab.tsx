import { useState, useEffect, useCallback } from 'react';
import {
  Form, Input, InputNumber, Select, Switch, Button, Table, Modal,
  Space, Tag, Tooltip, Popconfirm, Spin, message, Badge, Empty,
} from 'antd';
import {
  MailOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
  EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExperimentOutlined, BellOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useThemeStore } from '@/stores/theme';
import { useNotificationStore } from '@/stores/notification';
import type { NotificationChannel } from '@/stores/notification';

/* ------------------------------------------------------------------ */
/*  Event type labels & severity colors                                */
/* ------------------------------------------------------------------ */

const EVENT_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  cron_success:            { label: 'Cron Success',            color: 'green',   emoji: '✅' },
  cron_failed:             { label: 'Cron Failed',             color: 'red',     emoji: '❌' },
  ssl_expiry_warning:      { label: 'SSL Expiry Warning',      color: 'orange',  emoji: '⚠️' },
  ssl_expired:             { label: 'SSL Expired',             color: 'red',     emoji: '🔴' },
  backup_completed:        { label: 'Backup Completed',        color: 'green',   emoji: '✅' },
  backup_failed:           { label: 'Backup Failed',           color: 'red',     emoji: '❌' },
  software_installed:      { label: 'Software Installed',      color: 'green',   emoji: '📦' },
  software_install_failed: { label: 'Software Install Failed', color: 'red',     emoji: '❌' },
  site_created:            { label: 'Site Created',            color: 'blue',    emoji: '🌐' },
  site_deleted:            { label: 'Site Deleted',            color: 'orange',  emoji: '🗑️' },
  cpu_high:                { label: 'CPU High',                color: 'orange',  emoji: '🔥' },
  memory_high:             { label: 'Memory High',             color: 'orange',  emoji: '💾' },
  disk_high:               { label: 'Disk High',               color: 'red',     emoji: '💿' },
  service_down:            { label: 'Service Down',            color: 'red',     emoji: '🔻' },
  login_failed:            { label: 'Login Failed',            color: 'orange',  emoji: '🔒' },
};

const eventLabel = (t: string) => EVENT_LABELS[t] ?? { label: t, color: 'default', emoji: '🔔' };

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
    createChannel, updateChannel, deleteChannel, testChannel,
    updateRules, clearLogs,
  } = useNotificationStore();

  const [channelModal, setChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [form] = Form.useForm();
  const [channelType, setChannelType] = useState<'email' | 'telegram'>('email');
  const [testing, setTesting] = useState<number | null>(null);
  const [section, setSection] = useState<'channels' | 'rules' | 'logs'>('channels');

  const parseConfig = (cfg: string): Record<string, string> => {
    try { return JSON.parse(cfg); } catch { return {}; }
  };

  const reload = useCallback(async () => {
    await Promise.all([fetchChannels(), fetchRules(), fetchEventTypes(), fetchCriticalTypes(), fetchLogs()]);
  }, [fetchChannels, fetchRules, fetchEventTypes, fetchCriticalTypes, fetchLogs]);

  useEffect(() => { reload(); }, [reload]);

  /* ---------- Styles ---------- */
  const sectionBox: React.CSSProperties = {
    borderRadius: 10,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.border}`,
    padding: isMobile ? 14 : 20,
    marginBottom: 16,
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
                background: isDark ? p.bg : '#fff',
                border: `1px solid ${p.border}`,
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
                  <div style={{ fontSize: 12, color: p.textSoft }}>
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
  /*  RENDER: Rules matrix                                             */
  /* ================================================================ */
  const renderRules = () => {
    const activeChannels = channels.filter((c) => c.is_enabled);
    return (
      <div style={sectionBox}>
        {sectionTitle(<BellOutlined style={{ color: p.accent }} />, 'Event Rules')}
        <p style={{ color: p.textSoft, marginBottom: 16, fontSize: 13 }}>
          Choose which events trigger notifications on each channel.
          Events marked with <Tag color="red" style={{ fontSize: 11 }}>Critical</Tag> are auto-enabled for new channels.
        </p>

        {activeChannels.length === 0 ? (
          <Empty description="Create and enable a channel first" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${p.border}`, color: p.text }}>
                    Event
                  </th>
                  {activeChannels.map((ch) => (
                    <th
                      key={ch.id}
                      style={{ textAlign: 'center', padding: '8px 10px', borderBottom: `1px solid ${p.border}`, color: p.text, minWidth: 90 }}
                    >
                      {ch.type === 'email' ? '📧' : '📨'} {ch.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventTypes.map((evInfo) => {
                  const ev = evInfo.type;
                  const info = eventLabel(ev);
                  const isCritical = criticalTypes.includes(ev);
                  return (
                    <tr key={ev} style={isCritical ? { background: isDark ? 'rgba(255,0,0,0.04)' : 'rgba(255,0,0,0.02)' } : undefined}>
                      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${p.border}`, color: p.text }}>
                        <Tag color={info.color} style={{ marginRight: 4 }}>{info.emoji} {info.label}</Tag>
                        {isCritical && <Tag color="red" style={{ fontSize: 10 }}>Critical</Tag>}
                      </td>
                      {activeChannels.map((ch) => (
                        <td
                          key={ch.id}
                          style={{ textAlign: 'center', padding: '6px 10px', borderBottom: `1px solid ${p.border}` }}
                        >
                          <Switch
                            size="small"
                            checked={isRuleEnabled(ch.id, ev)}
                            onChange={(checked) => handleRuleToggle(ch.id, ev, checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
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
    </Spin>
  );
}
