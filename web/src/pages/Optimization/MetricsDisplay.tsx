import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Progress, Typography, Space, Tag, Table } from 'antd';
import { DatabaseOutlined, GlobalOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface MariaDBMetrics {
  threads_connected: number;
  threads_running: number;
  threads_cached: number;
  max_used_connections: number;
  innodb_buffer_pool_hit: number;
  slow_queries: number;
  qcache_hits: number;
  qcache_inserts: number;
}

interface NginxMetrics {
  active_connections: number;
  accepts: number;
  handled: number;
  requests: number;
  reading: number;
  writing: number;
  waiting: number;
  worker_processes: number;
}

interface MetricsResponse {
  mariadb: MariaDBMetrics;
  nginx: NginxMetrics;
}

export default function MetricsDisplay() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const resp = await api.get('/optimization/metrics');
      setMetrics(resp.data.data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const mariaMetrics = metrics?.mariadb;
  const nginxMetrics = metrics?.nginx;

  const mariaColumns = [
    { title: 'Metric', dataIndex: 'metric', key: 'metric' },
    { title: 'Value', dataIndex: 'value', key: 'value', render: (val: any) => <Text strong>{val}</Text> },
  ];

  const mariaData = mariaMetrics ? [
    { metric: 'Threads Connected', value: `${mariaMetrics.threads_connected}` },
    { metric: 'Threads Running', value: `${mariaMetrics.threads_running}` },
    { metric: 'Threads Cached', value: `${mariaMetrics.threads_cached}` },
    { metric: 'Max Used Connections', value: `${mariaMetrics.max_used_connections}` },
    { metric: 'Buffer Pool Hit Rate', value: `${(mariaMetrics.innodb_buffer_pool_hit || 0).toFixed(2)}%` },
    { metric: 'Slow Queries', value: `${mariaMetrics.slow_queries}` },
    { metric: 'QCache Hits', value: `${mariaMetrics.qcache_hits}` },
    { metric: 'QCache Inserts', value: `${mariaMetrics.qcache_inserts}` },
  ] : [];

  const nginxData = nginxMetrics ? [
    { metric: 'Active Connections', value: `${nginxMetrics.active_connections}` },
    { metric: 'Accepts', value: `${nginxMetrics.accepts}` },
    { metric: 'Handled', value: `${nginxMetrics.handled}` },
    { metric: 'Requests', value: `${nginxMetrics.requests}` },
    { metric: 'Reading', value: `${nginxMetrics.reading}` },
    { metric: 'Writing', value: `${nginxMetrics.writing}` },
    { metric: 'Waiting', value: `${nginxMetrics.waiting}` },
    { metric: 'Worker Processes', value: `${nginxMetrics.worker_processes || 'auto'}` },
  ] : [];

  return (
    <Card title={t('optimization.detailedMetrics', 'Detailed Metrics')}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined />
                {t('optimization.mariadbMetrics', 'MariaDB Metrics')}
              </Space>
            }
          >
            {mariaMetrics && (
              <>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic
                      title={t('optimization.connections', 'Connections')}
                      value={mariaMetrics.threads_connected}
                      suffix={`/ ${mariaMetrics.max_used_connections || 200}`}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={t('optimization.running,', 'Running')}
                      value={mariaMetrics.threads_running}
                    />
                  </Col>
                </Row>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">{t('optimization.connectionUsage', 'Connection Usage')}</Text>
                  <Progress
                    percent={mariaMetrics.max_used_connections > 0
                      ? Math.round((mariaMetrics.threads_connected / mariaMetrics.max_used_connections) * 100)
                      : 0}
                    status={mariaMetrics.threads_connected / (mariaMetrics.max_used_connections || 200) > 0.8 ? 'exception' : 'normal'}
                  />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">{t('optimization.bufferHitRate', 'Buffer Pool Hit Rate')}</Text>
                  <Progress
                    percent={Math.round(mariaMetrics.innodb_buffer_pool_hit || 0)}
                    status={(mariaMetrics.innodb_buffer_pool_hit || 0) < 90 ? 'exception' : 'success'}
                  />
                </div>
                <Table
                  dataSource={mariaData}
                  columns={mariaColumns}
                  size="small"
                  pagination={false}
                  style={{ marginTop: 16 }}
                />
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={
              <Space>
                <GlobalOutlined />
                {t('optimization.nginxMetrics', 'Nginx Metrics')}
              </Space>
            }
          >
            {nginxMetrics && (
              <>
                <Row gutter={[16, 16]}>
                  <Col span={8}>
                    <Statistic
                      title={t('optimization.active,', 'Active')}
                      value={nginxMetrics.active_connections}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={t('optimization.reading,', 'Reading')}
                      value={nginxMetrics.reading}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={t('optimization.writing,', 'Writing')}
                      value={nginxMetrics.writing}
                    />
                  </Col>
                </Row>
                <Table
                  dataSource={nginxData}
                  columns={nginxColumns}
                  size="small"
                  pagination={false}
                  style={{ marginTop: 16 }}
                />
              </>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
}

const nginxColumns = [
  { title: 'Metric', dataIndex: 'metric', key: 'metric' },
  { title: 'Value', dataIndex: 'value', key: 'value', render: (val: any) => <Text strong>{val}</Text> },
];
