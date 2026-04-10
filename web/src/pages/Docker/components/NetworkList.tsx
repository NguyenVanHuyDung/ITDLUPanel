import { useState, useEffect, useCallback } from 'react';
import { message, Popconfirm, Modal, Form, Input, Select, Tag, Empty, Tooltip } from 'antd';
import {
  DeleteOutlined, PlusOutlined, EyeOutlined, ClearOutlined,
  ApiOutlined, GlobalOutlined, ClusterOutlined,
  ContainerOutlined, ClockCircleOutlined,
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
  bridge: '#1890ff',
  host: '#52c41a',
  overlay: '#722ed1',
  macvlan: '#fa8c16',
  ipvlan: '#eb2f96',
  none: '#8c8c8c',
};

function formatDate(s: string) {
  if (!s) return '-';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export default function NetworkList({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
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

  const isDefault = (name: string) => ['bridge', 'host', 'none'].includes(name);

  const sectionLabel = (icon: React.ReactNode, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: p.text, margin: '16px 0 8px' }}>
      {icon} {label}
    </div>
  );

  const infoRow = (label: string, value: React.ReactNode, mono?: boolean) => (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: `1px solid ${p.cardBorder}30`, fontSize: 12 }}>
      <span style={{ width: 120, flexShrink: 0, color: p.textMuted, fontWeight: 500 }}>{label}</span>
      <span style={{ color: p.text, fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? 11 : 12, wordBreak: 'break-all' }}>{value || '-'}</span>
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Popconfirm title="Remove all unused networks?" onConfirm={handlePrune}>
            <button style={{
              padding: '6px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
              background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <ClearOutlined /> Prune
            </button>
          </Popconfirm>
          <span style={{ fontSize: 12, color: p.textMuted }}>
            {networks.length} network{networks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> Create Network
        </button>
      </div>

      {/* Network cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: p.textMuted }}>Loading...</div>
      ) : networks.length === 0 ? (
        <Empty description="No networks found" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {networks.map(net => {
            const dc = driverColors[net.driver] || p.accent;
            return (
              <div key={net.id} style={{
                padding: '12px 16px', borderRadius: 10,
                border: `1px solid ${p.cardBorder}`,
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? 10 : 0,
                transition: 'border-color 0.15s',
              }}>
                {/* Left: icon + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: `${dc}15`, color: dc,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                  }}>
                    <ApiOutlined />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: p.text, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {net.name}
                      {isDefault(net.name) && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${p.textMuted}20`, color: p.textMuted, marginLeft: 6, fontWeight: 400 }}>DEFAULT</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: p.textMuted, fontFamily: 'monospace' }}>{net.id}</div>
                  </div>
                </div>

                {/* Middle: info pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 2, alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center' }}>
                  <span style={{
                    fontSize: 10, padding: '3px 10px', borderRadius: 4, fontWeight: 600,
                    background: `${dc}15`, color: dc,
                  }}>{net.driver}</span>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 500,
                    background: `${p.purple}12`, color: p.purple,
                  }}>{net.scope}</span>
                  {net.subnet && (
                    <Tooltip title={`Gateway: ${net.gateway || 'auto'}`}>
                      <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 500, fontFamily: 'monospace',
                        background: `${p.cyan}12`, color: p.cyan,
                      }}>
                        <GlobalOutlined style={{ marginRight: 3 }} />{net.subnet}
                      </span>
                    </Tooltip>
                  )}
                  {net.container_count > 0 && (
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 600,
                      background: `${p.green}15`, color: p.green,
                    }}>
                      <ContainerOutlined style={{ marginRight: 3 }} />{net.container_count}
                    </span>
                  )}
                  {net.internal && (
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: `${p.orange}15`, color: p.orange, fontWeight: 500 }}>Internal</span>
                  )}
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => handleInspect(net.id)} style={{
                    padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                    background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <EyeOutlined /> Inspect
                  </button>
                  {!isDefault(net.name) && (
                    <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(net.id)}>
                      <button style={{
                        padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.red}40`,
                        background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
        width={isMobile ? '95%' : 700}
      >
        {!inspectData ? (
          <div style={{ textAlign: 'center', padding: 30, color: p.textMuted }}>Loading...</div>
        ) : (
          <div>
            {/* Basic info */}
            {sectionLabel(<ClusterOutlined />, 'General')}
            <div style={{ background: isDark ? '#ffffff06' : '#00000003', borderRadius: 8, padding: '4px 12px' }}>
              {infoRow('Name', <span style={{ fontWeight: 600 }}>{inspectData.name}</span>)}
              {infoRow('ID', inspectData.id, true)}
              {infoRow('Driver', <Tag color={driverColors[inspectData.driver] || undefined}>{inspectData.driver}</Tag>)}
              {infoRow('Scope', inspectData.scope)}
              {infoRow('Created', formatDate(inspectData.created))}
              {infoRow('Internal', inspectData.internal ? <Tag color="orange">Yes</Tag> : <Tag>No</Tag>)}
              {infoRow('IPv6', inspectData.enable_ipv6 ? <Tag color="blue">Enabled</Tag> : <Tag>Disabled</Tag>)}
            </div>

            {/* IPAM */}
            {sectionLabel(<GlobalOutlined />, 'IPAM Configuration')}
            <div style={{ background: isDark ? '#ffffff06' : '#00000003', borderRadius: 8, padding: '4px 12px' }}>
              {infoRow('IPAM Driver', inspectData.ipam_driver || 'default')}
              {(inspectData.ipam ?? []).length > 0 ? (
                (inspectData.ipam ?? []).map((cfg, i) => (
                  <div key={i}>
                    {infoRow(`Subnet${(inspectData.ipam ?? []).length > 1 ? ` #${i + 1}` : ''}`, cfg.subnet, true)}
                    {infoRow(`Gateway${(inspectData.ipam ?? []).length > 1 ? ` #${i + 1}` : ''}`, cfg.gateway, true)}
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px 0', fontSize: 12, color: p.textMuted }}>No IPAM config (host/none network)</div>
              )}
            </div>

            {/* Connected containers */}
            {sectionLabel(<ContainerOutlined />, `Connected Containers (${Object.keys(inspectData.containers ?? {}).length})`)}
            {Object.keys(inspectData.containers ?? {}).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(inspectData.containers).map(([cid, ep]) => (
                  <div key={cid} style={{
                    background: isDark ? '#ffffff06' : '#00000003', borderRadius: 8,
                    padding: '8px 12px', border: `1px solid ${p.cardBorder}40`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <ContainerOutlined style={{ color: p.accent }} />
                      <span style={{ fontWeight: 600, fontSize: 13, color: p.text }}>{ep.name || 'unnamed'}</span>
                      <span style={{ fontSize: 10, color: p.textMuted, fontFamily: 'monospace' }}>{cid}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 22 }}>
                      {ep.ipv4_address && (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, background: `${p.cyan}12`, color: p.cyan }}>
                          IPv4: {ep.ipv4_address}
                        </span>
                      )}
                      {ep.ipv6_address && (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, background: `${p.blue}12`, color: p.blue }}>
                          IPv6: {ep.ipv6_address}
                        </span>
                      )}
                      {ep.mac_address && (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, background: `${p.purple}12`, color: p.purple }}>
                          MAC: {ep.mac_address}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px 0', fontSize: 12, color: p.textMuted }}>No containers connected</div>
            )}

            {/* Options */}
            {Object.keys(inspectData.options ?? {}).length > 0 && (
              <>
                {sectionLabel(<ClockCircleOutlined />, 'Driver Options')}
                <div style={{ background: isDark ? '#ffffff06' : '#00000003', borderRadius: 8, padding: '4px 12px' }}>
                  {Object.entries(inspectData.options).map(([k, v]) => infoRow(k, v, true))}
                </div>
              </>
            )}

            {/* Labels */}
            {Object.keys(inspectData.labels ?? {}).length > 0 && (
              <>
                {sectionLabel(<Tag style={{ margin: 0 }} />, 'Labels')}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(inspectData.labels).map(([k, v]) => (
                    <Tooltip key={k} title={v}>
                      <Tag style={{ fontSize: 11 }}>{k}={v.length > 30 ? v.slice(0, 30) + '…' : v}</Tag>
                    </Tooltip>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
