import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Form, Input, InputNumber, Select, Switch, message, Popconfirm, Spin, Radio, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, LockOutlined, SecurityScanOutlined, ExportOutlined, ImportOutlined, FireOutlined } from '@ant-design/icons';
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
  created_at: string;
}

interface PortStatus {
  port: string;
  listening: boolean;
  protocol: string;
  process: string;
}

interface SSHConfig {
  port: number;
  permit_root_login: boolean;
  password_auth: boolean;
  max_auth_tries: number;
}

interface Fail2banConfig {
  enabled: boolean;
  max_retry: number;
  ban_time: number;
  find_time: number;
}

// ---------------------------------------------------------------------------
// Firewall Tab
// ---------------------------------------------------------------------------

function FirewallTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [portStatuses, setPortStatuses] = useState<PortStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FirewallRule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [firewallEnabled, setFirewallEnabled] = useState(true);
  const [icmpBlocked, setIcmpBlocked] = useState(false);
  const [subTab, setSubTab] = useState<'port' | 'ip'>('port');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'in' | 'out'>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, statusRes] = await Promise.all([
        api.get<ApiResponse<FirewallRule[]>>('/firewall/rules'),
        api.get<ApiResponse<PortStatus[]>>('/firewall/port-status'),
      ]);
      setRules(rulesRes.data.data ?? []);
      setPortStatuses(statusRes.data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Build a Set of listening ports for fast lookup
  const listeningPorts = useMemo(() => {
    const set = new Map<string, PortStatus>();
    for (const ps of portStatuses) {
      set.set(`${ps.protocol}:${ps.port}`, ps);
    }
    return set;
  }, [portStatuses]);

  const isPortListening = useCallback((port: string, protocol: string): PortStatus | undefined => {
    if (!port) return undefined;
    // Check exact match
    const key = `${protocol}:${port}`;
    if (listeningPorts.has(key)) return listeningPorts.get(key);
    // For tcp/udp protocol, check both
    if (protocol === 'tcp/udp') {
      return listeningPorts.get(`tcp:${port}`) || listeningPorts.get(`udp:${port}`);
    }
    return undefined;
  }, [listeningPorts]);

  // Filtered rules
  const filteredRules = useMemo(() => {
    let result = rules.filter(r => r.type === subTab);
    if (directionFilter !== 'all') {
      result = result.filter(r => r.direction === directionFilter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        (r.port && r.port.toLowerCase().includes(q)) ||
        (r.ip && r.ip.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.protocol && r.protocol.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rules, subTab, directionFilter, searchText]);

  const portRuleCount = useMemo(() => rules.filter(r => r.type === 'port').length, [rules]);
  const ipRuleCount = useMemo(() => rules.filter(r => r.type === 'ip').length, [rules]);

  const handleCreate = async (values: Record<string, string>) => {
    setSubmitting(true);
    try {
      const payload = { ...values, type: subTab };
      if (editingRule) {
        // Delete old and recreate (API doesn't have PUT for rules)
        await api.delete(`/firewall/rules/${editingRule.id}`);
        await api.post('/firewall/rules', payload);
      } else {
        await api.post('/firewall/rules', payload);
      }
      message.success(t('common.success'));
      setModalOpen(false);
      setEditingRule(null);
      form.resetFields();
      fetchRules();
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
      fetchRules();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => api.delete(`/firewall/rules/${id}`)));
      message.success(t('common.success'));
      setSelectedRowKeys([]);
      fetchRules();
    } catch {
      message.error(t('common.error'));
    }
  };

  const openEditModal = (rule: FirewallRule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      port: rule.port,
      protocol: rule.protocol,
      ip: rule.ip,
      action: rule.action,
      direction: rule.direction,
      description: rule.description,
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
    a.download = `firewall-rules-${subTab}-${new Date().toISOString().slice(0, 10)}.json`;
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
          try {
            await api.post('/firewall/rules', r);
            count++;
          } catch { /* skip invalid */ }
        }
        message.success(`Imported ${count} rules`);
        fetchRules();
      } catch {
        message.error('Invalid JSON file');
      }
    };
    input.click();
  };

  const badgeBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 9px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    
  };

  // Table columns for Port rules
  const portColumns = [
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 90,
      render: (val: string) => (
        <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 4, background: `${p.accent}15`, color: p.accent, fontWeight: 500 }}>
          {(val ?? '').toUpperCase()}
        </span>
      ),
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      width: 80,
      render: (val: string) => <span style={{ fontWeight: 600, color: p.text }}>{val}</span>,
    },
    {
      title: t('common.status'),
      key: 'listening',
      width: 140,
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
                <a style={{ color: p.green, fontSize: 12, cursor: 'pointer' }}>Details</a>
              </Tooltip>
            </div>
          );
        }
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, background: `${p.textMuted}15`, color: p.textMuted, fontSize: 11, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: p.textMuted }} />
            Not Listening
          </span>
        );
      },
    },
    {
      title: 'Strategy',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (val: string) =>
        val === 'allow'
          ? <span style={{ color: p.green, fontWeight: 600 }}>Allow</span>
          : <span style={{ color: p.red, fontWeight: 600 }}>Deny</span>,
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 100,
      render: (val: string) =>
        val === 'in'
          ? <span style={{ ...badgeBase, background: `${p.green}15`, color: p.green }}>IN</span>
          : <span style={{ ...badgeBase, background: `${p.amber}15`, color: p.amber }}>OUT</span>,
    },
    {
      title: 'Source IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 120,
      render: (val: string) => val
        ? <span style={{ color: p.text }}>{val}</span>
        : <span style={{ color: p.textMuted }}>All</span>,
    },
    {
      title: 'Remarks',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: p.textMuted }}>—</span>,
    },
    {
      title: 'Add Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => {
        if (!val) return '—';
        try { return <span style={{ fontSize: 12 }}>{new Date(val).toLocaleString()}</span>; } catch { return val; }
      },
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer' }}
            onClick={() => openEditModal(record)}
          >
            Edit
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`, background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer' }}>
              Delete
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // Table columns for IP rules
  const ipColumns = [
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
      render: (val: string) => val
        ? <span style={{ fontWeight: 600, color: p.text }}>{val}</span>
        : <span style={{ color: p.textMuted }}>All</span>,
    },
    {
      title: 'Strategy',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (val: string) =>
        val === 'allow'
          ? <span style={{ color: p.green, fontWeight: 600 }}>Allow</span>
          : <span style={{ color: p.red, fontWeight: 600 }}>Deny</span>,
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 100,
      render: (val: string) =>
        val === 'in'
          ? <span style={{ ...badgeBase, background: `${p.green}15`, color: p.green }}>IN</span>
          : <span style={{ ...badgeBase, background: `${p.amber}15`, color: p.amber }}>OUT</span>,
    },
    {
      title: 'Remarks',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: p.textMuted }}>—</span>,
    },
    {
      title: 'Add Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => {
        if (!val) return '—';
        try { return <span style={{ fontSize: 12 }}>{new Date(val).toLocaleString()}</span>; } catch { return val; }
      },
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`, background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer' }}
            onClick={() => openEditModal(record)}
          >
            Edit
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <button style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`, background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer' }}>
              Delete
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 16,
        padding: '16px 20px',
        background: isDark ? p.rowAlt : p.headerBg,
        borderRadius: 8,
        marginBottom: 20,
        border: `1px solid ${p.cardBorder}`,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: p.text, fontWeight: 500 }}>Firewall</span>
          <Switch
            checked={firewallEnabled}
            onChange={setFirewallEnabled}
            style={{ backgroundColor: firewallEnabled ? p.green : undefined }}
          />
        </div>
        <div style={{ width: 1, height: 24, background: p.cardBorder, display: isMobile ? 'none' : 'block' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: p.text, fontWeight: 500 }}>Block ICMP</span>
          <Switch
            checked={icmpBlocked}
            onChange={setIcmpBlocked}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={fetchRules} style={{
          padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
          background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <ReloadOutlined /> {t('common.refresh')}
        </button>
      </div>

      {/* Sub-tabs: Port rules / IP rules */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => { setSubTab('port'); setSelectedRowKeys([]); }} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 500,
          background: subTab === 'port' ? `${p.accent}15` : 'transparent',
          color: subTab === 'port' ? p.accent : p.textMuted,
          transition: 'all 0.15s',
        }}>Port Rules ({portRuleCount})</button>
        <button onClick={() => { setSubTab('ip'); setSelectedRowKeys([]); }} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 500,
          background: subTab === 'ip' ? `${p.accent}15` : 'transparent',
          color: subTab === 'ip' ? p.accent : p.textMuted,
          transition: 'all 0.15s',
        }}>IP Rules ({ipRuleCount})</button>
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={openAddModal} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            transition: 'opacity 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <PlusOutlined /> {subTab === 'port' ? 'Add Port Rule' : 'Add IP Rule'}
          </button>
          <button onClick={handleImportRules} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ImportOutlined /> {t('common.import')} rules
          </button>
          <button onClick={handleExportRules} style={{
            padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ExportOutlined /> {t('common.export')} rules
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!isMobile && (
            <div style={{ display: 'inline-flex', borderRadius: 6, padding: 2 }}>
              <button style={{
                padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13,
                border: 'none',
                background: directionFilter === 'all' ? p.accent : 'transparent',
                color: directionFilter === 'all' ? '#fff' : p.textMuted,
                transition: 'all 0.2s',
              }} onClick={() => setDirectionFilter('all')}>All directions</button>
              <button style={{
                padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13,
                border: 'none',
                background: directionFilter === 'in' ? p.accent : 'transparent',
                color: directionFilter === 'in' ? '#fff' : p.textMuted,
                transition: 'all 0.2s',
              }} onClick={() => setDirectionFilter('in')}>Inbound</button>
              <button style={{
                padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13,
                border: 'none',
                background: directionFilter === 'out' ? p.accent : 'transparent',
                color: directionFilter === 'out' ? '#fff' : p.textMuted,
                transition: 'all 0.2s',
              }} onClick={() => setDirectionFilter('out')}>Outbound</button>
            </div>
          )}
          {isMobile && (
            <Radio.Group
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value)}
              size="small"
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: 'All', value: 'all' },
                { label: 'In', value: 'in' },
                { label: 'Out', value: 'out' },
              ]}
            />
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
        columns={subTab === 'port' ? portColumns : ipColumns}
        dataSource={filteredRules}
        rowKey="id"
        loading={loading}
        size="middle"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        scroll={{ x: subTab === 'port' ? 1100 : 800 }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total: number) => `Total ${total} records`,
        }}
        style={{
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />

      {/* Batch delete bar */}
      {selectedRowKeys.length > 0 && (
        <div style={{
          marginTop: -8,
          padding: '8px 16px',
          background: `${p.amber}10`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1px solid ${p.amber}44`,
        }}>
          <span style={{ fontSize: 13, color: p.text }}>
            {selectedRowKeys.length} selected
          </span>
          <Popconfirm title={`Delete ${selectedRowKeys.length} rules?`} onConfirm={handleBatchDelete}>
            <button style={{
              padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <DeleteOutlined /> Batch delete
            </button>
          </Popconfirm>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        title={editingRule ? 'Edit Rule' : (subTab === 'port' ? 'Add Port Rule' : 'Add IP Rule')}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRule(null); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ protocol: 'tcp', action: 'allow', direction: 'in' }}
          preserve={false}
        >
          {subTab === 'port' && (
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
          {subTab === 'ip' && (
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
          {subTab === 'port' && (
            <Form.Item name="ip" label="Source IP (optional)" extra="Leave empty to apply to all IPs">
              <Input placeholder="0.0.0.0/0" />
            </Form.Item>
          )}
          <Form.Item name="description" label="Remarks">
            <Input.TextArea placeholder="Optional description" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSH Tab
// ---------------------------------------------------------------------------

function SSHTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<SSHConfig>>('/security/ssh');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: SSHConfig) => {
    setSaving(true);
    try {
      await api.put('/security/ssh', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{
      maxWidth: 640,
      borderRadius: 10,
      background: isDark ? p.rowAlt : p.headerBg,
      border: `1px solid ${p.cardBorder}`,
      padding: isMobile ? 16 : 28,
    }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <LockOutlined style={{ fontSize: 20, color: p.accent }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>SSH Configuration</span>
      </div>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ port: 22, permit_root_login: false, password_auth: true, max_auth_tries: 6 }}>
        <Form.Item name="port" label="SSH Port" rules={[{ required: true }]}
          extra="Default: 22. Changing this requires a service restart.">
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="permit_root_login" label="Permit Root Login" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="password_auth" label="Password Authentication" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_auth_tries" label="Max Auth Tries" rules={[{ required: true }]}>
          <InputNumber min={1} max={20} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={saving} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s',
          }}>{saving ? '...' : t('common.save')}</button>
        </Form.Item>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban Tab
// ---------------------------------------------------------------------------

function Fail2banTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<Fail2banConfig>>('/security/fail2ban');
      if (data.data) form.setFieldsValue(data.data);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values: Fail2banConfig) => {
    setSaving(true);
    try {
      await api.put('/security/fail2ban', values);
      message.success(t('common.success'));
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{
      maxWidth: 640,
      borderRadius: 10,
      background: isDark ? p.rowAlt : p.headerBg,
      border: `1px solid ${p.cardBorder}`,
      padding: isMobile ? 16 : 28,
    }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <SecurityScanOutlined style={{ fontSize: 20, color: p.accent }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: p.text }}>Brute Force Protection (Fail2ban)</span>
      </div>
      <Form form={form} layout="vertical" onFinish={handleSave}
        initialValues={{ enabled: false, max_retry: 5, ban_time: 600, find_time: 600 }}>
        <Form.Item name="enabled" label={t('common.enabled')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="max_retry" label="Max Retry" rules={[{ required: true }]}
          extra="Number of failures before a host gets banned">
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="ban_time" label="Ban Time (seconds)" rules={[{ required: true }]}
          extra="Duration to ban an IP. Default: 600 (10 min)">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="find_time" label="Find Time (seconds)" rules={[{ required: true }]}
          extra="Window in which max_retry failures must occur">
          <InputNumber min={60} max={86400} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <button type="submit" disabled={saving} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
            opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s',
          }}>{saving ? '...' : t('common.save')}</button>
        </Form.Item>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Security Page
// ---------------------------------------------------------------------------

export default function Security() {
  const [activeTab, setActiveTab] = useState<'firewall' | 'ssh' | 'fail2ban'>('firewall');
  const { p, isDark } = usePalette();

  const tabs = [
    { key: 'firewall' as const, icon: <FireOutlined />, label: 'Firewall' },
    { key: 'ssh' as const, icon: <LockOutlined />, label: 'SSH' },
    { key: 'fail2ban' as const, icon: <SecurityScanOutlined />, label: 'Fail2ban' },
  ];

  return (
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
        background: p.headerBg,
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Security</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4,
      }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '6px 16px', borderRadius: 6,
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>{tab.icon} {tab.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {activeTab === 'firewall' && <FirewallTab />}
        {activeTab === 'ssh' && <SSHTab />}
        {activeTab === 'fail2ban' && <Fail2banTab />}
      </div>
    </div>
  );
}
