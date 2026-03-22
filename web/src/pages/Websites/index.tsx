import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Switch, Tooltip, Spin } from 'antd';
import {
  PlusOutlined, SettingOutlined, SafetyCertificateOutlined,
  SearchOutlined, ReloadOutlined, GlobalOutlined, CodeOutlined,
  FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined,
  FileTextOutlined, LinkOutlined, LockOutlined, CloudOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { Site } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

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
  const { p } = usePalette();
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
        <span style={{ fontSize: 12, color: p.textMuted, display: 'block', marginBottom: 8 }}>
          A domain per line, the default port is 80.<br />
          Wildcard domain format: *.domain.com
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="example.com"
            onPressEnter={handleAdd}
            style={{ flex: 1 }}
          />
          <Button type="primary" onClick={handleAdd} loading={adding}
            style={{ background: p.accent, borderColor: p.accent }}
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
              <span style={{ fontSize: 13 }}>
                {d}
                {r.is_primary === 1 && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4, marginLeft: 8,
                    background: `${p.accent}15`, color: p.accent, fontWeight: 500,
                  }}>Primary</span>
                )}
              </span>
            ),
          },
          { title: 'Port', key: 'port', width: 80, render: () => <span style={{ fontSize: 12, color: p.textMuted }}>80</span> },
          {
            title: 'Operate', key: 'op', width: 80,
            render: (_: unknown, r: DomainInfo) =>
              r.is_primary === 1 ? (
                <span style={{ fontSize: 12, color: p.textMuted }}>Primary</span>
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
  const { p } = usePalette();
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
        <span style={{ fontSize: 12, color: p.textMuted }}>{webserver?.toUpperCase()} virtual host configuration</span>
        <Button type="primary" size="small" onClick={handleSave} loading={saving}
          style={{ background: p.accent, borderColor: p.accent }}
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
            
            fontSize: 12,
            background: p.codeBg,
            color: p.text,
            border: `1px solid ${p.cardBorder}`,
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
  const { p } = usePalette();
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
      <span style={{ fontSize: 12, color: p.textMuted, display: 'block', marginBottom: 12 }}>
        Select the PHP version for this site. The web server config will be regenerated.
      </span>
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
          style={{ background: p.accent, borderColor: p.accent }}
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
  const { p } = usePalette();
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
        <span style={{ color: p.textMuted }}>Document Root:</span>
        <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: p.codeBg }}>
          {site.path || `/ITDLUPanel/wwwroot/${site.domain}`}
        </span>
        <span style={{ color: p.textMuted }}>Domain:</span>
        <span style={{ fontWeight: 600, color: p.text }}>{site.domain}</span>
        <span style={{ color: p.textMuted }}>Web Server:</span>
        <span style={{ color: p.text }}>{site.webserver?.toUpperCase()}</span>
        <span style={{ color: p.textMuted }}>PHP Version:</span>
        <span style={{ color: p.text }}>{site.php_version || 'Not set'}</span>
        <span style={{ color: p.textMuted }}>Status:</span>
        <span style={{ color: site.status === 1 ? p.green : p.red, fontWeight: 500 }}>
          {site.status === 1 ? 'Running' : 'Stopped'}
        </span>
        <span style={{ color: p.textMuted }}>Created:</span>
        <span style={{ fontSize: 12, color: p.text }}>{site.created_at}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder panel
// ---------------------------------------------------------------------------
function PlaceholderPanel({ title }: { title: string }) {
  const { p } = usePalette();
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: p.textMuted }}>
      <CloudOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
      <div style={{ fontSize: 13 }}>{title} — Coming soon</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site config modal (matches website2.png)
// ---------------------------------------------------------------------------
function SiteConfigModal({ site, open, onClose, phpVersions }: { site: Site | null; open: boolean; onClose: () => void; phpVersions: string[] }) {
  const { p } = usePalette();
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
        <span style={{ fontSize: 14, color: p.text }}>
          Site modification [<span style={{  }}>{site.domain}</span>]
          <span style={{ color: p.textMuted, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
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
          borderRight: isMobile ? 'none' : `1px solid ${p.cardBorder}`,
          borderBottom: isMobile ? `1px solid ${p.cardBorder}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
          background: p.headerBg,
          flexShrink: 0,
          paddingTop: isMobile ? 0 : 8,
        }}>
          {CONFIG_SECTIONS.map(s => {
            const active = section === s.key;
            return (
              <div
                key={s.key}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  borderRadius: 6,
                  margin: isMobile ? '4px 2px' : '2px 8px',
                  color: active ? p.accent : p.textMuted,
                  background: active ? `${p.accent}15` : 'transparent',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
                onClick={() => setSection(s.key)}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget.style.background = p.rowHover);
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget.style.background = 'transparent');
                }}
              >
                <span style={{ marginRight: 8, fontSize: 12 }}>{s.icon}</span>
                {s.label}
              </div>
            );
          })}
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
  const { p, isDark } = usePalette();
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
            <GlobalOutlined style={{ color: p.accent, fontSize: 13 }} />
            <a
              href={`http${r.ssl_enabled ? 's' : ''}://${r.domain}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: p.accent, fontWeight: 500, fontSize: 13 }}
            >
              {r.domain}
            </a>
            <LinkOutlined style={{ fontSize: 10, color: p.textMuted }} />
          </div>
          <div style={{ fontSize: 11, color: p.textMuted, marginLeft: 19 }}>
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
            style={{ color: r.status === 1 ? p.green : p.textMuted }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title="Open directory">
            <Button type="text" size="small" icon={<FolderOpenOutlined />}
              style={{ color: p.textMuted, fontSize: 13 }}
              onClick={() => {
                window.location.href = `/files?path=${encodeURIComponent(r.path || `/ITDLUPanel/wwwroot/${r.domain}`)}`;
              }}
            />
          </Tooltip>
          {r.php_version && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 8px', borderRadius: 4,
              background: `${p.purple}15`, color: p.purple,
              boxShadow: 'none',
            }}>
              PHP {r.php_version}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Expiration',
      key: 'expiry',
      width: 100,
      render: () => <span style={{ fontSize: 12, color: p.textMuted }}>Perpetual</span>,
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 100,
      render: (_: unknown, r: Site) => r.ssl_enabled ? (
        <span style={{ color: p.green, fontSize: 12, fontWeight: 500 }}>
          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
          {r.ssl_expiry || 'Active'}
        </span>
      ) : (
        <span style={{ color: p.red, fontSize: 12 }}>Not Set</span>
      ),
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 180,
      render: (_: unknown, r: Site) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <button
            style={{
              padding: '3px 8px', fontSize: 11, fontWeight: 500, borderRadius: 4,
              border: 'none', background: 'transparent', color: p.accent,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onClick={() => { setConfigSite(r); setConfigOpen(true); }}
          >
            Conf
          </button>
          <span style={{ color: p.cardBorder, margin: '0 2px' }}>|</span>
          <button
            style={{
              padding: '3px 8px', fontSize: 11, fontWeight: 500, borderRadius: 4,
              border: 'none', background: 'transparent', color: p.accent,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onClick={() => { setConfigSite(r); setConfigOpen(true); }}
          >
            Log
          </button>
          <span style={{ color: p.cardBorder, margin: '0 2px' }}>|</span>
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(r.id)}
            okText={t('common.yes')} cancelText={t('common.no')}
            okButtonProps={{ danger: true }}
          >
            <button
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 500, borderRadius: 4,
                border: 'none', background: 'transparent', color: p.red,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              Del
            </button>
          </Popconfirm>
          <Tooltip title="More options">
            <Button type="text" size="small" icon={<MoreOutlined />}
              style={{ color: p.textMuted, fontSize: 14 }}
              onClick={() => { setConfigSite(r); setConfigOpen(true); }}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        background: p.card,
        borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg,
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Websites</span>
            <span style={{
              fontSize: 11,
              padding: '2px 9px', borderRadius: 4,
              background: `${p.accent}15`, color: p.accent,
              fontWeight: 500,
            }}>
              {filteredSites.length}
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              padding: '6px 16px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: p.accent, color: '#fff',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <PlusOutlined /> {t('websites.add_site')}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          padding: '8px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', gap: 4, alignItems: 'center',
        }}>
          {[
            { key: 'php', label: 'PHP Project', icon: <GlobalOutlined style={{ marginRight: 6 }} />, active: true },
            { key: 'node', label: 'Node Project', active: false },
            { key: 'proxy', label: 'Proxy Project', active: false },
          ].map(tab => (
            <button
              key={tab.key}
              style={{
                padding: '6px 16px', borderRadius: 6,
                border: 'none', cursor: tab.active ? 'pointer' : 'not-allowed',
                fontSize: 12, fontWeight: 500,
                background: tab.active ? `${p.accent}15` : 'transparent',
                color: tab.active ? p.accent : p.textMuted,
                opacity: tab.active ? 1 : 0.5,
                transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {nginxVersion && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              padding: '2px 8px', borderRadius: 4,
              background: `${p.accent}15`, color: p.accent,
            }}>
              {nginxVersion}
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 8, padding: '12px 20px',
          borderBottom: `1px solid ${p.cardBorder}`,
        }}>
          <div style={{ flex: 1 }} />
          <Input
            placeholder="Domain or Remarks"
            prefix={<SearchOutlined style={{ color: p.textDim }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: 220 }}
            size="middle"
          />
          <Tooltip title="Refresh">
            <button
              onClick={fetchData}
              style={{
                padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <ReloadOutlined />
            </button>
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
              showTotal: (total) => <span style={{ color: p.textMuted, fontSize: 13 }}>Total {total}</span>,
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
            <GlobalOutlined style={{ color: p.accent }} />
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
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
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

      {/* Site Config Modal */}
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
