import { useState, useEffect, useCallback } from 'react';
import { Form, Input, InputNumber, Switch, message, Spin } from 'antd';
import { LockOutlined, SecurityScanOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSHConfig {
  port: number;
  permit_root_login: boolean;
  password_auth: boolean;
  max_auth_tries: number;
}

interface Fail2banConfig {
  enabled: boolean;
  max_retry: number;
  ban_time: number;
  find_time: number;
}

// ---------------------------------------------------------------------------
// SSH Tab
// ---------------------------------------------------------------------------

function SSHTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
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
    <div style={{
      maxWidth: 640,
      borderRadius: 10,
      background: isDark ? p.rowAlt : p.headerBg,
      border: `1px solid ${p.cardBorder}`,
      padding: isMobile ? 16 : 28,
    }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <LockOutlined style={{ fontSize: 20, color: p.accent }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>SSH Configuration</span>
      </div>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ port: 22, permit_root_login: false, password_auth: true, max_auth_tries: 6 }}>
        <Form.Item name="port" label="SSH Port" rules={[{ required: true }]}
          extra="Default: 22. Changing this requires a service restart.">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="permit_root_login" label="Permit Root Login" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="password_auth" label="Password Authentication" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_auth_tries" label="Max Auth Tries" rules={[{ required: true }]}>
          <InputNumber min={1} max={20} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={saving} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s',
          }}>{saving ? '...' : t('common.save')}</button>
        </Form.Item>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban Tab
// ---------------------------------------------------------------------------

function Fail2banTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<Fail2banConfig>>('/security/fail2ban');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: Fail2banConfig) => {
    setSaving(true);
    try {
      await api.put('/security/fail2ban', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{
      maxWidth: 640,
      borderRadius: 10,
      background: isDark ? p.rowAlt : p.headerBg,
      border: `1px solid ${p.cardBorder}`,
      padding: isMobile ? 16 : 28,
    }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <SecurityScanOutlined style={{ fontSize: 20, color: p.accent }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Brute Force Protection (Fail2ban)</span>
      </div>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ enabled: false, max_retry: 5, ban_time: 600, find_time: 600 }}>
        <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_retry" label="Max Retry" rules={[{ required: true }]}
          extra="Number of failures before a host gets banned">
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="ban_time" label="Ban Time (seconds)" rules={[{ required: true }]}
          extra="Duration to ban an IP. Default: 600 (10 min)">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="find_time" label="Find Time (seconds)" rules={[{ required: true }]}
          extra="Window in which max_retry failures must occur">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={saving} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s',
          }}>{saving ? '...' : t('common.save')}</button>
        </Form.Item>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Security Page
// ---------------------------------------------------------------------------

export default function Security() {
  const [activeTab, setActiveTab] = useState<'ssh' | 'fail2ban'>('ssh');
  const { p, isDark } = usePalette();

  const tabs = [
    { key: 'ssh' as const, icon: <LockOutlined />, label: 'SSH' },
    { key: 'fail2ban' as const, icon: <SecurityScanOutlined />, label: 'Fail2ban' },
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
        background: p.headerBg,
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Security</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4,
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
        {activeTab === 'ssh' && <SSHTab />}
        {activeTab === 'fail2ban' && <Fail2banTab />}
      </div>
    </div>
  );
}
