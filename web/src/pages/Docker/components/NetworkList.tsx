import { useState, useEffect, useCallback } from 'react';
import { Table, message, Popconfirm, Modal, Form, Input, Select, Descriptions, Tag, Tooltip } from 'antd';
import {
  DeleteOutlined, PlusOutlined, EyeOutlined, ClearOutlined,
  ApiOutlined, ContainerOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  internal: boolean;
  enable_ipv6: boolean;
  container_count: number;
  created: string;
}

interface ContainerEndpoint {
  name: string;
  ipv4_address: string;
  ipv6_address?: string;
  mac_address: string;
}

interface IPAMConfig {
  subnet: string;
  gateway: string;
}

interface NetworkDetail {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  internal: boolean;
  enable_ipv6: boolean;
  ipam: IPAMConfig[];
  ipam_driver: string;
  containers: Record<string, ContainerEndpoint>;
  options: Record<string, string>;
  labels: Record<string, string>;
  created: string;
}

const driverColors: Record<string, string> = {
  bridge: '#1890ff', host: '#52c41a', overlay: '#722ed1',
  macvlan: '#fa8c16', ipvlan: '#eb2f96', none: '#8c8c8c',
};

function fmtDate(s: string) {
  if (!s) return '-';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

export default function NetworkList({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectData, setInspectData] = useState<NetworkDetail | null>(null);
  const [createForm] = Form.useForm();

  const fetchNetworks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DockerNetwork[]>>('/docker/networks');
      setNetworks(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNetworks(); }, [fetchNetworks]);

  const handleCreate = async (values: { name: string; driver: string; subnet?: string; gateway?: string }) => {
    setCreateLoading(true);
    try {
      await api.post('/docker/networks', values);
      message.success(t('common.success'));
      setCreateOpen(false);
      createForm.resetFields();
      fetchNetworks();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/docker/networks/${id}`);
      message.success(t('common.success'));
      fetchNetworks();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleInspect = async (id: string) => {
    setInspectOpen(true);
    setInspectData(null);
    try {
      const { data } = await api.get<ApiResponse<NetworkDetail>>(`/docker/networks/${id}`);
      setInspectData(data.data);
    } catch {
      message.error('Failed to inspect network');
    }
  };

  const handlePrune = async () => {
    try {
      await api.post('/docker/networks/prune');
      message.success('Unused networks pruned');
      fetchNetworks();
    } catch {
      message.error(t('common.error'));
    }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => (
        <span style={{ fontWeight: 600, color: p.text }}>
          {val}
          {['bridge', 'host', 'none'].includes(val) && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${p.textMuted}20`, color: p.textMuted, marginLeft: 6, fontWeight: 400 }}>DEFAULT</span>
          )}
        </span>
      ),
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'inherit' }}>{val}</span>,
    },
    {
      title: 'Driver',
      dataIndex: 'driver',
      key: 'driver',
      render: (val: string) => {
        const c = driverColors[val] || p.cyan;
        return (
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: `${c}15`, color: c, fontWeight: 600 }}>{val}</span>
        );
      },
    },
    {
      title: 'Subnet',
      dataIndex: 'subnet',
      key: 'subnet',
      render: (val: string, r: DockerNetwork) => val ? (
        <Tooltip title={`Gateway: ${r.gateway || 'auto'}`}>
          <span style={{ fontSize: 11, color: p.text, fontFamily: 'inherit' }}>{val}</span>
        </Tooltip>
      ) : <span style={{ color: p.textMuted }}>—</span>,
    },
    {
      title: <span><ContainerOutlined style={{ marginRight: 4 }} />Containers</span>,
      dataIndex: 'container_count',
      key: 'container_count',
      width: 100,
      align: 'center' as const,
      render: (val: number) => val > 0
        ? <span style={{ fontSize: 12, fontWeight: 600, color: p.green }}>{val}</span>
        : <span style={{ color: p.textMuted }}>0</span>,
    },
    {
      title: 'Scope',
      dataIndex: 'scope',
      key: 'scope',
      render: (val: string) => (
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: `${p.purple}12`, color: p.purple, fontWeight: 500 }}>{val}</span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 140,
      render: (_: unknown, r: DockerNetwork) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => handleInspect(r.id)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <EyeOutlined /> Inspect
          </button>
          {!['bridge', 'host', 'none'].includes(r.name) && (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)}>
              <button style={{
                padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
                background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <DeleteOutlined />
              </button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Popconfirm title="Remove all unused networks?" onConfirm={handlePrune}>
          <button style={{
            padding: '6px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ClearOutlined /> Prune
          </button>
        </Popconfirm>
        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> Create Network
        </button>
      </div>

      <Table columns={columns} dataSource={networks} rowKey="id"
        loading={loading} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />

      {/* Create Network Modal */}
      <Modal
        title="Create Network"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}
          initialValues={{ driver: 'bridge' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="my-network" />
          </Form.Item>
          <Form.Item name="driver" label="Driver">
            <Select options={[
              { value: 'bridge', label: 'bridge' },
              { value: 'overlay', label: 'overlay' },
              { value: 'macvlan', label: 'macvlan' },
              { value: 'ipvlan', label: 'ipvlan' },
            ]} />
          </Form.Item>
          <Form.Item name="subnet" label="Subnet" extra="e.g. 172.20.0.0/16">
            <Input placeholder="172.20.0.0/16" />
          </Form.Item>
          <Form.Item name="gateway" label="Gateway" extra="e.g. 172.20.0.1">
            <Input placeholder="172.20.0.1" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Inspect Modal — rich detail view */}
      <Modal
        title={inspectData ? `Network: ${inspectData.name}` : 'Network Details'}
        open={inspectOpen}
        onCancel={() => { setInspectOpen(false); setInspectData(null); }}
        footer={null}
        width={isMobile ? '95%' : 650}
      >
        {inspectData && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Name"><span style={{ fontWeight: 600 }}>{inspectData.name}</span></Descriptions.Item>
              <Descriptions.Item label="ID"><span style={{ fontFamily: 'inherit', fontSize: 12 }}>{inspectData.id}</span></Descriptions.Item>
              <Descriptions.Item label="Driver"><Tag color={driverColors[inspectData.driver]}>{inspectData.driver}</Tag></Descriptions.Item>
              <Descriptions.Item label="Scope">{inspectData.scope}</Descriptions.Item>
              <Descriptions.Item label="Created">{fmtDate(inspectData.created)}</Descriptions.Item>
              <Descriptions.Item label="Internal">{inspectData.internal ? <Tag color="orange">Yes</Tag> : 'No'}</Descriptions.Item>
              <Descriptions.Item label="IPv6">{inspectData.enable_ipv6 ? <Tag color="blue">Enabled</Tag> : 'Disabled'}</Descriptions.Item>
              <Descriptions.Item label="IPAM Driver">{inspectData.ipam_driver || 'default'}</Descriptions.Item>
              {(inspectData.ipam ?? []).map((cfg, i) => (
                <Descriptions.Item key={i} label={`Subnet${(inspectData.ipam ?? []).length > 1 ? ` #${i+1}` : ''}`}>
                  <span style={{ fontFamily: 'inherit', fontSize: 12 }}>{cfg.subnet || '—'}</span>
                  {cfg.gateway && <span style={{ marginLeft: 12, color: p.textMuted, fontSize: 12 }}>Gateway: <span style={{ fontFamily: 'inherit' }}>{cfg.gateway}</span></span>}
                </Descriptions.Item>
              ))}
            </Descriptions>

            {/* Connected Containers */}
            {Object.keys(inspectData.containers ?? {}).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8 }}>
                  <ContainerOutlined style={{ marginRight: 6 }} />
                  Connected Containers ({Object.keys(inspectData.containers).length})
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={Object.entries(inspectData.containers).map(([id, ep]) => ({ id, ...ep }))}
                  columns={[
                    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontWeight: 500 }}>{v || '—'}</span> },
                    { title: 'ID', dataIndex: 'id', key: 'id', render: (v: string) => <span style={{ fontFamily: 'inherit', fontSize: 11 }}>{v}</span> },
                    { title: 'IPv4', dataIndex: 'ipv4_address', key: 'ipv4', render: (v: string) => v ? <Tag color="cyan" style={{ fontFamily: 'inherit', fontSize: 11 }}>{v}</Tag> : '—' },
                    { title: 'MAC', dataIndex: 'mac_address', key: 'mac', render: (v: string) => v ? <span style={{ fontFamily: 'inherit', fontSize: 11, color: p.textMuted }}>{v}</span> : '—' },
                  ]}
                />
              </div>
            )}

            {/* Options */}
            {Object.keys(inspectData.options ?? {}).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8 }}>Driver Options</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(inspectData.options).map(([k, v]) => <Tag key={k} style={{ fontSize: 11 }}>{k}={v}</Tag>)}
                </div>
              </div>
            )}

            {/* Labels */}
            {Object.keys(inspectData.labels ?? {}).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.text, marginBottom: 8 }}>Labels</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(inspectData.labels).map(([k, v]) => (
                    <Tooltip key={k} title={v}>
                      <Tag style={{ fontSize: 11 }}>{k}={v.length > 30 ? v.slice(0, 30) + '…' : v}</Tag>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
