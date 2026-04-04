import { useState, useEffect, useCallback, useMemo } from 'react';
import { Col, Row, DatePicker, Switch, Tooltip, Spin, InputNumber, message, Collapse, Popconfirm, Modal } from 'antd';
import {
  HistoryOutlined,
  SettingOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import { panelDayjs } from '@/lib/datetime';
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
import dayjs from 'dayjs';
import api from '@/services/api';

const { RangePicker } = DatePicker;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MetricRecord {
  timestamp: string;
  cpu_percent: number;
  mem_percent: number;
  mem_used: number;
  mem_total: number;
  swap_percent: number;
  disk_percent: number;
  disk_used: number;
  disk_total: number;
  disk_read: number;
  disk_write: number;
  net_sent: number;
  net_recv: number;
  load1: number;
  load5: number;
  load15: number;
}

interface MonitorSettings {
  enabled: boolean;
  interval: number;
  retention_raw: number;
  retention_5m: number;
  retention_1h: number;
  retention_1d: number;
}

interface HistoryResponse {
  start: string;
  end: string;
  resolution: string;
  count: number;
  records: MetricRecord[] | null;
}

type TimeRange = '1d' | '7d' | '30d' | 'custom';
type HistChartKey = 'cpu' | 'memory' | 'load' | 'disk' | 'diskIO' | 'networkIO' | 'swap';

// ---------------------------------------------------------------------------
// Reuse the exact same style constants from the realtime charts (index.tsx)
// ---------------------------------------------------------------------------
const CHART_HEIGHT = 220;

const colors = {
  primary: '#1565C0',
  lightBlue: '#1E88E5',
  accent: '#0288D1',
  success: '#4CAF50',
  warning: '#FF9800',
  purple: '#7E57C2',
  read: '#4CAF50',
  write: '#FF9800',
  upstream: '#1E88E5',
  downstream: '#4CAF50',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #E8EDF2',
  padding: 0,
  overflow: 'hidden',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px 4px',
};

const cardTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: '#1A1A2E',
  margin: 0,
};

const legendDotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  marginRight: 4,
});

const axisProps = {
  tick: { fontSize: 11, fill: '#94A3B8' },
  axisLine: { stroke: '#E2E8F0' },
  tickLine: false,
};

const gridProps = {
  strokeDasharray: '3 3' as const,
  stroke: '#F1F5F9',
  vertical: false,
};

const controlBarStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)',
  borderRadius: 8,
  padding: '12px 20px',
  marginBottom: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  alignItems: 'center',
  border: '1px solid #FFE082',
};

// ---------------------------------------------------------------------------
// Sub-components — same MonitorCard pattern as realtime charts
// ---------------------------------------------------------------------------

function ChartTooltipContent({ active, payload, label, unit = '%' }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E8EDF2',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: '#64748B', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{p.value?.toFixed(2)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

interface HistCardProps {
  title: string;
  chartKey: HistChartKey;
  onFullscreen: (key: HistChartKey) => void;
  legend?: { color: string; label: string }[];
  children: React.ReactNode;
}

function HistCard({ title, chartKey, onFullscreen, legend, children }: HistCardProps) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={cardTitleStyle}>{title}</span>
          {legend && (
            <span style={{ display: 'flex', gap: 10, marginLeft: 4 }}>
              {legend.map((l) => (
                <span key={l.label} style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center' }}>
                  <span style={legendDotStyle(l.color)} />
                  {l.label}
                </span>
              ))}
            </span>
          )}
        </div>
        <Tooltip title="Fullscreen">
          <FullscreenOutlined
            style={{ fontSize: 15, color: '#64748B', cursor: 'pointer' }}
            onClick={() => onFullscreen(chartKey)}
          />
        </Tooltip>
      </div>
      <div style={{ padding: '4px 8px 12px' }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart renderers — identical to realtime charts (same gradients, strokes, etc.)
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  time: string;
  cpu: number;
  memory: number;
  swap: number;
  disk: number;
  diskRead: number;
  diskWrite: number;
  netSent: number;
  netRecv: number;
  load1: number;
  load5: number;
  load15: number;
}

function HistCpuChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="histCpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area type="monotone" dataKey="cpu" name="CPU" stroke={colors.primary} fill="url(#histCpuGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HistMemoryChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="histMemGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area type="monotone" dataKey="memory" name="Memory" stroke={colors.accent} fill="url(#histMemGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HistLoadChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis {...axisProps} />
        <RTooltip content={<ChartTooltipContent unit="" />} />
        <Line type="monotone" dataKey="load1" name="1 min" stroke={colors.lightBlue} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="load5" name="5 min" stroke={colors.success} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="load15" name="15 min" stroke={colors.purple} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function HistDiskChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="histDiskGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.success} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.success} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area type="monotone" dataKey="disk" name="Disk" stroke={colors.success} fill="url(#histDiskGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HistDiskIOChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v: number) => `${v}`} />
        <RTooltip content={<ChartTooltipContent unit=" KB/s" />} />
        <Line type="monotone" dataKey="diskRead" name="Read" stroke={colors.read} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="diskWrite" name="Write" stroke={colors.write} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function HistNetworkIOChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v: number) => `${v}`} />
        <RTooltip content={<ChartTooltipContent unit=" KB/s" />} />
        <Line type="monotone" dataKey="netSent" name="Upstream" stroke={colors.upstream} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="netRecv" name="Downstream" stroke={colors.downstream} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function HistSwapChart({ data, height = CHART_HEIGHT }: { data: ChartDataPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="histSwapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.warning} stopOpacity={0.25} />
            <stop offset="95%" stopColor={colors.warning} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area type="monotone" dataKey="swap" name="Swap" stroke={colors.warning} fill="url(#histSwapGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function renderHistChart(key: HistChartKey, data: ChartDataPoint[], height?: number) {
  switch (key) {
    case 'cpu': return <HistCpuChart data={data} height={height} />;
    case 'memory': return <HistMemoryChart data={data} height={height} />;
    case 'load': return <HistLoadChart data={data} height={height} />;
    case 'disk': return <HistDiskChart data={data} height={height} />;
    case 'diskIO': return <HistDiskIOChart data={data} height={height} />;
    case 'networkIO': return <HistNetworkIOChart data={data} height={height} />;
    case 'swap': return <HistSwapChart data={data} height={height} />;
  }
}

const histChartTitles: Record<HistChartKey, string> = {
  cpu: 'CPU Usage',
  memory: 'Memory Usage',
  load: 'Load Average',
  disk: 'Disk Usage',
  diskIO: 'Disk I/O',
  networkIO: 'Network I/O',
  swap: 'Swap Usage',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTimestamp(ts: string, range_: TimeRange): string {
  const d = panelDayjs(ts.endsWith('Z') ? ts : ts + 'Z');
  if (range_ === '1d') return d.format('HH:mm');
  if (range_ === '7d') return d.format('M/D HH:00');
  return d.format('M/D');
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function HistoricalMonitor() {
  const [range_, setRange] = useState<TimeRange>('1d');
  const [customDates, setCustomDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [data, setData] = useState<MetricRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState('');
  const [settings, setSettings] = useState<MonitorSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editSettings, setEditSettings] = useState<MonitorSettings | null>(null);
  const [fullscreenChart, setFullscreenChart] = useState<HistChartKey | null>(null);

  useEffect(() => {
    api.get('/monitor/settings').then((res) => {
      setSettings(res.data.data);
    }).catch(() => {});
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { resolution: 'auto' };
      if (range_ === 'custom' && customDates) {
        params.start = customDates[0].toISOString();
        params.end = customDates[1].toISOString();
      } else {
        params.range = range_;
      }
      const res = await api.get('/monitor/history', { params });
      const body: HistoryResponse = res.data.data;
      setData(body.records || []);
      setResolution(body.resolution || '');
    } catch {
      message.error('Failed to load historical data');
    } finally {
      setLoading(false);
    }
  }, [range_, customDates]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!data.length) return [];
    return data.map((r, i) => {
      const prev = i > 0 ? data[i - 1] : null;
      let diskReadRate = 0, diskWriteRate = 0, netSentRate = 0, netRecvRate = 0;
      if (prev) {
        const t1 = new Date(r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z').getTime();
        const t0 = new Date(prev.timestamp.endsWith('Z') ? prev.timestamp : prev.timestamp + 'Z').getTime();
        const dtSec = Math.max((t1 - t0) / 1000, 1);
        diskReadRate = Math.max(0, (r.disk_read - prev.disk_read) / 1024 / dtSec);
        diskWriteRate = Math.max(0, (r.disk_write - prev.disk_write) / 1024 / dtSec);
        netSentRate = Math.max(0, (r.net_sent - prev.net_sent) / 1024 / dtSec);
        netRecvRate = Math.max(0, (r.net_recv - prev.net_recv) / 1024 / dtSec);
      }
      return {
        time: fmtTimestamp(r.timestamp, range_),
        cpu: parseFloat(r.cpu_percent.toFixed(2)),
        memory: parseFloat(r.mem_percent.toFixed(2)),
        swap: parseFloat(r.swap_percent.toFixed(2)),
        disk: parseFloat(r.disk_percent.toFixed(2)),
        diskRead: parseFloat(diskReadRate.toFixed(2)),
        diskWrite: parseFloat(diskWriteRate.toFixed(2)),
        netSent: parseFloat(netSentRate.toFixed(2)),
        netRecv: parseFloat(netRecvRate.toFixed(2)),
        load1: r.load1,
        load5: r.load5,
        load15: r.load15,
      };
    });
  }, [data, range_]);

  const handleSaveSettings = async () => {
    if (!editSettings) return;
    setSavingSettings(true);
    try {
      const res = await api.put('/monitor/settings', editSettings);
      setSettings(res.data.data);
      setEditSettings(null);
      setSettingsOpen(false);
      message.success('Monitor settings updated');
      setTimeout(() => fetchHistory(), 1000);
    } catch {
      message.error('Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleMonitoring = async () => {
    if (!settings) return;
    const next = { ...settings, enabled: !settings.enabled };
    setSavingSettings(true);
    try {
      const res = await api.put('/monitor/settings', next);
      setSettings(res.data.data);
      message.success(next.enabled ? 'Monitoring enabled' : 'Monitoring disabled');
    } catch {
      message.error('Failed to toggle monitoring');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCleanLog = async () => {
    try {
      const res = await api.delete('/monitor/history', { params: { table: 'all' } });
      const deleted = res.data.data?.deleted ?? 0;
      message.success(`Cleaned ${deleted} records`);
      setData([]);
    } catch {
      message.error('Failed to clean monitor logs');
    }
  };

  const rangeButtons: { key: TimeRange; label: string }[] = [
    { key: '1d', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: 'custom', label: 'Custom' },
  ];

  const resolutionLabel = resolution === 'raw' ? '1min' : resolution === '5m' ? '5min' : resolution === '1h' ? '1hr' : resolution === '1d' ? '1day' : resolution;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Control bar — warm amber to visually separate from realtime blue bar */}
      <div style={controlBarStyle}>
        <HistoryOutlined style={{ fontSize: 15, color: '#E65100' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#E65100', whiteSpace: 'nowrap' }}>
          Historical Data
        </span>
        <span style={{ color: '#FFE082' }}>|</span>

        {/* Range tabs */}
        {rangeButtons.map((rb) => (
          <span
            key={rb.key}
            onClick={() => setRange(rb.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: range_ === rb.key ? '#E65100' : 'rgba(255,255,255,0.6)',
              color: range_ === rb.key ? '#FFF' : '#795548',
              transition: 'all 0.15s',
            }}
          >
            {rb.label}
          </span>
        ))}

        {range_ === 'custom' && (
          <RangePicker
            size="small"
            value={customDates}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) setCustomDates([dates[0], dates[1]]);
            }}
            style={{ maxWidth: 250 }}
          />
        )}

        {resolution && data.length > 0 && (
          <span style={{ fontSize: 11, color: '#795548', fontWeight: 500 }}>
            <ClockCircleOutlined style={{ marginRight: 3 }} />
            {resolutionLabel} · {data.length} pts
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Collection toggle */}
        <span style={{ fontSize: 12, color: '#795548', fontWeight: 500 }}>
          <DatabaseOutlined style={{ marginRight: 4 }} />Collection
        </span>
        <Switch
          size="small"
          checked={settings?.enabled ?? false}
          loading={savingSettings}
          onChange={handleToggleMonitoring}
        />

        <span style={{ color: '#FFE082' }}>|</span>

        <Tooltip title="Refresh">
          <ReloadOutlined
            style={{ fontSize: 14, color: '#E65100', cursor: 'pointer' }}
            spin={loading}
            onClick={fetchHistory}
          />
        </Tooltip>
        <Popconfirm
          title="Clean all monitor logs?"
          description="This will delete all historical data."
          onConfirm={handleCleanLog}
          okText="Clean"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
        >
          <Tooltip title="Clean log">
            <DeleteOutlined style={{ fontSize: 14, color: '#795548', cursor: 'pointer' }} />
          </Tooltip>
        </Popconfirm>
        <Tooltip title="Collection settings">
          <SettingOutlined
            style={{ fontSize: 14, color: '#795548', cursor: 'pointer' }}
            onClick={() => {
              setEditSettings(settings ? { ...settings } : null);
              setSettingsOpen(!settingsOpen);
            }}
          />
        </Tooltip>
      </div>

      {/* Settings panel */}
      {settingsOpen && editSettings && (
        <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: 16 }}>
          <Collapse
            ghost
            defaultActiveKey={['general']}
            items={[{
              key: 'general',
              label: <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>Collection Settings</span>,
              children: (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Interval (sec)</div>
                    <InputNumber size="small" min={10} max={3600} value={editSettings.interval}
                      onChange={(v) => setEditSettings({ ...editSettings, interval: v || 60 })} style={{ width: 100 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Raw retention (days)</div>
                    <InputNumber size="small" min={1} max={30} value={editSettings.retention_raw}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_raw: v || 2 })} style={{ width: 100 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>5-min retention (days)</div>
                    <InputNumber size="small" min={1} max={90} value={editSettings.retention_5m}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_5m: v || 7 })} style={{ width: 100 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Hourly retention (days)</div>
                    <InputNumber size="small" min={1} max={365} value={editSettings.retention_1h}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_1h: v || 90 })} style={{ width: 100 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Daily retention (days)</div>
                    <InputNumber size="small" min={1} max={3650} value={editSettings.retention_1d}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_1d: v || 365 })} style={{ width: 100 }} />
                  </div>
                  <button onClick={handleSaveSettings} disabled={savingSettings} style={{
                    padding: '5px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                    cursor: savingSettings ? 'not-allowed' : 'pointer',
                    background: '#E65100', color: '#fff', opacity: savingSettings ? 0.6 : 1,
                  }}>
                    {savingSettings ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ),
            }]}
          />
        </div>
      )}

      {/* Charts — same Row/Col grid as realtime section */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', ...cardStyle }}>
          <DatabaseOutlined style={{ fontSize: 36, color: '#94A3B8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500 }}>No historical data available yet</div>
          <div style={{ fontSize: 12, color: '#CBD5E1', marginTop: 4 }}>
            {settings?.enabled ? 'Data will appear after the first collection cycle' : 'Enable monitoring to start collecting data'}
          </div>
        </div>
      ) : (
        <>
          {/* Row 1: CPU + Memory */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <HistCard title="CPU Usage" chartKey="cpu" onFullscreen={setFullscreenChart}
                legend={[{ color: colors.primary, label: 'CPU %' }]}>
                <HistCpuChart data={chartData} />
              </HistCard>
            </Col>
            <Col xs={24} lg={12}>
              <HistCard title="Memory Usage" chartKey="memory" onFullscreen={setFullscreenChart}
                legend={[{ color: colors.accent, label: 'Memory %' }]}>
                <HistMemoryChart data={chartData} />
              </HistCard>
            </Col>
          </Row>

          {/* Row 2: Load + Disk */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <HistCard title="Load Average" chartKey="load" onFullscreen={setFullscreenChart}
                legend={[
                  { color: colors.lightBlue, label: '1 min' },
                  { color: colors.success, label: '5 min' },
                  { color: colors.purple, label: '15 min' },
                ]}>
                <HistLoadChart data={chartData} />
              </HistCard>
            </Col>
            <Col xs={24} lg={12}>
              <HistCard title="Disk Usage" chartKey="disk" onFullscreen={setFullscreenChart}
                legend={[{ color: colors.success, label: 'Disk %' }]}>
                <HistDiskChart data={chartData} />
              </HistCard>
            </Col>
          </Row>

          {/* Row 3: Disk I/O + Network I/O */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <HistCard title="Disk I/O" chartKey="diskIO" onFullscreen={setFullscreenChart}
                legend={[
                  { color: colors.read, label: 'Read' },
                  { color: colors.write, label: 'Write' },
                ]}>
                <HistDiskIOChart data={chartData} />
              </HistCard>
            </Col>
            <Col xs={24} lg={12}>
              <HistCard title="Network I/O" chartKey="networkIO" onFullscreen={setFullscreenChart}
                legend={[
                  { color: colors.upstream, label: 'Upstream' },
                  { color: colors.downstream, label: 'Downstream' },
                ]}>
                <HistNetworkIOChart data={chartData} />
              </HistCard>
            </Col>
          </Row>

          {/* Row 4: Swap */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <HistCard title="Swap Usage" chartKey="swap" onFullscreen={setFullscreenChart}
                legend={[{ color: colors.warning, label: 'Swap %' }]}>
                <HistSwapChart data={chartData} />
              </HistCard>
            </Col>
          </Row>
        </>
      )}

      {/* Fullscreen modal — same as realtime charts */}
      <Modal
        open={fullscreenChart !== null}
        onCancel={() => setFullscreenChart(null)}
        footer={null}
        width="90vw"
        centered
        destroyOnHidden
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{fullscreenChart ? histChartTitles[fullscreenChart] + ' (Historical)' : ''}</span>
            <FullscreenExitOutlined
              style={{ fontSize: 14, color: '#64748B', cursor: 'pointer' }}
              onClick={() => setFullscreenChart(null)}
            />
          </div>
        }
        styles={{ body: { padding: '16px 8px' } }}
      >
        {fullscreenChart && renderHistChart(fullscreenChart, chartData, 500)}
      </Modal>
    </div>
  );
}
