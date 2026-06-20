import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, message, Popconfirm, Modal, Descriptions, Tag, Input, Form, Alert, Progress } from 'antd';
import {
  DeleteOutlined, EyeOutlined, ClearOutlined, UploadOutlined, InboxOutlined, FileImageOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

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
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectData, setInspectData] = useState<ImageDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRepo, setUploadRepo] = useState('');
  const [uploadTag, setUploadTag] = useState('latest');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const pickFile = (file: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.tar') && !name.endsWith('.tgz') && !name.endsWith('.tar.gz')) {
      message.error('Please choose a .tar / .tar.gz file produced by `docker save`');
      return;
    }
    setUploadFile(file);
    if (!uploadRepo) {
      const base = file.name.replace(/\.(tar|tgz|tar\.gz)$/i, '');
      const guess = base.split(':')[0] || base;
      setUploadRepo(guess);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      message.warning('Please choose a tarball first');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      if (uploadRepo) fd.append('repo', uploadRepo);
      if (uploadTag) fd.append('tag', uploadTag);
      fd.append('quiet', '1');
      const { data } = await api.post<ApiResponse<{
        message: string;
        image_ids: string[];
        filename: string;
        size: number;
      }>>('/docker/images/load', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Allow large tarballs (Docker images can be GBs)
        timeout: 0,
        onUploadProgress: (evt) => {
          if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      const ids = data.data?.image_ids ?? [];
      message.success(
        ids.length > 0
          ? `Loaded ${uploadFile.name} as ${ids[0]}${uploadRepo ? ` (tagged ${uploadRepo}:${uploadTag})` : ''}`
          : `Loaded ${uploadFile.name}`,
      );
      setUploadOpen(false);
      setUploadFile(null);
      setUploadRepo('');
      setUploadTag('latest');
      setUploadProgress(0);
      fetchImages();
      onRefresh?.();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Upload failed';
      message.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setUploadFile(null);
    setUploadRepo('');
    setUploadTag('latest');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      render: (val: string) => <span style={{ fontSize: 11, color: p.textMuted, fontFamily: 'inherit' }}>{val}</span>,
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: p.textMuted }}>
          {images.length} image{images.length === 1 ? '' : 's'} stored locally
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setUploadOpen(true)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: p.accent, color: '#fff', fontSize: 12.5, fontWeight: 500,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}>
            <UploadOutlined /> Upload
          </button>
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
              <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 11, fontFamily: 'inherit' }}>
                {inspectData.env?.map((e, i) => <div key={i}>{e}</div>) || '-'}
              </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><UploadOutlined /> Upload Docker Image</span>}
        open={uploadOpen}
        onCancel={() => { if (!uploading) { setUploadOpen(false); resetUpload(); } }}
        footer={null}
        width={isMobile ? '95%' : 560}
        destroyOnClose
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="How to export an image for upload"
          description={
            <div style={{ fontSize: 12 }}>
              Run <code style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 3 }}>
                docker save -o image.tar your-image:tag
              </code> on the source host, then choose the resulting <code>.tar</code> file below.
            </div>
          }
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? p.accent : p.cardBorder}`,
            borderRadius: 8,
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? `${p.accent}08` : (isDark ? 'rgba(255,255,255,0.02)' : '#fafbfc'),
            transition: 'all 0.15s',
            marginBottom: 16,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar,.tgz,.tar.gz"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {uploadFile ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <FileImageOutlined style={{ fontSize: 24, color: p.accent }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: p.text, fontSize: 13 }}>{uploadFile.name}</div>
                <div style={{ fontSize: 11, color: p.textMuted }}>{formatSize(uploadFile.size)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); resetUpload(); }}
                style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 4,
                  border: `1px solid ${p.cardBorder}`, background: 'transparent',
                  color: p.textMuted, fontSize: 11, cursor: 'pointer',
                }}
              >Change</button>
            </div>
          ) : (
            <>
              <InboxOutlined style={{ fontSize: 32, color: dragOver ? p.accent : p.textMuted }} />
              <div style={{ marginTop: 8, fontSize: 13, color: p.text, fontWeight: 500 }}>
                Drop a .tar file here, or click to browse
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: p.textMuted }}>
                Output of <code style={{ fontFamily: 'inherit' }}>docker save</code>
              </div>
            </>
          )}
        </div>

        <Form layout="vertical" size="middle">
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="Repository (optional)" style={{ flex: 1, marginBottom: 12 }}>
              <Input
                placeholder="myapp"
                value={uploadRepo}
                onChange={(e) => setUploadRepo(e.target.value)}
                disabled={uploading}
              />
            </Form.Item>
            <Form.Item label="Tag (optional)" style={{ width: 140, marginBottom: 12 }}>
              <Input
                placeholder="latest"
                value={uploadTag}
                onChange={(e) => setUploadTag(e.target.value)}
                disabled={uploading}
              />
            </Form.Item>
          </div>
        </Form>

        {uploading && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={uploadProgress} status="active" strokeColor={p.accent} />
            <div style={{ fontSize: 11, color: p.textMuted, marginTop: 4 }}>
              Streaming tarball to Docker daemon…
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => { if (!uploading) { setUploadOpen(false); resetUpload(); } }}
            disabled={uploading}
            style={{
              padding: '6px 16px', borderRadius: 6,
              border: `1px solid ${p.cardBorder}`, background: 'transparent',
              color: p.textMuted, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleUpload}
            disabled={uploading || !uploadFile}
            style={{
              padding: '6px 18px', borderRadius: 6, border: 'none',
              background: uploading || !uploadFile ? p.cardBorder : p.accent,
              color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <UploadOutlined /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
