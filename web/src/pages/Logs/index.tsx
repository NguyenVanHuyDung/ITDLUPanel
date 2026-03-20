import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Tabs, Space, Input, Select, Typography, message, Popconfirm } from 'antd';
import { ReloadOutlined, SearchOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface AuditEntry {
  id: number;
  user: string;
  action: string;
  resource: string;
  ip: string;
  created_at: string;
}

const terminalStyle: React.CSSProperties = {
  background: '#0d1117',
  color: '#c9d1d9',
  padding: 16,
  borderRadius: 8,
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  fontSize: 13,
  lineHeight: 1.6,
  maxHeight: '65vh',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

export default function Logs() {
  const { t } = useTranslation();
  const [panelLog, setPanelLog] = useState('');
  const [sshLog, setSshLog] = useState('');
  const [auditData, setAuditData] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(200);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('panel');

  const fetchPanelLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string }>>('/logs/panel', { params: { lines: numLines } });
      setPanelLog(data.data?.lines ?? '');
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchSshLog = useCallback(async (numLines: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ lines: string }>>('/logs/ssh', { params: { lines: numLines } });
      setSshLog(data.data?.lines ?? '');
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<AuditEntry[]>>('/logs/audit');
      setAuditData(data.data ?? []);
    } catch {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refresh = useCallback(() => {
    if (activeTab === 'panel') fetchPanelLog(lines);
    else if (activeTab === 'ssh') fetchSshLog(lines);
    else fetchAuditLog();
  }, [activeTab, lines, fetchPanelLog, fetchSshLog, fetchAuditLog]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleClearLog = async () => {
    const endpoint = activeTab === 'panel' ? '/logs/panel' : '/logs/ssh';
    try {
      await api.delete(endpoint);
      message.success(t('common.success'));
      refresh();
    } catch {
      message.error(t('common.error'));
    }
  };

  const filterLog = (content: string): string => {
    if (!search.trim()) return content;
    return content
      .split('\n')
      .filter((line) => line.toLowerCase().includes(search.toLowerCase()))
      .join('\n') || 'No matching lines';
  };

  const highlightSearch = (content: string): React.ReactNode => {
    const filtered = filterLog(content);
    if (!search.trim()) return filtered;
    const parts = filtered.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase()
        ? <span key={i} style={{ background: '#e2b714', color: '#000', borderRadius: 2, padding: '0 2px' }}>{part}</span>
        : part
    );
  };

  const auditColumns = [
    { title: 'User', dataIndex: 'user', key: 'user' },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (val: string) => <Typography.Text code>{val}</Typography.Text> },
    { title: 'Resource', dataIndex: 'resource', key: 'resource', ellipsis: true },
    { title: 'IP', dataIndex: 'ip', key: 'ip' },
    { title: 'Time', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val ? new Date(val).toLocaleString() : '-' },
  ];

  const logToolbar = (
    <Space wrap>
      <Input
        prefix={<SearchOutlined />}
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ width: 220 }}
      />
      <Select
        value={lines}
        onChange={(val: number) => setLines(val)}
        options={[
          { label: '100 lines', value: 100 },
          { label: '200 lines', value: 200 },
          { label: '500 lines', value: 500 },
          { label: '1000 lines', value: 1000 },
        ]}
        style={{ width: 130 }}
      />
      <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
        {t('common.refresh')}
      </Button>
      {activeTab !== 'audit' && (
        <Popconfirm title="Clear this log file?" onConfirm={handleClearLog}>
          <Button danger icon={<ClearOutlined />}>Clear</Button>
        </Popconfirm>
      )}
    </Space>
  );

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>{t('sidebar.logs')}</Typography.Title>
      <Card>
        <div style={{ marginBottom: 16 }}>{logToolbar}</div>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setSearch(''); }}
          items={[
            {
              key: 'panel',
              label: 'Panel Log',
              children: (
                <div style={terminalStyle}>
                  {loading ? t('common.loading') : highlightSearch(panelLog || 'No log data')}
                </div>
              ),
            },
            {
              key: 'ssh',
              label: 'SSH Log',
              children: (
                <div style={terminalStyle}>
                  {loading ? t('common.loading') : highlightSearch(sshLog || 'No log data')}
                </div>
              ),
            },
            {
              key: 'audit',
              label: 'Audit Log',
              children: (
                <Table
                  columns={auditColumns}
                  dataSource={auditData.filter((row) =>
                    !search.trim() || Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
                  )}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
