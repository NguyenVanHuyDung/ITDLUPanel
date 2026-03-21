import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Switch, message, Popconfirm, Spin, Radio, Tooltip, Badge } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, SafetyOutlined, LockOutlined, SecurityScanOutlined, SearchOutlined, ExportOutlined, ImportOutlined, EditOutlined, FireOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
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
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  primary: '#1565C0',
  primaryLight: '#1E88E5',
  primaryDark: '#0D47A1',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  bg: '#E3F2FD',
  text: '#1A1A2E',
  textSecondary: '#64748B',
  border: '#E8EDF2',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Firewall Tab
// ---------------------------------------------------------------------------

function FirewallTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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

  // Table columns for Port rules
  const portColumns = [
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 90,
      render: (val: string) => (
        <Tag style={{ background: C.bg, color: C.primary, border: `1px solid ${C.primary}33`, fontWeight: 500 }}>
          {(val ?? '').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      width: 80,
      render: (val: string) => <span style={{ fontWeight: 600, color: C.text }}>{val}</span>,
    },
    {
      title: t('common.status'),
      key: 'listening',
      width: 140,
      render: (_: unknown, record: FirewallRule) => {
        const ps = isPortListening(record.port, record.protocol);
        if (ps) {
          return (
            <Space size={4}>
              <Badge status="success" />
              <span style={{ color: C.success, fontWeight: 500 }}>Listening</span>
              <Tooltip title={ps.process || 'Active'}>
                <a style={{ color: C.success, fontSize: 12, cursor: 'pointer' }}>Details</a>
              </Tooltip>
            </Space>
          );
        }
        return (
          <Space size={4}>
            <Badge status="default" />
            <span style={{ color: C.textSecondary }}>Not Listening</span>
          </Space>
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
          ? <span style={{ color: C.success, fontWeight: 600 }}>Allow</span>
          : <span style={{ color: C.error, fontWeight: 600 }}>Deny</span>,
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 100,
      render: (val: string) => val === 'in' ? 'Inbound' : 'Outbound',
    },
    {
      title: 'Source IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 120,
      render: (val: string) => val || <span style={{ color: C.textSecondary }}>All</span>,
    },
    {
      title: 'Remarks',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: C.textSecondary }}>—</span>,
    },
    {
      title: 'Add Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => {
        if (!val) return '—';
        try { return new Date(val).toLocaleString(); } catch { return val; }
      },
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <Space size={0} split={<span style={{ color: C.border, margin: '0 4px' }}>|</span>}>
          <a style={{ color: C.primary, fontWeight: 500 }} onClick={() => openEditModal(record)}>
            Edit
          </a>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <a style={{ color: C.error, fontWeight: 500 }}>Delete</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Table columns for IP rules
  const ipColumns = [
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
      render: (val: string) => <span style={{ fontWeight: 600, color: C.text }}>{val || 'All'}</span>,
    },
    {
      title: 'Strategy',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (val: string) =>
        val === 'allow'
          ? <span style={{ color: C.success, fontWeight: 600 }}>Allow</span>
          : <span style={{ color: C.error, fontWeight: 600 }}>Deny</span>,
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 100,
      render: (val: string) => val === 'in' ? 'Inbound' : 'Outbound',
    },
    {
      title: 'Remarks',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: C.textSecondary }}>—</span>,
    },
    {
      title: 'Add Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => {
        if (!val) return '—';
        try { return new Date(val).toLocaleString(); } catch { return val; }
      },
    },
    {
      title: 'Operate',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: FirewallRule) => (
        <Space size={0} split={<span style={{ color: C.border, margin: '0 4px' }}>|</span>}>
          <a style={{ color: C.primary, fontWeight: 500 }} onClick={() => openEditModal(record)}>
            Edit
          </a>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <a style={{ color: C.error, fontWeight: 500 }}>Delete</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const pillStyle = (active: boolean) => ({
    padding: '6px 18px',
    borderRadius: 20,
    cursor: 'pointer' as const,
    fontWeight: 500 as const,
    fontSize: 13,
    border: `1px solid ${active ? C.primary : C.border}`,
    background: active ? C.primary : C.white,
    color: active ? C.white : C.text,
    transition: 'all 0.2s',
    userSelect: 'none' as const,
  });

  const dirBtnStyle = (active: boolean) => ({
    padding: '4px 14px',
    borderRadius: 4,
    cursor: 'pointer' as const,
    fontWeight: 500 as const,
    fontSize: 13,
    border: 'none' as const,
    background: active ? C.primary : 'transparent',
    color: active ? C.white : C.textSecondary,
    transition: 'all 0.2s',
  });

  return (
    <div>
      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 16,
        padding: '16px 20px',
        background: C.bg,
        borderRadius: 8,
        marginBottom: 20,
        border: `1px solid ${C.border}`,
      }}>
        <Space size={8} align="center">
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Firewall</span>
          <Switch
            checked={firewallEnabled}
            onChange={setFirewallEnabled}
            style={{ backgroundColor: firewallEnabled ? C.success : undefined }}
          />
        </Space>
        <div style={{ width: 1, height: 24, background: C.border, display: isMobile ? 'none' : 'block' }} />
        <Space size={8} align="center">
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Block ICMP</span>
          <Switch
            checked={icmpBlocked}
            onChange={setIcmpBlocked}
          />
        </Space>
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchRules}>
          {t('common.refresh')}
        </Button>
      </div>

      {/* Sub-tabs: Port rules / IP rules */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={pillStyle(subTab === 'port')} onClick={() => { setSubTab('port'); setSelectedRowKeys([]); }}>
          Port rules: {portRuleCount}
        </div>
        <div style={pillStyle(subTab === 'ip')} onClick={() => { setSubTab('ip'); setSelectedRowKeys([]); }}>
          IP rules: {ipRuleCount}
        </div>
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
        <Space wrap size={8}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAddModal}
            style={{ background: C.success, borderColor: C.success }}
          >
            {subTab === 'port' ? 'Add Port Rule' : 'Add IP Rule'}
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImportRules}>
            {t('common.import')} rules
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExportRules}>
            {t('common.export')} rules
          </Button>
        </Space>

        <Space wrap size={8}>
          {!isMobile && (
            <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 6, padding: 2 }}>
              <button style={dirBtnStyle(directionFilter === 'all')} onClick={() => setDirectionFilter('all')}>
                All directions
              </button>
              <button style={dirBtnStyle(directionFilter === 'in')} onClick={() => setDirectionFilter('in')}>
                Inbound
              </button>
              <button style={dirBtnStyle(directionFilter === 'out')} onClick={() => setDirectionFilter('out')}>
                Outbound
              </button>
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
        </Space>
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
          background: '#FFF3E0',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1px solid ${C.warning}44`,
        }}>
          <span style={{ fontSize: 13, color: C.text }}>
            {selectedRowKeys.length} selected
          </span>
          <Popconfirm title={`Delete ${selectedRowKeys.length} rules?`} onConfirm={handleBatchDelete}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              Batch delete
            </Button>
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
    <Card
      style={{
        maxWidth: 640,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: isMobile ? 16 : 28 } }}
    >
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <LockOutlined style={{ fontSize: 20, color: C.primary }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>SSH Configuration</span>
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
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            style={{ background: C.primary, borderColor: C.primary }}
          >
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fail2ban Tab
// ---------------------------------------------------------------------------

function Fail2banTab() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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
    <Card
      style={{
        maxWidth: 640,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
      styles={{ body: { padding: isMobile ? 16 : 28 } }}
    >
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <SecurityScanOutlined style={{ fontSize: 20, color: C.primary }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Brute Force Protection (Fail2ban)</span>
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
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            style={{ background: C.primary, borderColor: C.primary }}
          >
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Security Page
// ---------------------------------------------------------------------------

const topTabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 24px',
  cursor: 'pointer',
  fontWeight: active ? 600 : 400,
  fontSize: 15,
  color: active ? C.primary : C.textSecondary,
  borderBottom: active ? `3px solid ${C.primary}` : '3px solid transparent',
  transition: 'all 0.2s',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  userSelect: 'none',
  background: 'none',
  border: 'none',
  borderBottomStyle: 'solid',
});

export default function Security() {
  const [activeTab, setActiveTab] = useState<'firewall' | 'ssh' | 'fail2ban'>('firewall');

  const tabs = [
    { key: 'firewall' as const, icon: <FireOutlined />, label: 'Firewall' },
    { key: 'ssh' as const, icon: <LockOutlined />, label: 'SSH' },
    { key: 'fail2ban' as const, icon: <SecurityScanOutlined />, label: 'Fail2ban' },
  ];

  return (
    <div>
      {/* Top tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 24,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            style={topTabStyle(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'firewall' && <FirewallTab />}
      {activeTab === 'ssh' && <SSHTab />}
      {activeTab === 'fail2ban' && <Fail2banTab />}
    </div>
  );
}
