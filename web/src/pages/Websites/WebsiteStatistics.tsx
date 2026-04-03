import { useState, useEffect, useCallback } from 'react';
import { Modal, Spin, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

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

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'traffic', label: 'Traffic', color: '#16A34A' },
  { key: 'requests', label: 'Requests', color: '#2563EB' },
  { key: 'ip', label: 'IP', color: '#D97706' },
  { key: 'uv', label: 'UV', color: '#7C3AED' },
  { key: 'pv', label: 'PV', color: '#0891B2' },
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

  const activeColor = METRICS.find(m => m.key === activeMetric)?.color ?? p.accent;

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
      destroyOnClose
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
          </svg>
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
          <ReloadOutlined spin={loading} style={{ fontSize: 11 }} />
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
            {METRICS.map(m => (
              <div key={m.key} style={{
                padding: '14px 16px', borderRadius: 10,
                border: `1px solid ${m.color}20`,
                background: `${m.color}06`,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: m.color,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: p.textMuted }}>
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
            ))}
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
                {METRICS.map((m, i) => (
                  <button
                    key={m.key}
                    onClick={() => setActiveMetric(m.key)}
                    style={{
                      padding: '5px 14px', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: activeMetric === m.key ? m.color : 'transparent',
                      color: activeMetric === m.key ? '#fff' : p.textMuted,
                      transition: 'all 0.15s',
                      borderRight: i < METRICS.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
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
