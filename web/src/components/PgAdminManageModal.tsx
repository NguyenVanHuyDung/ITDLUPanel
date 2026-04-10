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
interface PgAdminConfig {
  public_access: boolean;
  access_port: number;
  ssl_enabled: boolean;
  ssl_port: number;
  auth_enabled: boolean;
  auth_user: string;
  auth_password: string;
}

const DEFAULT_CONFIG: PgAdminConfig = {
  public_access: true,
  access_port: 5050,
  ssl_enabled: false,
  ssl_port: 5051,
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
export default function PgAdminManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [section, setSection] = useState<SectionKey>('service');
  const [config, setConfig] = useState<PgAdminConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const PG_BLUE = '#336791';
  const PG_BLUE_LIGHT = isDark ? 'rgba(51,103,145,0.12)' : '#EBF3FA';
  const BG = isDark ? p.headerBg : '#FAFBFC';
  const BORDER = isDark ? p.cardBorder : '#E8EDF2';
  const CARD_BG = isDark ? p.card : '#FFFFFF';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/software/pgadmin/manager');
      if (res.data?.data) setConfig(res.data.data);
    } catch {
      message.error('Failed to load pgAdmin configuration');
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
      if (!payload.auth_password) delete (payload as any).auth_password;
      await api.put('/software/pgadmin/manager', payload);
      message.success('pgAdmin configuration saved');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.msg || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (patch: Partial<PgAdminConfig>) => {
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
    color: active ? PG_BLUE : p.text,
    background: active ? PG_BLUE_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${PG_BLUE}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${PG_BLUE}` : '2px solid transparent') : 'none',
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

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    background: active ? PG_BLUE : (isDark ? '#374151' : '#D1D5DB'),
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
    background: PG_BLUE,
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
    border: `1px solid ${PG_BLUE}`,
    background: 'transparent',
    color: PG_BLUE,
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
          background: `linear-gradient(135deg, ${PG_BLUE}, #1E4A6E)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DatabaseOutlined style={{ color: '#fff', fontSize: 20 }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: p.text }}>pgAdmin 4</div>
          <div style={{ fontSize: 11, color: p.textMuted }}>Web-based PostgreSQL administration tool</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button style={openBtnStyle} onClick={() => {
            const proto = config.ssl_enabled ? 'https' : 'http';
            const port = config.ssl_enabled ? config.ssl_port : config.access_port;
            window.open(`${proto}://${window.location.hostname}:${port}/`, '_blank');
          }}>
            <LinkOutlined /> Open pgAdmin
          </button>
        </div>
      </div>

      {/* Public Access */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlobalOutlined style={{ color: PG_BLUE, fontSize: 15 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Public Access</span>
          </div>
          {statusBadge(config.public_access, 'Enabled', 'Disabled')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: p.textMuted, maxWidth: 340 }}>
            Allow external access to pgAdmin. When disabled, only localhost (127.0.0.1) can access.
          </span>
          <button style={toggleStyle(config.public_access)} onClick={() => updateConfig({ public_access: !config.public_access })}>
            <div style={toggleDotStyle(config.public_access)} />
          </button>
        </div>
      </div>

      {/* Login Info */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <KeyOutlined style={{ color: PG_BLUE, fontSize: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Default Login</span>
        </div>
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: isDark ? 'rgba(51,103,145,0.08)' : '#F0F7FC',
          border: `1px solid ${isDark ? 'rgba(51,103,145,0.2)' : '#D4E6F1'}`,
          fontSize: 12, color: p.textMuted, lineHeight: 1.7,
        }}>
          <div><strong>Email:</strong> admin@itdlupanel.local</div>
          <div><strong>Password:</strong> admin</div>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
            Change these credentials from the pgAdmin interface after first login.
          </div>
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
        <SafetyOutlined style={{ color: PG_BLUE }} />
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
              onChange={e => updateConfig({ access_port: parseInt(e.target.value) || 5050 })}
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
          Default port 5050. Nginx reverse proxy forwards to pgAdmin's Gunicorn backend.
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
              onChange={e => updateConfig({ ssl_port: parseInt(e.target.value) || 5051 })}
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
            Require HTTP basic authentication before accessing pgAdmin (in addition to pgAdmin's own login).
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
              This adds HTTP Basic Authentication as an extra security layer.
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

  // pgAdmin SVG icon (elephant silhouette)
  const pgIcon = (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none">
      <circle cx="12" cy="12" r="10" stroke={PG_BLUE} strokeWidth="1.5" />
      <path d="M8 8c0-1.5 1.5-3 4-3s4 1.5 4 3c0 2-1 3-1 4s0 2-1 3h-4c-1-1-1-2-1-3s-1-2-1-4z" stroke={PG_BLUE} strokeWidth="1.2" fill="none" />
      <circle cx="10" cy="9" r="0.8" fill={PG_BLUE} />
    </svg>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pgIcon}
          <span style={{ color: p.text }}>pgAdmin Manager</span>
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
              onMouseEnter={e => { if (section !== s.key) (e.currentTarget.style.background = isDark ? 'rgba(51,103,145,0.05)' : '#F0F5FA'); }}
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
