import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm, Switch, Drawer, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined, SafetyCertificateOutlined, PlayCircleOutlined, PauseCircleOutlined, SearchOutlined, ReloadOutlined, GlobalOutlined, CodeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Site } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';

const { Title, Text } = Typography;

function WebsitesContent() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  // Config drawer state
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [configSite, setConfigSite] = useState<Site | null>(null);
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [siteDetail, setSiteDetail] = useState<Site | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/sites');
      setSites(resp.data || []);
    } catch {
      message.error('Failed to load websites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (!values.name) values.name = values.domain;
      setSubmitting(true);
      await api.post('/sites', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        message.error(axiosErr.response?.data?.message || 'Failed to create website');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/sites/${id}`);
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Failed to delete website');
    }
  };

  const openConfig = async (site: Site) => {
    setConfigSite(site);
    setConfigDrawerOpen(true);
    setConfigLoading(true);
    setConfigContent('');
    setSiteDetail(null);
    try {
      const [configResp, detailResp] = await Promise.all([
        api.get(`/sites/${site.id}/config`),
        api.get(`/sites/${site.id}`),
      ]);
      const cfg = configResp.data?.data;
      setConfigContent(typeof cfg === 'string' ? cfg : cfg?.content ?? cfg?.config ?? JSON.stringify(cfg, null, 2));
      setSiteDetail(detailResp.data?.data ?? site);
    } catch {
      setConfigContent('# Failed to load configuration');
      setSiteDetail(site);
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!configSite) return;
    setConfigSaving(true);
    try {
      await api.put(`/sites/${configSite.id}/config`, { content: configContent });
      message.success('Configuration saved');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setConfigSaving(false);
    }
  };

  const filteredSites = sites.filter(s =>
    s.domain.toLowerCase().includes(searchText.toLowerCase()) ||
    s.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: t('websites.domain'),
      dataIndex: 'domain',
      key: 'domain',
      render: (domain: string) => <a href={`https://${domain}`} target="_blank" rel="noreferrer">{domain}</a>,
    },
    { title: t('websites.web_server'), dataIndex: 'webserver', key: 'webserver', render: (v: string) => <Tag>{v?.toUpperCase()}</Tag> },
    { title: t('websites.php_version'), dataIndex: 'php_version', key: 'php', render: (v: string) => v || '—' },
    {
      title: t('websites.ssl'),
      key: 'ssl',
      render: (_: unknown, r: Site) => r.ssl_enabled
        ? <Tag icon={<SafetyCertificateOutlined />} color="success">{t('websites.ssl_enabled')}</Tag>
        : <Tag color="default">{t('websites.ssl_disabled')}</Tag>,
    },
    {
      title: t('common.status'),
      key: 'status',
      render: (_: unknown, r: Site) => r.status === 1
        ? <Tag color="success">{t('common.running')}</Tag>
        : <Tag color="error">{t('common.stopped')}</Tag>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, r: Site) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={r.status === 1 ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={async () => {
              try {
                await api.post(`/sites/${r.id}/${r.status === 1 ? 'stop' : 'start'}`);
                message.success(t('common.success'));
                fetchData();
              } catch { message.error('Action failed'); }
            }}
          />
          <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => openConfig(r)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)} okText={t('common.yes')} cancelText={t('common.no')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{t('websites.title')}</Title>
        <Space>
          <Input placeholder={t('common.search')} prefix={<SearchOutlined />} allowClear value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 250 }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>{t('websites.add_site')}</Button>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={filteredSites} rowKey="id" loading={loading} pagination={{ pageSize: 10, showTotal: total => `${t('common.total')}: ${total}` }} />
      </Card>

      <Modal
        title={t('websites.add_site')}
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="domain" label={t('websites.domain')} rules={[{ required: true, message: 'Domain is required' }]}>
            <Input placeholder="example.com" onChange={(e) => { if (!form.getFieldValue('name')) form.setFieldsValue({ name: e.target.value }); }} />
          </Form.Item>
          <Form.Item name="name" label="Site Name" rules={[{ required: true, message: 'Site name is required' }]} extra="Auto-filled from domain">
            <Input placeholder="example.com" />
          </Form.Item>
          <Form.Item name="webserver" label={t('websites.web_server')} initialValue="nginx" rules={[{ required: true }]}>
            <Select options={[{ value: 'nginx', label: 'Nginx' }, { value: 'apache', label: 'Apache' }, { value: 'openlitespeed', label: 'OpenLiteSpeed' }]} />
          </Form.Item>
          <Form.Item name="php_version" label={t('websites.php_version')}>
            <Select allowClear placeholder="Select PHP version" options={[
              { value: '8.3', label: 'PHP 8.3' }, { value: '8.2', label: 'PHP 8.2' },
              { value: '8.1', label: 'PHP 8.1' }, { value: '8.0', label: 'PHP 8.0' },
              { value: '7.4', label: 'PHP 7.4' },
            ]} />
          </Form.Item>
          <Form.Item name="create_database" label="Create Database" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Site Config Drawer */}
      <Drawer
        title={configSite ? `${configSite.domain} — Settings` : 'Site Settings'}
        open={configDrawerOpen}
        onClose={() => setConfigDrawerOpen(false)}
        width={720}
        extra={
          <Button type="primary" onClick={saveConfig} loading={configSaving}>
            Save Config
          </Button>
        }
      >
        {configSite && (
          <Tabs items={[
            {
              key: 'info',
              label: <span><GlobalOutlined /> Info</span>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Card size="small" title="Site Details">
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px' }}>
                      <Text type="secondary">Domain:</Text>
                      <Text strong>{siteDetail?.domain || configSite.domain}</Text>
                      <Text type="secondary">Web Server:</Text>
                      <Tag>{(siteDetail?.webserver || configSite.webserver)?.toUpperCase()}</Tag>
                      <Text type="secondary">PHP Version:</Text>
                      <Text>{siteDetail?.php_version || configSite.php_version || '—'}</Text>
                      <Text type="secondary">SSL:</Text>
                      {(siteDetail || configSite).ssl_enabled
                        ? <Tag color="success" icon={<SafetyCertificateOutlined />}>Enabled</Tag>
                        : <Tag color="default">Disabled</Tag>
                      }
                      <Text type="secondary">Status:</Text>
                      {(siteDetail || configSite).status === 1
                        ? <Tag color="success">Running</Tag>
                        : <Tag color="error">Stopped</Tag>
                      }
                      <Text type="secondary">Document Root:</Text>
                      <Text code>{siteDetail?.path || `/ITDLUPanel/wwwroot/${configSite.domain}`}</Text>
                    </div>
                  </Card>
                </div>
              ),
            },
            {
              key: 'config',
              label: <span><CodeOutlined /> Config File</span>,
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    {configSite.webserver?.toUpperCase()} virtual host configuration
                  </Text>
                  <Input.TextArea
                    value={configContent}
                    onChange={e => setConfigContent(e.target.value)}
                    rows={24}
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 13,
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      border: '1px solid #333',
                      borderRadius: 8,
                    }}
                    disabled={configLoading}
                    placeholder={configLoading ? 'Loading configuration...' : ''}
                  />
                </div>
              ),
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}

export default function Websites() {
  const { t } = useTranslation();
  return (
    <RequireSoftware softwareTypes={['webserver']} label={t('websites.web_server') || 'Web Server (Nginx/Apache/OpenLiteSpeed)'}>
      <WebsitesContent />
    </RequireSoftware>
  );
}
