import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Select, Upload, Spin, InputNumber, message } from 'antd';
import {
  SettingOutlined, SafetyCertificateOutlined,
  WarningOutlined, UploadOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined,
  LockOutlined, CopyOutlined, BellOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import { useSettingsStore } from '@/stores/settings';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import NotificationsTab from './NotificationsTab';

// ---------------------------------------------------------------------------
// SVG Icons (consistent with Firewall, etc.)
// ---------------------------------------------------------------------------

const SetIcon = {
  Gear: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Server: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill={color} stroke="none" />
      <circle cx="6" cy="18" r="1" fill={color} stroke="none" />
      <line x1="10" y1="6" x2="18" y2="6" />
      <line x1="10" y1="18" x2="18" y2="18" />
    </svg>
  ),
  Globe: ({ size = 16, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Shield: ({ size = 16, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Clock: ({ size = 16, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Info: ({ size = 16, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Wifi: ({ size = 16, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill={color} stroke="none" />
    </svg>
  ),
};

interface PanelSettings {
  panel_name: string;
  panel_port: number;
  admin_path: string;
  panel_language: string;
  timezone: string;
  session_timeout: number;
  [key: string]: string | number | boolean;
}

interface SSLInfo {
  enabled: boolean;
  issuer?: string;
  expiry?: string;
  type?: string;
}

interface PanelInfo {
  version: string;
  uptime: string;
  go_version: string;
  os: string;
  started_at: string;
  port: number;
  ssl_enabled: boolean;
  admin_path: string;
  panel_name: string;
}

interface ServerInfo {
  hostname: string;
  local_ips: string[];
  public_ip: string;
  os: string;
  arch: string;
  go_version: string;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [generalForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [sslInfo, setSSLInfo] = useState<SSLInfo | null>(null);
  const [sslLoading, setSSLLoading] = useState(false);
  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [serverInfoLoading, setServerInfoLoading] = useState(false);
  const [portForm] = Form.useForm();
  const [portLoading, setPortLoading] = useState(false);
  const [securityForm] = Form.useForm();
  const [securityLoading, setSecurityLoading] = useState(false);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'server' | 'ssl' | 'security' | 'danger'>('general');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<PanelSettings>>('/settings');
      const s = data.data;
      generalForm.setFieldsValue({
        panel_name: s.panel_name || 'ITDLUPanel',
        language: s.panel_language || 'en',
        timezone: s.timezone || 'UTC',
        session_timeout: typeof s.session_timeout === 'number'
          ? Math.floor(s.session_timeout / 60)
          : Math.floor(Number(s.session_timeout || 86400) / 60),
      });
      securityForm.setFieldsValue({
        admin_path: s.admin_path || '/',
      });
    } catch {
      message.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [generalForm, securityForm]);

  const fetchSSLInfo = useCallback(async () => {
    setSSLLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSLInfo>>('/ssl/panel');
      setSSLInfo(data.data);
    } catch {
      setSSLInfo({ enabled: false });
    } finally {
      setSSLLoading(false);
    }
  }, []);

  const fetchPanelInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const { data } = await api.get<ApiResponse<PanelInfo>>('/settings/panel-info');
      setPanelInfo(data.data);
    } catch {
      message.error('Failed to load panel info');
    } finally {
      setInfoLoading(false);
    }
  }, []);

  const fetchServerInfo = useCallback(async () => {
    setServerInfoLoading(true);
    try {
      const { data } = await api.get<ApiResponse<ServerInfo>>('/settings/server-info');
      setServerInfo(data.data);
    } catch {
      message.error('Failed to load server info');
    } finally {
      setServerInfoLoading(false);
    }
  }, []);

  const fetchTimezones = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponse<string[]>>('/settings/timezones');
      setTimezones(data.data || []);
    } catch {
      setTimezones(['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Tokyo', 'US/Eastern', 'US/Pacific', 'Europe/London']);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchSSLInfo();
    fetchPanelInfo();
    fetchServerInfo();
    fetchTimezones();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveGeneral = async (values: { panel_name: string; language: string; timezone: string; session_timeout: number }) => {
    setSaveLoading(true);
    try {
      await api.put('/settings/panel-name', { name: values.panel_name });
      await api.put('/settings/timezone', { timezone: values.timezone });
      await api.put('/settings/session-timeout', { timeout: values.session_timeout * 60 });
      if (values.language && values.language !== i18n.language) {
        await api.put('/settings/language', { lang: values.language });
        i18n.changeLanguage(values.language);
      }
      useSettingsStore.getState().setTimezone(values.timezone);
      message.success(t('common.success'));
      fetchPanelInfo();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSaveSecurity = async (values: { admin_path: string }) => {
    setSecurityLoading(true);
    try {
      await api.put('/settings/admin-path', { path: values.admin_path });
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleGenerateSelfSigned = async () => {
    setSSLLoading(true);
    try {
      await api.post('/ssl/panel/self-signed');
      message.success('Self-signed certificate generated');
      fetchSSLInfo();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSSLLoading(false);
    }
  };

  const handleChangePort = async (values: { port: number }) => {
    setPortLoading(true);
    try {
      await api.put('/settings', { port: values.port });
      message.success('Port changed. Panel will restart on new port.');
    } catch {
      message.error(t('common.error'));
    } finally {
      setPortLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('Copied!');
    }).catch(() => {
      message.error('Copy failed');
    });
  };

  const tabs = [
    { key: 'general' as const, icon: <SettingOutlined />, label: t('settings.general') },
    { key: 'server' as const, icon: <SetIcon.Server size={14} color="currentColor" />, label: 'Server' },
    { key: 'ssl' as const, icon: <SafetyCertificateOutlined />, label: 'SSL' },
    { key: 'security' as const, icon: <LockOutlined />, label: t('settings.security', 'Security') },
    { key: 'notifications' as const, icon: <BellOutlined />, label: 'Notifications' },
    { key: 'danger' as const, icon: <WarningOutlined />, label: 'Danger Zone' },
  ];

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

  const sectionBox: React.CSSProperties = {
    maxWidth: 640, borderRadius: 10,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 16 : 28,
  };

  const infoRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: `1px solid ${p.cardBorder}`,
  };

  const sectionTitle = (icon: React.ReactNode, title: string, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: p.accent,
        }}>{icon}</div>
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>{title}</span>
      </div>
      {extra}
    </div>
  );

  const ipBadge = (ip: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderRadius: 8, background: `${p.accent}12`, border: `1px solid ${p.accent}30`,
    }}>
      <code style={{
        fontSize: 13, fontWeight: 600, color: p.accent, fontFamily: 'monospace',
        background: 'transparent', letterSpacing: 0.3,
      }}>{ip}</code>
      <button
        onClick={() => copyToClipboard(ip)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          color: p.textMuted, display: 'flex', alignItems: 'center',
        }}
        title="Copy"
      >
        <CopyOutlined style={{ fontSize: 12 }} />
      </button>
    </div>
  );

  // Grid card item (matches Firewall listening ports pattern)
  const gridCard = (icon: React.ReactNode, iconColor: string, label: string, value: React.ReactNode) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 14,
      borderRadius: 10, background: isDark ? p.rowAlt : p.headerBg,
      border: `1px solid ${p.cardBorder}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${iconColor}15`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: p.text, wordBreak: 'break-all' }}>{value}</span>
      </div>
    </div>
  );

  /* ─── General Tab ─── */
  const renderGeneralTab = () => (
    <Spin spinning={loading}>
      <div style={sectionBox}>
        {sectionTitle(<SetIcon.Gear size={20} color={p.accent} />, t('settings.general'))}
        <Form form={generalForm} layout="vertical" onFinish={handleSaveGeneral}>
          <Form.Item
            label={<span style={{ fontWeight: 500 }}>{t('settings.panel_name')}</span>}
            name="panel_name"
            rules={[{ required: true, message: t('settings.panel_name_required') }]}
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>{t('settings.panel_name_hint')}</span>}
          >
            <Input placeholder="My Server Panel" maxLength={100} />
          </Form.Item>
          <Form.Item label={<span style={{ fontWeight: 500 }}>{t('settings.language')}</span>} name="language">
            <Select options={[
              { value: 'en', label: '🇺🇸 English' },
              { value: 'vi', label: '🇻🇳 Tiếng Việt' },
            ]} />
          </Form.Item>
          <Form.Item label={<span style={{ fontWeight: 500 }}>{t('settings.timezone')}</span>} name="timezone">
            <Select
              showSearch
              optionFilterProp="label"
              options={timezones.map(tz => ({ value: tz, label: tz }))}
              placeholder={t('settings.timezone_placeholder')}
            />
          </Form.Item>
          <Form.Item
            label={<span style={{ fontWeight: 500 }}>{t('settings.session_timeout')}</span>}
            name="session_timeout"
            rules={[{ required: true, message: t('settings.session_timeout_required') }]}
          >
            <InputNumber min={5} max={10080} style={{ width: '100%' }} addonAfter="min" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <button type="submit" disabled={saveLoading} style={{
              ...btnPrimary, opacity: saveLoading ? 0.6 : 1,
            }}>
              {saveLoading && <Spin size="small" />}
              {t('common.save')}
            </button>
          </Form.Item>
        </Form>
      </div>
    </Spin>
  );

  /* ─── Server Info Tab ─── */
  const renderServerTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Network Info - Grid Cards */}
      <Spin spinning={serverInfoLoading}>
        <div style={{ ...sectionBox, maxWidth: 'none' }}>
          {sectionTitle(<SetIcon.Globe size={20} color={p.accent} />, t('settings.server_network'), (
            <button onClick={() => { fetchServerInfo(); fetchPanelInfo(); }} style={btnOutline}>
              <ReloadOutlined /> {t('common.refresh')}
            </button>
          ))}
          {serverInfo ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(260px, 1fr))`, gap: 10 }}>
              {gridCard(
                <SetIcon.Server size={18} color={p.accent} />, p.accent,
                t('settings.hostname'), serverInfo.hostname || '—',
              )}
              {serverInfo.public_ip && gridCard(
                <SetIcon.Globe size={18} color={p.green} />, p.green,
                t('settings.public_ip'),
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {serverInfo.public_ip}
                  <button onClick={() => copyToClipboard(serverInfo.public_ip || '')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: p.textMuted, display: 'flex' }}>
                    <CopyOutlined style={{ fontSize: 11 }} />
                  </button>
                </span>,
              )}
              {serverInfo.local_ips?.map((ip, i) => gridCard(
                <SetIcon.Wifi size={18} color={p.accent} />, p.accent,
                `${t('settings.local_ip')}${serverInfo.local_ips && serverInfo.local_ips.length > 1 ? ` #${i + 1}` : ''}`,
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {ip}
                  <button onClick={() => copyToClipboard(ip)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: p.textMuted, display: 'flex' }}>
                    <CopyOutlined style={{ fontSize: 11 }} />
                  </button>
                </span>,
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: p.textMuted }}>{t('common.no_data')}</span>
          )}
        </div>
      </Spin>

      {/* Panel Runtime Info - Grid Cards */}
      <Spin spinning={infoLoading}>
        <div style={{ ...sectionBox, maxWidth: 'none' }}>
          {sectionTitle(<SetIcon.Info size={20} color={p.accent} />, t('settings.panel_info'))}
          {panelInfo ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(260px, 1fr))`, gap: 10 }}>
              {gridCard(
                <SetIcon.Gear size={18} color={p.accent} />, p.accent,
                t('settings.panel_name'),
                <span style={{ color: p.accent }}>{panelInfo.panel_name || 'ITDLUPanel'}</span>,
              )}
              {gridCard(
                <SetIcon.Info size={18} color={p.accent} />, p.accent,
                t('settings.version'),
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '1px 8px', borderRadius: 99,
                  background: `${p.accent}15`, color: p.accent,
                }}>{panelInfo.version || '0.1.0'}</span>,
              )}
              {gridCard(
                <SetIcon.Clock size={18} color={p.green} />, p.green,
                t('settings.uptime'),
                <span style={{ color: p.green }}>{panelInfo.uptime}</span>,
              )}
              {gridCard(
                <SetIcon.Shield size={18} color={panelInfo.ssl_enabled ? p.green : p.amber} />,
                panelInfo.ssl_enabled ? p.green : p.amber,
                t('settings.port'),
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ fontFamily: 'monospace', fontWeight: 600 }}>{panelInfo.port}</code>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '1px 8px', borderRadius: 99,
                    background: panelInfo.ssl_enabled ? `${p.green}15` : `${p.amber}15`,
                    color: panelInfo.ssl_enabled ? p.green : p.amber,
                  }}>
                    {panelInfo.ssl_enabled ? 'HTTPS' : 'HTTP'}
                  </span>
                </span>,
              )}
              {gridCard(
                <SetIcon.Server size={18} color={p.textMuted} />, p.textMuted,
                t('settings.go_version'), panelInfo.go_version || '—',
              )}
              {gridCard(
                <SetIcon.Globe size={18} color={p.textMuted} />, p.textMuted,
                t('settings.os_arch'), panelInfo.os || '—',
              )}
              {panelInfo.started_at && gridCard(
                <SetIcon.Clock size={18} color={p.textMuted} />, p.textMuted,
                t('settings.started_at'), formatDateTime(panelInfo.started_at),
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: p.textMuted }}>{t('common.no_data')}</span>
          )}
        </div>
      </Spin>
    </div>
  );

  /* ─── SSL Tab ─── */
  const renderSSLTab = () => (
    <Spin spinning={sslLoading}>
      <div style={sectionBox}>
        {sectionTitle(<SetIcon.Shield size={20} color={p.accent} />, 'Panel SSL')}

        <div style={{ marginBottom: 20 }}>
          <div style={infoRow}>
            <span style={{ fontSize: 13, color: p.textMuted }}>Status</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
              background: sslInfo?.enabled ? `${p.green}15` : `${p.red}15`,
              color: sslInfo?.enabled ? p.green : p.red,
            }}>
              {sslInfo?.enabled ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              {sslInfo?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {sslInfo?.issuer && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Issuer</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.issuer}</span>
            </div>
          )}
          {sslInfo?.expiry && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Expiry</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.expiry}</span>
            </div>
          )}
          {sslInfo?.type && (
            <div style={{ ...infoRow, borderBottom: 'none' }}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Type</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.type}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleGenerateSelfSigned} disabled={sslLoading} style={{
            ...btnOutline, opacity: sslLoading ? 0.6 : 1,
          }}>
            <SafetyCertificateOutlined /> Generate Self-Signed
          </button>
          <Upload
            accept=".pem,.crt,.key"
            showUploadList={false}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const formData = new FormData();
                formData.append('cert', file as File);
                await api.post('/ssl/panel/upload', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                onSuccess?.(null);
                message.success('Certificate uploaded');
                fetchSSLInfo();
              } catch (err) {
                onError?.(err as Error);
                message.error('Upload failed');
              }
            }}
          >
            <button style={btnOutline}>
              <UploadOutlined /> Upload Certificate
            </button>
          </Upload>
        </div>
      </div>
    </Spin>
  );

  /* ─── Security Tab ─── */
  const renderSecurityTab = () => (
    <Spin spinning={loading}>
      <div style={sectionBox}>
        {sectionTitle(<SetIcon.Shield size={20} color={p.accent} />, t('settings.security', 'Security'))}
        <Form form={securityForm} layout="vertical" onFinish={handleSaveSecurity}>
          <Form.Item
            label={<span style={{ fontWeight: 500 }}>{t('settings.admin_path')}</span>}
            name="admin_path"
            extra={<span style={{ fontSize: 11, color: p.textMuted }}>{t('settings.admin_path_hint')}</span>}
          >
            <Input placeholder="/" addonBefore="/" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <button type="submit" disabled={securityLoading} style={{
              ...btnPrimary, opacity: securityLoading ? 0.6 : 1,
            }}>
              {securityLoading && <Spin size="small" />}
              {t('common.save')}
            </button>
          </Form.Item>
        </Form>
      </div>
    </Spin>
  );

  /* ─── Danger Zone Tab ─── */
  const renderDangerTab = () => (
    <div style={sectionBox}>
      {sectionTitle(<WarningOutlined style={{ color: p.red }} />, 'Danger Zone')}

      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: `${p.amber}10`, border: `1px solid ${p.amber}30`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 20,
      }}>
        <WarningOutlined style={{ color: p.amber, marginTop: 2 }} />
        <span style={{ fontSize: 13, color: p.text }}>
          Changing the panel port will restart the panel. You will be disconnected and need to reconnect on the new port.
        </span>
      </div>

      <Form form={portForm} layout={isMobile ? 'vertical' : 'inline'} onFinish={handleChangePort}>
        <Form.Item
          name="port"
          rules={[{ required: true, message: 'Required' }]}
        >
          <InputNumber min={1} max={65535} placeholder="New port" style={{ width: isMobile ? '100%' : 160 }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={portLoading} style={{
            ...btnDanger, opacity: portLoading ? 0.6 : 1,
          }}>
            {portLoading && <Spin size="small" />}
            Change Port
          </button>
        </Form.Item>
      </Form>
    </div>
  );

  return (
    <div>
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
            <SetIcon.Gear size={22} color={p.accent} />
            <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>
              {t('settings.title')}
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
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {activeTab === 'general' && renderGeneralTab()}
          {activeTab === 'server' && renderServerTab()}
          {activeTab === 'ssl' && renderSSLTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'danger' && renderDangerTab()}
        </div>
      </div>
    </div>
  );
}

