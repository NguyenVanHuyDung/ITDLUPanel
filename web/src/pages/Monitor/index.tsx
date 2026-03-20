import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Col, Row, Table, Typography, Progress, Spin, Tag, Statistic, Space, message } from 'antd';
import { DashboardOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';

const { Title, Text } = Typography;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
};

interface MonitorData {
  cpu: { model: string; cores: number; usage_percent: number; load_average: number[]; per_core?: number[] };
  memory: { total: number; used: number; available: number; buffers?: number; cached?: number; usage_percent: number };
  disk: { total: number; used: number; available: number; usage_percent: number };
  network: { bytes_sent: number; bytes_recv: number };
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

export default function Monitor() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sysData, setSysData] = useState<MonitorData | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      const [sysResp, procResp] = await Promise.all([
        api.get('/monitor/system'),
        api.get('/monitor/processes'),
      ]);
      setSysData(sysResp.data.data);
      setProcesses(procResp.data.data || []);
    } catch {
      if (isInitial) message.error('Failed to load monitoring data');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(), 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!sysData) return <div style={{ textAlign: 'center', padding: 100 }}><Text type="secondary">Failed to load</Text></div>;

  const diskData = sysData.disk ? [{ key: 'root', ...sysData.disk }] : [];
  const netData = sysData.network ? [{ key: 'total', ...sysData.network }] : [];

  const diskColumns = [
    { title: 'Total', key: 'total', render: (_: unknown, r: typeof diskData[0]) => formatBytes(r.total) },
    { title: 'Used', key: 'used', render: (_: unknown, r: typeof diskData[0]) => formatBytes(r.used) },
    { title: 'Available', key: 'avail', render: (_: unknown, r: typeof diskData[0]) => formatBytes(r.available) },
    { title: 'Usage', key: 'usage', width: 200, render: (_: unknown, r: typeof diskData[0]) => (
      <Progress percent={Math.round(r.usage_percent)} size="small" strokeColor={r.usage_percent > 90 ? '#F44336' : r.usage_percent > 70 ? '#FF9800' : '#4CAF50'} />
    )},
  ];

  const netColumns = [
    { title: 'Bytes Sent', key: 'sent', render: (_: unknown, r: typeof netData[0]) => formatBytes(r.bytes_sent) },
    { title: 'Bytes Received', key: 'recv', render: (_: unknown, r: typeof netData[0]) => formatBytes(r.bytes_recv) },
  ];

  const procColumns = [
    { title: 'PID', dataIndex: 'pid', key: 'pid', sorter: (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'CPU %', dataIndex: 'cpu', key: 'cpu', sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpu - b.cpu, render: (v: number) => (v ?? 0).toFixed(1) + '%' },
    { title: 'MEM %', dataIndex: 'memory', key: 'mem', sorter: (a: ProcessInfo, b: ProcessInfo) => a.memory - b.memory, render: (v: number) => (v ?? 0).toFixed(1) + '%' },
    { title: 'User', dataIndex: 'user', key: 'user' },
    { title: 'Command', dataIndex: 'command', key: 'cmd', ellipsis: true },
  ];

  const loadAvg = sysData.load_average || sysData.cpu.load_average || [0, 0, 0];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}><DashboardOutlined /> {t('sidebar.monitor')}</Title>

      {/* Load Average */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card><Statistic title="Load 1m" value={loadAvg[0]?.toFixed(2)} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Load 5m" value={loadAvg[1]?.toFixed(2)} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Load 15m" value={loadAvg[2]?.toFixed(2)} /></Card></Col>
      </Row>

      {/* CPU */}
      <Card title={`${t('dashboard.cpu')} — ${sysData.cpu.model}`} style={{ marginBottom: 24 }} extra={<ReloadOutlined onClick={() => fetchData()} />}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Overall CPU</Text>
              <Progress type="circle" percent={Math.round(sysData.cpu.usage_percent)} strokeColor="#1565C0" size={120} style={{ display: 'block', margin: '16px auto' }} />
            </div>
          </Col>
          <Col xs={24} md={16}>
            <Text strong>Per-Core Usage ({sysData.cpu.cores} cores)</Text>
            <div style={{ marginTop: 12 }}>
              {(sysData.cpu.per_core || []).map((usage, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <Space>
                    <Text style={{ width: 60, display: 'inline-block' }}>Core {i}</Text>
                    <Progress percent={Math.round(usage)} size="small" style={{ width: 300 }} strokeColor={usage > 90 ? '#F44336' : usage > 70 ? '#FF9800' : '#1565C0'} />
                  </Space>
                </div>
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Memory */}
      <Card title={t('dashboard.memory')} style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center' }}>
              <Progress type="circle" percent={Math.round(sysData.memory.usage_percent)} strokeColor="#2E7D32" size={120} style={{ display: 'block', margin: '16px auto' }} />
            </div>
          </Col>
          <Col xs={24} md={16}>
            <Row gutter={[16, 16]}>
              <Col span={12}><Statistic title="Total" value={formatBytes(sysData.memory.total)} /></Col>
              <Col span={12}><Statistic title="Used" value={formatBytes(sysData.memory.used)} /></Col>
              <Col span={12}><Statistic title="Available" value={formatBytes(sysData.memory.available)} /></Col>
              <Col span={12}><Statistic title="Buffers / Cached" value={`${formatBytes(sysData.memory.buffers || 0)} / ${formatBytes(sysData.memory.cached || 0)}`} /></Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Disk Usage */}
      <Card title={t('dashboard.disk')} style={{ marginBottom: 24 }}>
        <Table columns={diskColumns} dataSource={diskData} rowKey="key" pagination={false} size="small" />
      </Card>

      {/* Network Traffic */}
      <Card title={t('dashboard.network')} style={{ marginBottom: 24 }}>
        <Table columns={netColumns} dataSource={netData} rowKey="key" pagination={false} size="small" />
      </Card>

      {/* Process List */}
      <Card title="Processes" style={{ marginBottom: 24 }}>
        <Table
          columns={procColumns}
          dataSource={processes}
          rowKey="pid"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} processes` }}
          scroll={{ y: 400 }}
        />
      </Card>
    </div>
  );
}
