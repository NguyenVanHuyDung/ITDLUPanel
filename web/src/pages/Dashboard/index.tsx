import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Col, Progress, Row, Statistic, Typography, Spin, Descriptions, Button, Select, Space } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/services/api';
import type { SystemInfo } from '@/types';

const { Title, Text } = Typography;

const formatBytes = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
const formatUptime = (seconds: number) =>
  Math.floor(seconds / 86400) + 'd ' + Math.floor((seconds % 86400) / 3600) + 'h';

const REFRESH_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
];

interface ChartPoint {
  time: string;
  cpu: number;
  memory: number;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    try {
      const { data: resp } = await api.get<{ code: number; data: SystemInfo }>('/dashboard');
      const d = resp.data;
      setInfo(d);
      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0');
      setChartData(prev => {
        const next = [...prev, { time: timeStr, cpu: d.cpu.usage_percent, memory: d.memory.usage_percent }];
        return next.length > 30 ? next.slice(-30) : next;
      });
    } catch {
      // silently retry on next interval
    } finally {
      if (isInitial) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(), refreshInterval * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData, refreshInterval]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!info) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Text type="secondary">Failed to load dashboard</Text></div>;
  }

  const networkPercent = info.network.bytes_recv > 0
    ? Math.min(Math.round((info.network.bytes_sent / (info.network.bytes_sent + info.network.bytes_recv)) * 100), 100)
    : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{t('dashboard.title')}</Title>
        <Space>
          <Select
            value={refreshInterval}
            onChange={setRefreshInterval}
            options={REFRESH_OPTIONS}
            size="small"
            style={{ width: 70 }}
            suffixIcon={<SyncOutlined spin={refreshing} />}
          />
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            size="small"
            onClick={() => fetchData()}
            loading={refreshing}
          >
            Refresh
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.cpu_usage')}</Text>
              <Progress type="circle" percent={Math.round(info.cpu.usage_percent)} strokeColor="#1565C0" size={100} style={{ display: 'block', margin: '16px auto' }} />
              <Text>{info.cpu.cores} Cores</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.memory_usage')}</Text>
              <Progress type="circle" percent={Math.round(info.memory.usage_percent)} strokeColor="#2E7D32" size={100} style={{ display: 'block', margin: '16px auto' }} />
              <Text>{formatBytes(info.memory.used)} / {formatBytes(info.memory.total)}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.disk_usage')}</Text>
              <Progress type="circle" percent={Math.round(info.disk.usage_percent)} strokeColor="#FF9800" size={100} style={{ display: 'block', margin: '16px auto' }} />
              <Text>{formatBytes(info.disk.used)} / {formatBytes(info.disk.total)}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.network_traffic')}</Text>
              <Progress type="circle" percent={networkPercent} strokeColor="#0288D1" size={100} style={{ display: 'block', margin: '16px auto' }} />
              <Text>↑ {formatBytes(info.network.bytes_sent)} ↓ {formatBytes(info.network.bytes_recv)}</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title={t('dashboard.total_sites')} value={info.counts.sites} prefix={<GlobalOutlined style={{ color: '#1565C0' }} />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title={t('dashboard.total_databases')} value={info.counts.databases} prefix={<DatabaseOutlined style={{ color: '#2E7D32' }} />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title={t('dashboard.total_ftp')} value={info.counts.ftp_accounts} prefix={<CloudServerOutlined style={{ color: '#FF9800' }} />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title={t('dashboard.total_cron')} value={info.counts.cron_jobs} prefix={<ClockCircleOutlined style={{ color: '#0288D1' }} />} /></Card>
        </Col>
      </Row>

      <Card title={t('dashboard.resource_usage')} style={{ marginBottom: 24 }} extra={<ReloadOutlined onClick={() => fetchData()} />}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis unit="%" domain={[0, 100]} />
            <Tooltip />
            <Area type="monotone" dataKey="cpu" name={t('dashboard.cpu')} stroke="#1565C0" fill="#1565C0" fillOpacity={0.15} />
            <Area type="monotone" dataKey="memory" name={t('dashboard.memory')} stroke="#2E7D32" fill="#2E7D32" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title={t('dashboard.system_info')} style={{ marginBottom: 24 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label={<><DesktopOutlined /> {t('dashboard.hostname')}</>}>{info.system.hostname}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.os')}>{info.system.os}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.kernel')}>{info.system.kernel}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.uptime')}>{formatUptime(info.system.uptime)}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.panel_version')}>{info.system.panel_version}</Descriptions.Item>
          <Descriptions.Item label={t('dashboard.load_average')}>{info.cpu.load_average?.join(' / ')}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
