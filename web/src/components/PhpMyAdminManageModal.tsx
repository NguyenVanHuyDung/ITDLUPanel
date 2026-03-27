import { useState, useEffect, useCallback } from 'react';
import { Modal, message, Spin } from 'antd';
import {
  DatabaseOutlined, SafetyOutlined, LinkOutlined,
  LockOutlined, GlobalOutlined, KeyOutlined,
  CheckCircleFilled, CloseCircleFilled,
  EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PhpMyAdminConfig {
  public_access: boolean;
  php_version: string;
  access_port: number;
  ssl_enabled: boolean;
  ssl_port: number;
  auth_enabled: boolean;
  auth_user: string;
  auth_password: string;
}

const DEFAULT_CONFIG: PhpMyAdminConfig = {
  public_access: true,
  php_version: '8.3',
  access_port: 888,
  ssl_enabled: false,
  ssl_port: 887,
  auth_enabled: false,
  auth_user: '',
  auth_password: '',
};

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------
const SECTIONS = [
  { key: 'service',  label: 'Service',  icon: <DatabaseOutlined /> },
  { key: 'security', label: 'Security', icon: <SafetyOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ============================================================================
// Main Modal
// ============================================================================
export default function PhpMyAdminManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [section, setSection] = useState<SectionKey>('service');
  const [config, setConfig] = useState<PhpMyAdminConfig>(DEFAULT_CONFIG);
  const [phpVersions, setPhpVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const PMA_ORANGE = '#F89C0E';
  const PMA_ORANGE_LIGHT = isDark ? 'rgba(248,156,14,0.12)' : '#FFF8E6';
  const BG = isDark ? p.headerBg : '#FAFBFC';
  const BORDER = isDark ? p.cardBorder : '#E8EDF2';
  const CARD_BG = isDark ? p.card : '#FFFFFF';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, phpRes] = await Promise.all([
        api.get('/software/phpmyadmin/manager'),
        api.get('/software/phpmyadmin/php-versions'),
      ]);
      if (cfgRes.data?.data) setConfig(cfgRes.data.data);
      if (phpRes.data?.data) setPhpVersions(phpRes.data.data);
    } catch {
      message.error('Failed to load phpMyAdmin configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { fetchData(); setSection('service'); }
  }, [open, fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...config };
      // Don't send empty password — backend keeps existing
      if (!payload.auth_password) delete (payload as any).auth_password;
      await api.put('/software/phpmyadmin/manager', payload);
      message.success('phpMyAdmin configuration saved');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.msg || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (patch: Partial<PhpMyAdminConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  };

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------
  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? '10px 14px' : '12px 18px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    color: active ? PMA_ORANGE : p.text,
    background: active ? PMA_ORANGE_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${PMA_ORANGE}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${PMA_ORANGE}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const cardStyle: React.CSSProperties = {
    padding: '18px 20px',
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: CARD_BG,
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: p.textMuted,
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 280,
    padding: '8px 12px',
    borderRadius: 7,
    border: `1px solid ${BORDER}`,
    background: isDark ? p.inputBg : '#F8FAFC',
    color: p.text,
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748B' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    background: active ? PMA_ORANGE : (isDark ? '#374151' : '#D1D5DB'),
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleDotStyle = (active: boolean): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 3,
    left: active ? 23 : 3,
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  const primaryBtnStyle: React.CSSProperties = {
    padding: '9px 24px',
    borderRadius: 8,
    border: 'none',
    background: PMA_ORANGE,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  const openBtnStyle: React.CSSProperties = {
    padding: '7px 16px',
    borderRadius: 7,
    border: `1px solid ${PMA_ORANGE}`,
    background: 'transparent',
    color: PMA_ORANGE,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s',
  };

  const statusBadge = (on: boolean, labelOn: string, labelOff: string) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: on ? (isDark ? 'rgba(52,211,153,0.15)' : '#ECFDF5') : (isDark ? 'rgba(248,113,113,0.12)' : '#FEF2F2'),
      color: on ? p.green : p.red,
    }}>
      {on ? <CheckCircleFilled /> : <CloseCircleFilled />}
      {on ? labelOn : labelOff}
    </span>
  );

  // ---------------------------------------------------------------------------
  // Service Tab
  // ---------------------------------------------------------------------------
  const renderService = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `linear-gradient(135deg, ${PMA_ORANGE}, #E88B00)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DatabaseOutlined style={{ color: '#fff', fontSize: 20 }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: p.text }}>phpMyAdmin</div>
          <div style={{ fontSize: 11, color: p.textMuted }}>Web-based MySQL/MariaDB administration</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button style={openBtnStyle} onClick={() => {
            const proto = config.ssl_enabled ? 'https' : 'http';
            const port = config.ssl_enabled ? config.ssl_port : config.access_port;
            window.open(`${proto}://${window.location.hostname}:${port}/`, '_blank');
          }}>
            <LinkOutlined /> Open phpMyAdmin
          </button>
        </div>
      </div>

      {/* Public Access */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlobalOutlined style={{ color: PMA_ORANGE, fontSize: 15 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Public Access</span>
          </div>
          {statusBadge(config.public_access, 'Enabled', 'Disabled')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: p.textMuted, maxWidth: 340 }}>
            Allow external access to phpMyAdmin. When disabled, only localhost (127.0.0.1) can access.
          </span>
          <button style={toggleStyle(config.public_access)} onClick={() => updateConfig({ public_access: !config.public_access })}>
            <div style={toggleDotStyle(config.public_access)} />
          </button>
        </div>
      </div>

      {/* PHP Version */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>PHP Version</span>
          <span style={{
            padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            background: isDark ? 'rgba(119,123,180,0.15)' : '#EEEDF5',
            color: '#777BB4',
          }}>
            PHP
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            style={selectStyle}
            value={config.php_version}
            onChange={e => updateConfig({ php_version: e.target.value })}
          >
            {phpVersions.map(v => (
              <option key={v} value={v}>PHP {v}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: p.textMuted }}>
            FPM socket: /run/php/php{config.php_version}-fpm.sock
          </span>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button style={primaryBtnStyle} onClick={handleSave} disabled={saving}>
          {saving ? <Spin size="small" /> : null}
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Security Tab
  // ---------------------------------------------------------------------------
  const renderSecurity = () => (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: p.text, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <SafetyOutlined style={{ color: PMA_ORANGE }} />
        Security Configuration
      </div>

      {/* Access Port */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <GlobalOutlined style={{ color: p.accent, fontSize: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Access Port</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <label style={labelStyle}>HTTP Port</label>
            <input
              type="number"
              style={inputStyle}
              value={config.access_port}
              onChange={e => updateConfig({ access_port: parseInt(e.target.value) || 888 })}
              min={1}
              max={65535}
            />
          </div>
        </div>
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 6,
          background: isDark ? 'rgba(56,189,248,0.08)' : '#F0F9FF',
          fontSize: 11, color: p.textMuted, lineHeight: 1.6,
        }}>
          Default port 888 is configured alongside system ports 22 (SSH) and 8888 (Panel).
          The firewall rule will be updated automatically.
        </div>
      </div>

      {/* OpenSSL / HTTPS */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockOutlined style={{ color: p.green, fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>OpenSSL (HTTPS)</span>
          </div>
          {statusBadge(config.ssl_enabled, 'Active', 'Inactive')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: p.textMuted, maxWidth: 300 }}>
            Enable HTTPS access with a self-signed certificate. A certificate will be generated automatically.
          </span>
          <button style={toggleStyle(config.ssl_enabled)} onClick={() => updateConfig({ ssl_enabled: !config.ssl_enabled })}>
            <div style={toggleDotStyle(config.ssl_enabled)} />
          </button>
        </div>
        {config.ssl_enabled && (
          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>SSL Port</label>
            <input
              type="number"
              style={inputStyle}
              value={config.ssl_port}
              onChange={e => updateConfig({ ssl_port: parseInt(e.target.value) || 887 })}
              min={1}
              max={65535}
            />
            <div style={{
              marginTop: 8, fontSize: 11, color: p.textMuted,
            }}>
              Access via: https://{'{hostname}'}:{config.ssl_port}
            </div>
          </div>
        )}
      </div>

      {/* Basic Auth */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: p.purple, fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Access with Password</span>
          </div>
          {statusBadge(config.auth_enabled, 'Protected', 'Open')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config.auth_enabled ? 14 : 0 }}>
          <span style={{ fontSize: 12, color: p.textMuted, maxWidth: 300 }}>
            Require HTTP basic authentication before accessing phpMyAdmin.
          </span>
          <button style={toggleStyle(config.auth_enabled)} onClick={() => updateConfig({ auth_enabled: !config.auth_enabled })}>
            <div style={toggleDotStyle(config.auth_enabled)} />
          </button>
        </div>
        {config.auth_enabled && (
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            background: isDark ? 'rgba(124,58,237,0.06)' : '#FAF5FF',
            border: `1px solid ${isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE'}`,
          }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={config.auth_user}
                  onChange={e => updateConfig({ auth_user: e.target.value })}
                  placeholder="admin"
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    style={{ ...inputStyle, paddingRight: 36 }}
                    value={config.auth_password}
                    onChange={e => updateConfig({ auth_password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    onClick={() => setShowPw(!showPw)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: p.textMuted, fontSize: 14, padding: 2,
                    }}
                  >
                    {showPw ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>
            </div>
            <div style={{
              marginTop: 10, fontSize: 11, color: p.textMuted, lineHeight: 1.5,
            }}>
              This adds HTTP Basic Authentication before accessing the phpMyAdmin login page.
              Leave password empty to keep the existing password.
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button style={primaryBtnStyle} onClick={handleSave} disabled={saving}>
          {saving ? <Spin size="small" /> : null}
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const renderContent = () => {
    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;
    switch (section) {
      case 'service':  return renderService();
      case 'security': return renderSecurity();
      default:         return null;
    }
  };

  // phpMyAdmin SVG icon
  const pmaIcon = (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none">
      <rect x="2" y="3" width="20" height="18" rx="3" stroke={PMA_ORANGE} strokeWidth="1.5" />
      <path d="M7 8h10M7 12h6M7 16h8" stroke={PMA_ORANGE} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pmaIcon}
          <span style={{ color: p.text }}>phpMyAdmin Manager</span>
        </div>
      }
      width={isMobile ? '95vw' : 780}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 460 }}>
        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 170,
          borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          flexShrink: 0,
          background: BG,
        }}>
          {SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarItemStyle(section === s.key)}
              onClick={() => setSection(s.key)}
              onMouseEnter={e => { if (section !== s.key) (e.currentTarget.style.background = isDark ? 'rgba(248,156,14,0.05)' : '#F5F3EF'); }}
              onMouseLeave={e => { if (section !== s.key) (e.currentTarget.style.background = 'transparent'); }}
            >
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? 16 : 24, overflow: 'auto', maxHeight: isMobile ? '60vh' : '78vh' }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}
