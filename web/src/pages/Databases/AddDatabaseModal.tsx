import React, { useState } from 'react';
import { Modal, Form, Input, Select, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icon = {
  DB: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" />
      <path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" />
      <path d="M12 12v4" />
    </svg>
  ),
  User: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Lock: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
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
  Globe: ({ color, size = 16 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M4.5 7h15M4.5 17h15" />
    </svg>
  ),
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface AddDatabaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  detectedDbType?: string;
}

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const STEPS = ['Database Info', 'Access & Charset'] as const;
type Step = typeof STEPS[number];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddDatabaseModal({ open, onClose, onSuccess, detectedDbType }: AddDatabaseModalProps) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>('Database Info');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [remoteAccess, setRemoteAccess] = useState('localhost');
  // Store step 1 values so they're preserved when step 2 fields unmount
  const [step1Values, setStep1Values] = useState<Record<string, unknown>>({});

  const stepIndex = STEPS.indexOf(step);

  const handleClose = () => {
    setStep('Database Info');
    setRemoteAccess('localhost');
    form.resetFields();
    setStep1Values({});
    onClose();
  };

  const handleNext = async () => {
    if (step === 'Database Info') {
      try {
        const values = await form.validateFields(['db_type', 'name', 'username', 'password']);
        setStep1Values(values);
        setStep('Access & Charset');
      } catch { /* validation failed */ }
      return;
    }
    // Step 2: submit
    try {
      const step2Values = await form.validateFields();
      setSubmitting(true);
      await api.post('/databases', { ...step1Values, ...step2Values });
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dbType = Form.useWatch('db_type', form);

  const charsetOptions = (dbType === 'postgresql' || dbType === 'pgsql')
    ? [
        { value: 'UTF8', label: 'UTF8 (Recommended)' },
        { value: 'LATIN1', label: 'LATIN1' },
        { value: 'SQL_ASCII', label: 'SQL_ASCII' },
      ]
    : [
        { value: 'utf8mb4', label: 'utf8mb4 (Recommended)' },
        { value: 'utf8', label: 'utf8' },
        { value: 'latin1', label: 'latin1' },
        { value: 'ascii', label: 'ascii' },
      ];

  const defaultDbType = detectedDbType === 'postgresql' ? 'postgresql'
    : detectedDbType === 'mysql' ? 'mysql'
    : 'mariadb';

  const dbTypeOptions = detectedDbType ? [
    { value: detectedDbType, label: detectedDbType === 'mariadb' ? 'MariaDB' : detectedDbType === 'postgresql' ? 'PostgreSQL' : 'MySQL' },
  ] : [
    { value: 'mysql', label: 'MySQL' },
    { value: 'mariadb', label: 'MariaDB' },
    { value: 'postgresql', label: 'PostgreSQL' },
  ];

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon.DB color={p.accent} size={18} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Create Database</span>
        </div>
      }
      onCancel={handleClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (step === 'Access & Charset') {
                form.setFieldsValue(step1Values);
                setStep('Database Info');
              } else {
                handleClose();
              }
            }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: p.textMuted, fontSize: 13, padding: '4px 8px',
            }}
          >
            {step === 'Database Info' ? 'Cancel' : 'Back'}
          </button>

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

          <button
            onClick={handleNext}
            disabled={submitting}
            style={{
              background: p.accent, border: 'none', cursor: 'pointer',
              color: '#fff', fontSize: 13, fontWeight: 500,
              padding: '5px 14px', borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {submitting ? '...' : step === 'Access & Charset' ? 'Create Database' : 'Continue'}
            {!submitting && <Icon.ArrowRight color="#fff" size={13} />}
          </button>
        </div>
      }
      width={isMobile ? '95%' : 580}
      destroyOnHidden
    >
      {/* Step indicator bar */}
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
              <Icon.Check color={p.green} size={12} />
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

      <Form form={form} layout="vertical" size="small">

        {/* STEP 1: Database Info */}
        {step === 'Database Info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
              Database Type
            </div>
            <Form.Item name="db_type" initialValue={detectedDbType || defaultDbType} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Select
                disabled={!!detectedDbType}
                options={dbTypeOptions}
                style={{ background: p.codeBg }}
              />
            </Form.Item>

            {/* DB Name */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Database Name <span style={{ color: p.red, fontWeight: 400 }}>*</span>
              </div>
              <Form.Item
                name="name"
                rules={[
                  { required: true, message: 'Database name is required' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
                  { max: 64, message: 'Maximum 64 characters' },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="my_database"
                  prefix={<Icon.DB color={p.textDim} size={13} />}
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>
            </div>

            {/* DB User */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Database User <span style={{ color: p.red, fontWeight: 400 }}>*</span>
              </div>
              <Form.Item
                name="username"
                rules={[
                  { required: true, message: 'Username is required' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers and underscores' },
                  { max: 32, message: 'Maximum 32 characters' },
                ]}
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="db_user"
                  prefix={<Icon.User color={p.textDim} size={13} />}
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                />
              </Form.Item>
            </div>

            {/* Password */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Password <span style={{ color: p.red, fontWeight: 400 }}>*</span>
              </div>
              <Form.Item
                name="password"
                rules={[{ required: true, message: 'Required' }, { min: 6, message: 'Minimum 6 characters' }]}
                style={{ marginBottom: 0 }}
              >
                <Input.Password
                  placeholder="Enter password"
                  prefix={<Icon.Lock color={p.textDim} size={13} />}
                  style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 13 }}
                  iconRender={visible => (
                    <Tooltip title={visible ? 'Hide' : 'Show'}>
                      <span style={{ cursor: 'pointer', color: p.textMuted, fontSize: 13 }}>
                        {visible ? 'Hide' : 'Show'}
                      </span>
                    </Tooltip>
                  )}
                  addonAfter={
                    <Tooltip title="Generate password">
                      <ReloadOutlined
                        onClick={() => form.setFieldsValue({ password: generatePassword() })}
                        style={{ cursor: 'pointer', color: p.accent }}
                      />
                    </Tooltip>
                  }
                />
              </Form.Item>
            </div>
          </div>
        )}

        {/* STEP 2: Access & Charset */}
        {step === 'Access & Charset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Access Permission card */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Access Permission
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { value: 'localhost', label: 'Localhost', desc: 'Local only', color: p.green },
                  { value: '%', label: 'All Hosts', desc: 'Remote access', color: p.amber },
                  { value: 'ip', label: 'Specific IP', desc: 'Custom range', color: p.accent },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setRemoteAccess(opt.value)}
                    style={{
                      padding: '12px 10px',
                      borderRadius: 8,
                      border: `2px solid ${remoteAccess === opt.value ? opt.color : p.cardBorder}`,
                      background: remoteAccess === opt.value ? `${opt.color}10` : p.codeBg,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: remoteAccess === opt.value ? opt.color : p.text }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 10, color: p.textMuted, marginTop: 2 }}>{opt.desc}</div>
                    {remoteAccess === opt.value && (
                      <div style={{ marginTop: 4 }}>
                        <Icon.Check color={opt.color} size={12} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {remoteAccess === 'ip' && (
                <div style={{ marginTop: 10 }}>
                  <Input
                    placeholder="e.g. 192.168.1.100 or 10.0.0.%"
                    onChange={e => form.setFieldsValue({ remote_access: e.target.value })}
                    style={{ background: p.codeBg, borderColor: p.cardBorder, fontSize: 12 }}
                  />
                  <div style={{ fontSize: 11, color: p.textMuted, marginTop: 4 }}>
                    Use <code style={{ background: p.codeBg, padding: '1px 4px', borderRadius: 3 }}>%</code> as wildcard for subnet.
                  </div>
                </div>
              )}
              <Form.Item name="remote_access" initialValue="localhost" style={{ display: 'none' }}>
                <Input />
              </Form.Item>
            </div>

            {/* Charset */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Character Set
              </div>
              <Form.Item
                name="charset"
                initialValue={dbType === 'postgresql' ? 'UTF8' : 'utf8mb4'}
                style={{ marginBottom: 0 }}
              >
                <Select options={charsetOptions} />
              </Form.Item>
            </div>

            {/* Summary */}
            <div style={{
              padding: 14, borderRadius: 10, border: `1px solid ${p.cardBorder}`,
              background: p.codeBg,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Database', value: form.getFieldValue('name') || '—' },
                  { label: 'User', value: form.getFieldValue('username') || '—' },
                  { label: 'Type', value: (dbTypeOptions.find(o => o.value === dbType) || dbTypeOptions[0])?.label || '—' },
                  { label: 'Charset', value: form.getFieldValue('charset') || '—' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: p.textMuted }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.text }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Form>
    </Modal>
  );
}
