import { useState, useEffect, useCallback } from 'react';
import { Table, message, Popconfirm, Modal, Form, Input, Select, Descriptions, Tag, InputNumber, Space } from 'antd';
import {
  DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined, RedoOutlined,
  PlusOutlined, EyeOutlined, FileTextOutlined, StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';
import { formatDateTime } from '@/lib/datetime';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: { ip: string; private_port: number; public_port: number; type: string }[];
  created: number;
}

interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: { ip: string; private_port: number; public_port: number; type: string }[];
  created: string;
  platform: string;
  command: string;
  env: string[];
  mounts: { type: string; source: string; destination: string; rw: boolean }[];
  networks: Record<string, string>;
  restart_policy: string;
}

export default function ContainerList({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logsTitle, setLogsTitle] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<ContainerDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<DockerContainer[]>>('/docker/containers', { params: { all: true } });
      setContainers(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContainers(); }, [fetchContainers]);

  const containerAction = async (id: string, action: string) => {
    try {
      if (action === 'remove') {
        await api.delete(`/docker/containers/${id}?force=true`);
      } else {
        await api.post(`/docker/containers/${id}/${action}`);
      }
      message.success(t('common.success'));
      fetchContainers();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    }
  };

  const viewLogs = async (container: DockerContainer) => {
    setLogsTitle(container.name);
    setLogsOpen(true);
    setLogsLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ logs: string }>>(`/docker/containers/${container.id}/logs`, { params: { tail: 200 } });
      setLogsContent(data.data?.logs ?? 'No logs available');
    } catch {
      setLogsContent('Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const viewDetail = async (id: string) => {
    setDetailOpen(true);
    try {
      const { data } = await api.get<ApiResponse<ContainerDetail>>(`/docker/containers/${id}`);
      setDetailData(data.data);
    } catch {
      message.error('Failed to load container details');
    }
  };

  const handleCreate = async (values: { name: string; image: string; ports?: string; env?: string; volumes?: string; restart_policy?: string; command?: string }) => {
    setCreateLoading(true);
    try {
      const ports: Record<string, string> = {};
      if (values.ports) {
        values.ports.split('\n').filter(Boolean).forEach(line => {
          const [host, container] = line.split(':');
          if (host && container) ports[host.trim()] = container.trim();
        });
      }
      const env = values.env ? values.env.split('\n').filter(Boolean) : [];
      const vols = values.volumes ? values.volumes.split('\n').filter(Boolean) : [];

      await api.post('/docker/containers', {
        name: values.name,
        image: values.image,
        ports,
        env,
        volumes: vols,
        restart_policy: values.restart_policy || 'no',
        command: values.command || '',
      });
      message.success('Container created');
      setCreateOpen(false);
      createForm.resetFields();
      fetchContainers();
      onRefresh?.();
    } catch {
      message.error(t('common.error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const stateColor = (state: string): string => {
    if (state === 'running') return p.green;
    if (state === 'paused') return p.amber;
    return p.red;
  };

  const formatPorts = (ports: DockerContainer['ports']) => {
    if (!ports?.length) return '-';
    return ports.filter(pp => pp.public_port).map(pp => `${pp.public_port}→${pp.private_port}`).join(', ') || '-';
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (val: string, r: DockerContainer) => (
        <button onClick={() => viewDetail(r.id)} style={{
          fontWeight: 600, color: p.accent, background: 'none', border: 'none',
          cursor: 'pointer', padding: 0, fontSize: 13,
        }}>{val}</button>
      ),
    },
    { title: 'Image', dataIndex: 'image', key: 'image', ellipsis: true },
    {
      title: t('common.status'),
      key: 'state',
      render: (_: unknown, r: DockerContainer) => {
        const color = stateColor(r.state);
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 99,
            background: `${color}15`, color, fontSize: 11, fontWeight: 500,
            lineHeight: 1,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {r.state}
          </span>
        );
      },
    },
    {
      title: 'Ports',
      key: 'ports',
      render: (_: unknown, r: DockerContainer) => (
        <span style={{ fontSize: 12 }}>{formatPorts(r.ports)}</span>
      ),
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
      width: 300,
      render: (_: unknown, r: DockerContainer) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.state !== 'running' && r.state !== 'paused' && (
            <button onClick={() => containerAction(r.id, 'start')} style={{
              padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.accent, color: '#fff', fontSize: 11, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <PlayCircleOutlined /> Start
            </button>
          )}
          {r.state === 'running' && (
            <>
              <button onClick={() => containerAction(r.id, 'stop')} style={{
                padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <StopOutlined /> Stop
              </button>
              <button onClick={() => containerAction(r.id, 'pause')} style={{
                padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <PauseCircleOutlined /> Pause
              </button>
            </>
          )}
          {r.state === 'paused' && (
            <button onClick={() => containerAction(r.id, 'unpause')} style={{
              padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: p.green, color: '#fff', fontSize: 11, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <PlayCircleOutlined /> Unpause
            </button>
          )}
          <button onClick={() => containerAction(r.id, 'restart')} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <RedoOutlined /> Restart
          </button>
          <button onClick={() => viewLogs(r)} style={{
            padding: '3px 8px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
            background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
          }}>
            <FileTextOutlined /> Logs
          </button>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => containerAction(r.id, 'remove')}>
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
        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> Create Container
        </button>
      </div>

      <Table columns={columns} dataSource={containers} rowKey="id"
        loading={loading} pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        scroll={isMobile ? { x: 800 } : undefined} />

      {/* Create Container Modal */}
      <Modal
        title="Create Container"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        width={isMobile ? '95%' : 600}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="image" label="Image" rules={[{ required: true }]}>
            <Input placeholder="nginx:latest" />
          </Form.Item>
          <Form.Item name="name" label="Container Name">
            <Input placeholder="my-container" />
          </Form.Item>
          <Form.Item name="ports" label="Port Mapping" extra="One per line: host_port:container_port">
            <Input.TextArea rows={2} placeholder="8080:80&#10;3306:3306" />
          </Form.Item>
          <Form.Item name="env" label="Environment Variables" extra="One per line: KEY=VALUE">
            <Input.TextArea rows={2} placeholder="MYSQL_ROOT_PASSWORD=secret&#10;MYSQL_DATABASE=mydb" />
          </Form.Item>
          <Form.Item name="volumes" label="Volume Mounts" extra="One per line: host_path:container_path">
            <Input.TextArea rows={2} placeholder="/data/mysql:/var/lib/mysql" />
          </Form.Item>
          <Form.Item name="restart_policy" label="Restart Policy" initialValue="no">
            <Select options={[
              { value: 'no', label: 'No' },
              { value: 'always', label: 'Always' },
              { value: 'unless-stopped', label: 'Unless Stopped' },
              { value: 'on-failure', label: 'On Failure' },
            ]} />
          </Form.Item>
          <Form.Item name="command" label="Command (optional)">
            <Input placeholder="e.g. /bin/sh -c 'echo hello'" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Container Detail Modal */}
      <Modal
        title={detailData ? `Container: ${detailData.name}` : 'Container Details'}
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetailData(null); }}
        footer={null}
        width={isMobile ? '95%' : 700}
      >
        {detailData && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID"><span style={{ fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 12 }}>{detailData.id}</span></Descriptions.Item>
            <Descriptions.Item label="Name">{detailData.name}</Descriptions.Item>
            <Descriptions.Item label="Image">{detailData.image}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <span style={{ color: stateColor(detailData.state) }}>{detailData.state}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Created">{detailData.created}</Descriptions.Item>
            <Descriptions.Item label="Command">{detailData.command || '-'}</Descriptions.Item>
            <Descriptions.Item label="Restart Policy">{detailData.restart_policy || '-'}</Descriptions.Item>
            <Descriptions.Item label="Networks">
              {Object.entries(detailData.networks ?? {}).map(([name, ip]) => (
                <Tag key={name}>{name}: {ip}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="Ports">
              {detailData.ports?.map((pp, i) => (
                <Tag key={i}>{pp.public_port || '*'}:{pp.private_port}/{pp.type}</Tag>
              )) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Mounts">
              {detailData.mounts?.map((m, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {m.source} → {m.destination} ({m.type}, {m.rw ? 'rw' : 'ro'})
                </div>
              )) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Environment">
              <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
                {detailData.env?.map((e, i) => <div key={i}>{e}</div>) || '-'}
              </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Logs Modal */}
      <Modal
        title={`Logs — ${logsTitle}`}
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={null}
        width={isMobile ? '95%' : 720}
      >
        <pre style={{
          background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
          maxHeight: '60vh', overflow: 'auto', fontSize: isMobile ? 11 : 12,
          fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5,
        }}>
          {logsLoading ? 'Loading...' : logsContent}
        </pre>
      </Modal>
    </div>
  );
}
