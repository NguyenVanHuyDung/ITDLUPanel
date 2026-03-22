import { useState, useEffect, useCallback, useMemo } from 'react';
import { DatePicker, Switch, Tooltip, Spin, InputNumber, message, Collapse, Popconfirm } from 'antd';
import {
  HistoryOutlined,
  SettingOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
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
import dayjs from 'dayjs';
import api from '@/services/api';
import { useThemeStore } from '@/stores/theme';

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

// ---------------------------------------------------------------------------
// Palette system (light / dark)
// ---------------------------------------------------------------------------
interface Palette {
  bg: string;
  cardBg: string;
  cardBorder: string;
  headerBg: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentFaded: string;
  controlBg: string;
  controlBorder: string;
  controlHover: string;
  activeTabBg: string;
  activeTabText: string;
  inactiveTabBg: string;
  inactiveTabText: string;
  chartGrid: string;
  chartTick: string;
  tooltipBg: string;
  tooltipBorder: string;
  divider: string;
  tagBg: string;
  tagText: string;
  emptyText: string;
}

const lightPalette: Palette = {
  bg: 'transparent',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  headerBg: 'linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)',
  text: '#1A1A2E',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#D97706',
  accentFaded: 'rgba(217, 119, 6, 0.08)',
  controlBg: '#F8FAFC',
  controlBorder: '#E2E8F0',
  controlHover: '#F1F5F9',
  activeTabBg: '#D97706',
  activeTabText: '#FFFFFF',
  inactiveTabBg: '#F1F5F9',
  inactiveTabText: '#64748B',
  chartGrid: '#F1F5F9',
  chartTick: '#94A3B8',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E2E8F0',
  divider: '#E2E8F0',
  tagBg: '#FEF3C7',
  tagText: '#92400E',
  emptyText: '#94A3B8',
};

const darkPalette: Palette = {
  bg: 'transparent',
  cardBg: '#1E293B',
  cardBorder: '#334155',
  headerBg: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  accent: '#F59E0B',
  accentFaded: 'rgba(245, 158, 11, 0.12)',
  controlBg: '#0F172A',
  controlBorder: '#334155',
  controlHover: '#1E293B',
  activeTabBg: '#F59E0B',
  activeTabText: '#0F172A',
  inactiveTabBg: '#1E293B',
  inactiveTabText: '#94A3B8',
  chartGrid: '#1E293B',
  chartTick: '#64748B',
  tooltipBg: '#1E293B',
  tooltipBorder: '#334155',
  divider: '#334155',
  tagBg: 'rgba(245, 158, 11, 0.15)',
  tagText: '#F59E0B',
  emptyText: '#475569',
};

// Chart colors
const chartColors = {
  cpu: '#E67E22',
  memory: '#2980B9',
  swap: '#8E44AD',
  disk: '#27AE60',
  diskRead: '#3498DB',
  diskWrite: '#E74C3C',
  netSent: '#E67E22',
  netRecv: '#2ECC71',
  load1: '#E74C3C',
  load5: '#F39C12',
  load15: '#3498DB',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTimestamp(ts: string, range_: TimeRange): string {
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  if (range_ === '1d') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (range_ === '7d') {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label, unit = '%', p }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit?: string;
  p: Palette;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: p.tooltipBg,
      border: `1px solid ${p.tooltipBorder}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <div style={{ color: p.textMuted, marginBottom: 4, fontSize: 11 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: entry.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: p.textSecondary }}>{entry.name}</span>
          <span style={{ fontWeight: 600 }}>{entry.value?.toFixed(2)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

interface HistChartProps {
  title: string;
  data: Array<Record<string, unknown>>;
  lines: Array<{ key: string; name: string; color: string }>;
  unit?: string;
  domain?: [number, number];
  p: Palette;
  useArea?: boolean;
}

function HistChart({ title, data, lines, unit = '%', domain, p, useArea }: HistChartProps) {
  const axisProps = {
    tick: { fontSize: 10, fill: p.chartTick, fontFamily: "'JetBrains Mono', monospace" },
    axisLine: { stroke: p.divider },
    tickLine: false,
  };

  const ChartComponent = useArea ? AreaChart : LineChart;

  return (
    <div style={{
      background: p.cardBg,
      border: `1px solid ${p.cardBorder}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: p.text,
            letterSpacing: '-0.01em',
          }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {lines.map((l) => (
            <span key={l.key} style={{ fontSize: 10, color: p.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                width: 8, height: 3, borderRadius: 1,
                background: l.color, display: 'inline-block',
              }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 4px 10px' }}>
        <ResponsiveContainer width="100%" height={180}>
          <ChartComponent data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <defs>
              {useArea && lines.map((l) => (
                <linearGradient key={l.key} id={`hist-grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={l.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={l.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={p.chartGrid} vertical={false} />
            <XAxis dataKey="time" {...axisProps} />
            <YAxis domain={domain} {...axisProps} tickFormatter={(v: number) => unit === '%' ? `${v}%` : `${v}`} />
            <RTooltip content={<ChartTooltip unit={unit} p={p} />} />
            {lines.map((l) =>
              useArea ? (
                <Area
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  fill={`url(#hist-grad-${l.key})`}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )
            )}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function HistoricalMonitor() {
  const { mode } = useThemeStore();
  const isDark = mode === 'dark';
  const p = isDark ? darkPalette : lightPalette;

  const [range_, setRange] = useState<TimeRange>('1d');
  const [customDates, setCustomDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [data, setData] = useState<MetricRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState('');
  const [settings, setSettings] = useState<MonitorSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editSettings, setEditSettings] = useState<MonitorSettings | null>(null);

  // Fetch settings on mount
  useEffect(() => {
    api.get('/monitor/settings').then((res) => {
      setSettings(res.data.data);
    }).catch(() => {});
  }, []);

  // Fetch history
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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Transform data for charts
  const chartData = useMemo(() => {
    if (!data.length) return [];
    // Calculate rates for network/disk I/O from cumulative counters
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

  // Handle settings save
  const handleSaveSettings = async () => {
    if (!editSettings) return;
    setSavingSettings(true);
    try {
      const res = await api.put('/monitor/settings', editSettings);
      setSettings(res.data.data);
      setEditSettings(null);
      setSettingsOpen(false);
      message.success('Monitor settings updated');
      // Re-fetch data since monitoring state may have changed
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
      {/* Control bar */}
      <div style={{
        background: p.headerBg,
        borderRadius: 10,
        border: `1px solid ${isDark ? '#F59E0B22' : '#D9770622'}`,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <HistoryOutlined style={{ fontSize: 16, color: p.accent }} />
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: p.text,
            letterSpacing: '-0.02em',
          }}>
            Historical Data
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: p.divider, margin: '0 4px' }} />

        {/* Range tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {rangeButtons.map((rb) => (
            <button
              key={rb.key}
              onClick={() => setRange(rb.key)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: range_ === rb.key ? p.activeTabBg : p.inactiveTabBg,
                color: range_ === rb.key ? p.activeTabText : p.inactiveTabText,
                letterSpacing: '0.02em',
              }}
            >
              {rb.label}
            </button>
          ))}
        </div>

        {/* Custom date picker */}
        {range_ === 'custom' && (
          <RangePicker
            size="small"
            value={customDates}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setCustomDates([dates[0], dates[1]]);
              }
            }}
            style={{ maxWidth: 260 }}
          />
        )}

        {/* Resolution tag */}
        {resolution && data.length > 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: p.tagBg,
            color: p.tagText,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <ClockCircleOutlined style={{ marginRight: 3, fontSize: 9 }} />
            {resolutionLabel} · {data.length} pts
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Monitoring toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: p.textSecondary, fontWeight: 500 }}>
            <DatabaseOutlined style={{ marginRight: 4 }} />
            Collection
          </span>
          <Switch
            size="small"
            checked={settings?.enabled ?? false}
            loading={savingSettings}
            onChange={handleToggleMonitoring}
          />
        </div>

        {/* Refresh */}
        <Tooltip title="Refresh">
          <ReloadOutlined
            style={{ fontSize: 14, color: p.accent, cursor: 'pointer' }}
            spin={loading}
            onClick={fetchHistory}
          />
        </Tooltip>

        {/* Clean log */}
        <Popconfirm
          title="Clean all monitor logs?"
          description="This will delete all historical data from all resolution tables."
          onConfirm={handleCleanLog}
          okText="Clean"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
        >
          <Tooltip title="Clean log">
            <DeleteOutlined
              style={{ fontSize: 14, color: p.textMuted, cursor: 'pointer' }}
            />
          </Tooltip>
        </Popconfirm>

        {/* Settings gear */}
        <Tooltip title="Collection settings">
          <SettingOutlined
            style={{ fontSize: 14, color: p.textMuted, cursor: 'pointer' }}
            onClick={() => {
              setEditSettings(settings ? { ...settings } : null);
              setSettingsOpen(!settingsOpen);
            }}
          />
        </Tooltip>
      </div>

      {/* Settings panel (collapsible) */}
      {settingsOpen && editSettings && (
        <div style={{
          background: p.cardBg,
          border: `1px solid ${p.cardBorder}`,
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 16,
        }}>
          <Collapse
            ghost
            defaultActiveKey={['general']}
            items={[{
              key: 'general',
              label: <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Collection Settings</span>,
              children: (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Interval (sec)</div>
                    <InputNumber
                      size="small"
                      min={10}
                      max={3600}
                      value={editSettings.interval}
                      onChange={(v) => setEditSettings({ ...editSettings, interval: v || 60 })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Raw retention (days)</div>
                    <InputNumber
                      size="small"
                      min={1}
                      max={30}
                      value={editSettings.retention_raw}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_raw: v || 2 })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>5-min retention (days)</div>
                    <InputNumber
                      size="small"
                      min={1}
                      max={90}
                      value={editSettings.retention_5m}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_5m: v || 7 })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Hourly retention (days)</div>
                    <InputNumber
                      size="small"
                      min={1}
                      max={365}
                      value={editSettings.retention_1h}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_1h: v || 90 })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Daily retention (days)</div>
                    <InputNumber
                      size="small"
                      min={1}
                      max={3650}
                      value={editSettings.retention_1d}
                      onChange={(v) => setEditSettings({ ...editSettings, retention_1d: v || 365 })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    style={{
                      padding: '5px 18px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: savingSettings ? 'not-allowed' : 'pointer',
                      background: p.accent,
                      color: '#fff',
                      opacity: savingSettings ? 0.6 : 1,
                    }}
                  >
                    {savingSettings ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ),
            }]}
          />
        </div>
      )}

      {/* Charts grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : chartData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: p.cardBg,
          border: `1px solid ${p.cardBorder}`,
          borderRadius: 8,
        }}>
          <DatabaseOutlined style={{ fontSize: 36, color: p.emptyText, display: 'block', marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: p.emptyText, fontWeight: 500 }}>
            No historical data available yet
          </div>
          <div style={{ fontSize: 12, color: p.textMuted, marginTop: 4 }}>
            {settings?.enabled
              ? 'Data will appear after the first collection cycle'
              : 'Enable monitoring to start collecting data'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 12,
        }}>
          <HistChart
            title="CPU Usage"
            data={chartData}
            lines={[{ key: 'cpu', name: 'CPU', color: chartColors.cpu }]}
            domain={[0, 100]}
            p={p}
            useArea
          />
          <HistChart
            title="Memory Usage"
            data={chartData}
            lines={[{ key: 'memory', name: 'Memory', color: chartColors.memory }]}
            domain={[0, 100]}
            p={p}
            useArea
          />
          <HistChart
            title="Load Average"
            data={chartData}
            lines={[
              { key: 'load1', name: '1min', color: chartColors.load1 },
              { key: 'load5', name: '5min', color: chartColors.load5 },
              { key: 'load15', name: '15min', color: chartColors.load15 },
            ]}
            unit=""
            p={p}
          />
          <HistChart
            title="Disk Usage"
            data={chartData}
            lines={[{ key: 'disk', name: 'Disk', color: chartColors.disk }]}
            domain={[0, 100]}
            p={p}
            useArea
          />
          <HistChart
            title="Disk I/O"
            data={chartData}
            lines={[
              { key: 'diskRead', name: 'Read', color: chartColors.diskRead },
              { key: 'diskWrite', name: 'Write', color: chartColors.diskWrite },
            ]}
            unit=" KB/s"
            p={p}
          />
          <HistChart
            title="Network I/O"
            data={chartData}
            lines={[
              { key: 'netSent', name: 'Sent', color: chartColors.netSent },
              { key: 'netRecv', name: 'Recv', color: chartColors.netRecv },
            ]}
            unit=" KB/s"
            p={p}
          />
          <HistChart
            title="Swap Usage"
            data={chartData}
            lines={[{ key: 'swap', name: 'Swap', color: chartColors.swap }]}
            domain={[0, 100]}
            p={p}
            useArea
          />
        </div>
      )}
    </div>
  );
}
