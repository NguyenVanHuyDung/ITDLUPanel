import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Space, message, Typography, Spin, Select, Input, Tag, Tooltip, Badge, Form } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
  CodeOutlined, AppstoreOutlined, SettingOutlined,
  FileTextOutlined, CheckCircleFilled, CloseCircleFilled,
  InfoCircleOutlined, SearchOutlined, CloudServerOutlined,
  DownloadOutlined, DeleteOutlined, DatabaseOutlined,
  SafetyCertificateOutlined, PictureOutlined, FileZipOutlined,
  ThunderboltOutlined, GlobalOutlined, FontSizeOutlined,
  ToolOutlined, CalculatorOutlined, ClockCircleOutlined,
  RocketOutlined,
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
  { key: 'service',    label: 'Service',     icon: <PlayCircleOutlined /> },
  { key: 'extensions', label: 'Extensions',  icon: <AppstoreOutlined /> },
  { key: 'fpmprofile', label: 'FPM Profile', icon: <CloudServerOutlined /> },
  { key: 'config',     label: 'Limits',      icon: <SettingOutlined /> },
  { key: 'opcache',   label: 'OPcache',     icon: <RocketOutlined /> },
  { key: 'disablefn',  label: 'Disable Func', icon: <SafetyCertificateOutlined /> },
  { key: 'configfile', label: 'Config File', icon: <CodeOutlined /> },
  { key: 'errorlog',   label: 'Error Log',   icon: <FileTextOutlined /> },
  { key: 'slowlog',    label: 'Slow Log',    icon: <ClockCircleOutlined /> },
  { key: 'phpinfo',    label: 'PHP Info',    icon: <InfoCircleOutlined /> },
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
      case 'fpmprofile': return <FPMProfileTab version={phpVersion} />;
      case 'config':     return <ConfigTab version={phpVersion} />;
      case 'opcache':    return <OPcacheTab version={phpVersion} />;
      case 'disablefn':  return <DisableFunctionsTab version={phpVersion} />;
      case 'configfile': return <ConfigFileTab version={phpVersion} />;
      case 'errorlog':   return <ErrorLogTab version={phpVersion} />;
      case 'slowlog':    return <SlowLogTab version={phpVersion} />;
      case 'phpinfo':    return <PHPInfoTab version={phpVersion} />;
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
  const [fpmStatus, setFpmStatus] = useState<any>(null);

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

  // Auto-refresh FPM status every 5 seconds
  useEffect(() => {
    if (!version) return;
    const fetchFpmStatus = async () => {
      try {
        const { data: resp } = await api.get(`/software/php/${version}/fpm-status`);
        setFpmStatus(resp.data);
      } catch { setFpmStatus(null); }
    };
    fetchFpmStatus();
    const interval = setInterval(fetchFpmStatus, 5000);
    return () => clearInterval(interval);
  }, [version]);

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

          {/* FPM Load & System Status */}
          {fpmStatus && (
            <div style={{
              marginTop: 24,
              padding: 20,
              borderRadius: 10,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
            }}>
              <Text style={{ fontSize: 14, fontWeight: 600, color: p.text, display: 'block', marginBottom: 16 }}>
                FPM Load & System
              </Text>

              {/* Metric cards row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {/* Workers */}
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: isDark ? 'rgba(99,102,241,0.08)' : '#EEF2FF',
                  border: `1px solid ${isDark ? 'rgba(99,102,241,0.15)' : '#C7D2FE'}`,
                }}>
                  <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Workers</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: ACCENT }}>{fpmStatus.workers ?? 0}</div>
                </div>
                {/* Memory */}
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: isDark ? 'rgba(52,211,153,0.08)' : '#ECFDF5',
                  border: `1px solid ${isDark ? 'rgba(52,211,153,0.15)' : '#A7F3D0'}`,
                }}>
                  <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Memory</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: p.green }}>{fpmStatus.total_memory_mb ?? 0}<span style={{ fontSize: 12, fontWeight: 400 }}> MB</span></div>
                </div>
                {/* CPU */}
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: isDark ? 'rgba(251,191,36,0.08)' : '#FFFBEB',
                  border: `1px solid ${isDark ? 'rgba(251,191,36,0.15)' : '#FDE68A'}`,
                }}>
                  <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>CPU Avg</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: p.amber }}>{fpmStatus.avg_cpu ?? 0}<span style={{ fontSize: 12, fontWeight: 400 }}>%</span></div>
                </div>
                {/* Load Average */}
                {fpmStatus.load_average && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 8,
                    background: isDark ? 'rgba(139,92,246,0.08)' : '#F5F3FF',
                    border: `1px solid ${isDark ? 'rgba(139,92,246,0.15)' : '#DDD6FE'}`,
                  }}>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Load Average</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: p.purple, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fpmStatus.load_average.load1} <span style={{ color: p.textMuted, fontWeight: 400 }}>/ </span>
                      {fpmStatus.load_average.load5} <span style={{ color: p.textMuted, fontWeight: 400 }}>/ </span>
                      {fpmStatus.load_average.load15}
                    </div>
                    <div style={{ fontSize: 10, color: p.textMuted, marginTop: 2 }}>1m / 5m / 15m</div>
                  </div>
                )}
              </div>

              {/* Uptime */}
              {fpmStatus.uptime && (
                <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 14 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  Up since: <span style={{ color: p.text, fontWeight: 500 }}>{fpmStatus.uptime}</span>
                </div>
              )}

              {/* Process table */}
              {fpmStatus.processes?.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}` }}>
                        {['PID', 'CPU %', 'Memory', 'Uptime', 'Role'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: p.textMuted, fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fpmStatus.processes.map((proc: any, i: number) => (
                        <tr key={proc.pid} style={{ background: i % 2 === 0 ? 'transparent' : (isDark ? p.rowAlt : '#F1F5F9') }}>
                          <td style={{ padding: '5px 10px', color: p.text, fontFamily: "'JetBrains Mono', monospace" }}>{proc.pid}</td>
                          <td style={{ padding: '5px 10px', color: p.text }}>{proc.cpu}</td>
                          <td style={{ padding: '5px 10px', color: p.text }}>{proc.memory_mb} MB</td>
                          <td style={{ padding: '5px 10px', color: p.text, fontFamily: "'JetBrains Mono', monospace" }}>{proc.time}</td>
                          <td style={{ padding: '5px 10px' }}>
                            <Tag color={proc.role === 'master' ? 'purple' : 'blue'} style={{ fontSize: 11, borderRadius: 4 }}>
                              {proc.role}
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
            background: `${p.green}18`, color: p.green,
          }}>
            Installed <strong>{installedCount}</strong>
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
            background: `${p.textMuted}18`, color: p.textMuted,
          }}>
            Available <strong>{extensions.length - installedCount}</strong>
          </span>
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
// FPM Profile Tab
// ============================================================================
interface FPMConfig {
  pm: string;
  max_children: string;
  start_servers: string;
  min_spare_servers: string;
  max_spare_servers: string;
  max_requests: string;
  request_terminate_timeout: string;
  request_slowlog_timeout: string;
  slowlog: string;
  listen: string;
  user: string;
  group: string;
}

function FPMProfileTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [config, setConfig] = useState<FPMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get(`/software/php/${version}/fpm-config`);
        setConfig(resp.data);
      } catch {
        message.error('Failed to load FPM config');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put(`/software/php/${version}/fpm-config`, config);
      message.success('FPM pool config saved & FPM restarted');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to save FPM config');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof FPMConfig, value: string) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const PM_OPTIONS = [
    { value: 'dynamic', label: 'Dynamic', desc: 'Children created on demand, kept within min/max spare range' },
    { value: 'static', label: 'Static', desc: 'Fixed number of children (max_children always alive)' },
    { value: 'ondemand', label: 'On Demand', desc: 'No children at startup, spawned only when needed' },
  ];

  type FieldDef = { key: keyof FPMConfig; label: string; hint: string; icon: React.ReactNode; showFor?: string[] };

  const FIELDS: FieldDef[] = [
    { key: 'max_children', label: 'Max Children', hint: 'Maximum number of child processes (all PM modes)', icon: <CloudServerOutlined /> },
    { key: 'start_servers', label: 'Start Servers', hint: 'Number of children created at startup', icon: <PlayCircleOutlined />, showFor: ['dynamic'] },
    { key: 'min_spare_servers', label: 'Min Spare Servers', hint: 'Minimum number of idle children', icon: <PlayCircleOutlined />, showFor: ['dynamic'] },
    { key: 'max_spare_servers', label: 'Max Spare Servers', hint: 'Maximum number of idle children', icon: <PlayCircleOutlined />, showFor: ['dynamic'] },
    { key: 'max_requests', label: 'Max Requests', hint: 'Requests before worker respawns (0 = unlimited)', icon: <ThunderboltOutlined /> },
    { key: 'request_terminate_timeout', label: 'Request Terminate Timeout', hint: 'Max time per request in seconds (0 = unlimited)', icon: <ThunderboltOutlined /> },
    { key: 'request_slowlog_timeout', label: 'Slowlog Timeout', hint: 'Threshold for slow request logging in seconds', icon: <FileTextOutlined /> },
    { key: 'slowlog', label: 'Slowlog Path', hint: 'Path to the slow request log file', icon: <FileTextOutlined /> },
  ];

  const SOCKET_FIELDS: FieldDef[] = [
    { key: 'listen', label: 'Listen Address', hint: 'Socket path or ip:port (e.g., /run/php/phpX.X-fpm.sock or 127.0.0.1:9000)', icon: <GlobalOutlined /> },
    { key: 'user', label: 'User', hint: 'Unix user for worker processes', icon: <ToolOutlined /> },
    { key: 'group', label: 'Group', hint: 'Unix group for worker processes', icon: <ToolOutlined /> },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!config) return <div style={{ textAlign: 'center', padding: 40, color: p.textMuted }}>Failed to load FPM config</div>;

  const visibleFields = FIELDS.filter(f => !f.showFor || f.showFor.includes(config.pm));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>FPM Pool Profile</Text>
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

      {/* Process Manager Mode */}
      <div style={{
        padding: 16,
        borderRadius: 10,
        background: isDark ? p.codeBg : '#F8FAFC',
        border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
        marginBottom: 16,
      }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 12 }}>
          <CloudServerOutlined style={{ marginRight: 6, color: ACCENT }} />
          Process Manager Mode
        </Text>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PM_OPTIONS.map(opt => (
            <div
              key={opt.value}
              onClick={() => updateField('pm', opt.value)}
              style={{
                flex: '1 1 auto',
                minWidth: 140,
                padding: '10px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `2px solid ${config.pm === opt.value ? ACCENT : (isDark ? p.cardBorder : '#E2E8F0')}`,
                background: config.pm === opt.value ? (isDark ? 'rgba(99,102,241,0.1)' : '#EEF2FF') : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: 600, color: config.pm === opt.value ? ACCENT : p.text, display: 'block' }}>
                {opt.label}
              </Text>
              <Text style={{ fontSize: 11, color: p.textMuted }}>{opt.desc}</Text>
            </div>
          ))}
        </div>
      </div>

      {/* Worker Settings */}
      <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 12 }}>
        Worker Settings
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {visibleFields.map(f => (
          <div
            key={f.key}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: ACCENT, fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
            <div style={{ flex: '1 1 160px', minWidth: 120 }}>
              <Text style={{ fontSize: 13, fontWeight: 500, color: p.text, display: 'block' }}>{f.label}</Text>
              <Text style={{ fontSize: 11, color: p.textMuted }}>{f.hint}</Text>
            </div>
            <Input
              value={config[f.key]}
              onChange={e => updateField(f.key, e.target.value)}
              style={{
                width: 180,
                borderRadius: 6,
                background: isDark ? p.inputBg : '#fff',
                borderColor: isDark ? p.cardBorder : '#D1D5DB',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
              }}
            />
          </div>
        ))}
      </div>

      {/* Socket & Identity */}
      <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 12 }}>
        Socket & Identity
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {SOCKET_FIELDS.map(f => (
          <div
            key={f.key}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: ACCENT, fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
            <div style={{ flex: '1 1 160px', minWidth: 120 }}>
              <Text style={{ fontSize: 13, fontWeight: 500, color: p.text, display: 'block' }}>{f.label}</Text>
              <Text style={{ fontSize: 11, color: p.textMuted }}>{f.hint}</Text>
            </div>
            <Input
              value={config[f.key]}
              onChange={e => updateField(f.key, e.target.value)}
              style={{
                width: 280,
                borderRadius: 6,
                background: isDark ? p.inputBg : '#fff',
                borderColor: isDark ? p.cardBorder : '#D1D5DB',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
              }}
            />
          </div>
        ))}
      </div>

      {/* Warning */}
      <div style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: isDark ? 'rgba(245,158,11,0.06)' : '#FFFBEB',
        border: `1px solid ${isDark ? 'rgba(245,158,11,0.15)' : '#FDE68A'}`,
        fontSize: 12,
        color: isDark ? p.amber : '#92400E',
      }}>
        ⚠️ Incorrect FPM settings may cause PHP to stop serving requests. Changes will restart PHP-FPM immediately.
      </div>
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
// OPcache Tab
// ============================================================================
interface OPcacheConfig {
  opcache_enable: string;
  opcache_memory_consumption: string;
  opcache_max_accelerated_files: string;
  opcache_validate_timestamps: string;
  opcache_revalidate_freq: string;
  opcache_save_comments: string;
  opcache_enable_cli: string;
  opcache_interned_strings_buffer: string;
}

function OPcacheTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [config, setConfig] = useState<OPcacheConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get(`/software/php/${version}/opcache`);
        setConfig(resp.data);
      } catch {
        message.error('Failed to load OPcache config');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put(`/software/php/${version}/opcache`, config);
      message.success('OPcache config saved & FPM restarted');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to save OPcache config');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof OPcacheConfig, value: string) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const FIELDS: { key: keyof OPcacheConfig; label: string; hint: string; icon: React.ReactNode; type?: 'select'; options?: string[] }[] = [
    { key: 'opcache_enable', label: 'Enable OPcache', hint: 'Enable the opcode cache (1 = on, 0 = off)', icon: <ThunderboltOutlined />, type: 'select', options: ['1', '0'] },
    { key: 'opcache_memory_consumption', label: 'Memory (MB)', hint: 'Shared memory size for opcache in megabytes (e.g., 128, 256)', icon: <DatabaseOutlined /> },
    { key: 'opcache_interned_strings_buffer', label: 'Interned Strings Buffer (MB)', hint: 'Memory for interned strings in MB (e.g., 16, 32)', icon: <DatabaseOutlined /> },
    { key: 'opcache_max_accelerated_files', label: 'Max Accelerated Files', hint: 'Max cached scripts. Recommended: 20000 for WordPress/CMS', icon: <CloudServerOutlined /> },
    { key: 'opcache_validate_timestamps', label: 'Validate Timestamps', hint: 'Check file timestamps for changes (1 = yes, 0 = no — set 0 for production)', icon: <ClockCircleOutlined />, type: 'select', options: ['1', '0'] },
    { key: 'opcache_revalidate_freq', label: 'Revalidate Frequency (s)', hint: 'How often to check for changes in seconds (e.g., 2, 60)', icon: <ClockCircleOutlined /> },
    { key: 'opcache_save_comments', label: 'Save Comments', hint: 'Cache doc comments. Required by some frameworks (1 = yes)', icon: <FileTextOutlined />, type: 'select', options: ['1', '0'] },
    { key: 'opcache_enable_cli', label: 'Enable CLI', hint: 'Enable opcache for CLI scripts (1 = on, 0 = off)', icon: <ToolOutlined />, type: 'select', options: ['1', '0'] },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!config) return <div style={{ textAlign: 'center', padding: 40, color: p.textMuted }}>Failed to load OPcache config</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>OPcache Configuration</Text>
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

      {/* Info banner */}
      <div style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: isDark ? 'rgba(99,102,241,0.08)' : '#EEF2FF',
        border: `1px solid ${isDark ? 'rgba(99,102,241,0.2)' : '#C7D2FE'}`,
        marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <ThunderboltOutlined style={{ color: ACCENT, fontSize: 16 }} />
        <Text style={{ fontSize: 12, color: isDark ? '#A5B4FC' : '#4338CA' }}>
          OPcache caches compiled PHP scripts in memory, dramatically improving performance. Changes require FPM restart.
        </Text>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FIELDS.map(f => (
          <div
            key={f.key}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: isDark ? p.codeBg : '#F8FAFC',
              border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: ACCENT, fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
            <div style={{ flex: '1 1 160px', minWidth: 120 }}>
              <Text style={{ fontSize: 13, fontWeight: 500, color: p.text, display: 'block' }}>{f.label}</Text>
              <Text style={{ fontSize: 11, color: p.textMuted }}>{f.hint}</Text>
            </div>
            {f.type === 'select' ? (
              <Select
                value={config[f.key]}
                onChange={v => updateField(f.key, v)}
                options={f.options!.map(o => ({ value: o, label: o === '1' ? 'Enabled' : o === '0' ? 'Disabled' : o }))}
                style={{ width: 140 }}
              />
            ) : (
              <Input
                value={config[f.key]}
                onChange={e => updateField(f.key, e.target.value)}
                style={{
                  width: 180,
                  borderRadius: 6,
                  background: isDark ? p.inputBg : '#fff',
                  borderColor: isDark ? p.cardBorder : '#D1D5DB',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Recommendation box */}
      <div style={{
        marginTop: 16,
        padding: '10px 14px',
        borderRadius: 8,
        background: isDark ? 'rgba(16,185,129,0.06)' : '#ECFDF5',
        border: `1px solid ${isDark ? 'rgba(16,185,129,0.15)' : '#A7F3D0'}`,
      }}>
        <Text style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#065F46' }}>
          <strong>Recommended for WordPress/CMS:</strong> memory=256, max_files=20000, validate_timestamps=1, revalidate_freq=2, save_comments=1
        </Text>
      </div>
    </div>
  );
}

// ============================================================================
// Disable Functions Tab
// ============================================================================
const COMMON_DANGEROUS_FUNCTIONS = [
  'exec', 'passthru', 'shell_exec', 'system', 'proc_open', 'popen',
  'curl_exec', 'curl_multi_exec', 'parse_ini_file', 'show_source',
  'proc_close', 'proc_get_status', 'proc_nice', 'proc_terminate',
  'dl', 'putenv', 'getenv', 'phpinfo', 'pcntl_exec', 'pcntl_fork',
  'pcntl_signal', 'pcntl_waitpid', 'pcntl_wexitstatus', 'pcntl_setpriority',
  'chroot', 'chgrp', 'chown', 'link', 'symlink', 'ini_set', 'ini_alter',
  'ini_restore', 'apache_child_terminate', 'define_syslog_variables',
  'syslog', 'openlog', 'escapeshellcmd', 'escapeshellarg',
];

function DisableFunctionsTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [functions, setFunctions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newFunc, setNewFunc] = useState('');
  const [search, setSearch] = useState('');

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  const fetchFunctions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/php/${version}/disable-functions`);
      setFunctions(resp.data?.functions || []);
    } catch {
      message.error('Failed to load disable_functions');
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { fetchFunctions(); }, [fetchFunctions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/software/php/${version}/disable-functions`, { functions });
      message.success('disable_functions saved & FPM restarted');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addFunction = (fn: string) => {
    const trimmed = fn.trim().toLowerCase();
    if (!trimmed || functions.includes(trimmed)) return;
    setFunctions(prev => [...prev, trimmed].sort());
    setNewFunc('');
  };

  const removeFunction = (fn: string) => {
    setFunctions(prev => prev.filter(f => f !== fn));
  };

  const suggestionsNotAdded = COMMON_DANGEROUS_FUNCTIONS.filter(
    f => !functions.includes(f) && (!search || f.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredFunctions = functions.filter(
    f => !search || f.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Disable Functions</Text>
          <Text style={{ fontSize: 12, color: p.textMuted, marginLeft: 8 }}>PHP {version}</Text>
        </div>
        <Space>
          <Badge count={functions.length} style={{ backgroundColor: p.red }} showZero>
            <Tag style={{ borderRadius: 6, margin: 0 }}>Disabled</Tag>
          </Badge>
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 6 }}
          >
            Save & Restart FPM
          </Button>
        </Space>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
        <>
          {/* Add new function */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              placeholder="Add function name (e.g., exec, system)"
              value={newFunc}
              onChange={e => setNewFunc(e.target.value)}
              onPressEnter={() => addFunction(newFunc)}
              style={{
                flex: 1,
                borderRadius: 8,
                background: isDark ? p.inputBg : '#F8FAFC',
                borderColor: isDark ? p.cardBorder : '#E2E8F0',
              }}
            />
            <Button
              type="primary"
              onClick={() => addFunction(newFunc)}
              disabled={!newFunc.trim()}
              style={{ borderRadius: 8, background: ACCENT, borderColor: ACCENT }}
            >
              Add
            </Button>
          </div>

          {/* Search */}
          <Input
            prefix={<SearchOutlined style={{ color: p.textMuted }} />}
            placeholder="Search functions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{
              marginBottom: 16,
              borderRadius: 8,
              background: isDark ? p.inputBg : '#F8FAFC',
              borderColor: isDark ? p.cardBorder : '#E2E8F0',
            }}
          />

          {/* Current disabled functions */}
          <div style={{
            padding: 16,
            borderRadius: 10,
            background: isDark ? p.codeBg : '#F8FAFC',
            border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 10 }}>
              <SafetyCertificateOutlined style={{ marginRight: 6, color: p.red }} />
              Disabled Functions ({filteredFunctions.length})
            </Text>
            {filteredFunctions.length === 0 ? (
              <Text style={{ fontSize: 12, color: p.textMuted }}>
                {search ? 'No matching functions.' : 'No functions disabled. PHP functions are unrestricted.'}
              </Text>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {filteredFunctions.map(fn => (
                  <Tag
                    key={fn}
                    closable
                    onClose={() => removeFunction(fn)}
                    style={{
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: isDark ? 'rgba(248,113,113,0.1)' : '#FEF2F2',
                      border: `1px solid ${isDark ? 'rgba(248,113,113,0.25)' : '#FECACA'}`,
                      color: p.red,
                    }}
                  >
                    {fn}
                  </Tag>
                ))}
              </div>
            )}
          </div>

          {/* Quick-add common dangerous functions */}
          <div style={{
            padding: 16,
            borderRadius: 10,
            background: isDark ? p.codeBg : '#FFFBEB',
            border: `1px solid ${isDark ? p.cardBorder : '#FDE68A'}`,
          }}>
            <Text style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'block', marginBottom: 10 }}>
              <ToolOutlined style={{ marginRight: 6, color: isDark ? p.amber : '#D97706' }} />
              Common Dangerous Functions — click to disable
            </Text>
            {suggestionsNotAdded.length === 0 ? (
              <Text style={{ fontSize: 12, color: p.textMuted }}>All common dangerous functions are already disabled.</Text>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestionsNotAdded.map(fn => (
                  <Tag
                    key={fn}
                    onClick={() => addFunction(fn)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: isDark ? 'rgba(251,191,36,0.08)' : '#FEF9C3',
                      border: `1px solid ${isDark ? 'rgba(251,191,36,0.2)' : '#FDE68A'}`,
                      color: isDark ? p.amber : '#92400E',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(251,191,36,0.15)' : '#FEF08A'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(251,191,36,0.08)' : '#FEF9C3'; }}
                  >
                    + {fn}
                  </Tag>
                ))}
              </div>
            )}
          </div>

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
            Disabling dangerous functions improves security by preventing PHP scripts from executing system commands, modifying the environment, or accessing sensitive server resources.
          </div>
        </>
      )}
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
        const { data: resp } = await api.get(`/software/php/${version}/config-file`);
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
      await api.put(`/software/php/${version}/config-file`, { content });
      message.success('Configuration saved & FPM restarted');
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
            theme="vs-dark"
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
  const [logPath, setLogPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  const fetchLog = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/php/${version}/error-log?lines=${n}`);
      setLogContent(resp.data?.content || '(empty)');
      setLogPath(resp.data?.log_path || '');
    } catch {
      setLogContent('Failed to load error log');
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { fetchLog(lines); }, [fetchLog, lines]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>PHP-FPM Error Log</Text>
          {logPath && (
            <Text style={{ fontSize: 11, color: p.textMuted, display: 'block' }}>
              {logPath}
            </Text>
          )}
        </div>
        <Space>
          <Text style={{ fontSize: 12, color: p.textMuted }}>Last</Text>
          {[50, 100, 500].map(n => (
            <Button
              key={n}
              size="small"
              type={lines === n ? 'primary' : 'default'}
              onClick={() => setLines(n)}
              style={lines === n ? { background: ACCENT, borderColor: ACCENT, borderRadius: 4 } : { borderRadius: 4 }}
            >
              {n}
            </Button>
          ))}
          <Text style={{ fontSize: 12, color: p.textMuted }}>lines</Text>
        </Space>
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

// ============================================================================
// Slow Log Tab
// ============================================================================
function SlowLogTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [logContent, setLogContent] = useState('');
  const [logPath, setLogPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);
  const [enabled, setEnabled] = useState(false);
  const [timeout, setTimeout_] = useState('5s');
  const [saving, setSaving] = useState(false);

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';

  const fetchLog = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/software/php/${version}/slow-log?lines=${n}`);
      const d = resp.data;
      setLogContent(d?.content || '');
      setLogPath(d?.log_path || '');
      setEnabled(d?.enabled || false);
      if (d?.timeout && d.timeout !== '0') setTimeout_(d.timeout);
    } catch {
      setLogContent('Failed to load slow log');
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { fetchLog(lines); }, [fetchLog, lines]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await api.put(`/software/php/${version}/slow-log-config`, { enabled, timeout: timeout });
      message.success('Slow log configuration updated');
      fetchLog(lines);
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Failed to update slow log config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Text style={{ fontSize: 16, fontWeight: 600, color: p.text, display: 'block', marginBottom: 4 }}>
        PHP-FPM Slow Log
      </Text>
      {logPath && (
        <Text style={{ fontSize: 11, color: p.textMuted, display: 'block', marginBottom: 16 }}>
          {logPath}
        </Text>
      )}

      {/* Config section */}
      <div style={{
        padding: 14,
        borderRadius: 8,
        background: isDark ? p.codeBg : '#F8FAFC',
        border: `1px solid ${isDark ? p.cardBorder : '#E2E8F0'}`,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, color: p.text }}>Slow Log:</Text>
          <Button
            size="small"
            type={enabled ? 'primary' : 'default'}
            onClick={() => setEnabled(!enabled)}
            style={enabled ? { background: p.green, borderColor: p.green, borderRadius: 4, fontSize: 12 } : { borderRadius: 4, fontSize: 12 }}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, color: p.textMuted }}>Timeout:</Text>
          <Input
            size="small"
            value={timeout}
            onChange={e => setTimeout_(e.target.value)}
            style={{ width: 70, borderRadius: 4, background: isDark ? p.inputBg : '#fff' }}
            disabled={!enabled}
          />
        </div>
        <Button
          size="small"
          type="primary"
          onClick={handleSaveConfig}
          loading={saving}
          style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 4, fontSize: 12 }}
        >
          Save
        </Button>
      </div>

      {/* Line selector + refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Text style={{ fontSize: 12, color: p.textMuted }}>Last</Text>
          {[50, 100, 500].map(n => (
            <Button
              key={n}
              size="small"
              type={lines === n ? 'primary' : 'default'}
              onClick={() => setLines(n)}
              style={lines === n ? { background: ACCENT, borderColor: ACCENT, borderRadius: 4 } : { borderRadius: 4 }}
            >
              {n}
            </Button>
          ))}
          <Text style={{ fontSize: 12, color: p.textMuted }}>lines</Text>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => fetchLog(lines)}
            style={{ borderRadius: 4 }}
          />
        </Space>
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
          maxHeight: 400,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          border: `1px solid ${isDark ? p.cardBorder : '#334155'}`,
        }}>
          {logContent || 'No slow log entries found.'}
        </pre>
      )}
    </div>
  );
}

// ============================================================================
// PHP Info Tab — clean structured dashboard
// ============================================================================

interface PHPInfoSection {
  name: string;
  directives: { key: string; value: string }[];
}

function parsePHPInfoOutput(raw: string): {
  overview: Record<string, string>;
  modules: PHPInfoSection[];
  extensions: string[];
} {
  const overview: Record<string, string> = {};
  const modules: PHPInfoSection[] = [];
  const extensions: string[] = [];
  const lines = raw.split('\n');

  // First pass: extract overview from top section (before first module)
  let currentModule: PHPInfoSection | null = null;
  let inOverview = true;
  const separator = '_______________________________________________________________________';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed === 'phpinfo()' || trimmed.startsWith('This program') ||
        trimmed.startsWith('PHP License') || trimmed.startsWith('Zend Engine') ||
        trimmed.startsWith('with Zend') || trimmed.includes(separator)) {
      continue;
    }

    // "Configuration" marks the transition to modules
    if (trimmed === 'Configuration') {
      inOverview = false;
      continue;
    }

    if (trimmed.includes(' => ')) {
      const idx = trimmed.indexOf(' => ');
      const key = trimmed.substring(0, idx).trim();
      let value = trimmed.substring(idx + 4).trim();
      // Handle "local => master" pattern: take local value
      if (value.includes(' => ')) {
        value = value.substring(0, value.indexOf(' => ')).trim();
      }

      if (inOverview) {
        overview[key] = value;
      } else if (currentModule) {
        currentModule.directives.push({ key, value });
      }
    } else if (!inOverview && !trimmed.includes('=>') && trimmed.length < 60) {
      // Module header - a standalone line that's a section name
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
      // Verify it's a section header by checking the next line is a directive or empty
      if (nextNonEmpty && (nextNonEmpty.includes('=>') || nextNonEmpty.trim() === '' || nextNonEmpty.trim().length < 60)) {
        if (currentModule && currentModule.directives.length > 0) {
          modules.push(currentModule);
        }
        currentModule = { name: trimmed, directives: [] };
        extensions.push(trimmed);
      }
    }
  }
  if (currentModule && currentModule.directives.length > 0) {
    modules.push(currentModule);
  }

  return { overview, modules, extensions };
}

function PHPInfoTab({ version }: { version: string }) {
  const { p, isDark } = usePalette();
  const [rawInfo, setRawInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const ACCENT = isDark ? '#818CF8' : '#4F46E5';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';
  const borderColor = isDark ? p.cardBorder : '#E2E8F0';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get(`/software/php/${version}/phpinfo`);
        setRawInfo(resp.data?.info || '');
      } catch {
        setRawInfo('');
      } finally {
        setLoading(false);
      }
    })();
  }, [version]);

  const { overview, modules, extensions } = useMemo(() => parsePHPInfoOutput(rawInfo), [rawInfo]);

  const filteredModules = useMemo(() => {
    if (!filter.trim()) return modules;
    const q = filter.toLowerCase();
    return modules
      .map(m => ({
        ...m,
        directives: m.directives.filter(d =>
          d.key.toLowerCase().includes(q) || d.value.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
        ),
      }))
      .filter(m => m.directives.length > 0);
  }, [modules, filter]);

  const toggleModule = (name: string) =>
    setExpandedModules(prev => ({ ...prev, [name]: !prev[name] }));

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    modules.forEach(m => { all[m.name] = true; });
    setExpandedModules(all);
  };
  const collapseAll = () => setExpandedModules({});

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!rawInfo) return <div style={{ textAlign: 'center', padding: 40, color: p.textMuted }}>Failed to load PHP info</div>;

  // Key overview items to show as cards
  const infoCards: { label: string; key: string; color: string }[] = [
    { label: 'PHP Version', key: 'PHP Version', color: ACCENT },
    { label: 'Server API', key: 'Server API', color: p.green },
    { label: 'Zend Engine', key: 'Zend Extension', color: p.purple },
    { label: 'Thread Safety', key: 'Thread Safety', color: p.amber },
    { label: 'Config Path', key: 'Loaded Configuration File', color: p.cyan },
    { label: 'Build Date', key: 'Build Date', color: p.textMuted },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, color: p.text }}>
          PHP {overview['PHP Version'] || version}
        </Text>
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: p.textMuted }} />}
          placeholder="Search directives..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          allowClear
          style={{ width: 220, borderRadius: 6, background: isDark ? p.inputBg : '#fff' }}
        />
      </div>

      <div style={{ maxHeight: 530, overflow: 'auto' }}>
        {/* Overview cards */}
        {!filter && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 8, marginBottom: 12,
            }}>
              {infoCards.map(c => {
                const val = overview[c.key];
                if (!val) return null;
                return (
                  <div key={c.key} style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: cardBg, border: `1px solid ${borderColor}`,
                  }}>
                    <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: c.color, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{val}</div>
                  </div>
                );
              })}
            </div>

            {/* System info */}
            {overview['System'] && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                background: cardBg, border: `1px solid ${borderColor}`,
                fontSize: 11, color: p.textMuted,
              }}>
                <strong style={{ color: p.text }}>System:</strong> {overview['System']}
              </div>
            )}

            {/* Loaded extensions count */}
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: isDark ? 'rgba(99,102,241,0.06)' : '#EEF2FF',
              border: `1px solid ${isDark ? 'rgba(99,102,241,0.12)' : '#C7D2FE'}`,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>
                {extensions.length} Modules Loaded
              </span>
              <span style={{ fontSize: 11, color: p.textMuted }}>|</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {extensions.slice(0, 20).map(ext => (
                  <Tag key={ext} style={{ fontSize: 10, borderRadius: 3, margin: 0, padding: '0 6px', lineHeight: '18px' }}>{ext}</Tag>
                ))}
                {extensions.length > 20 && (
                  <Tag style={{ fontSize: 10, borderRadius: 3, margin: 0, padding: '0 6px', lineHeight: '18px' }}>+{extensions.length - 20} more</Tag>
                )}
              </div>
            </div>
          </>
        )}

        {/* Controls */}
        {!filter && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Button size="small" type="link" onClick={expandAll} style={{ fontSize: 11, padding: 0, color: ACCENT }}>Expand All</Button>
            <Button size="small" type="link" onClick={collapseAll} style={{ fontSize: 11, padding: 0, color: p.textMuted }}>Collapse All</Button>
          </div>
        )}

        {/* Modules */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredModules.map(mod => {
            const isOpen = filter ? true : expandedModules[mod.name];
            return (
              <div key={mod.name} style={{
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                overflow: 'hidden',
              }}>
                <div
                  onClick={() => toggleModule(mod.name)}
                  style={{
                    padding: '6px 12px',
                    background: isDark ? 'rgba(255,255,255,0.02)' : '#F1F5F9',
                    cursor: 'pointer', userSelect: 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>{mod.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: p.textMuted }}>{mod.directives.length}</span>
                    <span style={{
                      color: p.textMuted, fontSize: 10,
                      transition: 'transform 0.15s',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      display: 'inline-block',
                    }}>▼</span>
                  </div>
                </div>
                {isOpen && (
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <tbody>
                      {mod.directives.map((d, i) => (
                        <tr key={`${d.key}-${i}`} style={{
                          background: i % 2 === 0 ? 'transparent' : (isDark ? p.rowAlt : '#FAFAFA'),
                        }}>
                          <td style={{
                            padding: '3px 12px', color: p.textMuted, fontWeight: 500,
                            width: '38%', verticalAlign: 'top',
                          }}>
                            {filter ? highlightText(d.key, filter, p) : d.key}
                          </td>
                          <td style={{
                            padding: '3px 12px', color: p.text,
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
                            wordBreak: 'break-all',
                          }}>
                            {filter ? highlightText(d.value, filter, p) : (
                              d.value === 'no value' || d.value === 'Off' || d.value === 'disabled'
                                ? <span style={{ color: p.textDim }}>{d.value}</span>
                                : d.value === 'On' || d.value === 'enabled' || d.value === 'yes'
                                  ? <span style={{ color: p.green }}>{d.value}</span>
                                  : d.value
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {filteredModules.length === 0 && filter && (
            <div style={{ textAlign: 'center', padding: 24, color: p.textMuted, fontSize: 13 }}>
              No results for "<strong>{filter}</strong>"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightText(text: string, filter: string, p: any) {
  if (!filter.trim()) return text;
  const regex = new RegExp(`(${filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <span key={i} style={{ background: '#F59E0B', color: '#000', borderRadius: 2, padding: '0 2px' }}>{part}</span>
      : part
  );
}
