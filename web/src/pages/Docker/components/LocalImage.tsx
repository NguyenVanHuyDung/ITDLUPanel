import { useState, useEffect, useCallback } from 'react';
import { Table, message, Popconfirm, Modal, Descriptions, Tag } from 'antd';
import {
  DeleteOutlined, EyeOutlined, ClearOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';

interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

interface ImageDetail {
  id: string;
  tags: string[];
  size: number;
  created: string;
  os: string;
  arch: string;
  author: string;
  env: string[];
  cmd: string[];
  entrypoint: string[];
  working_dir: string;
  exposed_ports: string[];
  volumes: string[];
  labels: Record<string, string>;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function LocalImage({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectData, setInspectData] = useState<ImageDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DockerImage[]>>('/docker/images');
      setImages(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/docker/images/${id}?force=true`);
      message.success(t('common.success'));
      fetchImages();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleInspect = async (id: string) => {
    setInspectOpen(true);
    setInspectLoading(true);
    try {
      const { data } = await api.get<ApiResponse<ImageDetail>>(`/docker/images/${id}/inspect`);
      setInspectData(data.data);
    } catch {
      message.error('Failed to inspect image');
    } finally {
      setInspectLoading(false);
    }
  };

  const handlePrune = async () => {
    try {
      const { data } = await api.post<ApiResponse<{ space_reclaimed: number }>>('/docker/images/prune');
      message.success(`Pruned! Reclaimed ${formatSize(data.data?.space_reclaimed ?? 0)}`);
      fetchImages();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    }
  };

  const columns = [
    {
      title: 'Repository',
      key: 'repository',
      render: (_: unknown, r: DockerImage) => {
        const tag = r.tags?.[0] ?? '<none>';
        const parts = tag.split(':');
        return <span style={{ fontWeight: 600, color: p.text }}>{parts[0]}</span>;
      },
    },
    {
      title: 'Tag',
      key: 'tag',
      render: (_: unknown, r: DockerImage) => {
        const tag = r.tags?.[0] ?? '<none>';
        const parts = tag.split(':');
        return (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4,
            background: `${p.accent}15`, color: p.accent, fontWeight: 500,
            lineHeight: 1,
          }}>
            {parts[1] || 'latest'}
          </span>
        );
      },
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{val}</span>,
    },
    {
      title: t('common.size'),
      dataIndex: 'size',
      key: 'size',
      render: (val: number) => <span style={{ fontSize: 12 }}>{formatSize(val)}</span>,
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      render: (val: number) => <span style={{ fontSize: 12, color: p.textMuted }}>{val ? new Date(val * 1000).toLocaleDateString() : '-'}</span>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
      render: (_: unknown, r: DockerImage) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => handleInspect(r.id)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <EyeOutlined /> Inspect
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(r.id)}>
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Popconfirm title="Remove all dangling images?" onConfirm={handlePrune}>
          <button style={{
            padding: '6px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ClearOutlined /> Prune Dangling
          </button>
        </Popconfirm>
      </div>

      <Table columns={columns} dataSource={images} rowKey="id"
        loading={loading} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />

      <Modal
        title="Image Inspect"
        open={inspectOpen}
        onCancel={() => { setInspectOpen(false); setInspectData(null); }}
        footer={null}
        width={isMobile ? '95%' : 700}
      >
        {inspectLoading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div> : inspectData && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{inspectData.id}</Descriptions.Item>
            <Descriptions.Item label="Tags">{inspectData.tags?.join(', ') || '-'}</Descriptions.Item>
            <Descriptions.Item label="Size">{formatSize(inspectData.size)}</Descriptions.Item>
            <Descriptions.Item label="OS / Arch">{inspectData.os} / {inspectData.arch}</Descriptions.Item>
            <Descriptions.Item label="Created">{inspectData.created}</Descriptions.Item>
            <Descriptions.Item label="Author">{inspectData.author || '-'}</Descriptions.Item>
            <Descriptions.Item label="Working Dir">{inspectData.working_dir || '-'}</Descriptions.Item>
            <Descriptions.Item label="CMD">{inspectData.cmd?.join(' ') || '-'}</Descriptions.Item>
            <Descriptions.Item label="Entrypoint">{inspectData.entrypoint?.join(' ') || '-'}</Descriptions.Item>
            <Descriptions.Item label="Exposed Ports">
              {inspectData.exposed_ports?.map(p => <Tag key={p}>{p}</Tag>) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Volumes">
              {inspectData.volumes?.map(v => <Tag key={v}>{v}</Tag>) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Environment">
              <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
                {inspectData.env?.map((e, i) => <div key={i}>{e}</div>) || '-'}
              </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
