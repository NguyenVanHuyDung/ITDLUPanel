import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Switch, Tooltip, Spin, InputNumber, Popover } from 'antd';
import {
  PlusOutlined, SettingOutlined, SafetyCertificateOutlined,
  SearchOutlined, ReloadOutlined, GlobalOutlined, CodeOutlined,
  FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined,
  FileTextOutlined, LinkOutlined, LockOutlined, CloudOutlined,
  MoreOutlined, DeleteOutlined, ExclamationCircleOutlined,
  CloudUploadOutlined, DownloadOutlined, UndoOutlined,
  ApiOutlined, EditOutlined, SafetyOutlined, ToolOutlined,
  DatabaseOutlined, SyncOutlined, PoweroffOutlined, LoadingOutlined,
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
  { key: 'access', label: 'Limit Access', icon: <LockOutlined /> },
  { key: 'hotlink', label: 'Hotlink Protection', icon: <SafetyOutlined /> },
  { key: 'proxy', label: 'Reverse Proxy', icon: <ApiOutlined /> },
  { key: 'redirect', label: 'Redirect', icon: <LinkOutlined /> },
  { key: 'maintenance', label: 'Maintenance', icon: <ToolOutlined /> },
  { key: 'quota', label: 'Disk Quota', icon: <DatabaseOutlined /> },
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
function ConfigEditorContent({ siteId, webserver }: { siteId: number; webserver: string }) {
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
            theme="vs-dark"
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
// Default Document panel
// ---------------------------------------------------------------------------
function DefaultDocPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [indexStr, setIndexStr] = useState('index.php index.html index.htm');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<ApiResponse<{ index: string }>>(`/sites/${siteId}/default-doc`);
        if (data.data?.index) setIndexStr(data.data.index);
      } catch { /* use default */ }
      finally { setLoading(false); }
    })();
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/default-doc`, { index: indexStr.trim() });
      message.success('Default document updated');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update default document');
    } finally { setSaving(false); }
  };

  const presets = ['index.php', 'index.html', 'index.htm', 'default.php', 'default.html', 'index.jsp', 'index.aspx'];
  const currentDocs = indexStr.split(/\s+/).filter(Boolean);

  const toggleDoc = (doc: string) => {
    if (currentDocs.includes(doc)) {
      setIndexStr(currentDocs.filter(d => d !== doc).join(' '));
    } else {
      setIndexStr([...currentDocs, doc].join(' '));
    }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${p.cardBorder}`, background: p.card,
  };

  const btnStyle = (isLoading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
  });

  if (loading) return <Spin />;

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ color: p.accent }} />
          Default Index Files
        </div>
        <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 12 }}>
          Configure the default files nginx will look for when a directory is requested. Click to toggle common files or edit the field directly.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {presets.map(doc => {
            const active = currentDocs.includes(doc);
            return (
              <div
                key={doc}
                onClick={() => toggleDoc(doc)}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? `${p.accent}20` : p.codeBg,
                  color: active ? p.accent : p.textMuted,
                  border: `1px solid ${active ? p.accent : p.cardBorder}`,
                }}
              >
                {doc}
              </div>
            );
          })}
        </div>

        <Input
          value={indexStr}
          onChange={e => setIndexStr(e.target.value)}
          placeholder="index.php index.html index.htm"
          style={{ fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}
        />

        <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 12, padding: '6px 10px', background: p.codeBg, borderRadius: 4, fontFamily: 'monospace' }}>
          nginx directive: <span style={{ color: p.accent }}>index {indexStr};</span>
        </div>

        <button onClick={handleSave} disabled={saving} style={btnStyle(saving)}>
          {saving ? 'Saving...' : 'Save Default Document'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config panel (combines Config Editor + Default Document)
// ---------------------------------------------------------------------------
function ConfigEditorPanel({ siteId, webserver }: { siteId: number; webserver: string }) {
  const { p } = usePalette();
  const [tab, setTab] = useState<'editor' | 'defaultdoc'>('editor');

  const tabs = [
    { key: 'editor' as const, label: 'Config Editor' },
    { key: 'defaultdoc' as const, label: 'Default Document' },
  ];

  return (
    <div>
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${p.cardBorder}`, marginBottom: 16,
      }}>
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <div key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 18px', cursor: 'pointer', fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? p.accent : p.textMuted,
              borderBottom: active ? `2px solid ${p.accent}` : '2px solid transparent',
              transition: 'all 0.15s', marginBottom: -1,
            }}>
              {t.label}
            </div>
          );
        })}
      </div>
      {tab === 'editor' && <ConfigEditorContent siteId={siteId} webserver={webserver} />}
      {tab === 'defaultdoc' && <DefaultDocPanel siteId={siteId} />}
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
  const [dirTab, setDirTab] = useState<'site' | 'subdir'>('site');
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
  const [bindings, setBindings] = useState<{ domain: string; subdir: string }[]>([]);
  const [newBindDomain, setNewBindDomain] = useState('');
  const [newBindSubdir, setNewBindSubdir] = useState('');
  const [addingBinding, setAddingBinding] = useState(false);

  // Fetch all directory settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [subR, basedirR, logR, passR, bindR] = await Promise.allSettled([
          api.get<ApiResponse<string[]>>(`/sites/${site.id}/subdirs`),
          api.get<ApiResponse<{ enabled: boolean; value: string }>>(`/sites/${site.id}/open-basedir`),
          api.get<ApiResponse<{ enabled: boolean }>>(`/sites/${site.id}/access-log`),
          api.get<ApiResponse<{ enabled: boolean; username: string }>>(`/sites/${site.id}/password-access`),
          api.get<ApiResponse<{ domain: string; subdir: string }[]>>(`/sites/${site.id}/subdir-bindings`),
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
        if (bindR.status === 'fulfilled') setBindings(bindR.value.data.data ?? []);
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

  const handleAddBinding = async () => {
    if (!newBindDomain.trim() || !newBindSubdir.trim()) return;
    setAddingBinding(true);
    try {
      await api.post(`/sites/${site.id}/subdir-bindings`, { domain: newBindDomain.trim(), subdir: newBindSubdir.trim() });
      message.success('Subdirectory binding added');
      setNewBindDomain('');
      setNewBindSubdir('');
      const { data } = await api.get<ApiResponse<{ domain: string; subdir: string }[]>>(`/sites/${site.id}/subdir-bindings`);
      setBindings(data.data ?? []);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to add binding');
    } finally { setAddingBinding(false); }
  };

  const handleRemoveBinding = async (index: number) => {
    try {
      await api.delete(`/sites/${site.id}/subdir-bindings/${index}`);
      message.success('Binding removed');
      const { data } = await api.get<ApiResponse<{ domain: string; subdir: string }[]>>(`/sites/${site.id}/subdir-bindings`);
      setBindings(data.data ?? []);
    } catch { message.error('Failed to remove binding'); }
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

  const DIR_TABS = [
    { key: 'site' as const, label: 'Site Directory' },
    { key: 'subdir' as const, label: 'Sub Directory Binding' },
  ];

  return (
    <div>
      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${p.cardBorder}`,
        marginBottom: 16,
      }}>
        {DIR_TABS.map(t => {
          const active = dirTab === t.key;
          return (
            <div
              key={t.key}
              onClick={() => setDirTab(t.key)}
              style={{
                padding: '8px 18px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? p.accent : p.textMuted,
                borderBottom: active ? `2px solid ${p.accent}` : '2px solid transparent',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {t.label}
            </div>
          );
        })}
      </div>

      {dirTab === 'site' && <>
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
      </>}

      {dirTab === 'subdir' && <>
      {/* ── 6. Sub Directory Binding ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <LinkOutlined style={{ color: p.purple || '#8B5CF6' }} />
          Sub Directory Binding
        </div>
        <div style={hintStyle}>
          Bind a domain name to a subdirectory of this site. The domain will serve content from the subdirectory.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <Input
            placeholder="sub.example.com"
            value={newBindDomain}
            onChange={e => setNewBindDomain(e.target.value)}
            style={{ fontSize: 12 }}
          />
          <Select
            placeholder="Select subdirectory"
            value={newBindSubdir || undefined}
            onChange={v => setNewBindSubdir(v || '')}
            style={{ fontSize: 12 }}
            showSearch
            options={subdirs.map(d => ({ value: d, label: d }))}
          />
          <button onClick={handleAddBinding} disabled={addingBinding} style={btnStyle(addingBinding)}>
            {addingBinding ? '...' : '+ Add'}
          </button>
        </div>
        {bindings.length > 0 && (
          <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 6, overflow: 'hidden' }}>
            {bindings.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', fontSize: 12,
                borderBottom: i < bindings.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
                background: i % 2 === 0 ? 'transparent' : p.rowAlt,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GlobalOutlined style={{ color: p.accent, fontSize: 11 }} />
                  <span style={{ color: p.text, fontWeight: 500 }}>{b.domain}</span>
                  <span style={{ color: p.textMuted }}>→</span>
                  <code style={{ background: p.codeBg, padding: '1px 6px', borderRadius: 3, fontSize: 11, color: p.textMuted }}>/{b.subdir}</code>
                </div>
                <Popconfirm title="Remove this binding?" onConfirm={() => handleRemoveBinding(i)} okButtonProps={{ danger: true }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 11, padding: '2px 6px' }}>
                    <DeleteOutlined /> Remove
                  </button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
        {bindings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: p.textMuted }}>
            No subdirectory bindings configured
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSL panel
// ---------------------------------------------------------------------------
interface CertInfo {
  domain: string;
  ssl_name: string;
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
  { key: 'current', label: 'Certificate' },
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
        <div>
          {/* Certificate info section — shown when SSL is enabled */}
          {enabled && (
            <div style={{ marginBottom: 16 }}>
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
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={dangerBtn} onClick={handleDisable} disabled={submitting}>Disable SSL</button>
                {sslInfo.ssl_type === 'letsencrypt' && (
                  <button style={primaryBtn} onClick={handleForceRenew} disabled={submitting}>Force Renew</button>
                )}
              </div>
            </div>
          )}

          {/* Certificate content — editable when cert exists */}
          {enabled && sslInfo.cert_path && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: `1px solid ${p.cardBorder}`,
              background: isDark ? p.rowAlt : p.headerBg,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 10 }}>Current Certificate</div>
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4 }}>
                Private Key — <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{sslInfo.key_path}</span>
              </div>
              <textarea style={{ ...textareaStyle, minHeight: 80 }}
                value={keyPEM || sslInfo.key_content || ''}
                onChange={e => setKeyPEM(e.target.value)}
                onClick={e => { if (!keyPEM) setKeyPEM(sslInfo.key_content || ''); (e.target as HTMLTextAreaElement).select(); }}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;..." />
              <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 4, marginTop: 8 }}>
                Certificate / CRT / PEM — <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{sslInfo.cert_path}</span>
              </div>
              <textarea style={{ ...textareaStyle, minHeight: 80 }}
                value={certPEM || sslInfo.cert_content || ''}
                onChange={e => setCertPEM(e.target.value)}
                onClick={e => { if (!certPEM) setCertPEM(sslInfo.cert_content || ''); (e.target as HTMLTextAreaElement).select(); }}
                placeholder="-----BEGIN CERTIFICATE-----&#10;..." />
              {(certPEM || keyPEM) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={{ ...primaryBtn }} onClick={handleUploadCustom} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Update Certificate'}
                  </button>
                  <button style={{ ...dangerBtn, borderColor: p.textMuted, color: p.textMuted }}
                    onClick={() => { setCertPEM(''); setKeyPEM(''); }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upload form — only when no cert exists */}
          {!enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.text }}>
                Upload Certificate
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: p.text, marginBottom: 4, display: 'block' }}>Private Key</label>
                <textarea style={textareaStyle} placeholder={"-----BEGIN PRIVATE KEY-----\n..."} value={keyPEM} onChange={e => setKeyPEM(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: p.text, marginBottom: 4, display: 'block' }}>Certificate / CRT / PEM</label>
                <textarea style={textareaStyle} placeholder={"-----BEGIN CERTIFICATE-----\n..."} value={certPEM} onChange={e => setCertPEM(e.target.value)} />
              </div>
              <button style={{ ...primaryBtn, alignSelf: 'flex-start' }} onClick={handleUploadCustom} disabled={submitting}>
                {submitting ? 'Saving…' : 'Upload & Enable SSL'}
              </button>
            </div>
          )}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {certs.map((c, i) => {
              const displayName = c.ssl_name || (c.dns_names?.length > 0 ? c.dns_names.join(', ') : c.domain);
              const isWildcard = displayName.includes('*');
              return (
                <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, background: isDark ? p.rowAlt : p.headerBg }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isWildcard && <span style={{
                      display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE', color: p.purple,
                    }}>WILDCARD</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                  </div>
                  <div style={{ fontSize: 10, color: p.textMuted, marginBottom: 6 }}>{c.issuer_cn || c.issuer}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    {badge(c.ssl_type === 'letsencrypt' ? "LE" : 'Custom', `${p.accent}15`, p.accent)}
                    {c.dns_names?.length > 1 && badge(`${c.dns_names.length} SANs`, `${p.green}15`, p.green)}
                  </div>
                  <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8 }}>
                    Expires: {fmtDate(c.valid_until)}
                  </div>
                  <button style={{ ...primaryBtn, padding: '4px 10px', fontSize: 11 }} onClick={() => handleApply(c.domain)} disabled={submitting}>Apply</button>
                </div>
              );
            })}
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
  const [logDate, setLogDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Fetch available dates
  useEffect(() => {
    api.get<ApiResponse<string[]>>(`/logs/website/${site.id}/dates`)
      .then(({ data }) => setAvailableDates(data.data ?? []))
      .catch(() => setAvailableDates([]));
  }, [site.id]);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { lines: numLines };
      if (logDate) params.date = logDate;
      const { data } = await api.get<ApiResponse<{ lines: string | string[] }>>(`/logs/website/${site.id}/${logType}`, { params });
      const raw = data.data?.lines;
      if (Array.isArray(raw)) setLines(raw);
      else if (typeof raw === 'string') setLines(raw.split('\n').filter(Boolean));
      else setLines([]);
    } catch {
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [site.id, logType, numLines, logDate]);

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
          value={logDate}
          onChange={(v: string) => { setLogDate(v); setLines([]); }}
          style={{ width: 140 }}
          options={[
            { label: '📅 Today', value: '' },
            ...availableDates.map(d => ({ label: `📅 ${d}`, value: d })),
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

// ---------------------------------------------------------------------------
// Limit Access panel
// ---------------------------------------------------------------------------
function LimitAccessPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [rules, setRules] = useState<{ name: string; path: string; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ name: string; path: string; username: string }[]>>(`/sites/${siteId}/limit-access`);
      setRules(data.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!name.trim() || !path.trim() || !username.trim() || !password.trim()) {
      message.warning('All fields are required');
      return;
    }
    setAdding(true);
    try {
      await api.post(`/sites/${siteId}/limit-access`, { name: name.trim(), path: path.trim(), username: username.trim(), password: password.trim() });
      message.success('Limit access rule added');
      setName(''); setPath(''); setUsername(''); setPassword('');
      fetchRules();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to add rule');
    } finally { setAdding(false); }
  };

  const handleRemove = async (index: number) => {
    try {
      await api.delete(`/sites/${siteId}/limit-access/${index}`);
      message.success('Rule removed');
      fetchRules();
    } catch { message.error('Failed to remove rule'); }
  };

  const sectionStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: p.textMuted, marginBottom: 10 };
  const btnStyle = (l: boolean): React.CSSProperties => ({ padding: '5px 16px', borderRadius: 6, border: 'none', background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: l ? 'wait' : 'pointer', opacity: l ? 0.7 : 1, transition: 'all 0.15s' });

  return (
    <div>
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <LockOutlined style={{ color: p.amber || '#F59E0B' }} />
          Limit Access Rules
        </div>
        <div style={hintStyle}>
          Protect specific paths with HTTP Basic Authentication. Each rule creates a password-protected location.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Input placeholder="Rule name (e.g. admin_area)" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 12 }} />
          <Input placeholder="Path (e.g. /admin)" value={path} onChange={e => setPath(e.target.value)} style={{ fontSize: 12 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ fontSize: 12 }} />
          <Input.Password placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ fontSize: 12 }} />
          <button onClick={handleAdd} disabled={adding} style={btnStyle(adding)}>
            {adding ? '...' : '+ Add Rule'}
          </button>
        </div>
      </div>

      {loading ? <Spin size="small" /> : rules.length > 0 ? (
        <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 6, overflow: 'hidden' }}>
          {rules.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', fontSize: 12,
              borderBottom: i < rules.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
              background: i % 2 === 0 ? 'transparent' : p.rowAlt,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LockOutlined style={{ color: p.amber || '#F59E0B', fontSize: 11 }} />
                <span style={{ fontWeight: 600, color: p.text }}>{r.name}</span>
                <code style={{ background: p.codeBg, padding: '1px 6px', borderRadius: 3, fontSize: 11, color: p.textMuted }}>{r.path}</code>
                <span style={{ color: p.textMuted }}>user: <b>{r.username}</b></span>
              </div>
              <Popconfirm title="Remove this rule?" onConfirm={() => handleRemove(i)} okButtonProps={{ danger: true }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 11 }}>
                  <DeleteOutlined /> Remove
                </button>
              </Popconfirm>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: p.textMuted }}>
          No limit access rules configured
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deny Access panel
// ---------------------------------------------------------------------------
function DenyAccessPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [rules, setRules] = useState<{ name: string; suffix: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [suffix, setSuffix] = useState('php|jsp');
  const [path, setPath] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ name: string; suffix: string; path: string }[]>>(`/sites/${siteId}/deny-access`);
      setRules(data.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!name.trim() || !suffix.trim() || !path.trim()) {
      message.warning('All fields are required');
      return;
    }
    setAdding(true);
    try {
      await api.post(`/sites/${siteId}/deny-access`, { name: name.trim(), suffix: suffix.trim(), path: path.trim() });
      message.success('Deny access rule added');
      setName(''); setSuffix('php|jsp'); setPath('');
      fetchRules();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to add rule');
    } finally { setAdding(false); }
  };

  const handleRemove = async (index: number) => {
    try {
      await api.delete(`/sites/${siteId}/deny-access/${index}`);
      message.success('Rule removed');
      fetchRules();
    } catch { message.error('Failed to remove rule'); }
  };

  const sectionStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: p.textMuted, marginBottom: 10 };
  const btnStyle = (l: boolean): React.CSSProperties => ({ padding: '5px 16px', borderRadius: 6, border: 'none', background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: l ? 'wait' : 'pointer', opacity: l ? 0.7 : 1, transition: 'all 0.15s' });

  return (
    <div>
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <ExclamationCircleOutlined style={{ color: p.red }} />
          Deny Access Rules
        </div>
        <div style={hintStyle}>
          Block access to specific file types in specific paths. Prevents execution of dangerous scripts in upload directories.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <Input placeholder="Rule name" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 12 }} />
          <Input placeholder="Suffix (e.g. php|jsp)" value={suffix} onChange={e => setSuffix(e.target.value)} style={{ fontSize: 12 }} />
          <Input placeholder="Path (e.g. /uploads)" value={path} onChange={e => setPath(e.target.value)} style={{ fontSize: 12 }} />
          <button onClick={handleAdd} disabled={adding} style={btnStyle(adding)}>
            {adding ? '...' : '+ Add'}
          </button>
        </div>
      </div>

      {loading ? <Spin size="small" /> : rules.length > 0 ? (
        <div style={{ border: `1px solid ${p.cardBorder}`, borderRadius: 6, overflow: 'hidden' }}>
          {rules.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', fontSize: 12,
              borderBottom: i < rules.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
              background: i % 2 === 0 ? 'transparent' : p.rowAlt,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ExclamationCircleOutlined style={{ color: p.red, fontSize: 11 }} />
                <span style={{ fontWeight: 600, color: p.text }}>{r.name}</span>
                <code style={{ background: p.codeBg, padding: '1px 6px', borderRadius: 3, fontSize: 11, color: p.textMuted }}>{r.path}</code>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: `${p.red}15`, color: p.red, fontWeight: 600,
                }}>deny: .{r.suffix.replace(/\|/g, ' .')}</span>
              </div>
              <Popconfirm title="Remove this rule?" onConfirm={() => handleRemove(i)} okButtonProps={{ danger: true }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 11 }}>
                  <DeleteOutlined /> Remove
                </button>
              </Popconfirm>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: p.textMuted }}>
          No deny access rules configured
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Traffic Control panel
// ---------------------------------------------------------------------------
const TRAFFIC_PRESETS: Record<string, { concurrency: number; ip_limit: number; bandwidth: number }> = {
  BSS: { concurrency: 500, ip_limit: 50, bandwidth: 1024 },
  Blog: { concurrency: 300, ip_limit: 25, bandwidth: 512 },
  Custom: { concurrency: 300, ip_limit: 25, bandwidth: 512 },
};

function TrafficControlPanel({ siteId }: { siteId: number }) {
  const { p, isDark } = usePalette();
  const [config, setConfig] = useState<{
    enabled: boolean; plan: string; concurrency: number; ip_limit: number; bandwidth: number;
  }>({ enabled: false, plan: 'Blog', concurrency: 300, ip_limit: 25, bandwidth: 512 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<ApiResponse<typeof config>>(`/sites/${siteId}/traffic-control`);
        if (data.data) setConfig(data.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [siteId]);

  const handlePlanChange = (plan: string) => {
    const preset = TRAFFIC_PRESETS[plan];
    if (preset) setConfig(prev => ({ ...prev, plan, ...preset }));
    else setConfig(prev => ({ ...prev, plan }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/traffic-control`, config);
      message.success(config.enabled ? 'Traffic control enabled' : 'Traffic control disabled');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to save traffic control');
    } finally { setSaving(false); }
  };

  const sectionStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: 8, border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: p.textMuted, marginBottom: 10 };
  const btnStyle = (l: boolean): React.CSSProperties => ({ padding: '5px 16px', borderRadius: 6, border: 'none', background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: l ? 'wait' : 'pointer', opacity: l ? 0.7 : 1, transition: 'all 0.15s' });

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div>
      {/* Enable/Disable Toggle */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={labelStyle}>
              <CloudOutlined style={{ color: p.accent }} />
              Traffic Control
            </div>
            <div style={hintStyle}>
              Enable rate limiting and bandwidth control for this website. Default: off.
            </div>
          </div>
          <Switch checked={config.enabled} onChange={v => setConfig(prev => ({ ...prev, enabled: v }))} />
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Plan Preset */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Limit Plan</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {Object.keys(TRAFFIC_PRESETS).map(plan => (
                <button
                  key={plan}
                  onClick={() => handlePlanChange(plan)}
                  style={{
                    padding: '6px 18px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: `1px solid ${config.plan === plan ? p.accent : p.cardBorder}`,
                    background: config.plan === plan ? `${p.accent}15` : 'transparent',
                    color: config.plan === plan ? p.accent : p.textMuted,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >{plan}</button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6 }}>Concurrency Limit</div>
                <InputNumber
                  min={1} max={10000}
                  value={config.concurrency}
                  onChange={v => setConfig(prev => ({ ...prev, concurrency: v ?? 300, plan: 'Custom' }))}
                  style={{ width: '100%' }}
                  addonAfter="conn"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6 }}>Block Single IP</div>
                <InputNumber
                  min={1} max={1000}
                  value={config.ip_limit}
                  onChange={v => setConfig(prev => ({ ...prev, ip_limit: v ?? 25, plan: 'Custom' }))}
                  style={{ width: '100%' }}
                  addonAfter="req/s"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 6 }}>Bandwidth Limit</div>
                <InputNumber
                  min={0} max={102400}
                  value={config.bandwidth}
                  onChange={v => setConfig(prev => ({ ...prev, bandwidth: v ?? 512, plan: 'Custom' }))}
                  style={{ width: '100%' }}
                  addonAfter="KB/s"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14,
            background: isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)',
            border: `1px solid ${p.accent}30`,
            fontSize: 11, color: p.textMuted, lineHeight: 1.6,
          }}>
            <b style={{ color: p.accent }}>Active Configuration:</b><br />
            • Max concurrent connections: <b style={{ color: p.text }}>{config.concurrency}</b><br />
            • Rate limit per IP: <b style={{ color: p.text }}>{config.ip_limit} req/s</b><br />
            • Bandwidth per connection: <b style={{ color: p.text }}>{config.bandwidth} KB/s</b>
          </div>
        </>
      )}

      <button onClick={handleSave} disabled={saving} style={btnStyle(saving)}>
        {saving ? 'Saving...' : 'Save Traffic Control'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Control Panel (combines Limit Access, Deny Access, Traffic Control)
// ---------------------------------------------------------------------------
const ACCESS_TABS = [
  { key: 'limit', label: 'Limit Access' },
  { key: 'deny', label: 'Deny Access' },
  { key: 'traffic', label: 'Traffic Control' },
] as const;

function AccessControlPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [tab, setTab] = useState<string>('limit');

  return (
    <div>
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${p.cardBorder}`,
        marginBottom: 16,
      }}>
        {ACCESS_TABS.map(t => {
          const active = tab === t.key;
          return (
            <div
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 18px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? p.accent : p.textMuted,
                borderBottom: active ? `2px solid ${p.accent}` : '2px solid transparent',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {t.label}
            </div>
          );
        })}
      </div>
      {tab === 'limit' && <LimitAccessPanel siteId={siteId} />}
      {tab === 'deny' && <DenyAccessPanel siteId={siteId} />}
      {tab === 'traffic' && <TrafficControlPanel siteId={siteId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reverse Proxy Panel
// ---------------------------------------------------------------------------
interface URLRewriteRule { pattern: string; replacement: string; }
interface ContentReplaceRule { search: string; replace: string; }
interface ReverseProxyRule {
  name: string;
  directory: string;
  target_url: string;
  send_domain: boolean;
  enable_cache: boolean;
  url_rewrite: URLRewriteRule[];
  content_replace: ContentReplaceRule[];
}

function ReverseProxyPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [rules, setRules] = useState<ReverseProxyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState('/');
  const [targetUrl, setTargetUrl] = useState('');
  const [sendDomain, setSendDomain] = useState(true);
  const [enableCache, setEnableCache] = useState(false);
  const [urlRewrites, setUrlRewrites] = useState<URLRewriteRule[]>([]);
  const [contentReplaces, setContentReplaces] = useState<ContentReplaceRule[]>([]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<ReverseProxyRule[]>>(`/sites/${siteId}/reverse-proxy`);
      setRules(data.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setName(''); setDirectory('/'); setTargetUrl('');
    setSendDomain(true); setEnableCache(false);
    setUrlRewrites([]); setContentReplaces([]);
    setEditIndex(null); setShowForm(false);
  };

  const loadRuleToForm = (rule: ReverseProxyRule, idx: number) => {
    setName(rule.name); setDirectory(rule.directory); setTargetUrl(rule.target_url);
    setSendDomain(rule.send_domain); setEnableCache(rule.enable_cache);
    setUrlRewrites(rule.url_rewrite || []); setContentReplaces(rule.content_replace || []);
    setEditIndex(idx); setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !directory.trim() || !targetUrl.trim()) {
      message.error('Name, directory, and target URL are required');
      return;
    }
    setAdding(true);
    const payload: ReverseProxyRule = {
      name: name.trim(), directory: directory.trim(), target_url: targetUrl.trim(),
      send_domain: sendDomain, enable_cache: enableCache,
      url_rewrite: urlRewrites.filter(r => r.pattern && r.replacement),
      content_replace: contentReplaces.filter(r => r.search),
    };
    try {
      if (editIndex !== null) {
        await api.put(`/sites/${siteId}/reverse-proxy/${editIndex}`, payload);
        message.success('Proxy rule updated');
      } else {
        await api.post(`/sites/${siteId}/reverse-proxy`, payload);
        message.success('Proxy rule added');
      }
      resetForm();
      fetchRules();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to save proxy rule');
    } finally { setAdding(false); }
  };

  const handleRemove = async (index: number) => {
    try {
      await api.delete(`/sites/${siteId}/reverse-proxy/${index}`);
      message.success('Proxy rule removed');
      fetchRules();
    } catch { message.error('Failed to remove proxy rule'); }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8,
  };

  const btnStyle = (isLoading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
  });

  if (loading) return <Spin />;

  return (
    <div>
      {/* Add / Edit form */}
      {!showForm ? (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowForm(true)} style={btnStyle(false)}>
            <PlusOutlined /> Add Proxy Rule
          </button>
        </div>
      ) : (
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <ApiOutlined style={{ color: p.accent }} />
            {editIndex !== null ? 'Edit Proxy Rule' : 'New Proxy Rule'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Input placeholder="Proxy Name" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 12 }} />
            <Input placeholder="Directory (e.g. /api)" value={directory} onChange={e => setDirectory(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          <Input placeholder="Target URL (e.g. http://127.0.0.1:3000)" value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
            style={{ fontSize: 12, marginBottom: 10 }} />

          <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
              <Switch size="small" checked={sendDomain} onChange={setSendDomain} />
              Send Domain ($host)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
              <Switch size="small" checked={enableCache} onChange={setEnableCache} />
              Enable Cache
            </div>
          </div>

          {/* URL Rewrite */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 6 }}>URL Rewrite Rules</div>
            {urlRewrites.map((rw, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 4 }}>
                <Input size="small" placeholder="Pattern (regex)" value={rw.pattern}
                  onChange={e => { const n = [...urlRewrites]; n[i] = { ...n[i], pattern: e.target.value }; setUrlRewrites(n); }} style={{ fontSize: 11 }} />
                <Input size="small" placeholder="Replacement" value={rw.replacement}
                  onChange={e => { const n = [...urlRewrites]; n[i] = { ...n[i], replacement: e.target.value }; setUrlRewrites(n); }} style={{ fontSize: 11 }} />
                <button onClick={() => setUrlRewrites(urlRewrites.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 11 }}>
                  <DeleteOutlined />
                </button>
              </div>
            ))}
            <button onClick={() => setUrlRewrites([...urlRewrites, { pattern: '', replacement: '' }])}
              style={{ background: 'none', border: `1px dashed ${p.cardBorder}`, borderRadius: 4, padding: '3px 10px',
                cursor: 'pointer', fontSize: 11, color: p.textMuted }}>
              + Add Rewrite
            </button>
          </div>

          {/* Content Replace */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 6 }}>Content Replace Rules</div>
            {contentReplaces.map((cr, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 4 }}>
                <Input size="small" placeholder="Search" value={cr.search}
                  onChange={e => { const n = [...contentReplaces]; n[i] = { ...n[i], search: e.target.value }; setContentReplaces(n); }} style={{ fontSize: 11 }} />
                <Input size="small" placeholder="Replace with" value={cr.replace}
                  onChange={e => { const n = [...contentReplaces]; n[i] = { ...n[i], replace: e.target.value }; setContentReplaces(n); }} style={{ fontSize: 11 }} />
                <button onClick={() => setContentReplaces(contentReplaces.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 11 }}>
                  <DeleteOutlined />
                </button>
              </div>
            ))}
            <button onClick={() => setContentReplaces([...contentReplaces, { search: '', replace: '' }])}
              style={{ background: 'none', border: `1px dashed ${p.cardBorder}`, borderRadius: 4, padding: '3px 10px',
                cursor: 'pointer', fontSize: 11, color: p.textMuted }}>
              + Add Replace
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} disabled={adding} style={btnStyle(adding)}>
              {adding ? 'Saving...' : editIndex !== null ? 'Update Rule' : 'Add Rule'}
            </button>
            <button onClick={resetForm} style={{ ...btnStyle(false), background: p.codeBg, color: p.textMuted }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: p.textMuted, fontSize: 12 }}>
          <ApiOutlined style={{ fontSize: 28, opacity: 0.3, marginBottom: 8, display: 'block' }} />
          No reverse proxy rules configured
        </div>
      )}
      {rules.map((rule, i) => (
        <div key={i} style={{
          ...sectionStyle,
          cursor: 'pointer',
          border: expandedIndex === i ? `1px solid ${p.accent}40` : `1px solid ${p.cardBorder}`,
        }}>
          <div onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ApiOutlined style={{ color: p.accent, fontSize: 14 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>{rule.name}</div>
                <div style={{ fontSize: 11, color: p.textMuted }}>
                  <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>{rule.directory}</code>
                  <span style={{ margin: '0 6px' }}>→</span>
                  <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>{rule.target_url}</code>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
              {rule.send_domain && <span style={{ padding: '2px 6px', borderRadius: 3, background: `${p.green}20`, color: p.green }}>$host</span>}
              {rule.enable_cache && <span style={{ padding: '2px 6px', borderRadius: 3, background: `${p.accent}20`, color: p.accent }}>cached</span>}
              {(rule.url_rewrite?.length || 0) > 0 && <span style={{ padding: '2px 6px', borderRadius: 3, background: `${(p.amber || '#F59E0B')}20`, color: p.amber || '#F59E0B' }}>rewrite</span>}
              {(rule.content_replace?.length || 0) > 0 && <span style={{ padding: '2px 6px', borderRadius: 3, background: `${(p.purple || '#8B5CF6')}20`, color: p.purple || '#8B5CF6' }}>replace</span>}
            </div>
          </div>

          {expandedIndex === i && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${p.cardBorder}` }}>
              {(rule.url_rewrite?.length || 0) > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, marginBottom: 4 }}>URL Rewrites:</div>
                  {rule.url_rewrite.map((rw, j) => (
                    <div key={j} style={{ fontSize: 11, color: p.text, fontFamily: 'monospace', padding: '2px 0' }}>
                      <span style={{ color: p.amber || '#F59E0B' }}>{rw.pattern}</span> → <span style={{ color: p.green }}>{rw.replacement}</span>
                    </div>
                  ))}
                </div>
              )}
              {(rule.content_replace?.length || 0) > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, marginBottom: 4 }}>Content Replace:</div>
                  {rule.content_replace.map((cr, j) => (
                    <div key={j} style={{ fontSize: 11, color: p.text, fontFamily: 'monospace', padding: '2px 0' }}>
                      <span style={{ color: p.red }}>{cr.search}</span> → <span style={{ color: p.green }}>{cr.replace}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); loadRuleToForm(rule, i); }}
                  style={{ ...btnStyle(false), padding: '4px 12px', background: p.accent }}>
                  <EditOutlined /> Edit
                </button>
                <Popconfirm title="Remove this proxy rule?" onConfirm={() => handleRemove(i)} okButtonProps={{ danger: true }}>
                  <button onClick={(e) => e.stopPropagation()}
                    style={{ ...btnStyle(false), padding: '4px 12px', background: p.red }}>
                    <DeleteOutlined /> Remove
                  </button>
                </Popconfirm>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redirect Rules Panel
// ---------------------------------------------------------------------------
interface RedirectRule {
  enabled: boolean;
  name: string;
  type: 'domain' | 'path';
  source: string;
  target_url: string;
  mode: number;
  keep_uri: boolean;
}

function RedirectPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [rules, setRules] = useState<RedirectRule[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'domain' | 'path'>('domain');
  const [source, setSource] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [mode, setMode] = useState(301);
  const [keepUri, setKeepUri] = useState(true);
  const [enabled, setEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesR, domainsR] = await Promise.allSettled([
        api.get<ApiResponse<RedirectRule[]>>(`/sites/${siteId}/redirect-rules`),
        api.get<ApiResponse<DomainInfo[]>>(`/sites/${siteId}/domains`),
      ]);
      if (rulesR.status === 'fulfilled') setRules(rulesR.value.data.data ?? []);
      if (domainsR.status === 'fulfilled') setDomains((domainsR.value.data.data ?? []).map(d => d.domain));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setName(''); setType('domain'); setSource(''); setTargetUrl('');
    setMode(301); setKeepUri(true); setEnabled(true);
    setEditIndex(null); setShowForm(false);
  };

  const loadRuleToForm = (rule: RedirectRule, idx: number) => {
    setName(rule.name); setType(rule.type); setSource(rule.source);
    setTargetUrl(rule.target_url); setMode(rule.mode);
    setKeepUri(rule.keep_uri); setEnabled(rule.enabled);
    setEditIndex(idx); setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !source.trim() || !targetUrl.trim()) {
      message.error('Name, source, and target URL are required');
      return;
    }
    setSaving(true);
    const payload: RedirectRule = {
      enabled, name: name.trim(), type, source: source.trim(),
      target_url: targetUrl.trim(), mode, keep_uri: keepUri,
    };
    try {
      if (editIndex !== null) {
        await api.put(`/sites/${siteId}/redirect-rules/${editIndex}`, payload);
        message.success('Redirect rule updated');
      } else {
        await api.post(`/sites/${siteId}/redirect-rules`, payload);
        message.success('Redirect rule added');
      }
      resetForm();
      fetchData();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to save redirect rule');
    } finally { setSaving(false); }
  };

  const handleRemove = async (index: number) => {
    try {
      await api.delete(`/sites/${siteId}/redirect-rules/${index}`);
      message.success('Redirect rule removed');
      fetchData();
    } catch { message.error('Failed to remove redirect rule'); }
  };

  const handleToggle = async (index: number, checked: boolean) => {
    const rule = { ...rules[index], enabled: checked };
    try {
      await api.put(`/sites/${siteId}/redirect-rules/${index}`, rule);
      message.success(checked ? 'Rule enabled' : 'Rule disabled');
      fetchData();
    } catch { message.error('Failed to update rule'); }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8,
  };

  const btnStyle = (isLoading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
  });

  if (loading) return <Spin />;

  return (
    <div>
      {/* Add / Edit form */}
      {!showForm ? (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowForm(true)} style={btnStyle(false)}>
            <PlusOutlined /> Add Redirect Rule
          </button>
        </div>
      ) : (
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <LinkOutlined style={{ color: p.accent }} />
            {editIndex !== null ? 'Edit Redirect Rule' : 'New Redirect Rule'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Input placeholder="Rule Name" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 12 }} />
            <Select value={type} onChange={(v: 'domain' | 'path') => { setType(v); setSource(''); }}
              style={{ fontSize: 12 }}
              options={[
                { value: 'domain', label: 'Domain Redirect' },
                { value: 'path', label: 'Path Redirect' },
              ]}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {type === 'domain' ? (
              <Select placeholder="Select source domain" value={source || undefined}
                onChange={v => setSource(v)} showSearch style={{ fontSize: 12 }}
                options={domains.map(d => ({ value: d, label: d }))}
              />
            ) : (
              <Input placeholder="Source path (e.g. /old-page)" value={source}
                onChange={e => setSource(e.target.value)} style={{ fontSize: 12 }} />
            )}
            <Input placeholder="Target URL (e.g. https://example.com)" value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)} style={{ fontSize: 12 }} />
          </div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: p.textMuted }}>Mode:</span>
              <Select value={mode} onChange={setMode} style={{ width: 180, fontSize: 12 }}
                options={[
                  { value: 301, label: '301 — Permanent Redirect' },
                  { value: 302, label: '302 — Temporary Redirect' },
                ]}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
              <Switch size="small" checked={keepUri} onChange={setKeepUri} />
              Keep URI Parameters
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.text }}>
              <Switch size="small" checked={enabled} onChange={setEnabled} />
              Enabled
            </div>
          </div>

          {/* Preview */}
          <div style={{
            fontSize: 11, color: p.textMuted, marginBottom: 12, padding: '8px 12px',
            background: p.codeBg, borderRadius: 6, fontFamily: 'monospace', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: p.text }}>Preview:</div>
            {keepUri ? (
              <>
                <span style={{ color: p.amber || '#F59E0B' }}>http://{type === 'domain' ? (source || '...') : `site.com${source || '/...'}`}/page?q=1</span>
                <span style={{ margin: '0 6px', color: p.accent }}>→ {mode}</span>
                <span style={{ color: p.green }}>{targetUrl || 'https://...'}/page?q=1</span>
              </>
            ) : (
              <>
                <span style={{ color: p.amber || '#F59E0B' }}>http://{type === 'domain' ? (source || '...') : `site.com${source || '/...'}`}/page?q=1</span>
                <span style={{ margin: '0 6px', color: p.accent }}>→ {mode}</span>
                <span style={{ color: p.green }}>{targetUrl || 'https://...'}</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSubmit} disabled={saving} style={btnStyle(saving)}>
              {saving ? 'Saving...' : editIndex !== null ? 'Update Rule' : 'Add Rule'}
            </button>
            <button onClick={resetForm} style={{ ...btnStyle(false), background: p.codeBg, color: p.textMuted }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: p.textMuted, fontSize: 12 }}>
          <LinkOutlined style={{ fontSize: 28, opacity: 0.3, marginBottom: 8, display: 'block' }} />
          No redirect rules configured
        </div>
      )}
      {rules.map((rule, i) => (
        <div key={i} style={{
          ...sectionStyle,
          opacity: rule.enabled ? 1 : 0.6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <Switch size="small" checked={rule.enabled} onChange={(v) => handleToggle(i, v)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {rule.name}
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                    background: rule.mode === 301 ? `${p.accent}20` : `${(p.amber || '#F59E0B')}20`,
                    color: rule.mode === 301 ? p.accent : (p.amber || '#F59E0B'),
                  }}>
                    {rule.mode}
                  </span>
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 10,
                    background: `${(p.purple || '#8B5CF6')}20`,
                    color: p.purple || '#8B5CF6',
                  }}>
                    {rule.type}
                  </span>
                  {rule.keep_uri && (
                    <span style={{
                      padding: '1px 6px', borderRadius: 3, fontSize: 10,
                      background: `${p.green}20`, color: p.green,
                    }}>
                      keep URI
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2, fontFamily: 'monospace' }}>
                  <span style={{ color: p.amber || '#F59E0B' }}>{rule.type === 'domain' ? rule.source : `*${rule.source}`}</span>
                  <span style={{ margin: '0 6px' }}>→</span>
                  <span style={{ color: p.green }}>{rule.target_url}</span>
                  {rule.keep_uri && <span style={{ color: p.textMuted }}>$request_uri</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => loadRuleToForm(rule, i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.accent, fontSize: 12, padding: '4px 6px' }}>
                <EditOutlined />
              </button>
              <Popconfirm title="Remove this redirect rule?" onConfirm={() => handleRemove(i)} okButtonProps={{ danger: true }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.red, fontSize: 12, padding: '4px 6px' }}>
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotlink Protection Panel
// ---------------------------------------------------------------------------
function HotlinkPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [enabled, setEnabled] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(true);
  const [urlSuffix, setUrlSuffix] = useState('jpg|jpeg|png|gif|bmp|webp|svg');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [response_, setResponse_] = useState('403');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<ApiResponse<{
          enabled: boolean; allow_empty: boolean; url_suffix: string;
          allowed_domains: string[]; response: string;
        }>>(`/sites/${siteId}/hotlink`);
        const c = data.data;
        if (c) {
          setEnabled(c.enabled);
          setAllowEmpty(c.allow_empty);
          if (c.url_suffix) setUrlSuffix(c.url_suffix);
          setAllowedDomains(c.allowed_domains || []);
          if (c.response) setResponse_(c.response);
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/hotlink`, {
        enabled, allow_empty: allowEmpty, url_suffix: urlSuffix,
        allowed_domains: allowedDomains, response: response_,
      });
      message.success('Hotlink protection updated');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update hotlink protection');
    } finally { setSaving(false); }
  };

  const addDomain = () => {
    const d = newDomain.trim();
    if (d && !allowedDomains.includes(d)) {
      setAllowedDomains([...allowedDomains, d]);
      setNewDomain('');
    }
  };

  const removeDomain = (index: number) => {
    setAllowedDomains(allowedDomains.filter((_, i) => i !== index));
  };

  const commonSuffixes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'mp4', 'mp3', 'zip', 'rar', 'pdf', 'css', 'js'];
  const currentSuffixes = urlSuffix.split('|').filter(Boolean);

  const toggleSuffix = (s: string) => {
    if (currentSuffixes.includes(s)) {
      setUrlSuffix(currentSuffixes.filter(x => x !== s).join('|'));
    } else {
      setUrlSuffix([...currentSuffixes, s].join('|'));
    }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card,
  };

  const btnStyle = (isLoading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
  });

  if (loading) return <Spin />;

  return (
    <div>
      {/* Enable toggle */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyOutlined style={{ color: p.accent }} />
              Hotlink Protection
            </div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 4 }}>
              Prevent other websites from directly linking to your files (images, videos, etc.)
            </div>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </div>

      {enabled && (
        <>
          {/* Allow empty referer */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.text }}>Allow Empty HTTP_REFERER</div>
                <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>
                  Allow direct access (no referer header). Disable to block direct URL access too.
                </div>
              </div>
              <Switch size="small" checked={allowEmpty} onChange={setAllowEmpty} />
            </div>
          </div>

          {/* Protected file types */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Protected File Types</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {commonSuffixes.map(s => {
                const active = currentSuffixes.includes(s);
                return (
                  <div key={s} onClick={() => toggleSuffix(s)} style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                    background: active ? `${p.accent}20` : p.codeBg,
                    color: active ? p.accent : p.textMuted,
                    border: `1px solid ${active ? p.accent : p.cardBorder}`,
                    fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                  }}>
                    .{s}
                  </div>
                );
              })}
            </div>
            <Input value={urlSuffix} onChange={e => setUrlSuffix(e.target.value)}
              placeholder="jpg|jpeg|png|gif" style={{ fontSize: 12, fontFamily: 'monospace' }} />
          </div>

          {/* Allowed domains */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Allowed Referrer Domains</div>
            <div style={{ fontSize: 11, color: p.textMuted, marginBottom: 8 }}>
              Your site's own domain is always allowed. Add other domains that may embed your resources.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <Input placeholder="example.com" value={newDomain} onChange={e => setNewDomain(e.target.value)}
                onPressEnter={addDomain} style={{ flex: 1, fontSize: 12 }} />
              <button onClick={addDomain} style={btnStyle(false)}>Add</button>
            </div>
            {allowedDomains.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allowedDomains.map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    borderRadius: 4, background: `${p.green}15`, border: `1px solid ${p.green}30`,
                    fontSize: 11, color: p.green,
                  }}>
                    {d}
                    <span onClick={() => removeDomain(i)} style={{ cursor: 'pointer', color: p.red, marginLeft: 4 }}>×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Response */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Response for Blocked Requests</div>
            <Select value={response_} onChange={setResponse_} style={{ width: '100%', fontSize: 12 }}
              options={[
                { value: '403', label: '403 Forbidden — Block the request' },
                { value: '404', label: '404 Not Found — Pretend file doesn\'t exist' },
              ]}
            />
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 6 }}>
              Or enter a URL to redirect hotlinkers to a custom image/page
            </div>
            {response_ !== '403' && response_ !== '404' && (
              <Input value={response_} onChange={e => setResponse_(e.target.value)}
                placeholder="https://example.com/hotlink-blocked.png"
                style={{ fontSize: 12, marginTop: 6 }} />
            )}
          </div>
        </>
      )}

      <button onClick={handleSave} disabled={saving} style={btnStyle(saving)}>
        {saving ? 'Saving...' : 'Save Hotlink Protection'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maintenance Mode Panel
// ---------------------------------------------------------------------------
const MAINTENANCE_TEMPLATES: { key: string; label: string; desc: string; emoji: string }[] = [
  { key: 'default', label: 'Default', desc: 'Dark theme with wrench icon', emoji: '🔧' },
  { key: 'minimal', label: 'Minimal', desc: 'Clean white, serif typography', emoji: '📝' },
  { key: 'colorful', label: 'Colorful', desc: 'Purple gradient with card', emoji: '🚀' },
  { key: 'construction', label: 'Construction', desc: 'Dark with animated progress bar', emoji: '🏗' },
  { key: 'countdown', label: 'Countdown', desc: 'Dark with pulsing status indicator', emoji: '⏱' },
  { key: 'custom', label: 'Custom HTML', desc: 'Write your own maintenance page', emoji: '✏️' },
];

function MaintenancePanel({ siteId, siteDomain }: { siteId: number; siteDomain: string }) {
  const { p } = usePalette();
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState('default');
  const [customHtml, setCustomHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<ApiResponse<{
          enabled: boolean; template: string; custom_html?: string;
        }>>(`/sites/${siteId}/maintenance`);
        const c = data.data;
        if (c) {
          setEnabled(c.enabled);
          if (c.template) setTemplate(c.template);
          if (c.custom_html) setCustomHtml(c.custom_html);
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/sites/${siteId}/maintenance`, {
        enabled, template,
        custom_html: template === 'custom' ? customHtml : '',
      });
      message.success(enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || 'Failed to update maintenance mode');
    } finally { setSaving(false); }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${p.cardBorder}`, marginBottom: 14, background: p.card,
  };

  const btnStyle = (isLoading: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 6, border: 'none',
    background: p.accent, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
  });

  if (loading) return <Spin />;

  return (
    <div>
      {/* Enable toggle */}
      <div style={{
        ...sectionStyle,
        border: enabled ? `1px solid ${p.amber || '#F59E0B'}50` : `1px solid ${p.cardBorder}`,
        background: enabled ? `${(p.amber || '#F59E0B')}08` : p.card,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: enabled ? (p.amber || '#F59E0B') : p.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ToolOutlined />
              Maintenance Mode
              {enabled && (
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: `${(p.amber || '#F59E0B')}25`, color: p.amber || '#F59E0B',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  ACTIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 4 }}>
              {enabled
                ? `All visitors to ${siteDomain} will see the maintenance page (HTTP 503)`
                : 'Enable to show a maintenance page to all visitors'}
            </div>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </div>

      {/* Template selection */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 10 }}>Select Template</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {MAINTENANCE_TEMPLATES.map(t => {
            const active = template === t.key;
            return (
              <div key={t.key} onClick={() => setTemplate(t.key)} style={{
                padding: '12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${active ? p.accent : p.cardBorder}`,
                background: active ? `${p.accent}10` : 'transparent',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{t.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? p.accent : p.text }}>{t.label}</div>
                <div style={{ fontSize: 10, color: p.textMuted, marginTop: 2 }}>{t.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom HTML editor */}
      {template === 'custom' && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 8 }}>Custom HTML</div>
          <Input.TextArea
            value={customHtml}
            onChange={e => setCustomHtml(e.target.value)}
            placeholder="<!DOCTYPE html>\n<html>\n<head><title>Maintenance</title></head>\n<body>\n  <h1>Under Maintenance</h1>\n</body>\n</html>"
            rows={12}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
          />
        </div>
      )}

      {/* Preview hint */}
      {template !== 'custom' && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, marginBottom: 14,
          background: p.codeBg, fontSize: 11, color: p.textMuted,
        }}>
          💡 The <strong>{MAINTENANCE_TEMPLATES.find(t => t.key === template)?.label}</strong> template will display a styled maintenance page with your domain name <code style={{ background: p.cardBorder, padding: '1px 4px', borderRadius: 3 }}>{siteDomain}</code>. Visitors receive HTTP 503 status.
        </div>
      )}

      <button onClick={handleSave} disabled={saving} style={{
        ...btnStyle(saving),
        background: enabled ? (p.amber || '#F59E0B') : p.accent,
      }}>
        {saving ? 'Saving...' : enabled ? 'Enable Maintenance Mode' : 'Save Settings'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disk Quota Panel
// ---------------------------------------------------------------------------
function DiskQuotaPanel({ siteId }: { siteId: number }) {
  const { p } = usePalette();
  const [quota, setQuota] = useState(0);
  const [usage, setUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputValue, setInputValue] = useState(0);
  const [unit, setUnit] = useState<'MB' | 'GB'>('MB');

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [siteResp, usageResp] = await Promise.all([
        api.get(`/sites/${siteId}`),
        api.get(`/sites/${siteId}/disk-usage`).catch(() => ({ data: { data: { disk_usage: 0 } } })),
      ]);
      const site = siteResp.data?.data;
      const q = site?.disk_quota || 0;
      setQuota(q);
      setUsage(usageResp.data?.data?.disk_usage || 0);
      if (q >= 1024 ** 3 && q % (1024 ** 3) === 0) {
        setUnit('GB');
        setInputValue(q / (1024 ** 3));
      } else {
        setUnit('MB');
        setInputValue(Math.round(q / (1024 ** 2)));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [siteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    const bytes = inputValue * (unit === 'GB' ? 1024 ** 3 : 1024 ** 2);
    try {
      await api.put(`/sites/${siteId}/quota`, { disk_quota: Math.round(bytes) });
      message.success('Disk quota updated');
      setQuota(Math.round(bytes));
    } catch {
      message.error('Failed to update quota');
    } finally {
      setSaving(false);
    }
  };

  const pct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
  const barColor = pct > 90 ? (p.red || '#ef4444') : pct > 70 ? (p.amber || '#f59e0b') : (p.green || '#22c55e');

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: p.text, marginBottom: 16 }}>Disk Quota</div>

      {/* Usage display */}
      <div style={{
        padding: 16, borderRadius: 8,
        border: `1px solid ${p.cardBorder}`, background: p.codeBg,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: p.textMuted }}>Disk Usage</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>
            {formatSize(usage)}{quota > 0 ? ` / ${formatSize(quota)}` : ' (Unlimited)'}
          </span>
        </div>
        <div style={{
          height: 8, borderRadius: 4,
          background: p.cardBorder, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: quota > 0 ? `${pct}%` : '0%',
            background: barColor,
            transition: 'width 0.3s ease',
          }} />
        </div>
        {quota > 0 && (
          <div style={{ fontSize: 10, color: pct > 90 ? p.red : p.textMuted, marginTop: 4 }}>
            {pct.toFixed(1)}% used
          </div>
        )}
      </div>

      {/* Quota setting */}
      <div style={{
        padding: 16, borderRadius: 8,
        border: `1px solid ${p.cardBorder}`,
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: p.text, marginBottom: 10 }}>Set Quota Limit</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <InputNumber
            min={0}
            value={inputValue}
            onChange={v => setInputValue(v || 0)}
            style={{ width: 120 }}
            placeholder="0 = unlimited"
          />
          <Select value={unit} onChange={setUnit} style={{ width: 80 }} options={[
            { value: 'MB', label: 'MB' },
            { value: 'GB', label: 'GB' },
          ]} />
          <button onClick={handleSave} disabled={saving} style={{
            padding: '5px 16px', borderRadius: 6, border: 'none',
            background: p.accent, color: '#fff',
            fontSize: 12, fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: p.textMuted, marginTop: 8 }}>
          Set to <strong>0</strong> for unlimited. Quota is advisory — a warning will display when usage exceeds the limit.
        </div>
      </div>

      {/* Quick presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { label: 'Unlimited', mb: 0 },
          { label: '500 MB', mb: 500 },
          { label: '1 GB', mb: 1024 },
          { label: '2 GB', mb: 2048 },
          { label: '5 GB', mb: 5120 },
          { label: '10 GB', mb: 10240 },
        ].map(preset => {
          const bytes = preset.mb * 1024 * 1024;
          const isActive = quota === bytes;
          return (
            <button
              key={preset.label}
              onClick={() => { setInputValue(preset.mb >= 1024 ? preset.mb / 1024 : preset.mb); setUnit(preset.mb >= 1024 ? 'GB' : 'MB'); }}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                border: `1px solid ${isActive ? `${p.accent}60` : p.cardBorder}`,
                background: isActive ? `${p.accent}12` : 'transparent',
                color: isActive ? p.accent : p.textMuted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
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
      case 'access':
        return <AccessControlPanel siteId={site.id} />;
      case 'hotlink':
        return <HotlinkPanel siteId={site.id} />;
      case 'proxy':
        return <ReverseProxyPanel siteId={site.id} />;
      case 'redirect':
        return <RedirectPanel siteId={site.id} />;
      case 'maintenance':
        return <MaintenancePanel siteId={site.id} siteDomain={site.domain} />;
      case 'quota':
        return <DiskQuotaPanel siteId={site.id} />;
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
  const [nginxServiceLoading, setNginxServiceLoading] = useState<string | null>(null);
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
  const [detectedWebServer, setDetectedWebServer] = useState<string>('');
  const [ftpOption, setFtpOption] = useState<'none' | 'create'>('none');
  const [pathManual, setPathManual] = useState(false);
  const prevDomainRef = useRef<string>('');

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

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
      const { data: resp } = await api.get('/software/nginx/status');
      const d = resp.data;
      if (d?.version) {
        const label = d.version_display ? `Nginx ${d.version_display}` : `Nginx ${d.version}`;
        setNginxVersion(label);
      }
    } catch { /* ignore */ }
  }, []);

  const handleNginxAction = async (action: 'restart' | 'reload' | 'stop') => {
    setNginxServiceLoading(action);
    try {
      await api.post(`/software/nginx/${action}`);
      message.success(`Nginx ${action} successful`);
      if (action === 'stop') setNginxVersion('');
      else setTimeout(fetchNginxVersion, 1500);
    } catch {
      message.error(`Failed to ${action} Nginx`);
    } finally {
      setNginxServiceLoading(null);
    }
  };

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

  useEffect(() => {
    if (modalOpen) {
      api.get('/software/webserver-check').then(({ data }) => {
        const ws = data.data?.installed_webserver || '';
        setDetectedWebServer(ws);
        if (ws) form.setFieldsValue({ webserver: ws });
      }).catch(() => {});
      // Default PHP to latest installed version
      if (phpVersions.length > 0) {
        form.setFieldsValue({ php_version: phpVersions[phpVersions.length - 1] });
      }
    }
  }, [modalOpen, form, phpVersions]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (!values.name) values.name = values.domain;
      if (!values.path) values.path = `/ITDLUPanel/wwwroot/${values.domain}`;
      // Only include FTP fields when creating new
      if (ftpOption !== 'create') {
        delete values.ftp_user;
        delete values.ftp_pass;
      }
      // Only include DB fields when enabled
      if (!values.create_db) {
        delete values.db_name;
        delete values.db_user;
        delete values.db_pass;
      }
      setSubmitting(true);
      await api.post('/sites', values);
      message.success(t('common.success'));
      setModalOpen(false);
      form.resetFields();
      setFtpOption('none');
      setPathManual(false);
      prevDomainRef.current = '';
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
            <Popover
              trigger="hover"
              placement="bottom"
              arrow={false}
              overlayInnerStyle={{ padding: 0, background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 8 }}
              content={
                <div style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
                  {([
                    { action: 'restart' as const, icon: <SyncOutlined />, label: 'Restart', color: p.amber },
                    { action: 'reload' as const, icon: <ReloadOutlined />, label: 'Reload', color: p.accent },
                    { action: 'stop' as const, icon: <PoweroffOutlined />, label: 'Stop', color: p.red },
                  ]).map(({ action, icon, label, color }) => (
                    <button
                      key={action}
                      disabled={!!nginxServiceLoading}
                      onClick={() => handleNginxAction(action)}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: `1px solid ${color}30`,
                        background: `${color}12`, color, fontSize: 11, fontWeight: 500,
                        cursor: nginxServiceLoading ? 'wait' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        opacity: nginxServiceLoading && nginxServiceLoading !== action ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      {nginxServiceLoading === action ? <LoadingOutlined spin /> : icon} {label}
                    </button>
                  ))}
                </div>
              }
            >
              <span style={{
                fontSize: 11, fontWeight: 600,
                padding: '2px 8px', borderRadius: 4,
                background: `${p.green}15`, color: p.green,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {nginxVersion}
              </span>
            </Popover>
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
        onCancel={() => { setModalOpen(false); form.resetFields(); setFtpOption('none'); setPathManual(false); prevDomainRef.current = ''; }}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={isMobile ? '95%' : 600}
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* ── Basic Info ── */}
          <div style={{ fontSize: 12, fontWeight: 600, color: p.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Basic Info
          </div>

          <Form.Item name="domain" label={t('websites.domain')}
            rules={[{ required: true, message: 'Domain is required' }]}
          >
            <Input placeholder="example.com" onChange={e => {
              const domain = e.target.value;
              const prev = prevDomainRef.current;
              const currentName = form.getFieldValue('name');
              if (!currentName || currentName === prev) {
                form.setFieldsValue({ name: domain });
              }
              if (!pathManual) {
                form.setFieldsValue({ path: `/ITDLUPanel/wwwroot/${domain}` });
              }
              const sanitized = domain.replace(/[^a-zA-Z0-9]/g, '_');
              form.setFieldsValue({
                db_name: sanitized,
                db_user: sanitized,
                ftp_user: sanitized,
              });
              prevDomainRef.current = domain;
            }} />
          </Form.Item>

          <Form.Item name="name" label="Site Name"
            rules={[{ required: true, message: 'Site name is required' }]}
            extra="Internal identifier"
          >
            <Input placeholder="example.com" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Brief description of this website..." maxLength={500} showCount />
          </Form.Item>

          {/* ── Server Configuration ── */}
          <div style={{ fontSize: 12, fontWeight: 600, color: p.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Server Configuration
          </div>

          <Form.Item name="path" label="Path"
            rules={[{ required: true, message: 'Path is required' }]}
            extra="Document root directory"
            initialValue="/ITDLUPanel/wwwroot/"
          >
            <Input placeholder="/ITDLUPanel/wwwroot/example.com" onChange={() => { if (!pathManual) setPathManual(true); }} />
          </Form.Item>

          <Form.Item name="webserver" label={t('websites.web_server')} rules={[{ required: true }]}>
            {detectedWebServer ? (
              <Select disabled options={[
                { value: 'nginx', label: 'Nginx' },
                { value: 'apache', label: 'Apache' },
                { value: 'openlitespeed', label: 'OpenLiteSpeed' },
              ]} />
            ) : (
              <>
                <Select options={[
                  { value: 'nginx', label: 'Nginx' },
                  { value: 'apache', label: 'Apache' },
                  { value: 'openlitespeed', label: 'OpenLiteSpeed' },
                ]} />
                <div style={{ fontSize: 11, color: p.amber || '#F59E0B', marginTop: 4 }}>
                  <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                  No web server detected. Please install one first.
                </div>
              </>
            )}
          </Form.Item>

          <Form.Item name="php_version" label={t('websites.php_version')}>
            <Select allowClear placeholder={phpVersions.length ? 'Select PHP version' : 'No PHP installed'}
              options={[
                { value: '', label: 'Static (No PHP)' },
                ...phpVersions.map(v => ({ value: v, label: `PHP ${v}` })),
              ]}
            />
          </Form.Item>

          {/* ── Optional Services ── */}
          <div style={{ fontSize: 12, fontWeight: 600, color: p.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Optional Services
          </div>

          {/* FTP Account */}
          <Form.Item label="FTP Account">
            <Select value={ftpOption} onChange={val => {
              setFtpOption(val);
              if (val === 'create') {
                const domain = form.getFieldValue('domain') || '';
                const sanitized = domain.replace(/[^a-zA-Z0-9]/g, '_');
                form.setFieldsValue({ ftp_user: sanitized, ftp_pass: generatePassword() });
              }
            }} options={[
              { value: 'none', label: 'Not Set' },
              { value: 'create', label: 'Create New' },
            ]} />
          </Form.Item>
          {ftpOption === 'create' && (
            <>
              <Form.Item name="ftp_user" label="FTP Username"
                rules={[{ required: true, message: 'FTP username is required' }]}
                style={{ marginBottom: 8 }}
              >
                <Input placeholder="ftp_username" />
              </Form.Item>
              <Form.Item name="ftp_pass" label="FTP Password"
                rules={[{ required: true, message: 'FTP password is required' }]}
                style={{ marginBottom: 8 }}
              >
                <Input.Password placeholder="Password" />
              </Form.Item>
              <Button type="link" size="small" style={{ padding: 0, marginBottom: 12, fontSize: 12 }}
                onClick={() => form.setFieldsValue({ ftp_pass: generatePassword() })}>
                Generate password
              </Button>
            </>
          )}

          {/* Database */}
          <Form.Item name="create_db" label="Create Database" valuePropName="checked">
            <Switch onChange={checked => {
              if (checked) {
                const domain = form.getFieldValue('domain') || '';
                const sanitized = domain.replace(/[^a-zA-Z0-9]/g, '_');
                form.setFieldsValue({ db_name: sanitized, db_user: sanitized, db_pass: generatePassword() });
              }
            }} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.create_db !== cur.create_db}>
            {({ getFieldValue }) => getFieldValue('create_db') ? (
              <>
                <Form.Item name="db_name" label="Database Name"
                  rules={[{ required: true, message: 'Database name is required' }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder="database_name" />
                </Form.Item>
                <Form.Item name="db_user" label="Database User"
                  rules={[{ required: true, message: 'Database user is required' }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder="database_user" />
                </Form.Item>
                <Form.Item name="db_pass" label="Database Password"
                  rules={[{ required: true, message: 'Database password is required' }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input.Password placeholder="Password" />
                </Form.Item>
                <Button type="link" size="small" style={{ padding: 0, marginBottom: 12, fontSize: 12 }}
                  onClick={() => form.setFieldsValue({ db_pass: generatePassword() })}>
                  Generate password
                </Button>
              </>
            ) : null}
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
