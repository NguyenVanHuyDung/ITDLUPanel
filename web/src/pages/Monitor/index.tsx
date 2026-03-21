import { useState, useEffect, useRef, useCallback } from 'react';
import { Col, Row, Table, Typography, Spin, Modal, Tooltip } from 'antd';
import {
  FullscreenOutlined,
  FullscreenExitOutlined,
  SyncOutlined,
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
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Constants & palette
// ---------------------------------------------------------------------------
const MAX_POINTS = 100;
const POLL_INTERVAL = 3000;
const CHART_HEIGHT = 220;

const colors = {
  primary: '#1565C0',
  lightBlue: '#1E88E5',
  blue: '#42A5F5',
  paleBlue: '#90CAF9',
  accent: '#0288D1',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  purple: '#7E57C2',
  read: '#4CAF50',
  write: '#FF9800',
  upstream: '#1E88E5',
  downstream: '#4CAF50',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MonitorSnapshot {
  cpu: {
    model: string;
    cores: number;
    usage_percent: number;
    load_average: number[];
    per_core?: number[];
  };
  memory: {
    total: number;
    used: number;
    available: number;
    buffers?: number;
    cached?: number;
    usage_percent: number;
  };
  swap: {
    total: number;
    used: number;
    free: number;
    usage_percent: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
    usage_percent: number;
  };
  disk_io: {
    read_bytes: number;
    write_bytes: number;
  };
  network: {
    bytes_sent: number;
    bytes_recv: number;
  };
  load_average?: number[];
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  command: string;
}

interface TimePoint {
  time: string;
  ts: number;
  cpu: number;
  memory: number;
  load1: number;
  load5: number;
  load15: number;
  diskRead: number;
  diskWrite: number;
  netUp: number;
  netDown: number;
  swap: number;
}

type ChartKey =
  | 'systemResource'
  | 'loadDetail'
  | 'cpu'
  | 'memory'
  | 'diskIO'
  | 'networkIO'
  | 'swap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
};

const formatBytesGB = (bytes: number): string =>
  (bytes / 1024 ** 3).toFixed(1);

const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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

const statusBarStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
  borderRadius: 8,
  padding: '12px 20px',
  marginBottom: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 24,
  alignItems: 'center',
  border: '1px solid #90CAF9',
};

const statusItemStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#0D47A1',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const legendDotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  marginRight: 4,
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MonitorCardProps {
  title: string;
  chartKey: ChartKey;
  onFullscreen: (key: ChartKey) => void;
  legend?: { color: string; label: string }[];
  children: React.ReactNode;
}

function MonitorCard({ title, chartKey, onFullscreen, legend, children }: MonitorCardProps) {
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

// Chart tooltip formatter
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

// Common chart axis props
const axisProps = {
  tick: { fontSize: 11, fill: '#94A3B8' },
  axisLine: { stroke: '#E2E8F0' },
  tickLine: false,
};

const gridProps = {
  strokeDasharray: '3 3',
  stroke: '#F1F5F9',
  vertical: false,
};

// ---------------------------------------------------------------------------
// Individual chart renderers
// ---------------------------------------------------------------------------

function SystemResourceChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area
          type="monotone"
          dataKey="cpu"
          name="CPU"
          stroke={colors.primary}
          fill="url(#cpuGrad)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LoadDetailChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
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

function CpuChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Line type="monotone" dataKey="cpu" name="CPU" stroke={colors.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MemoryChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Line type="monotone" dataKey="memory" name="Memory" stroke={colors.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DiskIOChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
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

function NetworkIOChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v: number) => `${v}`} />
        <RTooltip content={<ChartTooltipContent unit=" KB/s" />} />
        <Line type="monotone" dataKey="netUp" name="Upstream" stroke={colors.upstream} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="netDown" name="Downstream" stroke={colors.downstream} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SwapChart({ data, height = CHART_HEIGHT }: { data: TimePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="swapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.warning} stopOpacity={0.25} />
            <stop offset="95%" stopColor={colors.warning} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="time" {...axisProps} />
        <YAxis domain={[0, 100]} {...axisProps} tickFormatter={(v: number) => `${v}%`} />
        <RTooltip content={<ChartTooltipContent unit="%" />} />
        <Area
          type="monotone"
          dataKey="swap"
          name="Swap"
          stroke={colors.warning}
          fill="url(#swapGrad)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Map chart keys to render functions
function renderChart(key: ChartKey, data: TimePoint[], height?: number) {
  switch (key) {
    case 'systemResource': return <SystemResourceChart data={data} height={height} />;
    case 'loadDetail':     return <LoadDetailChart data={data} height={height} />;
    case 'cpu':            return <CpuChart data={data} height={height} />;
    case 'memory':         return <MemoryChart data={data} height={height} />;
    case 'diskIO':         return <DiskIOChart data={data} height={height} />;
    case 'networkIO':      return <NetworkIOChart data={data} height={height} />;
    case 'swap':           return <SwapChart data={data} height={height} />;
  }
}

const chartTitles: Record<ChartKey, string> = {
  systemResource: 'System resource usage',
  loadDetail: 'Load details',
  cpu: 'CPU',
  memory: 'Memory',
  diskIO: 'Disk I/O',
  networkIO: 'Network I/O',
  swap: 'Swap Usage',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Monitor() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [history, setHistory] = useState<TimePoint[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [fullscreenChart, setFullscreenChart] = useState<ChartKey | null>(null);
  const [polling, setPolling] = useState(true);

  const prevNetRef = useRef<{ sent: number; recv: number; diskRead: number; diskWrite: number; ts: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      const [sysResp, procResp] = await Promise.all([
        api.get('/monitor/system'),
        api.get('/monitor/processes'),
      ]);

      const sys: MonitorSnapshot = sysResp.data.data;
      const procs: ProcessInfo[] = procResp.data.data || [];

      const now = new Date();
      const ts = now.getTime();
      const loadAvg = sys.load_average || sys.cpu.load_average || [0, 0, 0];

      // Calculate network rates (KB/s) from byte deltas
      let netUp = 0;
      let netDown = 0;
      let diskReadRate = 0;
      let diskWriteRate = 0;
      const prev = prevNetRef.current;
      if (prev && ts > prev.ts) {
        const dtSec = (ts - prev.ts) / 1000;
        netUp = Math.max(0, (sys.network.bytes_sent - prev.sent) / 1024 / dtSec);
        netDown = Math.max(0, (sys.network.bytes_recv - prev.recv) / 1024 / dtSec);
        diskReadRate = Math.max(0, ((sys.disk_io?.read_bytes ?? 0) - prev.diskRead) / 1024 / dtSec);
        diskWriteRate = Math.max(0, ((sys.disk_io?.write_bytes ?? 0) - prev.diskWrite) / 1024 / dtSec);
      }
      prevNetRef.current = {
        sent: sys.network.bytes_sent,
        recv: sys.network.bytes_recv,
        diskRead: sys.disk_io?.read_bytes ?? 0,
        diskWrite: sys.disk_io?.write_bytes ?? 0,
        ts,
      };

      // Swap usage from API
      const swapPercent = sys.swap?.usage_percent ?? 0;

      const point: TimePoint = {
        time: fmtTime(now),
        ts,
        cpu: sys.cpu.usage_percent,
        memory: sys.memory.usage_percent,
        load1: loadAvg[0] ?? 0,
        load5: loadAvg[1] ?? 0,
        load15: loadAvg[2] ?? 0,
        diskRead: parseFloat(diskReadRate.toFixed(2)),
        diskWrite: parseFloat(diskWriteRate.toFixed(2)),
        netUp: parseFloat(netUp.toFixed(2)),
        netDown: parseFloat(netDown.toFixed(2)),
        swap: swapPercent,
      };

      setSnapshot(sys);
      setProcesses(procs);
      setHistory((prev) => {
        const next = [...prev, point];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    } catch {
      // Silently ignore polling errors after initial load
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (!polling) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchData(), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, polling]);

  const openFullscreen = useCallback((key: ChartKey) => setFullscreenChart(key), []);
  const closeFullscreen = useCallback(() => setFullscreenChart(null), []);

  // ---- Process table columns ----
  const procColumns = [
    { title: 'PID', dataIndex: 'pid', key: 'pid', width: 80, sorter: (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 160, ellipsis: true },
    {
      title: 'CPU %', dataIndex: 'cpu', key: 'cpu', width: 90,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpu - b.cpu,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <span style={{ color: v > 80 ? colors.error : v > 50 ? colors.warning : '#1A1A2E' }}>
          {(v ?? 0).toFixed(1)}%
        </span>
      ),
    },
    {
      title: 'MEM %', dataIndex: 'memory', key: 'mem', width: 90,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.memory - b.memory,
      render: (v: number) => (
        <span style={{ color: v > 80 ? colors.error : v > 50 ? colors.warning : '#1A1A2E' }}>
          {(v ?? 0).toFixed(1)}%
        </span>
      ),
    },
    { title: 'User', dataIndex: 'user', key: 'user', width: 100, ellipsis: true },
    { title: 'Command', dataIndex: 'command', key: 'cmd', ellipsis: true },
  ];

  // ---- Loading state ----
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Text type="secondary">Failed to load monitoring data</Text>
      </div>
    );
  }

  const loadAvg = snapshot.load_average || snapshot.cpu.load_average || [0, 0, 0];

  return (
    <div>
      {/* Status bar */}
      <div style={{ ...statusBarStyle, gap: isMobile ? 8 : 24, padding: isMobile ? '8px 12px' : '12px 20px' }}>
        <SyncOutlined
          spin={polling}
          style={{ fontSize: 14, color: polling ? colors.primary : '#94A3B8', cursor: 'pointer' }}
          onClick={() => setPolling((p) => !p)}
        />
        <span style={{ ...statusItemStyle, fontSize: isMobile ? 11 : 13 }}>
          CPU: <strong>{snapshot.cpu.usage_percent.toFixed(1)}%</strong>
        </span>
        <span style={{ color: '#90CAF9' }}>|</span>
        <span style={{ ...statusItemStyle, fontSize: isMobile ? 11 : 13 }}>
          Memory: <strong>{snapshot.memory.usage_percent.toFixed(1)}%</strong>{' '}
          ({formatBytesGB(snapshot.memory.used)}/{formatBytesGB(snapshot.memory.total)} GB)
        </span>
        <span style={{ color: '#90CAF9' }}>|</span>
        <span style={{ ...statusItemStyle, fontSize: isMobile ? 11 : 13 }}>
          Disk: <strong>{snapshot.disk.usage_percent.toFixed(1)}%</strong>{' '}
          ({formatBytesGB(snapshot.disk.used)}/{formatBytesGB(snapshot.disk.total)} GB)
        </span>
        <span style={{ color: '#90CAF9' }}>|</span>
        <span style={{ ...statusItemStyle, fontSize: isMobile ? 11 : 13 }}>
          Load: <strong>{loadAvg[0]?.toFixed(2)} {loadAvg[1]?.toFixed(2)} {loadAvg[2]?.toFixed(2)}</strong>
        </span>
      </div>

      {/* Row 1: System Resource + Load Details (full width, 2 charts side by side) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <MonitorCard
            title="System resource usage"
            chartKey="systemResource"
            onFullscreen={openFullscreen}
            legend={[{ color: colors.primary, label: 'CPU %' }]}
          >
            <SystemResourceChart data={history} />
          </MonitorCard>
        </Col>
        <Col xs={24} lg={12}>
          <MonitorCard
            title="Load details"
            chartKey="loadDetail"
            onFullscreen={openFullscreen}
            legend={[
              { color: colors.lightBlue, label: '1 min' },
              { color: colors.success, label: '5 min' },
              { color: colors.purple, label: '15 min' },
            ]}
          >
            <LoadDetailChart data={history} />
          </MonitorCard>
        </Col>
      </Row>

      {/* Row 2: CPU + Memory */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <MonitorCard
            title={t('dashboard.cpu')}
            chartKey="cpu"
            onFullscreen={openFullscreen}
            legend={[{ color: colors.primary, label: 'Usage %' }]}
          >
            <CpuChart data={history} />
          </MonitorCard>
        </Col>
        <Col xs={24} lg={12}>
          <MonitorCard
            title={t('dashboard.memory')}
            chartKey="memory"
            onFullscreen={openFullscreen}
            legend={[{ color: colors.accent, label: 'Usage %' }]}
          >
            <MemoryChart data={history} />
          </MonitorCard>
        </Col>
      </Row>

      {/* Row 3: Disk I/O + Network I/O */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <MonitorCard
            title="Disk I/O"
            chartKey="diskIO"
            onFullscreen={openFullscreen}
            legend={[
              { color: colors.read, label: 'Read' },
              { color: colors.write, label: 'Write' },
            ]}
          >
            <DiskIOChart data={history} />
          </MonitorCard>
        </Col>
        <Col xs={24} lg={12}>
          <MonitorCard
            title="Network I/O"
            chartKey="networkIO"
            onFullscreen={openFullscreen}
            legend={[
              { color: colors.upstream, label: 'Upstream' },
              { color: colors.downstream, label: 'Downstream' },
            ]}
          >
            <NetworkIOChart data={history} />
          </MonitorCard>
        </Col>
      </Row>

      {/* Row 4: Swap Usage */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <MonitorCard
            title="Swap Usage"
            chartKey="swap"
            onFullscreen={openFullscreen}
            legend={[{ color: colors.warning, label: 'Swap %' }]}
          >
            <SwapChart data={history} />
          </MonitorCard>
        </Col>
      </Row>

      {/* Process table */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>Processes</span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            {processes.length} total
          </span>
        </div>
        <div style={{ padding: '0 4px 4px' }}>
          <Table
            columns={procColumns}
            dataSource={processes}
            rowKey="pid"
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => `${total} processes`,
            }}
            scroll={{ x: 600, y: isMobile ? 300 : 420 }}
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      {/* Fullscreen modal */}
      <Modal
        open={fullscreenChart !== null}
        onCancel={closeFullscreen}
        footer={null}
        width="90vw"
        centered
        destroyOnClose
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{fullscreenChart ? chartTitles[fullscreenChart] : ''}</span>
            <FullscreenExitOutlined
              style={{ fontSize: 14, color: '#64748B', cursor: 'pointer' }}
              onClick={closeFullscreen}
            />
          </div>
        }
        styles={{
          body: { padding: '16px 8px' },
        }}
      >
        {fullscreenChart && renderChart(fullscreenChart, history, 500)}
      </Modal>
    </div>
  );
}
