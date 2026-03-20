import { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Form, Input, Select, Button, Card, Switch, Typography,
  message, Descriptions, Alert, Upload, Space, Spin, Divider, InputNumber,
} from 'antd';
import {
  SettingOutlined, SafetyCertificateOutlined, InfoCircleOutlined,
  WarningOutlined, UploadOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

const { Title, Text, Paragraph } = Typography;

interface PanelSettings {
  port: number;
  admin_path: string;
  language: string;
}

interface SSLInfo {
  enabled: boolean;
  issuer?: string;
  expiry?: string;
  type?: string;
}

interface PanelInfo {
  version: string;
  uptime: string;
  go_version: string;
  os: string;
  arch: string;
  started_at: string;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [generalForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [sslInfo, setSSLInfo] = useState<SSLInfo | null>(null);
  const [sslLoading, setSSLLoading] = useState(false);
  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [portForm] = Form.useForm();
  const [portLoading, setPortLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<PanelSettings>>('/settings');
      generalForm.setFieldsValue(data.data);
    } catch {
      message.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [generalForm]);

  const fetchSSLInfo = useCallback(async () => {
    setSSLLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSLInfo>>('/ssl/panel');
      setSSLInfo(data.data);
    } catch {
      setSSLInfo({ enabled: false });
    } finally {
      setSSLLoading(false);
    }
  }, []);

  const fetchPanelInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const { data } = await api.get<ApiResponse<PanelInfo>>('/settings/panel-info');
      setPanelInfo(data.data);
    } catch {
      message.error('Failed to load panel info');
    } finally {
      setInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchSSLInfo();
    fetchPanelInfo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveGeneral = async (values: PanelSettings) => {
    setSaveLoading(true);
    try {
      await api.put('/settings', values);
      message.success(t('common.success'));
      if (values.language && values.language !== i18n.language) {
        i18n.changeLanguage(values.language);
      }
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleGenerateSelfSigned = async () => {
    setSSLLoading(true);
    try {
      await api.post('/ssl/panel/self-signed');
      message.success('Self-signed certificate generated');
      fetchSSLInfo();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSSLLoading(false);
    }
  };

  const handleChangePort = async (values: { port: number }) => {
    setPortLoading(true);
    try {
      await api.put('/settings', { port: values.port });
      message.success('Port changed. Panel will restart on new port.');
    } catch {
      message.error(t('common.error'));
    } finally {
      setPortLoading(false);
    }
  };

  const tabItems = [
    {
      key: 'general',
      label: <span><SettingOutlined /> {t('settings.general')}</span>,
      children: (
        <Spin spinning={loading}>
          <Card style={{ maxWidth: 600 }}>
            <Form
              form={generalForm}
              layout="vertical"
              onFinish={handleSaveGeneral}
            >
              <Form.Item label="Panel Port" name="port">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Admin Path" name="admin_path">
                <Input placeholder="/admin" addonBefore="/" />
              </Form.Item>
              <Form.Item label={t('settings.language')} name="language">
                <Select options={[
                  { value: 'en', label: '🇺🇸 English' },
                  { value: 'vi', label: '🇻🇳 Tiếng Việt' },
                ]} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={saveLoading}>
                  {t('common.save')}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Spin>
      ),
    },
    {
      key: 'ssl',
      label: <span><SafetyCertificateOutlined /> SSL</span>,
      children: (
        <Spin spinning={sslLoading}>
          <Card title="Panel SSL" style={{ maxWidth: 600 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Status">
                  {sslInfo?.enabled
                    ? <Text type="success"><CheckCircleOutlined /> Enabled</Text>
                    : <Text type="secondary"><CloseCircleOutlined /> Disabled</Text>
                  }
                </Descriptions.Item>
                {sslInfo?.issuer && (
                  <Descriptions.Item label="Issuer">{sslInfo.issuer}</Descriptions.Item>
                )}
                {sslInfo?.expiry && (
                  <Descriptions.Item label="Expiry">{sslInfo.expiry}</Descriptions.Item>
                )}
                {sslInfo?.type && (
                  <Descriptions.Item label="Type">{sslInfo.type}</Descriptions.Item>
                )}
              </Descriptions>

              <Divider />

              <Space wrap>
                <Button
                  icon={<SafetyCertificateOutlined />}
                  onClick={handleGenerateSelfSigned}
                  loading={sslLoading}
                >
                  Generate Self-Signed
                </Button>
                <Upload
                  accept=".pem,.crt,.key"
                  showUploadList={false}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    try {
                      const formData = new FormData();
                      formData.append('cert', file as File);
                      await api.post('/ssl/panel/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      });
                      onSuccess?.(null);
                      message.success('Certificate uploaded');
                      fetchSSLInfo();
                    } catch (err) {
                      onError?.(err as Error);
                      message.error('Upload failed');
                    }
                  }}
                >
                  <Button icon={<UploadOutlined />}>Upload Custom Certificate</Button>
                </Upload>
              </Space>
            </Space>
          </Card>
        </Spin>
      ),
    },
    {
      key: 'info',
      label: <span><InfoCircleOutlined /> Panel Info</span>,
      children: (
        <Spin spinning={infoLoading}>
          <Card
            title="Panel Information"
            style={{ maxWidth: 600 }}
            extra={<Button icon={<ReloadOutlined />} size="small" onClick={fetchPanelInfo}>
              {t('common.refresh')}
            </Button>}
          >
            {panelInfo ? (
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Version">
                  <Text strong>{panelInfo.version}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Uptime">{panelInfo.uptime}</Descriptions.Item>
                <Descriptions.Item label="Go Version">{panelInfo.go_version}</Descriptions.Item>
                <Descriptions.Item label={<><GlobalOutlined /> OS</>}>
                  {panelInfo.os} ({panelInfo.arch})
                </Descriptions.Item>
                <Descriptions.Item label="Started At">{panelInfo.started_at}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Text type="secondary">{t('common.no_data')}</Text>
            )}
          </Card>
        </Spin>
      ),
    },
    {
      key: 'danger',
      label: <span><WarningOutlined /> Danger Zone</span>,
      children: (
        <Card
          title={<Text type="danger"><WarningOutlined /> Danger Zone</Text>}
          style={{ maxWidth: 600, borderColor: '#ff4d4f' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="warning"
              showIcon
              message="Changing the panel port will restart the panel. You will be disconnected and need to reconnect on the new port."
            />
            <Form form={portForm} layout="inline" onFinish={handleChangePort}>
              <Form.Item
                name="port"
                rules={[{ required: true, message: 'Required' }]}
              >
                <InputNumber min={1} max={65535} placeholder="New port" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item>
                <Button danger htmlType="submit" loading={portLoading}>
                  Change Port
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>{t('settings.title')}</Title>
      <Tabs items={tabItems} />
    </div>
  );
}
