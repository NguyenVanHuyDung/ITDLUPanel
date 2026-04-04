import { useState, useEffect, useCallback } from 'react';
import { Modal, Spin, message } from 'antd';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePalette, type Palette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// SVG icons – consistent with SecIcon / SetIcon / FwIcon pattern
// ---------------------------------------------------------------------------
const StatsIcon = {
  Chart: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
    </svg>
  ),
  Traffic: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20" /><path d="M17 7l-5 5-5-5" /><path d="M7 17l5-5 5 5" />
    </svg>
  ),
  Requests: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
  IP: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="4" /><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  ),
  UV: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  PV: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  ),
  Refresh: ({ size = 20, color = '#64748B' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0115.4-6.4L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 01-15.4 6.4L3 16" />
    </svg>
  ),
};

type MetricIconKey = 'Traffic' | 'Requests' | 'IP' | 'UV' | 'PV';

interface DayStats {
  date: string;
  traffic: number;
  requests: number;
  ip: number;
  uv: number;
  pv: number;
}

interface WebsiteStatisticsData {
  today: DayStats;
  yesterday: DayStats;
  day_before: DayStats;
  chart_data: DayStats[];
}

type MetricKey = 'traffic' | 'requests' | 'ip' | 'uv' | 'pv';

interface MetricDef {
  key: MetricKey;
  label: string;
  icon: MetricIconKey;
  paletteKey: (p: Palette) => string;
}

const METRICS: MetricDef[] = [
  { key: 'traffic', label: 'Traffic', icon: 'Traffic', paletteKey: p => p.green },
  { key: 'requests', label: 'Requests', icon: 'Requests', paletteKey: p => p.accent },
  { key: 'ip', label: 'IP', icon: 'IP', paletteKey: p => p.amber },
  { key: 'uv', label: 'UV', icon: 'UV', paletteKey: p => p.purple },
  { key: 'pv', label: 'PV', icon: 'PV', paletteKey: p => p.cyan },
];

function formatBytes(b: number): string {
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  const val = b / Math.pow(1024, Math.min(i, units.length - 1));
  return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(2)} ${units[Math.min(i, units.length - 1)]}`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function getMetricValue(stats: DayStats, key: MetricKey): string {
  const v = stats[key];
  return key === 'traffic' ? formatBytes(v) : formatNumber(v);
}

function formatChartValue(v: number, key: MetricKey): string {
  return key === 'traffic' ? formatBytes(v) : v.toString();
}

// ---------------------------------------------------------------------------
// Sparkline for table cell
// ---------------------------------------------------------------------------

interface SparklineProps {
  siteId: number;
}

export function SiteStatsCell({ siteId }: SparklineProps) {
  const { p } = usePalette();
  const [stats, setStats] = useState<WebsiteStatisticsData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchStats = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<WebsiteStatisticsData>>(`/sites/${siteId}/statistics?days=7`);
      setStats(data.data ?? null);
      setFetched(true);
    } catch { /* ignore */ }
    setLoading(false);
  }, [siteId, fetched]);

  // Lazy load on first render
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const today = stats?.today;
  const reqs = today?.requests ?? 0;
  const traffic = today?.traffic ?? 0;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
          padding: '4px 10px', borderRadius: 6,
          border: `1px solid ${p.cardBorder}`,
          background: `${p.accent}05`,
          cursor: 'pointer', transition: 'all 0.15s',
          minWidth: 80,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${p.accent}50`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.cardBorder; }}
      >
        {loading ? (
          <Spin size="small" />
        ) : (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: p.text, lineHeight: 1.2 }}>
              {formatNumber(reqs)}
              <span style={{ fontSize: 10, fontWeight: 400, color: p.textMuted, marginLeft: 3 }}>req</span>
            </span>
            <span style={{ fontSize: 10, color: p.textMuted, lineHeight: 1 }}>
              {formatBytes(traffic)}
            </span>
          </>
        )}
      </button>

      {open && (
        <WebsiteStatisticsModal
          siteId={siteId}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Statistics Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  siteId: number;
  open: boolean;
  onClose: () => void;
  domain?: string;
}

export function WebsiteStatisticsModal({ siteId, open, onClose, domain }: ModalProps) {
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [stats, setStats] = useState<WebsiteStatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey>('traffic');
  const [siteDomain, setSiteDomain] = useState(domain || '');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<WebsiteStatisticsData>>(`/sites/${siteId}/statistics?days=7`);
      setStats(data.data ?? null);
    } catch {
      message.error('Failed to load statistics');
    }
    setLoading(false);
  }, [siteId]);

  // Fetch domain name if not provided
  useEffect(() => {
    if (!domain) {
      api.get<ApiResponse<{ domain: string }>>(`/sites/${siteId}`).then(({ data }) => {
        setSiteDomain(data.data?.domain || `Site #${siteId}`);
      }).catch(() => setSiteDomain(`Site #${siteId}`));
    }
  }, [siteId, domain]);

  useEffect(() => {
    if (open) fetchStats();
  }, [open, fetchStats]);

  const today = stats?.today ?? { date: '', traffic: 0, requests: 0, ip: 0, uv: 0, pv: 0 };
  const yesterday = stats?.yesterday ?? { date: '', traffic: 0, requests: 0, ip: 0, uv: 0, pv: 0 };
  const dayBefore = stats?.day_before ?? { date: '', traffic: 0, requests: 0, ip: 0, uv: 0, pv: 0 };
  const chartData = stats?.chart_data ?? [];

  const activeColor = METRICS.find(m => m.key === activeMetric)?.paletteKey(p) ?? p.accent;

  // Format chart data dates
  const formattedChart = chartData.map(d => ({
    ...d,
    label: d.date.slice(5), // "04-03" format
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100%' : 720}
      title={null}
      closable
      destroyOnHidden
      styles={{
        body: {
          padding: 0, borderRadius: 12, overflow: 'hidden',
          background: p.card,
        },
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${p.cardBorder}`,
        background: p.headerBg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatsIcon.Chart size={20} color={p.accent} />
          <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>
            [{siteDomain}] Website Statistics
          </span>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 6,
            border: `1px solid ${p.green}30`,
            background: `${p.green}08`, color: p.green,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <StatsIcon.Refresh size={12} color={p.green} />
          Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <div style={{ padding: isMobile ? 16 : 24 }}>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
            gap: isMobile ? 10 : 14,
            marginBottom: 28,
          }}>
            {METRICS.map(m => {
              const color = m.paletteKey(p);
              const IconComp = StatsIcon[m.icon];
              return (
              <div key={m.key} style={{
                padding: '14px 16px', borderRadius: 10,
                border: `1px solid ${color}20`,
                background: `${color}06`,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: `${color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconComp size={15} color={color} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {m.label}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: p.text, marginBottom: 6 }}>
                  {getMetricValue(today, m.key)}
                </div>
                <div style={{ fontSize: 10, color: p.textMuted, lineHeight: 1.6 }}>
                  Yesterday {getMetricValue(yesterday, m.key)}
                </div>
                <div style={{ fontSize: 10, color: p.textDim, lineHeight: 1.6 }}>
                  Day Before {getMetricValue(dayBefore, m.key)}
                </div>
              </div>
              );
            })}
          </div>

          {/* Chart Section */}
          <div style={{
            borderRadius: 10,
            border: `1px solid ${p.cardBorder}`,
            overflow: 'hidden',
          }}>
            {/* Chart header */}
            <div style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${p.cardBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>
                Last 7 Days Statistics
              </span>
              <div style={{
                display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden',
                border: `1px solid ${p.cardBorder}`,
              }}>
                {METRICS.map((m, i) => {
                  const color = m.paletteKey(p);
                  return (
                  <button
                    key={m.key}
                    onClick={() => setActiveMetric(m.key)}
                    style={{
                      padding: '5px 14px', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: activeMetric === m.key ? color : 'transparent',
                      color: activeMetric === m.key ? '#fff' : p.textMuted,
                      transition: 'all 0.15s',
                      borderRight: i < METRICS.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
                    }}
                  >
                    {m.label}
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Chart */}
            <div style={{ padding: '20px 16px 12px' }}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={formattedChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`statsGrad-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={activeColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1E293B' : '#F1F5F9'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: isDark ? '#64748B' : '#94A3B8' }}
                    axisLine={{ stroke: isDark ? '#1E293B' : '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#64748B' : '#94A3B8' }}
                    axisLine={{ stroke: isDark ? '#1E293B' : '#E2E8F0' }}
                    tickLine={false}
                    tickFormatter={(v: number) => activeMetric === 'traffic' ? formatBytes(v) : formatNumber(v)}
                  />
                  <RTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: isDark ? '#1E293B' : '#fff',
                          border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}>
                          <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: activeColor }}>
                            {formatChartValue(payload[0].value as number, activeMetric)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetric}
                    stroke={activeColor}
                    fill={`url(#statsGrad-${activeMetric})`}
                    strokeWidth={2}
                    dot={{ r: 3, fill: activeColor, stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: activeColor, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default WebsiteStatisticsModal;
