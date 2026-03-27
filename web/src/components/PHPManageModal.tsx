import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Input, Tag, Tooltip, Badge } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, AppstoreOutlined, SettingOutlined,
  FileTextOutlined, CheckCircleFilled, CloseCircleFilled,
  InfoCircleOutlined, SearchOutlined, CloudServerOutlined,
  DownloadOutlined, DeleteOutlined, DatabaseOutlined,
  SafetyCertificateOutlined, PictureOutlined, FileZipOutlined,
  ThunderboltOutlined, GlobalOutlined, FontSizeOutlined,
  ToolOutlined, CalculatorOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------
const SECTIONS = [
  { key: 'service',    label: 'Service',    icon: <PlayCircleOutlined /> },
  { key: 'extensions', label: 'Extensions', icon: <AppstoreOutlined /> },
  { key: 'config',     label: 'Limits',     icon: <SettingOutlined /> },
  { key: 'configfile', label: 'Config File', icon: <CodeOutlined /> },
  { key: 'errorlog',   label: 'Error Log',  icon: <FileTextOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Category icons & labels
// ---------------------------------------------------------------------------
const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  core:        { icon: <ToolOutlined />,              label: 'Core',        color: '#6366F1' },
  database:    { icon: <DatabaseOutlined />,           label: 'Database',    color: '#0EA5E9' },
  web:         { icon: <GlobalOutlined />,             label: 'Web',         color: '#10B981' },
  text:        { icon: <FontSizeOutlined />,           label: 'Text & XML', color: '#F59E0B' },
  math:        { icon: <CalculatorOutlined />,         label: 'Math',       color: '#8B5CF6' },
  security:    { icon: <SafetyCertificateOutlined />,  label: 'Security',   color: '#EF4444' },
  image:       { icon: <PictureOutlined />,            label: 'Image',      color: '#EC4899' },
  compression: { icon: <FileZipOutlined />,            label: 'Compression', color: '#14B8A6' },
  performance: { icon: <ThunderboltOutlined />,        label: 'Performance', color: '#F97316' },
  other:       { icon: <AppstoreOutlined />,           label: 'Other',      color: '#64748B' },
};

// ============================================================================
// Main Modal
// ============================================================================
export default function PHPManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [section, setSection] = useState<SectionKey>('service');
  const [phpVersion, setPHPVersion] = useState<string>('');
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data: resp } = await api.get('/software/phpmyadmin/php-versions');
        const versions: string[] = resp.data || [];
        setAvailableVersions(versions);
        if (versions.length > 0 && !phpVersion) {
          setPHPVersion(versions[versions.length - 1]); // latest version
        }
      } catch { /* ignore */ }
    })();
  }, [open]);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';  // Indigo
  const ACCENT_BG = isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF';
  const BORDER = isDark ? p.cardBorder : '#E2E8F0';
  const SIDEBAR_BG = isDark ? p.headerBg : '#F8FAFC';
  const TEXT_PRIMARY = p.text;
  const TEXT_SECONDARY = p.textMuted;

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? ACCENT : TEXT_PRIMARY,
    background: active ? ACCENT_BG : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${ACCENT}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${ACCENT}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const renderContent = () => {
    if (!phpVersion && section !== 'service') {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: TEXT_SECONDARY }}>
          <InfoCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>No PHP version detected. Please install PHP first.</div>
        </div>
      );
    }
    switch (section) {
      case 'service':    return <ServiceTab version={phpVersion} versions={availableVersions} />;
      case 'extensions': return <ExtensionsTab version={phpVersion} />;
      case 'config':     return <ConfigTab version={phpVersion} />;
      case 'configfile': return <ConfigFileTab version={phpVersion} />;
      case 'errorlog':   return <ErrorLogTab version={phpVersion} />;
      default:           return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <Space>
            <span style={{ fontSize: 18 }}>🐘</span>
            <span>PHP Management</span>
          </Space>
          {availableVersions.length > 1 && (
            <Select
              size="small"
              value={phpVersion}
              onChange={setPHPVersion}
              style={{ width: 100 }}
              options={availableVersions.map(v => ({ label: `PHP ${v}`, value: v }))}
            />
          )}
        </div>
      }
      width={isMobile ? '95vw' : 960}
      styles={{
        body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' },
        header: { borderBottom: `1px solid ${BORDER}` },
      }}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 520 }}>
        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 180,
          borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          flexShrink: 0,
          background: SIDEBAR_BG,
        }}>
          {SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarStyle(section === s.key)}
              onClick={() => setSection(s.key)}
              onMouseEnter={e => { if (section !== s.key) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : '#f0f4f8'; }}
              onMouseLeave={e => { if (section !== s.key) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              {(!isMobile || section === s.key) && <span>{s.label}</span>}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: isMobile ? 16 : 24,
          overflow: 'auto',
          maxHeight: isMobile ? '60vh' : '78vh',
          background: isDark ? p.card : '#fff',
        }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Service Tab
// ============================================================================
function ServiceTab({ version, versions }: { version: string; versions: string[] }) {
  const { p, isDark } = usePalette();
  const [statuses, setStatuses] = useState<Record<string, { running: boolean; version: string }>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  const fetchStatuses = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software/php/status');
      const st = resp.data;
      // status may contain per-version info or single status
      if (version && st) {
        setStatuses({ [version]: { running: st.running || st.is_running, version: st.version || version } });
      }
    } catch {
      // Try each version individually
      const results: Record<string, { running: boolean; version: string }> = {};
      for (const v of versions) {
        try {
          const svcName = `php${v}-fpm`;
          // Use generic status endpoint pattern
          const { data: resp } = await api.get(`/software/${svcName}/status`);
          results[v] = { running: resp.data?.running || resp.data?.is_running, version: v };
        } catch {
          results[v] = { running: false, version: v };
        }
      }
      setStatuses(results);
    } finally {
      setLoading(false);
    }
  }, [version, versions]);

  useEffect(() => {
    setLoading(true);
    // Check each php-fpm version status via systemctl
    const checkAll = async () => {
      const results: Record<string, { running: boolean; version: string }> = {};
      for (const v of versions) {
        results[v] = { running: false, version: v };
      }
      // Use the php status endpoint
      try {
        const { data: resp } = await api.get('/software/php/status');
        const st = resp.data;
        if (st && version) {
          results[version] = { running: st.running || st.is_running, version: st.version || version };
        }
      } catch { /* individual version status already set to false */ }
      setStatuses(results);
      setLoading(false);
    };
    checkAll();
  }, [version, versions]);

  const handleAction = async (action: 'start' | 'stop' | 'restart', ver: string) => {
    const key = `${action}-${ver}`;
    setActionLoading(key);
    try {
      await api.post(`/software/php/${action}`);
      message.success(`PHP ${ver} FPM ${action}ed successfully`);
      setTimeout(() => {
        setLoading(true);
        fetchStatuses();
      }, 1000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${action} PHP-FPM`);
    } finally {
      setActionLoading(null);
    }
  };

  const running = statuses[version]?.running;

  return (
    <div>
      <Text style={{ fontSize: 16, fontWeight: 600, color: p.text, display: 'block', marginBottom: 20 }}>
        PHP-FPM Service
      </Text>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
        <>
          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 20px', borderRadius: 10,
            background: isDark
              ? (running ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)')
              : (running ? '#ECFDF5' : '#FEF2F2'),
            border: `1px solid ${isDark
              ? (running ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)')
              : (running ? '#A7F3D0' : '#FECACA')}`,
            marginBottom: 24,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: running ? p.green : p.red,
              boxShadow: `0 0 8px ${running ? p.green : p.red}50`,
            }} />
            <Text style={{ fontSize: 15, fontWeight: 600, color: running ? p.green : p.red }}>
              {running ? 'Running' : 'Stopped'}
            </Text>
            <Text style={{ fontSize: 12, color: p.textMuted, marginLeft: 'auto' }}>
              PHP {version} FPM
            </Text>
          </div>

          {/* Action buttons */}
          <Space wrap size={12}>
            {running ? (
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => handleAction('stop', version)}
                loading={actionLoading === `stop-${version}`}
                danger
                style={{ borderRadius: 6 }}
              >
                Stop
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction('start', version)}
                loading={actionLoading === `start-${version}`}
                style={{ background: p.green, borderColor: p.green, borderRadius: 6 }}
              >
                Start
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleAction('restart', version)}
              loading={actionLoading === `restart-${version}`}
              style={{ borderRadius: 6 }}
            >
              Restart
            </Button>
          </Space>

          {/* Installed versions summary */}
          {versions.length > 0 && (
            <div style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 8,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
            }}>
              <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 12 }}>
                Installed PHP Versions
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {versions.map(v => (
                  <Tag
                    key={v}
                    color={v === version ? ACCENT : undefined}
                    style={{
                      borderRadius: 6,
                      padding: '4px 12px',
                      fontSize: 13,
                      fontWeight: v === version ? 600 : 400,
                      cursor: 'default',
                    }}
                  >
                    PHP {v}
                    {v === version && ' ●'}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            background: isDark ? 'rgba(99,102,241,0.06)' : '#EEF2FF',
            border: `1px solid ${isDark ? 'rgba(99,102,241,0.15)' : '#C7D2FE'}`,
            fontSize: 12,
            color: p.textMuted,
          }}>
            <InfoCircleOutlined style={{ marginRight: 6, color: ACCENT }} />
            Use the version selector in the header to switch between installed PHP versions.
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Extensions Tab
// ============================================================================
interface ExtensionInfo {
  name: string;
  type: string;
  description: string;
  installed: boolean;
}

function ExtensionsTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  const fetchExtensions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/php/${version}/extensions`);
      setExtensions(resp.data || []);
    } catch {
      message.error('Failed to load extensions');
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { fetchExtensions(); }, [fetchExtensions]);

  const types = useMemo(() => {
    const ts = new Set(extensions.map(e => e.type));
    return ['all', ...Array.from(ts)];
  }, [extensions]);

  const filtered = useMemo(() => {
    return extensions.filter(e => {
      if (filterType !== 'all' && e.type !== filterType) return false;
      if (search && !e.name.toLowerCase().includes(search.toLowerCase()) &&
          !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [extensions, filterType, search]);

  const installedCount = extensions.filter(e => e.installed).length;

  const handleInstall = async (ext: ExtensionInfo) => {
    setActionLoading(prev => new Set(prev).add(ext.name));
    try {
      const endpoint = ext.installed
        ? `/software/php/${version}/extensions/uninstall`
        : `/software/php/${version}/extensions/install`;
      await api.post(endpoint, { extensions: [ext.name] });
      message.success(`${ext.name} ${ext.installed ? 'uninstall' : 'install'} task queued`);
      // Refresh after a delay for the task to complete
      setTimeout(fetchExtensions, 3000);
    } catch (e: any) {
      message.error(e.response?.data?.message || `Failed to ${ext.installed ? 'uninstall' : 'install'} ${ext.name}`);
    } finally {
      setActionLoading(prev => {
        const next = new Set(prev);
        next.delete(ext.name);
        return next;
      });
    }
  };

  return (
    <div>
      {/* Header with stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>
            Extensions
          </Text>
          <Text style={{ fontSize: 12, color: p.textMuted, marginLeft: 8 }}>
            PHP {version}
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge count={installedCount} style={{ backgroundColor: p.green }} showZero>
            <Tag style={{ borderRadius: 6, margin: 0 }}>Installed</Tag>
          </Badge>
          <Badge count={extensions.length - installedCount} style={{ backgroundColor: p.textMuted }} showZero>
            <Tag style={{ borderRadius: 6, margin: 0 }}>Available</Tag>
          </Badge>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined style={{ color: p.textMuted }} />}
          placeholder="Search extensions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 180,
            borderRadius: 8,
            background: isDark ? p.inputBg : '#F8FAFC',
            borderColor: isDark ? p.cardBorder : '#E2E8F0',
          }}
          allowClear
        />
        <Select
          value={filterType}
          onChange={setFilterType}
          style={{ minWidth: 140 }}
          options={types.map(t => ({
            label: t === 'all' ? '🔍 All Types' : `${CATEGORY_META[t]?.label || t}`,
            value: t,
          }))}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 80px',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: p.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
          }}>
            <span>Extension</span>
            <span style={{ textAlign: 'center' }}>Status</span>
            <span style={{ textAlign: 'center' }}>Action</span>
          </div>

          {/* Extension rows */}
          {filtered.map((ext, idx) => {
            const catMeta = CATEGORY_META[ext.type] || CATEGORY_META.other;
            const isLoading = actionLoading.has(ext.name);

            return (
              <div
                key={ext.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 80px',
                  padding: '10px 12px',
                  alignItems: 'center',
                  borderRadius: 6,
                  background: idx % 2 === 0
                    ? 'transparent'
                    : (isDark ? p.rowAlt : '#F8FAFC'),
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? p.rowHover : '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : (isDark ? p.rowAlt : '#F8FAFC')}
              >
                {/* Name + Description */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ color: catMeta.color, fontSize: 14, flexShrink: 0 }}>{catMeta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: 500, color: p.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        {ext.name}
                      </Text>
                      <Tag
                        style={{
                          fontSize: 10,
                          padding: '0 4px',
                          borderRadius: 4,
                          border: 'none',
                          background: isDark ? `${catMeta.color}20` : `${catMeta.color}15`,
                          color: catMeta.color,
                          lineHeight: '18px',
                        }}
                      >
                        {catMeta.label}
                      </Tag>
                    </div>
                    <Text style={{ fontSize: 11, color: p.textMuted, display: 'block' }}>{ext.description}</Text>
                  </div>
                </div>

                {/* Status */}
                <div style={{ textAlign: 'center' }}>
                  {ext.installed ? (
                    <Tooltip title="Installed">
                      <CheckCircleFilled style={{ color: p.green, fontSize: 16 }} />
                    </Tooltip>
                  ) : (
                    <Tooltip title="Not Installed">
                      <CloseCircleFilled style={{ color: isDark ? p.textDim : '#CBD5E1', fontSize: 16 }} />
                    </Tooltip>
                  )}
                </div>

                {/* Action */}
                <div style={{ textAlign: 'center' }}>
                  <Button
                    size="small"
                    type={ext.installed ? 'default' : 'primary'}
                    danger={ext.installed}
                    loading={isLoading}
                    icon={ext.installed ? <DeleteOutlined /> : <DownloadOutlined />}
                    onClick={() => handleInstall(ext)}
                    style={{
                      borderRadius: 6,
                      fontSize: 11,
                      ...(ext.installed ? {} : { background: ACCENT, borderColor: ACCENT }),
                    }}
                  >
                    {ext.installed ? 'Remove' : 'Install'}
                  </Button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: p.textMuted }}>
              No extensions found matching your filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Config (Limits) Tab
// ============================================================================
interface PHPConfig {
  upload_max_filesize: string;
  post_max_size: string;
  max_execution_time: string;
  max_input_time: string;
  memory_limit: string;
  max_input_vars: string;
}

function ConfigTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [config, setConfig] = useState<PHPConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get(`/software/php/${version}/config`);
        setConfig(resp.data);
      } catch {
        message.error('Failed to load PHP config');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put(`/software/php/${version}/config`, config);
      message.success('PHP configuration saved & FPM restarted');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof PHPConfig, value: string) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const FIELDS: { key: keyof PHPConfig; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'upload_max_filesize', label: 'Upload Max Filesize', hint: 'Max size of uploaded file (e.g., 50M, 128M)', icon: <CloudServerOutlined /> },
    { key: 'post_max_size', label: 'Post Max Size', hint: 'Max POST data size, must be >= upload_max_filesize (e.g., 64M)', icon: <CloudServerOutlined /> },
    { key: 'max_execution_time', label: 'Max Execution Time', hint: 'Max script execution time in seconds (e.g., 300)', icon: <ThunderboltOutlined /> },
    { key: 'max_input_time', label: 'Max Input Time', hint: 'Max time to parse input in seconds (e.g., 300)', icon: <ThunderboltOutlined /> },
    { key: 'memory_limit', label: 'Memory Limit', hint: 'Max memory a script can use (e.g., 256M, 512M)', icon: <DatabaseOutlined /> },
    { key: 'max_input_vars', label: 'Max Input Vars', hint: 'Max number of input variables (e.g., 3000)', icon: <SettingOutlined /> },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!config) return <div style={{ textAlign: 'center', padding: 40, color: p.textMuted }}>Failed to load config</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>PHP Limits</Text>
          <Text style={{ fontSize: 12, color: p.textMuted, marginLeft: 8 }}>PHP {version}</Text>
        </div>
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
          style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 6 }}
        >
          Save & Restart FPM
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {FIELDS.map(f => (
          <div
            key={f.key}
            style={{
              padding: 16,
              borderRadius: 10,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: ACCENT, fontSize: 14 }}>{f.icon}</span>
              <Text style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{f.label}</Text>
            </div>
            <Input
              value={config[f.key]}
              onChange={e => updateField(f.key, e.target.value)}
              style={{
                borderRadius: 6,
                background: isDark ? p.inputBg : '#fff',
                borderColor: isDark ? p.cardBorder : '#D1D5DB',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
              }}
            />
            <Text style={{ fontSize: 11, color: p.textMuted, display: 'block', marginTop: 4 }}>
              {f.hint}
            </Text>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div style={{
        marginTop: 16,
        padding: '10px 14px',
        borderRadius: 8,
        background: isDark ? 'rgba(245,158,11,0.06)' : '#FFFBEB',
        border: `1px solid ${isDark ? 'rgba(245,158,11,0.15)' : '#FDE68A'}`,
        fontSize: 12,
        color: isDark ? p.amber : '#92400E',
      }}>
        ⚠️ Saving will update both FPM and CLI php.ini files and restart PHP-FPM service.
      </div>
    </div>
  );
}

// ============================================================================
// Config File Tab (Monaco Editor)
// ============================================================================
function ConfigFileTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get('/software/php/config');
        const cfg = resp.data;
        setContent(typeof cfg === 'string' ? cfg : cfg?.content ?? '');
      } catch {
        setContent('; Failed to load php.ini');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/software/php/config', { content });
      message.success('Configuration saved');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>php.ini</Text>
        <Button
          type="primary"
          size="small"
          onClick={handleSave}
          loading={saving}
          style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 6 }}
        >
          Save
        </Button>
      </div>

      {/* Tips */}
      <div style={{
        padding: '8px 12px',
        borderRadius: 6,
        marginBottom: 12,
        background: isDark ? 'rgba(99,102,241,0.06)' : '#EEF2FF',
        border: `1px solid ${isDark ? 'rgba(99,102,241,0.15)' : '#C7D2FE'}`,
        fontSize: 12,
        color: isDark ? p.textMuted : '#4338CA',
      }}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        Ctrl+F Search  •  Ctrl+H Replace  •  Ctrl+S Save
      </div>

      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`, borderRadius: 8, overflow: 'hidden' }}>
          <Editor
            height="400px"
            defaultLanguage="ini"
            value={content}
            onChange={v => setContent(v || '')}
            theme={isDark ? 'vs-dark' : 'light'}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 4,
            }}
          />
        </div>
      )}

      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 6,
        background: isDark ? 'rgba(245,158,11,0.06)' : '#FFFBEB',
        border: `1px solid ${isDark ? 'rgba(245,158,11,0.15)' : '#FDE68A'}`,
        fontSize: 12,
        color: isDark ? p.amber : '#92400E',
      }}>
        ⚠️ This is the main PHP-FPM configuration file. Incorrect changes may break PHP.
      </div>
    </div>
  );
}

// ============================================================================
// Error Log Tab
// ============================================================================
function ErrorLogTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [logContent, setLogContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get('/software/php/error-log');
        const log = resp.data;
        setLogContent(typeof log === 'string' ? log : log?.content ?? 'No log content available');
      } catch {
        setLogContent('Failed to load error log');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>PHP-FPM Error Log</Text>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => {
            setLoading(true);
            api.get('/software/php/error-log').then(({ data: resp }) => {
              const log = resp.data;
              setLogContent(typeof log === 'string' ? log : log?.content ?? '');
            }).catch(() => setLogContent('Failed to load')).finally(() => setLoading(false));
          }}
          style={{ borderRadius: 6 }}
        >
          Refresh
        </Button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
        <pre style={{
          background: isDark ? '#0D1117' : '#1E293B',
          color: '#E2E8F0',
          padding: 16,
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.6,
          maxHeight: 450,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          border: `1px solid ${isDark ? p.cardBorder : '#334155'}`,
        }}>
          {logContent || 'No log entries found.'}
        </pre>
      )}
    </div>
  );
}
