import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Typography, Popconfirm, Switch, Tooltip, Spin, Badge } from 'antd';
import {
  PlusOutlined, DeleteOutlined, SettingOutlined, SafetyCertificateOutlined,
  SearchOutlined, ReloadOutlined, GlobalOutlined, CodeOutlined,
  FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined,
  FileTextOutlined, LinkOutlined, LockOutlined, CloudOutlined,
  EditOutlined, MoreOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Site } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Theme constants
// ---------------------------------------------------------------------------
const PRIMARY = '#1565C0';
const PRIMARY_DARK = '#0D47A1';
const PRIMARY_LIGHT = '#E3F2FD';
const BORDER = '#E8EDF2';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#64748B';
const SUCCESS = '#4CAF50';
const ERROR = '#F44336';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  borderBottom: `1px solid ${BORDER}`,
  padding: '0 20px',
  background: '#FAFBFC',
};

const activeTabStyle: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  color: PRIMARY,
  borderBottom: `2px solid ${PRIMARY}`,
  cursor: 'pointer',
  background: 'transparent',
  marginBottom: -1,
};

const inactiveTabStyle: React.CSSProperties = {
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 500,
  color: TEXT_SECONDARY,
  cursor: 'not-allowed',
  opacity: 0.5,
  background: 'transparent',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '12px 20px',
  borderBottom: `1px solid ${BORDER}`,
};

const actionLinkStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '0 4px',
  height: 'auto',
  color: PRIMARY,
};

// Config modal sidebar
const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  cursor: 'pointer',
  fontSize: 13,
  color: active ? PRIMARY : TEXT_PRIMARY,
  background: active ? PRIMARY_LIGHT : 'transparent',
  borderLeft: active ? `3px solid ${PRIMARY}` : '3px solid transparent',
  fontWeight: active ? 600 : 400,
  transition: 'all 0.15s',
});

// ---------------------------------------------------------------------------
// Config modal sections
// ---------------------------------------------------------------------------
const CONFIG_SECTIONS = [
  { key: 'domain', label: 'Domain Manager', icon: <GlobalOutlined /> },
  { key: 'directory', label: 'Directory', icon: <FolderOpenOutlined /> },
  { key: 'config', label: 'Config', icon: <CodeOutlined /> },
  { key: 'ssl', label: 'SSL', icon: <LockOutlined /> },
  { key: 'php', label: 'PHP Version', icon: <SettingOutlined /> },
  { key: 'redirect', label: 'Redirect', icon: <LinkOutlined /> },
  { key: 'log', label: 'Response Log', icon: <FileTextOutlined /> },
] as const;

type ConfigSection = (typeof CONFIG_SECTIONS)[number]['key'];

// ---------------------------------------------------------------------------
// Domain manager sub-component
// ---------------------------------------------------------------------------
interface DomainInfo {
  id: number;
  domain: string;
  is_primary: number;
}

function DomainManagerPanel({ siteId, siteDomain }: { siteId: number; siteDomain: string }) {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/sites/${siteId}/domains`);
      setDomains(resp.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      await api.post(`/sites/${siteId}/domains`, { domain: newDomain.trim() });
      message.success('Domain added');
      setNewDomain('');
      fetchDomains();
    } catch {
      message.error('Failed to add domain');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domainId: number) => {
    try {
      await api.delete(`/sites/${siteId}/domains/${domainId}`);
      message.success('Domain removed');
      fetchDomains();
    } catch {
      message.error('Cannot remove primary domain');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          A domain per line, the default port is 80.<br />
          Wildcard domain format: *.domain.com
        </Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="example.com"
            onPressEnter={handleAdd}
            style={{ flex: 1 }}
          />
          <Button type="primary" onClick={handleAdd} loading={adding}
            style={{ background: PRIMARY, borderColor: PRIMARY }}
          >
            Add
          </Button>
        </div>
      </div>

      <Table
        dataSource={domains}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        columns={[
          {
            title: 'Domain name', dataIndex: 'domain', key: 'domain',
            render: (d: string, r: DomainInfo) => (
              <span>
                {d}
                {r.is_primary === 1 && (
                  <Badge count="Primary" style={{ background: PRIMARY, marginLeft: 8, fontSize: 10 }} />
                )}
              </span>
            ),
          },
          { title: 'Port', key: 'port', width: 80, render: () => '80' },
          {
            title: 'Operate', key: 'op', width: 80,
            render: (_: unknown, r: DomainInfo) =>
              r.is_primary === 1 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>Primary</Text>
              ) : (
                <Popconfirm title="Remove this domain?" onConfirm={() => handleRemove(r.id)}>
                  <Button type="link" size="small" danger style={{ fontSize: 12, padding: 0 }}>Delete</Button>
                </Popconfirm>
              ),
          },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor sub-component
// ---------------------------------------------------------------------------
function ConfigEditorPanel({ siteId, webserver }: { siteId: number; webserver: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: resp } = await api.get(`/sites/${siteId}/config`);
        const cfg = resp.data;
        setContent(typeof cfg === 'string' ? cfg : cfg?.content ?? cfg?.config ?? JSON.stringify(cfg, null, 2));
      } catch {
        setContent('# Failed to load configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/config`, { content });
      message.success('Configuration saved & reloaded');
    } catch {
      message.error('Failed to save (config test failed?)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{webserver?.toUpperCase()} virtual host configuration</Text>
        <Button type="primary" size="small" onClick={handleSave} loading={saving}
          style={{ background: PRIMARY, borderColor: PRIMARY }}
        >
          Save
        </Button>
      </div>
      {loading ? <Spin /> : (
        <Input.TextArea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={22}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            background: '#1B2A4A',
            color: '#E0E0E0',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            lineHeight: 1.6,
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PHP version sub-component
// ---------------------------------------------------------------------------
function PHPVersionPanel({ siteId, currentVersion, phpVersions }: { siteId: number; currentVersion?: string; phpVersions: string[] }) {
  const [version, setVersion] = useState(currentVersion || '');
  const [saving, setSaving] = useState(false);

  const handleSwitch = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/php`, { version });
      message.success('PHP version updated');
    } catch {
      message.error('Failed to switch PHP version');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
        Select the PHP version for this site. The web server config will be regenerated.
      </Text>
      <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
        <Select
          value={version}
          onChange={setVersion}
          style={{ flex: 1 }}
          disabled={phpVersions.length === 0}
          placeholder={phpVersions.length ? "Select PHP version" : "No PHP installed"}
          options={phpVersions.map(v => ({ value: v, label: `PHP ${v}` }))}
        />
        <Button type="primary" onClick={handleSwitch} loading={saving}
          style={{ background: PRIMARY, borderColor: PRIMARY }}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site info / directory panel
// ---------------------------------------------------------------------------
function DirectoryPanel({ site }: { site: Site }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
        <Text type="secondary">Document Root:</Text>
        <Text code style={{ fontSize: 12 }}>{site.path || `/ITDLUPanel/wwwroot/${site.domain}`}</Text>
        <Text type="secondary">Domain:</Text>
        <Text strong>{site.domain}</Text>
        <Text type="secondary">Web Server:</Text>
        <Text>{site.webserver?.toUpperCase()}</Text>
        <Text type="secondary">PHP Version:</Text>
        <Text>{site.php_version || 'Not set'}</Text>
        <Text type="secondary">Status:</Text>
        <span style={{ color: site.status === 1 ? SUCCESS : ERROR, fontWeight: 500 }}>
          {site.status === 1 ? 'Running' : 'Stopped'}
        </span>
        <Text type="secondary">Created:</Text>
        <Text>{site.created_at}</Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder panel
// ---------------------------------------------------------------------------
function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_SECONDARY }}>
      <CloudOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
      <div style={{ fontSize: 13 }}>{title} — Coming soon</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site config modal (matches website2.png)
// ---------------------------------------------------------------------------
function SiteConfigModal({ site, open, onClose, phpVersions }: { site: Site | null; open: boolean; onClose: () => void; phpVersions: string[] }) {
  const [section, setSection] = useState<ConfigSection>('domain');
  const isMobile = useIsMobile();

  if (!site) return null;

  const renderContent = () => {
    switch (section) {
      case 'domain':
        return <DomainManagerPanel siteId={site.id} siteDomain={site.domain} />;
      case 'directory':
        return <DirectoryPanel site={site} />;
      case 'config':
        return <ConfigEditorPanel siteId={site.id} webserver={site.webserver} />;
      case 'php':
        return <PHPVersionPanel siteId={site.id} currentVersion={site.php_version} phpVersions={phpVersions} />;
      case 'ssl':
        return <PlaceholderPanel title="SSL Certificate Management" />;
      case 'redirect':
        return <PlaceholderPanel title="Redirect Rules" />;
      case 'log':
        return <PlaceholderPanel title="Response Log" />;
      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '95%' : 860}
      centered
      destroyOnHidden
      title={
        <span style={{ fontSize: 14, color: TEXT_PRIMARY }}>
          Site modification [{site.domain}]
          <span style={{ color: TEXT_SECONDARY, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
            — Created {site.created_at}
          </span>
        </span>
      }
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: isMobile ? 'auto' : 480 }}>
        {/* Left sidebar */}
        <div style={{
          width: isMobile ? '100%' : 180,
          borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
          borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          background: '#FAFBFC',
          flexShrink: 0,
          paddingTop: isMobile ? 0 : 8,
        }}>
          {CONFIG_SECTIONS.map(s => (
            <div
              key={s.key}
              style={sidebarItemStyle(section === s.key)}
              onClick={() => setSection(s.key)}
              onMouseEnter={e => {
                if (section !== s.key) (e.currentTarget.style.background = '#f0f4f8');
              }}
              onMouseLeave={e => {
                if (section !== s.key) (e.currentTarget.style.background = 'transparent');
              }}
            >
              <span style={{ marginRight: 8, fontSize: 12 }}>{s.icon}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function WebsitesContent() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [configSite, setConfigSite] = useState<Site | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [nginxVersion, setNginxVersion] = useState('');
  const [phpVersions, setPhpVersions] = useState<string[]>([]);

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

  const fetchNginxVersion = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/software');
      const sw = resp.data || {};
      const available = sw.available || [];
      const nginx = available.find((s: { name: string; installed: boolean; version?: string }) =>
        s.name === 'nginx' && s.installed
      );
      if (nginx) setNginxVersion(`Nginx ${(nginx as { version?: string }).version || ''}`);
    } catch { /* ignore */ }
  }, []);

  const fetchPhpVersions = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/sites/php-versions');
      setPhpVersions(resp.data?.versions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); fetchNginxVersion(); fetchPhpVersions(); }, [fetchData, fetchNginxVersion, fetchPhpVersions]);

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

  const handleToggleStatus = async (site: Site) => {
    try {
      await api.post(`/sites/${site.id}/${site.status === 1 ? 'stop' : 'start'}`);
      message.success(t('common.success'));
      fetchData();
    } catch {
      message.error('Action failed');
    }
  };

  const filteredSites = useMemo(() =>
    sites.filter(s =>
      s.domain.toLowerCase().includes(searchText.toLowerCase()) ||
      s.name.toLowerCase().includes(searchText.toLowerCase())
    ),
  [sites, searchText]);

  const columns = [
    {
      title: 'Site name',
      key: 'site_name',
      render: (_: unknown, r: Site) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GlobalOutlined style={{ color: PRIMARY, fontSize: 13 }} />
            <a
              href={`http${r.ssl_enabled ? 's' : ''}://${r.domain}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: PRIMARY, fontWeight: 500, fontSize: 13 }}
            >
              {r.domain}
            </a>
            <LinkOutlined style={{ fontSize: 10, color: TEXT_SECONDARY }} />
          </div>
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 19 }}>
            {r.name !== r.domain ? r.name : r.path || `/ITDLUPanel/wwwroot/${r.domain}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 70,
      render: (_: unknown, r: Site) => (
        <Tooltip title={r.status === 1 ? 'Click to stop' : 'Click to start'}>
          <Button
            type="text"
            size="small"
            icon={r.status === 1 ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            style={{ color: r.status === 1 ? SUCCESS : TEXT_SECONDARY }}
            onClick={() => handleToggleStatus(r)}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Quick action',
      key: 'quick',
      width: 140,
      render: (_: unknown, r: Site) => (
        <Space size={4}>
          <Tooltip title="Open directory">
            <Button type="text" size="small" icon={<FolderOpenOutlined />}
              style={{ color: TEXT_SECONDARY, fontSize: 13 }}
              onClick={() => {
                window.location.href = `/files?path=${encodeURIComponent(r.path || `/ITDLUPanel/wwwroot/${r.domain}`)}`;
              }}
            />
          </Tooltip>
          {r.php_version && (
            <Badge
              count={`PHP ${r.php_version}`}
              style={{
                background: PRIMARY_LIGHT,
                color: PRIMARY_DARK,
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 3,
                boxShadow: 'none',
              }}
            />
          )}
        </Space>
      ),
    },
    {
      title: 'Expiration',
      key: 'expiry',
      width: 100,
      render: () => <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>Perpetual</span>,
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 100,
      render: (_: unknown, r: Site) => r.ssl_enabled ? (
        <span style={{ color: SUCCESS, fontSize: 12, fontWeight: 500 }}>
          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
          {r.ssl_expiry || 'Active'}
        </span>
      ) : (
        <span style={{ color: ERROR, fontSize: 12 }}>Not Set</span>
      ),
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 180,
      render: (_: unknown, r: Site) => (
        <Space size={0} split={<span style={{ color: '#E0E0E0', margin: '0 2px' }}>|</span>}>
          <Button type="link" size="small" style={actionLinkStyle}
            onClick={() => { setConfigSite(r); setConfigOpen(true); }}
          >
            Conf
          </Button>
          <Button type="link" size="small" style={actionLinkStyle}
            onClick={() => {
              setConfigSite(r);
              setConfigOpen(true);
            }}
          >
            Log
          </Button>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(r.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" style={{ ...actionLinkStyle, color: ERROR }}>
              Del
            </Button>
          </Popconfirm>
          <Tooltip title="More options">
            <Button type="text" size="small" icon={<MoreOutlined />}
              style={{ color: TEXT_SECONDARY, fontSize: 14 }}
              onClick={() => { setConfigSite(r); setConfigOpen(true); }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={cardStyle}>
        {/* Tab bar */}
        <div style={tabBarStyle}>
          <div style={activeTabStyle}>
            <GlobalOutlined style={{ marginRight: 6 }} /> PHP Project
          </div>
          <div style={inactiveTabStyle}>Node Project</div>
          <div style={inactiveTabStyle}>Proxy Project</div>
          <div style={{ flex: 1 }} />
          {nginxVersion && (
            <Badge
              count={nginxVersion}
              style={{
                background: PRIMARY_LIGHT,
                color: PRIMARY,
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                padding: '0 8px',
                boxShadow: 'none',
              }}
            />
          )}
        </div>

        {/* Toolbar */}
        <div style={toolbarStyle}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
            style={{ background: PRIMARY, borderColor: PRIMARY, fontWeight: 500 }}
          >
            {!isMobile && t('websites.add_site')}
          </Button>
          <Button icon={<EditOutlined />} onClick={() => message.info('Advanced setup coming soon')}>
            {!isMobile && 'Advanced Setup'}
          </Button>

          <div style={{ flex: 1 }} />

          <Input
            placeholder="Domain or Remarks"
            prefix={<SearchOutlined style={{ color: TEXT_SECONDARY }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: 220 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={fetchData} />
          </Tooltip>
        </div>

        {/* Table */}
        <div>
          <Table
            columns={isMobile ? columns.filter(c => !['expiry', 'ssl'].includes(c.key as string)) : columns}
            scroll={{ x: 750 }}
            dataSource={filteredSites}
            rowKey="id"
            loading={{ spinning: loading, indicator: <Spin /> }}
            size="middle"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              size: 'small',
              showTotal: (total) => <span style={{ color: TEXT_SECONDARY, fontSize: 13 }}>Total {total}</span>,
              style: { padding: '8px 16px', margin: 0 },
            }}
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      {/* Add Site Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlobalOutlined style={{ color: PRIMARY }} />
            {t('websites.add_site')}
          </span>
        }
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 520}
        okButtonProps={{ style: { background: PRIMARY, borderColor: PRIMARY } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="domain" label={t('websites.domain')}
            rules={[{ required: true, message: 'Domain is required' }]}
          >
            <Input placeholder="example.com" onChange={e => {
              if (!form.getFieldValue('name')) form.setFieldsValue({ name: e.target.value });
            }} />
          </Form.Item>
          <Form.Item name="name" label="Site Name"
            rules={[{ required: true, message: 'Site name is required' }]}
            extra="Auto-filled from domain"
          >
            <Input placeholder="example.com" />
          </Form.Item>
          <Form.Item name="webserver" label={t('websites.web_server')} initialValue="nginx" rules={[{ required: true }]}>
            <Select options={[
              { value: 'nginx', label: 'Nginx' },
              { value: 'apache', label: 'Apache' },
              { value: 'openlitespeed', label: 'OpenLiteSpeed' },
            ]} />
          </Form.Item>
          <Form.Item name="php_version" label={t('websites.php_version')}>
            <Select allowClear placeholder={phpVersions.length ? "Select PHP version" : "No PHP installed"}
              disabled={phpVersions.length === 0}
              options={phpVersions.map(v => ({ value: v, label: `PHP ${v}` }))}
            />
          </Form.Item>
          <Form.Item name="create_database" label="Create Database" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Site Config Modal (aaPanel-style left sidebar) */}
      <SiteConfigModal
        site={configSite}
        open={configOpen}
        onClose={() => { setConfigOpen(false); setConfigSite(null); }}
        phpVersions={phpVersions}
      />
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
