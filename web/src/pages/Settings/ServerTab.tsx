import { useState, useEffect, useCallback, useRef } from 'react';
import { Spin, Popconfirm, message } from 'antd';
import {
  ReloadOutlined,
  CopyOutlined,
  GlobalOutlined,
  CloudServerOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined as RestartIcon,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { formatDateTime } from '@/lib/datetime';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface SystemMetrics {
  system?: {
    hostname: string;
    os: string;
    kernel: string;
    uptime: number;
    panel_version: string;
  };
  cpu?: {
    model: string;
    cores: number;
    usage_percent: number;
  };
  memory?: {
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  };
  disk?: Array<{
    device: string;
    mountpoint: string;
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  }>;
  load?: {
    load1: number;
    load5: number;
    load15: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 ? 2 : 1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const copyText = (text: string) => {
  navigator.clipboard.writeText(text).then(
    () => message.success('Copied to clipboard'),
    () => message.error('Copy failed'),
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface BentoTileProps {
  children: React.ReactNode;
  span?: number;        // Grid column span (1-12)
  rowSpan?: number;     // Grid row span (1+)
  accent?: string;      // Optional accent color
  padding?: number;
}

function BentoTile({ children, span = 4, rowSpan = 1, accent, padding = 20 }: BentoTileProps) {
  const { p, isDark } = usePalette();
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        gridRow: `span ${rowSpan}`,
        background: p.card,
        border: `1px solid ${p.cardBorder}`,
        borderRadius: 14,
        padding,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
        transition: 'border-color 0.15s, transform 0.15s',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
      onMouseEnter={(e) => {
        if (accent) e.currentTarget.style.borderColor = `${accent}50`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = p.cardBorder;
      }}
    >
      {accent && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${accent}, ${accent}40)`,
            opacity: 0.7,
          }}
        />
      )}
      {children}
    </div>
  );
}

function TileHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  const { p } = usePalette();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 14, gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: p.accent, display: 'flex', alignItems: 'center', fontSize: 15 }}>{icon}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: p.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {title}
        </span>
      </div>
      {action}
    </div>
  );
}

function InfoLine({ label, value, copyable, mono }: { label: string; value: React.ReactNode; copyable?: string; mono?: boolean }) {
  const { p } = usePalette();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', gap: 12,
      borderBottom: `1px solid ${p.cardBorder}`,
    }}>
      <span style={{ fontSize: 12, color: p.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 500, color: p.text,
        fontFamily: mono ? 'monospace' : undefined,
        textAlign: 'right', minWidth: 0, wordBreak: 'break-all',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        {copyable && (
          <button
            onClick={() => copyText(copyable)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 2, color: p.textMuted, display: 'flex',
            }}
            title="Copy"
          >
            <CopyOutlined style={{ fontSize: 11 }} />
          </button>
        )}
      </span>
    </div>
  );
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  const { p } = usePalette();
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 99,
      background: p.barTrack, overflow: 'hidden',
    }}>
      <div style={{
        width: `${safe}%`, height: '100%',
        background: color, borderRadius: 99,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function ResourceTile({ label, used, total, percent, color }: { label: string; used: string; total: string; percent: number; color: string }) {
  const { p } = usePalette();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: p.textMuted, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{percent.toFixed(1)}%</span>
      </div>
      <UsageBar percent={percent} color={color} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: p.textMuted }}>
        <span>{used}</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

function IPBadge({ ip, type }: { ip: string; type: 'public' | 'local' }) {
  const { p } = usePalette();
  const color = type === 'public' ? p.green : p.accent;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 8,
      background: `${color}10`, border: `1px solid ${color}30`,
      fontSize: 12, maxWidth: '100%',
    }}>
      <span style={{
        fontFamily: 'monospace', fontWeight: 600, color,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {ip}
      </span>
      <button
        onClick={() => copyText(ip)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, color: p.textMuted, display: 'flex', flexShrink: 0,
        }}
      >
        <CopyOutlined style={{ fontSize: 10 }} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ServerTab() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();

  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [panelR, serverR, metricsR] = await Promise.allSettled([
        api.get<ApiResponse<PanelInfo>>('/settings/panel-info'),
        api.get<ApiResponse<ServerInfo>>('/settings/server-info'),
        api.get<ApiResponse<SystemMetrics>>('/monitor/system'),
      ]);
      if (panelR.status === 'fulfilled') setPanelInfo(panelR.value.data.data);
      if (serverR.status === 'fulfilled') setServerInfo(serverR.value.data.data);
      if (metricsR.status === 'fulfilled') setMetrics(metricsR.value.data.data);
    } catch {
      message.error('Failed to load server info');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh metrics every 5s
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(async () => {
        try {
          const { data } = await api.get<ApiResponse<SystemMetrics>>('/monitor/system');
          setMetrics(data.data);
        } catch {
          // Silently fail on poll
        }
      }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  const handleRestartNginx = async () => {
    setRestarting(true);
    try {
      await api.post('/software/nginx/restart');
      message.success('Nginx restarted successfully');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to restart Nginx');
    } finally {
      setRestarting(false);
    }
  };

  // Derived colors
  const cpuColor = (metrics?.cpu?.usage_percent ?? 0) > 80 ? p.red
    : (metrics?.cpu?.usage_percent ?? 0) > 60 ? p.amber : p.green;
  const memColor = (metrics?.memory?.usage_percent ?? 0) > 80 ? p.red
    : (metrics?.memory?.usage_percent ?? 0) > 60 ? p.amber : p.green;
  const primaryDisk = metrics?.disk?.[0];
  const diskColor = (primaryDisk?.usage_percent ?? 0) > 80 ? p.red
    : (primaryDisk?.usage_percent ?? 0) > 60 ? p.amber : p.green;

  // Bento grid template
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)',
    gridAutoRows: 'minmax(min-content, auto)',
    gap: 14,
    alignItems: 'stretch',
  };

  return (
    <Spin spinning={loading && !panelInfo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: p.card,
          border: `1px solid ${p.cardBorder}`, borderRadius: 10,
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThunderboltOutlined style={{ color: p.accent, fontSize: 16 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>
              Server Overview
            </span>
            {autoRefresh && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontWeight: 600, color: p.green,
                padding: '1px 8px', borderRadius: 99,
                background: `${p.green}15`, textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 99, background: p.green,
                  animation: 'pulse 2s infinite',
                }} />
                Live
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${p.cardBorder}`,
                background: autoRefresh ? `${p.green}12` : 'transparent',
                color: autoRefresh ? p.green : p.textMuted,
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {autoRefresh ? '⏸ Pause' : '▶ Resume'} auto-refresh
            </button>
            <button
              onClick={fetchAll}
              disabled={loading}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.text,
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <ReloadOutlined /> Refresh
            </button>
            <Popconfirm
              title="Restart Nginx?"
              description="This will briefly interrupt web services served by Nginx."
              okText="Restart"
              okButtonProps={{ danger: true }}
              onConfirm={handleRestartNginx}
            >
              <button
                disabled={restarting}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  border: `1px solid ${p.amber}50`,
                  background: `${p.amber}10`,
                  color: p.amber,
                  fontSize: 11, fontWeight: 500, cursor: restarting ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  opacity: restarting ? 0.6 : 1,
                }}
              >
                <RestartIcon /> Restart Nginx
              </button>
            </Popconfirm>
          </div>
        </div>

        {/* Bento grid */}
        <div style={gridStyle}>
          {/* Hero tile: Panel identity (large) */}
          <BentoTile span={isMobile ? 1 : 8} rowSpan={2} accent={p.accent}>
            <TileHeader
              icon={<CloudServerOutlined />}
              title={t('settings.panel_info', 'Panel Information')}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `linear-gradient(135deg, ${p.accent}25, ${p.accent}10)`,
                border: `1px solid ${p.accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CloudServerOutlined style={{ fontSize: 28, color: p.accent }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: p.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {panelInfo?.panel_name || 'ITDLUPanel'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 99,
                    background: `${p.accent}15`, color: p.accent,
                  }}>
                    v{panelInfo?.version || '0.1.0'}
                  </span>
                  {panelInfo?.ssl_enabled && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 99,
                      background: `${p.green}15`, color: p.green,
                    }}>
                      <CheckCircleOutlined style={{ fontSize: 10 }} /> HTTPS
                    </span>
                  )}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 500, color: p.textMuted,
                  }}>
                    <SafetyCertificateOutlined style={{ fontSize: 10 }} />
                    Port {panelInfo?.port || '—'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <InfoLine
                label="Uptime"
                value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: p.green }}>
                    <ClockCircleOutlined style={{ fontSize: 11 }} />
                    {panelInfo?.uptime || '—'}
                  </span>
                }
              />
              <InfoLine label="Started at" value={formatDateTime(panelInfo?.started_at)} />
              <InfoLine label="Go runtime" value={panelInfo?.go_version || '—'} mono />
              <InfoLine
                label="Admin path"
                value={<code style={{ fontFamily: 'monospace', color: p.accent }}>{panelInfo?.admin_path || '/'}</code>}
              />
            </div>
          </BentoTile>

          {/* System resources (medium) */}
          <BentoTile span={isMobile ? 1 : 4} rowSpan={2} accent={cpuColor}>
            <TileHeader icon={<DesktopOutlined />} title="System Resources" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {metrics?.cpu ? (
                <ResourceTile
                  label="CPU"
                  used={`${(metrics.cpu.usage_percent).toFixed(1)}%`}
                  total={`${metrics.cpu.cores} cores`}
                  percent={metrics.cpu.usage_percent}
                  color={cpuColor}
                />
              ) : (
                <PlaceholderRow />
              )}
              {metrics?.memory ? (
                <ResourceTile
                  label="Memory"
                  used={formatBytes(metrics.memory.used)}
                  total={formatBytes(metrics.memory.total)}
                  percent={metrics.memory.usage_percent}
                  color={memColor}
                />
              ) : (
                <PlaceholderRow />
              )}
              {primaryDisk ? (
                <ResourceTile
                  label={`Disk (${primaryDisk.mountpoint})`}
                  used={formatBytes(primaryDisk.used)}
                  total={formatBytes(primaryDisk.total)}
                  percent={primaryDisk.usage_percent}
                  color={diskColor}
                />
              ) : (
                <PlaceholderRow />
              )}
              {metrics?.load && (
                <div style={{
                  display: 'flex', justifyContent: 'space-around',
                  padding: '8px 10px', borderRadius: 8,
                  background: p.rowAlt, border: `1px solid ${p.cardBorder}`,
                }}>
                  <LoadStat label="1m" value={metrics.load.load1.toFixed(2)} />
                  <LoadStat label="5m" value={metrics.load.load5.toFixed(2)} />
                  <LoadStat label="15m" value={metrics.load.load15.toFixed(2)} />
                </div>
              )}
            </div>
          </BentoTile>

          {/* Network (medium) */}
          <BentoTile span={isMobile ? 1 : 6} accent={p.cyan}>
            <TileHeader icon={<GlobalOutlined />} title={t('settings.server_network', 'Server Network')} />
            <InfoLine label="Hostname" value={serverInfo?.hostname || '—'} copyable={serverInfo?.hostname} mono />
            {serverInfo?.public_ip && (
              <div style={{ padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}` }}>
                <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 6 }}>Public IP</div>
                <IPBadge ip={serverInfo.public_ip} type="public" />
              </div>
            )}
            {serverInfo?.local_ips && serverInfo.local_ips.length > 0 && (
              <div style={{ padding: '8px 0' }}>
                <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 6 }}>
                  Local IP{serverInfo.local_ips.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {serverInfo.local_ips.map((ip, i) => (
                    <IPBadge key={i} ip={ip} type="local" />
                  ))}
                </div>
              </div>
            )}
          </BentoTile>

          {/* Host info (small) */}
          <BentoTile span={isMobile ? 1 : 3} accent={p.purple}>
            <TileHeader icon={<ApiOutlined />} title="Host" />
            <InfoLine label="OS" value={serverInfo?.os || '—'} />
            <InfoLine label="Arch" value={serverInfo?.arch || '—'} mono />
            <InfoLine label="Kernel" value={metrics?.system?.kernel || '—'} mono />
            {metrics?.system?.uptime != null && (
              <InfoLine
                label="Host uptime"
                value={
                  <span style={{ color: p.green, fontWeight: 600 }}>
                    {formatUptime(metrics.system.uptime)}
                  </span>
                }
              />
            )}
          </BentoTile>

          {/* Services status placeholder (small) */}
          <BentoTile span={isMobile ? 1 : 3} accent={p.green}>
            <TileHeader icon={<CheckCircleOutlined />} title="Quick Info" />
            <InfoLine
              label="Status"
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: p.green, fontWeight: 600 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 99, background: p.green,
                    boxShadow: `0 0 0 3px ${p.green}30`,
                  }} />
                  Operational
                </span>
              }
            />
            <InfoLine
              label="Load avg"
              value={
                metrics?.load
                  ? `${metrics.load.load1.toFixed(2)} / ${metrics.load.load5.toFixed(2)} / ${metrics.load.load15.toFixed(2)}`
                  : '—'
              }
              mono
            />
            <InfoLine
              label="Cores"
              value={metrics?.cpu?.cores ?? '—'}
            />
            <InfoLine
              label="Total RAM"
              value={metrics?.memory ? formatBytes(metrics.memory.total) : '—'}
            />
          </BentoTile>
        </div>
      </div>

      {/* CSS animation for live indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </Spin>
  );
}

// Small helpers local to the file
function PlaceholderRow() {
  const { p } = usePalette();
  return (
    <div style={{
      height: 48, borderRadius: 8, background: p.rowAlt,
      border: `1px dashed ${p.cardBorder}`,
    }} />
  );
}

function LoadStat({ label, value }: { label: string; value: string }) {
  const { p } = usePalette();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: p.text, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}
