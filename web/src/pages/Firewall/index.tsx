import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Form, Input, Select, Switch, message, Popconfirm, Spin, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FirewallRule {
  id: number;
  type: string;
  port: string;
  protocol: string;
  ip: string;
  action: string;
  direction: string;
  description: string;
  status: number;
  sort_order: number;
  is_default: number;
  created_at: string;
}

interface PortStatus {
  port: string;
  listening: boolean;
  protocol: string;
  process: string;
}

interface FirewallSettings {
  enabled: boolean;
  icmp_block: boolean;
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const FwIcon = {
  Shield: ({ size = 20, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Network: ({ size = 18, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4m0 0H5v4m7-4h7v4" />
    </svg>
  ),
  Lock: ({ size = 16, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Ping: ({ size = 18, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l3-9 4 18 3-9h4" />
    </svg>
  ),
  Globe: ({ size = 18, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Activity: ({ size = 16, color = '#64748B' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Firewall Page
// ---------------------------------------------------------------------------

export default function Firewall() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();

  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [portStatuses, setPortStatuses] = useState<PortStatus[]>([]);
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [settings, setSettings] = useState<FirewallSettings>({ enabled: false, icmp_block: false });
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [blockIPModalOpen, setBlockIPModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FirewallRule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'port' | 'ip' | 'blocked' | 'ports'>('port');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'in' | 'out'>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [blockIPForm] = Form.useForm();

  // ------- Data fetching -------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, statusRes, settingsRes, blockedRes] = await Promise.all([
        api.get<ApiResponse<FirewallRule[]>>('/firewall/rules'),
        api.get<ApiResponse<PortStatus[]>>('/firewall/port-status'),
        api.get<ApiResponse<FirewallSettings>>('/firewall/settings'),
        api.get<ApiResponse<string[]>>('/firewall/blocked-ips'),
      ]);
      setRules(rulesRes.data.data ?? []);
      setPortStatuses(statusRes.data.data ?? []);
      if (settingsRes.data.data) setSettings(settingsRes.data.data);
      setBlockedIPs(blockedRes.data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ------- Settings toggle -------
  const handleToggleSetting = async (key: 'enabled' | 'icmp_block', value: boolean) => {
    setSettingsLoading(key);
    try {
      await api.put('/firewall/settings', { key, value });
      setSettings(prev => ({ ...prev, [key]: value }));
      message.success(key === 'enabled'
        ? (value ? 'Firewall enabled' : 'Firewall disabled')
        : (value ? 'ICMP blocked' : 'ICMP unblocked')
      );
    } catch {
      message.error(t('common.error'));
    } finally {
      setSettingsLoading(null);
    }
  };

  // ------- Listening ports lookup -------
  const listeningPorts = useMemo(() => {
    const m = new Map<string, PortStatus>();
    for (const ps of portStatuses) m.set(`${ps.protocol}:${ps.port}`, ps);
    return m;
  }, [portStatuses]);

  const isPortListening = useCallback((port: string, protocol: string): PortStatus | undefined => {
    if (!port) return undefined;
    const key = `${protocol}:${port}`;
    if (listeningPorts.has(key)) return listeningPorts.get(key);
    if (protocol === 'tcp/udp') return listeningPorts.get(`tcp:${port}`) || listeningPorts.get(`udp:${port}`);
    return undefined;
  }, [listeningPorts]);

  // ------- Filtered rules -------
  const filteredRules = useMemo(() => {
    const tabType = activeTab === 'port' ? 'port' : 'ip';
    let result = rules.filter(r => r.type === tabType);
    if (directionFilter !== 'all') result = result.filter(r => r.direction === directionFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        (r.port?.toLowerCase().includes(q)) ||
        (r.ip?.toLowerCase().includes(q)) ||
        (r.description?.toLowerCase().includes(q)) ||
        (r.protocol?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rules, activeTab, directionFilter, searchText]);

  const portRuleCount = useMemo(() => rules.filter(r => r.type === 'port').length, [rules]);
  const ipRuleCount = useMemo(() => rules.filter(r => r.type === 'ip').length, [rules]);

  // Deduplicate listening ports
  const uniquePortStatuses = useMemo(() => {
    const seen = new Set<string>();
    return portStatuses.filter(ps => {
      const key = `${ps.protocol}:${ps.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => parseInt(a.port) - parseInt(b.port));
  }, [portStatuses]);

  // ------- CRUD -------
  const handleCreate = async (values: Record<string, string>) => {
    setSubmitting(true);
    try {
      const tabType = activeTab === 'port' ? 'port' : 'ip';
      const payload = { ...values, type: tabType };
      if (editingRule) {
        await api.delete(`/firewall/rules/${editingRule.id}`);
        await api.post('/firewall/rules', payload);
      } else {
        await api.post('/firewall/rules', payload);
      }
      message.success(t('common.success'));
      setModalOpen(false);
      setEditingRule(null);
      form.resetFields();
      fetchAll();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/firewall/rules/${id}`);
      message.success(t('common.success'));
      fetchAll();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try {
      await api.put(`/firewall/rules/${id}/status`, { enabled });
      fetchAll();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => api.delete(`/firewall/rules/${id}`)));
      message.success(t('common.success'));
      setSelectedRowKeys([]);
      fetchAll();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleBlockIP = async (values: { ip: string }) => {
    setSubmitting(true);
    try {
      await api.post('/firewall/blocked-ips', { ip: values.ip });
      message.success('IP blocked');
      setBlockIPModalOpen(false);
      blockIPForm.resetFields();
      fetchAll();
    } catch {
      message.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblockIP = async (ip: string) => {
    try {
      await api.delete('/firewall/blocked-ips', { data: { ip } });
      message.success('IP unblocked');
      fetchAll();
    } catch {
      message.error(t('common.error'));
    }
  };

  const openEditModal = (rule: FirewallRule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      port: rule.port, protocol: rule.protocol, ip: rule.ip,
      action: rule.action, direction: rule.direction, description: rule.description,
    });
    setModalOpen(true);
  };

  const openAddModal = () => {
    setEditingRule(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleExportRules = () => {
    const exportData = filteredRules.map(r => ({
      type: r.type, protocol: r.protocol, port: r.port, ip: r.ip,
      action: r.action, direction: r.direction, description: r.description,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firewall-rules-${activeTab}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportRules = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Record<string, string>[];
        let count = 0;
        for (const r of imported) {
          try { await api.post('/firewall/rules', r); count++; } catch { /* skip */ }
        }
        message.success(`Imported ${count} rules`);
        fetchAll();
      } catch {
        message.error('Invalid JSON file');
      }
    };
    input.click();
  };

  // ------- Styles -------
  const badgeBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500,
  };

  const btnOutline: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  };

  const btnPrimary: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
    transition: 'opacity 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const dirBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 12,
    border: 'none', background: active ? p.accent : 'transparent',
    color: active ? '#fff' : p.textMuted, transition: 'all 0.2s',
  });

  // ------- Port columns -------
  const portColumns = [
    {
      title: 'Protocol', dataIndex: 'protocol', key: 'protocol', width: 90,
      render: (val: string) => (
        <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 4, background: `${p.accent}15`, color: p.accent, fontWeight: 500 }}>
          {(val ?? '').toUpperCase()}
        </span>
      ),
    },
    {
      title: 'Port', dataIndex: 'port', key: 'port', width: 80,
      render: (val: string, record: FirewallRule) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {record.is_default === 1 && <FwIcon.Lock size={12} color={p.amber} />}
          <span style={{ fontWeight: 600, color: p.text }}>{val}</span>
        </span>
      ),
    },
    {
      title: t('common.status'), key: 'listening', width: 140,
      render: (_: unknown, record: FirewallRule) => {
        const ps = isPortListening(record.port, record.protocol);
        if (ps) {
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, background: `${p.green}15`, color: p.green, fontSize: 11, fontWeight: 500 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: p.green }} />
                Listening
              </span>
              <Tooltip title={ps.process || 'Active'}>
                <span style={{ color: p.green, fontSize: 11, cursor: 'help' }}>ℹ</span>
              </Tooltip>
            </div>
          );
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, background: `${p.textMuted}15`, color: p.textMuted, fontSize: 11, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.textMuted }} />
            Inactive
          </span>
        );
      },
    },
    {
      title: 'Strategy', dataIndex: 'action', key: 'action', width: 90,
      render: (val: string) =>
        val === 'allow'
          ? <span style={{ ...badgeBase, background: `${p.green}15`, color: p.green }}>ALLOW</span>
          : <span style={{ ...badgeBase, background: `${p.red}15`, color: p.red }}>DENY</span>,
    },
    {
      title: 'Direction', dataIndex: 'direction', key: 'direction', width: 90,
      render: (val: string) =>
        val === 'in'
          ? <span style={{ ...badgeBase, background: `${p.green}12`, color: p.green }}>IN</span>
          : <span style={{ ...badgeBase, background: `${p.amber}12`, color: p.amber }}>OUT</span>,
    },
    {
      title: 'Enabled', key: 'enabled', width: 80,
      render: (_: unknown, record: FirewallRule) => (
        <Switch
          size="small"
          checked={record.status === 1}
          onChange={v => handleToggleRule(record.id, v)}
          style={{ backgroundColor: record.status === 1 ? p.green : undefined }}
        />
      ),
    },
    {
      title: 'Source IP', dataIndex: 'ip', key: 'ip', width: 120,
      render: (val: string) => val
        ? <span style={{ color: p.text, fontSize: 12 }}>{val}</span>
        : <span style={{ color: p.textMuted, fontSize: 12 }}>Any</span>,
    },
    {
      title: 'Remarks', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (val: string) => val || <span style={{ color: p.textMuted }}>—</span>,
    },
    {
      title: '', key: 'actions', width: 110, fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer' }}
            onClick={() => openEditModal(record)}>Edit</button>
          {record.is_default !== 1 ? (
            <Popconfirm title="Delete this rule?" onConfirm={() => handleDelete(record.id)}>
              <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}30`, background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer' }}>
                <DeleteOutlined />
              </button>
            </Popconfirm>
          ) : (
            <Tooltip title="Default rule cannot be deleted">
              <span style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textDim, fontSize: 11, cursor: 'not-allowed', opacity: 0.5 }}>
                <DeleteOutlined />
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // ------- IP columns -------
  const ipColumns = [
    {
      title: 'IP Address', dataIndex: 'ip', key: 'ip',
      render: (val: string) => val
        ? <span style={{ fontWeight: 600, color: p.text }}>{val}</span>
        : <span style={{ color: p.textMuted }}>Any</span>,
    },
    {
      title: 'Strategy', dataIndex: 'action', key: 'action', width: 90,
      render: (val: string) =>
        val === 'allow'
          ? <span style={{ ...badgeBase, background: `${p.green}15`, color: p.green }}>ALLOW</span>
          : <span style={{ ...badgeBase, background: `${p.red}15`, color: p.red }}>DENY</span>,
    },
    {
      title: 'Direction', dataIndex: 'direction', key: 'direction', width: 90,
      render: (val: string) =>
        val === 'in'
          ? <span style={{ ...badgeBase, background: `${p.green}12`, color: p.green }}>IN</span>
          : <span style={{ ...badgeBase, background: `${p.amber}12`, color: p.amber }}>OUT</span>,
    },
    {
      title: 'Enabled', key: 'enabled', width: 80,
      render: (_: unknown, record: FirewallRule) => (
        <Switch
          size="small"
          checked={record.status === 1}
          onChange={v => handleToggleRule(record.id, v)}
          style={{ backgroundColor: record.status === 1 ? p.green : undefined }}
        />
      ),
    },
    {
      title: 'Remarks', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (val: string) => val || <span style={{ color: p.textMuted }}>—</span>,
    },
    {
      title: '', key: 'actions', width: 110, fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer' }}
            onClick={() => openEditModal(record)}>Edit</button>
          {record.is_default !== 1 ? (
            <Popconfirm title="Delete this rule?" onConfirm={() => handleDelete(record.id)}>
              <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}30`, background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer' }}>
                <DeleteOutlined />
              </button>
            </Popconfirm>
          ) : (
            <Tooltip title="Default rule cannot be deleted">
              <span style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textDim, fontSize: 11, cursor: 'not-allowed', opacity: 0.5 }}>
                <DeleteOutlined />
              </span>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // ------- Blocked IPs columns -------
  const blockedColumns = [
    {
      title: 'IP Address', dataIndex: 'ip', key: 'ip',
      render: (val: string) => <span style={{ fontWeight: 600, color: p.text }}>{val}</span>,
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: () => (
        <span style={{ ...badgeBase, background: `${p.red}15`, color: p.red }}>BLOCKED</span>
      ),
    },
    {
      title: '', key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: unknown, record: { ip: string }) => (
        <Popconfirm title={`Unblock ${record.ip}?`} onConfirm={() => handleUnblockIP(record.ip)}>
          <button style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${p.green}40`, background: 'transparent', color: p.green, fontSize: 11, cursor: 'pointer' }}>
            Unblock
          </button>
        </Popconfirm>
      ),
    },
  ];

  // ======================================================================
  // RENDER
  // ======================================================================
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  const tabs = [
    { key: 'port' as const, label: `Port Rules (${portRuleCount})`, icon: <FwIcon.Network size={14} color={activeTab === 'port' ? p.accent : p.textMuted} /> },
    { key: 'ip' as const, label: `IP Rules (${ipRuleCount})`, icon: <FwIcon.Globe size={14} color={activeTab === 'ip' ? p.accent : p.textMuted} /> },
    { key: 'blocked' as const, label: `Blocked IPs (${blockedIPs.length})`, icon: <FwIcon.Lock size={13} color={activeTab === 'blocked' ? p.accent : p.textMuted} /> },
    { key: 'ports' as const, label: `Listening Ports (${uniquePortStatuses.length})`, icon: <FwIcon.Activity size={13} color={activeTab === 'ports' ? p.accent : p.textMuted} /> },
  ];

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>

      {/* ===================== HEADER ===================== */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FwIcon.Shield size={22} color={p.accent} />
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Firewall</span>
        </div>
        <button onClick={fetchAll} style={btnOutline}>
          <ReloadOutlined /> {t('common.refresh')}
        </button>
      </div>

      {/* ===================== TOGGLE STRIP ===================== */}
      <div style={{
        padding: '12px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20,
        background: isDark ? p.rowAlt : p.headerBg,
      }}>
        {/* Firewall master toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', borderRadius: 8,
          background: settings.enabled ? `${p.green}10` : `${p.textMuted}08`,
          border: `1px solid ${settings.enabled ? `${p.green}30` : p.cardBorder}`,
          transition: 'all 0.3s',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Firewall</span>
            <span style={{ fontSize: 11, color: p.textMuted }}>
              {settings.enabled ? 'Active — rules enforced' : 'Inactive — all traffic allowed'}
            </span>
          </div>
          <Switch
            checked={settings.enabled}
            loading={settingsLoading === 'enabled'}
            onChange={v => handleToggleSetting('enabled', v)}
            style={{ backgroundColor: settings.enabled ? p.green : undefined }}
          />
        </div>

        {/* ICMP toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', borderRadius: 8,
          background: settings.icmp_block ? `${p.amber}10` : `${p.textMuted}08`,
          border: `1px solid ${settings.icmp_block ? `${p.amber}30` : p.cardBorder}`,
          transition: 'all 0.3s',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FwIcon.Ping size={14} color={settings.icmp_block ? p.amber : p.textMuted} />
              <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Block ICMP</span>
            </div>
            <span style={{ fontSize: 11, color: p.textMuted }}>
              {settings.icmp_block ? 'Ping requests dropped' : 'Ping allowed'}
            </span>
          </div>
          <Switch
            checked={settings.icmp_block}
            loading={settingsLoading === 'icmp_block'}
            onChange={v => handleToggleSetting('icmp_block', v)}
            style={{ backgroundColor: settings.icmp_block ? p.amber : undefined }}
          />
        </div>

        {/* Stats summary */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: p.accent }}>{portRuleCount}</div>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Port Rules</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: p.purple }}>{ipRuleCount}</div>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>IP Rules</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: p.red }}>{blockedIPs.length}</div>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Blocked</div>
          </div>
        </div>
      </div>

      {/* ===================== TABS ===================== */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, flexWrap: 'wrap',
      }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedRowKeys([]); }} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* ===================== CONTENT ===================== */}
      <div style={{ padding: 20 }}>

        {/* ------ PORT RULES / IP RULES ------ */}
        {(activeTab === 'port' || activeTab === 'ip') && (
          <>
            {/* Action bar */}
            <div style={{
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              gap: 12, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={openAddModal} style={btnPrimary}>
                  <PlusOutlined /> {activeTab === 'port' ? 'Add Port Rule' : 'Add IP Rule'}
                </button>
                <button onClick={handleImportRules} style={btnOutline}>
                  <ImportOutlined /> Import
                </button>
                <button onClick={handleExportRules} style={btnOutline}>
                  <ExportOutlined /> Export
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {activeTab === 'port' && !isMobile && (
                  <div style={{ display: 'inline-flex', borderRadius: 6, padding: 2, background: `${p.textMuted}08` }}>
                    <button style={dirBtnStyle(directionFilter === 'all')} onClick={() => setDirectionFilter('all')}>All</button>
                    <button style={dirBtnStyle(directionFilter === 'in')} onClick={() => setDirectionFilter('in')}>Inbound</button>
                    <button style={dirBtnStyle(directionFilter === 'out')} onClick={() => setDirectionFilter('out')}>Outbound</button>
                  </div>
                )}
                <Input.Search
                  placeholder={t('common.search') + '...'}
                  allowClear
                  style={{ width: isMobile ? '100%' : 200 }}
                  onSearch={setSearchText}
                  onChange={e => { if (!e.target.value) setSearchText(''); }}
                />
              </div>
            </div>

            {/* Table */}
            <Table
              columns={activeTab === 'port' ? portColumns : ipColumns}
              dataSource={filteredRules}
              rowKey="id"
              size="middle"
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                getCheckboxProps: (record: FirewallRule) => ({
                  disabled: record.is_default === 1,
                }),
              }}
              scroll={{ x: activeTab === 'port' ? 1100 : 800 }}
              pagination={{
                defaultPageSize: 20, showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total: number) => `${total} rules`,
              }}
              style={{ borderRadius: 8, overflow: 'hidden' }}
            />

            {/* Batch delete */}
            {selectedRowKeys.length > 0 && (
              <div style={{
                marginTop: -8, padding: '8px 16px',
                background: `${p.amber}10`, borderRadius: 6,
                display: 'flex', alignItems: 'center', gap: 12,
                border: `1px solid ${p.amber}44`,
              }}>
                <span style={{ fontSize: 13, color: p.text }}>{selectedRowKeys.length} selected</span>
                <Popconfirm title={`Delete ${selectedRowKeys.length} rules?`} onConfirm={handleBatchDelete}>
                  <button style={{
                    padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.red}`,
                    background: 'transparent', color: p.red, fontSize: 12, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <DeleteOutlined /> Delete selected
                  </button>
                </Popconfirm>
              </div>
            )}
          </>
        )}

        {/* ------ BLOCKED IPs ------ */}
        {activeTab === 'blocked' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => setBlockIPModalOpen(true)} style={btnPrimary}>
                <PlusOutlined /> Block IP
              </button>
            </div>
            <Table
              columns={blockedColumns}
              dataSource={blockedIPs.map(ip => ({ ip, key: ip }))}
              rowKey="ip"
              size="middle"
              pagination={false}
              style={{ borderRadius: 8, overflow: 'hidden' }}
              locale={{ emptyText: <div style={{ padding: 32, color: p.textMuted }}>No blocked IPs</div> }}
            />
          </>
        )}

        {/* ------ LISTENING PORTS ------ */}
        {activeTab === 'ports' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {uniquePortStatuses.map(ps => {
              const proc = ps.process
                ? ps.process.replace(/users:\(\("/, '').replace(/".*/, '').replace(/\\/g, '')
                : 'unknown';
              const hasRule = rules.some(r => r.type === 'port' && r.port === ps.port && r.protocol === ps.protocol);
              return (
                <div key={`${ps.protocol}:${ps.port}`} style={{
                  padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${p.cardBorder}`,
                  background: isDark ? p.rowAlt : p.headerBg,
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${p.green}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FwIcon.Activity size={16} color={p.green} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: p.text }}>{ps.port}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${p.accent}15`, color: p.accent, fontWeight: 500 }}>
                        {ps.protocol.toUpperCase()}
                      </span>
                      {hasRule && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${p.green}15`, color: p.green, fontWeight: 500 }}>
                          RULE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proc}
                    </div>
                  </div>
                </div>
              );
            })}
            {uniquePortStatuses.length === 0 && (
              <div style={{ padding: 32, color: p.textMuted, textAlign: 'center', gridColumn: '1 / -1' }}>
                No listening ports detected
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================== ADD/EDIT RULE MODAL ===================== */}
      <Modal
        title={editingRule ? 'Edit Rule' : (activeTab === 'port' ? 'Add Port Rule' : 'Add IP Rule')}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRule(null); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}
          initialValues={{ protocol: 'tcp', action: 'allow', direction: 'in' }}
          preserve={false}>
          {(activeTab === 'port' || (editingRule && editingRule.type === 'port')) && (
            <>
              <Form.Item name="port" label="Port" rules={[{ required: true }]}
                extra="Single port (80), range (8000-9000), or comma-separated (80,443)">
                <Input placeholder="80" />
              </Form.Item>
              <Form.Item name="protocol" label="Protocol" rules={[{ required: true }]}>
                <Select options={[
                  { label: 'TCP', value: 'tcp' },
                  { label: 'UDP', value: 'udp' },
                  { label: 'TCP/UDP', value: 'tcp/udp' },
                ]} />
              </Form.Item>
            </>
          )}
          {(activeTab === 'ip' || (editingRule && editingRule.type === 'ip')) && (
            <Form.Item name="ip" label="IP Address" rules={[{ required: true }]}
              extra="Single IP (192.168.1.1) or CIDR (10.0.0.0/24)">
              <Input placeholder="192.168.1.1" />
            </Form.Item>
          )}
          <Form.Item name="action" label="Strategy" rules={[{ required: true }]}>
            <Select options={[
              { label: 'Allow', value: 'allow' },
              { label: 'Deny', value: 'deny' },
            ]} />
          </Form.Item>
          <Form.Item name="direction" label="Direction" rules={[{ required: true }]}>
            <Select options={[
              { label: 'Inbound', value: 'in' },
              { label: 'Outbound', value: 'out' },
            ]} />
          </Form.Item>
          {(activeTab === 'port' || (editingRule && editingRule.type === 'port')) && (
            <Form.Item name="ip" label="Source IP (optional)" extra="Leave empty for all IPs">
              <Input placeholder="0.0.0.0/0" />
            </Form.Item>
          )}
          <Form.Item name="description" label="Remarks">
            <Input.TextArea placeholder="Optional description" rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===================== BLOCK IP MODAL ===================== */}
      <Modal
        title="Block IP Address"
        open={blockIPModalOpen}
        onCancel={() => { setBlockIPModalOpen(false); blockIPForm.resetFields(); }}
        onOk={() => blockIPForm.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={blockIPForm} layout="vertical" onFinish={handleBlockIP} preserve={false}>
          <Form.Item name="ip" label="IP Address" rules={[{ required: true, message: 'Enter an IP address' }]}
            extra="Single IP or CIDR notation (e.g., 192.168.1.0/24)">
            <Input placeholder="192.168.1.100" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
