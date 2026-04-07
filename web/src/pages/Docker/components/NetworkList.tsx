import { useState, useEffect, useCallback } from 'react';
import { Table, message, Popconfirm, Modal, Form, Input, Select, Descriptions, Tag, Empty } from 'antd';
import {
  DeleteOutlined, PlusOutlined, EyeOutlined, ClearOutlined,
  ApiOutlined, LinkOutlined, DisconnectOutlined,
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
}

interface NetworkDetail {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  internal: boolean;
  containers: Record<string, string>;
  created: string;
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
      render: (val: string) => <span style={{ fontWeight: 600, color: p.text }}>{val}</span>,
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{val}</span>,
    },
    {
      title: 'Driver',
      dataIndex: 'driver',
      key: 'driver',
      render: (val: string) => (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: `${p.cyan}15`, color: p.cyan, fontWeight: 500,
        }}>{val}</span>
      ),
    },
    {
      title: 'Scope',
      dataIndex: 'scope',
      key: 'scope',
      render: (val: string) => <span style={{ fontSize: 12, color: p.textMuted }}>{val}</span>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
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

      {/* Inspect Modal */}
      <Modal
        title="Network Details"
        open={inspectOpen}
        onCancel={() => { setInspectOpen(false); setInspectData(null); }}
        footer={null}
        width={isMobile ? '95%' : 650}
      >
        {inspectData && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Name">{inspectData.name}</Descriptions.Item>
            <Descriptions.Item label="ID">{inspectData.id}</Descriptions.Item>
            <Descriptions.Item label="Driver">{inspectData.driver}</Descriptions.Item>
            <Descriptions.Item label="Scope">{inspectData.scope}</Descriptions.Item>
            <Descriptions.Item label="Subnet">{inspectData.subnet || '-'}</Descriptions.Item>
            <Descriptions.Item label="Gateway">{inspectData.gateway || '-'}</Descriptions.Item>
            <Descriptions.Item label="Internal">{inspectData.internal ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Containers">
              {Object.entries(inspectData.containers ?? {}).length > 0
                ? Object.entries(inspectData.containers).map(([id, name]) => (
                    <Tag key={id}>{name} ({id})</Tag>
                  ))
                : 'None'
              }
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
