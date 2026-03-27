import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Col, Progress, Row, Typography, Spin, Button, Select, Space, Popover } from 'antd';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SystemInfo, Software } from '@/types';
import NginxManageModal from '@/components/NginxManageModal';
import PhpMyAdminManageModal from '@/components/PhpMyAdminManageModal';
import { getSoftwareIcon } from '../AppStore/SoftwareIcons';

const { Text } = Typography;

/* ─── Dashboard Section Icons (proper multi-element SVGs) ─── */
const DashIcon = {
  Server: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <circle cx="6" cy="6.5" r="1" fill={color} stroke="none" />
      <circle cx="6" cy="17.5" r="1" fill={color} stroke="none" />
      <line x1="10" y1="6.5" x2="18" y2="6.5" />
      <line x1="10" y1="17.5" x2="18" y2="17.5" />
    </svg>
  ),
  Disk: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 3v4h10V3" />
      <rect x="8" y="12" width="8" height="5" rx="1" />
      <line x1="15" y1="5" x2="15" y2="5.01" strokeWidth="2" />
    </svg>
  ),
  Chart: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill={`${color}30`} />
      <rect x="10" y="7" width="4" height="14" rx="1" fill={`${color}30`} />
      <rect x="17" y="3" width="4" height="18" rx="1" fill={`${color}30`} />
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  ),
  Package: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill={`${color}12`} />
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" />
      <path d="M3 7l9 5 9-5" />
      <line x1="12" y1="12" x2="12" y2="22" />
    </svg>
  ),
  Trending: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 20L9 14l4 4 8-10" />
      <path d="M17 8h4v4" />
      <path d="M3 20L9 14l4 4 8-10" strokeWidth="0" fill={`${color}12`} />
      <line x1="3" y1="20" x2="3" y2="20" />
    </svg>
  ),
  Globe: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M4.5 7h15M4.5 17h15" />
    </svg>
  ),
  Folder: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" fill={`${color}12`} />
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  Database: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3" fill={`${color}15`} />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" />
      <path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" />
    </svg>
  ),
  Shield: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${color}12`} />
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Clock: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  ),
  // Popover sub-section icons
  Activity: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),
  Cpu: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="15" x2="4" y2="15" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="15" x2="23" y2="15" />
    </svg>
  ),
  Memory: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="7" y1="1" x2="7" y2="4" /><line x1="12" y1="1" x2="12" y2="4" /><line x1="17" y1="1" x2="17" y2="4" />
      <line x1="7" y1="20" x2="7" y2="23" /><line x1="12" y1="20" x2="12" y2="23" /><line x1="17" y1="20" x2="17" y2="23" />
      <rect x="8" y="8" width="8" height="8" rx="1" fill={`${color}20`} />
    </svg>
  ),
  HardDrive: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <path d="M22 12H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      <circle cx="6" cy="16" r="1" fill={color} stroke="none" />
      <circle cx="10" cy="16" r="1" fill={color} stroke="none" />
    </svg>
  ),
  FileText: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Gear: ({ color, size = 14 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 6 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

const formatMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
const formatGB = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(2);
const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};
const formatNetworkSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

const REFRESH_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
];

const getCpuStatusText = (pct: number) => {
  if (pct < 30) return 'Smooth operation';
  if (pct < 70) return 'Moderate load';
  return 'High load';
};

interface NetworkChartPoint {
  time: string;
  upstream: number;
  downstream: number;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [chartData, setChartData] = useState<NetworkChartPoint[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [installedSoftware, setInstalledSoftware] = useState<Software[]>([]);
  const [nginxModalOpen, setNginxModalOpen] = useState(false);
  const [pmaModalOpen, setPmaModalOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevNetworkRef = useRef<{ sent: number; recv: number } | null>(null);

  const fetchSoftware = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software');
      if (resp.data?.installed) setInstalledSoftware(resp.data.installed);
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    try {
      const { data: resp } = await api.get<{ code: number; data: SystemInfo }>('/dashboard');
      const d = resp.data;
      setInfo(d);

      const now = new Date();
      const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(v => String(v).padStart(2, '0')).join(':');

      const prev = prevNetworkRef.current;
      let upstream = 0, downstream = 0;
      if (prev) {
        upstream = Math.max(0, d.network.bytes_sent - prev.sent);
        downstream = Math.max(0, d.network.bytes_recv - prev.recv);
      }
      prevNetworkRef.current = { sent: d.network.bytes_sent, recv: d.network.bytes_recv };

      setChartData(p => {
        const next = [...p, { time: timeStr, upstream, downstream }];
        return next.length > 30 ? next.slice(-30) : next;
      });
    } catch { /* silently retry */ } finally {
      if (isInitial) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(true); fetchSoftware(); }, [fetchData, fetchSoftware]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(), refreshInterval * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData, refreshInterval]);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!info) return <div style={{ textAlign: 'center', padding: 100 }}><Text type="secondary">Failed to load dashboard</Text></div>;

  const cpuPct = Math.round(info.cpu.usage_percent);
  const memPct = Math.round(info.memory.usage_percent);
  const diskPct = Math.round(info.disk.usage_percent);
  const loadAvg = info.cpu.load_average?.map(v => v.toFixed(2)).join(' / ') || '—';
  const coreCount = info.cpu.physical_cores ?? info.cpu.cores ?? 1;
  const load1 = info.cpu.load_average?.[0] ?? 0;
  const loadPct = Math.min(Math.round((load1 / coreCount) * 100), 100);

  // Popover style helpers
  const popLabel: React.CSSProperties = { fontSize: 13, color: '#555' };
  const popVal: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1A1A2E', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' };
  const popRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: '1px solid #f0f0f0' };
  const popSection: React.CSSProperties = { fontWeight: 600, fontSize: 13, color: '#1565C0', margin: '12px 0 6px' };
  const popWrap: React.CSSProperties = { padding: '0 14px' };

  // === LOAD POPOVER ===
  const loadPopoverContent = (
    <div style={{ width: 320 }}>
      <div style={{ ...popWrap, padding: '12px 14px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>System Load: <span style={{ color: '#4CAF50' }}>{loadPct}%</span></span>
      </div>
      <div style={popWrap}>
        <div style={popSection}><DashIcon.Activity color="#1565C0" />Load average</div>
        <div style={popRow}><span style={popLabel}>1 min</span><span style={popVal}>{info.cpu.load_average?.[0]?.toFixed(2) ?? '—'}</span></div>
        <div style={popRow}><span style={popLabel}>5 min</span><span style={popVal}>{info.cpu.load_average?.[1]?.toFixed(2) ?? '—'}</span></div>
        <div style={popRow}><span style={popLabel}>15 min</span><span style={popVal}>{info.cpu.load_average?.[2]?.toFixed(2) ?? '—'}</span></div>
        <div style={popSection}><DashIcon.Gear color="#1565C0" />Process information</div>
        <div style={popRow}><span style={popLabel}>Total processes</span><span style={popVal}>{info.cpu.total_processes ?? 0}</span></div>
        <div style={{ ...popRow, borderBottom: 'none' }}><span style={popLabel}>Active processes</span><span style={popVal}>{info.cpu.active_processes ?? 0}</span></div>
      </div>
    </div>
  );

  // === CPU POPOVER ===
  const cpuPopoverContent = (
    <div style={{ width: 340, maxHeight: '65vh', overflowY: 'auto' }}>
      <div style={{ ...popWrap, padding: '12px 14px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>CPU usage: <span style={{ color: '#1E88E5' }}>{info.cpu.usage_percent.toFixed(1)}%</span></span>
      </div>
      <div style={popWrap}>
        <div style={popSection}><DashIcon.Cpu color="#1565C0" />CPU information</div>
        <div style={{ fontSize: 13, color: '#333', wordBreak: 'break-word', paddingBottom: 2 }}>{info.cpu.model}</div>
        <div style={{ fontSize: 13, color: '#666', paddingBottom: 8 }}>
          {info.cpu.physical_cores ?? info.cpu.cores} Physical core, {info.cpu.cores} Logical core
        </div>
        {info.cpu.per_core_percent && info.cpu.per_core_percent.length > 0 && (<>
          <div style={popSection}><DashIcon.Chart color="#1565C0" size={14} />Per-core usage</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {info.cpu.per_core_percent.map((v, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 4px 5px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={popLabel}>Core {i + 1}</span>
                <span style={popVal}>{v.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </>)}
        {info.cpu.cpu_times && (<>
          <div style={popSection}><DashIcon.Clock color="#1565C0" size={14} />CPU time breakdown</div>
          {Object.entries(info.cpu.cpu_times).map(([k, v]) => (
            <div key={k} style={popRow}>
              <span style={popLabel}>{k}</span>
              <span style={popVal}>{typeof v === 'number' ? v.toFixed(2) + '%' : v}</span>
            </div>
          ))}
        </>)}
        <div style={{ paddingBottom: 8 }} />
      </div>
    </div>
  );

  // === RAM POPOVER ===
  const ramPopoverContent = (
    <div style={{ width: 320 }}>
      <div style={{ ...popWrap, padding: '12px 14px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>RAM usage: <span style={{ color: '#0288D1' }}>{info.memory.usage_percent.toFixed(1)}%</span></span>
      </div>
      <div style={popWrap}>
        <div style={popSection}><DashIcon.Memory color="#1565C0" />Memory information</div>
        <div style={popRow}><span style={popLabel}>Used</span><span style={popVal}>{formatMB(info.memory.used)} MB</span></div>
        <div style={popRow}><span style={popLabel}>Total</span><span style={popVal}>{formatMB(info.memory.total)} MB</span></div>
        <div style={popRow}><span style={popLabel}>Available</span><span style={popVal}>{formatMB(info.memory.available)} MB</span></div>
        <div style={popRow}><span style={popLabel}>Buffers</span><span style={popVal}>{formatMB(info.memory.buffers ?? 0)} MB</span></div>
        <div style={{ ...popRow, borderBottom: 'none' }}><span style={popLabel}>Cached</span><span style={popVal}>{formatMB(info.memory.cached ?? 0)} MB</span></div>
      </div>
    </div>
  );

  // === DISK POPOVER ===
  const formatInodes = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return String(n);
  };
  const diskPopoverContent = (
    <div style={{ width: 320 }}>
      <div style={{ ...popWrap, padding: '12px 14px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Disk space: <span style={{ color: diskPct > 80 ? '#F44336' : '#1565C0' }}>{diskPct}%</span></span>
      </div>
      <div style={popWrap}>
        <div style={popSection}><DashIcon.HardDrive color="#1565C0" />Basic information</div>
        <div style={popRow}><span style={popLabel}>Type</span><span style={popVal}>{info.disk.fs_type || '—'}</span></div>
        <div style={popRow}><span style={popLabel}>Mount point</span><span style={popVal}>{info.disk.mount_point || '/'}</span></div>
        <div style={popRow}><span style={popLabel}>Available</span><span style={popVal}>{formatGB(info.disk.available)}G</span></div>
        <div style={popRow}><span style={popLabel}>Total</span><span style={popVal}>{formatGB(info.disk.total)}G</span></div>
        <div style={popRow}><span style={popLabel}>Used</span><span style={popVal}>{formatGB(info.disk.used)}G</span></div>
        <div style={popSection}><DashIcon.FileText color="#1565C0" />Inode information</div>
        <div style={popRow}><span style={popLabel}>File system</span><span style={popVal}>{info.disk.device || '—'}</span></div>
        <div style={popRow}><span style={popLabel}>Total Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_total ?? 0)}</span></div>
        <div style={popRow}><span style={popLabel}>Used Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_used ?? 0)}</span></div>
        <div style={popRow}><span style={popLabel}>Available Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_free ?? 0)}</span></div>
        <div style={{ ...popRow, borderBottom: 'none' }}><span style={popLabel}>Usage Inodes</span><span style={popVal}>{(info.disk.inodes_percent ?? 0).toFixed(1)}%</span></div>
      </div>
    </div>
  );

  return (
    <div>
      {/* ── Refresh bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16, gap: 8,
      }}>
        <Select
          value={refreshInterval}
          onChange={setRefreshInterval}
          options={REFRESH_OPTIONS}
          size="small"
          style={{ width: 70 }}
          suffixIcon={<SyncOutlined spin={refreshing} />}
        />
        <Button icon={<ReloadOutlined spin={refreshing} />} size="small" onClick={() => fetchData()} loading={refreshing}>
          Refresh
        </Button>
      </div>

      {/* ══════ TOP ROW: Sys Status + Disk ══════ */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* — Sys Status — */}
        <Col xs={24} lg={15} style={{ marginBottom: isMobile ? 16 : 0 }}>
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashIcon.Server color="#1565C0" /> Sys Status</div>} size="small"
            styles={{ body: { padding: '24px 16px' }, header: { fontWeight: 600 } }}
            style={{ height: '100%' }}>
            <Row gutter={8} justify="space-around" align="middle">
              {/* Load ring */}
              <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 8 }}>
                <Popover content={loadPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom">
                  <div style={{ cursor: 'pointer', display: 'inline-block', padding: 4 }}>
                    <Progress type="circle" percent={loadPct} size={isMobile ? 80 : 120} strokeColor="#1565C0" strokeWidth={8}
                      format={() => <span style={{ fontSize: isMobile ? 18 : 26, fontWeight: 700, color: '#1565C0' }}>{loadPct}%</span>} />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{getCpuStatusText(loadPct)}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{loadAvg}</Text>
                  </div>
                </Popover>
              </Col>

              {/* CPU usage ring */}
              <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 8 }}>
                <Popover content={cpuPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom">
                  <div style={{ cursor: 'pointer', display: 'inline-block', padding: 4 }}>
                    <Progress type="circle" percent={cpuPct} size={isMobile ? 80 : 120} strokeColor="#1E88E5" strokeWidth={8}
                      format={() => <span style={{ fontSize: isMobile ? 18 : 26, fontWeight: 700, color: '#1E88E5' }}>{info.cpu.usage_percent.toFixed(1)}%</span>} />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{info.cpu.cores} Core(s)</Text>
                    </div>
                    <Text style={{ fontSize: 12, fontWeight: 500 }}>CPU usage</Text>
                  </div>
                </Popover>
              </Col>

              {/* RAM ring */}
              <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 8 }}>
                <Popover content={ramPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom">
                  <div style={{ cursor: 'pointer', display: 'inline-block', padding: 4 }}>
                    <Progress type="circle" percent={memPct} size={isMobile ? 80 : 120} strokeColor="#0288D1" strokeWidth={8}
                      format={() => <span style={{ fontSize: isMobile ? 18 : 26, fontWeight: 700, color: '#0288D1' }}>{info.memory.usage_percent.toFixed(1)}%</span>} />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatMB(info.memory.used)} / {formatMB(info.memory.total)} (MB)
                      </Text>
                    </div>
                    <Text style={{ fontSize: 12, fontWeight: 500 }}>RAM usage</Text>
                  </div>
                </Popover>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* — Disk — */}
        <Col xs={24} lg={9}>
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashIcon.Disk color="#1565C0" /> Disk</div>} size="small"
            style={{ height: '100%' }}
            styles={{ body: { padding: '16px', height: 'calc(100% - 40px)' }, header: { fontWeight: 600 } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>{info.disk.mount_point || '/'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{diskPct}%</Text>
                </div>
                <Progress percent={diskPct} strokeColor={diskPct > 80 ? '#ff4d4f' : '#1565C0'} showInfo={false} size="small" />
                <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
                  {formatGB(info.disk.used)} / {formatGB(info.disk.total)} GB
                </Text>
              </div>
              <Popover content={diskPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom">
                <div style={{ cursor: 'pointer', display: 'inline-block', padding: 4 }}>
                  <Progress type="circle" percent={diskPct} size={isMobile ? 70 : 90}
                    strokeColor={diskPct > 80 ? '#ff4d4f' : '#1565C0'} strokeWidth={10}
                    format={() => <span style={{ fontSize: isMobile ? 14 : 18, fontWeight: 700, color: diskPct > 80 ? '#ff4d4f' : '#1565C0' }}>{diskPct}%</span>} />
                </div>
              </Popover>
            </div>
            {/* Extra disk info */}
            <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
              <Row gutter={[8, 6]}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Type</Text>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{info.disk.fs_type || '—'}</div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Device</Text>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.disk.device || '—'}</div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Available</Text>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#4CAF50' }}>{formatGB(info.disk.available)} GB</div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>I/O Read / Write</Text>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{formatGB(info.disk_io?.read_bytes ?? 0)} / {formatGB(info.disk_io?.write_bytes ?? 0)} GB</div>
                </Col>
              </Row>
              {/* Inode bar */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Inodes</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{(info.disk.inodes_percent ?? 0).toFixed(1)}%</Text>
                </div>
                <Progress percent={Math.round(info.disk.inodes_percent ?? 0)} strokeColor="#0288D1" showInfo={false} size="small" />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ══════ MIDDLE ROW: Overview ══════ */}
      <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashIcon.Chart color="#1565C0" /> Overview</div>} size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: '16px 0' }, header: { fontWeight: 600 } }}>
        <Row>
          {/* Sites */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px' }}>
            <DashIcon.Globe color="#1565C0" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Site – ALL</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text style={{ color: '#4CAF50' }}>Running: {info.counts.sites}</Text></div>
              <div><Text style={{ color: '#F44336' }}>Stopped: 0</Text></div>
              <div><Text type="secondary">ALL: {info.counts.sites}</Text></div>
            </div>
          </Col>

          {/* FTP */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <DashIcon.Folder color="#1E88E5" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>FTP</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Accounts: {info.counts.ftp_accounts}</Text></div>
            </div>
          </Col>

          {/* Database */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <DashIcon.Database color="#0D47A1" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Database</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">ALL: {info.counts.databases}</Text></div>
            </div>
          </Col>

          {/* Security */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <DashIcon.Shield color="#0288D1" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Security</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Security Risk: 0</Text></div>
              <div><Text type="secondary" style={{ fontSize: 12 }}>
                <DashIcon.Clock color="#999" size={12} /> Cron Jobs: {info.counts.cron_jobs}
              </Text></div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ══════ BOTTOM ROW: Software + Traffic ══════ */}
      <Row gutter={16}>
        {/* — Software — */}
        <Col xs={24} lg={12} style={{ marginBottom: isMobile ? 16 : 0 }}>
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashIcon.Package color="#1565C0" /> Software</div>} size="small"
            style={{ height: '100%' }}
            styles={{ body: { padding: 16 }, header: { fontWeight: 600 } }}>
            {installedSoftware.length === 0 ? (
              <Text type="secondary">No software installed</Text>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: 10 }}>
                {installedSoftware.map(sw => {
                  const running = sw.status === 1;
                  const swIcon = getSoftwareIcon(sw.name);
                  return (
                    <div key={sw.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid #f0f0f0', background: '#fafafa',
                      cursor: (sw.name === 'nginx' || sw.name === 'phpmyadmin') ? 'pointer' : 'default',
                      transition: 'box-shadow 0.15s',
                    }}
                    onClick={() => { if (sw.name === 'nginx') setNginxModalOpen(true); if (sw.name === 'phpmyadmin') setPmaModalOpen(true); }}
                    onMouseEnter={e => { if (sw.name === 'nginx' || sw.name === 'phpmyadmin') e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {swIcon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sw.display_name}
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>{sw.version}</div>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: running ? '#4CAF50' : '#d9d9d9', flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>

        {/* — Traffic — */}
        <Col xs={24} lg={12}>
          <Card
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DashIcon.Trending color="#1565C0" /> Traffic</div>}
            size="small"
            style={{ height: '100%' }}
            extra={
              <Space size="middle">
                <Text style={{ fontSize: 11 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#1565C0', marginRight: 4, verticalAlign: 'middle' }} />
                  Upstream
                </Text>
                <Text style={{ fontSize: 11 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#42A5F5', marginRight: 4, verticalAlign: 'middle' }} />
                  Downstream
                </Text>
              </Space>
            }
            styles={{ body: { padding: '12px 16px' }, header: { fontWeight: 600 } }}
          >
            <div style={{ display: 'flex', gap: isMobile ? 8 : 24, marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total sent: <Text strong style={{ fontSize: 12 }}>{formatNetworkSize(info.network.bytes_sent)}</Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total received: <Text strong style={{ fontSize: 12 }}>{formatNetworkSize(info.network.bytes_recv)}</Text>
              </Text>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatNetworkSize} width={isMobile ? 40 : 65} />
                <RechartsTooltip formatter={(value: unknown) => formatNetworkSize(Number(value ?? 0))} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="upstream" name="Upstream" stroke="#1565C0" fill="#1565C0" fillOpacity={0.15} />
                <Area type="monotone" dataKey="downstream" name="Downstream" stroke="#42A5F5" fill="#42A5F5" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <NginxManageModal open={nginxModalOpen} onClose={() => setNginxModalOpen(false)} />
      <PhpMyAdminManageModal open={pmaModalOpen} onClose={() => setPmaModalOpen(false)} />
    </div>
  );
}
