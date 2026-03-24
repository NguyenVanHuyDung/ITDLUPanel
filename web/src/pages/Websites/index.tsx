import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Switch, Tooltip, Spin } from 'antd';
import {
  PlusOutlined, SettingOutlined, SafetyCertificateOutlined,
  SearchOutlined, ReloadOutlined, GlobalOutlined, CodeOutlined,
  FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined,
  FileTextOutlined, LinkOutlined, LockOutlined, CloudOutlined,
  MoreOutlined, DeleteOutlined, ExclamationCircleOutlined,
  CloudUploadOutlined, DownloadOutlined, UndoOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import '@/lib/monaco-setup';
import api from '@/services/api';
import type { Site, ApiResponse } from '@/types';
import RequireSoftware from '@/components/RequireSoftware';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackupRecord {
  id: number;
  type: string;
  name: string;
  target_id: number | null;
  target_name: string | null;
  file_path: string;
  file_size: number;
  storage: string;
  status: string;
  created_at: string;
}

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
  const { p, isDark } = usePalette();
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: p.textMuted }}>{webserver?.toUpperCase()} virtual host configuration</span>
        <Button type="primary" size="small" onClick={handleSave} loading={saving}
          style={{ background: p.accent, borderColor: p.accent }}
        >
          Save
        </Button>
      </div>
      {loading ? <Spin /> : (
        <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 6, overflow: 'hidden', flex: 1 }}>
          <Editor
            height="420px"
            theme={isDark ? 'vs-dark' : 'light'}
            language="ini"
            value={content}
            onChange={(v) => setContent(v ?? '')}
            options={{
              fontSize: 13,
              tabSize: 4,
              wordWrap: 'on',
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
              cursorSmoothCaretAnimation: 'on',
              padding: { top: 8 },
            }}
          />
        </div>
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
  const [siteDir, setSiteDir] = useState(site.path || `/ITDLUPanel/wwwroot/${site.domain}`);
  const [savingDir, setSavingDir] = useState(false);
  const [subdirs, setSubdirs] = useState<string[]>([]);
  const [runningDir, setRunningDir] = useState('');
  const [savingRunDir, setSavingRunDir] = useState(false);
  const [openBasedir, setOpenBasedir] = useState(false);
  const [savingBasedir, setSavingBasedir] = useState(false);
  const [accessLog, setAccessLog] = useState(true);
  const [savingAccessLog, setSavingAccessLog] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [passwordUser, setPasswordUser] = useState('');
  const [passwordPass, setPasswordPass] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [existingUser, setExistingUser] = useState('');

  // Fetch all directory settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [subR, basedirR, logR, passR] = await Promise.allSettled([
          api.get<ApiResponse<string[]>>(`/sites/${site.id}/subdirs`),
          api.get<ApiResponse<{ enabled: boolean; value: string }>>(`/sites/${site.id}/open-basedir`),
          api.get<ApiResponse<{ enabled: boolean }>>(`/sites/${site.id}/access-log`),
          api.get<ApiResponse<{ enabled: boolean; username: string }>>(`/sites/${site.id}/password-access`),
        ]);
        if (subR.status === 'fulfilled') setSubdirs(subR.value.data.data ?? []);
        if (basedirR.status === 'fulfilled') setOpenBasedir(basedirR.value.data.data?.enabled ?? false);
        if (logR.status === 'fulfilled') setAccessLog(logR.value.data.data?.enabled ?? true);
        if (passR.status === 'fulfilled') {
          const d = passR.value.data.data;
          if (d?.enabled) {
            setPasswordEnabled(true);
            setExistingUser(d.username);
            setPasswordUser(d.username);
          }
        }
      } catch { /* ignore */ }
    };
    fetchSettings();
  }, [site.id]);

  const handleSaveDir = async () => {
    setSavingDir(true);
    try {
      await api.put(`/sites/${site.id}/directory`, { path: siteDir });
      message.success('Site directory updated');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update directory');
    } finally { setSavingDir(false); }
  };

  const handleSaveRunningDir = async () => {
    setSavingRunDir(true);
    try {
      await api.put(`/sites/${site.id}/running-directory`, { subdir: runningDir });
      message.success('Running directory updated');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update running directory');
    } finally { setSavingRunDir(false); }
  };

  const handleToggleBasedir = async (checked: boolean) => {
    setSavingBasedir(true);
    try {
      await api.put(`/sites/${site.id}/open-basedir`, { enabled: checked });
      setOpenBasedir(checked);
      message.success(checked ? 'open_basedir enabled' : 'open_basedir disabled');
    } catch { message.error('Failed to update open_basedir'); }
    finally { setSavingBasedir(false); }
  };

  const handleToggleAccessLog = async (checked: boolean) => {
    setSavingAccessLog(true);
    try {
      await api.put(`/sites/${site.id}/access-log`, { enabled: checked });
      setAccessLog(checked);
      message.success(checked ? 'Access log enabled' : 'Access log disabled');
    } catch { message.error('Failed to update access log'); }
    finally { setSavingAccessLog(false); }
  };

  const handleSavePassword = async () => {
    setSavingPassword(true);
    try {
      await api.put(`/sites/${site.id}/password-access`, {
        enabled: passwordEnabled,
        username: passwordUser,
        password: passwordPass,
      });
      if (passwordEnabled) {
        setExistingUser(passwordUser);
        message.success('Password protection enabled');
      } else {
        setExistingUser('');
        setPasswordUser('');
        setPasswordPass('');
        message.success('Password protection disabled');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update password access');
    } finally { setSavingPassword(false); }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px',
    borderRadius: 8,
    border: `1px solid ${p.cardBorder}`,
    marginBottom: 14,
    background: p.card,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 11, color: p.textMuted, marginBottom: 10,
  };

  const btnStyle = (loading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
    transition: 'all 0.15s',
  });

  return (
    <div>
      {/* ── 1. Site Directory ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <FolderOpenOutlined style={{ color: p.accent }} />
          Site Directory
        </div>
        <div style={hintStyle}>
          The document root where your site files are stored. Changing this will update the nginx configuration.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={siteDir}
            onChange={e => setSiteDir(e.target.value)}
            style={{ flex: 1, fontSize: 12 }}
            placeholder="/path/to/site/root"
          />
          <button onClick={handleSaveDir} disabled={savingDir} style={btnStyle(savingDir)}>
            {savingDir ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── 2. Running Directory ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <FolderOpenOutlined style={{ color: p.purple || '#8B5CF6' }} />
          Running Directory
        </div>
        <div style={hintStyle}>
          Select a subfolder of your site directory to serve as the actual web root (e.g. <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>public</code>, <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>dist</code>).
          Leave empty to use the site directory itself.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            value={runningDir || undefined}
            onChange={v => setRunningDir(v || '')}
            placeholder="/ (site root)"
            allowClear
            style={{ flex: 1 }}
            options={[
              { value: '', label: '/ (site root)' },
              ...subdirs.map(d => ({ value: d, label: d })),
            ]}
          />
          <button onClick={handleSaveRunningDir} disabled={savingRunDir} style={btnStyle(savingRunDir)}>
            {savingRunDir ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── 3. Anti-XSS (open_basedir) ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={labelStyle}>
              <LockOutlined style={{ color: p.amber || '#F59E0B' }} />
              Anti-XSS Protection
            </div>
            <div style={hintStyle}>
              Restricts PHP to only access this site's directory and /tmp using <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>open_basedir</code>. Prevents cross-site file access.
            </div>
          </div>
          <Switch
            checked={openBasedir}
            onChange={handleToggleBasedir}
            loading={savingBasedir}
          />
        </div>
      </div>

      {/* ── 4. Access Log ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={labelStyle}>
              <FileTextOutlined style={{ color: p.green }} />
              Write Access Log
            </div>
            <div style={hintStyle}>
              Record all HTTP requests to this site. Log path: <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>/var/log/nginx/{site.domain}.access.log</code>
            </div>
          </div>
          <Switch
            checked={accessLog}
            onChange={handleToggleAccessLog}
            loading={savingAccessLog}
          />
        </div>
      </div>

      {/* ── 5. Password Access ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: passwordEnabled ? 12 : 0 }}>
          <div>
            <div style={labelStyle}>
              <LockOutlined style={{ color: p.red }} />
              Password Access
            </div>
            <div style={hintStyle}>
              Protect this site with HTTP Basic Authentication. Visitors must enter a username and password.
              {existingUser && !passwordEnabled && <span> (Currently set for user: <strong>{existingUser}</strong>)</span>}
            </div>
          </div>
          <Switch
            checked={passwordEnabled}
            onChange={v => setPasswordEnabled(v)}
          />
        </div>
        {passwordEnabled && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <Input
                placeholder="Username"
                value={passwordUser}
                onChange={e => setPasswordUser(e.target.value)}
                style={{ fontSize: 12 }}
              />
              <Input.Password
                placeholder="Password"
                value={passwordPass}
                onChange={e => setPasswordPass(e.target.value)}
                style={{ fontSize: 12 }}
              />
            </div>
            <button onClick={handleSavePassword} disabled={savingPassword} style={btnStyle(savingPassword)}>
              {savingPassword ? 'Saving...' : 'Save Password Protection'}
            </button>
          </div>
        )}
        {!passwordEnabled && existingUser && (
          <button onClick={handleSavePassword} disabled={savingPassword} style={{ ...btnStyle(savingPassword), background: p.red }}>
            {savingPassword ? 'Removing...' : 'Remove Password Protection'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSL panel
// ---------------------------------------------------------------------------
interface CertInfo {
  domain: string;
  ssl_type: string;
  issuer: string;
  issuer_cn: string;
  valid_from: string;
  valid_until: string;
  dns_names: string[];
  cert_path: string;
  key_path: string;
}

const SSL_TABS = [
  { key: 'current', label: 'Current Cert' },
  { key: 'custom', label: 'Custom Certificate' },
  { key: 'letsencrypt', label: "Let's Encrypt" },
  { key: 'holder', label: 'Certificate Holder' },
] as const;

type SSLTab = (typeof SSL_TABS)[number]['key'];

function SSLPanel({ siteId, siteDomain }: { siteId: number; siteDomain: string }) {
  const { p, isDark } = usePalette();
  const [activeTab, setActiveTab] = useState<SSLTab>('current');
  const [sslInfo, setSslInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [certs, setCerts] = useState<CertInfo[]>([]);
  const [certPEM, setCertPEM] = useState('');
  const [keyPEM, setKeyPEM] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSSL = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/sites/${siteId}/ssl`);
      setSslInfo(res.data?.data ?? res.data ?? null);
    } catch {
      setSslInfo(null);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchCerts = useCallback(async () => {
    try {
      const res = await api.get('/ssl/certificates');
      setCerts(res.data?.data ?? res.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSSL(); }, [fetchSSL]);
  useEffect(() => { if (activeTab === 'holder') fetchCerts(); }, [activeTab, fetchCerts]);

  const enableSSL = async (certPath: string, keyPath: string, sslType: string) => {
    await api.post(`/sites/${siteId}/ssl/enable`, { cert_path: certPath, key_path: keyPath, ssl_type: sslType });
    await fetchSSL();
  };

  const handleDisable = async () => {
    try {
      setSubmitting(true);
      await api.post(`/sites/${siteId}/ssl/disable`);
      message.success('SSL disabled');
      await fetchSSL();
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to disable SSL');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadCustom = async () => {
    if (!certPEM.trim() || !keyPEM.trim()) { message.error('Please provide both certificate and private key'); return; }
    try {
      setSubmitting(true);
      const res = await api.post('/ssl/upload', { domain: siteDomain, cert: certPEM, key: keyPEM });
      const d = res.data?.data ?? res.data;
      await enableSSL(d.cert_path, d.key_path, 'custom');
      message.success('Custom certificate installed');
      setCertPEM(''); setKeyPEM('');
      setActiveTab('current');
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to upload certificate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLetsEncrypt = async () => {
    if (!email.trim()) { message.error('Please enter an email address'); return; }
    try {
      setSubmitting(true);
      const res = await api.post('/ssl/letsencrypt', { domain: siteDomain, email });
      const d = res.data?.data ?? res.data;
      await enableSSL(d.cert_path, d.key_path, 'letsencrypt');
      message.success("Let's Encrypt certificate issued");
      setActiveTab('current');
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to issue Let's Encrypt certificate");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceRenew = async () => {
    try {
      setSubmitting(true);
      const res = await api.post('/ssl/letsencrypt', { domain: siteDomain, email: sslInfo?.email || '' });
      const d = res.data?.data ?? res.data;
      await enableSSL(d.cert_path, d.key_path, 'letsencrypt');
      message.success('Certificate renewed');
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to renew certificate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApply = async (sourceDomain: string) => {
    try {
      setSubmitting(true);
      await api.post(`/sites/${siteId}/ssl/apply`, { source_domain: sourceDomain });
      message.success('Certificate applied');
      await fetchSSL();
      setActiveTab('current');
    } catch (e: any) {
      message.error(e?.response?.data?.message || 'Failed to apply certificate');
    } finally {
      setSubmitting(false);
    }
  };

  const isExpired = (d: string) => new Date(d) < new Date();
  const isExpiringSoon = (d: string) => { const diff = new Date(d).getTime() - Date.now(); return diff > 0 && diff < 30 * 86400000; };
  const daysUntil = (d: string) => { const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); return diff; };
  const fmtDate = (d: string) => { const dt = new Date(d); return dt.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }); };
  const enabled = sslInfo && sslInfo.enabled !== false && sslInfo.valid_until;

  const primaryBtn: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500 };
  const dangerBtn: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: `1px solid ${p.red}`, background: 'transparent', color: p.red, fontSize: 12, fontWeight: 500, cursor: 'pointer' };
  const badge = (label: string, bg: string, fg: string): React.ReactNode => (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500, background: bg, color: fg }}>{label}</span>
  );
  const kvRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}` }}>
      <span style={{ fontSize: 12, color: p.textMuted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>{value}</span>
    </div>
  );
  const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 120, padding: 10, borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: p.card, color: p.text, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {SSL_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
            background: activeTab === t.key ? `${p.accent}15` : 'transparent',
            color: activeTab === t.key ? p.accent : p.textMuted,
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'current' && (
        !enabled ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: p.textMuted }}>
            <LockOutlined style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>SSL is not enabled for this site</div>
          </div>
        ) : (
          <div>
            {kvRow('Status', isExpired(sslInfo.valid_until)
              ? badge('Expired', `${p.red}20`, p.red)
              : badge('Active', `${p.green}20`, p.green)
            )}
            {kvRow('Certificate type', badge(sslInfo.ssl_type === 'letsencrypt' ? "Let's Encrypt" : 'Custom certificate',
              `${p.accent}15`, p.accent))}
            {sslInfo.issuer_cn && kvRow('Certificate brand', sslInfo.issuer_cn)}
            {sslInfo.dns_names?.length > 0 && kvRow('Certificate domain(s)', sslInfo.dns_names.join(', '))}
            {sslInfo.valid_from && kvRow('Issued', fmtDate(sslInfo.valid_from))}
            {kvRow('Expired', <span style={{
              color: isExpired(sslInfo.valid_until) ? p.red : isExpiringSoon(sslInfo.valid_until) ? '#d97706' : p.text,
              fontWeight: 500, fontSize: 12,
            }}>{fmtDate(sslInfo.valid_until)}{!isExpired(sslInfo.valid_until)
              ? `, Exp in ${daysUntil(sslInfo.valid_until)} days`
              : `, Expired ${Math.abs(daysUntil(sslInfo.valid_until))} days ago`
            }</span>)}
            {kvRow('Force HTTPS', <span style={{ fontSize: 12, fontWeight: 500, color: p.green }}>Enabled</span>)}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={dangerBtn} onClick={handleDisable} disabled={submitting}>Disable SSL</button>
              {sslInfo.ssl_type === 'letsencrypt' && (
                <button style={primaryBtn} onClick={handleForceRenew} disabled={submitting}>Force Renew</button>
              )}
            </div>
          </div>
        )
      )}

      {activeTab === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enabled && sslInfo.cert_path && (
            <div style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, background: isDark ? p.rowAlt : p.headerBg, marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Current Certificate</div>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>Private Key — <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{sslInfo.key_path}</span></div>
              <textarea readOnly style={{ ...textareaStyle, minHeight: 80, cursor: 'text', opacity: 0.8 }} value={sslInfo.key_content || '(Key file not readable)'} onClick={e => (e.target as HTMLTextAreaElement).select()} />
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4, marginTop: 8 }}>Certificate / CRT / PEM — <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{sslInfo.cert_path}</span></div>
              <textarea readOnly style={{ ...textareaStyle, minHeight: 80, cursor: 'text', opacity: 0.8 }} value={sslInfo.cert_content || '(Cert file not readable)'} onClick={e => (e.target as HTMLTextAreaElement).select()} />
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: p.text }}>{enabled ? 'Update Certificate' : 'Upload Certificate'}</div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: p.text, marginBottom: 4, display: 'block' }}>Private Key</label>
            <textarea style={textareaStyle} placeholder={"-----BEGIN PRIVATE KEY-----\n..."} value={keyPEM} onChange={e => setKeyPEM(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: p.text, marginBottom: 4, display: 'block' }}>Certificate / CRT / PEM</label>
            <textarea style={textareaStyle} placeholder={"-----BEGIN CERTIFICATE-----\n..."} value={certPEM} onChange={e => setCertPEM(e.target.value)} />
          </div>
          <button style={{ ...primaryBtn, alignSelf: 'flex-start' }} onClick={handleUploadCustom} disabled={submitting}>
            {submitting ? 'Saving…' : (enabled ? 'Save Certificate' : 'Upload & Enable SSL')}
          </button>
        </div>
      )}

      {activeTab === 'letsencrypt' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: p.text, marginBottom: 4, display: 'block' }}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com"
              style={{ width: '100%', maxWidth: 360, padding: '7px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: p.card, color: p.text, fontSize: 12 }} />
          </div>
          <div style={{ fontSize: 12, color: p.textMuted, lineHeight: 1.6 }}>
            HTTP-01 file verification. Ensure your domain's DNS A record points to this server and port 80 is accessible.
          </div>
          <button style={{ ...primaryBtn, alignSelf: 'flex-start' }} onClick={handleLetsEncrypt} disabled={submitting}>
            {submitting ? 'Issuing…' : 'Issue Certificate'}
          </button>
          <div style={{ fontSize: 11, color: p.textMuted, fontStyle: 'italic', marginTop: 4 }}>
            For wildcard certificates (*.domain.com), DNS verification is required. This feature will be available in a future update.
          </div>
        </div>
      )}

      {activeTab === 'holder' && (
        certs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: p.textMuted, fontSize: 13 }}>
            No certificates found. Issue or upload a certificate first.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {certs.map((c, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, background: isDark ? p.rowAlt : p.headerBg }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 4 }}>
                  {c.dns_names?.length > 0 ? c.dns_names.join(', ') : c.domain}
                </div>
                <div style={{ fontSize: 10, color: p.textMuted, marginBottom: 6 }}>{c.issuer_cn || c.issuer}</div>
                <div style={{ marginBottom: 6 }}>
                  {badge(c.ssl_type === 'letsencrypt' ? "LE" : 'Custom', `${p.accent}15`, p.accent)}
                </div>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8 }}>
                  Expires: {fmtDate(c.valid_until)}
                </div>
                <button style={{ ...primaryBtn, padding: '4px 10px', fontSize: 11 }} onClick={() => handleApply(c.domain)} disabled={submitting}>Apply</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder panel
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Response Log Panel — inline log viewer for website config modal
// ---------------------------------------------------------------------------
function ResponseLogPanel({ site }: { site: Site }) {
  const { p, isDark } = usePalette();
  const [logType, setLogType] = useState<'access' | 'error'>('access');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [numLines, setNumLines] = useState(100);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>(`/logs/website/${site.id}/${logType}`, {
        params: { lines: numLines },
      });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setLines(raw);
      else if (typeof raw === 'string') setLines(raw.split('\n').filter(Boolean));
      else setLines([]);
    } catch {
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [site.id, logType, numLines]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const statusColor = (status: string) => {
    const n = parseInt(status, 10);
    if (n >= 500) return p.red;
    if (n >= 400) return p.amber;
    if (n >= 300) return p.accent;
    return p.green;
  };

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select
          value={logType}
          onChange={(v: 'access' | 'error') => { setLogType(v); setLines([]); }}
          style={{ width: 140 }}
          options={[
            { label: '📥 Access Log', value: 'access' },
            { label: '⚠️ Error Log', value: 'error' },
          ]}
        />
        <Select
          value={numLines}
          onChange={(v: number) => setNumLines(v)}
          style={{ width: 110 }}
          options={[
            { label: '50 lines', value: 50 },
            { label: '100 lines', value: 100 },
            { label: '200 lines', value: 200 },
            { label: '500 lines', value: 500 },
          ]}
        />
        <button
          onClick={fetchLog}
          style={{
            padding: '4px 12px', borderRadius: 5, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          ↻ Refresh
        </button>
        <a
          href={`/logs`}
          style={{ fontSize: 12, color: p.accent, marginLeft: 'auto' }}
          onClick={(e) => { e.preventDefault(); window.location.href = '/logs'; }}
        >
          View Full Logs →
        </a>
      </div>

      {/* Log content */}
      <div style={{
        background: isDark ? 'rgba(0,0,0,0.3)' : '#f8f9fa',
        border: `1px solid ${p.cardBorder}`,
        borderRadius: 8,
        maxHeight: 360,
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        lineHeight: 1.7,
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>Loading...</div>
        ) : lines.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>No log entries</div>
        ) : (
          <div style={{ padding: '8px 12px' }}>
            {lines.map((line, i) => {
              if (logType === 'access') {
                // Parse nginx combined: IP - - [time] "METHOD path" status size ...
                const m = line.match(
                  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)/
                );
                if (m) {
                  const [, ip, time, method, path, status, size] = m;
                  const sc = statusColor(status);
                  return (
                    <div key={i} style={{
                      padding: '2px 0', borderBottom: `1px solid ${p.cardBorder}20`,
                      display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                    }}>
                      <span style={{ color: p.textDim, minWidth: 110, flexShrink: 0 }}>{time.split(' ')[0]?.replace(/.*:/, (x) => x) || time}</span>
                      <span style={{ color: p.textMuted, minWidth: 90 }}>{ip}</span>
                      <span style={{
                        padding: '0 5px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: `${p.accent}15`, color: p.accent,
                      }}>{method}</span>
                      <span style={{ color: p.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                      <span style={{
                        padding: '0 5px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                        background: `${sc}15`, color: sc,
                      }}>{status}</span>
                      <span style={{ color: p.textDim, minWidth: 50, textAlign: 'right' }}>
                        {parseInt(size) >= 1024 ? `${(parseInt(size) / 1024).toFixed(1)}K` : `${size}B`}
                      </span>
                    </div>
                  );
                }
              }
              // Fallback: plain line (error log or unparseable)
              const isErr = line.includes('[error]') || line.includes('[crit]') || line.includes('[alert]');
              return (
                <div key={i} style={{
                  padding: '2px 0', borderBottom: `1px solid ${p.cardBorder}20`,
                  color: isErr ? p.red : p.text,
                }}>{line}</div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats summary */}
      {lines.length > 0 && logType === 'access' && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: p.textMuted }}>
          <span>Total: <b style={{ color: p.text }}>{lines.length}</b> entries</span>
          <span>Errors: <b style={{ color: p.red }}>
            {lines.filter(l => { const m = l.match(/"\s+([45]\d{2})\s/); return !!m; }).length}
          </b></span>
        </div>
      )}
    </div>
  );
}

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
        return <SSLPanel siteId={site.id} siteDomain={site.domain} />;
      case 'redirect':
        return <PlaceholderPanel title="Redirect Rules" />;
      case 'log':
        return <ResponseLogPanel site={site} />;
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
            — Created {site.created_at?.split('T')[0] || site.created_at}
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
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPHPOpen, setBulkPHPOpen] = useState(false);
  const [bulkSSLOpen, setBulkSSLOpen] = useState(false);
  const [bulkPHPVersion, setBulkPHPVersion] = useState('');
  const [bulkSSLDomain, setBulkSSLDomain] = useState('');
  const [availableCerts, setAvailableCerts] = useState<{ domain: string; type: string; expiry?: string }[]>([]);
  const [backupCounts, setBackupCounts] = useState<Record<number, number>>({});
  const [backupSite, setBackupSite] = useState<Site | null>(null);
  const [backupList, setBackupList] = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupActionId, setBackupActionId] = useState<number | null>(null);

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

  const fetchBackupCounts = useCallback(async () => {
    try {
      const { data: resp } = await api.get<ApiResponse<Record<string, number>>>('/backups/site-counts');
      const raw = resp.data ?? {};
      const parsed: Record<number, number> = {};
      for (const [k, v] of Object.entries(raw)) parsed[Number(k)] = v;
      setBackupCounts(parsed);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); fetchNginxVersion(); fetchPhpVersions(); fetchBackupCounts(); }, [fetchData, fetchNginxVersion, fetchPhpVersions, fetchBackupCounts]);

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

  const handleBackup = async (site: Site) => {
    setBackupCreating(true);
    try {
      await api.post('/backups', { type: 'site', target_id: site.id });
      message.success(`Backup created for ${site.domain}`);
      fetchBackupCounts();
      if (backupSite?.id === site.id) fetchSiteBackups(site.id);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Backup failed');
    } finally {
      setBackupCreating(false);
    }
  };

  const fetchSiteBackups = useCallback(async (siteId: number) => {
    setBackupListLoading(true);
    try {
      const { data: resp } = await api.get<ApiResponse<BackupRecord[]>>('/backups', {
        params: { type: 'site', target_id: siteId, page_size: 100 },
      });
      setBackupList(resp.data ?? []);
    } catch { setBackupList([]); }
    finally { setBackupListLoading(false); }
  }, []);

  const openBackupModal = (site: Site) => {
    setBackupSite(site);
    fetchSiteBackups(site.id);
  };

  const handleBackupDelete = async (backupId: number) => {
    setBackupActionId(backupId);
    try {
      await api.delete(`/backups/${backupId}`);
      message.success('Backup deleted');
      if (backupSite) fetchSiteBackups(backupSite.id);
      fetchBackupCounts();
    } catch { message.error('Delete failed'); }
    finally { setBackupActionId(null); }
  };

  const handleBackupRestore = async (backupId: number) => {
    setBackupActionId(backupId);
    try {
      await api.post(`/backups/${backupId}/restore`);
      message.success('Backup restored successfully');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(detail || 'Restore failed');
    } finally { setBackupActionId(null); }
  };

  const handleBackupDownload = async (backup: BackupRecord) => {
    const fileName = backup.file_path.split('/').pop() || backup.name;
    const hide = message.loading(`Downloading ${fileName}…`, 0);
    try {
      const res = await api.get(`/backups/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { message.error('Download failed'); }
    finally { hide(); }
  };

  // ── Bulk actions ──
  const selectedIds = selectedRowKeys.map(k => Number(k));

  const handleBulkDelete = () => {
    Modal.confirm({
      title: `Delete ${selectedIds.length} website(s)?`,
      icon: <ExclamationCircleOutlined />,
      content: 'This will permanently remove the selected websites, their vhost configs, and document roots. This action cannot be undone.',
      okText: 'Delete All',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkLoading(true);
        try {
          const { data } = await api.post<ApiResponse<{ success: number; failed: number; errors: Record<string, string> }>>('/sites/batch/delete', { ids: selectedIds });
          const d = data.data;
          if (d && d.failed > 0) {
            message.warning(`${d.success} deleted, ${d.failed} failed`);
          } else {
            message.success(`${selectedIds.length} website(s) deleted`);
          }
          setSelectedRowKeys([]);
          fetchData();
        } catch {
          message.error('Batch delete failed');
        } finally {
          setBulkLoading(false);
        }
      },
    });
  };

  const handleBulkPHP = async () => {
    if (!bulkPHPVersion) { message.warning('Select a PHP version'); return; }
    setBulkLoading(true);
    try {
      const { data } = await api.put<ApiResponse<{ success: number; failed: number }>>('/sites/batch/php', {
        ids: selectedIds, php_version: bulkPHPVersion,
      });
      const d = data.data;
      if (d && d.failed > 0) {
        message.warning(`${d.success} updated, ${d.failed} failed`);
      } else {
        message.success(`PHP ${bulkPHPVersion} applied to ${selectedIds.length} site(s)`);
      }
      setBulkPHPOpen(false);
      setBulkPHPVersion('');
      setSelectedRowKeys([]);
      fetchData();
    } catch {
      message.error('Batch PHP switch failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const fetchCerts = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponse<{ domain: string; type: string; expiry?: string }[]>>('/ssl/certificates');
      setAvailableCerts(data.data ?? []);
    } catch { /* ignore */ }
  }, []);

  const handleBulkSSL = async () => {
    if (!bulkSSLDomain) { message.warning('Select a certificate'); return; }
    setBulkLoading(true);
    try {
      const { data } = await api.put<ApiResponse<{ success: number; failed: number }>>('/sites/batch/ssl', {
        ids: selectedIds, source_domain: bulkSSLDomain,
      });
      const d = data.data;
      if (d && d.failed > 0) {
        message.warning(`${d.success} updated, ${d.failed} failed`);
      } else {
        message.success(`SSL applied to ${selectedIds.length} site(s)`);
      }
      setBulkSSLOpen(false);
      setBulkSSLDomain('');
      setSelectedRowKeys([]);
      fetchData();
    } catch {
      message.error('Batch SSL apply failed');
    } finally {
      setBulkLoading(false);
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
      title: 'Backup',
      key: 'backup',
      width: 90,
      render: (_: unknown, r: Site) => {
        const count = backupCounts[r.id] || 0;
        return (
          <Tooltip title={`${count} backup(s) — click to manage`}>
            <button
              onClick={() => openBackupModal(r)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 6,
                border: `1px solid ${count > 0 ? `${p.green}40` : p.cardBorder}`,
                background: count > 0 ? `${p.green}08` : 'transparent',
                color: count > 0 ? p.green : p.textMuted,
                fontSize: 11, fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <CloudUploadOutlined style={{ fontSize: 13 }} />
              {count > 0 ? count : '—'}
            </button>
          </Tooltip>
        );
      },
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 130,
      render: (_: unknown, r: Site) => r.ssl_enabled ? (
        <span style={{ color: p.green, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
          {r.ssl_expiry ? r.ssl_expiry.split('T')[0] : 'Active'}
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
          background: selectedRowKeys.length > 0 ? (isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)') : undefined,
          transition: 'background 0.2s',
        }}>
          {selectedRowKeys.length > 0 ? (
            <>
              <span style={{
                fontSize: 12, fontWeight: 600, color: p.accent,
                padding: '3px 10px', borderRadius: 5,
                background: `${p.accent}15`,
              }}>
                {selectedRowKeys.length} selected
              </span>
              <button
                onClick={() => setSelectedRowKeys([])}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${p.cardBorder}`, background: 'transparent',
                  color: p.textMuted, cursor: 'pointer',
                }}
              >
                Deselect
              </button>
              <div style={{ width: 1, height: 20, background: p.cardBorder, margin: '0 4px' }} />
              <button
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                style={{
                  padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${p.red}50`, background: `${p.red}08`,
                  color: p.red, cursor: bulkLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <DeleteOutlined /> Delete
              </button>
              {phpVersions.length > 0 && (
                <button
                  onClick={() => setBulkPHPOpen(true)}
                  disabled={bulkLoading}
                  style={{
                    padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: `1px solid ${p.purple}50`, background: `${p.purple}08`,
                    color: p.purple, cursor: bulkLoading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <SettingOutlined /> Set PHP
                </button>
              )}
              <button
                onClick={() => { setBulkSSLOpen(true); fetchCerts(); }}
                disabled={bulkLoading}
                style={{
                  padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${p.green}50`, background: `${p.green}08`,
                  color: p.green, cursor: bulkLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <SafetyCertificateOutlined /> Apply SSL
              </button>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Table */}
        <div>
          <Table
            columns={isMobile ? columns.filter(c => !['expiry', 'ssl'].includes(c.key as string)) : columns}
            scroll={{ x: 750 }}
            dataSource={filteredSites}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
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

      {/* Bulk Set PHP Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SettingOutlined style={{ color: p.purple }} />
            Set PHP Version — {selectedRowKeys.length} site(s)
          </span>
        }
        open={bulkPHPOpen}
        onCancel={() => { setBulkPHPOpen(false); setBulkPHPVersion(''); }}
        onOk={handleBulkPHP}
        confirmLoading={bulkLoading}
        okText="Apply"
        okButtonProps={{ style: { background: p.purple, borderColor: p.purple } }}
        width={420}
        destroyOnHidden
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 12 }}>
            This will change the PHP-FPM version for all selected websites and regenerate their vhost configs.
          </div>
          <Select
            placeholder="Select PHP version"
            value={bulkPHPVersion || undefined}
            onChange={setBulkPHPVersion}
            style={{ width: '100%' }}
            options={phpVersions.map(v => ({ label: `PHP ${v}`, value: v }))}
          />
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sites.filter(s => selectedRowKeys.includes(s.id)).map(s => (
              <span key={s.id} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: p.textMuted,
              }}>
                {s.domain}{s.php_version ? ` (PHP ${s.php_version})` : ''}
              </span>
            ))}
          </div>
        </div>
      </Modal>

      {/* Bulk Apply SSL Modal */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: p.green }} />
            Apply SSL — {selectedRowKeys.length} site(s)
          </span>
        }
        open={bulkSSLOpen}
        onCancel={() => { setBulkSSLOpen(false); setBulkSSLDomain(''); }}
        onOk={handleBulkSSL}
        confirmLoading={bulkLoading}
        okText="Apply Certificate"
        okButtonProps={{ style: { background: p.green, borderColor: p.green } }}
        width={480}
        destroyOnHidden
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, marginBottom: 12 }}>
            Select an existing certificate to apply to all selected websites. The certificate will be copied to each site.
          </div>
          <Select
            placeholder="Select certificate"
            value={bulkSSLDomain || undefined}
            onChange={setBulkSSLDomain}
            style={{ width: '100%' }}
            options={availableCerts.map(c => ({
              label: `${c.domain} (${c.type}${c.expiry ? ` — expires ${c.expiry.split('T')[0]}` : ''})`,
              value: c.domain,
            }))}
            showSearch
            filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
          />
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sites.filter(s => selectedRowKeys.includes(s.id)).map(s => (
              <span key={s.id} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: s.ssl_enabled ? `${p.green}12` : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                color: s.ssl_enabled ? p.green : p.textMuted,
              }}>
                {s.ssl_enabled ? '🔒' : '🔓'} {s.domain}
              </span>
            ))}
          </div>
        </div>
      </Modal>

      {/* ======================== Backup Management Modal ======================== */}
      <Modal
        title={null}
        open={!!backupSite}
        onCancel={() => { setBackupSite(null); setBackupList([]); }}
        footer={null}
        width={680}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        {backupSite && (
          <div>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: `1px solid ${p.cardBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudUploadOutlined style={{ color: p.accent }} />
                  Backup — {backupSite.domain}
                </div>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
                  {backupList.length} backup(s) available
                </div>
              </div>
              <button
                onClick={() => handleBackup(backupSite)}
                disabled={backupCreating}
                style={{
                  padding: '7px 16px', borderRadius: 7, border: 'none',
                  background: p.accent, color: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: backupCreating ? 'wait' : 'pointer',
                  opacity: backupCreating ? 0.7 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                {backupCreating ? <Spin size="small" /> : <PlusOutlined />}
                {backupCreating ? 'Creating...' : 'New Backup'}
              </button>
            </div>

            {/* Backup list */}
            <div style={{ padding: '0', maxHeight: 420, overflowY: 'auto' }}>
              {backupListLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Spin />
                </div>
              ) : backupList.length === 0 ? (
                <div style={{
                  padding: '48px 24px', textAlign: 'center', color: p.textMuted,
                }}>
                  <CloudOutlined style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 12 }} />
                  <div style={{ fontSize: 13 }}>No backups yet</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Click "New Backup" to create the first backup</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                      {['Filename', 'Size', 'Time', 'Actions'].map(h => (
                        <th key={h} style={{
                          padding: '8px 16px', fontSize: 11, fontWeight: 600,
                          color: p.textMuted, textAlign: 'left',
                          borderBottom: `1px solid ${p.cardBorder}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backupList.map(b => {
                      const fileName = b.file_path.split('/').pop() || b.name;
                      const sizeStr = b.file_size >= 1048576
                        ? `${(b.file_size / 1048576).toFixed(1)} MB`
                        : b.file_size >= 1024
                          ? `${(b.file_size / 1024).toFixed(1)} KB`
                          : `${b.file_size} B`;
                      const timeStr = b.created_at
                        ? new Date(b.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—';
                      const isActing = backupActionId === b.id;
                      return (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${p.cardBorder}` }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: p.text, wordBreak: 'break-all' }}>{fileName}</div>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: p.textMuted }}>{sizeStr}</span>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: p.textMuted }}>{timeStr}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Tooltip title="Restore">
                                <Popconfirm
                                  title="Restore this backup?"
                                  description="This will overwrite the current site files."
                                  onConfirm={() => handleBackupRestore(b.id)}
                                  okText="Restore"
                                  okButtonProps={{ danger: true }}
                                >
                                  <button style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: isActing ? 'wait' : 'pointer',
                                    color: p.amber, fontSize: 13, opacity: isActing ? 0.5 : 1,
                                    display: 'inline-flex', alignItems: 'center',
                                  }} disabled={isActing}>
                                    {isActing ? <Spin size="small" /> : <UndoOutlined />}
                                  </button>
                                </Popconfirm>
                              </Tooltip>
                              <Tooltip title="Download">
                                <button
                                  onClick={() => handleBackupDownload(b)}
                                  style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: 'pointer',
                                    color: p.accent, fontSize: 13,
                                    display: 'inline-flex', alignItems: 'center',
                                  }}
                                >
                                  <DownloadOutlined />
                                </button>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <Popconfirm
                                  title="Delete this backup?"
                                  description="This action cannot be undone."
                                  onConfirm={() => handleBackupDelete(b.id)}
                                  okText="Delete"
                                  okButtonProps={{ danger: true }}
                                >
                                  <button style={{
                                    padding: '4px 8px', border: 'none', borderRadius: 4,
                                    background: 'transparent', cursor: isActing ? 'wait' : 'pointer',
                                    color: p.red, fontSize: 13, opacity: isActing ? 0.5 : 1,
                                    display: 'inline-flex', alignItems: 'center',
                                  }} disabled={isActing}>
                                    <DeleteOutlined />
                                  </button>
                                </Popconfirm>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>
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
