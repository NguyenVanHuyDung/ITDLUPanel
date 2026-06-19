import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Select, Upload, Spin, InputNumber, message } from 'antd';
import {
  SettingOutlined, SafetyCertificateOutlined,
  WarningOutlined, UploadOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined,
  LockOutlined, CopyOutlined, BellOutlined,
  MenuOutlined, EyeOutlined, EyeInvisibleOutlined,
  DashboardOutlined, GlobalOutlined, DatabaseOutlined,
  CloudServerOutlined, FolderOutlined, ContainerOutlined,
  MonitorOutlined, SafetyOutlined, FireOutlined,
  FileTextOutlined, CodeOutlined, ClockCircleOutlined,
  AppstoreOutlined, UserOutlined, BgColorsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import { useSettingsStore } from '@/stores/settings';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import NotificationsTab from './NotificationsTab';
import ServerTab from './ServerTab';
import AccentPalettePicker from '@/components/AccentPalettePicker';

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
  issuer_cn?: string;
  expiry?: string;
  type?: string;
  valid_from?: string;
  valid_until?: string;
  ssl_type?: string;
  dns_names?: string[];
  domain?: string;
}

interface DomainCert {
  domain: string;
  ssl_name?: string;
  issuer?: string;
  issuer_cn?: string;
  valid_from?: string;
  valid_until?: string;
  ssl_type?: string;
  auto_renew?: boolean;
  dns_names?: string[];
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const { hiddenMenuKeys, toggleMenuKey } = useSettingsStore();
  const [generalForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [sslInfo, setSSLInfo] = useState<SSLInfo | null>(null);
  const [sslLoading, setSSLLoading] = useState(false);
  const [domainCerts, setDomainCerts] = useState<DomainCert[]>([]);
  const [domainCertsLoading, setDomainCertsLoading] = useState(false);
  const [portForm] = Form.useForm();
  const [portLoading, setPortLoading] = useState(false);
  const [securityForm] = Form.useForm();
  const [securityLoading, setSecurityLoading] = useState(false);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'server' | 'ssl' | 'security' | 'notifications' | 'menu' | 'danger'>('general');

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
      const { data } = await api.get('/ssl/panel');
      const d = data.data || {};
      setSSLInfo({
        enabled: true,
        issuer: d.issuer,
        issuer_cn: d.issuer_cn,
        expiry: d.valid_until,
        type: d.ssl_type,
        valid_from: d.valid_from,
        valid_until: d.valid_until,
        ssl_type: d.ssl_type,
        dns_names: d.dns_names,
        domain: d.domain,
      });
    } catch {
      setSSLInfo({ enabled: false });
    } finally {
      setSSLLoading(false);
    }
  }, []);

  const fetchDomainCerts = useCallback(async () => {
    setDomainCertsLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DomainCert[]>>('/ssl/certificates');
      setDomainCerts(data.data || []);
    } catch {
      setDomainCerts([]);
    } finally {
      setDomainCertsLoading(false);
    }
  }, []);

  const handleDeleteCert = async (domain: string) => {
    try {
      await api.delete(`/ssl/certificates/${encodeURIComponent(domain)}`);
      message.success(`Certificate for ${domain} deleted`);
      fetchDomainCerts();
    } catch {
      message.error('Failed to delete certificate');
    }
  };

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
    fetchDomainCerts();
    fetchTimezones();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveGeneral = async (values: { panel_name: string; language: string; timezone: string; session_timeout: number }) => {
    setSaveLoading(true);
    try {
      const { data: nameResp } = await api.put<ApiResponse<{ name: string }>>('/settings/panel-name', { name: values.panel_name });
      await api.put('/settings/timezone', { timezone: values.timezone });
      await api.put('/settings/session-timeout', { timeout: values.session_timeout * 60 });
      if (values.language && values.language !== i18n.language) {
        await api.put('/settings/language', { lang: values.language });
        i18n.changeLanguage(values.language);
      }
      const store = useSettingsStore.getState();
      store.setTimezone(values.timezone);
      store.setPanelName(nameResp.data.name || values.panel_name);
      message.success(t('common.success'));
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
    { key: 'appearance' as const, icon: <BgColorsOutlined />, label: t('settings.appearance') },
    { key: 'server' as const, icon: <SetIcon.Server size={14} color="currentColor" />, label: 'Server' },
    { key: 'ssl' as const, icon: <SafetyCertificateOutlined />, label: 'SSL' },
    { key: 'security' as const, icon: <LockOutlined />, label: t('settings.security', 'Security') },
    { key: 'notifications' as const, icon: <BellOutlined />, label: 'Notifications' },
    { key: 'menu' as const, icon: <MenuOutlined />, label: 'Menu' },
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
    maxWidth: 'none', borderRadius: 10,
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

  /* ─── Appearance Tab ─── */
  const renderAppearanceTab = () => (
    <div style={sectionBox}>
      {sectionTitle(<BgColorsOutlined style={{ fontSize: 20, color: p.accent }} />, t('settings.appearance'))}
      <AccentPalettePicker />
    </div>
  );

  /* ─── Server Tab — see ServerTab.tsx (bento grid layout) ─── */

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
          {sslInfo?.ssl_type && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Type</span>
              <span style={{
                fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 99,
                background: sslInfo.ssl_type === 'self-signed' ? `${p.amber}15` : `${p.green}15`,
                color: sslInfo.ssl_type === 'self-signed' ? p.amber : p.green,
              }}>
                {sslInfo.ssl_type === 'self-signed' ? 'Self-Signed' : sslInfo.ssl_type === 'letsencrypt' ? "Let's Encrypt" : 'Custom'}
              </span>
            </div>
          )}
          {sslInfo?.issuer && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Issuer</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.issuer}</span>
            </div>
          )}
          {sslInfo?.domain && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Common Name</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.domain}</span>
            </div>
          )}
          {sslInfo?.valid_from && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Valid From</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{formatDateTime(sslInfo.valid_from)}</span>
            </div>
          )}
          {sslInfo?.valid_until && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Valid Until</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{formatDateTime(sslInfo.valid_until)}</span>
            </div>
          )}
          {sslInfo?.dns_names && sslInfo.dns_names.length > 0 && (
            <div style={{ ...infoRow, borderBottom: 'none', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, color: p.textMuted, paddingTop: 2 }}>SANs</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: '70%' }}>
                {sslInfo.dns_names.map((name, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '1px 8px', borderRadius: 4,
                    background: `${p.accent}10`, color: p.accent, fontFamily: 'monospace',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleGenerateSelfSigned} disabled={sslLoading} style={{
            ...btnOutline, opacity: sslLoading ? 0.6 : 1,
          }}>
            <SafetyCertificateOutlined /> Generate Self-Signed (10 years)
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

      {/* ─── Domain Certificates ─── */}
      <div style={{ ...sectionBox, marginTop: 16 }}>
        {sectionTitle(<SafetyCertificateOutlined style={{ fontSize: 20, color: p.accent }} />, 'Domain Certificates')}
        <Spin spinning={domainCertsLoading}>
          {domainCerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: p.textMuted, fontSize: 13 }}>
              No domain certificates found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {domainCerts.map((cert) => {
                const isExpired = cert.valid_until ? new Date(cert.valid_until) < new Date() : false;
                return (
                  <div key={cert.domain} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  }}>
                    <SafetyCertificateOutlined style={{ fontSize: 18, color: isExpired ? p.red : p.green, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: p.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cert.domain}
                      </div>
                      <div style={{ fontSize: 11, color: p.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                        {cert.ssl_type && <span>{cert.ssl_type === 'custom' ? 'Custom' : cert.ssl_type === 'letsencrypt' ? "Let's Encrypt" : cert.ssl_type}</span>}
                        {cert.issuer && <span>Issuer: {cert.issuer}</span>}
                        {cert.valid_until && <span style={{ color: isExpired ? p.red : undefined }}>Expires: {cert.valid_until}</span>}
                      </div>
                      {cert.dns_names && cert.dns_names.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {cert.dns_names.map((name, i) => (
                            <span key={i} style={{
                              fontSize: 10, padding: '0 6px', borderRadius: 3,
                              background: `${p.accent}10`, color: p.accent, fontFamily: 'monospace',
                            }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete certificate for "${cert.domain}"?`)) {
                          handleDeleteCert(cert.domain);
                        }
                      }}
                      style={{
                        ...btnOutline, padding: '4px 10px', color: p.red,
                        borderColor: `${p.red}40`, flexShrink: 0,
                      }}
                      title="Delete certificate"
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
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

  /* ─── Menu Visibility Tab ─── */
  const allMenuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard', locked: true },
    { key: '/websites', icon: <GlobalOutlined />, label: t('sidebar.websites') },
    { key: '/databases', icon: <DatabaseOutlined />, label: t('sidebar.databases') },
    { key: '/ftp', icon: <CloudServerOutlined />, label: t('sidebar.ftp') },
    { key: '/storage', icon: <CloudServerOutlined />, label: 'Storage' },
    { key: '/files', icon: <FolderOutlined />, label: t('sidebar.files') },
    { key: '/docker', icon: <ContainerOutlined />, label: t('sidebar.docker') },
    { key: '/monitor', icon: <MonitorOutlined />, label: t('sidebar.monitor') },
    { key: '/security', icon: <SafetyOutlined />, label: t('sidebar.security') },
    { key: '/firewall', icon: <FireOutlined />, label: 'Firewall' },
    { key: '/waf', icon: <SafetyCertificateOutlined />, label: t('sidebar.waf') },
    { key: '/logs', icon: <FileTextOutlined />, label: t('sidebar.logs') },
    { key: '/terminal', icon: <CodeOutlined />, label: t('sidebar.terminal') },
    { key: '/cron', icon: <ClockCircleOutlined />, label: t('sidebar.cron') },
    { key: '/appstore', icon: <AppstoreOutlined />, label: t('sidebar.appstore') },
    { key: '/settings', icon: <SettingOutlined />, label: t('sidebar.settings'), locked: true },
    { key: '/users', icon: <UserOutlined />, label: t('sidebar.users') },
  ];

  const renderMenuTab = () => (
    <div style={{ ...sectionBox, maxWidth: 'none' }}>
      {sectionTitle(<MenuOutlined style={{ fontSize: 20, color: p.accent }} />, 'Menu Visibility')}
      <p style={{ fontSize: 12, color: p.textMuted, marginBottom: 16 }}>
        Toggle sidebar menu items on or off. Dashboard and Settings are always visible.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 8,
      }}>
        {allMenuItems.map(item => {
          const isHidden = hiddenMenuKeys.includes(item.key);
          const isLocked = item.locked;
          return (
            <button
              key={item.key}
              disabled={isLocked}
              onClick={() => !isLocked && toggleMenuKey(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${isHidden ? p.cardBorder : `${p.accent}40`}`,
                background: isHidden ? (isDark ? 'transparent' : '#fafafa') : `${p.accent}08`,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.5 : 1,
                transition: 'all 0.15s',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span style={{
                fontSize: 16,
                color: isHidden ? p.textMuted : p.accent,
                display: 'flex', alignItems: 'center',
              }}>
                {item.icon}
              </span>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 500,
                color: isHidden ? p.textMuted : p.text,
                textDecoration: isHidden ? 'line-through' : 'none',
              }}>
                {item.label}
              </span>
              <span style={{
                fontSize: 14,
                color: isHidden ? p.textMuted : p.green,
                display: 'flex', alignItems: 'center',
              }}>
                {isLocked ? <LockOutlined /> : isHidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
          {activeTab === 'appearance' && renderAppearanceTab()}
          {activeTab === 'server' && <ServerTab />}
          {activeTab === 'ssl' && renderSSLTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'menu' && renderMenuTab()}
          {activeTab === 'danger' && renderDangerTab()}
        </div>
      </div>
    </div>
  );
}

