import { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Select, Switch, Button, Row, Col, Space, Typography, Divider, message, Tag, List, Alert } from 'antd';
import { SaveOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface ManualConfig {
  maria_db: {
    max_connections: number;
    buffer_pool_size: string;
    buffer_pool_instances: number;
    thread_cache_size: number;
    slow_query_log: boolean;
    slow_query_threshold: number;
    max_heap_table_size: string;
    tmp_table_size: string;
  };
  nginx: {
    worker_processes: string;
    worker_connections: number;
    keepalive_timeout: number;
    keepalive_requests: number;
    gzip_on: boolean;
    gzip_level: number;
    open_file_cache_max: number;
    client_max_body_size: string;
  };
}

interface Preset {
  id: string;
  name: string;
  description: string;
  maria_db: any;
  nginx: any;
}

export default function ManualConfigPanel({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [config, setConfig] = useState<ManualConfig | null>(null);
  const [form] = Form.useForm();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchPresets();
  }, []);

  const fetchConfig = async () => {
    try {
      const resp = await api.get('/optimization/config/manual');
      setConfig(resp.data.data);
      form.setFieldsValue(resp.data.data);
    } catch (error) {
      console.error('Failed to fetch manual config:', error);
    }
  };

  const fetchPresets = async () => {
    try {
      const resp = await api.get('/optimization/config/presets');
      setPresets(resp.data.data.presets);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      const newConfig = {
        maria_db: {
          max_connections: preset.maria_db.max_connections,
          buffer_pool_size: preset.maria_db.buffer_pool_size,
          buffer_pool_instances: preset.maria_db.buffer_pool_instances || 0,
          thread_cache_size: preset.maria_db.thread_cache_size,
          slow_query_log: preset.maria_db.slow_query_log,
          slow_query_threshold: preset.maria_db.slow_query_threshold || 1.0,
          max_heap_table_size: preset.maria_db.max_heap_table_size || '64M',
          tmp_table_size: preset.maria_db.tmp_table_size || '64M',
        },
        nginx: {
          worker_processes: preset.nginx.worker_processes,
          worker_connections: preset.nginx.worker_connections,
          keepalive_timeout: preset.nginx.keepalive_timeout,
          keepalive_requests: preset.nginx.keepalive_requests || 1000,
          gzip_on: preset.nginx.gzip_on,
          gzip_level: preset.nginx.gzip_level,
          open_file_cache_max: preset.nginx.open_file_cache_max || 10000,
          client_max_body_size: preset.nginx.client_max_body_size || '64m',
        },
      };
      setConfig(newConfig);
      form.setFieldsValue(newConfig);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();
      await api.put('/optimization/config/manual', values);
      await api.post('/optimization/apply', {});
      message.success(t('optimization.saved', 'Configuration saved successfully'));
      onApplied?.();
    } catch (error) {
      console.error('Failed to save config:', error);
      message.error(t('optimization.saveFailed', 'Failed to save configuration'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = async (presetId: string) => {
    try {
      setLoading(true);
      await api.post('/optimization/config/preset', { preset_id: presetId });
      await api.post('/optimization/apply', {});
      message.success(t('optimization.presetApplied', 'Preset applied successfully'));
      fetchConfig();
      onApplied?.();
    } catch (error) {
      console.error('Failed to apply preset:', error);
      message.error(t('optimization.presetFailed', 'Failed to apply preset'));
    } finally {
      setLoading(false);
    }
  };

  const presetColors: Record<string, string> = {
    low: 'green',
    medium: 'blue',
    high: 'orange',
    enterprise: 'red',
  };

  return (
    <Card
      title={t('optimization.manualConfig', 'Manual Configuration')}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchConfig}>
            {t('optimization.reset', 'Reset')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
            {t('optimization.applyConfig', 'Apply Configuration')}
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Title level={5}>{t('optimization.presets', 'Presets')}</Title>
          <Space wrap>
            {presets.map((preset) => (
              <Tag
                key={preset.id}
                color={presetColors[preset.id] || 'default'}
                onClick={() => handleApplyPreset(preset.id)}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
              >
                {preset.name}
              </Tag>
            ))}
          </Space>
          <Divider />
        </Col>

        <Col xs={24} lg={12}>
          <Card title={t('optimization.mariadbSettings', 'MariaDB Settings')} size="small">
            <Form.Item
              label={t('optimization.maxConnections', 'Max Connections')}
              name={['maria_db', 'max_connections']}
              rules={[{ required: true }]}
            >
              <InputNumber min={10} max={10000} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('optimization.bufferPoolSize', 'Buffer Pool Size')}
              name={['maria_db', 'buffer_pool_size']}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="128M">128M</Select.Option>
                <Select.Option value="256M">256M</Select.Option>
                <Select.Option value="512M">512M</Select.Option>
                <Select.Option value="1G">1G</Select.Option>
                <Select.Option value="2G">2G</Select.Option>
                <Select.Option value="4G">4G</Select.Option>
                <Select.Option value="8G">8G</Select.Option>
                <Select.Option value="16G">16G</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={t('optimization.threadCache', 'Thread Cache Size')}
              name={['maria_db', 'thread_cache_size']}
            >
              <InputNumber min={0} max={256} />
            </Form.Item>

            <Form.Item
              label={t('optimization.slowQueryLog', 'Slow Query Log')}
              name={['maria_db', 'slow_query_log']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label={t('optimization.slowQueryThreshold', 'Slow Query Threshold (s)')}
              name={['maria_db', 'slow_query_threshold']}
            >
              <InputNumber min={0.1} max={10} step={0.1} precision={1} />
            </Form.Item>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={t('optimization.nginxSettings', 'Nginx Settings')} size="small">
            <Form.Item
              label={t('optimization.workerProcesses', 'Worker Processes')}
              name={['nginx', 'worker_processes']}
            >
              <Select>
                <Select.Option value="auto">Auto</Select.Option>
                <Select.Option value="1">1</Select.Option>
                <Select.Option value="2">2</Select.Option>
                <Select.Option value="4">4</Select.Option>
                <Select.Option value="8">8</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={t('optimization.workerConnections', 'Worker Connections')}
              name={['nginx', 'worker_connections']}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value={512}>512</Select.Option>
                <Select.Option value={1024}>1024</Select.Option>
                <Select.Option value={2048}>2048</Select.Option>
                <Select.Option value={4096}>4096</Select.Option>
                <Select.Option value={8192}>8192</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={t('optimization.keepaliveTimeout', 'Keepalive Timeout (s)')}
              name={['nginx', 'keepalive_timeout']}
            >
              <InputNumber min={5} max={120} />
            </Form.Item>

            <Form.Item
              label={t('optimization.gzip', 'Gzip Compression')}
              name={['nginx', 'gzip_on']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label={t('optimization.gzipLevel', 'Gzip Level')}
              name={['nginx', 'gzip_level']}
            >
              <Select>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => (
                  <Select.Option key={level} value={level}>
                    {level} {level >= 5 && level <= 7 ? '(Recommended)' : ''}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label={t('optimization.clientMaxBody', 'Client Max Body Size')}
              name={['nginx', 'client_max_body_size']}
            >
              <Select>
                <Select.Option value="16m">16M</Select.Option>
                <Select.Option value="32m">32M</Select.Option>
                <Select.Option value="64m">64M</Select.Option>
                <Select.Option value="128m">128M</Select.Option>
                <Select.Option value="256m">256M</Select.Option>
              </Select>
            </Form.Item>
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
