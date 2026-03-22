import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Col, Progress, Row, Typography, Spin, Button, Select, Space, Popover } from 'antd';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SystemInfo, Software } from '@/types';
import NginxManageModal from '@/components/NginxManageModal';
import { getSoftwareIcon } from '../AppStore/SoftwareIcons';

const { Text } = Typography;

/* ─── Inline SVG section icons ─── */
const SectionIcon = ({ d, color, size = 18 }: { d: string; color: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={d} />
  </svg>
);

const iconPaths = {
  server: 'M4 6h16M4 6a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 9h16M4 15a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3zM8 7.5h.01M8 16.5h.01',
  disk: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 14a4 4 0 110-8 4 4 0 010 8zm0-3a1 1 0 100-2 1 1 0 000 2z',
  chart: 'M3 3v18h18M7 16l4-4 4 4 5-6',
  box: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  trending: 'M23 6l-9.5 9.5-5-5L1 18',
  globe: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10A15 15 0 0112 2z',
  folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  database: 'M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4zM2 12c0 2.21 4.48 4 10 4s10-1.79 10-4M2 6c0 2.21 4.48 4 10 4s10-1.79 10-4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clock: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  cpu: 'M18 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3',
  memory: 'M6 3H2v18h4M18 3h4v18h-4M6 8h12M6 16h12M6 12h12',
  harddrive: 'M2 12a10 10 0 0120 0 10 10 0 01-20 0zM12 12h.01M2 12h20',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
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
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.activity} color="#1565C0" size={14} /></span>Load average</div>
        <div style={popRow}><span style={popLabel}>1 min</span><span style={popVal}>{info.cpu.load_average?.[0]?.toFixed(2) ?? '—'}</span></div>
        <div style={popRow}><span style={popLabel}>5 min</span><span style={popVal}>{info.cpu.load_average?.[1]?.toFixed(2) ?? '—'}</span></div>
        <div style={popRow}><span style={popLabel}>15 min</span><span style={popVal}>{info.cpu.load_average?.[2]?.toFixed(2) ?? '—'}</span></div>
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.server} color="#1565C0" size={14} /></span>Process information</div>
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
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.cpu} color="#1565C0" size={14} /></span>CPU information</div>
        <div style={{ fontSize: 13, color: '#333', wordBreak: 'break-word', paddingBottom: 2 }}>{info.cpu.model}</div>
        <div style={{ fontSize: 13, color: '#666', paddingBottom: 8 }}>
          {info.cpu.physical_cores ?? info.cpu.cores} Physical core, {info.cpu.cores} Logical core
        </div>
        {info.cpu.per_core_percent && info.cpu.per_core_percent.length > 0 && (<>
          <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.chart} color="#1565C0" size={14} /></span>Per-core usage</div>
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
          <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.clock} color="#1565C0" size={14} /></span>CPU time breakdown</div>
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
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.memory} color="#1565C0" size={14} /></span>Memory information</div>
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
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.harddrive} color="#1565C0" size={14} /></span>Basic information</div>
        <div style={popRow}><span style={popLabel}>Type</span><span style={popVal}>{info.disk.fs_type || '—'}</span></div>
        <div style={popRow}><span style={popLabel}>Mount point</span><span style={popVal}>{info.disk.mount_point || '/'}</span></div>
        <div style={popRow}><span style={popLabel}>Available</span><span style={popVal}>{formatGB(info.disk.available)}G</span></div>
        <div style={popRow}><span style={popLabel}>Total</span><span style={popVal}>{formatGB(info.disk.total)}G</span></div>
        <div style={popRow}><span style={popLabel}>Used</span><span style={popVal}>{formatGB(info.disk.used)}G</span></div>
        <div style={popSection}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><SectionIcon d={iconPaths.file} color="#1565C0" size={14} /></span>Inode information</div>
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
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SectionIcon d={iconPaths.server} color="#1565C0" /> Sys Status</div>} size="small"
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
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SectionIcon d={iconPaths.disk} color="#1565C0" /> Disk</div>} size="small"
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
      <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SectionIcon d={iconPaths.chart} color="#1565C0" /> Overview</div>} size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: '16px 0' }, header: { fontWeight: 600 } }}>
        <Row>
          {/* Sites */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px' }}>
            <SectionIcon d={iconPaths.globe} color="#1565C0" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Site – ALL</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text style={{ color: '#4CAF50' }}>Running: {info.counts.sites}</Text></div>
              <div><Text style={{ color: '#F44336' }}>Stopped: 0</Text></div>
              <div><Text type="secondary">ALL: {info.counts.sites}</Text></div>
            </div>
          </Col>

          {/* FTP */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <SectionIcon d={iconPaths.folder} color="#1E88E5" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>FTP</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Accounts: {info.counts.ftp_accounts}</Text></div>
            </div>
          </Col>

          {/* Database */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <SectionIcon d={iconPaths.database} color="#0D47A1" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Database</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">ALL: {info.counts.databases}</Text></div>
            </div>
          </Col>

          {/* Security */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <SectionIcon d={iconPaths.shield} color="#0288D1" size={22} />
            <div><Text strong style={{ fontSize: 14 }}>Security</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Security Risk: 0</Text></div>
              <div><Text type="secondary" style={{ fontSize: 12 }}>
                <SectionIcon d={iconPaths.clock} color="#999" size={12} /> Cron Jobs: {info.counts.cron_jobs}
              </Text></div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ══════ BOTTOM ROW: Software + Traffic ══════ */}
      <Row gutter={16}>
        {/* — Software — */}
        <Col xs={24} lg={12} style={{ marginBottom: isMobile ? 16 : 0 }}>
          <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SectionIcon d={iconPaths.box} color="#1565C0" /> Software</div>} size="small"
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
                      cursor: sw.name === 'nginx' ? 'pointer' : 'default',
                      transition: 'box-shadow 0.15s',
                    }}
                    onClick={() => { if (sw.name === 'nginx') setNginxModalOpen(true); }}
                    onMouseEnter={e => { if (sw.name === 'nginx') e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
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
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SectionIcon d={iconPaths.trending} color="#1565C0" /> Traffic</div>}
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
    </div>
  );
}
