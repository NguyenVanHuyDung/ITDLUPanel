import { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Switch, Button, Row, Col, Space, Typography, Divider, message, Checkbox, Slider, Collapse } from 'antd';
import { SaveOutlined, ThunderboltOutlined, DatabaseOutlined, GlobalOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface AdaptiveSettings {
  enabled: boolean;
  maria_db: {
    auto_tune_connections: boolean;
    auto_tune_buffer_pool: boolean;
    auto_tune_query_cache: boolean;
    auto_tune_slow_query: boolean;
    max_connections_limit: number;
    buffer_pool_percent: number;
    connection_warning_pct: number;
    connection_critical_pct: number;
    buffer_hit_warning_pct: number;
    slow_query_threshold: number;
  };
  nginx: {
    auto_tune_workers: boolean;
    auto_tune_connections: boolean;
    auto_tune_keepalive: boolean;
    auto_tune_gzip: boolean;
    min_worker_connections: number;
    max_worker_connections: number;
    keepalive_timeout: number;
    gzip_min_level: number;
    gzip_max_level: number;
    conn_per_worker_warning: number;
    conn_per_worker_critical: number;
  };
}

export default function AdaptiveConfigPanel({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AdaptiveSettings | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const resp = await api.get('/optimization/config/adaptive');
      setSettings(resp.data.data);
      form.setFieldsValue(resp.data.data);
    } catch (error) {
      console.error('Failed to fetch adaptive settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();
      await api.put('/optimization/config/adaptive', values);
      message.success(t('optimization.saved', 'Settings saved successfully'));
      onApplied?.();
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error(t('optimization.saveFailed', 'Failed to save settings'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          {t('optimization.adaptiveSettings', 'Adaptive Optimization Settings')}
        </Space>
      }
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
          {t('optimization.saveSettings', 'Save Settings')}
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Collapse defaultActiveKey={['maria', 'nginx']}>
          <Panel
            header={
              <Space>
                <DatabaseOutlined />
                <Text strong>{t('optimization.mariadbAdaptive', 'MariaDB Adaptive Settings')}</Text>
              </Space>
            }
            key="maria"
          >
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Text strong>{t('optimization.autoTuneOptions', 'Auto-tune Options')}</Text>
                <div style={{ marginTop: 8 }}>
                  <Form.Item name={['maria_db', 'auto_tune_connections']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneConnections', 'Auto-tune Max Connections')}</Checkbox>
                  </Form.Item>
                  <Form.Item name={['maria_db', 'auto_tune_buffer_pool']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneBufferPool', 'Auto-tune Buffer Pool')}</Checkbox>
                  </Form.Item>
                  <Form.Item name={['maria_db', 'auto_tune_slow_query']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneSlowQuery', 'Auto-tune Slow Query Log')}</Checkbox>
                  </Form.Item>
                </div>
              </Col>

              <Col xs={24} lg={12}>
                <Form.Item
                  label={t('optimization.maxConnectionsLimit', 'Max Connections Limit')}
                  name={['maria_db', 'max_connections_limit']}
                >
                  <InputNumber min={100} max={10000} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={t('optimization.bufferPoolPercent', 'Buffer Pool % of RAM')}
                  name={['maria_db', 'buffer_pool_percent']}
                >
                  <Slider min={40} max={90} marks={{ 40: '40%', 70: '70%', 90: '90%' }} />
                </Form.Item>
              </Col>

              <Col xs={24} lg={12}>
                <Form.Item
                  label={t('optimization.connectionWarning', 'Connection Warning Threshold')}
                  name={['maria_db', 'connection_warning_pct']}
                >
                  <Slider min={50} max={95} marks={{ 50: '50%', 80: '80%', 95: '95%' }} />
                </Form.Item>

                <Form.Item
                  label={t('optimization.bufferHitWarning', 'Buffer Hit Rate Warning')}
                  name={['maria_db', 'buffer_hit_warning_pct']}
                >
                  <Slider min={70} max={99} marks={{ 70: '70%', 90: '90%', 99: '99%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>

          <Panel
            header={
              <Space>
                <GlobalOutlined />
                <Text strong>{t('optimization.nginxAdaptive', 'Nginx Adaptive Settings')}</Text>
              </Space>
            }
            key="nginx"
          >
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Text strong>{t('optimization.autoTuneOptions', 'Auto-tune Options')}</Text>
                <div style={{ marginTop: 8 }}>
                  <Form.Item name={['nginx', 'auto_tune_workers']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneWorkers', 'Auto-tune Worker Processes')}</Checkbox>
                  </Form.Item>
                  <Form.Item name={['nginx', 'auto_tune_connections']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneWorkerConnections', 'Auto-tune Worker Connections')}</Checkbox>
                  </Form.Item>
                  <Form.Item name={['nginx', 'auto_tune_gzip']} valuePropName="checked" style={{ marginBottom: 8 }}>
                    <Checkbox>{t('optimization.autoTuneGzip', 'Auto-tune Gzip Compression')}</Checkbox>
                  </Form.Item>
                </div>
              </Col>

              <Col xs={24} lg={12}>
                <Form.Item
                  label={t('optimization.minWorkerConnections', 'Min Worker Connections')}
                  name={['nginx', 'min_worker_connections']}
                >
                  <InputNumber min={256} max={4096} step={256} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={t('optimization.maxWorkerConnections', 'Max Worker Connections')}
                  name={['nginx', 'max_worker_connections']}
                >
                  <InputNumber min={2048} max={16384} step={512} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={t('optimization.connPerWorkerWarning', 'Connection/Worker Warning')}
                  name={['nginx', 'conn_per_worker_warning']}
                >
                  <InputNumber min={500} max={4000} step={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>

              <Col xs={24} lg={12}>
                <Form.Item
                  label={t('optimization.keepaliveTimeout', 'Keepalive Timeout (s)')}
                  name={['nginx', 'keepalive_timeout']}
                >
                  <InputNumber min={15} max={120} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={t('optimization.gzipLevelRange', 'Gzip Level Range')}
                >
                  <Space>
                    <Form.Item name={['nginx', 'gzip_min_level']} noStyle>
                      <InputNumber min={1} max={9} />
                    </Form.Item>
                    <span>to</span>
                    <Form.Item name={['nginx', 'gzip_max_level']} noStyle>
                      <InputNumber min={1} max={9} />
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Panel>
        </Collapse>
      </Form>
    </Card>
  );
}
