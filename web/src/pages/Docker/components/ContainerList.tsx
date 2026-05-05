import { useState, useEffect, useCallback } from 'react';
import { message, Modal, Form, Input, Select, Spin } from 'antd';
import {
  DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined, RedoOutlined,
  PlusOutlined, EyeOutlined, FileTextOutlined, StopOutlined,
  CloudServerOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

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
    if (state === 'exited') return p.red;
    return p.textMuted;
  };

  const stateLabel = (state: string): string => {
    const map: Record<string, string> = { running: 'Running', paused: 'Paused', exited: 'Exited', created: 'Created', restarting: 'Restarting', dead: 'Dead' };
    return map[state] || state;
  };

  const formatPorts = (ports: DockerContainer['ports']) => {
    if (!ports?.length) return null;
    const mapped = ports.filter(pp => pp.public_port);
    if (!mapped.length) return null;
    return mapped.map(pp => `${pp.public_port}→${pp.private_port}/${pp.type}`);
  };

  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<string>('all');

  const filtered = containers.filter(c => {
    if (filterState !== 'all' && c.state !== filterState) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.image.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const runningCount = containers.filter(c => c.state === 'running').length;
  const stoppedCount = containers.filter(c => c.state !== 'running' && c.state !== 'paused').length;

  /* ---------- Styles ---------- */
  const isDark = (p as any).card !== '#fff' && (p as any).card !== '#ffffff';
  const btnSm: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
    background: 'transparent', color: p.textMuted, fontSize: 11, fontWeight: 500,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            border: `1px solid ${p.cardBorder}`,
            background: 'transparent', minWidth: 180, maxWidth: 280, flex: 1,
          }}>
            <SearchOutlined style={{ color: p.textMuted, fontSize: 13 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search containers..."
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                color: p.text, fontSize: 12, width: '100%',
              }}
            />
          </div>
          {/* State filter pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'all', label: `All (${containers.length})` },
              { key: 'running', label: `Running (${runningCount})` },
              { key: 'exited', label: `Stopped (${stoppedCount})` },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterState(f.key)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                border: filterState === f.key ? `1.5px solid ${p.accent}` : `1px solid ${p.cardBorder}`,
                background: filterState === f.key ? `${p.accent}12` : 'transparent',
                color: filterState === f.key ? p.accent : p.textMuted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> Create
        </button>
      </div>

      {/* Container Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <CloudServerOutlined style={{ fontSize: 36, color: p.textDim, display: 'block', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: p.textMuted }}>
            {containers.length === 0 ? 'No containers found' : 'No containers match your filter'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(c => {
            const color = stateColor(c.state);
            const ports = formatPorts(c.ports);
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? 10 : 14,
                padding: '12px 16px', borderRadius: 10,
                background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                borderLeft: `3px solid ${color}`,
                transition: 'background 0.15s',
              }}>
                {/* Left: icon + info */}
                <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
                  {/* Status icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: `${color}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CloudServerOutlined style={{ fontSize: 18, color }} />
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <button onClick={() => viewDetail(c.id)} style={{
                        fontSize: 13, fontWeight: 600, color: p.accent,
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      }}>
                        {c.name}
                      </button>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                        background: `${color}15`, color,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {stateLabel(c.state)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: p.textMuted, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        fontFamily: 'inherit', fontSize: 11,
                        maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.image}</span>
                      {ports && (
                        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {ports.map((pt, i) => (
                            <span key={i} style={{
                              fontSize: 10, padding: '0 5px', borderRadius: 3,
                              background: `${p.accent}10`, color: p.accent, fontWeight: 500,
                              fontFamily: 'inherit',
                            }}>{pt}</span>
                          ))}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: p.textDim }}>
                        {c.created ? new Date(c.created * 1000).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
                  {/* State-specific primary action */}
                  {c.state !== 'running' && c.state !== 'paused' && (
                    <button onClick={() => containerAction(c.id, 'start')} style={{
                      ...btnSm, background: p.accent, color: '#fff', border: 'none',
                    }}>
                      <PlayCircleOutlined /> Start
                    </button>
                  )}
                  {c.state === 'running' && (
                    <button onClick={() => containerAction(c.id, 'stop')} style={{
                      ...btnSm, color: p.amber, borderColor: `${p.amber}40`,
                    }}>
                      <StopOutlined /> Stop
                    </button>
                  )}
                  {c.state === 'paused' && (
                    <button onClick={() => containerAction(c.id, 'unpause')} style={{
                      ...btnSm, background: p.green, color: '#fff', border: 'none',
                    }}>
                      <PlayCircleOutlined /> Resume
                    </button>
                  )}
                  {c.state === 'running' && (
                    <button onClick={() => containerAction(c.id, 'pause')} title="Pause" style={btnSm}>
                      <PauseCircleOutlined />
                    </button>
                  )}
                  <button onClick={() => containerAction(c.id, 'restart')} title="Restart" style={btnSm}>
                    <RedoOutlined />
                  </button>
                  <button onClick={() => viewLogs(c)} title="Logs" style={btnSm}>
                    <FileTextOutlined />
                  </button>
                  <button onClick={() => viewDetail(c.id)} title="Details" style={btnSm}>
                    <EyeOutlined />
                  </button>
                  <button
                    title="Remove"
                    onClick={() => { if (window.confirm(`Remove container "${c.name}"? This action cannot be undone.`)) containerAction(c.id, 'remove'); }}
                    style={{ ...btnSm, color: p.red, borderColor: `${p.red}40` }}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
        {detailData && (() => {
          const color = stateColor(detailData.state);
          const infoRow: React.CSSProperties = {
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '8px 0', borderBottom: `1px solid ${p.cardBorder}`,
            fontSize: 12, gap: 12,
          };
          const label: React.CSSProperties = { color: p.textMuted, fontWeight: 500, minWidth: 100, flexShrink: 0 };
          const val: React.CSSProperties = { color: p.text, textAlign: 'right' as const, wordBreak: 'break-all' as const, flex: 1 };
          const mono: React.CSSProperties = { fontFamily: 'inherit', fontSize: 11 };

          return (
            <div>
              {/* Status banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: `${color}08`, border: `1px solid ${color}20`,
              }}>
                <CloudServerOutlined style={{ fontSize: 20, color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{detailData.name}</div>
                  <div style={{ fontSize: 11, color: p.textMuted }}>{detailData.image}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  background: `${color}15`, color, textTransform: 'uppercase',
                }}>{detailData.state}</span>
              </div>

              <div style={infoRow}>
                <span style={label}>ID</span>
                <span style={{ ...val, ...mono }}>{detailData.id.substring(0, 12)}</span>
              </div>
              <div style={infoRow}>
                <span style={label}>Created</span>
                <span style={val}>{detailData.created}</span>
              </div>
              <div style={infoRow}>
                <span style={label}>Command</span>
                <span style={{ ...val, ...mono }}>{detailData.command || '—'}</span>
              </div>
              <div style={infoRow}>
                <span style={label}>Restart</span>
                <span style={val}>{detailData.restart_policy || '—'}</span>
              </div>
              <div style={infoRow}>
                <span style={label}>Networks</span>
                <span style={{ ...val, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {Object.entries(detailData.networks ?? {}).map(([name, ip]) => (
                    <span key={name} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: `${p.accent}10`, color: p.accent, fontWeight: 500,
                    }}>{name}: {ip}</span>
                  ))}
                  {!Object.keys(detailData.networks ?? {}).length && '—'}
                </span>
              </div>
              <div style={infoRow}>
                <span style={label}>Ports</span>
                <span style={{ ...val, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {detailData.ports?.map((pp, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4, ...mono,
                      background: `${p.green}10`, color: p.green, fontWeight: 500,
                    }}>{pp.public_port || '*'}:{pp.private_port}/{pp.type}</span>
                  )) || '—'}
                </span>
              </div>
              {detailData.mounts?.length > 0 && (
                <div style={{ ...infoRow, flexDirection: 'column', gap: 4 }}>
                  <span style={label}>Mounts</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                    {detailData.mounts.map((m, i) => (
                      <div key={i} style={{
                        ...mono, fontSize: 11, padding: '4px 8px', borderRadius: 4,
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      }}>
                        {m.source} → {m.destination} <span style={{ color: p.textMuted }}>({m.type}, {m.rw ? 'rw' : 'ro'})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailData.env?.length > 0 && (
                <div style={{ ...infoRow, flexDirection: 'column', gap: 4, borderBottom: 'none' }}>
                  <span style={label}>Environment</span>
                  <div style={{
                    maxHeight: 140, overflow: 'auto', width: '100%',
                    ...mono, fontSize: 11, padding: '8px 10px', borderRadius: 6,
                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  }}>
                    {detailData.env.map((e, i) => <div key={i} style={{ padding: '1px 0' }}>{e}</div>)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
          fontFamily: 'inherit',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5,
        }}>
          {logsLoading ? 'Loading...' : logsContent}
        </pre>
      </Modal>
    </div>
  );
}
