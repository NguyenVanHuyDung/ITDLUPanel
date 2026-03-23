import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Select, Upload, Spin, InputNumber, message } from 'antd';
import {
  SettingOutlined, SafetyCertificateOutlined, InfoCircleOutlined,
  WarningOutlined, UploadOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

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
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [generalForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [sslInfo, setSSLInfo] = useState<SSLInfo | null>(null);
  const [sslLoading, setSSLLoading] = useState(false);
  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [portForm] = Form.useForm();
  const [portLoading, setPortLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'ssl' | 'info' | 'danger'>('general');

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

  const tabs = [
    { key: 'general' as const, icon: <SettingOutlined />, label: t('settings.general') },
    { key: 'ssl' as const, icon: <SafetyCertificateOutlined />, label: 'SSL' },
    { key: 'info' as const, icon: <InfoCircleOutlined />, label: 'Panel Info' },
    { key: 'danger' as const, icon: <WarningOutlined />, label: 'Danger Zone' },
  ];

  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
    transition: 'opacity 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnOutline: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  };

  const btnDanger: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: `1px solid ${p.red}`,
    background: 'transparent', color: p.red, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'all 0.15s',
  };

  const sectionBox: React.CSSProperties = {
    maxWidth: 640, borderRadius: 10,
    background: isDark ? p.rowAlt : p.headerBg,
    border: `1px solid ${p.cardBorder}`,
    padding: isMobile ? 16 : 28,
  };

  const infoRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: `1px solid ${p.cardBorder}`,
  };

  const renderGeneralTab = () => (
    <Spin spinning={loading}>
      <div style={sectionBox}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingOutlined style={{ fontSize: 20, color: p.accent }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>
            {t('settings.general')}
          </span>
        </div>
        <Form form={generalForm} layout="vertical" onFinish={handleSaveGeneral}>
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
          <Form.Item style={{ marginBottom: 0 }}>
            <button type="submit" disabled={saveLoading} style={{
              ...btnPrimary,
              opacity: saveLoading ? 0.6 : 1,
            }}>
              {saveLoading && <Spin size="small" />}
              {t('common.save')}
            </button>
          </Form.Item>
        </Form>
      </div>
    </Spin>
  );

  const renderSSLTab = () => (
    <Spin spinning={sslLoading}>
      <div style={sectionBox}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SafetyCertificateOutlined style={{ fontSize: 20, color: p.accent }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Panel SSL</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={infoRow}>
            <span style={{ fontSize: 13, color: p.textMuted }}>Status</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
              background: sslInfo?.enabled ? `${p.green}15` : `${p.red}15`,
              color: sslInfo?.enabled ? p.green : p.red,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 3,
                background: sslInfo?.enabled ? p.green : p.red,
              }} />
              {sslInfo?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {sslInfo?.issuer && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Issuer</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.issuer}</span>
            </div>
          )}
          {sslInfo?.expiry && (
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Expiry</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.expiry}</span>
            </div>
          )}
          {sslInfo?.type && (
            <div style={{ ...infoRow, borderBottom: 'none' }}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Type</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{sslInfo.type}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleGenerateSelfSigned} disabled={sslLoading} style={{
            ...btnOutline, opacity: sslLoading ? 0.6 : 1,
          }}>
            <SafetyCertificateOutlined /> Generate Self-Signed
          </button>
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
            <button style={btnOutline}>
              <UploadOutlined /> Upload Certificate
            </button>
          </Upload>
        </div>
      </div>
    </Spin>
  );

  const renderInfoTab = () => (
    <Spin spinning={infoLoading}>
      <div style={sectionBox}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <InfoCircleOutlined style={{ fontSize: 20, color: p.accent }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Panel Information</span>
          </div>
          <button onClick={fetchPanelInfo} style={btnOutline}>
            <ReloadOutlined /> {t('common.refresh')}
          </button>
        </div>

        {panelInfo ? (
          <div>
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Version</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{panelInfo.version}</span>
            </div>
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Uptime</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{panelInfo.uptime}</span>
            </div>
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Go Version</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{panelInfo.go_version}</span>
            </div>
            <div style={infoRow}>
              <span style={{ fontSize: 13, color: p.textMuted }}>
                <GlobalOutlined style={{ marginRight: 4 }} />OS
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>
                {panelInfo.os} ({panelInfo.arch})
              </span>
            </div>
            <div style={{ ...infoRow, borderBottom: 'none' }}>
              <span style={{ fontSize: 13, color: p.textMuted }}>Started At</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: p.text }}>{panelInfo.started_at}</span>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: p.textMuted }}>{t('common.no_data')}</span>
        )}
      </div>
    </Spin>
  );

  const renderDangerTab = () => (
    <div style={sectionBox}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <WarningOutlined style={{ fontSize: 20, color: p.red }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Danger Zone</span>
      </div>

      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: `${p.amber}10`, border: `1px solid ${p.amber}30`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 20,
      }}>
        <WarningOutlined style={{ color: p.amber, marginTop: 2 }} />
        <span style={{ fontSize: 13, color: p.text }}>
          Changing the panel port will restart the panel. You will be disconnected and need to reconnect on the new port.
        </span>
      </div>

      <Form form={portForm} layout={isMobile ? 'vertical' : 'inline'} onFinish={handleChangePort}>
        <Form.Item
          name="port"
          rules={[{ required: true, message: 'Required' }]}
        >
          <InputNumber min={1} max={65535} placeholder="New port" style={{ width: isMobile ? '100%' : 160 }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={portLoading} style={{
            ...btnDanger, opacity: portLoading ? 0.6 : 1,
          }}>
            {portLoading && <Spin size="small" />}
            Change Port
          </button>
        </Form.Item>
      </Form>
    </div>
  );

  return (
    <div>
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg, flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>
            {t('settings.title')}
          </span>
        </div>

        {/* Tab bar */}
        <div style={{
          padding: '8px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', gap: 4, flexWrap: 'wrap',
        }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
              color: activeTab === tab.key ? p.accent : p.textMuted,
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {activeTab === 'general' && renderGeneralTab()}
          {activeTab === 'ssl' && renderSSLTab()}
          {activeTab === 'info' && renderInfoTab()}
          {activeTab === 'danger' && renderDangerTab()}
        </div>
      </div>
    </div>
  );
}
