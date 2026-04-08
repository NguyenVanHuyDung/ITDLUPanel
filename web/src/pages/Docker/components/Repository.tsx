import { useState } from 'react';
import { message, Table, Popconfirm, Modal, Form, Input, Alert } from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

interface DockerRegistry {
  id: number;
  name: string;
  url: string;
  username: string;
  is_default: boolean;
  status: string;
}

export default function Repository() {
  const { t } = useTranslation();
  const { p } = usePalette();
  const isMobile = useIsMobile();
  const [registries, setRegistries] = useState<DockerRegistry[]>([
    { id: 1, name: 'Docker Hub', url: 'https://index.docker.io/v1/', username: '', is_default: true, status: 'connected' },
  ]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (val: string, r: DockerRegistry) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: p.text }}>{val}</span>
          {r.is_default && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${p.accent}15`, color: p.accent, fontWeight: 500,
              lineHeight: 1,
            }}>DEFAULT</span>
          )}
        </div>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      render: (val: string) => <span style={{ fontSize: 12, fontFamily: "'SFMono-Regular', Consolas, monospace", color: p.textMuted }}>{val}</span>,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (val: string) => val || <span style={{ color: p.textMuted }}>-</span>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
          background: val === 'connected' ? `${p.green}15` : `${p.textMuted}15`,
          color: val === 'connected' ? p.green : p.textMuted,
          lineHeight: 1,
        }}>
          <CheckCircleOutlined /> {val}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, r: DockerRegistry) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {!r.is_default && (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => {
              setRegistries(prev => prev.filter(reg => reg.id !== r.id));
              message.success('Registry removed');
            }}>
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

  const handleAdd = (values: { name: string; url: string; username: string; password: string }) => {
    setRegistries(prev => [...prev, {
      id: Date.now(),
      name: values.name,
      url: values.url,
      username: values.username,
      is_default: false,
      status: 'connected',
    }]);
    message.success('Registry added');
    setAddOpen(false);
    addForm.resetFields();
  };

  return (
    <div>
      <Alert
        message="Registry bookmarks are stored locally in this session"
        description="Custom registries added here serve as bookmarks for reference. To authenticate with a private registry, use docker login via the terminal or configure credentials in Settings → Registry Mirrors."
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setAddOpen(true)} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusOutlined /> Add Registry
        </button>
      </div>

      <Table columns={columns} dataSource={registries} rowKey="id"
        pagination={false} />

      <Modal
        title="Add Registry"
        open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields(); }}
        onOk={() => addForm.submit()}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="My Registry" />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url', message: 'Please enter a valid URL' }]}>
            <Input placeholder="https://registry.example.com" />
          </Form.Item>
          <Form.Item name="username" label="Username">
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="password" label="Password">
            <Input.Password placeholder="password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
