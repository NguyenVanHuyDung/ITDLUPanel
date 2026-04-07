import { useState, useEffect, useCallback } from 'react';
import { Table, message, Popconfirm, Modal, Form, Input, Descriptions, Tag } from 'antd';
import {
  DeleteOutlined, PlusOutlined, EyeOutlined, ClearOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created_at: string;
}

interface VolumeDetail {
  name: string;
  driver: string;
  mountpoint: string;
  labels: Record<string, string>;
  options: Record<string, string>;
  created_at: string;
  used_by: string[];
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function VolumeList({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectData, setInspectData] = useState<VolumeDetail | null>(null);
  const [createForm] = Form.useForm();

  const fetchVolumes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DockerVolume[]>>('/docker/volumes');
      setVolumes(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVolumes(); }, [fetchVolumes]);

  const handleCreate = async (values: { name: string; driver?: string }) => {
    setCreateLoading(true);
    try {
      await api.post('/docker/volumes', { ...values, driver: values.driver || 'local' });
      message.success(t('common.success'));
      setCreateOpen(false);
      createForm.resetFields();
      fetchVolumes();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await api.delete(`/docker/volumes/${name}?force=true`);
      message.success(t('common.success'));
      fetchVolumes();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleInspect = async (name: string) => {
    setInspectOpen(true);
    try {
      const { data } = await api.get<ApiResponse<VolumeDetail>>(`/docker/volumes/${name}`);
      setInspectData(data.data);
    } catch {
      message.error('Failed to inspect volume');
    }
  };

  const handlePrune = async () => {
    try {
      const { data } = await api.post<ApiResponse<{ space_reclaimed: number }>>('/docker/volumes/prune');
      message.success(`Volumes pruned! Reclaimed ${formatSize(data.data?.space_reclaimed ?? 0)}`);
      fetchVolumes();
      onRefresh?.();
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
        <span style={{ fontWeight: 600, color: p.text, fontSize: 13, fontFamily: 'monospace' }}>
          {val.length > 30 ? val.slice(0, 30) + '...' : val}
        </span>
      ),
    },
    {
      title: 'Driver',
      dataIndex: 'driver',
      key: 'driver',
      render: (val: string) => (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: `${p.purple}15`, color: p.purple, fontWeight: 500,
        }}>{val}</span>
      ),
    },
    {
      title: 'Mountpoint',
      dataIndex: 'mountpoint',
      key: 'mountpoint',
      ellipsis: true,
      render: (val: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{val}</span>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => <span style={{ fontSize: 12, color: p.textMuted }}>{val ? new Date(val).toLocaleDateString() : '-'}</span>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
      render: (_: unknown, r: DockerVolume) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => handleInspect(r.name)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <EyeOutlined /> Inspect
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.name)}>
            <button style={{
              padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.red}`,
              background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <DeleteOutlined />
            </button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Popconfirm title="Remove all unused volumes?" onConfirm={handlePrune}>
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
          <PlusOutlined /> Create Volume
        </button>
      </div>

      <Table columns={columns} dataSource={volumes} rowKey="name"
        loading={loading} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />

      {/* Create Volume Modal */}
      <Modal
        title="Create Volume"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="my-volume" />
          </Form.Item>
          <Form.Item name="driver" label="Driver" extra="Default: local">
            <Input placeholder="local" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Inspect Modal */}
      <Modal
        title="Volume Details"
        open={inspectOpen}
        onCancel={() => { setInspectOpen(false); setInspectData(null); }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        {inspectData && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Name">{inspectData.name}</Descriptions.Item>
            <Descriptions.Item label="Driver">{inspectData.driver}</Descriptions.Item>
            <Descriptions.Item label="Mountpoint">
              <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{inspectData.mountpoint}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Created">{inspectData.created_at}</Descriptions.Item>
            <Descriptions.Item label="Used By">
              {inspectData.used_by?.length
                ? inspectData.used_by.map(c => <Tag key={c}>{c}</Tag>)
                : 'Not in use'
              }
            </Descriptions.Item>
            <Descriptions.Item label="Labels">
              {Object.entries(inspectData.labels ?? {}).length > 0
                ? Object.entries(inspectData.labels).map(([k, v]) => <Tag key={k}>{k}={v}</Tag>)
                : '-'
              }
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
