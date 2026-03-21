import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Col, Progress, Row, Typography, Spin, Button, Select, Space, Popover } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  CodeOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  FolderOutlined,
  HddOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SystemInfo, Software } from '@/types';
import NginxManageModal from '@/components/NginxManageModal';

const { Text } = Typography;

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

const SOFTWARE_ICONS: Record<string, { icon: React.ComponentType<Record<string, unknown>>; color: string }> = {
  nginx: { icon: CloudServerOutlined, color: '#009639' },
  mysql: { icon: DatabaseOutlined, color: '#4479A1' },
  mariadb: { icon: DatabaseOutlined, color: '#003545' },
  php: { icon: CodeOutlined, color: '#777BB4' },
  phpmyadmin: { icon: ToolOutlined, color: '#ff9800' },
  redis: { icon: ThunderboltOutlined, color: '#DC382D' },
};
const DEFAULT_SW_ICON = { icon: HddOutlined, color: '#8c8c8c' };

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
  const popVal: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#1A1A2E', fontFamily: "'JetBrains Mono', monospace" };
  const popRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' };
  const popSection: React.CSSProperties = { fontWeight: 600, fontSize: 13, color: '#1565C0', margin: '14px 0 8px', padding: '0 12px' };

  // === LOAD POPOVER ===
  const loadPopoverContent = (
    <div style={{ width: 380 }}>
      <div style={{ padding: '14px 12px 10px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>System Load: <span style={{ color: '#4CAF50' }}>{loadPct}%</span></span>
      </div>
      <div style={popSection}>📊 Load average</div>
      <div style={popRow}><span style={popLabel}>1 min</span><span style={popVal}>{info.cpu.load_average?.[0]?.toFixed(2) ?? '—'}</span></div>
      <div style={popRow}><span style={popLabel}>5 min</span><span style={popVal}>{info.cpu.load_average?.[1]?.toFixed(2) ?? '—'}</span></div>
      <div style={popRow}><span style={popLabel}>15 min</span><span style={popVal}>{info.cpu.load_average?.[2]?.toFixed(2) ?? '—'}</span></div>
      <div style={popSection}>⚙️ Process information</div>
      <div style={popRow}><span style={popLabel}>Total processes</span><span style={popVal}>{info.cpu.total_processes ?? 0}</span></div>
      <div style={{ ...popRow, borderBottom: 'none' }}><span style={popLabel}>Active processes</span><span style={popVal}>{info.cpu.active_processes ?? 0}</span></div>
    </div>
  );

  // === CPU POPOVER ===
  const cpuPopoverContent = (
    <div style={{ width: 400, maxHeight: 580, overflow: 'auto', paddingBottom: 8 }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>CPU usage: <span style={{ color: '#1E88E5' }}>{info.cpu.usage_percent.toFixed(1)}%</span></span>
      </div>
      <div style={popSection}>🖥️ CPU information</div>
      <div style={{ padding: '4px 12px 2px', fontSize: 13, color: '#333' }}>{info.cpu.model}</div>
      <div style={{ padding: '2px 12px 8px', fontSize: 13, color: '#666' }}>
        {info.cpu.physical_cores ?? info.cpu.cores} Physical core, {info.cpu.cores} Logical core
      </div>
      {info.cpu.per_core_percent && info.cpu.per_core_percent.length > 0 && (<>
        <div style={popSection}>📈 Per-core usage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {info.cpu.per_core_percent.map((v, i) => (
            <div key={i} style={{ ...popRow, padding: '6px 12px' }}>
              <span style={popLabel}>Core {i + 1}</span>
              <span style={popVal}>{v.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </>)}
      {info.cpu.cpu_times && (<>
        <div style={popSection}>⏱️ CPU time breakdown</div>
        {Object.entries(info.cpu.cpu_times).map(([k, v]) => (
          <div key={k} style={popRow}>
            <span style={popLabel}>{k}</span>
            <span style={popVal}>{typeof v === 'number' ? v.toFixed(2) + '%' : v}</span>
          </div>
        ))}
      </>)}
    </div>
  );

  // === RAM POPOVER ===
  const ramPopoverContent = (
    <div style={{ width: 380 }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>RAM usage: <span style={{ color: '#0288D1' }}>{info.memory.usage_percent.toFixed(1)}%</span></span>
      </div>
      <div style={popSection}>💾 Memory information</div>
      <div style={popRow}><span style={popLabel}>Used</span><span style={popVal}>{formatMB(info.memory.used)} MB</span></div>
      <div style={popRow}><span style={popLabel}>Total</span><span style={popVal}>{formatMB(info.memory.total)} MB</span></div>
      <div style={popRow}><span style={popLabel}>Available</span><span style={popVal}>{formatMB(info.memory.available)} MB</span></div>
      <div style={popRow}><span style={popLabel}>Buffers</span><span style={popVal}>{formatMB(info.memory.buffers ?? 0)} MB</span></div>
      <div style={popRow}><span style={popLabel}>Cached</span><span style={popVal}>{formatMB(info.memory.cached ?? 0)} MB</span></div>
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
    <div style={{ width: 380 }}>
      <div style={{ padding: '14px 12px 10px', borderBottom: '2px solid #E3F2FD' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Disk space: <span style={{ color: diskPct > 80 ? '#F44336' : '#1565C0' }}>{diskPct}%</span></span>
      </div>
      <div style={popSection}>📊 Basic information</div>
      <div style={popRow}><span style={popLabel}>Type</span><span style={popVal}>{info.disk.fs_type || '—'}</span></div>
      <div style={popRow}><span style={popLabel}>Mount point</span><span style={popVal}>{info.disk.mount_point || '/'}</span></div>
      <div style={popRow}><span style={popLabel}>Available</span><span style={popVal}>{formatGB(info.disk.available)}G</span></div>
      <div style={popRow}><span style={popLabel}>Total</span><span style={popVal}>{formatGB(info.disk.total)}G</span></div>
      <div style={popRow}><span style={popLabel}>Used</span><span style={popVal}>{formatGB(info.disk.used)}G</span></div>
      <div style={popSection}>📁 Inode information</div>
      <div style={popRow}><span style={popLabel}>File system</span><span style={popVal}>{info.disk.device || '—'}</span></div>
      <div style={popRow}><span style={popLabel}>Total Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_total ?? 0)}</span></div>
      <div style={popRow}><span style={popLabel}>Used Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_used ?? 0)}</span></div>
      <div style={popRow}><span style={popLabel}>Available Inodes</span><span style={popVal}>{formatInodes(info.disk.inodes_free ?? 0)}</span></div>
      <div style={{ ...popRow, borderBottom: 'none' }}><span style={popLabel}>Usage Inodes</span><span style={popVal}>{(info.disk.inodes_percent ?? 0).toFixed(1)}%</span></div>
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
          <Card title={<><span role="img" aria-label="sys">🖥</span> Sys Status</>} size="small"
            styles={{ body: { padding: '24px 16px' }, header: { fontWeight: 600 } }}
            style={{ height: '100%' }}>
            <Row gutter={8} justify="space-around" align="middle">
              {/* Load ring */}
              <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 8 }}>
                <Popover content={loadPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom" overlayStyle={{ maxWidth: 420 }} overlayInnerStyle={{ padding: 0 }}>
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
                <Popover content={cpuPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom" overlayStyle={{ maxWidth: 440 }} overlayInnerStyle={{ padding: 0 }}>
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
                <Popover content={ramPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom" overlayStyle={{ maxWidth: 420 }} overlayInnerStyle={{ padding: 0 }}>
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
          <Card title={<><span role="img" aria-label="disk">💿</span> Disk</>} size="small"
            style={{ height: '100%' }}
            styles={{ body: { padding: '24px 16px', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20, height: 'calc(100% - 40px)' }, header: { fontWeight: 600 } }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text strong style={{ fontSize: 13 }}>/</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{diskPct}%</Text>
              </div>
              <Progress percent={diskPct} strokeColor={diskPct > 80 ? '#ff4d4f' : '#1565C0'} showInfo={false} />
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {formatGB(info.disk.used)} / {formatGB(info.disk.total)} GB
              </Text>
            </div>
            <Popover content={diskPopoverContent} title={null} trigger={isMobile ? 'click' : 'hover'} placement="bottom" overlayStyle={{ maxWidth: 420 }} overlayInnerStyle={{ padding: 0 }}>
              <div style={{ cursor: 'pointer', display: 'inline-block', padding: 4 }}>
                <Progress type="circle" percent={diskPct} size={isMobile ? 80 : 110}
                  strokeColor={diskPct > 80 ? '#ff4d4f' : '#1565C0'} strokeWidth={10}
                  format={() => <span style={{ fontSize: isMobile ? 16 : 22, fontWeight: 700, color: diskPct > 80 ? '#ff4d4f' : '#1565C0' }}>{diskPct}%</span>} />
              </div>
            </Popover>
          </Card>
        </Col>
      </Row>

      {/* ══════ MIDDLE ROW: Overview ══════ */}
      <Card title={<><span role="img" aria-label="overview">📊</span> Overview</>} size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: '16px 0' }, header: { fontWeight: 600 } }}>
        <Row>
          {/* Sites */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px' }}>
            <GlobalOutlined style={{ fontSize: 22, color: '#1565C0', marginBottom: 6 }} />
            <div><Text strong style={{ fontSize: 14 }}>Site – ALL</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text style={{ color: '#4CAF50' }}>Running: {info.counts.sites}</Text></div>
              <div><Text style={{ color: '#F44336' }}>Stopped: 0</Text></div>
              <div><Text type="secondary">ALL: {info.counts.sites}</Text></div>
            </div>
          </Col>

          {/* FTP */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <FolderOutlined style={{ fontSize: 22, color: '#1E88E5', marginBottom: 6 }} />
            <div><Text strong style={{ fontSize: 14 }}>FTP</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Accounts: {info.counts.ftp_accounts}</Text></div>
            </div>
          </Col>

          {/* Database */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <DatabaseOutlined style={{ fontSize: 22, color: '#0D47A1', marginBottom: 6 }} />
            <div><Text strong style={{ fontSize: 14 }}>Database</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">ALL: {info.counts.databases}</Text></div>
            </div>
          </Col>

          {/* Security */}
          <Col xs={12} sm={6} style={{ textAlign: 'center', padding: '8px 16px', borderLeft: '1px solid #f0f0f0' }}>
            <SafetyOutlined style={{ fontSize: 22, color: '#0288D1', marginBottom: 6 }} />
            <div><Text strong style={{ fontSize: 14 }}>Security</Text></div>
            <div style={{ marginTop: 8, lineHeight: '26px' }}>
              <div><Text type="secondary">Security Risk: 0</Text></div>
              <div><Text type="secondary" style={{ fontSize: 12 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />Cron Jobs: {info.counts.cron_jobs}
              </Text></div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ══════ BOTTOM ROW: Software + Traffic ══════ */}
      <Row gutter={16}>
        {/* — Software — */}
        <Col xs={24} lg={12} style={{ marginBottom: isMobile ? 16 : 0 }}>
          <Card title={<><span role="img" aria-label="sw">📦</span> Software</>} size="small"
            style={{ height: '100%' }}
            styles={{ body: { padding: 16 }, header: { fontWeight: 600 } }}>
            {installedSoftware.length === 0 ? (
              <Text type="secondary">No software installed</Text>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: 10 }}>
                {installedSoftware.map(sw => {
                  const { icon: Icon, color } = SOFTWARE_ICONS[sw.name] || DEFAULT_SW_ICON;
                  const running = sw.status === 1;
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
                        background: color + '18',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon style={{ fontSize: 18, color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sw.display_name}
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>{sw.version}</div>
                      </div>
                      <CaretRightOutlined style={{ color: running ? '#4CAF50' : '#d9d9d9', fontSize: 16, flexShrink: 0 }} />
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
            title={<><span role="img" aria-label="traffic">📈</span> Traffic</>}
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
