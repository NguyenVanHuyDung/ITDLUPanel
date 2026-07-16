import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Segmented, Spin, Statistic, Progress, List, Tag, Space, Typography, Alert, Button, Tooltip, Badge } from 'antd';
import { SettingOutlined, ThunderboltOutlined, DatabaseOutlined, GlobalOutlined, HistoryOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useTranslation } from 'react-i18next';
import ModeToggle from './ModeToggle';
import ManualConfigPanel from './ManualConfigPanel';
import AdaptiveConfigPanel from './AdaptiveConfigPanel';
import MetricsDisplay from './MetricsDisplay';
import HistoryLog from './HistoryLog';

const { Title, Text } = Typography;

interface MariaDBMetrics {
  threads_connected: number;
  threads_running: number;
  max_used_connections: number;
  innodb_buffer_pool_hit: number;
  slow_queries: number;
}

interface NginxMetrics {
  active_connections: number;
  worker_processes: number;
}

interface OptimizationStatus {
  mode: string;
  manual?: any;
  adaptive?: any;
  maria_db_metrics?: MariaDBMetrics;
  nginx_metrics?: NginxMetrics;
  recent_history?: any[];
}

export default function Optimization() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OptimizationStatus | null>(null);
  const [mode, setMode] = useState<string>('manual');
  const [activeTab, setActiveTab] = useState<string>('overview');

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await api.get('/optimization/status');
      setStatus(resp.data.data);
      setMode(resp.data.data.mode);
    } catch (error) {
      console.error('Failed to fetch optimization status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleModeChange = async (newMode: string) => {
    try {
      await api.put('/optimization/mode', { mode: newMode });
      setMode(newMode);
      fetchStatus();
    } catch (error) {
      console.error('Failed to change mode:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  const mariaMetrics = status?.maria_db_metrics;
  const nginxMetrics = status?.nginx_metrics;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={3} style={{ margin: 0 }}>
            <SettingOutlined style={{ marginRight: 8 }} />
            {t('optimization.title', 'Server Optimization')}
          </Title>
        </Col>
        <Col>
          <ModeToggle mode={mode} onChange={handleModeChange} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <DatabaseOutlined />
                {t('optimization.mariadbStatus', 'MariaDB Status')}
              </Space>
            }
            size="small"
          >
            {mariaMetrics ? (
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.connections', 'Connections')}
                    value={mariaMetrics.threads_connected}
                    suffix={`/ ${mariaMetrics.max_used_connections || 200}`}
                  />
                  <Progress
                    percent={mariaMetrics.max_used_connections > 0
                      ? Math.round((mariaMetrics.threads_connected / mariaMetrics.max_used_connections) * 100)
                      : 0}
                    size="small"
                    status={mariaMetrics.threads_connected / (mariaMetrics.max_used_connections || 200) > 0.8 ? 'exception' : 'normal'}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.running', 'Running')}
                    value={mariaMetrics.threads_running}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.bufferHit', 'Buffer Hit Rate')}
                    value={mariaMetrics.innodb_buffer_pool_hit || 0}
                    suffix="%"
                    precision={1}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.slowQueries', 'Slow Queries')}
                    value={mariaMetrics.slow_queries || 0}
                    valueStyle={{ color: (mariaMetrics.slow_queries || 0) > 10 ? '#faad14' : undefined }}
                  />
                </Col>
              </Row>
            ) : (
              <Text type="secondary">{t('optimization.notAvailable', 'Metrics not available')}</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <GlobalOutlined />
                {t('optimization.nginxStatus', 'Nginx Status')}
              </Space>
            }
            size="small"
          >
            {nginxMetrics ? (
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.activeConnections', 'Active Connections')}
                    value={nginxMetrics.active_connections || 0}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('optimization.workers', 'Workers')}
                    value={nginxMetrics.worker_processes || 'auto'}
                  />
                </Col>
              </Row>
            ) : (
              <Text type="secondary">{t('optimization.notAvailable', 'Metrics not available')}</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { label: t('optimization.tabOverview', 'Overview'), value: 'overview' },
              { label: t('optimization.tabManual', 'Manual Config'), value: 'manual' },
              { label: t('optimization.tabAdaptive', 'Adaptive'), value: 'adaptive' },
              { label: t('optimization.tabHistory', 'History'), value: 'history' },
            ]}
            block
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          {activeTab === 'overview' && (
            <Card
              title={
                <Space>
                  <ThunderboltOutlined />
                  {t('optimization.quickActions', 'Quick Actions')}
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button type="primary" onClick={() => setActiveTab('manual')}>
                  {t('optimization.applyPreset', 'Apply Preset Configuration')}
                </Button>
                {mode === 'adaptive' && (
                  <Alert
                    message={t('optimization.adaptiveActive', 'Adaptive Optimization is Active')}
                    description={t('optimization.adaptiveDesc', 'System will automatically optimize based on traffic and load.')}
                    type="info"
                    showIcon
                    icon={<CheckCircleOutlined />}
                  />
                )}
                {mode === 'manual' && (
                  <Alert
                    message={t('optimization.manualActive', 'Manual Configuration Mode')}
                    description={t('optimization.manualDesc', 'You have full control over server configuration.')}
                    type="success"
                    showIcon
                    icon={<SettingOutlined />}
                  />
                )}
              </Space>
            </Card>
          )}

          {activeTab === 'manual' && (
            <ManualConfigPanel onApplied={fetchStatus} />
          )}

          {activeTab === 'adaptive' && (
            <AdaptiveConfigPanel onApplied={fetchStatus} />
          )}

          {activeTab === 'history' && (
            <HistoryLog />
          )}
        </Col>
      </Row>

      {activeTab === 'overview' && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <MetricsDisplay />
          </Col>
        </Row>
      )}
    </div>
  );
}
