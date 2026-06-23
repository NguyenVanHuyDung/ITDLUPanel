import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Switch, Row, Col, Button, Tooltip, Tree, message } from 'antd';
import { FolderOpenOutlined, GlobalOutlined, ApiOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icon = {
  Globe: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M4.5 7h15M4.5 17h15" />
    </svg>
  ),
  Server: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="5" rx="2" />
      <rect x="2" y="11" width="20" height="5" rx="2" />
      <rect x="2" y="19" width="20" height="2" rx="1" />
      <circle cx="6" cy="5.5" r="0.8" fill={color} stroke="none" />
      <circle cx="6" cy="13.5" r="0.8" fill={color} stroke="none" />
    </svg>
  ),
  Database: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" />
      <path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" />
    </svg>
  ),
  Lock: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  Folder: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  Php: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="12" cy="8" rx="8" ry="4" />
      <path d="M4 8v8c0 2.2 3.6 4 8 4s8-1.8 8-4V8" />
      <path d="M4 12c0 2.2 3.6 4 8 4s8-1.8 8-4" />
      <path d="M12 12v4" />
    </svg>
  ),
  Proxy: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="16" y="2" width="6" height="6" rx="1" />
      <rect x="9" y="16" width="6" height="6" rx="1" />
      <path d="M5 8v3h6" />
      <path d="M19 8v3h-6" />
      <path d="M12 8v8" />
      <path d="M19 11l-4 2.5" />
      <path d="M5 11l4 2.5" />
    </svg>
  ),
  Check: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  ArrowRight: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12,5 19,12 12,19" />
    </svg>
  ),
  Static: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 12h8M8 8h8M8 16h4" />
    </svg>
  ),
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface AddWebsiteModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  installedWebServer?: string;
}

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const loadPathChildren = async (parentPath: string) => {
  try {
    const { data } = await api.get('/files', { params: { path: parentPath } });
    const items = data.data?.items || data.data || [];
    const dirs = (items as any[]).filter((f: any) => f.is_dir);
    return dirs.map((d: any) => ({
      title: d.name,
      key: d.path || `${parentPath === '/' ? '' : parentPath}/${d.name}`,
      isLeaf: false,
    }));
  } catch { return []; }
};

const STEPS = ['Project Type', 'Domain & Path', 'Stack Config'] as const;
type Step = typeof STEPS[number];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddWebsiteModal({ open, onClose, onSuccess, installedWebServer }: AddWebsiteModalProps) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>('Project Type');
  const [projectType, setProjectType] = useState<'php' | 'proxy'>('php');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Independent domain state — bypasses Ant Form timing issues
  const [domainValue, setDomainValue] = useState('');

  // PHP-specific
  const [phpVersions, setPhpVersions] = useState<string[]>([]);
  const [ftpOption, setFtpOption] = useState<'none' | 'create'>('none');
  const [createDb, setCreateDb] = useState(false);

  // Path browser
  const [pathBrowserOpen, setPathBrowserOpen] = useState(false);
  const [pathTreeData, setPathTreeData] = useState<any[]>([]);
  const [pathBrowserSelected, setPathBrowserSelected] = useState('/ITDLUPanel/wwwroot');

  const stepIndex = STEPS.indexOf(step);

  // Load PHP versions on open
  useEffect(() => {
    if (open) {
      api.get<{ data: string[] }>('/software/php-versions').then(r => {
        if (Array.isArray(r.data.data)) setPhpVersions(r.data.data);
      }).catch(() => {});
    }
  }, [open]);

  // Local state for installed web server (fallback if prop not provided)
  const [localInstalledWS, setLocalInstalledWS] = useState<string>('');
  useEffect(() => {
    if (open && !installedWebServer) {
      api.get('/software/webserver-check').then(({ data }) => {
        setLocalInstalledWS(data.data?.installed_webserver || '');
      }).catch(() => {});
    }
  }, [open, installedWebServer]);
  const effectiveWebServer = installedWebServer || localInstalledWS;

  // Auto-select webserver when modal opens — fetch directly to avoid stale closure
  useEffect(() => {
    if (!open) return;
    const detected = installedWebServer || localInstalledWS;
    if (detected && !form.getFieldValue('webserver')) {
      form.setFieldsValue({ webserver: detected });
      return;
    }
    if (!installedWebServer) {
      api.get('/software/webserver-check').then(({ data }) => {
        const ws = data.data?.installed_webserver || '';
        setLocalInstalledWS(ws);
        if (ws && !form.getFieldValue('webserver')) {
          form.setFieldsValue({ webserver: ws });
        }
      }).catch(() => {});
    }
  }, [open, installedWebServer, form]);

  // Sync when localInstalledWS updates from API
  useEffect(() => {
    if (localInstalledWS && !form.getFieldValue('webserver')) {
      form.setFieldsValue({ webserver: localInstalledWS });
    }
  }, [localInstalledWS, form]);

  const handleClose = () => {
    setStep('Project Type');
    setProjectType('php');
    setFtpOption('none');
    setCreateDb(false);
    form.resetFields();
    onClose();
  };

  const handleNext = async () => {
    if (step === 'Project Type') {
      setStep('Domain & Path');
      return;
    }
    if (step === 'Domain & Path') {
      if (!domainValue || !domainValue.trim()) {
        form.setFields([{ name: 'domain', errors: ['Domain is required'] }]);
        return;
      }
      setStep('Stack Config');
      return;
    }
    // Step 3: submit
    if (!domainValue || !domainValue.trim()) {
      setStep('Domain & Path');
      form.setFields([{ name: 'domain', errors: ['Domain is required'] }]);
      message.error('Domain is required');
      return;
    }
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      values.domain = domainValue.trim();
      if (!values.name) values.name = domainValue.trim();
      if (!values.path) values.path = `/ITDLUPanel/wwwroot/${domainValue}`;
      values.site_type = projectType;
      if (projectType === 'php') {
        if (ftpOption !== 'create') { delete values.ftp_user; delete values.ftp_pass; }
        if (!createDb) { delete values.db_name; delete values.db_user; delete values.db_pass; }
      }
      setSubmitting(true);
      await api.post('/sites', values);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string; errors?: { field: string; message: string }[] } } };
        if (axiosErr.response?.data?.errors?.length) {
          const fieldErrors = axiosErr.response.data.errors;
          const firstErr = fieldErrors[0];
          if (firstErr && firstErr.field) {
            message.error(firstErr.field === 'webserver' ? 'Please select a Web Server' : `${firstErr.field}: ${firstErr.message}`);
          } else {
            message.error(axiosErr.response?.data?.message || 'Failed to create website');
          }
        } else {
          message.error(axiosErr.response?.data?.message || 'Failed to create website');
        }
      } else {
        message.error('Failed to create website');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openPathBrowser = async () => {
    const roots = await loadPathChildren('/');
    setPathTreeData(roots);
    setPathBrowserSelected(form.getFieldValue('path') || '/ITDLUPanel/wwwroot');
    setPathBrowserOpen(true);
  };

  const domain = Form.useWatch('domain', form);
  const handleDomainChange = (val: string) => {
    setDomainValue(val);
    const sanitized = val.replace(/[^a-zA-Z0-9.]/g, '_');
    form.setFieldsValue({
      name: form.getFieldValue('name') || val,
      path: `/ITDLUPanel/wwwroot/${val}`,
      db_name: sanitized, db_user: sanitized, ftp_user: sanitized,
    });
  };

  const handleCreateDbToggle = (checked: boolean) => {
    setCreateDb(checked);
    form.setFieldValue('create_db', checked);
    if (checked) {
      const sanitized = (domainValue || '').replace(/[^a-zA-Z0-9]/g, '_');
      form.setFieldsValue({ db_name: sanitized, db_user: sanitized, db_pass: generatePassword() });
    }
  };

  const handleFtpOptionChange = (val: string) => {
    setFtpOption(val as 'none' | 'create');
    if (val === 'create') {
      const sanitized = (domainValue || '').replace(/[^a-zA-Z0-9]/g, '_');
      form.setFieldsValue({ ftp_user: sanitized, ftp_pass: generatePassword() });
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon.Server color={p.accent} size={18} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Create Website</span>
          </div>
        }
        onCancel={handleClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              onClick={() => {
                if (step === 'Domain & Path') setStep('Project Type');
                else if (step === 'Stack Config') setStep('Domain & Path');
                else handleClose();
              }}
              style={{ borderColor: p.cardBorder, color: p.textMuted }}
            >
              {step === 'Project Type' ? 'Cancel' : 'Back'}
            </Button>

            {/* Step dots */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{
                  width: i === stepIndex ? 24 : 8, height: 8, borderRadius: 4,
                  background: i <= stepIndex ? p.accent : p.cardBorder,
                  transition: 'all 0.2s',
                }} />
              ))}
            </div>

            <Button
              type="primary"
              onClick={handleNext}
              loading={submitting}
              style={{ background: p.accent, borderColor: p.accent }}
            >
              {step === 'Stack Config' ? 'Create Website' : 'Continue'}
              <Icon.ArrowRight color="#fff" size={13} />
            </Button>
          </div>
        }
        width={isMobile ? '95%' : 600}
        destroyOnHidden
      >
        {/* ── Step indicator bar ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: p.codeBg, borderRadius: 8, padding: '8px 12px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, padding: '6px 10px', borderRadius: 6,
              background: i === stepIndex ? p.accent : 'transparent',
              color: i === stepIndex ? '#fff' : p.textMuted,
              fontSize: 12, fontWeight: i === stepIndex ? 600 : 400,
              textAlign: 'center',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {i < stepIndex ? (
                <Icon.Check color={i === stepIndex ? '#fff' : p.green} size={12} />
              ) : (
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: i === stepIndex ? 'rgba(255,255,255,0.2)' : p.cardBorder,
                  fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}>
                  {i + 1}
                </span>
              )}
              {s}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Project Type ── */}
        {step === 'Project Type' && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Choose project type</div>
              <div style={{ fontSize: 12, color: p.textMuted }}>Select the type that best matches your application.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* PHP */}
              <div
                onClick={() => setProjectType('php')}
                style={{
                  padding: '20px 16px',
                  borderRadius: 10,
                  border: `2px solid ${projectType === 'php' ? p.accent : p.cardBorder}`,
                  background: projectType === 'php' ? `${p.accent}10` : p.codeBg,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${p.accent}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon.Globe color={p.accent} size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>PHP Project</div>
                    <div style={{ fontSize: 11, color: p.textMuted }}>WordPress, Laravel, etc.</div>
                  </div>
                  {projectType === 'php' && (
                    <Icon.Check color={p.accent} size={16} />
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: p.textMuted, lineHeight: 1.5 }}>
                  PHP + MySQL + optional FTP. Supports PHP versions, Composer, and auto-deployment.
                </div>
              </div>

              {/* Proxy */}
              <div
                onClick={() => setProjectType('proxy')}
                style={{
                  padding: '20px 16px',
                  borderRadius: 10,
                  border: `2px solid ${projectType === 'proxy' ? p.accent : p.cardBorder}`,
                  background: projectType === 'proxy' ? `${p.accent}10` : p.codeBg,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${p.purple}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon.Proxy color={p.purple} size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Proxy Project</div>
                    <div style={{ fontSize: 11, color: p.textMuted }}>Node.js, Python, Go, etc.</div>
                  </div>
                  {projectType === 'proxy' && (
                    <Icon.Check color={p.accent} size={16} />
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: p.textMuted, lineHeight: 1.5 }}>
                  Reverse proxy to any backend. No PHP or database. Perfect for Node, Python, Go apps.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Domain & Path ── */}
        {step === 'Domain & Path' && (
          <div>
            <Form form={form} layout="vertical" size="small">
              <Form.Item
                name="domain"
                label={
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>
                    Domain Name <span style={{ color: p.red, fontWeight: 400 }}>*</span>
                  </span>
                }
                rules={[{ required: true, message: 'Domain is required' }]}
                style={{ marginBottom: 14 }}
              >
                <Input
                  name="domain"
                  id="add-site-domain"
                  value={domainValue}
                  placeholder="example.com"
                  prefix={<Icon.Globe color={p.textDim} size={13} />}
                  onChange={e => handleDomainChange(e.target.value)}
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>

              <Form.Item
                name="name"
                label={<span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>Site Name</span>}
                style={{ marginBottom: 14 }}
              >
                <Input
                  placeholder="my-site"
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>

              <Form.Item
                name="path"
                label={
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>
                    Document Root <span style={{ color: p.red, fontWeight: 400 }}>*</span>
                  </span>
                }
                rules={[{ required: true, message: 'Path is required' }]}
                style={{ marginBottom: 14 }}
              >
                <Input
                  placeholder="/ITDLUPanel/wwwroot/example.com"
                  prefix={<Icon.Folder color={p.textDim} size={13} />}
                  addonAfter={
                    <Tooltip title="Browse folders">
                      <FolderOpenOutlined
                        onClick={openPathBrowser}
                        style={{ cursor: 'pointer', color: p.accent }}
                      />
                    </Tooltip>
                  }
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>

              <Form.Item
                name="description"
                label={<span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>Description <span style={{ color: p.textMuted, fontWeight: 400 }}>(optional)</span></span>}
                style={{ marginBottom: 0 }}
              >
                <Input.TextArea
                  placeholder="Brief description of this website..."
                  rows={2}
                  maxLength={500}
                  showCount
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>
            </Form>
          </div>
        )}

        {/* ── STEP 3: Stack Config ── */}
        {step === 'Stack Config' && (
          <div>
            <Form form={form} layout="vertical" size="small">

              {/* Webserver */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Web Server
                </div>
                <Form.Item name="webserver" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                  <Select
                    placeholder="Select web server"
                    options={[
                      { value: 'nginx', label: 'Nginx', disabled: !!effectiveWebServer && effectiveWebServer !== 'nginx' },
                      { value: 'apache', label: 'Apache', disabled: !!effectiveWebServer && effectiveWebServer !== 'apache' },
                      { value: 'openlitespeed', label: 'OpenLiteSpeed', disabled: !!effectiveWebServer && effectiveWebServer !== 'openlitespeed' },
                    ]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>

              {projectType === 'proxy' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Proxy Target
                  </div>
                  <Form.Item name="proxy_target" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 0 }}>
                    <Input
                      placeholder="http://127.0.0.1:3000"
                      style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                    />
                  </Form.Item>
                </div>
              )}

              {projectType === 'php' && (
                <>
                  {/* PHP Version */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                      PHP Version
                    </div>
                    <Form.Item name="php_version" style={{ marginBottom: 0 }}>
                      <Select
                        allowClear
                        placeholder="Static (no PHP)"
                        options={[
                          { value: '', label: 'Static Only' },
                          ...phpVersions.map(v => ({ value: v, label: `PHP ${v}` })),
                        ]}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </div>

                  {/* Database */}
                  <div style={{
                    marginBottom: 16, padding: 14,
                    borderRadius: 10, border: `1px solid ${p.cardBorder}`,
                    background: p.codeBg,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: createDb ? 14 : 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `${p.green}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon.Database color={p.green} size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Create Database</div>
                        <div style={{ fontSize: 11, color: p.textMuted }}>MariaDB database for this project</div>
                      </div>
                      <Switch
                        checked={createDb}
                        onChange={handleCreateDbToggle}
                        size="small"
                      />
                      <Form.Item name="create_db" hidden initialValue={createDb}><input /></Form.Item>
                    </div>

                    {createDb && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <Form.Item name="db_name" rules={[{ required: createDb, message: 'Required' }]} style={{ marginBottom: 0 }}>
                          <Input
                            placeholder="db_name"
                            prefix={<Icon.Database color={p.textDim} size={12} />}
                            style={{ background: p.card, borderColor: p.cardBorder, fontSize: 12 }}
                          />
                        </Form.Item>
                        <Form.Item name="db_user" rules={[{ required: createDb, message: 'Required' }]} style={{ marginBottom: 0 }}>
                          <Input
                            placeholder="db_user"
                            prefix={<Icon.Database color={p.textDim} size={12} />}
                            style={{ background: p.card, borderColor: p.cardBorder, fontSize: 12 }}
                          />
                        </Form.Item>
                        <Form.Item name="db_pass" rules={[{ required: createDb, message: 'Required' }]} style={{ marginBottom: 0 }}>
                          <Input.Password
                            placeholder="Password"
                            prefix={<Icon.Lock color={p.textDim} size={12} />}
                            style={{ background: p.card, borderColor: p.cardBorder, fontSize: 12 }}
                            iconRender={visible => visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                          />
                        </Form.Item>
                      </div>
                    )}
                  </div>

                  {/* FTP Account */}
                  <div style={{
                    padding: 14,
                    borderRadius: 10, border: `1px solid ${p.cardBorder}`,
                    background: p.codeBg,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ftpOption === 'create' ? 14 : 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `${p.amber}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon.Lock color={p.amber} size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: p.text }}>FTP Account</div>
                        <div style={{ fontSize: 11, color: p.textMuted }}>File transfer access for this site</div>
                      </div>
                      <Select
                        value={ftpOption}
                        onChange={handleFtpOptionChange}
                        size="small"
                        style={{ width: 130 }}
                        options={[
                          { value: 'none', label: 'Not Set' },
                          { value: 'create', label: 'Create New' },
                        ]}
                      />
                    </div>

                    {ftpOption === 'create' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <Form.Item name="ftp_user" rules={[{ required: ftpOption === 'create', message: 'Required' }]} style={{ marginBottom: 0 }}>
                          <Input
                            placeholder="ftp_user"
                            prefix={<Icon.Globe color={p.textDim} size={12} />}
                            style={{ background: p.card, borderColor: p.cardBorder, fontSize: 12 }}
                          />
                        </Form.Item>
                        <Form.Item name="ftp_pass" rules={[{ required: ftpOption === 'create', message: 'Required' }]} style={{ marginBottom: 0 }}>
                          <Input.Password
                            placeholder="Password"
                            prefix={<Icon.Lock color={p.textDim} size={12} />}
                            iconRender={visible => visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            style={{ background: p.card, borderColor: p.cardBorder, fontSize: 12 }}
                          />
                        </Form.Item>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Form>
          </div>
        )}
      </Modal>

      {/* Path Browser */}
      <Modal
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon.Folder color={p.accent} size={16} />
            Select Directory
          </span>
        }
        open={pathBrowserOpen}
        onOk={() => { form.setFieldsValue({ path: pathBrowserSelected }); setPathBrowserOpen(false); }}
        onCancel={() => setPathBrowserOpen(false)}
        width={isMobile ? '95%' : 460}
        okText="Select"
        cancelText="Cancel"
        okButtonProps={{ style: { background: p.accent, borderColor: p.accent } }}
      >
        <div style={{ padding: '8px 0', fontSize: 12, color: p.textMuted, marginBottom: 8 }}>
          Selected: <code style={{ color: p.accent }}>{pathBrowserSelected}</code>
        </div>
        <div style={{
          maxHeight: 340, overflow: 'auto',
          border: `1px solid ${p.cardBorder}`, borderRadius: 6,
          padding: 8, background: p.codeBg,
        }}>
          <Tree
            treeData={pathTreeData}
            loadData={async (node: any): Promise<void> => {
              if (node.children) return;
              const children = await loadPathChildren(node.key);
              setPathTreeData(prev => {
                const update = (nodes: any[]): any[] =>
                  nodes.map(n =>
                    n.key === node.key
                      ? { ...n, children: children.length ? children : [{ title: '(empty)', key: `${node.key}/__empty`, isLeaf: true, disabled: true, selectable: false }] }
                      : { ...n, children: n.children ? update(n.children) : undefined }
                  );
                return update(prev);
              });
            }}
            onSelect={(keys: React.Key[]) => { if (keys.length) setPathBrowserSelected(keys[0] as string); }}
            selectedKeys={[pathBrowserSelected]}
            showLine
            style={{ background: 'transparent' }}
          />
        </div>
      </Modal>
    </>
  );
}
