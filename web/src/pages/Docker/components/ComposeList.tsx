import { useState, useEffect, useCallback } from 'react';
import { message, Modal, Form, Input, Empty, Popconfirm } from 'antd';
import {
  PlusOutlined, PlayCircleOutlined, StopOutlined,
  DeleteOutlined, FileTextOutlined, EditOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface ComposeProject {
  name: string;
  status: string;
  config_files: string;
  running: number;
  stopped: number;
  created: number;
}

export default function ComposeList() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [projects, setProjects] = useState<ComposeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logsTitle, setLogsTitle] = useState('');
  const [createForm] = Form.useForm();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<ComposeProject[]>>('/docker/compose');
      setProjects(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const composeAction = async (name: string, action: 'up' | 'down' | 'restart') => {
    try {
      await api.post(`/docker/compose/${encodeURIComponent(name)}/${action}`);
      message.success(`${name}: ${action} successful`);
      fetchProjects();
    } catch {
      message.error(t('common.error'));
    }
  };

  const handleCreate = async (values: { name: string; yaml: string }) => {
    setCreateLoading(true);
    try {
      await api.post('/docker/compose', values);
      message.success('Compose project created');
      setCreateOpen(false);
      createForm.resetFields();
      fetchProjects();
    } catch {
      message.error(t('common.error'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await api.delete(`/docker/compose/${encodeURIComponent(name)}`);
      message.success('Project removed');
      fetchProjects();
    } catch {
      message.error(t('common.error'));
    }
  };

  const viewLogs = async (name: string) => {
    setLogsTitle(name);
    setLogsOpen(true);
    try {
      const { data } = await api.get<ApiResponse<{ logs: string }>>(`/docker/compose/${encodeURIComponent(name)}/logs`);
      setLogsContent(data.data?.logs ?? 'No logs available');
    } catch {
      setLogsContent('Failed to load logs. Make sure Docker Compose is installed.');
    }
  };

  const statusColor = (status: string) => {
    if (status === 'running') return p.green;
    if (status === 'partial') return p.amber;
    return p.red;
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> New Project
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: p.textMuted }}>Loading...</div>
      ) : projects.length === 0 ? (
        <Empty description="No Compose projects found. Create one or run docker compose up in a directory." style={{ padding: 40 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(proj => (
            <div key={proj.name} style={{
              padding: '14px 18px', borderRadius: 10,
              border: `1px solid ${p.cardBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>{proj.name}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                    background: `${statusColor(proj.status)}15`, color: statusColor(proj.status),
                    lineHeight: 1,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(proj.status) }} />
                    {proj.status || 'unknown'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: p.textMuted }}>
                  {proj.running > 0 && `${proj.running} running`}
                  {proj.stopped > 0 && ` · ${proj.stopped} stopped`}
                  {proj.config_files && ` · ${proj.config_files}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => composeAction(proj.name, 'up')} style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: p.accent, color: '#fff', fontSize: 11, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <PlayCircleOutlined /> Up
                </button>
                <button onClick={() => composeAction(proj.name, 'down')} style={{
                  padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                  background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <StopOutlined /> Down
                </button>
                <button onClick={() => viewLogs(proj.name)} style={{
                  padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
                  background: 'transparent', color: p.textMuted, fontSize: 11, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <FileTextOutlined /> Logs
                </button>
                <Popconfirm title={`Remove project ${proj.name}?`} onConfirm={() => handleDelete(proj.name)}>
                  <button style={{
                    padding: '4px 10px', borderRadius: 6, border: `1px solid ${p.red}`,
                    background: 'transparent', color: p.red, fontSize: 11, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <DeleteOutlined />
                  </button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        title="New Compose Project"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        width={isMobile ? '95%' : 650}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Project Name" rules={[{ required: true }]}>
            <Input placeholder="my-project" />
          </Form.Item>
          <Form.Item name="yaml" label="docker-compose.yml" rules={[{ required: true }]}
            extra="Paste your Docker Compose YAML configuration">
            <Input.TextArea rows={14} style={{ fontFamily: 'inherit', fontSize: 12 }}
              placeholder={`version: '3.8'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"`} />
          </Form.Item>
        </Form>
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
          {logsContent}
        </pre>
      </Modal>
    </div>
  );
}
