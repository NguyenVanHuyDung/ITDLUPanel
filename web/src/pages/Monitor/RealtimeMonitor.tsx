import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Row, Col, Skeleton, Tooltip, Tag, Switch } from 'antd';
import {
  DashboardOutlined,
  HddOutlined,
  SwapOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  FundProjectionScreenOutlined,
  FundOutlined,
} from '@ant-design/icons';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '@/services/api';
import { useThemeStore } from '@/stores/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RealtimeDataPoint {
  time: string;
  cpu: number;
  memory: number;
  swap: number;
  netIn: number;    // KB/s
  netOut: number;   // KB/s
  diskRead: number; // KB/s
  diskWrite: number;// KB/s
}

interface SystemOverview {
  system?: { hostname: string; os: string; kernel: string; uptime: number; panel_version: string };
  cpu?: {
    model: string;
    cores: number;
    physical_cores: number;
    usage_percent: number;
    load_average: number[];
    per_core_percent: number[];
    total_processes: number;
    active_processes: number;
  };
  memory?: { total: number; used: number; available: number; usage_percent: number; buffers: number; cached: number };
  swap?: { total: number; used: number; free: number; usage_percent: number };
  disk?: {
    total: number; used: number; available: number; usage_percent: number;
    fs_type: string; mount_point: string; device: string;
  };
  disk_io?: { read_bytes: number; write_bytes: number };
  network?: { bytes_sent: number; bytes_recv: number };
  counts?: { sites: number; databases: number; ftp_accounts: number; cron_jobs: number; running_tasks: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const MAX_POINTS = 60; // 60 points × 5s = 5 minutes of sliding window

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const lightColors = {
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  accent: '#1565C0',
  lightBlue: '#1E88E5',
  cyan: '#0288D1',
  success: '#4CAF50',
  warning: '#FF9800',
  purple: '#7E57C2',
  red: '#EF4444',
  text: '#1E293B',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  barTrack: '#E2E8F0',
  grid: '#F1F5F9',
};

const darkColors = {
  card: '#111827',
  cardBorder: '#1E293B',
  accent: '#60A5FA',
  lightBlue: '#38BDF8',
  cyan: '#22D3EE',
  success: '#34D399',
  warning: '#FBBF24',
  purple: '#A78BFA',
  red: '#F87171',
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  textDim: '#475569',
  barTrack: 'rgba(30,41,59,0.8)',
  grid: 'rgba(51,65,85,0.4)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function fmtUptime(secs: number): string {
  if (!secs || secs < 0) return '—';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label, unit = '%' }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(148, 163, 184, 0.3)',
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 11,
      color: '#E2E8F0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>
      <div style={{ color: '#94A3B8', marginBottom: 3, fontSize: 10 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 12, lineHeight: 1.6 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  isDark: boolean;
  percent?: number;        // 0..100 - draws a progress bar
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
}

function StatCard({ icon, label, value, sub, color, isDark, percent, trend, trendValue }: StatCardProps) {
  const trendColor = trend === 'up' ? '#EF4444' : trend === 'down' ? '#10B981' : '#94A3B8';
  return (
    <div style={{
      background: isDark ? darkColors.card : lightColors.card,
      border: `1px solid ${isDark ? darkColors.cardBorder : lightColors.cardBorder}`,
      borderRadius: 8,
      padding: '14px 16px',
      height: '100%',
      display: 'flex', flexDirection: 'column', gap: 6,
      position: 'relative', overflow: 'hidden',
      transition: 'box-shadow 0.2s, transform 0.2s',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${color}20`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      {/* Subtle accent strip on the left */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: color, opacity: 0.85,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `${color}18`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
          }}>
            {icon}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 0.6, color: isDark ? darkColors.textMuted : lightColors.textMuted,
          }}>
            {label}
          </div>
        </div>
        {trend && trendValue && (
          <Tooltip title={`${trend === 'up' ? 'Higher' : trend === 'down' ? 'Lower' : 'Stable'} than previous reading`}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: trendColor,
              display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>
              {trend === 'up' ? <ArrowUpOutlined /> : trend === 'down' ? <ArrowDownOutlined /> : <RiseOutlined />}
              {trendValue}
            </span>
          </Tooltip>
        )}
      </div>

      <div style={{
        fontSize: 22, fontWeight: 700, color: isDark ? darkColors.text : lightColors.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        lineHeight: 1.1,
      }}>
        {value}
      </div>

      {sub && (
        <div style={{ fontSize: 11, color: isDark ? darkColors.textMuted : lightColors.textMuted }}>
          {sub}
        </div>
      )}

      {typeof percent === 'number' && (
        <div style={{
          height: 4, borderRadius: 2,
          background: isDark ? darkColors.barTrack : lightColors.barTrack,
          overflow: 'hidden', marginTop: 4,
        }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, percent))}%`,
            height: '100%',
            background: color,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: percent > 80 ? `0 0 8px ${color}80` : 'none',
          }} />
        </div>
      )}
    </div>
  );
}

function MiniAreaChart({ data, dataKey, color, isDark, height = 70, yDomain }: {
  data: RealtimeDataPoint[];
  dataKey: 'cpu' | 'memory' | 'swap';
  color: string;
  isDark: boolean;
  height?: number;
  yDomain?: [number, number];
}) {
  const id = `realtime-${dataKey}-grad`;
  const c = isDark ? darkColors : lightColors;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis hide domain={yDomain || [0, 100]} />
        <RTooltip content={<ChartTooltip unit="%" />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '2 2' }} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fill={`url(#${id})`}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniLineChart({ data, isDark, height = 70 }: {
  data: RealtimeDataPoint[];
  isDark: boolean;
  height?: number;
}) {
  const c = isDark ? darkColors : lightColors;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <YAxis hide />
        <RTooltip content={<ChartTooltip unit=" KB/s" />} cursor={{ stroke: c.accent, strokeWidth: 1, strokeDasharray: '2 2' }} />
        <Line type="monotone" dataKey="netIn" name="In" stroke={c.success} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="netOut" name="Out" stroke={c.warning} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RealtimeMonitor() {
  const { mode } = useThemeStore();
  const isDark = mode === 'dark';
  const c = isDark ? darkColors : lightColors;

  const [enabled, setEnabled] = useState(true);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [series, setSeries] = useState<RealtimeDataPoint[]>([]);
  const prevNetRef = useRef<{ sent: number; recv: number; at: number } | null>(null);
  const errorCountRef = useRef(0);

  // Stable fetch function. Calculates per-second rates from cumulative
  // network/disk counters.
  const fetchOnce = useCallback(async () => {
    try {
      const resp = await api.get<{ data: SystemOverview }>('/monitor/system');
      const data: SystemOverview = resp.data?.data || {};
      const now = new Date();
      setOverview(data);
      setLastUpdate(now);
      setLoading(false);
      errorCountRef.current = 0;

      // Calculate rates
      let netInRate = 0, netOutRate = 0;
      if (prevNetRef.current && data.network) {
        const dtSec = Math.max((now.getTime() - prevNetRef.current.at) / 1000, 0.1);
        netInRate = Math.max(0, ((data.network.bytes_recv - prevNetRef.current.recv) / 1024) / dtSec);
        netOutRate = Math.max(0, ((data.network.bytes_sent - prevNetRef.current.sent) / 1024) / dtSec);
      }
      if (data.network) {
        prevNetRef.current = {
          sent: data.network.bytes_sent,
          recv: data.network.bytes_recv,
          at: now.getTime(),
        };
      }

      // Disk I/O rate (read/write_bytes) - same approach
      const prevDiskRef = (fetchOnce as any)._prevDisk as { read: number; write: number; at: number } | undefined;
      let diskReadRate = 0, diskWriteRate = 0;
      if (prevDiskRef && data.disk_io) {
        const dtSec = Math.max((now.getTime() - prevDiskRef.at) / 1000, 0.1);
        diskReadRate = Math.max(0, ((data.disk_io.read_bytes - prevDiskRef.read) / 1024) / dtSec);
        diskWriteRate = Math.max(0, ((data.disk_io.write_bytes - prevDiskRef.write) / 1024) / dtSec);
      }
      (fetchOnce as any)._prevDisk = data.disk_io
        ? { read: data.disk_io.read_bytes, write: data.disk_io.write_bytes, at: now.getTime() }
        : prevDiskRef;

      setSeries((prev) => {
        const point: RealtimeDataPoint = {
          time: fmtTime(now),
          cpu: data.cpu?.usage_percent ?? 0,
          memory: data.memory?.usage_percent ?? 0,
          swap: data.swap?.usage_percent ?? 0,
          netIn: parseFloat(netInRate.toFixed(1)),
          netOut: parseFloat(netOutRate.toFixed(1)),
          diskRead: parseFloat(diskReadRate.toFixed(1)),
          diskWrite: parseFloat(diskWriteRate.toFixed(1)),
        };
        const next = [...prev, point];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    } catch {
      errorCountRef.current += 1;
      setLoading(false);
    }
  }, []);

  // Polling
  useEffect(() => {
    if (!enabled) return;
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchOnce]);

  // Derived values
  const cpu = overview?.cpu?.usage_percent ?? 0;
  const mem = overview?.memory?.usage_percent ?? 0;
  const swp = overview?.swap?.usage_percent ?? 0;
  const disk = overview?.disk?.usage_percent ?? 0;
  const cpuPrev = series.length >= 2 ? series[series.length - 2].cpu : cpu;
  const memPrev = series.length >= 2 ? series[series.length - 2].memory : mem;
  const cpuTrend = cpu > cpuPrev + 0.5 ? 'up' : cpu < cpuPrev - 0.5 ? 'down' : 'flat';
  const memTrend = mem > memPrev + 0.5 ? 'up' : mem < memPrev - 0.5 ? 'down' : 'flat';

  const netInLatest = series.length > 0 ? series[series.length - 1].netIn : 0;
  const netOutLatest = series.length > 0 ? series[series.length - 1].netOut : 0;

  const loadAvg = useMemo(() => overview?.cpu?.load_average || [0, 0, 0], [overview]);
  const cores = overview?.cpu?.cores || 1;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header bar */}
      <div style={{
        background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 12,
        border: '1px solid #7DD3FC',
      }}>
        <ThunderboltOutlined style={{ fontSize: 14, color: '#0369A1' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#0369A1', whiteSpace: 'nowrap' }}>
          Realtime
        </span>
        <span style={{ color: '#7DD3FC' }}>|</span>
        {loading ? (
          <Skeleton.Input active size="small" style={{ width: 180 }} />
        ) : (
          <>
            <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 6px' }}>
              <ClockCircleOutlined /> {lastUpdate ? `Updated ${fmtTime(lastUpdate)}` : '—'}
            </Tag>
            <Tag color={enabled ? 'green' : 'default'} style={{ margin: 0, fontSize: 10, padding: '0 6px' }}>
              {enabled ? 'Live' : 'Paused'}
            </Tag>
            {overview?.system && (
              <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 6px' }}>
                {overview.system.hostname} · {overview.system.os?.split(' ').slice(0, 2).join(' ')}
              </Tag>
            )}
            {overview?.system?.uptime !== undefined && (
              <Tag style={{ margin: 0, fontSize: 10, padding: '0 6px', background: 'rgba(255,255,255,0.6)' }}>
                Uptime: {fmtUptime(overview.system.uptime)}
              </Tag>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#0C4A6E', fontWeight: 500 }}>Auto-refresh</span>
        <Switch
          size="small"
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      {/* Stat cards row */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={12} md={6}>
          <StatCard
            icon={<FundProjectionScreenOutlined />}
            label="CPU"
            value={`${cpu.toFixed(1)}%`}
            sub={overview?.cpu ? `${overview.cpu.model?.split(' ').slice(0, 3).join(' ')} · ${cores} cores` : '—'}
            color={c.accent}
            isDark={isDark}
            percent={cpu}
            trend={cpuTrend}
            trendValue={`${Math.abs(cpu - cpuPrev).toFixed(1)}%`}
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <StatCard
            icon={<DashboardOutlined />}
            label="Memory"
            value={`${mem.toFixed(1)}%`}
            sub={overview?.memory ? `${fmtBytes(overview.memory.used)} / ${fmtBytes(overview.memory.total)}` : '—'}
            color={c.cyan}
            isDark={isDark}
            percent={mem}
            trend={memTrend}
            trendValue={`${Math.abs(mem - memPrev).toFixed(1)}%`}
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <StatCard
            icon={<HddOutlined />}
            label="Disk"
            value={`${disk.toFixed(1)}%`}
            sub={overview?.disk ? `${fmtBytes(overview.disk.used)} / ${fmtBytes(overview.disk.total)} · ${overview.disk.mount_point}` : '—'}
            color={c.success}
            isDark={isDark}
            percent={disk}
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <StatCard
            icon={<SwapOutlined />}
            label="Swap"
            value={`${swp.toFixed(1)}%`}
            sub={overview?.swap ? `${fmtBytes(overview.swap.used)} / ${fmtBytes(overview.swap.total)}` : '—'}
            color={c.warning}
            isDark={isDark}
            percent={swp}
          />
        </Col>
      </Row>

      {/* Charts row */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <div style={{
            background: isDark ? c.card : c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '10px 14px',
            height: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <FundProjectionScreenOutlined style={{ marginRight: 4, color: c.accent }} />CPU Trend
              </span>
              <span style={{ fontSize: 10, color: c.textDim }}>last {Math.min(series.length * 5, 300)}s</span>
            </div>
            {series.length < 2 ? (
              <Skeleton active paragraph={{ rows: 2 }} title={false} style={{ marginTop: 8 }} />
            ) : (
              <MiniAreaChart data={series} dataKey="cpu" color={c.accent} isDark={isDark} />
            )}
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '10px 14px',
            height: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <DashboardOutlined style={{ marginRight: 4, color: c.cyan }} />Memory Trend
              </span>
              <span style={{ fontSize: 10, color: c.textDim }}>last {Math.min(series.length * 5, 300)}s</span>
            </div>
            {series.length < 2 ? (
              <Skeleton active paragraph={{ rows: 2 }} title={false} style={{ marginTop: 8 }} />
            ) : (
              <MiniAreaChart data={series} dataKey="memory" color={c.cyan} isDark={isDark} />
            )}
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '10px 14px',
            height: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <CloudDownloadOutlined style={{ color: c.success }} />
                  <CloudUploadOutlined style={{ color: c.warning }} />
                </span>
                Network
              </span>
              <span style={{ fontSize: 10, color: c.textDim }}>
                {netInLatest.toFixed(1)} ↓ · {netOutLatest.toFixed(1)} ↑ KB/s
              </span>
            </div>
            {series.length < 2 ? (
              <Skeleton active paragraph={{ rows: 2 }} title={false} style={{ marginTop: 8 }} />
            ) : (
              <MiniLineChart data={series} isDark={isDark} />
            )}
          </div>
        </Col>
      </Row>

      {/* Secondary row: Load average + processes + counts */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <div style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Load Average
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c.textDim }}>1 min</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: loadAvg[0] > cores ? c.red : c.text }}>
                  {loadAvg[0]?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c.textDim }}>5 min</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>
                  {loadAvg[1]?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c.textDim }}>15 min</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.text }}>
                  {loadAvg[2]?.toFixed(2) || '0.00'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: c.textDim, marginTop: 6 }}>
              {cores} cores · {overview?.cpu?.total_processes ?? '—'} processes ({overview?.cpu?.active_processes ?? '—'} active)
            </div>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Network I/O (total)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CloudUploadOutlined style={{ fontSize: 18, color: c.warning }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c.textDim }}>Sent</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>
                  {fmtBytes(overview?.network?.bytes_sent || 0)}
                </div>
              </div>
              <div style={{ width: 1, height: 28, background: c.cardBorder }} />
              <CloudDownloadOutlined style={{ fontSize: 18, color: c.success }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c.textDim }}>Received</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>
                  {fmtBytes(overview?.network?.bytes_recv || 0)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: c.textDim, marginTop: 6 }}>
              Disk I/O: R {fmtBytes(overview?.disk_io?.read_bytes || 0)} · W {fmtBytes(overview?.disk_io?.write_bytes || 0)}
            </div>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Panel Resources
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <Tooltip title="Websites"><div>
                <div style={{ fontSize: 10, color: c.textDim }}>Sites</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{overview?.counts?.sites ?? '—'}</div>
              </div></Tooltip>
              <Tooltip title="Databases"><div>
                <div style={{ fontSize: 10, color: c.textDim }}>Databases</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{overview?.counts?.databases ?? '—'}</div>
              </div></Tooltip>
              <Tooltip title="FTP accounts"><div>
                <div style={{ fontSize: 10, color: c.textDim }}>FTP</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{overview?.counts?.ftp_accounts ?? '—'}</div>
              </div></Tooltip>
              <Tooltip title="Cron jobs"><div>
                <div style={{ fontSize: 10, color: c.textDim }}>Cron</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{overview?.counts?.cron_jobs ?? '—'}</div>
              </div></Tooltip>
              <Tooltip title="Running tasks" style={{ gridColumn: 'span 2' }}><div>
                <div style={{ fontSize: 10, color: c.textDim }}>Running tasks</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{overview?.counts?.running_tasks ?? '—'}</div>
              </div></Tooltip>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
